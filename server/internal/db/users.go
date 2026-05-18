package db

import (
	"context"
	"crypto/rand"
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
		INSERT INTO users (id, email, name, created_at)
		VALUES (?, ?, ?, ?)
	`, u.ID, u.Email, u.Name, u.CreatedAt)
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
		`SELECT id, email, name, created_at FROM users WHERE id = ?`, id)
}

// FindUserByEmail mirrors FindUserByID, looking up by unique email.
func (d *DB) FindUserByEmail(ctx context.Context, email string) (*domain.User, error) {
	return d.scanOneUser(ctx,
		`SELECT id, email, name, created_at FROM users WHERE email = ?`, email)
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
		SELECT u.id, u.email, u.name, u.created_at
		FROM users u
		JOIN user_oauth o ON o.user_id = u.id
		WHERE o.provider = ? AND o.provider_id = ?
	`, provider, providerID)
}

func (d *DB) scanOneUser(ctx context.Context, query string, args ...any) (*domain.User, error) {
	row := d.sql.QueryRowContext(ctx, query, args...)
	var u domain.User
	err := row.Scan(&u.ID, &u.Email, &u.Name, &u.CreatedAt)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("scan user: %w", err)
	}
	return &u, nil
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

