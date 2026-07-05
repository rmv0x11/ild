package db

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/rmv0x11/ild/server/internal/domain"
)

// newTestDB opens a fresh on-disk SQLite under t.TempDir(). Using a file
// (instead of :memory:) keeps WAL behaviour realistic and avoids the
// shared-cache quirks of in-memory SQLite.
func newTestDB(t *testing.T) *DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	d, err := Open(path)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = d.Close() })
	return d
}

func newUser(t *testing.T, d *DB, email string) *domain.User {
	t.Helper()
	u := &domain.User{Email: email, Name: "u-" + email}
	if err := d.CreateUser(context.Background(), u); err != nil {
		t.Fatalf("create user: %v", err)
	}
	if u.ID == "" {
		t.Fatalf("user id should be generated")
	}
	return u
}

func TestOpen_RunsMigrationsIdempotent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "x.db")
	d1, err := Open(path)
	if err != nil {
		t.Fatalf("first open: %v", err)
	}
	_ = d1.Close()

	d2, err := Open(path)
	if err != nil {
		t.Fatalf("second open (idempotent migrate): %v", err)
	}
	t.Cleanup(func() { _ = d2.Close() })

	var n int
	if err := d2.SQL().QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&n); err != nil {
		t.Fatalf("count migrations: %v", err)
	}
	if n == 0 {
		t.Fatalf("expected at least one migration applied")
	}
}

func TestCreateUser_GeneratesIDAndCreatedAt(t *testing.T) {
	d := newTestDB(t)
	u := &domain.User{Email: "a@b.c"}
	if err := d.CreateUser(context.Background(), u); err != nil {
		t.Fatalf("create: %v", err)
	}
	if u.ID == "" {
		t.Fatalf("expected ID to be filled")
	}
	if u.CreatedAt == 0 {
		t.Fatalf("expected CreatedAt to be filled")
	}
}

func TestCreateUser_EmailRequired(t *testing.T) {
	d := newTestDB(t)
	err := d.CreateUser(context.Background(), &domain.User{Email: ""})
	if !errors.Is(err, ErrUserEmailRequired) {
		t.Fatalf("want ErrUserEmailRequired, got %v", err)
	}
}

func TestFindUserByID_AndByEmail(t *testing.T) {
	d := newTestDB(t)
	u := newUser(t, d, "alice@example.com")

	got, err := d.FindUserByID(context.Background(), u.ID)
	if err != nil {
		t.Fatalf("by id: %v", err)
	}
	if got == nil || got.Email != "alice@example.com" {
		t.Fatalf("by id wrong: %+v", got)
	}

	got2, err := d.FindUserByEmail(context.Background(), "alice@example.com")
	if err != nil {
		t.Fatalf("by email: %v", err)
	}
	if got2 == nil || got2.ID != u.ID {
		t.Fatalf("by email wrong: %+v", got2)
	}

	miss, err := d.FindUserByID(context.Background(), "does-not-exist")
	if err != nil {
		t.Fatalf("by id miss returned error: %v", err)
	}
	if miss != nil {
		t.Fatalf("expected nil for missing user")
	}
}

// TestMigration002_AddsUsernamePasswordColumns asserts the schema has the
// columns introduced in 002_password_auth.sql. Reading PRAGMA table_info
// keeps the test independent of how we query users elsewhere.
func TestMigration002_AddsUsernamePasswordColumns(t *testing.T) {
	d := newTestDB(t)
	rows, err := d.SQL().Query(`PRAGMA table_info(users)`)
	if err != nil {
		t.Fatalf("table_info: %v", err)
	}
	defer rows.Close()
	cols := map[string]bool{}
	for rows.Next() {
		var (
			cid          int
			name, ctype  string
			notnull, pk  int
			defaultVal   any
		)
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &defaultVal, &pk); err != nil {
			t.Fatalf("scan: %v", err)
		}
		cols[name] = true
	}
	for _, want := range []string{"id", "email", "username", "name", "password_hash", "created_at"} {
		if !cols[want] {
			t.Fatalf("column %q missing after migrations; got %v", want, cols)
		}
	}
}

