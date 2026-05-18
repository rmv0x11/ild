package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/rmv0x11/ild/server/internal/domain"
)

// Default cookie names. Exposed as constants so other packages can reference
// them by name rather than re-declaring strings.
const (
	DefaultCookieName     = "ild_session"
	OAuthStateCookieName  = "ild_oauth_state"
	oauthStateTTL         = 10 * time.Minute
	minCookieSecretLength = 32
)

// Options configures Service.
type Options struct {
	Store        Store
	CookieSecret []byte
	CookieName   string
	SecureCookie bool
	SessionTTL   time.Duration
}

// Service implements session issuance/reading and is the receiver for all
// HTTP handlers that need to know who the caller is.
type Service struct {
	store        Store
	cookieSecret []byte
	cookieName   string
	secureCookie bool
	sessionTTL   time.Duration
}

// NewService builds a Service. It panics if the cookie secret is shorter than
// 32 bytes — making this a panic and not a returned error is deliberate: a
// short secret is always a programmer/config bug, never recoverable runtime
// state.
func NewService(opts Options) *Service {
	if len(opts.CookieSecret) < minCookieSecretLength {
		panic("auth: CookieSecret must be at least 32 bytes")
	}
	if opts.Store == nil {
		panic("auth: Store is required")
	}
	name := opts.CookieName
	if name == "" {
		name = DefaultCookieName
	}
	ttl := opts.SessionTTL
	if ttl <= 0 {
		ttl = 30 * 24 * time.Hour
	}
	return &Service{
		store:        opts.Store,
		cookieSecret: opts.CookieSecret,
		cookieName:   name,
		secureCookie: opts.SecureCookie,
		sessionTTL:   ttl,
	}
}

// CookieName exposes the configured cookie name (used by handlers/tests).
func (s *Service) CookieName() string { return s.cookieName }

// SessionTTL exposes the configured session TTL.
func (s *Service) SessionTTL() time.Duration { return s.sessionTTL }

// signValue returns base64url HMAC-SHA256(secret, value).
func (s *Service) signValue(value string) string {
	mac := hmac.New(sha256.New, s.cookieSecret)
	mac.Write([]byte(value))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// signedCookieValue builds the cookie payload "value.sig".
func (s *Service) signedCookieValue(value string) string {
	return value + "." + s.signValue(value)
}

// verifySignedCookieValue splits "value.sig" and verifies sig. On success
// returns the unsigned value.
func (s *Service) verifySignedCookieValue(raw string) (string, error) {
	idx := strings.LastIndexByte(raw, '.')
	if idx <= 0 || idx == len(raw)-1 {
		return "", errors.New("auth: malformed signed cookie")
	}
	value := raw[:idx]
	sig := raw[idx+1:]
	expected := s.signValue(value)
	// constant-time compare on the raw base64 strings of equal length.
	if len(sig) != len(expected) || subtle.ConstantTimeCompare([]byte(sig), []byte(expected)) != 1 {
		return "", errors.New("auth: signature mismatch")
	}
	return value, nil
}

// IssueCookie persists a new session for userID and writes the signed
// session cookie to w. Uses context.Background for the DB call so the
// signature matches the auth spec; handlers that need request-scoped
// cancellation should use IssueCookieCtx.
func (s *Service) IssueCookie(w http.ResponseWriter, userID string) error {
	return s.IssueCookieCtx(context.Background(), w, userID)
}

// IssueCookieCtx is the context-aware variant.
func (s *Service) IssueCookieCtx(ctx context.Context, w http.ResponseWriter, userID string) error {
	sess, err := s.store.CreateSession(ctx, userID, s.sessionTTL)
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     s.cookieName,
		Value:    s.signedCookieValue(sess.ID),
		Path:     "/",
		MaxAge:   int(s.sessionTTL.Seconds()),
		HttpOnly: true,
		Secure:   s.secureCookie,
		SameSite: http.SameSiteLaxMode,
	})
	return nil
}

// ReadSession reads the session cookie, verifies HMAC, looks up the session
// and user, returning (nil, nil, nil) for "not logged in" (no cookie,
// expired session, tampered cookie, etc.). It returns an error only for
// underlying storage failures the caller might want to log.
func (s *Service) ReadSession(r *http.Request) (*domain.Session, *domain.User, error) {
	c, err := r.Cookie(s.cookieName)
	if err != nil || c.Value == "" {
		return nil, nil, nil
	}
	sessID, err := s.verifySignedCookieValue(c.Value)
	if err != nil {
		// HMAC mismatch — treat as not-logged-in.
		return nil, nil, nil
	}
	sess, err := s.store.FindSession(r.Context(), sessID)
	if err != nil {
		return nil, nil, err
	}
	if sess == nil {
		return nil, nil, nil
	}
	user, err := s.store.FindUserByID(r.Context(), sess.UserID)
	if err != nil {
		return nil, nil, err
	}
	if user == nil {
		return nil, nil, nil
	}
	return sess, user, nil
}

// Logout removes the server-side session (best-effort) and clears the
// cookie on the client.
func (s *Service) Logout(w http.ResponseWriter, r *http.Request) error {
	if c, err := r.Cookie(s.cookieName); err == nil && c.Value != "" {
		if sessID, verr := s.verifySignedCookieValue(c.Value); verr == nil {
			_ = s.store.DeleteSession(r.Context(), sessID)
		}
	}
	http.SetCookie(w, &http.Cookie{
		Name:     s.cookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.secureCookie,
		SameSite: http.SameSiteLaxMode,
	})
	return nil
}

// GenerateState returns a random base64url string suitable for use as an
// OAuth `state` parameter, and writes a short-lived signed cookie that
// callbacks can compare against.
func (s *Service) GenerateState(w http.ResponseWriter) (string, error) {
	var buf [24]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	state := base64.RawURLEncoding.EncodeToString(buf[:])
	http.SetCookie(w, &http.Cookie{
		Name:     OAuthStateCookieName,
		Value:    s.signedCookieValue(state),
		Path:     "/",
		MaxAge:   int(oauthStateTTL.Seconds()),
		HttpOnly: true,
		Secure:   s.secureCookie,
		SameSite: http.SameSiteLaxMode,
	})
	return state, nil
}

// VerifyState reads the OAuth state cookie, validates HMAC, and compares
// against the supplied state in constant time.
func (s *Service) VerifyState(r *http.Request, state string) bool {
	if state == "" {
		return false
	}
	c, err := r.Cookie(OAuthStateCookieName)
	if err != nil || c.Value == "" {
		return false
	}
	cookieState, err := s.verifySignedCookieValue(c.Value)
	if err != nil {
		return false
	}
	if len(cookieState) != len(state) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(cookieState), []byte(state)) == 1
}

// ClearStateCookie removes the OAuth state cookie after callback handling.
func (s *Service) ClearStateCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     OAuthStateCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.secureCookie,
		SameSite: http.SameSiteLaxMode,
	})
}
