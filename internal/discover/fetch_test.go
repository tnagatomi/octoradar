package discover

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/tnagatomi/octoradar/internal/github"
)

type fakeSearcher struct {
	gotOpts github.RepositorySearchOptions
	repos   []github.Repository
	err     error
}

func (f *fakeSearcher) SearchRepositories(_ context.Context, opts github.RepositorySearchOptions) ([]github.Repository, error) {
	f.gotOpts = opts
	return f.repos, f.err
}

func TestFetchMapsRepositories(t *testing.T) {
	now := time.Date(2026, 6, 13, 9, 30, 0, 0, time.UTC)
	searcher := &fakeSearcher{repos: []github.Repository{{
		FullName:        "foo/bar",
		Description:     "a tool",
		Language:        "Go",
		StargazersCount: 42,
		ForksCount:      7,
		HTMLURL:         "https://github.com/foo/bar",
		Owner:           github.Actor{Login: "foo", AvatarURL: "https://avatars/foo"},
	}}}

	result := fetch(context.Background(), searcher, now, "week", "go")

	if searcher.gotOpts.Query != "created:>=2026-06-06 language:go" {
		t.Errorf("query = %q", searcher.gotOpts.Query)
	}
	if result.Unauthorized {
		t.Error("Unauthorized = true, want false")
	}
	if len(result.Errors) != 0 {
		t.Errorf("Errors = %v, want empty", result.Errors)
	}
	if len(result.Repositories) != 1 {
		t.Fatalf("len(Repositories) = %d, want 1", len(result.Repositories))
	}
	want := Repository{
		FullName:       "foo/bar",
		Description:    "a tool",
		Language:       "Go",
		Stars:          42,
		Forks:          7,
		URL:            "https://github.com/foo/bar",
		OwnerLogin:     "foo",
		OwnerAvatarURL: "https://avatars/foo",
	}
	if result.Repositories[0] != want {
		t.Errorf("repo = %+v, want %+v", result.Repositories[0], want)
	}
}

func TestFetchUnauthorized(t *testing.T) {
	now := time.Date(2026, 6, 13, 9, 30, 0, 0, time.UTC)
	searcher := &fakeSearcher{err: &github.APIError{StatusCode: http.StatusUnauthorized}}

	result := fetch(context.Background(), searcher, now, "week", "")

	if !result.Unauthorized {
		t.Error("Unauthorized = false, want true")
	}
	if len(result.Errors) != 0 {
		t.Errorf("Errors = %v, want empty when unauthorized", result.Errors)
	}
	if result.Repositories == nil {
		t.Error("Repositories = nil, want non-nil empty slice")
	}
}

func TestFetchGenericError(t *testing.T) {
	now := time.Date(2026, 6, 13, 9, 30, 0, 0, time.UTC)
	searcher := &fakeSearcher{err: errors.New("boom")}

	result := fetch(context.Background(), searcher, now, "week", "")

	if result.Unauthorized {
		t.Error("Unauthorized = true, want false")
	}
	if len(result.Errors) != 1 {
		t.Fatalf("Errors = %v, want one message", result.Errors)
	}
	if result.Repositories == nil {
		t.Error("Repositories = nil, want non-nil empty slice")
	}
}
