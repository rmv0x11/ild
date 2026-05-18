package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	googleAuthURL     = "https://accounts.google.com/o/oauth2/v2/auth"
	googleTokenURL    = "https://oauth2.googleapis.com/token"
	googleUserinfoURL = "https://www.googleapis.com/oauth2/v2/userinfo"
	googleScope       = "openid email profile"
)

// GoogleProvider configures the Google OAuth 2.0 web flow. We deliberately
// avoid golang.org/x/oauth2 to keep the dependency footprint at zero
// third-party imports (see project policy).
type GoogleProvider struct {
	clientID     string
	clientSecret string
	redirectURL  string

	// httpClient is overridable for tests.
	httpClient *http.Client
}

// NewGoogleProvider constructs a GoogleProvider. clientID/clientSecret can be
// empty if Google login is disabled — callers should check
// (g.Enabled) before mounting routes.
func NewGoogleProvider(clientID, clientSecret, redirectURL string) *GoogleProvider {
	return &GoogleProvider{
		clientID:     clientID,
		clientSecret: clientSecret,
		redirectURL:  redirectURL,
		httpClient:   &http.Client{Timeout: 10 * time.Second},
	}
}

// Enabled reports whether Google login is configured (non-empty credentials).
func (g *GoogleProvider) Enabled() bool {
	return g.clientID != "" && g.clientSecret != "" && g.redirectURL != ""
}

// RedirectURL returns the configured redirect URL (used by handlers/tests).
func (g *GoogleProvider) RedirectURL() string { return g.redirectURL }

// AuthURL builds the consent-page URL the browser should be redirected to.
func (g *GoogleProvider) AuthURL(state string) string {
	q := url.Values{}
	q.Set("client_id", g.clientID)
	q.Set("redirect_uri", g.redirectURL)
	q.Set("response_type", "code")
	q.Set("scope", googleScope)
	q.Set("state", state)
	q.Set("access_type", "online")
	q.Set("prompt", "consent")
	return googleAuthURL + "?" + q.Encode()
}

// GoogleUser is the trimmed Google userinfo payload we care about.
type GoogleUser struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

type googleTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
	Scope       string `json:"scope"`
	IDToken     string `json:"id_token"`
}

// Exchange swaps an authorization code for an access token and then fetches
// the user's basic profile. It returns a typed error so handlers can map to
// a 4xx vs 5xx response.
func (g *GoogleProvider) Exchange(ctx context.Context, code string) (*GoogleUser, error) {
	if !g.Enabled() {
		return nil, errors.New("auth: google provider not configured")
	}
	if code == "" {
		return nil, errors.New("auth: empty authorization code")
	}

	form := url.Values{}
	form.Set("code", code)
	form.Set("client_id", g.clientID)
	form.Set("client_secret", g.clientSecret)
	form.Set("redirect_uri", g.redirectURL)
	form.Set("grant_type", "authorization_code")

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, googleTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := g.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("auth: token request: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("auth: token endpoint returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var tok googleTokenResponse
	if err := json.Unmarshal(body, &tok); err != nil {
		return nil, fmt.Errorf("auth: decode token: %w", err)
	}
	if tok.AccessToken == "" {
		return nil, errors.New("auth: token response missing access_token")
	}

	uReq, err := http.NewRequestWithContext(ctx, http.MethodGet, googleUserinfoURL, nil)
	if err != nil {
		return nil, err
	}
	uReq.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	uReq.Header.Set("Accept", "application/json")

	uResp, err := g.httpClient.Do(uReq)
	if err != nil {
		return nil, fmt.Errorf("auth: userinfo request: %w", err)
	}
	defer uResp.Body.Close()
	uBody, _ := io.ReadAll(io.LimitReader(uResp.Body, 1<<16))
	if uResp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("auth: userinfo endpoint returned %d: %s", uResp.StatusCode, strings.TrimSpace(string(uBody)))
	}
	var gu GoogleUser
	if err := json.Unmarshal(uBody, &gu); err != nil {
		return nil, fmt.Errorf("auth: decode userinfo: %w", err)
	}
	if gu.ID == "" || gu.Email == "" {
		return nil, errors.New("auth: userinfo missing id or email")
	}
	return &gu, nil
}
