-- 002_password_auth.sql
--
-- Add username + password-hash columns to users so that the new
-- /api/v1/auth/register and /api/v1/auth/login flows can store credentials
-- alongside the existing magic-link and Google OAuth identities. Both
-- columns are nullable: a magic-link or OAuth user need not pick a username
-- and never has a password hash on file.

ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;

-- Username uniqueness is enforced only when one is set. A partial unique
-- index lets us keep historical NULL rows without forcing them to share a
-- bogus "no username" sentinel.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique
    ON users(username)
    WHERE username IS NOT NULL;
