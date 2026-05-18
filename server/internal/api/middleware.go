// Package api wires up the HTTP layer of the server: routing, middleware,
// and JSON sync handlers. It depends on auth/db only through interfaces so
// the package can be tested in isolation against mocks.
package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"runtime/debug"
	"slices"
	"time"

	"github.com/rmv0x11/ild/server/internal/auth"
	"github.com/rmv0x11/ild/server/internal/domain"
)

// MaxBodyBytes caps the size of any POSTed request body. 1 MiB is plenty
// for batches of ~1000 cards/reviews and keeps the server cheap on the
// VPN-shared host.
const MaxBodyBytes = 1 << 20 // 1 MiB

// ContextKey is a typed key for values we put into the request context.
type ContextKey string

const (
	ctxKeyRequestID ContextKey = "requestID"
	ctxKeyUser      ContextKey = "user"
)

// AuthMiddleware abstracts the slice of *auth.Service the router needs:
// session resolution and "must be logged in" gating. Using an interface
// keeps the api package independent of the auth package's storage layer
// and makes router_test.go straightforward to mock.
type AuthMiddleware interface {
	// Middleware wraps next with session resolution: if the request
	// carries a valid session cookie, the user is placed into the
	// context (retrievable via UserFromContext). Anonymous requests
	// still reach next.
	Middleware(next http.Handler) http.Handler

	// RequireUser wraps next and replies 401 when no user is in context.
	RequireUser(next http.Handler) http.Handler
}

// UserFromContext returns the authenticated user attached by an upstream
// middleware. We try the api-package key first (set by tests / mock auth)
// and fall back to auth.UserFrom so the real auth.Service.Middleware also
// works without coordination.
func UserFromContext(ctx context.Context) *domain.User {
	if u, ok := ctx.Value(ctxKeyUser).(*domain.User); ok && u != nil {
		return u
	}
	return auth.UserFrom(ctx)
}

// WithUser returns ctx with user attached under the api-package key. Used
// by tests / mock authentication. Real production code relies on
// auth.Service.Middleware which uses its own (unexported) key.
func WithUser(ctx context.Context, u *domain.User) context.Context {
	return context.WithValue(ctx, ctxKeyUser, u)
}

// recoveryMiddleware turns panics into a 500 + logged stack trace so a
// single bad request can't crash the server (or, worse, the VPN host).
func recoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("panic recovered",
					"err", rec,
					"path", r.URL.Path,
					"method", r.Method,
					"stack", string(debug.Stack()),
				)
				// Best-effort: client may have received partial headers already,
				// but http.ResponseWriter swallows that race silently.
				http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// requestIDMiddleware tags every request with a hex request_id, used by
// the logger and surfaced to the client via X-Request-Id for support.
func requestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := newRequestID()
		w.Header().Set("X-Request-Id", id)
		ctx := context.WithValue(r.Context(), ctxKeyRequestID, id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// loggerMiddleware emits one structured log line per request.
func loggerMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)

		var userID string
		if u := UserFromContext(r.Context()); u != nil {
			userID = u.ID
		}
		reqID, _ := r.Context().Value(ctxKeyRequestID).(string)

		slog.Info("http",
			"request_id", reqID,
			"method", r.Method,
			"path", r.URL.Path,
			"status", sw.status,
			"duration_ms", time.Since(start).Milliseconds(),
			"user_id", userID,
			"bytes", sw.bytes,
			"remote", r.RemoteAddr,
		)
	})
}

// statusWriter captures status code + byte count for logging.
type statusWriter struct {
	http.ResponseWriter
	status      int
	bytes       int
	wroteHeader bool
}

func (s *statusWriter) WriteHeader(code int) {
	if s.wroteHeader {
		return
	}
	s.status = code
	s.wroteHeader = true
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusWriter) Write(b []byte) (int, error) {
	if !s.wroteHeader {
		// Implicit 200 — mirror net/http's default behavior.
		s.WriteHeader(http.StatusOK)
	}
	n, err := s.ResponseWriter.Write(b)
	s.bytes += n
	return n, err
}

// corsMiddleware honors the configured allowlist. Preflight (OPTIONS)
// short-circuits with 204. Browsers refuse cross-origin cookies unless
// Access-Control-Allow-Credentials: true is set together with an explicit
// origin (not "*"), which is exactly what we do.
func corsMiddleware(allowed []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && slices.Contains(allowed, origin) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Requested-With")
				w.Header().Set("Access-Control-Max-Age", "600")
			}
			if r.Method == http.MethodOptions {
				// Preflight: respond even when origin isn't whitelisted so
				// browsers see a clean 204 + missing CORS headers => block.
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// maxBytesMiddleware caps request body size on mutating verbs. GET/DELETE
// requests don't carry a body in this API so we leave them alone.
func maxBytesMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost || r.Method == http.MethodPut || r.Method == http.MethodPatch {
			r.Body = http.MaxBytesReader(w, r.Body, MaxBodyBytes)
		}
		next.ServeHTTP(w, r)
	})
}

// writeJSON is the single JSON writer used by every handler. It centralizes
// content-type, encoding, and error logging so handlers stay tiny.
func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if body == nil {
		return
	}
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(body); err != nil {
		// The response is already flushed at this point; the best we can do
		// is log it for postmortem. We deliberately do not panic.
		slog.Error("json encode failed", "err", err)
	}
}

// writeError sends a JSON error envelope with a stable shape so the client
// can pattern-match without sniffing free-form prose.
func writeError(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]string{"error": code, "message": msg})
}

// decodeJSON reads a JSON body into dst. It returns a typed error so the
// caller can decide between 400 (bad input) and 413 (too big).
func decodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			return errBodyTooLarge
		}
		return err
	}
	// Reject trailing garbage so clients can't smuggle two requests in one.
	if dec.More() {
		return errors.New("api: trailing data after JSON body")
	}
	return nil
}

// errBodyTooLarge is returned when MaxBytesReader trips. Sentinel value so
// the dispatch logic can map it to 413.
var errBodyTooLarge = errors.New("api: request body too large")

// newRequestID returns a 16-byte hex string suitable for log correlation.
// We don't need full RFC-4122 UUID — random hex is shorter and just as
// unique for our scale.
func newRequestID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		// crypto/rand failure is catastrophic; fall back to a fixed marker
		// rather than panicking and taking down the VPN-shared host.
		return "00000000000000000000000000000000"
	}
	return hex.EncodeToString(b[:])
}

