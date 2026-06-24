package github

import (
	"context"
	"fmt"
)

// followingPerPage is the API maximum, fetched to keep the page count low for
// users who follow many people.
const followingPerPage = 100

// maxFollowingPages caps how many pages of /user/following are fetched. GitHub
// does not document a follow limit, so this is a safety valve against
// pathological accounts (5000 accounts at 100 per page); the import list tops
// out at maxUsers anyway, so the cap never bites a normal account.
const maxFollowingPages = 50

// Following returns the accounts the authenticated user follows, paginating to
// completion. truncated reports whether the safety valve (maxFollowingPages)
// stopped the fetch before the list was exhausted. On a mid-pagination error
// the accounts gathered from the pages that succeeded are returned alongside
// the error, so callers can present a partial list rather than nothing.
func (c *Client) Following(ctx context.Context) (accounts []Actor, truncated bool, err error) {
	for page := 1; ; page++ {
		var batch []Actor
		path := fmt.Sprintf("/user/following?per_page=%d&page=%d", followingPerPage, page)
		if err := c.get(ctx, path, &batch); err != nil {
			return accounts, false, err
		}
		accounts = append(accounts, batch...)
		if len(batch) < followingPerPage {
			return accounts, false, nil
		}
		if page >= maxFollowingPages {
			return accounts, true, nil
		}
	}
}
