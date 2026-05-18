package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/smtp"
	"strings"
	"time"

	"github.com/rmv0x11/ild/server/internal/domain"
)

// Mailer sends transactional email. The interface is intentionally minimal so
// tests can substitute a no-network fake.
type Mailer interface {
	Send(ctx context.Context, to, subject, body string) error
}

// SMTPOptions carries the credentials/config for SMTPMailer. We accept these
// via a struct (not env reads) so callers control how they are loaded.
type SMTPOptions struct {
	Host string
	Port int
	User string
	Pass string
	From string
}

// SMTPMailer is a basic PLAIN-auth SMTP client built on net/smtp.
type SMTPMailer struct {
	opts SMTPOptions
}

// NewSMTPMailer constructs a SMTPMailer.
func NewSMTPMailer(opts SMTPOptions) *SMTPMailer { return &SMTPMailer{opts: opts} }

// Send formats a minimal RFC 5322 message and submits it to the configured
// SMTP host. Context cancellation is honoured via a goroutine wrapper.
func (m *SMTPMailer) Send(ctx context.Context, to, subject, body string) error {
	addr := fmt.Sprintf("%s:%d", m.opts.Host, m.opts.Port)
	auth := smtp.PlainAuth("", m.opts.User, m.opts.Pass, m.opts.Host)
	msg := buildPlainMessage(m.opts.From, to, subject, body)

	done := make(chan error, 1)
	go func() {
		done <- smtp.SendMail(addr, auth, m.opts.From, []string{to}, msg)
	}()
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func buildPlainMessage(from, to, subject, body string) []byte {
	var b strings.Builder
	b.WriteString("From: ")
	b.WriteString(from)
	b.WriteString("\r\n")
	b.WriteString("To: ")
	b.WriteString(to)
	b.WriteString("\r\n")
	b.WriteString("Subject: ")
	b.WriteString(subject)
	b.WriteString("\r\n")
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	b.WriteString("\r\n")
	b.WriteString(body)
	return []byte(b.String())
}

// StdoutMailer prints emails to stdout. Useful for local dev (where no real
// SMTP is wired up) and for the magic-link test below.
type StdoutMailer struct{}

// Send writes a human-readable representation of the email to stdout.
func (StdoutMailer) Send(_ context.Context, to, subject, body string) error {
	fmt.Printf("---\n[mail] to=%s subject=%q\n%s\n---\n", to, subject, body)
	return nil
}

// EmailAuth holds the pieces needed to issue and verify magic-links.
type EmailAuth struct {
	store   Store
	mailer  Mailer
	baseURL string
	linkTTL time.Duration
}

// NewEmailAuth constructs an EmailAuth. baseURL must be the user-facing
// origin (e.g. "https://ild.example.com") — the verify link is built by
// appending the verify path.
func NewEmailAuth(store Store, mailer Mailer, baseURL string, ttl time.Duration) *EmailAuth {
	if ttl <= 0 {
		ttl = 15 * time.Minute
	}
	return &EmailAuth{
		store:   store,
		mailer:  mailer,
		baseURL: strings.TrimRight(baseURL, "/"),
		linkTTL: ttl,
	}
}

// LinkTTL exposes the configured link TTL (for handlers/tests).
func (e *EmailAuth) LinkTTL() time.Duration { return e.linkTTL }

// hashToken computes the sha256 hex digest of token. We store the hex digest
// in the DB so a DB leak does not reveal active links.
func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// Request generates a magic-link token, stores its hash, and emails the
// signed link. The raw token NEVER touches storage; only the sha256 of it
// goes in the magic_links table.
func (e *EmailAuth) Request(ctx context.Context, email string) error {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return fmt.Errorf("auth: empty email")
	}

	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return err
	}
	token := base64.RawURLEncoding.EncodeToString(raw[:])
	expires := time.Now().Add(e.linkTTL).Unix()

	if err := e.store.CreateMagicLink(ctx, &domain.MagicLink{
		TokenHash: hashToken(token),
		Email:     email,
		ExpiresAt: expires,
	}); err != nil {
		return err
	}

	link := fmt.Sprintf("%s/api/v1/auth/email/verify?token=%s", e.baseURL, token)
	body := "Open this link to sign in to ild:\n\n" + link + "\n\nThe link expires in " +
		e.linkTTL.Round(time.Minute).String() + ". If you did not request it, ignore this message."
	return e.mailer.Send(ctx, email, "Sign in to ild", body)
}

// Verify hashes the supplied token and atomically marks the corresponding
// magic-link as used (delegating to Store.ConsumeMagicLink). On success the
// associated email is returned; the caller can then find-or-create the user.
func (e *EmailAuth) Verify(ctx context.Context, token string) (string, error) {
	if token == "" {
		return "", fmt.Errorf("auth: empty token")
	}
	return e.store.ConsumeMagicLink(ctx, hashToken(token), time.Now())
}
