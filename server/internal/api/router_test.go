package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/rmv0x11/ild/server/internal/domain"
)

// mockStore is an in-memory CardsStore used by router tests. It stores
// cards/reviews per-user in maps so a single test can exercise multiple
// scenarios without touching SQLite.
type mockStore struct {
	mu      sync.Mutex
	cards   map[string]map[string]domain.Card // userID -> cardID -> card
	reviews map[string][]domain.Review        // userID -> reviews
	upserts int                               // call counter for assertions
}

func newMockStore() *mockStore {
	return &mockStore{
		cards:   map[string]map[string]domain.Card{},
		reviews: map[string][]domain.Review{},
	}
}

func (m *mockStore) BulkUpsertCards(_ context.Context, userID string, cards []domain.Card) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.cards[userID]; !ok {
		m.cards[userID] = map[string]domain.Card{}
	}
	for _, c := range cards {
		c.UserID = userID
		m.cards[userID][c.ID] = c
	}
	m.upserts++
	return len(cards), nil
}

func (m *mockStore) ListCardsSince(_ context.Context, userID string, since int64, limit int) ([]domain.Card, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]domain.Card, 0)
	for _, c := range m.cards[userID] {
		if c.UpdatedAt >= since {
			out = append(out, c)
		}
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (m *mockStore) SoftDeleteCard(_ context.Context, userID, cardID string, now int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if user, ok := m.cards[userID]; ok {
		if c, ok := user[cardID]; ok {
			c.DeletedAt = &now
			c.UpdatedAt = now
			user[cardID] = c
		}
	}
	return nil
}

func (m *mockStore) BulkInsertReviews(_ context.Context, userID string, rs []domain.Review) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, r := range rs {
		r.UserID = userID
		m.reviews[userID] = append(m.reviews[userID], r)
	}
	return nil
}

func (m *mockStore) ListReviewsSince(_ context.Context, userID string, since int64, limit int) ([]domain.Review, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]domain.Review, 0)
	for _, r := range m.reviews[userID] {
		if r.ReviewedAt >= since {
			out = append(out, r)
		}
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

// mockAuth implements AuthHandlers. It looks at a synthetic header
// "X-Test-User" to decide who the caller is — tests set the header to
// simulate logged-in or anonymous requests without needing real cookies.
type mockAuth struct {
	users map[string]*domain.User // user ID -> user
}

func newMockAuth(users ...*domain.User) *mockAuth {
	m := &mockAuth{users: map[string]*domain.User{}}
	for _, u := range users {
		m.users[u.ID] = u
	}
	return m
}

func (m *mockAuth) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if id := r.Header.Get("X-Test-User"); id != "" {
			if u, ok := m.users[id]; ok {
				r = r.WithContext(WithUser(r.Context(), u))
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (m *mockAuth) RequireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if UserFromContext(r.Context()) == nil {
			writeError(w, http.StatusUnauthorized, "unauthorized", "login required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (m *mockAuth) HandleLogout(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (m *mockAuth) HandleMe(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"user": UserFromContext(r.Context())})
}

// mockEmail is a trivial stub of EmailHandlers — the router test does not
// drill into the magic-link flow (that has its own tests in auth/), it
// only verifies the routes are wired.
type mockEmail struct{}

func (mockEmail) HandleRequest(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"sent": true})
}

// emailVerifyOK is a stand-in for auth.Service.HandleEmailVerify, used to
// verify the route is mounted.
func emailVerifyOK(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"verified": true})
}

// fixedNow returns a Now function pinned to t so tombstone timestamps are
// predictable across the suite.
func fixedNow(t int64) func() int64 { return func() int64 { return t } }

// defaultDeps builds a Deps with sensible mock defaults. Tests override
// only the fields they care about.
func defaultDeps() Deps {
	return Deps{
		DB:          newMockStore(),
		Auth:        newMockAuth(),
		Email:       mockEmail{},
		EmailVerify: emailVerifyOK,
	}
}

// newTestServer builds an httptest.Server backed by a fresh router. The
// returned closer must be called to shut the server down.
func newTestServer(t *testing.T, deps Deps) (*httptest.Server, func()) {
	t.Helper()
	srv := httptest.NewServer(NewRouter(deps))
	return srv, srv.Close
}