// TestCreateUser_PersistsUsernameAndPasswordHash covers the new round-trip
// through the insert path: a freshly-created user with both new fields
// should be readable back via every Find* method.
func TestCreateUser_PersistsUsernameAndPasswordHash(t *testing.T) {
	d := newTestDB(t)
	u := &domain.User{
		Email:        "pw@example.com",
		Username:     "pwuser",
		PasswordHash: "$2a$12$abcdefghijklmnopqrstuvwxyzABCDEF0123456789ABCD",
		Name:         "PW User",
	}
	if err := d.CreateUser(context.Background(), u); err != nil {
		t.Fatalf("create: %v", err)
	}

	got, err := d.FindUserByID(context.Background(), u.ID)
	if err != nil || got == nil {
		t.Fatalf("by id: got=%v err=%v", got, err)
	}
	if got.Username != "pwuser" || got.PasswordHash != u.PasswordHash {
		t.Fatalf("round-trip mismatch: %+v", got)
	}

	gotByEmail, err := d.FindUserByEmail(context.Background(), "pw@example.com")
	if err != nil || gotByEmail == nil {
		t.Fatalf("by email: %v / %+v", err, gotByEmail)
	}
	if gotByEmail.Username != "pwuser" || gotByEmail.PasswordHash != u.PasswordHash {
		t.Fatalf("by-email round-trip mismatch: %+v", gotByEmail)
	}

	gotByUsername, err := d.FindUserByUsername(context.Background(), "pwuser")
	if err != nil || gotByUsername == nil {
		t.Fatalf("by username: %v / %+v", err, gotByUsername)
	}
	if gotByUsername.ID != u.ID {
		t.Fatalf("by-username wrong user: %+v", gotByUsername)
	}
}

// TestCreateUser_EmptyUsernameStaysNull verifies the legacy magic-link /
// OAuth path (Username == "") inserts a SQL NULL — the partial unique
// index would otherwise reject multiple username-less rows.
func TestCreateUser_EmptyUsernameStaysNull(t *testing.T) {
	d := newTestDB(t)
	if err := d.CreateUser(context.Background(), &domain.User{Email: "a@nu.l"}); err != nil {
		t.Fatalf("first: %v", err)
	}
	if err := d.CreateUser(context.Background(), &domain.User{Email: "b@nu.l"}); err != nil {
		t.Fatalf("second: %v", err)
	}
	var nulls int
	if err := d.SQL().QueryRow(`SELECT COUNT(*) FROM users WHERE username IS NULL`).Scan(&nulls); err != nil {
		t.Fatalf("count: %v", err)
	}
	if nulls != 2 {
		t.Fatalf("expected 2 users with NULL username, got %d", nulls)
	}
}

// TestFindUserByUsername_CaseSensitive ensures lookups discriminate between
// "Alice" and "alice" — both are stored as distinct usernames and only an
// exact match returns the row.
func TestFindUserByUsername_CaseSensitive(t *testing.T) {
	d := newTestDB(t)
	u := &domain.User{Email: "case@x.y", Username: "Alice"}
	if err := d.CreateUser(context.Background(), u); err != nil {
		t.Fatalf("create: %v", err)
	}

	if got, _ := d.FindUserByUsername(context.Background(), "Alice"); got == nil || got.ID != u.ID {
		t.Fatalf("expected hit for exact case: %+v", got)
	}
	if got, _ := d.FindUserByUsername(context.Background(), "alice"); got != nil {
		t.Fatalf("expected miss for lowercase: %+v", got)
	}
	if got, _ := d.FindUserByUsername(context.Background(), ""); got != nil {
		t.Fatalf("empty username should return nil, got %+v", got)
	}
}

// TestUpdateUserPasswordHash_WritesAndReads asserts UpdateUserPasswordHash
// is visible to subsequent reads. The future password-reset flow depends
// on this; the register flow already uses CreateUser to persist the hash.
func TestUpdateUserPasswordHash_WritesAndReads(t *testing.T) {
	d := newTestDB(t)
	u := &domain.User{Email: "upd@x.y", Username: "updateme"}
	if err := d.CreateUser(context.Background(), u); err != nil {
		t.Fatalf("create: %v", err)
	}
	if err := d.UpdateUserPasswordHash(context.Background(), u.ID, "$2a$12$some-new-hash"); err != nil {
		t.Fatalf("update: %v", err)
	}
	got, _ := d.FindUserByID(context.Background(), u.ID)
	if got == nil || got.PasswordHash != "$2a$12$some-new-hash" {
		t.Fatalf("expected updated hash, got %+v", got)
	}
}

// TestCreateUser_UsernameUniqueViolation ensures the partial unique index
// rejects a second user trying to take an already-used username.
func TestCreateUser_UsernameUniqueViolation(t *testing.T) {
	d := newTestDB(t)
	if err := d.CreateUser(context.Background(), &domain.User{Email: "a@u.x", Username: "shared"}); err != nil {
		t.Fatalf("first: %v", err)
	}
	err := d.CreateUser(context.Background(), &domain.User{Email: "b@u.x", Username: "shared"})
	if err == nil {
		t.Fatal("expected unique-constraint error on duplicate username")
	}
}

