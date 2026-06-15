package github

import (
	"context"
	"fmt"
	"net/url"
)

// EventsPerPage is the page size used for repository events requests. It is the
// API maximum, and callers compare a page's length against it to tell whether
// more pages remain.
const EventsPerPage = 100

// RepoEvents returns the most recent public events for a single repository,
// such as the stars (WatchEvent) and forks (ForkEvent) the Reactions feature
// surfaces. The request is conditional on etag: an unchanged repository
// replies 304 (notModified=true) without spending rate limit, so polling many
// repositories costs little. The returned ETag should be passed back on the
// next call.
func (c *Client) RepoEvents(ctx context.Context, owner, repo, etag string) (events []Event, newEtag string, notModified bool, err error) {
	path := fmt.Sprintf("/repos/%s/%s/events?per_page=%d", url.PathEscape(owner), url.PathEscape(repo), EventsPerPage)
	newEtag, notModified, err = c.getConditional(ctx, path, etag, &events)
	if err != nil {
		return nil, "", false, err
	}
	return events, newEtag, notModified, nil
}

// RepoEventsPage returns a specific page of a repository's events. Unlike
// RepoEvents it is unconditional, used to page past a first page crowded with
// non-reaction events (pushes, issues) so a star or fork buried deeper in the
// timeline is still found. The events API exposes up to 300 events (three
// pages).
func (c *Client) RepoEventsPage(ctx context.Context, owner, repo string, page int) ([]Event, error) {
	var events []Event
	path := fmt.Sprintf("/repos/%s/%s/events?per_page=%d&page=%d", url.PathEscape(owner), url.PathEscape(repo), EventsPerPage, page)
	if err := c.get(ctx, path, &events); err != nil {
		return nil, err
	}
	return events, nil
}
