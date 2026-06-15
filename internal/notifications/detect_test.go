package notifications

import (
	"fmt"
	"reflect"
	"testing"
	"time"

	"github.com/tnagatomi/octoradar/internal/github"
)

func TestNewReactionsReturnsOnlyUnknownIDs(t *testing.T) {
	t0 := time.Date(2026, 6, 14, 8, 0, 0, 0, time.UTC)
	events := []github.Event{
		star("s3", "carol", t0.Add(3*time.Hour)),
		star("s2", "bob", t0.Add(2*time.Hour)),
		star("s1", "alice", t0.Add(1*time.Hour)),
	}
	seen := []string{"s1", "s2"}

	got := newReactions(seen, events)

	if len(got) != 1 {
		t.Fatalf("len(newReactions) = %d, want 1, got %+v", len(got), got)
	}
	if got[0].ID != "s3" {
		t.Errorf("newReactions[0].ID = %q, want s3", got[0].ID)
	}
}

func TestNewReactionsIgnoresNonReactionEvents(t *testing.T) {
	t0 := time.Date(2026, 6, 14, 8, 0, 0, 0, time.UTC)
	events := []github.Event{
		{ID: "p1", Type: "PushEvent", CreatedAt: t0.Add(2 * time.Hour)},
		star("s1", "alice", t0.Add(1*time.Hour)),
	}

	got := newReactions(nil, events)

	if len(got) != 1 || got[0].ID != "s1" {
		t.Errorf("newReactions = %+v, want only the star s1", got)
	}
}

func TestUpdateSeenPrependsNewReactionIDs(t *testing.T) {
	t0 := time.Date(2026, 6, 14, 8, 0, 0, 0, time.UTC)
	events := []github.Event{
		star("s3", "carol", t0.Add(3*time.Hour)),
		star("s2", "bob", t0.Add(2*time.Hour)),
	}
	seen := []string{"s1"}

	got := updateSeen(seen, events)

	want := []string{"s3", "s2", "s1"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("updateSeen = %v, want %v", got, want)
	}
}

func TestUpdateSeenDropsDuplicates(t *testing.T) {
	t0 := time.Date(2026, 6, 14, 8, 0, 0, 0, time.UTC)
	events := []github.Event{star("s2", "bob", t0.Add(2*time.Hour))}
	seen := []string{"s2", "s1"}

	got := updateSeen(seen, events)

	want := []string{"s2", "s1"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("updateSeen = %v, want %v (s2 not duplicated)", got, want)
	}
}

func TestUpdateSeenCapsAtMaxKeepingNewest(t *testing.T) {
	seen := make([]string, maxSeenIDs)
	for i := range seen {
		seen[i] = fmt.Sprintf("old%d", i)
	}
	t0 := time.Date(2026, 6, 14, 8, 0, 0, 0, time.UTC)
	events := []github.Event{star("new", "alice", t0)}

	got := updateSeen(seen, events)

	if len(got) != maxSeenIDs {
		t.Fatalf("len(updateSeen) = %d, want %d", len(got), maxSeenIDs)
	}
	if got[0] != "new" {
		t.Errorf("updateSeen[0] = %q, want the newest id %q", got[0], "new")
	}
	if got[len(got)-1] != fmt.Sprintf("old%d", maxSeenIDs-2) {
		t.Errorf("oldest retained = %q, want the dropped tail to be the eldest", got[len(got)-1])
	}
}
