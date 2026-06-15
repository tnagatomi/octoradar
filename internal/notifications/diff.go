package notifications

import "github.com/tnagatomi/octoradar/internal/github"

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
