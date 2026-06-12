package github

import (
	"context"
	"fmt"
	"net/url"
)

// Repository is a repository as returned by the search API.
type Repository struct {
	FullName        string `json:"full_name"`
	Description     string `json:"description"`
	Language        string `json:"language"`
	StargazersCount int    `json:"stargazers_count"`
	ForksCount      int    `json:"forks_count"`
	HTMLURL         string `json:"html_url"`
	Owner           Actor  `json:"owner"`
}

// RepositorySearchOptions parameterizes a repository search. Query is the raw
// search qualifier string; results are always ordered by stars, descending.
type RepositorySearchOptions struct {
	Query   string
	PerPage int
}

// SearchRepositories runs a repository search ordered by star count, used to
// approximate GitHub's trending page.
func (c *Client) SearchRepositories(ctx context.Context, opts RepositorySearchOptions) ([]Repository, error) {
	var res struct {
		Items []Repository `json:"items"`
	}
	path := fmt.Sprintf("/search/repositories?q=%s&sort=stars&order=desc&per_page=%d",
		url.QueryEscape(opts.Query), opts.PerPage)
	if err := c.get(ctx, path, &res); err != nil {
		return nil, err
	}
	return res.Items, nil
}