func authedRequest(t *testing.T, method, url, userID string, body io.Reader) *http.Request {
	t.Helper()
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	if userID != "" {
		req.Header.Set("X-Test-User", userID)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return req
}

func do(t *testing.T, client *http.Client, req *http.Request) (int, []byte) {
	t.Helper()
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("client.Do: %v", err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, b
}

// --------------- tests ---------------

func TestHealthz(t *testing.T) {
	user := &domain.User{ID: "u1", Email: "a@b.c"}
	deps := defaultDeps()
	deps.Auth = newMockAuth(user)
	srv, closer := newTestServer(t, deps)
	defer closer()

	resp, err := http.Get(srv.URL + "/healthz")
	if err != nil {
		t.Fatalf("GET /healthz: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status=%d want 200", resp.StatusCode)
	}
}

func TestCardsRequireAuth(t *testing.T) {
	srv, closer := newTestServer(t, defaultDeps())
	defer closer()

	// No X-Test-User header => anonymous => 401.
	body := bytes.NewBufferString(`{"cards":[]}`)
	req := authedRequest(t, http.MethodPost, srv.URL+"/api/v1/sync/cards", "", body)
	status, _ := do(t, srv.Client(), req)
	if status != http.StatusUnauthorized {
		t.Fatalf("anonymous POST status=%d want 401", status)
	}
}

func TestCardsUpsertAndList(t *testing.T) {
	store := newMockStore()
	user := &domain.User{ID: "u1", Email: "a@b.c"}
	deps := defaultDeps()
	deps.DB = store
	deps.Auth = newMockAuth(user)
	deps.Now = fixedNow(1000)
	srv, closer := newTestServer(t, deps)
	defer closer()

	// POST a batch of 2 cards.
	payload := syncCardsRequest{
		Cards: []domain.Card{
			{ID: "c1", Word: "你好", Pinyin: "nǐ hǎo", Context: "hi",
				Stage: domain.StageNew, Ease: 2.5, DueAt: 100, CreatedAt: 100, UpdatedAt: 100},
			{ID: "c2", Word: "再见", Pinyin: "zài jiàn", Context: "bye",
				Stage: domain.StageNew, Ease: 2.5, DueAt: 200, CreatedAt: 200, UpdatedAt: 200},
		},
	}
	buf, _ := json.Marshal(payload)
	req := authedRequest(t, http.MethodPost, srv.URL+"/api/v1/sync/cards", user.ID, bytes.NewReader(buf))
	status, body := do(t, srv.Client(), req)
	if status != http.StatusOK {
		t.Fatalf("POST cards status=%d body=%s", status, body)
	}
	var postResp map[string]int
	if err := json.Unmarshal(body, &postResp); err != nil {
		t.Fatalf("decode post response: %v", err)
	}
	if postResp["applied"] != 2 {
		t.Fatalf("applied=%d want 2", postResp["applied"])
	}
	if store.upserts != 1 {
		t.Fatalf("upserts=%d want 1 store call", store.upserts)
	}

	// GET ?since=0 should return both.
	req = authedRequest(t, http.MethodGet, srv.URL+"/api/v1/sync/cards?since=0", user.ID, nil)
	status, body = do(t, srv.Client(), req)
	if status != http.StatusOK {
		t.Fatalf("GET cards status=%d body=%s", status, body)
	}
	var listResp syncCardsResponse
	if err := json.Unmarshal(body, &listResp); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(listResp.Cards) != 2 {
		t.Fatalf("got %d cards want 2", len(listResp.Cards))
	}
	if listResp.NextSince != 201 { // max updatedAt(200) + 1
		t.Fatalf("nextSince=%d want 201", listResp.NextSince)
	}
}

func TestCardDeleteTombstones(t *testing.T) {
	store := newMockStore()
	user := &domain.User{ID: "u1"}
	// Seed one card directly so we can delete it.
	_, _ = store.BulkUpsertCards(context.Background(), user.ID, []domain.Card{
		{ID: "c1", Word: "x", Pinyin: "x", Context: "x",
			Stage: domain.StageNew, Ease: 2.5, DueAt: 100, CreatedAt: 100, UpdatedAt: 100},
	})

	deps := defaultDeps()
	deps.DB = store
	deps.Auth = newMockAuth(user)
	deps.Now = fixedNow(9999)
	srv, closer := newTestServer(t, deps)
	defer closer()

	// DELETE → 204.
	req := authedRequest(t, http.MethodDelete, srv.URL+"/api/v1/sync/cards/c1", user.ID, nil)
	status, _ := do(t, srv.Client(), req)
	if status != http.StatusNoContent {
		t.Fatalf("DELETE status=%d want 204", status)
	}

	// GET shows tombstone with deletedAt set.
	req = authedRequest(t, http.MethodGet, srv.URL+"/api/v1/sync/cards?since=0", user.ID, nil)
	status, body := do(t, srv.Client(), req)
	if status != http.StatusOK {
		t.Fatalf("GET status=%d", status)
	}
	var resp syncCardsResponse
	_ = json.Unmarshal(body, &resp)
	if len(resp.Cards) != 1 {
		t.Fatalf("expected 1 (tombstone) card, got %d", len(resp.Cards))
	}
	if resp.Cards[0].DeletedAt == nil || *resp.Cards[0].DeletedAt != 9999 {
		t.Fatalf("deletedAt=%v want 9999", resp.Cards[0].DeletedAt)
	}
}

func TestCorsPreflight(t *testing.T) {
	deps := defaultDeps()
	deps.AllowedOrigins = []string{"https://app.example.com"}
	srv, closer := newTestServer(t, deps)
	defer closer()

	req, _ := http.NewRequest(http.MethodOptions, srv.URL+"/api/v1/sync/cards", nil)
	req.Header.Set("Origin", "https://app.example.com")
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "content-type")
	resp, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("preflight: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("preflight status=%d want 204", resp.StatusCode)
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "https://app.example.com" {
		t.Fatalf("Allow-Origin=%q want https://app.example.com", got)
	}
	if got := resp.Header.Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Fatalf("Allow-Credentials=%q want true", got)
	}
	if got := resp.Header.Get("Access-Control-Allow-Methods"); !strings.Contains(got, "POST") {
		t.Fatalf("Allow-Methods=%q does not include POST", got)
	}
}

func TestCorsDisallowedOrigin(t *testing.T) {
	deps := defaultDeps()
	deps.AllowedOrigins = []string{"https://app.example.com"}
	srv, closer := newTestServer(t, deps)
	defer closer()

	// Preflight from a *different* origin: server replies 204 but without
	// CORS allow headers — that's how the browser learns to block.
	req, _ := http.NewRequest(http.MethodOptions, srv.URL+"/api/v1/sync/cards", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	resp, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("preflight: %v", err)
	}
	defer resp.Body.Close()
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("evil origin received Allow-Origin=%q", got)
	}
}

