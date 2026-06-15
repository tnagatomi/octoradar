package notifications

import "github.com/tnagatomi/octoradar/internal/github"

// maxSeenIDs caps the per-repository set of recently seen reaction event IDs.
// It matches the events API's maximum timeline length, so a reaction is not
// re-emitted as long as it remains within the window the API can return.
const maxSeenIDs = 300

// newReactions returns the reactions in events whose event ID is not already in
// seen, preserving the newest-first order the events API uses. Detection is by
// event ID rather than star/fork count, so an unstar-then-star that leaves the
// count unchanged still surfaces the new star.
func newReactions(seen []string, events []github.Event) []Item {
	known := make(map[string]bool, len(seen))
	for _, id := range seen {
		known[id] = true
	}
	var fresh []Item
	for _, it := range parseReactions(events) {
		if known[it.ID] {
			continue
		}
		fresh = append(fresh, it)
	}
	return fresh
}

// reachedSeen reports whether any reaction in events is already in seen, which
// marks the boundary between new reactions and ones a prior poll recorded.
// Pagination stops once this boundary is reached.
func reachedSeen(seen []string, events []github.Event) bool {
	known := make(map[string]bool, len(seen))
	for _, id := range seen {
		known[id] = true
	}
	for _, it := range parseReactions(events) {
		if known[it.ID] {
			return true
		}
	}
	return false
}

// updateSeen folds the reaction event IDs in events into seen, keeping the set
// newest-first and capped at maxSeenIDs. New IDs from events go in front, since
// the events API returns them newest-first and they are newer than anything
// already stored. Duplicates are dropped so the set stays stable across polls.
func updateSeen(seen []string, events []github.Event) []string {
	have := make(map[string]bool, len(seen))
	updated := make([]string, 0, len(seen))
	add := func(id string) {
		if have[id] {
			return
		}
		have[id] = true
		updated = append(updated, id)
	}
	for _, it := range parseReactions(events) {
		add(it.ID)
	}
	for _, id := range seen {
		add(id)
	}
	if len(updated) > maxSeenIDs {
		updated = updated[:maxSeenIDs]
	}
	return updated
}
