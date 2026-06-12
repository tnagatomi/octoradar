package discover

import (
	"context"
	"time"

	"github.com/tnagatomi/octoradar/internal/github"
)

// perPage caps a trending fetch. Thirty repositories is plenty for browsing
// and keeps each request to a single search call, well within the search API
// rate limit.
const perPage = 30

// repositorySearcher is the slice of the GitHub client that discover needs.
// Keeping it an interface lets Fetch be exercised with a fake in place of a
// live client. *github.Client satisfies it.
type repositorySearcher interface {
	SearchRepositories(ctx context.Context, opts github.RepositorySearchOptions) ([]github.Repository, error)
}

// Repository is a trending repository rendered by the UI.
type Repository struct {
	FullName       string `json:"fullName"`
	Description    string `json:"description"`
	Language       string `json:"language"`
	Stars          int    `json:"stars"`
	Forks          int    `json:"forks"`
	URL            string `json:"url"`
	OwnerLogin     string `json:"ownerLogin"`
	OwnerAvatarURL string `json:"ownerAvatarUrl"`
}

// Result is a list of trending repositories along with any fetch error.
// Unauthorized is set when the request was rejected with a 401, signalling
// that the token must be re-entered, mirroring feed.Result.
type Result struct {
	Repositories []Repository `json:"repositories"`
	Errors       []string     `json:"errors"`
	Unauthorized bool         `json:"unauthorized"`
}

// Fetch retrieves trending repositories for the given period and language,
// approximating GitHub's trending page with a star-ordered search.
func Fetch(ctx context.Context, client repositorySearcher, period, language string) Result {
	return fetch(ctx, client, time.Now(), period, language)
}

func fetch(ctx context.Context, client repositorySearcher, now time.Time, period, language string) Result {
	result := Result{Repositories: []Repository{}, Errors: []string{}}
	repos, err := client.SearchRepositories(ctx, github.RepositorySearchOptions{
		Query:   buildQuery(now, period, language),
		PerPage: perPage,
	})
	if err != nil {
		if github.IsUnauthorized(err) {
			result.Unauthorized = true
			return result
		}
		result.Errors = append(result.Errors, err.Error())
		return result
	}
	for _, r := range repos {
		result.Repositories = append(result.Repositories, newRepository(r))
	}
	return result
}

// newRepository projects the API repository onto the display shape.
func newRepository(r github.Repository) Repository {
	return Repository{
		FullName:       r.FullName,
		Description:    r.Description,
		Language:       r.Language,
		Stars:          r.StargazersCount,
		Forks:          r.ForksCount,
		URL:            r.HTMLURL,
		OwnerLogin:     r.Owner.Login,
		OwnerAvatarURL: r.Owner.AvatarURL,
	}
}
