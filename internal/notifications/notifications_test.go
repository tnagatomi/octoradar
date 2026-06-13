package notifications

import (
	"testing"
	"time"

	"github.com/tnagatomi/octoradar/internal/github"
)

func TestParseReactionsStarred(t *testing.T) {
	created := time.Date(2026, 6, 13, 10, 0, 0, 0, time.UTC)
	events := []github.Event{{
		ID:        "1",
		Type:      "WatchEvent",
		Actor:     github.Actor{Login: "alice", AvatarURL: "https://avatars/alice"},
		Repo:      github.Repo{Name: "foo/bar"},
		CreatedAt: created,
	}}

	items := parseReactions(events)

	if len(items) != 1 {
		t.Fatalf("len(items) = %d, want 1", len(items))
	}
	want := Item{
		ID:        "1",
		Actor:     "alice",
		AvatarURL: "https://avatars/alice",
		Type:      "WatchEvent",
		Action:    "starred",
		Target:    "foo/bar",
		TargetURL: "https://github.com/foo/bar",
		CreatedAt: created,
	}
	if items[0] != want {
		t.Errorf("item = %+v, want %+v", items[0], want)
	}
}

func TestParseReactionsForked(t *testing.T) {
	events := []github.Event{{
		ID:    "2",
		Type:  "ForkEvent",
		Actor: github.Actor{Login: "bob", AvatarURL: "https://avatars/bob"},
		Repo:  github.Repo{Name: "foo/bar"},
	}}

	items := parseReactions(events)

	if len(items) != 1 {
		t.Fatalf("len(items) = %d, want 1", len(items))
	}
	if items[0].Action != "forked" || items[0].Type != "ForkEvent" {
		t.Errorf("item action/type = %q/%q, want forked/ForkEvent", items[0].Action, items[0].Type)
	}
	if items[0].Target != "foo/bar" || items[0].Actor != "bob" {
		t.Errorf("item target/actor = %q/%q, want foo/bar/bob", items[0].Target, items[0].Actor)
	}
}

func TestParseReactionsIgnoresOtherTypes(t *testing.T) {
	events := []github.Event{
		{ID: "3", Type: "PushEvent", Repo: github.Repo{Name: "foo/bar"}},
		{ID: "4", Type: "IssuesEvent", Repo: github.Repo{Name: "foo/bar"}},
		{ID: "5", Type: "WatchEvent", Actor: github.Actor{Login: "carol"}, Repo: github.Repo{Name: "foo/bar"}},
	}

	items := parseReactions(events)

	if len(items) != 1 {
		t.Fatalf("len(items) = %d, want 1 (only the WatchEvent)", len(items))
	}
	if items[0].ID != "5" {
		t.Errorf("item id = %q, want 5", items[0].ID)
	}
}
