package notifications

import (
	"reflect"
	"testing"
	"time"
)

// redirectHome points os.UserConfigDir at a temp dir so tests never touch the
// real config directory.
func redirectHome(t *testing.T) {
	t.Helper()
	t.Setenv("HOME", t.TempDir())
	t.Setenv("XDG_CONFIG_HOME", "")
}

func TestStateSaveLoadRoundTrip(t *testing.T) {
	redirectHome(t)

	read := time.Date(2026, 6, 13, 9, 0, 0, 0, time.UTC)
	state := &State{
		RepoEventIDs:  map[string][]string{"me/a": {"s2", "s1"}},
		RepoETags:     map[string]string{"me/a": `"etag1"`},
		ReadWatermark: read,
		Items: []Item{
			{ID: "1", Actor: "alice", Action: "starred", Target: "me/a"},
		},
	}
	if err := state.Save(); err != nil {
		t.Fatalf("Save: %v", err)
	}

	loaded, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !reflect.DeepEqual(loaded.RepoEventIDs["me/a"], []string{"s2", "s1"}) {
		t.Errorf("RepoEventIDs[me/a] = %+v, want [s2 s1]", loaded.RepoEventIDs["me/a"])
	}
	if loaded.RepoETags["me/a"] != `"etag1"` {
		t.Errorf("RepoETags[me/a] = %q", loaded.RepoETags["me/a"])
	}
	if !loaded.ReadWatermark.Equal(read) {
		t.Errorf("ReadWatermark = %v, want %v", loaded.ReadWatermark, read)
	}
	if len(loaded.Items) != 1 || loaded.Items[0].ID != "1" {
		t.Errorf("Items = %+v, want one item id 1", loaded.Items)
	}
}

func TestLoadMissingFileYieldsUninitialized(t *testing.T) {
	redirectHome(t)

	loaded, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(loaded.RepoEventIDs) != 0 {
		t.Errorf("RepoEventIDs = %+v, want none so the first poll baselines each repo", loaded.RepoEventIDs)
	}
	if len(loaded.Items) != 0 {
		t.Errorf("Items = %+v, want none", loaded.Items)
	}
}

func TestCapItemsKeepsNewestWithinLimit(t *testing.T) {
	items := make([]Item, maxItems+5)
	for i := range items {
		items[i] = Item{ID: string(rune('a' + i%26))}
	}
	items[0].ID = "newest"

	got := capItems(items)

	if len(got) != maxItems {
		t.Fatalf("len = %d, want %d", len(got), maxItems)
	}
	// Items are newest-first, so the head is retained and the tail dropped.
	if got[0].ID != "newest" {
		t.Errorf("head = %q, want newest", got[0].ID)
	}
}
