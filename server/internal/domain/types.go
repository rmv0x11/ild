// Package domain defines the shared types used across the storage,
// authentication and HTTP layers. The JSON tags must stay in sync with the
// TypeScript domain (src/types/domain.ts) in the client, since the API
// transports these as-is.
package domain

import "time"

// CardStage mirrors the TypeScript CardStage literal union.
type CardStage string

const (
	StageNew        CardStage = "new"
	StageLearning   CardStage = "learning"
	StageYoung      CardStage = "young"
	StageMature     CardStage = "mature"
	StageRelearning CardStage = "relearning"
)

// Rating mirrors the TypeScript Rating literal union.
type Rating string

const (
	RatingAgain Rating = "again"
	RatingHard  Rating = "hard"
	RatingGood  Rating = "good"
	RatingEasy  Rating = "easy"
)

// Card is a single study item synced between client and server.
// UpdatedAt is the high-watermark used for incremental sync;
// DeletedAt (when non-nil) marks tombstones the server keeps for sync.
type Card struct {
	ID           string    `json:"id"`
	UserID       string    `json:"-"`
	Word         string    `json:"word"`
	// Lang is the study language ('zh' | 'ko'). Cards synced from a client that
	// predates multi-language arrive empty and are stored as 'zh'.
	Lang         string    `json:"lang"`
	Pinyin       string    `json:"pinyin"`
	Context      string    `json:"context"`
	Stage        CardStage `json:"stage"`
	LearningStep int       `json:"learningStep"`
	IntervalDays int       `json:"intervalDays"`
	Ease         float64   `json:"ease"`
	DueAt        int64     `json:"dueAt"`
	Reps         int       `json:"reps"`
	Lapses       int       `json:"lapses"`
	CreatedAt    int64     `json:"createdAt"`
	UpdatedAt    int64     `json:"updatedAt"`
	DeletedAt    *int64    `json:"deletedAt,omitempty"`
}

// Review is an append-only log entry for one rating action.
type Review struct {
	ID                 int64     `json:"id,omitempty"`
	UserID             string    `json:"-"`
	CardID             string    `json:"cardId"`
	Rating             Rating    `json:"rating"`
	ReviewedAt         int64     `json:"reviewedAt"`
	StageBefore        CardStage `json:"stageBefore"`
	StageAfter         CardStage `json:"stageAfter"`
	IntervalDaysBefore int       `json:"intervalDaysBefore"`
	IntervalDaysAfter  int       `json:"intervalDaysAfter"`
	EaseBefore         float64   `json:"easeBefore"`
	EaseAfter          float64   `json:"easeAfter"`
}

// User represents an authenticated account.
//
// Username and PasswordHash were added with the username+password
// registration flow (migration 002_password_auth.sql). They are optional:
// magic-link and OAuth users have no password on file and most do not
// claim a username. PasswordHash carries `json:"-"` so the bcrypt digest
// never leaks through any API response — every handler can safely splat
// the User into JSON.
type User struct {
	ID           string `json:"id"`
	Email        string `json:"email"`
	Username     string `json:"username,omitempty"`
	Name         string `json:"name,omitempty"`
	PasswordHash string `json:"-"`
	CreatedAt    int64  `json:"createdAt"`
}

// Session is a server-side bearer record; the cookie carries the (HMAC-signed) ID.
type Session struct {
	ID        string
	UserID    string
	CreatedAt time.Time
	ExpiresAt time.Time
}

// OAuthLink ties an external identity provider to a local user.
type OAuthLink struct {
	UserID     string
	Provider   string
	ProviderID string
	CreatedAt  int64
}

// MagicLink is a one-shot email-login token.
type MagicLink struct {
	TokenHash string
	Email     string
	ExpiresAt int64
	UsedAt    *int64
}
