// Package main is the ild-server entry point.
//
// The server binds to a loopback address by design (the host shares the
// machine with VPN services that must not be disturbed). External traffic
// reaches the binary through cloudflared, never directly.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/rmv0x11/ild/server/internal/api"
	"github.com/rmv0x11/ild/server/internal/auth"
	"github.com/rmv0x11/ild/server/internal/config"
	"github.com/rmv0x11/ild/server/internal/db"
)

func main() {
	os.Exit(run())
}

// run holds the real entrypoint logic so main can defer os.Exit cleanly
// (os.Exit skips deferred functions; we need Close() etc. to run on errors).
func run() int {
	// Structured logs go to stdout; systemd journal captures and rotates.
	// We deliberately do not write to a local log file — the VPN-shared
	// host must not have ild-server competing for disk I/O.
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config load failed", "err", err)
		return 2
	}

	// VPN-neighbor guard: refuse to start if someone has overridden the
	// bind address with a public interface. Loopback only.
	if !isLoopbackAddr(cfg.Addr) {
		slog.Error("refusing to bind on non-loopback address (VPN-neighbor rule)",
			"addr", cfg.Addr)
		return 2
	}

	database, err := db.Open(cfg.DBPath)
	if err != nil {
		slog.Error("db open failed", "err", err, "path", cfg.DBPath)
		return 1
	}
	defer func() {
		if cerr := database.Close(); cerr != nil {
			slog.Error("db close failed", "err", cerr)
		}
	}()

	authSvc := auth.NewService(auth.Options{
		Store:        database,
		CookieSecret: cfg.CookieSecret,
		SecureCookie: cfg.SecureCookie,
		SessionTTL:   time.Duration(cfg.SessionTTLHours) * time.Hour,
		FrontendURL:  cfg.FrontendURL,
	})

	// Mailer choice: stdout for dev (printed magic-link URL is harmless),
	// SMTP for prod. Defaulting to stdout means a misconfigured dev box
	// never accidentally emails real users.
	var mailer auth.Mailer
	switch cfg.MailerMode {
	case "smtp":
		mailer = auth.NewSMTPMailer(auth.SMTPOptions{
			Host: cfg.SMTPHost,
			Port: cfg.SMTPPort,
			User: cfg.SMTPUser,
			Pass: cfg.SMTPPass,
			From: cfg.SMTPFrom,
		})
	case "resend":
		mailer = auth.NewResendMailer(auth.ResendOptions{
			APIKey: cfg.ResendAPIKey,
			From:   cfg.SMTPFrom,
		})
	default:
		mailer = auth.StdoutMailer{}
	}

	emailAuth := auth.NewEmailAuth(
		database, mailer, cfg.BaseURL,
		time.Duration(cfg.MagicLinkTTLMinutes)*time.Minute,
	)

	deps := api.Deps{
		DB:             database,
		Auth:           authSvc,
		Email:          emailAuth,
		EmailVerify:    authSvc.HandleEmailVerify(emailAuth),
		AllowedOrigins: cfg.AllowedOrigins,
	}

	if cfg.GoogleEnabled() {
		google := auth.NewGoogleProvider(
			cfg.GoogleClientID,
			cfg.GoogleClientSecret,
			strings.TrimRight(cfg.BaseURL, "/")+"/api/v1/auth/google/callback",
		)
		deps.GoogleStart = authSvc.HandleGoogleStart(google)
		deps.GoogleCallback = authSvc.HandleGoogleCallback(google)
	}

	router := api.NewRouter(deps)

	// http.Server with tight, conservative timeouts. These values protect
	// the VPN-shared host from slowloris and from runaway long polls.
	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    8 << 10, // 8 KiB — DOS guard.
	}

	// Background purger: every 15 minutes we sweep expired sessions out
	// of the DB. The interval is short enough that a logged-out cookie's
	// row is scrubbed quickly, but long enough not to compete with the
	// VPN host's normal load.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go runSessionPurger(ctx, database)

	slog.Info("server starting", "addr", cfg.Addr, "base_url", cfg.BaseURL,
		"mailer", cfg.MailerMode, "google_enabled", cfg.GoogleEnabled())

	errCh := make(chan error, 1)
	go func() {
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	select {
	case err := <-errCh:
		if err != nil {
			slog.Error("server error", "err", err)
			return 1
		}
	case <-ctx.Done():
		slog.Info("shutdown signal received")
	}

	// Graceful shutdown: give in-flight requests up to 10 seconds to
	// finish before we tear the listener down.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		slog.Error("graceful shutdown failed", "err", err)
	}
	slog.Info("stopped")
	return 0
}

// runSessionPurger periodically drops expired sessions. Runs until ctx is
// canceled. Errors are logged but never propagate — DB hiccups must not
// kill the server.
func runSessionPurger(ctx context.Context, database *db.DB) {
	const interval = 15 * time.Minute
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-t.C:
			purgeCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			if err := database.PurgeExpiredSessions(purgeCtx, now); err != nil {
				slog.Error("PurgeExpiredSessions failed", "err", err)
			}
			cancel()
		}
	}
}

// isLoopbackAddr ensures the configured bind address points only at the
// local interface. This is the VPN-neighbor safety net: even if someone
// sets ILD_ADDR=:8787 by mistake we refuse to start.
func isLoopbackAddr(addr string) bool {
	// Split host:port — addr may be "127.0.0.1:8787" or "[::1]:8787".
	// We strip a trailing :port and compare the host part.
	host := addr
	if i := strings.LastIndexByte(addr, ':'); i > 0 {
		host = addr[:i]
	}
	host = strings.TrimPrefix(host, "[")
	host = strings.TrimSuffix(host, "]")
	switch host {
	case "127.0.0.1", "::1", "localhost":
		return true
	default:
		return false
	}
}
