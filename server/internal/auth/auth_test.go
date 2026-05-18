package auth

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/rmv0x11/ild/server/internal/domain"
)

// ---------------------------------------------------------------------------
// In-memory mock Store.
// ---------------------------------------------------------------------------

type mockStore struct {
	mu         sync.Mutex
	users      map[string]*domain.User      // by id
	usersEmail map[string]*domain.User      // by email
	oauth      map[string]*domain.OAuthLink // provider+"|"+providerID -> link
	sessions   map[string]*domain.Session
	magic      map[string]*domain.MagicLink // by tokenHash
}

func newMockStore() *mockStore {
	return &mockStore{
		users:      map[string]*domain.User{},
		usersEmail: map[string]*domain.User{},
		oauth:      map[string]*domain.OAuthLink{},
		sessions:   map[string]*domain.Session{},
		magic:      map[string]*domain.MagicLink{},
	}
}

func (m *mockStore) CreateUser(_ context.Context, u *domain.User) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, exists := m.usersEmail[u.Email]; exists {
		return errors.New("dup email")
	}
	cp := *u
	m.users[u.ID] = &cp
	m.usersEmail[u.Email] = &cp
	return nil
}
func (m *mockStore) FindUserByID(_ context.Context, id string) (*domain.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if u, ok := m.users[id]; ok {
		cp := *u
		return &cp, nil
	}
	return nil, nil
}
func (m *mockStore) FindUserByEmail(_ context.Context, email string) (*domain.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if u, ok := m.usersEmail[strings.ToLower(email)]; ok {
		cp := *u
		return &cp, nil
	}
	return nil, nil
}
func (m *mockStore) LinkOAuth(_ context.Context, link *domain.OAuthLink) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	k := link.Provider + "|" + link.ProviderID
	cp := *link
	m.oauth[k] = &cp
	return nil
}
func (m *mockStore) FindUserByOAuth(_ context.Context, provider, providerID string) (*domain.User, error) {
	m.mu.Lock()
	link, ok := m.oauth[provider+"|"+providerID]
	m.mu.Unlock()
	if !ok {
		return nil, nil
	}
	return m.FindUserByID(context.Background(), link.UserID)
}
func (m *mockStore) CreateSession(_ context.Context, userID string, ttl time.Duration) (*domain.Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	sess := &domain.Session{
		ID:        uuid.NewString(),
		UserID:    userID,
		CreatedAt: now,
		ExpiresAt: now.Add(ttl),
	}
	m.sessions[sess.ID] = sess
	cp := *sess
	return &cp, nil
}
func (m *mockStore) FindSession(_ context.Context, id string) (*domain.Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sess, ok := m.sessions[id]
	if !ok {
		return nil, nil
	}
	if time.Now().After(sess.ExpiresAt) {
		// Behave like the real DB: expired -> nil,nil.
		return nil, nil
	}
	cp := *sess
	return &cp, nil
}
func (m *mockStore) DeleteSession(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, id)
	return nil
}
func (m *mockStore) CreateMagicLink(_ context.Context, link *domain.MagicLink) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := *link
	m.magic[link.TokenHash] = &cp
	return nil
}
func (m *mockStore) ConsumeMagicLink(_ context.Context, tokenHash string, now time.Time) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	link, ok := m.magic[tokenHash]
	if !ok {
		return "", errors.New("magic link not found")
	}
	if link.UsedAt != nil {
		return "", errors.New("magic link already used")
	}
	if now.Unix() > link.ExpiresAt {
		return "", errors.New("magic link expired")
	}
	used := now.Unix()
	link.UsedAt = &used
	return link.Email, nil
}

// recordingMailer captures Send calls.
type recordingMailer struct {
	mu    sync.Mutex
	calls []struct{ To, Subject, Body string }
}

