// Package config loads runtime configuration from environment variables.
//
// All HTTP-server settings, secrets, and feature toggles live here. The
// VPN-neighbor constraint is enforced by defaulting Addr to 127.0.0.1 so the
// server never listens on a public interface unless the operator explicitly
// overrides it.
package config

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Config holds all environment-driven settings used by the server. Every
// field is populated from an env var by Load; defaults are applied when the
// env var is empty.
type Config struct {
	// Addr is the bind address. Defaults to 127.0.0.1:8787 to comply with the
	// VPN-neighbor constraint: we never bind on 0.0.0.0.
	Addr string

	// DBPath is the on-disk SQLite filename.
	DBPath string

	// BaseURL is the externally reachable base for building OAuth redirect
	// URIs and magic-link URLs.
	BaseURL string

	// CookieSecret is the HMAC key used to sign session cookies. Must be at
	// least 32 bytes after base64 decoding. Provided via env (base64) so
	// sessions survive restarts — we deliberately refuse to autogenerate it.
	CookieSecret []byte

	// SecureCookie sets the Secure flag on the session cookie. Required when
	// the site is served over HTTPS.
	SecureCookie bool

	// SessionTTLHours controls how long an authenticated session lasts. 30
	// days default matches the "browser remembers me" expectation.
	SessionTTLHours int

	// GoogleClientID/Secret enable Google OAuth when both are non-empty.
	GoogleClientID     string
	GoogleClientSecret string

	// SMTP settings for outgoing magic-link emails when MailerMode == "smtp".
	SMTPHost string
	SMTPPort int
	SMTPUser string
	SMTPPass string
	SMTPFrom string

	// ResendAPIKey is the Bearer token for Resend's HTTP API (mailer=resend).
	// Used in preference to SMTP because most VPS providers block outbound 587.
	ResendAPIKey string

	// MailerMode is "stdout", "smtp" or "resend".
	// - stdout: print magic-link to journald (local dev / no real delivery)
	// - smtp:   classic net/smtp PLAIN auth (requires outbound 587/465)
	// - resend: POST to Resend HTTP API on 443 (recommended for VPS hosts)
	MailerMode string

	// MagicLinkTTLMinutes bounds the validity of a magic-link token.
	MagicLinkTTLMinutes int

	// AllowedOrigins is the CORS allowlist (e.g. the SPA origin in dev).
	AllowedOrigins []string

	// FrontendURL is the absolute origin (+ optional basename) of the SPA we
	// redirect users to after sign-in. e.g. "https://rmv0x11.github.io/ild".
	// Empty value falls back to a relative redirect on the API origin (default
	// behaviour, which only works when the SPA is on the same host).
	FrontendURL string
}

// GoogleEnabled reports whether Google OAuth is configured.
func (c *Config) GoogleEnabled() bool {
	return c.GoogleClientID != "" && c.GoogleClientSecret != ""
}

// Load reads configuration from the process environment, applies defaults,
// and validates required fields. It returns a concrete *Config or an error
// describing the first invalid/missing setting.
func Load() (*Config, error) {
	cfg := &Config{
		Addr:                getenv("ILD_ADDR", "127.0.0.1:8787"),
		DBPath:              getenv("ILD_DB_PATH", "data/ild.db"),
		BaseURL:             getenv("ILD_BASE_URL", "http://localhost:8787"),
		SecureCookie:        getenvBool("ILD_SECURE_COOKIE", false),
		SessionTTLHours:     getenvInt("ILD_SESSION_TTL_HOURS", 720),
		GoogleClientID:      os.Getenv("ILD_GOOGLE_CLIENT_ID"),
		GoogleClientSecret:  os.Getenv("ILD_GOOGLE_CLIENT_SECRET"),
		SMTPHost:            os.Getenv("ILD_SMTP_HOST"),
		SMTPPort:            getenvInt("ILD_SMTP_PORT", 587),
		SMTPUser:            os.Getenv("ILD_SMTP_USER"),
		SMTPPass:            os.Getenv("ILD_SMTP_PASS"),
		SMTPFrom:            os.Getenv("ILD_SMTP_FROM"),
		ResendAPIKey:        os.Getenv("ILD_RESEND_API_KEY"),
		MailerMode:          getenv("ILD_MAILER_MODE", "stdout"),
		FrontendURL:         os.Getenv("ILD_FRONTEND_URL"),
		MagicLinkTTLMinutes: getenvInt("ILD_MAGIC_LINK_TTL_MINUTES", 15),
		AllowedOrigins:      splitCSV(os.Getenv("ILD_ALLOWED_ORIGINS")),
	}

	// CookieSecret is base64-encoded so binary keys survive env-var transport.
	secretRaw := os.Getenv("ILD_COOKIE_SECRET")
	if secretRaw == "" {
		// We deliberately refuse to autogenerate: restarting would invalidate
		// every active session, which is worse than failing fast at boot.
		return nil, errors.New("config: ILD_COOKIE_SECRET is required (base64-encoded, >=32 bytes)")
	}
	decoded, err := base64.StdEncoding.DecodeString(secretRaw)
	if err != nil {
		// Allow raw bytes too — operators sometimes paste hex/text rather
		// than base64. We still enforce the 32-byte minimum below.
		decoded = []byte(secretRaw)
	}
	if len(decoded) < 32 {
		return nil, fmt.Errorf("config: ILD_COOKIE_SECRET must be >=32 bytes, got %d", len(decoded))
	}
	cfg.CookieSecret = decoded

	if cfg.BaseURL == "" {
		return nil, errors.New("config: ILD_BASE_URL is required")
	}

	// Google is optional, but the two values must be set together: a client
	// ID without a secret would crash the callback handler at request time.
	switch {
	case cfg.GoogleClientID != "" && cfg.GoogleClientSecret == "":
		return nil, errors.New("config: ILD_GOOGLE_CLIENT_SECRET is required when ILD_GOOGLE_CLIENT_ID is set")
	case cfg.GoogleClientID == "" && cfg.GoogleClientSecret != "":
		return nil, errors.New("config: ILD_GOOGLE_CLIENT_ID is required when ILD_GOOGLE_CLIENT_SECRET is set")
	}

	switch cfg.MailerMode {
	case "smtp", "stdout":
	case "resend":
		if cfg.ResendAPIKey == "" {
			return nil, errors.New("config: ILD_RESEND_API_KEY is required when ILD_MAILER_MODE=resend")
		}
		if cfg.SMTPFrom == "" {
			return nil, errors.New("config: ILD_SMTP_FROM is required (used as From: address) when ILD_MAILER_MODE=resend")
		}
	default:
		return nil, fmt.Errorf("config: ILD_MAILER_MODE must be 'stdout', 'smtp' or 'resend', got %q", cfg.MailerMode)
	}

	return cfg, nil
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getenvInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func getenvBool(key string, def bool) bool {
	v := strings.ToLower(os.Getenv(key))
	switch v {
	case "":
		return def
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return def
	}
}

// splitCSV parses a comma-separated list and trims whitespace, dropping
// empty entries. Returns nil for an empty input so callers can range freely.
func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := parts[:0]
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
