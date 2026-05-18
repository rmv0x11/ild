package auth

import (
	"errors"
	"strings"
	"testing"
)

// TestHashPassword_RoundTrip checks that a hashed password verifies with
// CheckPassword. We also assert the hash is NOT the plaintext (catches
// any future regression where HashPassword forgets to actually hash).
func TestHashPassword_RoundTrip(t *testing.T) {
	const plain = "correct horse battery staple"

	hash, err := HashPassword(plain)
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if hash == "" {
		t.Fatal("empty hash returned")
	}
	if strings.Contains(hash, plain) {
		t.Fatalf("hash leaks plaintext: %q", hash)
	}
	if err := CheckPassword(hash, plain); err != nil {
		t.Fatalf("CheckPassword(correct): %v", err)
	}
}

// TestCheckPassword_WrongPasswordMismatch ensures wrong inputs map onto
// the sentinel ErrPasswordMismatch (and not a wrapped/unrelated error),
// because the login handler relies on errors.Is for its anti-enumeration
// branching.
func TestCheckPassword_WrongPasswordMismatch(t *testing.T) {
	hash, err := HashPassword("right-password")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	err = CheckPassword(hash, "wrong-password")
	if !errors.Is(err, ErrPasswordMismatch) {
		t.Fatalf("want ErrPasswordMismatch, got %v", err)
	}
}

// TestCheckPassword_EmptyHash treats users with no password on file
// (magic-link/OAuth accounts) as a clean mismatch. Without this guard
// CheckPassword would feed bcrypt an empty hash, returning a generic
// error that the login handler would map to 5xx.
func TestCheckPassword_EmptyHash(t *testing.T) {
	if err := CheckPassword("", "anything"); !errors.Is(err, ErrPasswordMismatch) {
		t.Fatalf("want ErrPasswordMismatch for empty hash, got %v", err)
	}
}

// TestHashPassword_EmptyRejected ensures an empty plaintext is refused
// — bcrypt itself would happily hash a zero-length input, but it makes
// for terrible UX and the handler validation already excludes it.
func TestHashPassword_EmptyRejected(t *testing.T) {
	if _, err := HashPassword(""); err == nil {
		t.Fatal("expected error on empty password")
	}
}

// TestHashPassword_DistinctSalt round-trips two hashes of the same input
// and asserts they differ. bcrypt always uses a random salt so identical
// passwords produce distinct hashes; if a future "optimisation" tried to
// memoise the hash this test would catch it.
func TestHashPassword_DistinctSalt(t *testing.T) {
	const plain = "same-input"
	a, err := HashPassword(plain)
	if err != nil {
		t.Fatalf("HashPassword a: %v", err)
	}
	b, err := HashPassword(plain)
	if err != nil {
		t.Fatalf("HashPassword b: %v", err)
	}
	if a == b {
		t.Fatal("expected different hashes for same plaintext (bcrypt salt)")
	}
}
