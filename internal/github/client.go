// Package github provides a minimal GitHub REST API client focused on
// activity events.
package github

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const baseURL = "https://api.github.com"

// APIError is a non-success response from the GitHub API. It carries the
// status code so callers can react to specific failures, most notably a
// 401 that means the token must be re-entered.
type APIError struct {
	StatusCode int
	Status     string
	// Message is a human-readable explanation, preferring the API's own
	// "message" field, with a friendlier override for common statuses.
	Message string
}

func (e *APIError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return e.Status
}

// IsUnauthorized reports whether err is a 401 response from the API, which
// means the token is missing, invalid, or expired.
func IsUnauthorized(err error) bool {
	var apiErr *APIError
	return errors.As(err, &apiErr) && apiErr.StatusCode == http.StatusUnauthorized
}

// Client is a minimal GitHub REST API client. An empty token results in
// unauthenticated requests, which are subject to much lower rate limits.
type Client struct {
	httpClient *http.Client
	token      string
	// baseURL is the API root. It defaults to the public API and is only
	// overridden in tests to point at a local server.
	baseURL string
}

// NewClient returns a client that authenticates with the given token.
func NewClient(token string) *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 15 * time.Second},
		token:      token,
		baseURL:    baseURL,
	}
}

// Event is a GitHub activity event. Payload is kept raw because its
// structure differs per event type.
type Event struct {
	ID        string          `json:"id"`
	Type      string          `json:"type"`
	Actor     Actor           `json:"actor"`
	Repo      Repo            `json:"repo"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt time.Time       `json:"created_at"`
}

// Actor is the user who performed an event.
type Actor struct {
	Login     string `json:"login"`
	AvatarURL string `json:"avatar_url"`
}

// Repo is the repository an event occurred in.
type Repo struct {
	Name string `json:"name"`
}

// UserEvents returns the most recent public events performed by a user.
// It fetches the API maximum per page because the feed layer filters out
// most event types.
func (c *Client) UserEvents(ctx context.Context, username string) ([]Event, error) {
	var events []Event
	path := fmt.Sprintf("/users/%s/events?per_page=100", url.PathEscape(username))
	if err := c.get(ctx, path, &events); err != nil {
		return nil, err
	}
	return events, nil
}

// MergedPullRequest is a pull request authored by a user that has been
// merged.
type MergedPullRequest struct {
	ID           int64
	Number       int
	Title        string
	HTMLURL      string
	RepoName     string
	AuthorLogin  string
	AuthorAvatar string
	MergedAt     time.Time
}

// MergedPullRequests returns recently active merged pull requests authored
// by any of the users. Authors are batched into as few search queries as
// the API limits allow. The search API is used because the events API only
// carries merges performed by the user, not merges of the user's pull
// requests done by others.
func (c *Client) MergedPullRequests(ctx context.Context, usernames []string) ([]MergedPullRequest, error) {
	var prs []MergedPullRequest
	for _, query := range buildAuthorQueries(usernames) {
		var res struct {
			Items []struct {
				ID            int64  `json:"id"`
				Number        int    `json:"number"`
				Title         string `json:"title"`
				HTMLURL       string `json:"html_url"`
				RepositoryURL string `json:"repository_url"`
				User          struct {
					Login     string `json:"login"`
					AvatarURL string `json:"avatar_url"`
				} `json:"user"`
				PullRequest struct {
					MergedAt time.Time `json:"merged_at"`
				} `json:"pull_request"`
			} `json:"items"`
		}
		path := fmt.Sprintf("/search/issues?q=%s&sort=updated&order=desc&per_page=100&advanced_search=true", url.QueryEscape(query))
		if err := c.get(ctx, path, &res); err != nil {
			return nil, err
		}
		for _, it := range res.Items {
			prs = append(prs, MergedPullRequest{
				ID:           it.ID,
				Number:       it.Number,
				Title:        it.Title,
				HTMLURL:      it.HTMLURL,
				RepoName:     strings.TrimPrefix(it.RepositoryURL, baseURL+"/repos/"),
				AuthorLogin:  it.User.Login,
				AuthorAvatar: it.User.AvatarURL,
				MergedAt:     it.PullRequest.MergedAt,
			})
		}
	}
	return prs, nil
}

// buildAuthorQueries packs usernames into as few merged-PR search queries
// as possible. GitHub search rejects queries longer than 256 characters or
// containing more than five AND/OR/NOT operators, hence at most six
// authors per query.
func buildAuthorQueries(usernames []string) []string {
	const (
		prefix     = "is:pr is:merged "
		maxLen     = 256
		maxAuthors = 6
	)
	var queries, parts []string
	flush := func() {
		if len(parts) == 0 {
			return
		}
		queries = append(queries, prefix+"("+strings.Join(parts, " OR ")+")")
		parts = nil
	}
	for _, username := range usernames {
		next := append(parts, "author:"+username)
		if len(parts) > 0 &&
			(len(next) > maxAuthors || len(prefix)+2+len(strings.Join(next, " OR ")) > maxLen) {
			flush()
			next = []string{"author:" + username}
		}
		parts = next
	}
	flush()
	return queries
}

// Viewer returns the login of the authenticated user, validating the token.
func (c *Client) Viewer(ctx context.Context) (string, error) {
	var user struct {
		Login string `json:"login"`
	}
	if err := c.get(ctx, "/user", &user); err != nil {
		return "", err
	}
	return user.Login, nil
}

// UserExists verifies that a username exists on GitHub.
func (c *Client) UserExists(ctx context.Context, username string) error {
	var user struct {
		Login string `json:"login"`
	}
	return c.get(ctx, "/users/"+url.PathEscape(username), &user)
}

// newGetRequest builds a GET request carrying the standard GitHub API
// headers and, when set, the bearer token.
func (c *Client) newGetRequest(ctx context.Context, path string) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	return req, nil
}

func (c *Client) get(ctx context.Context, path string, out any) error {
	req, err := c.newGetRequest(ctx, path)
	if err != nil {
		return err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return newAPIError(resp)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// getConditional is like get but issues a conditional request with the given
// ETag. When the server replies 304 Not Modified it returns notModified=true
// and leaves out untouched; such responses do not count against the rate
// limit, which keeps polling many quiet repositories cheap. On a 200 it
// decodes the body and returns the response's new ETag.
func (c *Client) getConditional(ctx context.Context, path, etag string, out any) (newEtag string, notModified bool, err error) {
	req, err := c.newGetRequest(ctx, path)
	if err != nil {
		return "", false, err
	}
	if etag != "" {
		req.Header.Set("If-None-Match", etag)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", false, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode == http.StatusNotModified {
		return etag, true, nil
	}
	if resp.StatusCode != http.StatusOK {
		return "", false, newAPIError(resp)
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return "", false, err
	}
	return resp.Header.Get("ETag"), false, nil
}

// newAPIError builds an APIError from a non-200 response, using the API's
// "message" field and a friendlier explanation for common status codes.
func newAPIError(resp *http.Response) error {
	var body struct {
		Message string `json:"message"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&body)
	msg := body.Message
	switch resp.StatusCode {
	case http.StatusUnauthorized:
		msg = "the GitHub token is invalid or expired"
	case http.StatusForbidden:
		if msg == "" {
			msg = "request forbidden (rate limit or insufficient token scope)"
		}
	}
	return &APIError{StatusCode: resp.StatusCode, Status: resp.Status, Message: msg}
}
