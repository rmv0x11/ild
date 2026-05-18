// Package db is the only place that talks to SQLite.
//
// The driver is the pure-Go modernc.org/sqlite, so no CGO toolchain is needed
// on the build host or the deploy box. We embed migrations into the binary
// (no runtime dependency on a migrations directory on disk) and apply them in
// lexicographic order, tracking applied files in schema_migrations.
package db

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// DB is a thin wrapper around *sql.DB. Domain methods live in sibling files
// (users.go, sessions.go, magic_links.go, cards.go, reviews.go).
type DB struct {
	sql *sql.DB
}

// Open opens (or creates) a SQLite database at the given path and runs all
// pending migrations from the embedded migrations FS. The connection string
// turns on foreign keys and WAL via _pragma so it applies on every conn the
// pool opens.
//
// path can be a regular filesystem path or ":memory:".
func Open(path string) (*DB, error) {
	dsn := buildDSN(path)
	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	// SQLite, even in WAL, doesn't love many concurrent writers. Keeping the
	// pool small avoids "database is locked" while still allowing some
	// parallelism for readers.
	sqlDB.SetMaxOpenConns(8)
	sqlDB.SetMaxIdleConns(4)
	sqlDB.SetConnMaxIdleTime(5 * time.Minute)

	if err := sqlDB.PingContext(context.Background()); err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}

	d := &DB{sql: sqlDB}
	if err := d.migrate(context.Background()); err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return d, nil
}

// Close closes the underlying *sql.DB.
func (d *DB) Close() error {
	if d == nil || d.sql == nil {
		return nil
	}
	return d.sql.Close()
}

// SQL exposes the raw *sql.DB. Kept for internal package code only — callers
// outside this package should use the domain methods.
func (d *DB) SQL() *sql.DB { return d.sql }

// buildDSN assembles a modernc.org/sqlite DSN. Pragmas are repeated; the
// driver re-applies them on every connection. busy_timeout helps avoid
// transient locks during concurrent writers.
func buildDSN(path string) string {
	if path == ":memory:" {
		// Shared in-memory cache so the connection pool sees the same DB.
		return "file::memory:?cache=shared&_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=busy_timeout(5000)"
	}
	q := url.Values{}
	q.Add("_pragma", "foreign_keys(1)")
	q.Add("_pragma", "journal_mode(WAL)")
	q.Add("_pragma", "synchronous(NORMAL)")
	q.Add("_pragma", "busy_timeout(5000)")
	return "file:" + path + "?" + q.Encode()
}

// migrate runs every *.sql file under migrations/ in lexicographic order.
// Each file runs inside one transaction; we record its filename in
// schema_migrations so re-runs are a no-op.
func (d *DB) migrate(ctx context.Context) error {
	_, err := d.sql.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name       TEXT    PRIMARY KEY,
			applied_at INTEGER NOT NULL
		)
	`)
	if err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	entries, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("read embedded migrations: %w", err)
	}

	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		names = append(names, e.Name())
	}
	sort.Strings(names)

	for _, name := range names {
		applied, err := d.migrationApplied(ctx, name)
		if err != nil {
			return err
		}
		if applied {
			continue
		}

		body, err := fs.ReadFile(migrationsFS, "migrations/"+name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}

		if err := d.runMigration(ctx, name, string(body)); err != nil {
			return fmt.Errorf("apply %s: %w", name, err)
		}
	}
	return nil
}

func (d *DB) migrationApplied(ctx context.Context, name string) (bool, error) {
	var n int
	err := d.sql.QueryRowContext(ctx,
		`SELECT COUNT(1) FROM schema_migrations WHERE name = ?`, name,
	).Scan(&n)
	if err != nil {
		return false, fmt.Errorf("check migration %s: %w", name, err)
	}
	return n > 0, nil
}

// runMigration executes one .sql file. SQLite cannot run several statements
// via sql.Exec in some drivers; modernc.org/sqlite does support it, but
// PRAGMA statements aren't allowed inside transactions. So we split the file
// into statements, run PRAGMAs outside the transaction, and run everything
// else inside one transaction.
func (d *DB) runMigration(ctx context.Context, name, body string) error {
	stmts := splitSQL(body)

	tx, err := d.sql.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	for _, s := range stmts {
		trimmed := strings.TrimSpace(s)
		if trimmed == "" {
			continue
		}
		upper := strings.ToUpper(trimmed)
		if strings.HasPrefix(upper, "PRAGMA") {
			// PRAGMA must run on the actual connection, not inside the tx.
			// The DSN already sets the pragmas we care about; ignore here.
			continue
		}
		if _, err := tx.ExecContext(ctx, trimmed); err != nil {
			return fmt.Errorf("exec stmt in %s: %w (sql=%q)", name, err, snippet(trimmed))
		}
	}

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)`,
		name, time.Now().UnixMilli(),
	); err != nil {
		return fmt.Errorf("record migration %s: %w", name, err)
	}

	if err := tx.Commit(); err != nil {
		return err
	}
	committed = true
	return nil
}

// splitSQL splits a SQL script into individual statements on top-level
// semicolons. It's deliberately simple — sufficient for our hand-written
// migrations which don't contain string-literal semicolons or triggers.
func splitSQL(body string) []string {
	var (
		out []string
		buf strings.Builder
	)
	for _, r := range body {
		if r == ';' {
			out = append(out, buf.String())
			buf.Reset()
			continue
		}
		buf.WriteRune(r)
	}
	if strings.TrimSpace(buf.String()) != "" {
		out = append(out, buf.String())
	}
	return out
}

func snippet(s string) string {
	const max = 80
	s = strings.ReplaceAll(s, "\n", " ")
	if len(s) > max {
		return s[:max] + "..."
	}
	return s
}

// withTx runs fn inside a transaction, committing on success and rolling
// back on error or panic.
func (d *DB) withTx(ctx context.Context, fn func(*sql.Tx) error) (err error) {
	tx, err := d.sql.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback()
			panic(p)
		}
		if err != nil {
			_ = tx.Rollback()
			return
		}
		err = tx.Commit()
	}()
	return fn(tx)
}

// isNoRows reports whether err is the "no row" sentinel from database/sql.
func isNoRows(err error) bool { return errors.Is(err, sql.ErrNoRows) }
