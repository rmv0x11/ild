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
		next := safeNextPath(q.Get("next"))
		http.Redirect(w, r, next, http.StatusFound)
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
		http.Redirect(w, r, safeNextPath(r.URL.Query().Get("next")), http.StatusFound)
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