func TestReviewsUpsertAndList(t *testing.T) {
	store := newMockStore()
	user := &domain.User{ID: "u1"}
	deps := defaultDeps()
	deps.DB = store
	deps.Auth = newMockAuth(user)
	srv, closer := newTestServer(t, deps)
	defer closer()

	payload := syncReviewsRequest{
		Reviews: []domain.Review{
			{CardID: "c1", Rating: domain.RatingGood, ReviewedAt: 500,
				StageBefore: domain.StageNew, StageAfter: domain.StageLearning,
				IntervalDaysBefore: 0, IntervalDaysAfter: 0,
				EaseBefore: 2.5, EaseAfter: 2.5},
		},
	}
	buf, _ := json.Marshal(payload)
	req := authedRequest(t, http.MethodPost, srv.URL+"/api/v1/sync/reviews", user.ID, bytes.NewReader(buf))
	status, body := do(t, srv.Client(), req)
	if status != http.StatusOK {
		t.Fatalf("POST reviews status=%d body=%s", status, body)
	}

	req = authedRequest(t, http.MethodGet, srv.URL+"/api/v1/sync/reviews?since=0", user.ID, nil)
	status, body = do(t, srv.Client(), req)
	if status != http.StatusOK {
		t.Fatalf("GET reviews status=%d", status)
	}
	var resp syncReviewsResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Reviews) != 1 || resp.Reviews[0].CardID != "c1" {
		t.Fatalf("got %+v", resp.Reviews)
	}
	if resp.NextSince != 501 {
		t.Fatalf("nextSince=%d want 501", resp.NextSince)
	}
}

func TestPostBatchTooLarge(t *testing.T) {
	user := &domain.User{ID: "u1"}
	deps := defaultDeps()
	deps.Auth = newMockAuth(user)
	srv, closer := newTestServer(t, deps)
	defer closer()

	cards := make([]domain.Card, maxBatchUpsert+1)
	for i := range cards {
		cards[i] = domain.Card{ID: "c", Stage: domain.StageNew, Ease: 2.5}
	}
	buf, _ := json.Marshal(syncCardsRequest{Cards: cards})
	req := authedRequest(t, http.MethodPost, srv.URL+"/api/v1/sync/cards", user.ID, bytes.NewReader(buf))
	status, _ := do(t, srv.Client(), req)
	if status != http.StatusBadRequest {
		t.Fatalf("oversize batch status=%d want 400", status)
	}
}

