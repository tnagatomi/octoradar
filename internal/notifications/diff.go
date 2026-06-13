package notifications

import (
	"sort"

	"github.com/tnagatomi/octoradar/internal/github"
)

// RepoCount is the star and fork tally for one repository at a point in time.
// Comparing the previous tally against a fresh one reveals which repositories
// gained reactions without fetching every repo's events.
type RepoCount struct {
	Stars int `json:"stars"`
	Forks int `json:"forks"`
}

// eligibleRepos keeps only repositories whose reactions are worth tracking,
// dropping forks (whose stars belong to the upstream project) and archived
// repositories (which no longer attract meaningful activity).
func eligibleRepos(repos []github.UserRepo) []github.UserRepo {
	var kept []github.UserRepo
	for _, r := range repos {
		if r.Fork || r.Archived {
			continue
		}
		kept = append(kept, r)
	}
	return kept
}

// changedRepos returns the full names of repositories whose star or fork count
// rose between prev and curr, sorted for determinism. Decreases (unstars) are
// ignored, and a repository absent from prev is treated as a new baseline
// rather than a flood of pre-existing reactions.
func changedRepos(prev, curr map[string]RepoCount) []string {
	var changed []string
	for name, c := range curr {
		p, seen := prev[name]
		if !seen {
			continue
		}
		if c.Stars > p.Stars || c.Forks > p.Forks {
			changed = append(changed, name)
		}
	}
	sort.Strings(changed)
	return changed
}