func TestLinkOAuth_AndFindUserByOAuth(t *testing.T) {
	d := newTestDB(t)
	u := newUser(t, d, "ouser@example.com")

	if err := d.LinkOAuth(context.Background(), &domain.OAuthLink{
		UserID:     u.ID,
		Provider:   "google",
		ProviderID: "google-sub-123",
	}); err != nil {
		t.Fatalf("link oauth: %v", err)
	}

	found, err := d.FindUserByOAuth(context.Background(), "google", "google-sub-123")
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if found == nil || found.ID != u.ID {
		t.Fatalf("wrong oauth lookup: %+v", found)
	}

	miss, err := d.FindUserByOAuth(context.Background(), "google", "nope")
	if err != nil {
		t.Fatalf("miss err: %v", err)
	}
	if miss != nil {
		t.Fatalf("expected nil for unknown oauth")
	}
}

func TestCreateSession_AndFindSession(t *testing.T) {
	d := newTestDB(t)
	u := newUser(t, d, "s@s.s")

	sess, err := d.CreateSession(context.Background(), u.ID, time.Hour)
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	if len(sess.ID) != 64 {
		t.Fatalf("expected 64-char hex session id, got %d", len(sess.ID))
	}

	got, err := d.FindSession(context.Background(), sess.ID)
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if got == nil || got.UserID != u.ID {
		t.Fatalf("wrong session: %+v", got)
	}

	if err := d.DeleteSession(context.Background(), sess.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	after, err := d.FindSession(context.Background(), sess.ID)
	if err != nil {
		t.Fatalf("find after delete: %v", err)
	}
	if after != nil {
		t.Fatalf("expected nil after delete")
	}
}

func TestFindSession_ExpiredReturnsNilNil(t *testing.T) {
	d := newTestDB(t)
	u := newUser(t, d, "exp@e.e")

	// Use a tiny TTL so it's already expired by the time we look.
	sess, err := d.CreateSession(context.Background(), u.ID, time.Millisecond)
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	time.Sleep(10 * time.Millisecond)
	got, err := d.FindSession(context.Background(), sess.ID)
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil for expired session")
	}
}

func TestPurgeExpiredSessions(t *testing.T) {
	d := newTestDB(t)
	u := newUser(t, d, "purge@p.p")

	old, _ := d.CreateSession(context.Background(), u.ID, time.Millisecond)
	fresh, _ := d.CreateSession(context.Background(), u.ID, time.Hour)
	time.Sleep(10 * time.Millisecond)

	if err := d.PurgeExpiredSessions(context.Background(), time.Now()); err != nil {
		t.Fatalf("purge: %v", err)
	}

	var c int
	if err := d.SQL().QueryRow(`SELECT COUNT(*) FROM sessions WHERE id = ?`, old.ID).Scan(&c); err != nil {
		t.Fatalf("count old: %v", err)
	}
	if c != 0 {
		t.Fatalf("expected old session purged")
	}
	if err := d.SQL().QueryRow(`SELECT COUNT(*) FROM sessions WHERE id = ?`, fresh.ID).Scan(&c); err != nil {
		t.Fatalf("count fresh: %v", err)
	}
	if c != 1 {
		t.Fatalf("expected fresh session intact, count=%d", c)
	}
}

func TestMagicLink_HappyPath(t *testing.T) {
	d := newTestDB(t)
	now := time.Now()
	ml := &domain.MagicLink{
		TokenHash: "hash-abc",
		Email:     "ml@l.l",
		ExpiresAt: now.Add(15 * time.Minute).UnixMilli(),
	}
	if err := d.CreateMagicLink(context.Background(), ml); err != nil {
		t.Fatalf("create: %v", err)
	}
	email, err := d.ConsumeMagicLink(context.Background(), "hash-abc", now)
	if err != nil {
		t.Fatalf("consume: %v", err)
	}
	if email != "ml@l.l" {
		t.Fatalf("got email %q", email)
	}
}

