package api

import (
	"net/http"
	"time"
)

// AuthHandlers is the subset of *auth.Service the router consumes. Defined
// as an interface so router_test.go can swap in a fake without spinning up
// real sessions/cookies. The concrete *auth.Service from the auth package
// implements every method here.
type AuthHandlers interface {
	Middleware(next http.Handler) http.Handler
	RequireUser(next http.Handler) http.Handler
	HandleLogout(w http.ResponseWriter, r *http.Request)
	HandleMe(w http.ResponseWriter, r *http.Request)
}

// EmailHandlers is the subset of *auth.EmailAuth the router consumes.
type EmailHandlers interface {
	HandleRequest(w http.ResponseWriter, r *http.Request)
}

// Deps is the dependency-injection bag NewRouter consumes. Every field is
// an interface (or a plain handler) so tests can supply minimal fakes
// without dragging in SQLite, oauth2 or net/smtp.
type Deps struct {
	// DB is the sync data store. Implemented by *db.DB.
	DB CardsStore

	// Auth wires session middleware and the Me/Logout endpoints.
	Auth AuthHandlers

	// Email provides the magic-link "request" endpoint. Required.
	Email EmailHandlers

	// EmailVerify is the GET /api/v1/auth/email/verify handler. Built by
	// auth.Service.HandleEmailVerify(emailAuth) at startup. Required.
	EmailVerify http.HandlerFunc

	// GoogleStart/GoogleCallback are nil when Google login is disabled.
	// In that case the router skips registering both routes.
	GoogleStart    http.HandlerFunc
	GoogleCallback http.HandlerFunc

	// AllowedOrigins controls CORS. Origins not in the list get a clean
	// 204 on preflight but no Allow-* headers — the browser blocks.
	AllowedOrigins []string

	// Now is injectable so deterministic tests can pin "current time".
	// Nil falls back to time.Now().UnixMilli().
	Now func() int64
}

// NewRouter builds the public HTTP handler with the full middleware chain
// pre-attached: recovery → request-id → logger → CORS → maxBytes → auth.
// The returned handler is what main.go hands to *http.Server directly.
func NewRouter(deps Deps) http.Handler {
	if deps.Now == nil {
		deps.Now = func() int64 { return time.Now().UnixMilli() }
	}

	mux := http.NewServeMux()

	// Liveness probe. No auth, no logging-noise reduction needed at this
	// scale; the log line per call doubles as a passive heartbeat trace.
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// --- Auth endpoints ---
	mux.HandleFunc("POST /api/v1/auth/email/request", deps.Email.HandleRequest)
	if deps.EmailVerify != nil {
		mux.HandleFunc("GET /api/v1/auth/email/verify", deps.EmailVerify)
	}

	if deps.GoogleStart != nil && deps.GoogleCallback != nil {
		mux.HandleFunc("GET /api/v1/auth/google/start", deps.GoogleStart)
		mux.HandleFunc("GET /api/v1/auth/google/callback", deps.GoogleCallback)
	}

	mux.Handle("POST /api/v1/auth/logout", deps.Auth.RequireUser(
		http.HandlerFunc(deps.Auth.HandleLogout),
	))
	// /me is intentionally NOT wrapped in RequireUser — the frontend calls
	// it on every page load to figure out auth state and 200 {user:null}
	// is a cleaner "guest" signal than a 401 with a console error.
	mux.Handle("GET /api/v1/me", http.HandlerFunc(deps.Auth.HandleMe))

	// --- Sync endpoints (all require a session) ---
	mux.Handle("GET /api/v1/sync/cards", deps.Auth.RequireUser(
		handleSyncCardsGet(deps.DB),
	))
	mux.Handle("POST /api/v1/sync/cards", deps.Auth.RequireUser(
		handleSyncCardsPost(deps.DB),
	))
	mux.Handle("DELETE /api/v1/sync/cards/{id}", deps.Auth.RequireUser(
		handleSyncCardDelete(deps.DB, deps.Now),
	))

	mux.Handle("GET /api/v1/sync/reviews", deps.Auth.RequireUser(
		handleSyncReviewsGet(deps.DB),
	))
	mux.Handle("POST /api/v1/sync/reviews", deps.Auth.RequireUser(
		handleSyncReviewsPost(deps.DB),
	))

	// Middleware chain (outer → inner): recovery wraps everything so a
	// panic anywhere below — including the logger or auth middleware —
	// still produces a 500 instead of crashing the process.
	var handler http.Handler = mux
	handler = deps.Auth.Middleware(handler)
	handler = maxBytesMiddleware(handler)
	handler = corsMiddleware(deps.AllowedOrigins)(handler)
	handler = loggerMiddleware(handler)
	handler = requestIDMiddleware(handler)
	handler = recoveryMiddleware(handler)
	return handler
}