func TestPostBodyTooLarge(t *testing.T) {
	user := &domain.User{ID: "u1"}
	deps := defaultDeps()
	deps.Auth = newMockAuth(user)
	srv, closer := newTestServer(t, deps)
	defer closer()

	// Build a body slightly bigger than the 1 MiB cap. We send a JSON-ish
	// blob — decode will fail with errBodyTooLarge before parsing.
	big := bytes.Repeat([]byte("a"), MaxBodyBytes+10)
	req := authedRequest(t, http.MethodPost, srv.URL+"/api/v1/sync/cards", user.ID, bytes.NewReader(big))
	status, _ := do(t, srv.Client(), req)
	if status != http.StatusRequestEntityTooLarge && status != http.StatusBadRequest {
		t.Fatalf("oversize body status=%d want 413 or 400", status)
	}
}

func TestGoogleRoutesDisabledWhenNil(t *testing.T) {
	srv, closer := newTestServer(t, defaultDeps())
	defer closer()

	// GoogleStart/GoogleCallback nil — routes should not be registered.
	resp, err := http.Get(srv.URL + "/api/v1/auth/google/start")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status=%d want 404", resp.StatusCode)
	}
}

func TestGoogleRoutesEnabled(t *testing.T) {
	var started, callbacked bool
	deps := defaultDeps()
	deps.GoogleStart = func(w http.ResponseWriter, _ *http.Request) {
		started = true
		w.WriteHeader(http.StatusFound)
	}
	deps.GoogleCallback = func(w http.ResponseWriter, _ *http.Request) {
		callbacked = true
		w.WriteHeader(http.StatusFound)
	}
	srv, closer := newTestServer(t, deps)
	defer closer()

	resp, err := http.Get(srv.URL + "/api/v1/auth/google/start")
	if err != nil {
		t.Fatalf("GET start: %v", err)
	}
	resp.Body.Close()
	if !started {
		t.Fatal("GoogleStart was not invoked")
	}

	resp, err = http.Get(srv.URL + "/api/v1/auth/google/callback")
	if err != nil {
		t.Fatalf("GET callback: %v", err)
	}
	resp.Body.Close()
	if !callbacked {
		t.Fatal("GoogleCallback was not invoked")
	}
}

func TestMeReturnsUserOrNull(t *testing.T) {
	user := &domain.User{ID: "u1", Email: "a@b.c", Name: "Alice"}
	deps := defaultDeps()
	deps.Auth = newMockAuth(user)
	srv, closer := newTestServer(t, deps)
	defer closer()

	// Anonymous → 200 + {"user":null} (frontend treats this as guest without
	// generating a noisy 401 in the browser console).
	req := authedRequest(t, http.MethodGet, srv.URL+"/api/v1/me", "", nil)
	status, body := do(t, srv.Client(), req)
	if status != http.StatusOK {
		t.Fatalf("anonymous /me status=%d want 200", status)
	}
	var anon struct {
		User *domain.User `json:"user"`
	}
	if err := json.Unmarshal(body, &anon); err != nil {
		t.Fatalf("decode anonymous: %v", err)
	}
	if anon.User != nil {
		t.Fatalf("anonymous user=%+v want nil", anon.User)
	}

	// With session header → 200 + {"user":{...}}.
	req = authedRequest(t, http.MethodGet, srv.URL+"/api/v1/me", user.ID, nil)
	status, body = do(t, srv.Client(), req)
	if status != http.StatusOK {
		t.Fatalf("status=%d", status)
	}
	var ok struct {
		User *domain.User `json:"user"`
	}
	if err := json.Unmarshal(body, &ok); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if ok.User == nil || ok.User.ID != user.ID || ok.User.Email != user.Email {
		t.Fatalf("got %+v want %+v", ok.User, user)
	}
}

func TestRequestIDHeader(t *testing.T) {
	srv, closer := newTestServer(t, defaultDeps())
	defer closer()

	resp, err := http.Get(srv.URL + "/healthz")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	if id := resp.Header.Get("X-Request-Id"); len(id) != 32 {
		t.Fatalf("X-Request-Id=%q want 32 hex chars", id)
	}
}

func TestEmailEndpoints(t *testing.T) {
	srv, closer := newTestServer(t, defaultDeps())
	defer closer()

	// POST /api/v1/auth/email/request — public, no auth needed.
	req := authedRequest(t, http.MethodPost, srv.URL+"/api/v1/auth/email/request", "",
		bytes.NewBufferString(`{"email":"a@b.c"}`))
	status, _ := do(t, srv.Client(), req)
	if status != http.StatusOK {
		t.Fatalf("email request status=%d want 200", status)
	}

	// GET /api/v1/auth/email/verify?token=… — public, also no auth.
	resp, err := http.Get(srv.URL + "/api/v1/auth/email/verify?token=abc")
	if err != nil {
		t.Fatalf("GET verify: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("verify status=%d want 200", resp.StatusCode)
	}
}
