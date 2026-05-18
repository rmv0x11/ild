package api

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/rmv0x11/ild/server/internal/domain"
)

// CardsStore is the slice of *db.DB that the sync handlers need. Defining
// it as an interface keeps the api package decoupled from the SQLite layer
// and means router_test.go can plug in an in-memory fake.
type CardsStore interface {
	BulkUpsertCards(ctx context.Context, userID string, cards []domain.Card) (int, error)
	ListCardsSince(ctx context.Context, userID string, sinceMs int64, limit int) ([]domain.Card, error)
	SoftDeleteCard(ctx context.Context, userID, cardID string, now int64) error

	BulkInsertReviews(ctx context.Context, userID string, reviews []domain.Review) error
	ListReviewsSince(ctx context.Context, userID string, sinceMs int64, limit int) ([]domain.Review, error)
}

const (
	// defaultSyncLimit balances client latency against per-request work.
	defaultSyncLimit = 500
	// maxSyncLimit caps a single page so a malicious client can't DOS us by
	// asking for millions of rows in one go.
	maxSyncLimit = 2000
	// maxBatchUpsert caps the number of cards/reviews per POST so the SQLite
	// transaction stays small. 1k items @ ~200 bytes each = ~200KB, well
	// under the 1MiB body cap.
	maxBatchUpsert = 1000
)

// syncCardsResponse is the GET payload. NextSince is what the client should
// pass as ?since=… on its next call to resume pagination.
type syncCardsResponse struct {
	Cards     []domain.Card `json:"cards"`
	NextSince int64         `json:"nextSince"`
}

// syncCardsRequest is the POST batch payload.
type syncCardsRequest struct {
	Cards []domain.Card `json:"cards"`
}

// handleSyncCardsGet returns the user's cards updated since the supplied
// watermark. Tombstones (DeletedAt != nil) are included so the client can
// mirror deletes locally.
func handleSyncCardsGet(store CardsStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if user == nil {
			writeError(w, http.StatusUnauthorized, "unauthorized", "login required")
			return
		}
		since, err := parseSinceQuery(r)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_since", err.Error())
			return
		}
		limit := parseLimitQuery(r, defaultSyncLimit, maxSyncLimit)

		cards, err := store.ListCardsSince(r.Context(), user.ID, since, limit)
		if err != nil {
			slog.Error("ListCardsSince failed", "err", err, "user_id", user.ID)
			writeError(w, http.StatusInternalServerError, "internal_error", "list failed")
			return
		}
		writeJSON(w, http.StatusOK, syncCardsResponse{
			Cards:     cards,
			NextSince: nextSinceFromCards(cards, since),
		})
	}
}

// handleSyncCardsPost accepts a batch of cards (limit maxBatchUpsert) and
// upserts them under the authenticated user. Returns the number of rows
// the store reports as applied so clients can verify nothing was silently
// dropped.
func handleSyncCardsPost(store CardsStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if user == nil {
			writeError(w, http.StatusUnauthorized, "unauthorized", "login required")
			return
		}
		var req syncCardsRequest
		if err := decodeJSON(r, &req); err != nil {
			if errors.Is(err, errBodyTooLarge) {
				writeError(w, http.StatusRequestEntityTooLarge, "body_too_large", "max 1MiB")
				return
			}
			writeError(w, http.StatusBadRequest, "invalid_json", err.Error())
			return
		}
		if len(req.Cards) == 0 {
			writeJSON(w, http.StatusOK, map[string]int{"applied": 0})
			return
		}
		if len(req.Cards) > maxBatchUpsert {
			writeError(w, http.StatusBadRequest, "batch_too_large",
				"max "+strconv.Itoa(maxBatchUpsert)+" cards per request")
			return
		}
		applied, err := store.BulkUpsertCards(r.Context(), user.ID, req.Cards)
		if err != nil {
			slog.Error("BulkUpsertCards failed", "err", err, "user_id", user.ID)
			writeError(w, http.StatusInternalServerError, "internal_error", "upsert failed")
			return
		}
		writeJSON(w, http.StatusOK, map[string]int{"applied": applied})
	}
}