func (r *recordingMailer) Send(_ context.Context, to, subject, body string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls = append(r.calls, struct{ To, Subject, Body string }{to, subject, body})
	return nil
}
func (r *recordingMailer) last() (string, string, string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.calls) == 0 {
		return "", "", ""
	}
	c := r.calls[len(r.calls)-1]
	return c.To, c.Subject, c.Body
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

func testSecret() []byte {
	// 32-byte all-purpose secret for tests.
	return []byte("01234567890123456789012345678901")
}

func newTestService(t *testing.T, st Store) *Service {
	t.Helper()
	return NewService(Options{
		Store:        st,
		CookieSecret: testSecret(),
		SessionTTL:   1 * time.Hour,
	})
}

func mustCreateUser(t *testing.T, st *mockStore, email string) *domain.User {
	t.Helper()
	u := &domain.User{ID: uuid.NewString(), Email: email, CreatedAt: time.Now().Unix()}
	if err := st.CreateUser(context.Background(), u); err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	return u
}

// ---------------------------------------------------------------------------
// 1. Short cookie secret panics.
// ---------------------------------------------------------------------------

func TestNewService_ShortSecretPanics(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected panic on short cookie secret")
		}
	}()
	NewService(Options{Store: newMockStore(), CookieSecret: []byte("too-short")})
}

// ---------------------------------------------------------------------------
// 2. HMAC cookie round-trip.
// ---------------------------------------------------------------------------

func TestIssueCookie_RoundTrip(t *testing.T) {
	st := newMockStore()
	user := mustCreateUser(t, st, "alice@example.com")
	svc := newTestService(t, st)

	rec := httptest.NewRecorder()
	if err := svc.IssueCookie(rec, user.ID); err != nil {
		t.Fatalf("IssueCookie: %v", err)
	}
	resp := rec.Result()
	cookies := resp.Cookies()
	if len(cookies) != 1 || cookies[0].Name != DefaultCookieName {
		t.Fatalf("expected one session cookie, got %#v", cookies)
	}
	c := cookies[0]
	if !c.HttpOnly || c.SameSite != http.SameSiteLaxMode || c.Path != "/" {
		t.Fatalf("cookie attrs unexpected: %#v", c)
	}
	if !strings.Contains(c.Value, ".") {
		t.Fatalf("cookie value missing signature separator: %q", c.Value)
	}

	// Now read it back.
	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	req.AddCookie(c)
	sess, u, err := svc.ReadSession(req)
	if err != nil {
		t.Fatalf("ReadSession: %v", err)
	}
	if sess == nil || u == nil {
		t.Fatalf("expected logged-in, got sess=%v user=%v", sess, u)
	}
	if u.ID != user.ID {
		t.Fatalf("user mismatch: got %s want %s", u.ID, user.ID)
	}
}

// ---------------------------------------------------------------------------
// 3. Tampered HMAC -> nil,nil,nil.
// ---------------------------------------------------------------------------

func TestReadSession_TamperedHMACReturnsNil(t *testing.T) {
	st := newMockStore()
	user := mustCreateUser(t, st, "bob@example.com")
	svc := newTestService(t, st)

	rec := httptest.NewRecorder()
	if err := svc.IssueCookie(rec, user.ID); err != nil {
		t.Fatalf("IssueCookie: %v", err)
	}
	c := rec.Result().Cookies()[0]
	// Flip one byte in the signature portion.
	idx := strings.LastIndexByte(c.Value, '.')
	if idx == -1 {
		t.Fatalf("no separator in %q", c.Value)
	}
	tampered := c.Value[:idx+1]
	if c.Value[idx+1] == 'A' {
		tampered += "B" + c.Value[idx+2:]
	} else {
		tampered += "A" + c.Value[idx+2:]
	}
	c.Value = tampered

	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	req.AddCookie(c)
	sess, u, err := svc.ReadSession(req)
	if err != nil || sess != nil || u != nil {
		t.Fatalf("expected (nil,nil,nil), got sess=%v user=%v err=%v", sess, u, err)
	}
}

