-- Per-card study language for multi-language support (Chinese + Korean).
-- Every row created before this predates the field and is Chinese, so the
-- column defaults to 'zh'. Clients send 'zh' | 'ko' on push from now on.
ALTER TABLE cards ADD COLUMN lang TEXT NOT NULL DEFAULT 'zh';
