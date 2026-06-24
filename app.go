package main

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"sync"

	"github.com/tnagatomi/octoradar/internal/config"
	"github.com/tnagatomi/octoradar/internal/discover"
	"github.com/tnagatomi/octoradar/internal/feed"
	"github.com/tnagatomi/octoradar/internal/github"
	"github.com/tnagatomi/octoradar/internal/notifications"
	"github.com/tnagatomi/octoradar/internal/oauth"
)

// App exposes backend operations to the frontend.
type App struct {
	ctx context.Context

	mu  sync.Mutex
	cfg *config.Config
	// cancelLogin stops the in-progress device login poll, if any. It is set
	// while CompleteDeviceLogin is waiting and cleared when it returns.
	cancelLogin context.CancelFunc

	// notifMu guards notif and serializes reaction polls so an interval poll
	// and a manual refresh cannot interleave. It is separate from mu so a slow
	// poll's network I/O does not block settings operations.
	notifMu sync.Mutex
	notif   *notifications.State
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{cfg: &config.Config{}, notif: &notifications.State{}}
}

// startup is called when the app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if cfg, err := config.Load(); err == nil {
		a.cfg = cfg
	}
	if st, err := notifications.Load(); err == nil {
		a.notif = st
	}
}

// Settings is the configuration view exposed to the frontend. The token
// itself never crosses the bridge.
type Settings struct {
	HasToken bool     `json:"hasToken"`
	Login    string   `json:"login"`
	Users    []string `json:"users"`
	// MaxUsers is the cap on the follow list, surfaced so the UI can show the
	// remaining slots (e.g. "21/50") without duplicating the constant.
	MaxUsers int `json:"maxUsers"`
}

// Version returns the application version shown in the UI.
func (a *App) Version() string {
	return version
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
		Login:    a.cfg.Login,
		Users:    users,
		MaxUsers: maxUsers,
	}
}

// SignOut clears the stored token and login, removing the keychain entry, so
// the app returns to the signed-out state. The follow list is kept so it is
// restored after the next sign in.
func (a *App) SignOut() (Settings, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.cfg.Token = ""
	a.cfg.Login = ""
	if err := a.cfg.Save(); err != nil {
		return a.settingsLocked(), err
	}
	return a.settingsLocked(), nil
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
	a.cfg.Login = login
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

	ctx, cancel := context.WithCancel(a.ctx)
	a.mu.Lock()
	a.cancelLogin = cancel
	a.mu.Unlock()
	defer func() {
		a.mu.Lock()
		a.cancelLogin = nil
		a.mu.Unlock()
		cancel()
	}()

	token, err := oauth.NewClient(clientID).PollAccessToken(ctx, &oauth.DeviceCode{
		DeviceCode: deviceCode,
		Interval:   interval,
		ExpiresIn:  expiresIn,
	})
	if err != nil {
		return "", err
	}
	return a.validateAndSaveToken(token)
}

