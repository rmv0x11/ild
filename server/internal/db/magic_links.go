package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/rmv0x11/ild/server/internal/domain"
)

// Magic-link sentinel errors. ConsumeMagicLink returns these to let callers
// distinguish a missing token from one that has expired or already been used.
var (
	ErrMagicLinkNotFound = errors.New("magic link: not found")
	ErrMagicLinkExpired  = errors.New("magic link: expired")
	ErrMagicLinkUsed     = errors.New("magic link: already used")
)

// CreateMagicLink stores a new one-shot login token. The caller is expected
// to hash the raw token (e.g. via SHA-256) and pass only the hash here, so a
// DB leak doesn't expose live login tokens.
func (d *DB) CreateMagicLink(ctx context.Context, ml *domain.MagicLink) error {
	if ml == nil {
		return errors.New("magic link is nil")
	}
	if ml.TokenHash == "" {
		return errors.New("magic link: token_hash required")
	}
	if ml.Email == "" {
		return errors.New("magic link: email required")
	}
	if ml.ExpiresAt == 0 {
		return errors.New("magic link: expires_at required")
	}
	_, err := d.sql.ExecContext(ctx, `
		INSERT INTO email_magic_links (token_hash, email, expires_at, used_at)
		VALUES (?, ?, ?, ?)
	`, ml.TokenHash, ml.Email, ml.ExpiresAt, ml.UsedAt)
	if err != nil {
		return fmt.Errorf("insert magic link: %w", err)
	}
	return nil
}

// ConsumeMagicLink atomically validates and marks a token as used.
// On success it returns the email associated with the token.
//
// We do this in a transaction with BEGIN IMMEDIATE-style behavior (SQLite's
// upgrade rule) so a concurrent consumer racing on the same token can't both
// "win" — the second one will see used_at != NULL.
func (d *DB) ConsumeMagicLink(ctx context.Context, tokenHash string, now time.Time) (string, error) {
	var email string
	err := d.withTx(ctx, func(tx *sql.Tx) error {
		row := tx.QueryRowContext(ctx, `
			SELECT email, expires_at, used_at
			FROM email_magic_links
			WHERE token_hash = ?
		`, tokenHash)

		var (
			expiresMs int64
			usedMs    sql.NullInt64
			gotEmail  string
		)
		if err := row.Scan(&gotEmail, &expiresMs, &usedMs); err != nil {
			if isNoRows(err) {
				return ErrMagicLinkNotFound
			}
			return fmt.Errorf("scan magic link: %w", err)
		}
		if usedMs.Valid {
			return ErrMagicLinkUsed
		}
		if expiresMs <= now.UnixMilli() {
			return ErrMagicLinkExpired
		}

		res, err := tx.ExecContext(ctx, `
			UPDATE email_magic_links SET used_at = ?
			WHERE token_hash = ? AND used_at IS NULL
		`, now.UnixMilli(), tokenHash)
		if err != nil {
			return fmt.Errorf("mark magic link used: %w", err)
		}
		n, err := res.RowsAffected()
		if err != nil {
			return fmt.Errorf("rows affected: %w", err)
		}
		if n == 0 {
			// Someone else won the race in this window.
			return ErrMagicLinkUsed
		}
		email = gotEmail
		return nil
	})
	if err != nil {
		return "", err
	}
	return email, nil
}