func TestMagicLink_ExpiredAndUsedAndMissing(t *testing.T) {
	d := newTestDB(t)
	now := time.Now()

	// Expired
	exp := &domain.MagicLink{
		TokenHash: "exp",
		Email:     "x@e.e",
		ExpiresAt: now.Add(-time.Minute).UnixMilli(),
	}
	if err := d.CreateMagicLink(context.Background(), exp); err != nil {
		t.Fatalf("create exp: %v", err)
	}
	if _, err := d.ConsumeMagicLink(context.Background(), "exp", now); !errors.Is(err, ErrMagicLinkExpired) {
		t.Fatalf("want expired, got %v", err)
	}

	// Used: consume once, then again.
	live := &domain.MagicLink{
		TokenHash: "live",
		Email:     "u@e.e",
		ExpiresAt: now.Add(time.Hour).UnixMilli(),
	}
	if err := d.CreateMagicLink(context.Background(), live); err != nil {
		t.Fatalf("create live: %v", err)
	}
	if _, err := d.ConsumeMagicLink(context.Background(), "live", now); err != nil {
		t.Fatalf("first consume: %v", err)
	}
	if _, err := d.ConsumeMagicLink(context.Background(), "live", now); !errors.Is(err, ErrMagicLinkUsed) {
		t.Fatalf("want used, got %v", err)
	}

	// Missing
	if _, err := d.ConsumeMagicLink(context.Background(), "nope", now); !errors.Is(err, ErrMagicLinkNotFound) {
		t.Fatalf("want not found, got %v", err)
	}
}

func makeCard(userID, id string, updatedAt int64) domain.Card {
	return domain.Card{
		ID:           id,
		UserID:       userID,
		Word:         "你好",
		Pinyin:       "nǐ hǎo",
		Context:      "hello",
		Stage:        domain.StageNew,
		LearningStep: 0,
		IntervalDays: 0,
		Ease:         2.5,
		DueAt:        updatedAt,
		Reps:         0,
		Lapses:       0,
		CreatedAt:    updatedAt,
		UpdatedAt:    updatedAt,
	}
}

func TestUpsertCard_LastWriteWins(t *testing.T) {
	d := newTestDB(t)
	u := newUser(t, d, "card@c.c")

	c := makeCard(u.ID, "card-1", 1000)
	c.Word = "v1"
	if err := d.UpsertCard(context.Background(), &c); err != nil {
		t.Fatalf("first upsert: %v", err)
	}

	// Newer write wins.
	c2 := makeCard(u.ID, "card-1", 2000)
	c2.Word = "v2"
	if err := d.UpsertCard(context.Background(), &c2); err != nil {
		t.Fatalf("second upsert: %v", err)
	}

	got, err := d.ListCardsSince(context.Background(), u.ID, 0, 0)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 1 || got[0].Word != "v2" {
		t.Fatalf("expected v2, got %+v", got)
	}

	// Stale write is silently skipped.
	stale := makeCard(u.ID, "card-1", 500)
	stale.Word = "stale"
	if err := d.UpsertCard(context.Background(), &stale); err != nil {
		t.Fatalf("stale upsert: %v", err)
	}
	got2, _ := d.ListCardsSince(context.Background(), u.ID, 0, 0)
	if got2[0].Word != "v2" {
		t.Fatalf("expected v2 to survive stale write, got %s", got2[0].Word)
	}
}

func TestUpsertCard_PersistsLangAndDefaultsToZh(t *testing.T) {
	d := newTestDB(t)
	u := newUser(t, d, "lang@l.l")

	ko := makeCard(u.ID, "ko-1", 1000)
	ko.Lang = "ko"
	if err := d.UpsertCard(context.Background(), &ko); err != nil {
		t.Fatalf("upsert ko: %v", err)
	}
	// A card from a client that predates multi-language arrives with empty lang.
	legacy := makeCard(u.ID, "legacy-1", 1000)
	legacy.Lang = ""
	if err := d.UpsertCard(context.Background(), &legacy); err != nil {
		t.Fatalf("upsert legacy: %v", err)
	}

	got, err := d.ListCardsSince(context.Background(), u.ID, 0, 0)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	byID := map[string]domain.Card{}
	for _, c := range got {
		byID[c.ID] = c
	}
	if byID["ko-1"].Lang != "ko" {
		t.Fatalf("expected lang=ko, got %q", byID["ko-1"].Lang)
	}
	if byID["legacy-1"].Lang != "zh" {
		t.Fatalf("expected empty lang to default to zh, got %q", byID["legacy-1"].Lang)
	}
}

