package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// post is a tiny helper that builds an authed-or-anon request, dispatches
// it through h, and returns the recorded response. Body is sent verbatim
// as application/json.
func post(h http.HandlerFunc, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	h(rec, req)
	return rec
}

// decodeBody pulls the JSON body of a recorder into a map[string]any so
// each test can assert just the fields it cares about.
func decodeBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v (body=%s)", err, rec.Body.String())
	}
	return got
}

// ---------------------------------------------------------------------------
// Register.
// ---------------------------------------------------------------------------

func TestHandleRegister_CreatesUserWithFields(t *testing.T) {
	st := newMockStore()
	svc := newTestService(t, st)

	rec := post(svc.HandleRegister, `{"username":"alice","email":"a@b.c","password":"secret-pass-123"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}

	// Response must carry the freshly-created user — without password_hash
	// (json:"-" tag on domain.User).
	body := decodeBody(t, rec)
	user, _ := body["user"].(map[string]any)
	if user == nil {
		t.Fatalf("no user in response: %v", body)
	}
	if user["email"] != "a@b.c" || user["username"] != "alice" {
		t.Fatalf("user payload wrong: %v", user)
	}
	if _, leaked := user["password_hash"]; leaked {
		t.Fatal("password_hash leaked into JSON response")
	}
	if _, leaked := user["PasswordHash"]; leaked {
		t.Fatal("PasswordHash leaked into JSON response")
	}

	// Session cookie must be set on the response so the client is
	// immediately logged in.
	cookies := rec.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != DefaultCookieName {
		t.Fatalf("expected one session cookie, got %#v", cookies)
	}

	// Store should now contain a user with the bcrypt-hashed password.
	stored := st.usersEmail["a@b.c"]
	if stored == nil {
		t.Fatal("user not stored")
	}
	if stored.Username != "alice" {
		t.Fatalf("stored username=%q", stored.Username)
	}
	if stored.PasswordHash == "" {
		t.Fatal("password hash not stored")
	}
	if stored.PasswordHash == "secret-pass-123" {
		t.Fatal("password stored in plaintext")
	}
	if err := CheckPassword(stored.PasswordHash, "secret-pass-123"); err != nil {
		t.Fatalf("stored hash does not match plaintext: %v", err)
	}
}

func TestHandleRegister_EmailTaken(t *testing.T) {
	st := newMockStore()
	svc := newTestService(t, st)

	// Seed an existing user (no username — purely an email user).
	mustCreateUser(t, st, "taken@x.y")

	rec := post(svc.HandleRegister, `{"username":"newname","email":"taken@x.y","password":"another-pwd"}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status=%d want 409", rec.Code)
	}
	if got := decodeBody(t, rec)["error"]; got != "email_taken" {
		t.Fatalf("error=%v want email_taken", got)
	}
}

func TestHandleRegister_UsernameTaken(t *testing.T) {
	st := newMockStore()
	svc := newTestService(t, st)

	// First registration with username "bob" must succeed.
	if rec := post(svc.HandleRegister, `{"username":"bob","email":"bob1@x.y","password":"pwd-12345"}`); rec.Code != http.StatusCreated {
		t.Fatalf("seed status=%d body=%s", rec.Code, rec.Body.String())
	}

	// Second registration reusing "bob" must hit the 409 username_taken
	// branch even with a different email.
	rec := post(svc.HandleRegister, `{"username":"bob","email":"bob2@x.y","password":"pwd-12345"}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status=%d want 409", rec.Code)
	}
	if got := decodeBody(t, rec)["error"]; got != "username_taken" {
		t.Fatalf("error=%v want username_taken", got)
	}
}

func TestHandleRegister_ShortPassword(t *testing.T) {
	st := newMockStore()
	svc := newTestService(t, st)

	rec := post(svc.HandleRegister, `{"username":"shortp","email":"sp@x.y","password":"short"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status=%d want 400", rec.Code)
	}
	if got := decodeBody(t, rec)["error"]; got != "invalid_password" {
		t.Fatalf("error=%v want invalid_password", got)
	}
}

func TestHandleRegister_InvalidUsername(t *testing.T) {
	st := newMockStore()
	svc := newTestService(t, st)

	cases := []struct {
		name, body string
	}{
		{"contains dot", `{"username":"a.b","email":"u1@x.y","password":"pwd-12345"}`},
		{"too short", `{"username":"ab","email":"u2@x.y","password":"pwd-12345"}`},
		{"too long",
			`{"username":"` + strings.Repeat("a", 33) + `","email":"u3@x.y","password":"pwd-12345"}`},
		{"empty", `{"username":"","email":"u4@x.y","password":"pwd-12345"}`},
		{"spaces", `{"username":"a b","email":"u5@x.y","password":"pwd-12345"}`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := post(svc.HandleRegister, c.body)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status=%d want 400", rec.Code)
			}
			if got := decodeBody(t, rec)["error"]; got != "invalid_username" {
				t.Fatalf("error=%v want invalid_username", got)
			}
		})
	}
}

