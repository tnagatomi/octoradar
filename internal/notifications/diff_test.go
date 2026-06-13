package notifications

import (
	"reflect"
	"testing"

	"github.com/tnagatomi/octoradar/internal/github"
)

func TestEligibleReposExcludesForksAndArchived(t *testing.T) {
	repos := []github.UserRepo{
		{FullName: "me/own"},
		{FullName: "me/forked", Fork: true},
		{FullName: "me/archived", Archived: true},
	}

	got := eligibleRepos(repos)

	if len(got) != 1 {
		t.Fatalf("len(got) = %d, want 1", len(got))
	}
	if got[0].FullName != "me/own" {
		t.Errorf("kept %q, want me/own", got[0].FullName)
	}
}

func TestChangedReposDetectsIncreases(t *testing.T) {
	prev := map[string]RepoCount{
		"me/a": {Stars: 10, Forks: 2},
		"me/b": {Stars: 5, Forks: 1},
		"me/c": {Stars: 8, Forks: 0},
	}
	curr := map[string]RepoCount{
		"me/a": {Stars: 12, Forks: 2}, // +2 stars
		"me/b": {Stars: 5, Forks: 3},  // +2 forks
		"me/c": {Stars: 8, Forks: 0},  // unchanged
	}

	got := changedRepos(prev, curr)

	want := []string{"me/a", "me/b"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("changedRepos = %v, want %v", got, want)
	}
}

func TestChangedReposIgnoresDecreasesAndNewRepos(t *testing.T) {
	prev := map[string]RepoCount{
		"me/a": {Stars: 10},
	}
	curr := map[string]RepoCount{
		"me/a":   {Stars: 9},  // unstar: decrease, ignored
		"me/new": {Stars: 50}, // first seen: baseline, not a notification
	}

	got := changedRepos(prev, curr)

	if len(got) != 0 {
		t.Errorf("changedRepos = %v, want none (decrease and new repo are not reactions)", got)
	}
}
