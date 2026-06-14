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
	RepoEventsPage(ctx context.Context, owner, repo string, page int) ([]github.Event, error)
}

// maxReactionPages bounds how deep a single repository is paged when digging
// for reactions buried below busy first pages. It matches the events API's
// 300-event (three-page) window, past which older events are unavailable.
const maxReactionPages = 3

// Result is the reaction list returned to the UI, with the unread tally and
// per-poll failures. Unauthorized signals the token must be re-entered.
// MinPollIntervalSec, when non-zero, is the slowest poll cadence GitHub has
// asked for via X-Poll-Interval, so the UI can back off under load.
type Result struct {
	Items              []Item   `json:"items"`
	Errors             []string `json:"errors"`
	Unauthorized       bool     `json:"unauthorized"`
	UnreadCount        int      `json:"unreadCount"`
	MinPollIntervalSec int      `json:"minPollIntervalSec"`
}

// Poll scans the user's repositories for new stars and forks, mutating state
// with the fresh per-repo event-ID sets, ETags, and reaction list. New stars
// and forks are detected by event ID, not by star/fork count, so an
// unstar-then-star that leaves the count unchanged still surfaces. A repository
// seen for the first time only records a baseline, so its pre-existing
// reactions are not replayed.
func Poll(ctx context.Context, client fetcher, state *State) Result {
	repos, err := client.OwnedRepos(ctx)
	if err != nil {
		return errorResult(state, err)
	}

	eligible := eligibleRepos(repos)
	if state.RepoEventIDs == nil {
		state.RepoEventIDs = map[string][]string{}
	}
	if state.RepoETags == nil {
		state.RepoETags = map[string]string{}
	}
	pruneIneligible(state, eligible)

	var newItems []Item
	var errs []string
	unauthorized := false
	for _, r := range sortedByName(eligible) {
		name := r.FullName
		seen, baselined := state.RepoEventIDs[name]

		// A repository without an event-ID baseline must establish one before a
		// conditional request can help: sending a stale ETag risks a 304 that
		// would skip baselining and let the first genuinely new reaction be
		// swallowed. So baseline requests go out without an ETag.
		etag := ""
		if baselined {
			etag = state.RepoETags[name]
		}

		events, newEtag, notModified, err := client.RepoEvents(ctx, r.Owner.Login, r.Name, etag)
		if err != nil {
			if github.IsUnauthorized(err) {
				unauthorized = true
				break
			}
			errs = append(errs, err.Error())
			continue
		}
		state.RepoETags[name] = newEtag
		if notModified {
			continue
		}
		if baselined {
			events, err = paginateReactions(ctx, client, r, seen, events)
			if err != nil {
				if github.IsUnauthorized(err) {
					unauthorized = true
					break
				}
				errs = append(errs, err.Error())
			}
			newItems = append(newItems, newReactions(seen, events)...)
		}
		state.RepoEventIDs[name] = updateSeen(seen, events)
	}

	state.Items = mergeItems(state.Items, newItems)
	res := result(state)
	res.Unauthorized = unauthorized
	if len(errs) > 0 {
		res.Errors = errs
	}
	return res
}

// paginateReactions extends page1 with deeper event pages while the timeline
// stays full and no already-seen reaction has been reached, bounded by
// maxReactionPages. This digs out a star or fork buried below a first page
// crowded with pushes; a short page or a known reaction marks the boundary and
// stops the walk. On a fetch error it returns the events gathered so far.
func paginateReactions(ctx context.Context, client fetcher, r github.UserRepo, seen []string, page1 []github.Event) ([]github.Event, error) {
	events := page1
	last := page1
	for page := 2; page <= maxReactionPages; page++ {
		if len(last) < github.EventsPerPage || reachedSeen(seen, last) {
			break
		}
		more, err := client.RepoEventsPage(ctx, r.Owner.Login, r.Name, page)
		if err != nil {
			return events, err
		}
		events = append(events, more...)
		last = more
	}
	return events, nil
}

// pruneIneligible drops per-repo event-ID sets and ETags for repositories no
// longer in the eligible set — deleted, renamed, archived, or turned into a
// fork — so the persisted maps do not grow without bound.
func pruneIneligible(state *State, eligible []github.UserRepo) {
	keep := make(map[string]bool, len(eligible))
	for _, r := range eligible {
		keep[r.FullName] = true
	}
	for name := range state.RepoEventIDs {
		if !keep[name] {
			delete(state.RepoEventIDs, name)
		}
	}
	for name := range state.RepoETags {
		if !keep[name] {
			delete(state.RepoETags, name)
		}
	}
}

// sortedByName returns the repositories ordered by full name, so polling and
// any resulting errors are deterministic regardless of the API's ordering.
func sortedByName(repos []github.UserRepo) []github.UserRepo {
	out := append([]github.UserRepo(nil), repos...)
	sort.Slice(out, func(i, j int) bool { return out[i].FullName < out[j].FullName })
	return out
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
