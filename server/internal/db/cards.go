package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/rmv0x11/ild/server/internal/domain"
)

// UpsertCard writes c into cards. The conflict key is (id, user_id).
//
// Concurrency model is "last-write-wins with timestamp tiebreaker":
//   - If no row exists yet, insert.
//   - If a row exists with updated_at <= incoming, replace.
//   - If a row exists with updated_at >  incoming, skip silently (no-op).
//
// This lets the sync layer push a batch where some entries may be stale
// without having to compute deltas client-side.
func (d *DB) UpsertCard(ctx context.Context, c *domain.Card) error {
	if c == nil {
		return errors.New("card is nil")
	}
	if c.ID == "" || c.UserID == "" {
		return errors.New("card: id and user_id required")
	}
	return d.withTx(ctx, func(tx *sql.Tx) error {
		_, err := upsertCardTx(ctx, tx, c)
		return err
	})
}

// BulkUpsertCards runs UpsertCard for many cards in one transaction.
// It returns the number of rows actually written (skipped LWW cases are not
// counted). All cards must belong to userID; mismatches are rejected.
func (d *DB) BulkUpsertCards(ctx context.Context, userID string, cards []domain.Card) (int, error) {
	if userID == "" {
		return 0, errors.New("user_id required")
	}
	applied := 0
	err := d.withTx(ctx, func(tx *sql.Tx) error {
		for i := range cards {
			c := cards[i] // local copy so we can patch userID
			if c.UserID == "" {
				c.UserID = userID
			} else if c.UserID != userID {
				return fmt.Errorf("card %s: user_id mismatch", c.ID)
			}
			if c.ID == "" {
				return errors.New("card.id required")
			}
			wrote, err := upsertCardTx(ctx, tx, &c)
			if err != nil {
				return err
			}
			if wrote {
				applied++
			}
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return applied, nil
}

// upsertCardTx is the LWW core used by both UpsertCard and BulkUpsertCards.
// Returns (true, nil) if the row was inserted or updated; (false, nil) if the
// incoming card was stale and skipped.
func upsertCardTx(ctx context.Context, tx *sql.Tx, c *domain.Card) (bool, error) {
	var existingUpdated sql.NullInt64
	err := tx.QueryRowContext(ctx,
		`SELECT updated_at FROM cards WHERE id = ? AND user_id = ?`,
		c.ID, c.UserID,
	).Scan(&existingUpdated)
	if err != nil && !isNoRows(err) {
		return false, fmt.Errorf("check existing card: %w", err)
	}
	if existingUpdated.Valid && existingUpdated.Int64 > c.UpdatedAt {
		// Server has a newer version; client push is stale.
		return false, nil
	}

	// INSERT OR REPLACE is fine because the PK is (id, user_id) and we don't
	// have child rows with FK to cards. (Reviews reference card_id by string,
	// without an FK constraint.)
	_, err = tx.ExecContext(ctx, `
		INSERT OR REPLACE INTO cards (
			id, user_id, word, pinyin, context,
			stage, learning_step, interval_days, ease,
			due_at, reps, lapses,
			created_at, updated_at, deleted_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		c.ID, c.UserID, c.Word, c.Pinyin, c.Context,
		string(c.Stage), c.LearningStep, c.IntervalDays, c.Ease,
		c.DueAt, c.Reps, c.Lapses,
		c.CreatedAt, c.UpdatedAt, c.DeletedAt,
	)
	if err != nil {
		return false, fmt.Errorf("upsert card: %w", err)
	}
	return true, nil
}

// ListCardsSince returns every card (including tombstones — rows with
// deleted_at IS NOT NULL) that has updated_at > sinceMs, sorted by
// (updated_at ASC, id ASC) so clients can resume on a stable cursor.
//
// limit <= 0 means "no limit"; otherwise we cap at limit rows.
func (d *DB) ListCardsSince(ctx context.Context, userID string, sinceMs int64, limit int) ([]domain.Card, error) {
	if userID == "" {
		return nil, errors.New("user_id required")
	}
	query := `
		SELECT id, user_id, word, pinyin, context,
		       stage, learning_step, interval_days, ease,
		       due_at, reps, lapses,
		       created_at, updated_at, deleted_at
		FROM cards
		WHERE user_id = ? AND updated_at > ?
		ORDER BY updated_at ASC, id ASC
	`
	args := []any{userID, sinceMs}
	if limit > 0 {
		query += " LIMIT ?"
		args = append(args, limit)
	}
	rows, err := d.sql.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query cards: %w", err)
	}
	defer rows.Close()

	out := make([]domain.Card, 0, 32)
	for rows.Next() {
		var (
			c       domain.Card
			stage   string
			deleted sql.NullInt64
		)
		if err := rows.Scan(
			&c.ID, &c.UserID, &c.Word, &c.Pinyin, &c.Context,
			&stage, &c.LearningStep, &c.IntervalDays, &c.Ease,
			&c.DueAt, &c.Reps, &c.Lapses,
			&c.CreatedAt, &c.UpdatedAt, &deleted,
		); err != nil {
			return nil, fmt.Errorf("scan card: %w", err)
		}
		c.Stage = domain.CardStage(stage)
		if deleted.Valid {
			v := deleted.Int64
			c.DeletedAt = &v
		}
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate cards: %w", err)
	}
	return out, nil
}

// SoftDeleteCard marks (userID, cardID) as deleted at now (ms). It also
// bumps updated_at so the sync stream picks the tombstone up.
//
// If the row doesn't exist we return nil — deleting something that isn't
// there is not an error from the client's point of view.
func (d *DB) SoftDeleteCard(ctx context.Context, userID, cardID string, now int64) error {
	if userID == "" || cardID == "" {
		return errors.New("user_id and card_id required")
	}
	_, err := d.sql.ExecContext(ctx, `
		UPDATE cards
		SET deleted_at = ?, updated_at = ?
		WHERE id = ? AND user_id = ?
	`, now, now, cardID, userID)
	if err != nil {
		return fmt.Errorf("soft-delete card: %w", err)
	}
	return nil
}