// ---------------------------------------------------------------------------
// 4. Expired session -> nil,nil,nil.
// ---------------------------------------------------------------------------

func TestReadSession_ExpiredSession(t *testing.T) {
	st := newMockStore()
	user := mustCreateUser(t, st, "carol@example.com")
	// TTL = 1ms so session is already expired by the time we read it.
	svc := NewService(Options{Store: st, CookieSecret: testSecret(), SessionTTL: time.Millisecond})

	rec := httptest.NewRecorder()
	if err := svc.IssueCookie(rec, user.ID); err != nil {
		t.Fatalf("IssueCookie: %v", err)
	}
	c := rec.Result().Cookies()[0]
	time.Sleep(5 * time.Millisecond)

	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	req.AddCookie(c)
	sess, u, err := svc.ReadSession(req)
	if err != nil || sess != nil || u != nil {
		t.Fatalf("expected (nil,nil,nil), got sess=%v user=%v err=%v", sess, u, err)
	}
}

// ---------------------------------------------------------------------------
// 5. Logout clears server session + cookie.
// ---------------------------------------------------------------------------

func TestLogout(t *testing.T) {
	st := newMockStore()
	user := mustCreateUser(t, st, "dan@example.com")
	svc := newTestService(t, st)

	rec := httptest.NewRecorder()
	if err := svc.IssueCookie(rec, user.ID); err != nil {
		t.Fatalf("IssueCookie: %v", err)
	}
	c := rec.Result().Cookies()[0]

	// Confirm session exists in store.
	if len(st.sessions) != 1 {
		t.Fatalf("want 1 session in store, got %d", len(st.sessions))
	}

	rec2 := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/logout", nil)
	req.AddCookie(c)
	if err := svc.Logout(rec2, req); err != nil {
		t.Fatalf("Logout: %v", err)
	}
	if len(st.sessions) != 0 {
		t.Fatalf("want 0 sessions after logout, got %d", len(st.sessions))
	}
	// Cookie should be cleared.
	cleared := rec2.Result().Cookies()
	if len(cleared) != 1 || cleared[0].MaxAge >= 0 || cleared[0].Value != "" {
		t.Fatalf("expected cleared cookie, got %#v", cleared)
	}
}

// ---------------------------------------------------------------------------
// 6. Middleware + RequireUser.
// ---------------------------------------------------------------------------

func TestMiddleware_AttachesUser(t *testing.T) {
	st := newMockStore()
	user := mustCreateUser(t, st, "ed@example.com")
	svc := newTestService(t, st)

	rec := httptest.NewRecorder()
	if err := svc.IssueCookie(rec, user.ID); err != nil {
		t.Fatalf("IssueCookie: %v", err)
	}
	c := rec.Result().Cookies()[0]

	var seenID string
	h := svc.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if u := UserFrom(r.Context()); u != nil {
			seenID = u.ID
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	req.AddCookie(c)
	h.ServeHTTP(httptest.NewRecorder(), req)
	if seenID != user.ID {
		t.Fatalf("Middleware did not attach user; got id=%q", seenID)
	}
}

func TestRequireUser_RejectsAnonymous(t *testing.T) {
	st := newMockStore()
	svc := newTestService(t, st)

	called := false
	h := svc.Middleware(svc.RequireUser(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})))
	req := httptest.NewRequest(http.MethodGet, "/private", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if called {
		t.Fatal("expected RequireUser to reject anonymous request")
	}
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rec.Code)
	}
}

// ---------------------------------------------------------------------------
// 7. Google AuthURL has all expected params.
// ---------------------------------------------------------------------------

