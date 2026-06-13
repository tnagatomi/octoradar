package github

import (
	"context"
	"fmt"
	"net/url"
)

// RepoEvents returns the most recent public events for a single repository,
// such as the stars (WatchEvent) and forks (ForkEvent) the Reactions feature
// surfaces. The request is conditional on etag: an unchanged repository
// replies 304 (notModified=true) without spending rate limit, so polling many
// repositories costs little. The returned ETag should be passed back on the
// next call.
func (c *Client) RepoEvents(ctx context.Context, owner, repo, etag string) (events []Event, newEtag string, notModified bool, err error) {
	path := fmt.Sprintf("/repos/%s/%s/events?per_page=100", url.PathEscape(owner), url.PathEscape(repo))
	newEtag, notModified, err = c.getConditional(ctx, path, etag, &events)
	if err != nil {
		return nil, "", false, err
	}
	return events, newEtag, notModified, nil
}
