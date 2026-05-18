package db

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/rmv0x11/ild/server/internal/domain"
)

// ErrUserEmailRequired is returned by CreateUser when the email is empty.
var ErrUserEmailRequired = errors.New("user: email is required")

// CreateUser inserts u into users. If u.ID is empty we generate one;
// if u.CreatedAt is zero we set it to now (ms since epoch).
// Email is required.
//
// Username and PasswordHash are optional. An empty Username is persisted as
// SQL NULL (the partial unique index in migration 002 only fires on
// non-NULL usernames). PasswordHash is stored verbatim.
func (d *DB) CreateUser(ctx context.Context, u *domain.User) error {
	if u == nil {
		return errors.New("user is nil")
	}
	if strings.TrimSpace(u.Email) == "" {
		return ErrUserEmailRequired
	}
	if u.ID == "" {
		id, err := randomHex(16)
		if err != nil {
			return fmt.Errorf("gen user id: %w", err)
		}
		u.ID = id
	}
	if u.CreatedAt == 0 {
		u.CreatedAt = time.Now().UnixMilli()
	}
	_, err := d.sql.ExecContext(ctx, `
		INSERT INTO users (id, email, username, name, password_hash, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, u.ID, u.Email, nullableString(u.Username), u.Name, nullableString(u.PasswordHash), u.CreatedAt)
	if err != nil {
		return fmt.Errorf("insert user: %w", err)
	}
	return nil
}

// FindUserByID returns the user with the given id. When no user is found
// it returns (nil, nil), not sql.ErrNoRows — callers should treat absence
// as a normal outcome.
func (d *DB) FindUserByID(ctx context.Context, id string) (*domain.User, error) {
	return d.scanOneUser(ctx,
		`SELECT id, email, username, name, password_hash, created_at FROM users WHERE id = ?`, id)
}

// FindUserByEmail mirrors FindUserByID, looking up by unique email.
func (d *DB) FindUserByEmail(ctx context.Context, email string) (*domain.User, error) {
	return d.scanOneUser(ctx,
		`SELECT id, email, username, name, password_hash, created_at FROM users WHERE email = ?`, email)
}

// FindUserByUsername looks up the user owning username. Returns (nil, nil)
// when no row matches. Username comparison is case-sensitive — that is the
// SQLite default for TEXT columns and we want "Alice" and "alice" to be
// distinct accounts (matches typical username-pick UX).
func (d *DB) FindUserByUsername(ctx context.Context, username string) (*domain.User, error) {
	if username == "" {
		return nil, nil
	}
	return d.scanOneUser(ctx,
		`SELECT id, email, username, name, password_hash, created_at FROM users WHERE username = ?`, username)
}

// UpdateUserPasswordHash overwrites a user's password_hash. Used by the
// register handler (for a freshly-created user that needs its hash filled
// in atomically) and the future "forgot password" flow.
func (d *DB) UpdateUserPasswordHash(ctx context.Context, userID, hash string) error {
	if userID == "" {
		return errors.New("user: id required")
	}
	_, err := d.sql.ExecContext(ctx, `
		UPDATE users SET password_hash = ? WHERE id = ?
	`, nullableString(hash), userID)
	if err != nil {
		return fmt.Errorf("update password hash: %w", err)
	}
	return nil
}

// LinkOAuth associates an external provider identity with a local user.
// If link.CreatedAt is 0 we set it to now.
func (d *DB) LinkOAuth(ctx context.Context, link *domain.OAuthLink) error {
	if link == nil {
		return errors.New("link is nil")
	}
	if link.UserID == "" || link.Provider == "" || link.ProviderID == "" {
		return errors.New("oauth link: user_id/provider/provider_id required")
	}
	if link.CreatedAt == 0 {
		link.CreatedAt = time.Now().UnixMilli()
	}
	_, err := d.sql.ExecContext(ctx, `
		INSERT INTO user_oauth (user_id, provider, provider_id, created_at)
		VALUES (?, ?, ?, ?)
	`, link.UserID, link.Provider, link.ProviderID, link.CreatedAt)
	if err != nil {
		return fmt.Errorf("insert oauth: %w", err)
	}
	return nil
}

// FindUserByOAuth looks up a user via an external provider id (e.g. Google sub).
// Returns (nil, nil) if not linked.
func (d *DB) FindUserByOAuth(ctx context.Context, provider, providerID string) (*domain.User, error) {
	return d.scanOneUser(ctx, `
		SELECT u.id, u.email, u.username, u.name, u.password_hash, u.created_at
		FROM users u
		JOIN user_oauth o ON o.user_id = u.id
		WHERE o.provider = ? AND o.provider_id = ?
	`, provider, providerID)
}

// scanOneUser runs query (which MUST select the six columns in the order
// id, email, username, name, password_hash, created_at) and decodes the
// single row into a *domain.User. (nil, nil) signals "no such row".
func (d *DB) scanOneUser(ctx context.Context, query string, args ...any) (*domain.User, error) {
	row := d.sql.QueryRowContext(ctx, query, args...)
	var (
		u            domain.User
		username     sql.NullString
		passwordHash sql.NullString
	)
	err := row.Scan(&u.ID, &u.Email, &username, &u.Name, &passwordHash, &u.CreatedAt)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("scan user: %w", err)
	}
	u.Username = username.String
	u.PasswordHash = passwordHash.String
	return &u, nil
}

// nullableString converts an empty Go string to SQL NULL so that the
// partial unique index on users.username (and any future similar index)
// treats blanks as "not set" rather than "the empty string".
func nullableString(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// randomHex returns 2*n hex characters drawn from crypto/rand.
func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	const hexdigits = "0123456789abcdef"
	out := make([]byte, n*2)
	for i, x := range b {
		out[i*2] = hexdigits[x>>4]
		out[i*2+1] = hexdigits[x&0x0f]
	}
	return string(out), nil
}