// handleSyncCardDelete soft-deletes a single card. The store sets DeletedAt
// rather than removing the row so other devices can sync the tombstone.
func handleSyncCardDelete(store CardsStore, now func() int64) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if user == nil {
			writeError(w, http.StatusUnauthorized, "unauthorized", "login required")
			return
		}
		id := r.PathValue("id")
		if id == "" {
			writeError(w, http.StatusBadRequest, "missing_id", "card id required")
			return
		}
		if err := store.SoftDeleteCard(r.Context(), user.ID, id, now()); err != nil {
			slog.Error("SoftDeleteCard failed", "err", err, "user_id", user.ID, "card_id", id)
			writeError(w, http.StatusInternalServerError, "internal_error", "delete failed")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// syncReviewsResponse mirrors syncCardsResponse for the reviews stream.
type syncReviewsResponse struct {
	Reviews   []domain.Review `json:"reviews"`
	NextSince int64           `json:"nextSince"`
}

type syncReviewsRequest struct {
	Reviews []domain.Review `json:"reviews"`
}

// handleSyncReviewsGet paginates the append-only reviews log.
func handleSyncReviewsGet(store CardsStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if user == nil {
			writeError(w, http.StatusUnauthorized, "unauthorized", "login required")
			return
		}
		since, err := parseSinceQuery(r)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_since", err.Error())
			return
		}
		limit := parseLimitQuery(r, defaultSyncLimit, maxSyncLimit)

		reviews, err := store.ListReviewsSince(r.Context(), user.ID, since, limit)
		if err != nil {
			slog.Error("ListReviewsSince failed", "err", err, "user_id", user.ID)
			writeError(w, http.StatusInternalServerError, "internal_error", "list failed")
			return
		}
		writeJSON(w, http.StatusOK, syncReviewsResponse{
			Reviews:   reviews,
			NextSince: nextSinceFromReviews(reviews, since),
		})
	}
}

// handleSyncReviewsPost batch-inserts review log entries.
func handleSyncReviewsPost(store CardsStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if user == nil {
			writeError(w, http.StatusUnauthorized, "unauthorized", "login required")
			return
		}
		var req syncReviewsRequest
		if err := decodeJSON(r, &req); err != nil {
			if errors.Is(err, errBodyTooLarge) {
				writeError(w, http.StatusRequestEntityTooLarge, "body_too_large", "max 1MiB")
				return
			}
			writeError(w, http.StatusBadRequest, "invalid_json", err.Error())
			return
		}
		if len(req.Reviews) == 0 {
			writeJSON(w, http.StatusOK, map[string]int{"applied": 0})
			return
		}
		if len(req.Reviews) > maxBatchUpsert {
			writeError(w, http.StatusBadRequest, "batch_too_large",
				"max "+strconv.Itoa(maxBatchUpsert)+" reviews per request")
			return
		}
		if err := store.BulkInsertReviews(r.Context(), user.ID, req.Reviews); err != nil {
			slog.Error("BulkInsertReviews failed", "err", err, "user_id", user.ID)
			writeError(w, http.StatusInternalServerError, "internal_error", "insert failed")
			return
		}
		writeJSON(w, http.StatusOK, map[string]int{"applied": len(req.Reviews)})
	}
}

// parseSinceQuery extracts ?since=NN from the URL. Missing/empty value
// means "from the beginning" (0). Negative values are rejected so clients
// can't accidentally rewind to before-epoch.
func parseSinceQuery(r *http.Request) (int64, error) {
	raw := r.URL.Query().Get("since")
	if raw == "" {
		return 0, nil
	}
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0, errors.New("since must be an integer")
	}
	if n < 0 {
		return 0, errors.New("since must be >= 0")
	}
	return n, nil
}

// parseLimitQuery extracts ?limit=NN, clamping to [1, max] and falling
// back to def on missing/invalid input.
func parseLimitQuery(r *http.Request, def, max int) int {
	raw := r.URL.Query().Get("limit")
	if raw == "" {
		return def
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return def
	}
	if n > max {
		return max
	}
	return n
}

// nextSinceFromCards computes the watermark the client should use on its
// next paged request. We return max(UpdatedAt)+1 so the next page does not
// re-deliver the last row. When the page is empty we echo the input since
// to keep pagination idempotent.
func nextSinceFromCards(cards []domain.Card, since int64) int64 {
	max := since
	for _, c := range cards {
		if c.UpdatedAt > max {
			max = c.UpdatedAt
		}
	}
	if max == since {
		return since
	}
	return max + 1
}

// nextSinceFromReviews uses ReviewedAt as the watermark since reviews are
// append-only and don't have an UpdatedAt column.
func nextSinceFromReviews(reviews []domain.Review, since int64) int64 {
	max := since
	for _, rv := range reviews {
		if rv.ReviewedAt > max {
			max = rv.ReviewedAt
		}
	}
	if max == since {
		return since
	}
	return max + 1
}
