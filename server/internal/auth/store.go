// Package auth provides session, OAuth (Google) and email-magic-link
// authentication helpers used by the HTTP layer. It depends on the database
// layer only through the Store interface, so tests can substitute an
// in-memory fake without pulling in SQLite.
package auth

import (
	"context"
	"time"

	"github.com/rmv0x11/ild/server/internal/domain"
)

// Store is the subset of *db.DB methods the auth package needs. Defined as an
// interface here so that *db.DB satisfies it structurally and unit tests can
// supply a mock implementation.
type Store interface {
	CreateUser(ctx context.Context, u *domain.User) error
	FindUserByID(ctx context.Context, id string) (*domain.User, error)
	FindUserByEmail(ctx context.Context, email string) (*domain.User, error)
	FindUserByUsername(ctx context.Context, username string) (*domain.User, error)
	UpdateUserPasswordHash(ctx context.Context, userID, hash string) error

	LinkOAuth(ctx context.Context, link *domain.OAuthLink) error
	FindUserByOAuth(ctx context.Context, provider, providerID string) (*domain.User, error)

	CreateSession(ctx context.Context, userID string, ttl time.Duration) (*domain.Session, error)
	FindSession(ctx context.Context, id string) (*domain.Session, error)
	DeleteSession(ctx context.Context, id string) error

	CreateMagicLink(ctx context.Context, link *domain.MagicLink) error
	ConsumeMagicLink(ctx context.Context, tokenHash string, now time.Time) (email string, err error)
}