func TestBulkUpsertCards_AndListCardsSince(t *testing.T) {
	d := newTestDB(t)
	u := newUser(t, d, "bulk@b.b")

	cards := []domain.Card{
		makeCard(u.ID, "a", 100),
		makeCard(u.ID, "b", 200),
		makeCard(u.ID, "c", 300),
	}
	n, err := d.BulkUpsertCards(context.Background(), u.ID, cards)
	if err != nil {
		t.Fatalf("bulk: %v", err)
	}
	if n != 3 {
		t.Fatalf("expected 3 applied, got %d", n)
	}

	got, err := d.ListCardsSince(context.Background(), u.ID, 150, 0)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 after sinceMs=150, got %d", len(got))
	}
	if got[0].ID != "b" || got[1].ID != "c" {
		t.Fatalf("wrong order: %s,%s", got[0].ID, got[1].ID)
	}
}

func TestSoftDeleteCard_ListIncludesTombstones(t *testing.T) {
	d := newTestDB(t)
	u := newUser(t, d, "tomb@t.t")

	c := makeCard(u.ID, "k", 1000)
	if err := d.UpsertCard(context.Background(), &c); err != nil {
		t.Fatalf("upsert: %v", err)
	}

	if err := d.SoftDeleteCard(context.Background(), u.ID, "k", 5000); err != nil {
		t.Fatalf("soft delete: %v", err)
	}

	got, err := d.ListCardsSince(context.Background(), u.ID, 0, 0)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1, got %d", len(got))
	}
	if got[0].DeletedAt == nil || *got[0].DeletedAt != 5000 {
		t.Fatalf("expected DeletedAt=5000, got %v", got[0].DeletedAt)
	}
	if got[0].UpdatedAt != 5000 {
		t.Fatalf("expected UpdatedAt bumped to 5000, got %d", got[0].UpdatedAt)
	}
}

func TestInsertReview_AndListReviewsSince(t *testing.T) {
	d := newTestDB(t)
	u := newUser(t, d, "rev@r.r")

	r := &domain.Review{
		UserID:             u.ID,
		CardID:             "c-1",
		Rating:             domain.RatingGood,
		ReviewedAt:         1000,
		StageBefore:        domain.StageNew,
		StageAfter:         domain.StageLearning,
		IntervalDaysBefore: 0,
		IntervalDaysAfter:  0,
		EaseBefore:         2.5,
		EaseAfter:          2.5,
	}
	if err := d.InsertReview(context.Background(), r); err != nil {
		t.Fatalf("insert: %v", err)
	}
	if r.ID == 0 {
		t.Fatalf("expected ID to be set")
	}

	more := []domain.Review{
		{CardID: "c-1", Rating: domain.RatingHard, ReviewedAt: 2000,
			StageBefore: domain.StageLearning, StageAfter: domain.StageLearning,
			EaseBefore: 2.5, EaseAfter: 2.35},
		{CardID: "c-1", Rating: domain.RatingGood, ReviewedAt: 3000,
			StageBefore: domain.StageLearning, StageAfter: domain.StageYoung,
			EaseBefore: 2.35, EaseAfter: 2.35},
	}
	if err := d.BulkInsertReviews(context.Background(), u.ID, more); err != nil {
		t.Fatalf("bulk insert: %v", err)
	}
	for i, mr := range more {
		if mr.ID == 0 {
			t.Fatalf("bulk review %d: expected ID set", i)
		}
		if mr.UserID != u.ID {
			t.Fatalf("bulk review %d: expected UserID filled", i)
		}
	}

	got, err := d.ListReviewsSince(context.Background(), u.ID, 1000, 0)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 reviews after sinceMs=1000, got %d", len(got))
	}
	if got[0].ReviewedAt != 2000 || got[1].ReviewedAt != 3000 {
		t.Fatalf("wrong order: %d, %d", got[0].ReviewedAt, got[1].ReviewedAt)
	}
	if got[0].Rating != domain.RatingHard {
		t.Fatalf("expected Hard, got %s", got[0].Rating)
	}
}

func TestListReviewsSince_Limit(t *testing.T) {
	d := newTestDB(t)
	u := newUser(t, d, "lim@l.l")

	reviews := []domain.Review{
		{CardID: "c", Rating: domain.RatingGood, ReviewedAt: 1,
			StageBefore: domain.StageNew, StageAfter: domain.StageNew},
		{CardID: "c", Rating: domain.RatingGood, ReviewedAt: 2,
			StageBefore: domain.StageNew, StageAfter: domain.StageNew},
		{CardID: "c", Rating: domain.RatingGood, ReviewedAt: 3,
			StageBefore: domain.StageNew, StageAfter: domain.StageNew},
	}
	if err := d.BulkInsertReviews(context.Background(), u.ID, reviews); err != nil {
		t.Fatalf("bulk: %v", err)
	}
	got, err := d.ListReviewsSince(context.Background(), u.ID, 0, 2)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 with limit, got %d", len(got))
	}
}
