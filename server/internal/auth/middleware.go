package auth

import (
	"context"
	"net/http"

	"github.com/rmv0x11/ild/server/internal/domain"
)

// userKey is the unexported context key under which the authenticated *User
// is stored. Using an unexported empty struct guarantees no collisions with
// other context users.
type userKey struct{}

// Middleware attempts to read a session and attach the authenticated user
// to the request context. It NEVER short-circuits — handlers downstream are
// expected to call UserFrom and decide for themselves whether to reject.
// Use RequireUser to gate routes that must be authenticated.
func (s *Service) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, user, err := s.ReadSession(r)
		if err == nil && user != nil {
			r = r.WithContext(context.WithValue(r.Context(), userKey{}, user))
		}
		next.ServeHTTP(w, r)
	})
}

// RequireUser is the gating sibling of Middleware. It expects Middleware to
// have run earlier in the chain and aborts with 401 if no user is attached.
func (s *Service) RequireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if UserFrom(r.Context()) == nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// UserFrom retrieves the authenticated user from ctx, or nil.
func UserFrom(ctx context.Context) *domain.User {
	if ctx == nil {
		return nil
	}
	u, _ := ctx.Value(userKey{}).(*domain.User)
	return u
}
