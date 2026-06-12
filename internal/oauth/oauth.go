// Package oauth implements GitHub's OAuth device flow, the browserless
// authentication path suited to a desktop app that ships no backend and
// cannot safely hold a client secret.
package oauth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const defaultBaseURL = "https://github.com"

// clientIDEnv overrides the build-time client ID, which is convenient during
// development before any build flags are wired up.
const clientIDEnv = "OCTORADAR_CLIENT_ID"

// BuildClientID is the OAuth app's client ID, injected at build time via
//
//	-ldflags "-X github.com/tnagatomi/octoradar/internal/oauth.BuildClientID=<id>"
//
// A device flow client ID is not a secret, so shipping it in the binary is
// safe.
var BuildClientID string

// ClientID returns the OAuth app client ID, preferring the OCTORADAR_CLIENT_ID
// environment variable over the build-time value. It errors when neither is
// set, since the device flow cannot start without one.
func ClientID() (string, error) {
	if v := os.Getenv(clientIDEnv); v != "" {
		return v, nil
	}
	if BuildClientID != "" {
		return BuildClientID, nil
	}
	return "", errors.New("no OAuth client ID configured; set " + clientIDEnv + " or build with -ldflags -X")
}

// Client performs the GitHub device flow for a single OAuth app.
type Client struct {
	httpClient *http.Client
	baseURL    string
	clientID   string
	// after waits for d or until ctx is cancelled, returning ctx.Err() on
	// cancellation. It is a field so tests can wait instantly.
	after func(ctx context.Context, d time.Duration) error
}

// NewClient returns a device-flow client for the given OAuth app client ID.
func NewClient(clientID string) *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 15 * time.Second},
		baseURL:    defaultBaseURL,
		clientID:   clientID,
		after:      sleep,
	}
}

// sleep waits for d or until ctx is cancelled.
func sleep(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

// DeviceCode is the response to a device authorization request. The user
// enters UserCode at VerificationURI to grant access while the app polls
// for a token using DeviceCode, no more often than Interval seconds and no
// longer than ExpiresIn seconds.
type DeviceCode struct {
	DeviceCode      string
	UserCode        string
	VerificationURI string
	ExpiresIn       int
	Interval        int
}

// RequestDeviceCode starts the device flow, returning the codes the user
// and the app need to complete authorization.
func (c *Client) RequestDeviceCode(ctx context.Context) (*DeviceCode, error) {
	form := url.Values{"client_id": {c.clientID}}
	var body struct {
		DeviceCode       string `json:"device_code"`
		UserCode         string `json:"user_code"`
		VerificationURI  string `json:"verification_uri"`
		ExpiresIn        int    `json:"expires_in"`
		Interval         int    `json:"interval"`
		Error            string `json:"error"`
		ErrorDescription string `json:"error_description"`
	}
	if err := c.postForm(ctx, "/login/device/code", form, &body); err != nil {
		return nil, err
	}
	if body.Error != "" {
		return nil, fmt.Errorf("device code request failed: %s", errorMessage(body.Error, body.ErrorDescription))
	}
	return &DeviceCode{
		DeviceCode:      body.DeviceCode,
		UserCode:        body.UserCode,
		VerificationURI: body.VerificationURI,
		ExpiresIn:       body.ExpiresIn,
		Interval:        body.Interval,
	}, nil
}

const grantTypeDeviceCode = "urn:ietf:params:oauth:grant-type:device_code"

// PollAccessToken blocks until the user authorizes the device and returns
// the resulting user access token, or fails if authorization is denied, the
// code expires, or ctx is cancelled. It honors the server's polling
// interval, backing off further whenever the server asks it to slow down.
func (c *Client) PollAccessToken(ctx context.Context, dc *DeviceCode) (string, error) {
	interval := time.Duration(max(dc.Interval, 1)) * time.Second
	remaining := time.Duration(dc.ExpiresIn) * time.Second
	for {
		token, slowDown, err := c.pollOnce(ctx, dc.DeviceCode)
		if err != nil {
			return "", err
		}
		if token != "" {
			return token, nil
		}
		if slowDown {
			interval += 5 * time.Second
		}
		if remaining <= 0 {
			return "", fmt.Errorf("device authorization timed out")
		}
		if err := c.after(ctx, interval); err != nil {
			return "", err
		}
		remaining -= interval
	}
}

// pollOnce performs one token-exchange request. A non-empty token means
// authorization succeeded. A nil error with an empty token means the user
// has not finished authorizing yet; slowDown is true when the server asked
// the caller to back off and lengthen its polling interval. A non-nil error
// is terminal and polling must stop.
func (c *Client) pollOnce(ctx context.Context, deviceCode string) (token string, slowDown bool, err error) {
	form := url.Values{
		"client_id":   {c.clientID},
		"device_code": {deviceCode},
		"grant_type":  {grantTypeDeviceCode},
	}
	var body struct {
		AccessToken      string `json:"access_token"`
		Error            string `json:"error"`
		ErrorDescription string `json:"error_description"`
	}
	if err := c.postForm(ctx, "/login/oauth/access_token", form, &body); err != nil {
		return "", false, err
	}
	switch {
	case body.AccessToken != "":
		return body.AccessToken, false, nil
	case body.Error == "authorization_pending":
		return "", false, nil
	case body.Error == "slow_down":
		return "", true, nil
	default:
		return "", false, fmt.Errorf("device authorization failed: %s", errorMessage(body.Error, body.ErrorDescription))
	}
}

// errorMessage prefers GitHub's human-readable description over the error
// code when both are present.
func errorMessage(code, description string) string {
	if description != "" {
		return description
	}
	return code
}

// postForm sends a form-encoded POST to the device flow host and decodes the
// JSON response into out.
func (c *Client) postForm(ctx context.Context, path string, form url.Values, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status %s", resp.Status)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