func TestHandleRegister_InvalidEmail(t *testing.T) {
	st := newMockStore()
	svc := newTestService(t, st)

	rec := post(svc.HandleRegister, `{"username":"validuser","email":"not-an-email","password":"pwd-12345"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status=%d want 400", rec.Code)
	}
	if got := decodeBody(t, rec)["error"]; got != "invalid_email" {
		t.Fatalf("error=%v want invalid_email", got)
	}
}

// ---------------------------------------------------------------------------
// Login.
// ---------------------------------------------------------------------------

// seedPasswordUser walks through the public register handler so the test
// exercises end-to-end persistence (bcrypt hashing, store insertion). This
// keeps login tests honest: a regression in HashPassword still produces
// the right hashes here.
func seedPasswordUser(t *testing.T, svc *Service, username, email, password string) {
	t.Helper()
	body := `{"username":"` + username + `","email":"` + email + `","password":"` + password + `"}`
	rec := post(svc.HandleRegister, body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("seed register status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestHandleLogin_WithEmailIdentifier(t *testing.T) {
	st := newMockStore()
	svc := newTestService(t, st)
	seedPasswordUser(t, svc, "carol", "carol@x.y", "carol-pwd-1")

	rec := post(svc.HandleLogin, `{"identifier":"carol@x.y","password":"carol-pwd-1"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if cookies := rec.Result().Cookies(); len(cookies) != 1 || cookies[0].Name != DefaultCookieName {
		t.Fatalf("expected session cookie, got %#v", cookies)
	}
	if u, _ := decodeBody(t, rec)["user"].(map[string]any); u == nil || u["email"] != "carol@x.y" {
		t.Fatalf("user payload missing/wrong: %v", decodeBody(t, rec))
	}
}

func TestHandleLogin_WithUsernameIdentifier(t *testing.T) {
	st := newMockStore()
	svc := newTestService(t, st)
	seedPasswordUser(t, svc, "dave", "dave@x.y", "dave-pwd-1")

	rec := post(svc.HandleLogin, `{"identifier":"dave","password":"dave-pwd-1"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if cookies := rec.Result().Cookies(); len(cookies) != 1 || cookies[0].Name != DefaultCookieName {
		t.Fatalf("expected session cookie, got %#v", cookies)
	}
}

func TestHandleLogin_WrongPassword(t *testing.T) {
	st := newMockStore()
	svc := newTestService(t, st)
	seedPasswordUser(t, svc, "eve", "eve@x.y", "eve-pwd-1")

	rec := post(svc.HandleLogin, `{"identifier":"eve","password":"WRONG"}`)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d want 401", rec.Code)
	}
	if got := decodeBody(t, rec)["error"]; got != "invalid_credentials" {
		t.Fatalf("error=%v want invalid_credentials", got)
	}
	// No cookie on failure.
	if cookies := rec.Result().Cookies(); len(cookies) != 0 {
		t.Fatalf("unexpected cookie on failed login: %#v", cookies)
	}
}

func TestHandleLogin_UnknownIdentifierSameResponse(t *testing.T) {
	st := newMockStore()
	svc := newTestService(t, st)

	// No user seeded — looking up "nobody" must produce the SAME 401
	// invalid_credentials envelope as a wrong-password attempt. That's
	// the anti-enumeration contract.
	rec := post(svc.HandleLogin, `{"identifier":"nobody","password":"whatever-123"}`)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d want 401", rec.Code)
	}
	if got := decodeBody(t, rec)["error"]; got != "invalid_credentials" {
		t.Fatalf("error=%v want invalid_credentials", got)
	}
}

func TestHandleLogin_EmptyIdentifierOrPassword(t *testing.T) {
	st := newMockStore()
	svc := newTestService(t, st)

	cases := []string{
		`{"identifier":"","password":"pwd-12345"}`,
		`{"identifier":"someone","password":""}`,
		`{}`,
	}
	for _, c := range cases {
		rec := post(svc.HandleLogin, c)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("body=%s: status=%d want 401", c, rec.Code)
		}
	}
}
