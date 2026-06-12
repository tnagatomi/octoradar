package github

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSearchRepositories(t *testing.T) {
	var gotPath, gotQuery, gotSort, gotOrder, gotPerPage, gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotQuery = r.URL.Query().Get("q")
		gotSort = r.URL.Query().Get("sort")
		gotOrder = r.URL.Query().Get("order")
		gotPerPage = r.URL.Query().Get("per_page")
		gotAuth = r.Header.Get("Authorization")
		_, _ = w.Write([]byte(`{"items":[
			{"full_name":"foo/bar","description":"a tool","language":"Go","stargazers_count":42,"forks_count":7,"html_url":"https://github.com/foo/bar","owner":{"login":"foo","avatar_url":"https://avatars/foo"}}
		]}`))
	}))
	defer srv.Close()

	c := NewClient("tok")
	c.baseURL = srv.URL
	repos, err := c.SearchRepositories(context.Background(), RepositorySearchOptions{
		Query:   "created:>=2026-06-06 language:go",
		PerPage: 30,
	})
	if err != nil {
		t.Fatalf("SearchRepositories returned error: %v", err)
	}

	if gotPath != "/search/repositories" {
		t.Errorf("path = %q, want /search/repositories", gotPath)
	}
	if gotQuery != "created:>=2026-06-06 language:go" {
		t.Errorf("q = %q", gotQuery)
	}
	if gotSort != "stars" || gotOrder != "desc" {
		t.Errorf("sort/order = %q/%q, want stars/desc", gotSort, gotOrder)
	}
	if gotPerPage != "30" {
		t.Errorf("per_page = %q, want 30", gotPerPage)
	}
	if gotAuth != "Bearer tok" {
		t.Errorf("Authorization = %q, want Bearer tok", gotAuth)
	}

	if len(repos) != 1 {
		t.Fatalf("len(repos) = %d, want 1", len(repos))
	}
	want := Repository{
		FullName:        "foo/bar",
		Description:     "a tool",
		Language:        "Go",
		StargazersCount: 42,
		ForksCount:      7,
		HTMLURL:         "https://github.com/foo/bar",
		Owner:           Actor{Login: "foo", AvatarURL: "https://avatars/foo"},
	}
	if repos[0] != want {
		t.Errorf("repo = %+v, want %+v", repos[0], want)
	}
}

func TestSearchRepositoriesUnauthorized(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"message":"Bad credentials"}`))
	}))
	defer srv.Close()

	c := NewClient("tok")
	c.baseURL = srv.URL
	_, err := c.SearchRepositories(context.Background(), RepositorySearchOptions{Query: "created:>=2026-06-06", PerPage: 30})
	if err == nil {
		t.Fatal("expected an error for a 401 response")
	}
	if !IsUnauthorized(err) {
		t.Errorf("IsUnauthorized = false, want true for err %v", err)
	}
}
