package auth

import (
	"errors"
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

// passwordCost is the bcrypt work factor. 12 is the current sweet spot for
// 2026-era CPUs: noticeably slow for offline attackers (≈250ms on the kind
// of cheap VPS this runs on) without making sign-in feel sluggish. We keep
// it as a constant rather than a config knob because the cost is encoded
// in the resulting hash — old hashes verify with whatever cost they were
// produced at, so changing this value never breaks existing users.
const passwordCost = 12

// ErrPasswordMismatch is the sentinel returned by CheckPassword when the
// supplied plaintext does not match the stored hash. The login handler
// uses this to choose between a generic 401 and a 5xx (for a real
// underlying error). Wrap-safe via errors.Is.
var ErrPasswordMismatch = errors.New("auth: password mismatch")

// HashPassword bcrypt-hashes plain at cost passwordCost. Returns the
// printable hash string ($2a$… or $2b$…) suitable for storage in the
// users.password_hash column.
//
// Note: bcrypt silently truncates inputs longer than 72 bytes. The
// register handler enforces an upper bound of 200 chars before calling
// here, so practically every byte of the user's input contributes to the
// hash — we never silently throw bytes away.
func HashPassword(plain string) (string, error) {
	if plain == "" {
		return "", errors.New("auth: empty password")
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(plain), passwordCost)
	if err != nil {
		return "", fmt.Errorf("bcrypt hash: %w", err)
	}
	return string(hashed), nil
}

// CheckPassword verifies that plain matches hash. Returns nil on a match,
// ErrPasswordMismatch on a clean mismatch, or a wrapped error for any
// other failure (malformed hash, etc.). bcrypt is constant-time on its
// own so callers do not need additional protections.
func CheckPassword(hash, plain string) error {
	if hash == "" {
		// Treat "no hash on file" the same as a wrong password so callers
		// do not have to special-case OAuth/magic-link users that never
		// set a password.
		return ErrPasswordMismatch
	}
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain))
	if err == nil {
		return nil
	}
	if errors.Is(err, bcrypt.ErrMismatchedHashAndPassword) {
		return ErrPasswordMismatch
	}
	return fmt.Errorf("bcrypt compare: %w", err)
}