func TestGoogleProvider_AuthURL(t *testing.T) {
	g := NewGoogleProvider("client-id-123", "secret-xyz", "http://localhost/cb")
	if !g.Enabled() {
		t.Fatal("provider should be enabled")
	}
	got := g.AuthURL("state-abc")
	u, err := url.Parse(got)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if u.Scheme+"://"+u.Host+u.Path != googleAuthURL {
		t.Fatalf("wrong base URL: %s", got)
	}
	q := u.Query()
	for k, want := range map[string]string{
		"client_id":     "client-id-123",
		"redirect_uri":  "http://localhost/cb",
		"response_type": "code",
		"scope":         googleScope,
		"state":         "state-abc",
		"prompt":        "consent",
	} {
		if got := q.Get(k); got != want {
			t.Fatalf("AuthURL %s=%q, want %q", k, got, want)
		}
	}
}

// ---------------------------------------------------------------------------
// 8. State cookie round-trip + tamper detection.
// ---------------------------------------------------------------------------

func TestState_RoundTripAndTamper(t *testing.T) {
	st := newMockStore()
	svc := newTestService(t, st)

	rec := httptest.NewRecorder()
	state, err := svc.GenerateState(rec)
	if err != nil {
		t.Fatalf("GenerateState: %v", err)
	}
	cookies := rec.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != OAuthStateCookieName {
		t.Fatalf("want state cookie, got %#v", cookies)
	}

	// Valid state.
	good := httptest.NewRequest(http.MethodGet, "/cb", nil)
	good.AddCookie(cookies[0])
	if !svc.VerifyState(good, state) {
		t.Fatal("expected VerifyState true")
	}

	// Wrong state parameter.
	if svc.VerifyState(good, state+"x") {
		t.Fatal("expected VerifyState false for wrong state")
	}

	// Tampered cookie.
	bad := httptest.NewRequest(http.MethodGet, "/cb", nil)
	tampered := *cookies[0]
	tampered.Value = "garbage.value"
	bad.AddCookie(&tampered)
	if svc.VerifyState(bad, state) {
		t.Fatal("expected VerifyState false for tampered cookie")
	}
}

// ---------------------------------------------------------------------------
// 9. Magic-link request stores hashed token and mails the link.
// ---------------------------------------------------------------------------

func TestEmailAuth_RequestStoresHashAndMails(t *testing.T) {
	st := newMockStore()
	mail := &recordingMailer{}
	ea := NewEmailAuth(st, mail, "https://ild.test", 10*time.Minute)

	if err := ea.Request(context.Background(), "Frank@Example.com"); err != nil {
		t.Fatalf("Request: %v", err)
	}
	if len(mail.calls) != 1 {
		t.Fatalf("want 1 mail call, got %d", len(mail.calls))
	}
	to, _, body := mail.last()
	if to != "frank@example.com" {
		t.Fatalf("to not lowercased: %q", to)
	}
	// Pull token out of the body.
	idx := strings.Index(body, "token=")
	if idx == -1 {
		t.Fatalf("body has no token=: %s", body)
	}
	tokenRaw := body[idx+len("token="):]
	// Trim newline / trailing words.
	if nl := strings.IndexAny(tokenRaw, " \n\r\t"); nl >= 0 {
		tokenRaw = tokenRaw[:nl]
	}
	if _, err := base64.RawURLEncoding.DecodeString(tokenRaw); err != nil {
		t.Fatalf("token not base64url: %v (%q)", err, tokenRaw)
	}
	// The DB row must have the sha256 hash of the token, NOT the raw token.
	if _, ok := st.magic[hashToken(tokenRaw)]; !ok {
		t.Fatal("magic link not stored under sha256 hash of token")
	}
	for tokenHashKey := range st.magic {
		if tokenHashKey == tokenRaw {
			t.Fatal("raw token must not be stored in DB")
		}
	}
}

// ---------------------------------------------------------------------------
// 10. Magic-link verify happy path + reuse rejected.
// ---------------------------------------------------------------------------

