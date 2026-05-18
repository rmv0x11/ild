package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/rmv0x11/ild/server/internal/domain"
)

// InsertReview appends one review log entry. The id is auto-generated and
// written back into r.ID. The reviews table is append-only — there is no
// update or delete API.
func (d *DB) InsertReview(ctx context.Context, r *domain.Review) error {
	if r == nil {
		return errors.New("review is nil")
	}
	if r.UserID == "" || r.CardID == "" {
		return errors.New("review: user_id and card_id required")
	}
	res, err := d.sql.ExecContext(ctx, `
		INSERT INTO reviews (
			user_id, card_id, rating, reviewed_at,
			stage_before, stage_after,
			interval_days_before, interval_days_after,
			ease_before, ease_after
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		r.UserID, r.CardID, string(r.Rating), r.ReviewedAt,
		string(r.StageBefore), string(r.StageAfter),
		r.IntervalDaysBefore, r.IntervalDaysAfter,
		r.EaseBefore, r.EaseAfter,
	)
	if err != nil {
		return fmt.Errorf("insert review: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return fmt.Errorf("last insert id: %w", err)
	}
	r.ID = id
	return nil
}

// BulkInsertReviews inserts many reviews in one transaction. All reviews must
// belong to userID; mismatches are rejected. Empty UserID on input is
// auto-filled from the userID argument.
func (d *DB) BulkInsertReviews(ctx context.Context, userID string, reviews []domain.Review) error {
	if userID == "" {
		return errors.New("user_id required")
	}
	return d.withTx(ctx, func(tx *sql.Tx) error {
		stmt, err := tx.PrepareContext(ctx, `
			INSERT INTO reviews (
				user_id, card_id, rating, reviewed_at,
				stage_before, stage_after,
				interval_days_before, interval_days_after,
				ease_before, ease_after
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`)
		if err != nil {
			return fmt.Errorf("prepare insert review: %w", err)
		}
		defer stmt.Close()

		for i := range reviews {
			r := &reviews[i] // patch in place so caller sees IDs/UserID
			if r.UserID == "" {
				r.UserID = userID
			} else if r.UserID != userID {
				return fmt.Errorf("review %d: user_id mismatch", i)
			}
			if r.CardID == "" {
				return fmt.Errorf("review %d: card_id required", i)
			}
			res, err := stmt.ExecContext(ctx,
				r.UserID, r.CardID, string(r.Rating), r.ReviewedAt,
				string(r.StageBefore), string(r.StageAfter),
				r.IntervalDaysBefore, r.IntervalDaysAfter,
				r.EaseBefore, r.EaseAfter,
			)
			if err != nil {
				return fmt.Errorf("insert review %d: %w", i, err)
			}
			id, err := res.LastInsertId()
			if err != nil {
				return fmt.Errorf("last insert id %d: %w", i, err)
			}
			r.ID = id
		}
		return nil
	})
}

// ListReviewsSince returns reviews with reviewed_at > sinceMs for user,
// ordered by (reviewed_at ASC, id ASC). Use limit <= 0 for "no limit".
func (d *DB) ListReviewsSince(ctx context.Context, userID string, sinceMs int64, limit int) ([]domain.Review, error) {
	if userID == "" {
		return nil, errors.New("user_id required")
	}
	query := `
		SELECT id, user_id, card_id, rating, reviewed_at,
		       stage_before, stage_after,
		       interval_days_before, interval_days_after,
		       ease_before, ease_after
		FROM reviews
		WHERE user_id = ? AND reviewed_at > ?
		ORDER BY reviewed_at ASC, id ASC
	`
	args := []any{userID, sinceMs}
	if limit > 0 {
		query += " LIMIT ?"
		args = append(args, limit)
	}
	rows, err := d.sql.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query reviews: %w", err)
	}
	defer rows.Close()

	out := make([]domain.Review, 0, 32)
	for rows.Next() {
		var (
			r           domain.Review
			rating      string
			stageBefore string
			stageAfter  string
		)
		if err := rows.Scan(
			&r.ID, &r.UserID, &r.CardID, &rating, &r.ReviewedAt,
			&stageBefore, &stageAfter,
			&r.IntervalDaysBefore, &r.IntervalDaysAfter,
			&r.EaseBefore, &r.EaseAfter,
		); err != nil {
			return nil, fmt.Errorf("scan review: %w", err)
		}
		r.Rating = domain.Rating(rating)
		r.StageBefore = domain.CardStage(stageBefore)
		r.StageAfter = domain.CardStage(stageAfter)
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate reviews: %w", err)
	}
	return out, nil
}
