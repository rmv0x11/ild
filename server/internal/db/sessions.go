package db

import (
	"context"
	"fmt"
	"time"

	"github.com/rmv0x11/ild/server/internal/domain"
)

// CreateSession issues a new session for userID, valid for ttl. The session id
// is 32 random bytes hex-encoded (64 chars) — enough entropy that we don't
// need a separate signing layer for the cookie value, though the auth layer
// is free to sign it on top.
func (d *DB) CreateSession(ctx context.Context, userID string, ttl time.Duration) (*domain.Session, error) {
	if userID == "" {
		return nil, fmt.Errorf("session: userID required")
	}
	if ttl <= 0 {
		return nil, fmt.Errorf("session: ttl must be positive")
	}
	id, err := randomHex(32)
	if err != nil {
		return nil, fmt.Errorf("gen session id: %w", err)
	}
	now := time.Now().UTC()
	expires := now.Add(ttl)
	_, err = d.sql.ExecContext(ctx, `
		INSERT INTO sessions (id, user_id, created_at, expires_at)
		VALUES (?, ?, ?, ?)
	`, id, userID, now.UnixMilli(), expires.UnixMilli())
	if err != nil {
		return nil, fmt.Errorf("insert session: %w", err)
	}
	return &domain.Session{
		ID:        id,
		UserID:    userID,
		CreatedAt: now,
		ExpiresAt: expires,
	}, nil
}

// FindSession returns the session with id. If the session has expired (per
// expires_at vs the wall clock), or doesn't exist, we return (nil, nil).
// Expired sessions are NOT deleted here — PurgeExpiredSessions handles that.
func (d *DB) FindSession(ctx context.Context, id string) (*domain.Session, error) {
	row := d.sql.QueryRowContext(ctx, `
		SELECT id, user_id, created_at, expires_at FROM sessions WHERE id = ?
	`, id)
	var (
		s            domain.Session
		createdMs    int64
		expiresMs    int64
	)
	if err := row.Scan(&s.ID, &s.UserID, &createdMs, &expiresMs); err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("scan session: %w", err)
	}
	s.CreatedAt = time.UnixMilli(createdMs).UTC()
	s.ExpiresAt = time.UnixMilli(expiresMs).UTC()
	if !time.Now().Before(s.ExpiresAt) {
		// Expired — treat as not found.
		return nil, nil
	}
	return &s, nil
}

// DeleteSession removes the session by id (logout). Missing is not an error.
func (d *DB) DeleteSession(ctx context.Context, id string) error {
	_, err := d.sql.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

// PurgeExpiredSessions deletes all sessions whose expires_at is at or before
// the provided now. Intended for a periodic cron.
func (d *DB) PurgeExpiredSessions(ctx context.Context, now time.Time) error {
	_, err := d.sql.ExecContext(ctx,
		`DELETE FROM sessions WHERE expires_at <= ?`,
		now.UnixMilli(),
	)
	if err != nil {
		return fmt.Errorf("purge sessions: %w", err)
	}
	return nil
}
