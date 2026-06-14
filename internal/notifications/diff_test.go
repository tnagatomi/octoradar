package notifications

import (
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
