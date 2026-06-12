package main

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"sync"

	"github.com/tnagatomi/octoradar/internal/config"
	"github.com/tnagatomi/octoradar/internal/feed"
	"github.com/tnagatomi/octoradar/internal/github"
	"github.com/tnagatomi/octoradar/internal/oauth"
)

// App exposes backend operations to the frontend.
type App struct {
	ctx context.Context

	mu  sync.Mutex
	cfg *config.Config
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{cfg: &config.Config{}}
}

// startup is called when the app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if cfg, err := config.Load(); err == nil {
		a.cfg = cfg
	}
}

// Settings is the configuration view exposed to the frontend. The token
// itself never crosses the bridge.
type Settings struct {
	HasToken bool     `json:"hasToken"`
	Users    []string `json:"users"`
}

// GetSettings returns the current settings.
func (a *App) GetSettings() Settings {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.settingsLocked()
}

func (a *App) settingsLocked() Settings {
	users := slices.Clone(a.cfg.Users)
	if users == nil {
		users = []string{}
	}
	return Settings{
		HasToken: a.cfg.Token != "",
		Users:    users,
	}
}

// validateAndSaveToken confirms the token works by resolving the viewer,
// then persists it and returns the authenticated user's login. It is the
// final step of the device flow, after polling yields a token.
func (a *App) validateAndSaveToken(token string) (string, error) {
	login, err := github.NewClient(token).Viewer(a.ctx)
	if err != nil {
		return "", fmt.Errorf("token validation failed: %w", err)
	}

	a.mu.Lock()
	defer a.mu.Unlock()
	a.cfg.Token = token
	if err := a.cfg.Save(); err != nil {
		return "", err
	}
	return login, nil
}

// DeviceLogin is the device flow prompt shown to the user. The user visits
// VerificationURI and enters UserCode; DeviceCode is opaque and passed back
// to CompleteDeviceLogin unchanged.
type DeviceLogin struct {
	UserCode        string `json:"userCode"`
	VerificationURI string `json:"verificationUri"`
	DeviceCode      string `json:"deviceCode"`
	ExpiresIn       int    `json:"expiresIn"`
	Interval        int    `json:"interval"`
}

// StartDeviceLogin begins the OAuth device flow and returns the codes the
// user needs to authorize the app in their browser.
func (a *App) StartDeviceLogin() (DeviceLogin, error) {
	clientID, err := oauth.ClientID()
	if err != nil {
		return DeviceLogin{}, err
	}
	dc, err := oauth.NewClient(clientID).RequestDeviceCode(a.ctx)
	if err != nil {
		return DeviceLogin{}, err
	}
	return DeviceLogin{
		UserCode:        dc.UserCode,
		VerificationURI: dc.VerificationURI,
		DeviceCode:      dc.DeviceCode,
		ExpiresIn:       dc.ExpiresIn,
		Interval:        dc.Interval,
	}, nil
}

// CompleteDeviceLogin blocks until the user authorizes the device, then
// validates and persists the resulting token and returns the login. The
// frontend calls it with the values from StartDeviceLogin.
func (a *App) CompleteDeviceLogin(deviceCode string, interval, expiresIn int) (string, error) {
	clientID, err := oauth.ClientID()
	if err != nil {
		return "", err
	}
	token, err := oauth.NewClient(clientID).PollAccessToken(a.ctx, &oauth.DeviceCode{
		DeviceCode: deviceCode,
		Interval:   interval,
		ExpiresIn:  expiresIn,
	})
	if err != nil {
		return "", err
	}
	return a.validateAndSaveToken(token)
}

// maxUsers caps the followed user list. Every refresh fans out one events
// request per user plus one search request per six users, so 50 keeps a
// burst of refreshes within the search API limit (30 requests/min) and the
// secondary concurrency limit.
const maxUsers = 50

// normalizeUsername trims surrounding whitespace and an optional leading "@"
// so the same login reaches both AddUser and FetchUserFeed unchanged.
func normalizeUsername(username string) string {
	return strings.TrimPrefix(strings.TrimSpace(username), "@")
}

// AddUser verifies the username exists and adds it to the followed list.
func (a *App) AddUser(username string) (Settings, error) {
	username = normalizeUsername(username)
	if username == "" {
		return a.GetSettings(), fmt.Errorf("username is empty")
	}

	a.mu.Lock()
	token := a.cfg.Token
	count := len(a.cfg.Users)
	exists := slices.ContainsFunc(a.cfg.Users, func(u string) bool {
		return strings.EqualFold(u, username)
	})
	a.mu.Unlock()
	if exists {
		return a.GetSettings(), fmt.Errorf("%s is already followed", username)
	}
	if count >= maxUsers {
		return a.GetSettings(), fmt.Errorf("you can follow up to %d users", maxUsers)
	}
	if err := github.NewClient(token).UserExists(a.ctx, username); err != nil {
		return a.GetSettings(), fmt.Errorf("user %s not found: %w", username, err)
	}

	a.mu.Lock()
	defer a.mu.Unlock()
	a.cfg.Users = append(a.cfg.Users, username)
	slices.Sort(a.cfg.Users)
	if err := a.cfg.Save(); err != nil {
		return a.settingsLocked(), err
	}
	return a.settingsLocked(), nil
}

// RemoveUser drops the username from the followed list.
func (a *App) RemoveUser(username string) (Settings, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.cfg.Users = slices.DeleteFunc(a.cfg.Users, func(u string) bool {
		return strings.EqualFold(u, username)
	})
	if err := a.cfg.Save(); err != nil {
		return a.settingsLocked(), err
	}
	return a.settingsLocked(), nil
}

// FetchFeed fetches and merges the latest events of all followed users.
func (a *App) FetchFeed() feed.Result {
	a.mu.Lock()
	token := a.cfg.Token
	users := slices.Clone(a.cfg.Users)
	a.mu.Unlock()

	return feed.Fetch(a.ctx, github.NewClient(token), users)
}

// FetchUserFeed fetches the latest events for a single user. The frontend
// merges the result into the existing feed when a user is added, so adding a
// user costs a single events request instead of a full refresh across
// everyone. Merged pull requests are intentionally skipped here to spare the
// scarce search API quota; the next full FetchFeed surfaces them.
func (a *App) FetchUserFeed(username string) feed.Result {
	username = normalizeUsername(username)
	a.mu.Lock()
	token := a.cfg.Token
	a.mu.Unlock()

	return feed.FetchEvents(a.ctx, github.NewClient(token), []string{username})
}
