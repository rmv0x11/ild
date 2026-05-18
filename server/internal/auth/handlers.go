package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/rmv0x11/ild/server/internal/domain"
)

// emailRegex is a deliberately loose, RFC-light pattern. We are not trying to
// be exhaustive — Google/SMTP will reject anything truly malformed.
var emailRegex = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

// usernameRegex matches the allowed username shape: 3-32 ASCII letters,
// digits, underscore or hyphen. Deliberately conservative so URLs, JSON
// keys, and any future "mention" syntax do not need escaping.
var usernameRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]{3,32}$`)

const (
	passwordMinLength = 8
	passwordMaxLength = 200
)

// findOrCreateUserByEmail returns the user matching email or creates one.
// Used by both the Google callback (when no OAuth link exists yet) and the
// email-magic-link flow.
func (s *Service) findOrCreateUserByEmail(ctx context.Context, email, name string) (*domain.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return nil, errors.New("auth: empty email")
	}
	if u, err := s.store.FindUserByEmail(ctx, email); err != nil {
		return nil, err
	} else if u != nil {
		return u, nil
	}
	u := &domain.User{
		ID:        uuid.NewString(),
		Email:     email,
		Name:      name,
		CreatedAt: time.Now().UnixMilli(),
	}
	if err := s.store.CreateUser(ctx, u); err != nil {
		return nil, err
	}
	return u, nil
}

// HandleGoogleStart generates a state token, plants the state cookie and
// redirects the browser to Google's consent page.
func (s *Service) HandleGoogleStart(g *GoogleProvider) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !g.Enabled() {
			http.Error(w, "google login disabled", http.StatusServiceUnavailable)
			return
		}
		state, err := s.GenerateState(w)
		if err != nil {
			http.Error(w, "state error", http.StatusInternalServerError)
			return
		}
		http.Redirect(w, r, g.AuthURL(state), http.StatusFound)
	}
}

// HandleGoogleCallback validates state, exchanges the code, ensures a user
// exists, links the OAuth identity and issues a session cookie.
func (s *Service) HandleGoogleCallback(g *GoogleProvider) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !g.Enabled() {
			http.Error(w, "google login disabled", http.StatusServiceUnavailable)
			return
		}
		q := r.URL.Query()
		if errParam := q.Get("error"); errParam != "" {
			http.Error(w, "oauth error: "+errParam, http.StatusBadRequest)
			return
		}
		state := q.Get("state")
		if !s.VerifyState(r, state) {
			http.Error(w, "invalid state", http.StatusBadRequest)
			return
		}
		s.ClearStateCookie(w)

		code := q.Get("code")
		gu, err := g.Exchange(r.Context(), code)
		if err != nil {
			http.Error(w, "oauth exchange failed", http.StatusBadGateway)
			return
		}

		// Prefer an existing OAuth link; fall back to find-or-create by email.
		user, err := s.store.FindUserByOAuth(r.Context(), "google", gu.ID)
		if err != nil {
			http.Error(w, "store error", http.StatusInternalServerError)
			return
		}
		if user == nil {
			user, err = s.findOrCreateUserByEmail(r.Context(), gu.Email, gu.Name)
			if err != nil {
				http.Error(w, "store error", http.StatusInternalServerError)
				return
			}
			if err := s.store.LinkOAuth(r.Context(), &domain.OAuthLink{
				UserID:     user.ID,
				Provider:   "google",
				ProviderID: gu.ID,
				CreatedAt:  time.Now().UnixMilli(),
			}); err != nil {
				http.Error(w, "store error", http.StatusInternalServerError)
				return
			}
		}
		if err := s.IssueCookieCtx(r.Context(), w, user.ID); err != nil {
			http.Error(w, "session error", http.StatusInternalServerError)
			return
		}
		http.Redirect(w, r, s.successRedirectURL(q.Get("next")), http.StatusFound)
	}
}

// safeNextPath sanitises the `next` query parameter so we never open-redirect
// to an external origin. Only local absolute paths starting with "/" and not
// with "//" are accepted.
func safeNextPath(p string) string {
	if p == "" || !strings.HasPrefix(p, "/") || strings.HasPrefix(p, "//") {
		return "/"
	}
	return p
}

// HandleRequest serves POST {email} and triggers Request. To prevent account
// enumeration it always returns 200 on a well-formed email, regardless of
// whether the email actually maps to a known user.
func (e *EmailAuth) HandleRequest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<14)).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	body.Email = strings.TrimSpace(strings.ToLower(body.Email))
	if !emailRegex.MatchString(body.Email) {
		// Still 200 to avoid leaking the validation rule, but skip work.
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	// Fire request best-effort; we never reveal the outcome.
	_ = e.Request(r.Context(), body.Email)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// HandleEmailVerify reads `?token=`, consumes the magic-link, ensures a user
// exists and issues a session cookie before redirecting to /.
func (s *Service) HandleEmailVerify(e *EmailAuth) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("token")
		email, err := e.Verify(r.Context(), token)
		if err != nil {
			http.Error(w, "invalid or expired link", http.StatusBadRequest)
			return
		}
		user, err := s.findOrCreateUserByEmail(r.Context(), email, "")
		if err != nil {
			http.Error(w, "store error", http.StatusInternalServerError)
			return
		}
		if err := s.IssueCookieCtx(r.Context(), w, user.ID); err != nil {
			http.Error(w, "session error", http.StatusInternalServerError)
			return
		}
		http.Redirect(w, r, s.successRedirectURL(r.URL.Query().Get("next")), http.StatusFound)
	}
}

// HandleMe returns the currently authenticated user (or null).
func (s *Service) HandleMe(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	if user == nil {
		// Fall back to ReadSession in case the middleware did not run.
		if _, u, err := s.ReadSession(r); err == nil {
			user = u
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

// HandleLogout terminates the session and clears the cookie.
func (s *Service) HandleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	_ = s.Logout(w, r)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// registerRequest is the JSON shape accepted by HandleRegister. All three
// fields are required; the validation rules are spelled out in the regexes
// and length constants above.
type registerRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// loginRequest is the JSON shape accepted by HandleLogin. `identifier`
// is intentionally generic — the handler auto-detects whether the caller
// sent an email (contains '@') or a username and dispatches accordingly.
type loginRequest struct {
	Identifier string `json:"identifier"`
	Password   string `json:"password"`
}

// HandleRegister creates a new user from username/email/password and issues
// a session cookie. Errors map to:
//
//   - 400 invalid_username / invalid_email / invalid_password — body failed
//     validation regexes or length bounds.
//   - 409 email_taken / username_taken — uniqueness clash.
//   - 500 — storage failure (anything else).
//
// On success the response is 201 with the freshly-created user (sans
// password_hash, thanks to the json:"-" tag).
func (s *Service) HandleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body registerRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request"})
		return
	}
	body.Username = strings.TrimSpace(body.Username)
	body.Email = strings.ToLower(strings.TrimSpace(body.Email))

	if !usernameRegex.MatchString(body.Username) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_username"})
		return
	}
	if !emailRegex.MatchString(body.Email) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_email"})
		return
	}
	if len(body.Password) < passwordMinLength || len(body.Password) > passwordMaxLength {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_password"})
		return
	}

	ctx := r.Context()

	// Check email first, then username, so we surface the most-specific
	// 409 message. Both checks are best-effort: a concurrent insert could
	// still race and our DB unique constraints will catch it (mapped below).
	if existing, err := s.store.FindUserByEmail(ctx, body.Email); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "store_error"})
		return
	} else if existing != nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "email_taken"})
		return
	}
	if existing, err := s.store.FindUserByUsername(ctx, body.Username); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "store_error"})
		return
	} else if existing != nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "username_taken"})
		return
	}

	hash, err := HashPassword(body.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "hash_error"})
		return
	}

	user := &domain.User{
		ID:           uuid.NewString(),
		Email:        body.Email,
		Username:     body.Username,
		PasswordHash: hash,
		CreatedAt:    time.Now().UnixMilli(),
	}
	if err := s.store.CreateUser(ctx, user); err != nil {
		// Map UNIQUE constraint races onto the same 409s as the pre-checks.
		// SQLite reports these as "UNIQUE constraint failed: users.email"
		// (or users.username for the partial unique index).
		msg := err.Error()
		switch {
		case strings.Contains(msg, "users.email"):
			writeJSON(w, http.StatusConflict, map[string]string{"error": "email_taken"})
		case strings.Contains(msg, "users.username") || strings.Contains(msg, "users_username_unique"):
			writeJSON(w, http.StatusConflict, map[string]string{"error": "username_taken"})
		default:
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "store_error"})
		}
		return
	}

	if err := s.IssueCookieCtx(ctx, w, user.ID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "session_error"})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"user": user})
}

// HandleLogin authenticates an existing user with username|email + password
// and issues a session cookie. The "identifier" field is auto-detected: it
// is treated as an email when it contains '@', otherwise as a username.
//
// Anti-enumeration: a missing user and a wrong password return the same
// 401 body so an attacker cannot probe which usernames/emails exist.
func (s *Service) HandleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body loginRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request"})
		return
	}
	body.Identifier = strings.TrimSpace(body.Identifier)
	if body.Identifier == "" || body.Password == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid_credentials"})
		return
	}

	ctx := r.Context()

	// Auto-detect: any '@' in the identifier means "treat as email". We
	// lowercase emails (matches our register/findOrCreate flow) but leave
	// usernames untouched — username matching is case-sensitive.
	var (
		user *domain.User
		err  error
	)
	if strings.ContainsRune(body.Identifier, '@') {
		user, err = s.store.FindUserByEmail(ctx, strings.ToLower(body.Identifier))
	} else {
		user, err = s.store.FindUserByUsername(ctx, body.Identifier)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "store_error"})
		return
	}
	if user == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid_credentials"})
		return
	}
	if err := CheckPassword(user.PasswordHash, body.Password); err != nil {
		if errors.Is(err, ErrPasswordMismatch) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid_credentials"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "auth_error"})
		return
	}

	if err := s.IssueCookieCtx(ctx, w, user.ID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "session_error"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}
