package github

import (
	"context"
	"fmt"
)

// UserRepo is a repository owned by the authenticated user, as returned by
// the /user/repos endpoint. The star and fork counts drive the cheap scan
// that detects which repositories gained reactions.
type UserRepo struct {
	FullName        string `json:"full_name"`
	Name            string `json:"name"`
	Owner           Actor  `json:"owner"`
	StargazersCount int    `json:"stargazers_count"`
	ForksCount      int    `json:"forks_count"`
	Fork            bool   `json:"fork"`
	Archived        bool   `json:"archived"`
	HTMLURL         string `json:"html_url"`
}

// reposPerPage is the API maximum, fetched to keep the page count low for
// users who own many repositories.
const reposPerPage = 100

// OwnedRepos returns every public repository owned by the authenticated user,
// following pagination to completion. Star and fork counts are read on each
// call because they are the signal that gates the more expensive per-repo
// events requests.
func (c *Client) OwnedRepos(ctx context.Context) ([]UserRepo, error) {
	var all []UserRepo
	for page := 1; ; page++ {
		var repos []UserRepo
		path := fmt.Sprintf("/user/repos?visibility=public&affiliation=owner&per_page=%d&page=%d", reposPerPage, page)
		if err := c.get(ctx, path, &repos); err != nil {
			return nil, err
		}
		all = append(all, repos...)
		if len(repos) < reposPerPage {
			break
		}
	}
	return all, nil
}