// CancelDeviceLogin stops an in-progress device login poll, if any, so the
// backend stops waiting once the user backs out of the sign-in screen.
func (a *App) CancelDeviceLogin() {
	a.mu.Lock()
	cancel := a.cancelLogin
	a.mu.Unlock()
	if cancel != nil {
		cancel()
	}
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

// AddUsers adds several usernames to the followed list in one shot, used by
// the "Import from GitHub" flow. Unlike AddUser it skips the per-user
// existence check: the names come straight from the viewer's GitHub following
// list, so they are known to exist, and verifying each would waste a request.
// Names are normalized and de-duplicated case-insensitively against the
// current list and one another. The whole batch is rejected if it would push
// the list past maxUsers; the frontend blocks this beforehand, so reaching it
// signals a desync rather than ordinary input.
func (a *App) AddUsers(usernames []string) (Settings, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	seen := make(map[string]struct{}, len(a.cfg.Users))
	for _, u := range a.cfg.Users {
		seen[strings.ToLower(u)] = struct{}{}
	}
	var toAdd []string
	for _, u := range usernames {
		u = normalizeUsername(u)
		if u == "" {
			continue
		}
		key := strings.ToLower(u)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		toAdd = append(toAdd, u)
	}
	if len(toAdd) == 0 {
		return a.settingsLocked(), nil
	}
	if len(a.cfg.Users)+len(toAdd) > maxUsers {
		return a.settingsLocked(), fmt.Errorf("you can follow up to %d users", maxUsers)
	}

	a.cfg.Users = append(a.cfg.Users, toAdd...)
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

// PollReactions scans the user's repositories for new stars and forks and
// returns the current reaction list with the unread tally. The frontend calls
// it on an interval and on manual refresh; the result is persisted so the list
// and unread count survive restarts.
func (a *App) PollReactions() notifications.Result {
	a.mu.Lock()
	token := a.cfg.Token
	a.mu.Unlock()

	a.notifMu.Lock()
	defer a.notifMu.Unlock()
	client := github.NewClient(token)
	res := notifications.Poll(a.ctx, client, a.notif)
	// Surface GitHub's requested poll cadence so the frontend can slow down
	// when the activity API asks it to under load.
	if iv := client.PollIntervalSeconds(); iv > 0 {
		res.MinPollIntervalSec = iv
	}
	if err := a.notif.Save(); err != nil {
		res.Errors = append(res.Errors, fmt.Sprintf("saving reactions: %v", err))
	}
	return res
}

// MarkReactionsRead marks every reaction as seen, clearing the unread badge.
// The frontend calls it when the Reactions tab is opened.
func (a *App) MarkReactionsRead() {
	a.notifMu.Lock()
	defer a.notifMu.Unlock()
	notifications.MarkRead(a.notif)
	_ = a.notif.Save()
}

// FollowingAccount is one GitHub account the viewer follows, as shown in the
// import picker.
type FollowingAccount struct {
	Login     string `json:"login"`
	AvatarURL string `json:"avatarUrl"`
}

// FollowingResult is the import picker's view of the viewer's GitHub following.
// Truncated reports that the safety valve stopped the fetch short; Errors and
// Unauthorized mirror feed.Result so a partial or failed fetch degrades the
// same way the feed does.
type FollowingResult struct {
	Accounts     []FollowingAccount `json:"accounts"`
	Truncated    bool               `json:"truncated"`
	Errors       []string           `json:"errors"`
	Unauthorized bool               `json:"unauthorized"`
}

// FetchGitHubFollowing returns the accounts the authenticated user follows on
// GitHub, for the import picker. A partial fetch still returns whatever was
// gathered alongside an error; a 401 sets Unauthorized so the UI can prompt a
// re-auth instead of showing a raw error.
func (a *App) FetchGitHubFollowing() FollowingResult {
	a.mu.Lock()
	token := a.cfg.Token
	a.mu.Unlock()

	accounts, truncated, err := github.NewClient(token).Following(a.ctx)
	res := FollowingResult{Truncated: truncated, Accounts: []FollowingAccount{}, Errors: []string{}}
	for _, acc := range accounts {
		res.Accounts = append(res.Accounts, FollowingAccount{Login: acc.Login, AvatarURL: acc.AvatarURL})
	}
	if err != nil {
		if github.IsUnauthorized(err) {
			res.Unauthorized = true
		} else {
			res.Errors = append(res.Errors, err.Error())
		}
	}
	return res
}

// FetchTrending retrieves trending repositories for the given period and
// language. period is "week", "month", or "quarter"; an empty language spans
// all languages. Unlike the feed, no user list is needed: trending is global.
func (a *App) FetchTrending(period string, language string) discover.Result {
	a.mu.Lock()
	token := a.cfg.Token
	a.mu.Unlock()

	return discover.Fetch(a.ctx, github.NewClient(token), period, language)
}
