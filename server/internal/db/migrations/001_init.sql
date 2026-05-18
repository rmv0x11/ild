PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id          TEXT    PRIMARY KEY,
    email       TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_oauth (
    user_id      TEXT    NOT NULL,
    provider     TEXT    NOT NULL,
    provider_id  TEXT    NOT NULL,
    created_at   INTEGER NOT NULL,
    PRIMARY KEY (provider, provider_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_magic_links (
    token_hash  TEXT    PRIMARY KEY,
    email       TEXT    NOT NULL,
    expires_at  INTEGER NOT NULL,
    used_at     INTEGER
);
CREATE INDEX IF NOT EXISTS email_magic_links_expires ON email_magic_links(expires_at);

CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT    PRIMARY KEY,
    user_id     TEXT    NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS cards (
    id              TEXT    NOT NULL,
    user_id         TEXT    NOT NULL,
    word            TEXT    NOT NULL,
    pinyin          TEXT    NOT NULL,
    context         TEXT    NOT NULL,
    stage           TEXT    NOT NULL,
    learning_step   INTEGER NOT NULL DEFAULT 0,
    interval_days   INTEGER NOT NULL DEFAULT 0,
    ease            REAL    NOT NULL DEFAULT 2.5,
    due_at          INTEGER NOT NULL,
    reps            INTEGER NOT NULL DEFAULT 0,
    lapses          INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    deleted_at      INTEGER,
    PRIMARY KEY (id, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS cards_by_user_updated ON cards(user_id, updated_at);
CREATE INDEX IF NOT EXISTS cards_by_user_due ON cards(user_id, due_at);

CREATE TABLE IF NOT EXISTS reviews (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id               TEXT    NOT NULL,
    card_id               TEXT    NOT NULL,
    rating                TEXT    NOT NULL,
    reviewed_at           INTEGER NOT NULL,
    stage_before          TEXT    NOT NULL,
    stage_after           TEXT    NOT NULL,
    interval_days_before  INTEGER NOT NULL,
    interval_days_after   INTEGER NOT NULL,
    ease_before           REAL    NOT NULL,
    ease_after            REAL    NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS reviews_by_user_time ON reviews(user_id, reviewed_at);
