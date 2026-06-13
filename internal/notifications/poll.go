package notifications

import (
	"context"
	"sort"
	"time"

	"github.com/tnagatomi/octoradar/internal/github"
)

// fetcher is the subset of the github client the poll needs, narrowed to an
// interface so tests can substitute a fake.
type fetcher interface {
	OwnedRepos(ctx context.Context) ([]github.UserRepo, error)
	RepoEvents(ctx context.Context, owner, repo, etag string) ([]github.Event, string, bool, error)
}

// Result is the reaction list returned to the UI, with the unread tally and
// per-poll failures. Unauthorized signals the token must be re-entered.
type Result struct {
	Items        []Item   `json:"items"`
	Errors       []string `json:"errors"`
	Unauthorized bool     `json:"unauthorized"`
	UnreadCount  int      `json:"unreadCount"`
}

// Poll scans the user's repositories for new stars and forks, mutating state
// with the fresh baseline, ETags, and reaction list. The first poll only
// records a baseline so pre-existing reactions are not replayed.
func Poll(ctx context.Context, client fetcher, state *State) Result {
	repos, err := client.OwnedRepos(ctx)
	if err != nil {
		return errorResult(state, err)
	}

	eligible := eligibleRepos(repos)
	curr := countRepos(eligible)

	if !state.Initialized {
		state.RepoCounts = curr
		state.Initialized = true
		return result(state)
	}

	prev := state.RepoCounts
	state.RepoCounts = curr
	if state.RepoETags == nil {
		state.RepoETags = map[string]string{}
	}
	byName := reposByName(eligible)

	var newItems []Item
	var errs []string
	unauthorized := false
	for _, name := range changedRepos(prev, curr) {
		r := byName[name]
		events, etag, notModified, err := client.RepoEvents(ctx, r.Owner.Login, r.Name, state.RepoETags[name])
		if err != nil {
			if github.IsUnauthorized(err) {
				unauthorized = true
				break
			}
			errs = append(errs, err.Error())
			continue
		}
		state.RepoETags[name] = etag
		if notModified {
			continue
		}
		dStars := curr[name].Stars - prev[name].Stars
		dForks := curr[name].Forks - prev[name].Forks
		newItems = append(newItems, takeDelta(parseReactions(events), dStars, dForks)...)
	}

	state.Items = mergeItems(state.Items, newItems)
	res := result(state)
	res.Unauthorized = unauthorized
	if len(errs) > 0 {
		res.Errors = errs
	}
	return res
}

// reposByName indexes repositories by full name for owner/name lookup.
func reposByName(repos []github.UserRepo) map[string]github.UserRepo {
	m := make(map[string]github.UserRepo, len(repos))
	for _, r := range repos {
		m[r.FullName] = r
	}
	return m
}

// takeDelta keeps only the newest dStars star reactions and dForks fork
// reactions from a newest-first list, so a repository's older, pre-baseline
// reactions are not surfaced when its count rises.
func takeDelta(reactions []Item, dStars, dForks int) []Item {
	var taken []Item
	for _, it := range reactions {
		switch it.Action {
		case "starred":
			if dStars > 0 {
				taken = append(taken, it)
				dStars--
			}
		case "forked":
			if dForks > 0 {
				taken = append(taken, it)
				dForks--
			}
		}
	}
	return taken
}

// mergeItems combines newly found reactions with the existing list, dropping
// duplicates by id, ordering newest first, and capping the total.
func mergeItems(existing, found []Item) []Item {
	seen := make(map[string]bool, len(existing)+len(found))
	merged := make([]Item, 0, len(existing)+len(found))
	for _, it := range append(found, existing...) {
		if seen[it.ID] {
			continue
		}
		seen[it.ID] = true
		merged = append(merged, it)
	}
	sort.SliceStable(merged, func(i, j int) bool {
		return merged[i].CreatedAt.After(merged[j].CreatedAt)
	})
	return capItems(merged)
}

// countRepos tallies the star and fork counts of the given repositories.
func countRepos(repos []github.UserRepo) map[string]RepoCount {
	counts := make(map[string]RepoCount, len(repos))
	for _, r := range repos {
		counts[r.FullName] = RepoCount{Stars: r.StargazersCount, Forks: r.ForksCount}
	}
	return counts
}

// result builds the Result view from the current state.
func result(state *State) Result {
	items := state.Items
	if items == nil {
		items = []Item{}
	}
	return Result{
		Items:       items,
		Errors:      []string{},
		UnreadCount: unreadCount(items, state.ReadWatermark),
	}
}

// MarkRead advances the read watermark to the newest reaction, so the unread
// tally drops to zero. Items are newest first, so the head is the newest.
func MarkRead(state *State) {
	if len(state.Items) == 0 {
		return
	}
	state.ReadWatermark = state.Items[0].CreatedAt
}

// unreadCount counts items newer than the read watermark.
func unreadCount(items []Item, watermark time.Time) int {
	n := 0
	for _, it := range items {
		if it.CreatedAt.After(watermark) {
			n++
		}
	}
	return n
}

// errorResult preserves the existing items on a fetch failure so a transient
// error does not blank the list, flagging a 401 for re-authentication.
func errorResult(state *State, err error) Result {
	res := result(state)
	if github.IsUnauthorized(err) {
		res.Unauthorized = true
		return res
	}
	res.Errors = []string{err.Error()}
	return res
}