func TestEmailAuth_VerifyAndSingleUse(t *testing.T) {
	st := newMockStore()
	mail := &recordingMailer{}
	ea := NewEmailAuth(st, mail, "https://ild.test", 10*time.Minute)

	if err := ea.Request(context.Background(), "gina@example.com"); err != nil {
		t.Fatalf("Request: %v", err)
	}
	_, _, body := mail.last()
	idx := strings.Index(body, "token=")
	tokenRaw := body[idx+len("token="):]
	if nl := strings.IndexAny(tokenRaw, " \n\r\t"); nl >= 0 {
		tokenRaw = tokenRaw[:nl]
	}

	email, err := ea.Verify(context.Background(), tokenRaw)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if email != "gina@example.com" {
		t.Fatalf("email mismatch: %q", email)
	}
	// Re-use must fail.
	if _, err := ea.Verify(context.Background(), tokenRaw); err == nil {
		t.Fatal("expected second Verify to fail (single-use)")
	}
}

// ---------------------------------------------------------------------------
// 11. HandleRequest anti-enumeration: same 200 for unknown email.
// ---------------------------------------------------------------------------

func TestHandleRequest_AntiEnumeration(t *testing.T) {
	st := newMockStore()
	mail := &recordingMailer{}
	ea := NewEmailAuth(st, mail, "https://ild.test", 5*time.Minute)

	rec := httptest.NewRecorder()
	body := strings.NewReader(`{"email":"unknown@example.com"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/email/request", body)
	req.Header.Set("Content-Type", "application/json")
	ea.HandleRequest(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got["ok"] != true {
		t.Fatalf("body should be {ok:true}: %v", got)
	}
	// Mailer should still have been called once with the supplied email
	// (we do not look up users — we always pretend to issue).
	if len(mail.calls) != 1 {
		t.Fatalf("want 1 mail call, got %d", len(mail.calls))
	}

	// Garbage email -> 200 but no extra mail.
	rec2 := httptest.NewRecorder()
	bad := strings.NewReader(`{"email":"not-an-email"}`)
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/auth/email/request", bad)
	ea.HandleRequest(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec2.Code)
	}
	if len(mail.calls) != 1 {
		t.Fatalf("malformed email should not produce mail; got %d total calls", len(mail.calls))
	}
}

// ---------------------------------------------------------------------------
// 12. HandleMe returns null/object depending on session.
// ---------------------------------------------------------------------------

func TestHandleMe(t *testing.T) {
	st := newMockStore()
	user := mustCreateUser(t, st, "henry@example.com")
	svc := newTestService(t, st)

	// Anonymous -> {user:null}.
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	svc.HandleMe(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["user"] != nil {
		t.Fatalf("anonymous /me expected null user, got %v", body["user"])
	}

	// Logged-in -> {user:{id,email,...}}.
	issue := httptest.NewRecorder()
	if err := svc.IssueCookie(issue, user.ID); err != nil {
		t.Fatalf("IssueCookie: %v", err)
	}
	rec2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodGet, "/me", nil)
	req2.AddCookie(issue.Result().Cookies()[0])
	svc.HandleMe(rec2, req2)
	var body2 map[string]any
	if err := json.Unmarshal(rec2.Body.Bytes(), &body2); err != nil {
		t.Fatalf("decode: %v", err)
	}
	u, ok := body2["user"].(map[string]any)
	if !ok || u["email"] != "henry@example.com" {
		t.Fatalf("logged-in /me wrong payload: %v", body2)
	}
}

// ---------------------------------------------------------------------------
// 13. safeNextPath denies open-redirects.
// ---------------------------------------------------------------------------

func TestSafeNextPath(t *testing.T) {
	cases := map[string]string{
		"":               "/",
		"/":              "/",
		"/decks":         "/decks",
		"//evil.example": "/",
		"http://x":       "/",
		"javascript:":    "/",
	}
	for in, want := range cases {
		if got := safeNextPath(in); got != want {
			t.Fatalf("safeNextPath(%q) = %q, want %q", in, got, want)
		}
	}
}
