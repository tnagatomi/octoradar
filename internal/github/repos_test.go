package github

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOwnedRepos(t *testing.T) {
	var gotPath, gotVisibility, gotAffiliation, gotPerPage, gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotVisibility = r.URL.Query().Get("visibility")
		gotAffiliation = r.URL.Query().Get("affiliation")
		gotPerPage = r.URL.Query().Get("per_page")
		gotAuth = r.Header.Get("Authorization")
		_, _ = w.Write([]byte(`[
			{"full_name":"foo/bar","name":"bar","owner":{"login":"foo","avatar_url":"https://avatars/foo"},"stargazers_count":42,"forks_count":7,"fork":false,"archived":false,"html_url":"https://github.com/foo/bar"}
		]`))
	}))
	defer srv.Close()

	c := NewClient("tok")
	c.baseURL = srv.URL
	repos, err := c.OwnedRepos(context.Background())
	if err != nil {
		t.Fatalf("OwnedRepos returned error: %v", err)
	}

	if gotPath != "/user/repos" {
		t.Errorf("path = %q, want /user/repos", gotPath)
	}
	if gotVisibility != "public" {
		t.Errorf("visibility = %q, want public", gotVisibility)
	}
	if gotAffiliation != "owner" {
		t.Errorf("affiliation = %q, want owner", gotAffiliation)
	}
	if gotPerPage != "100" {
		t.Errorf("per_page = %q, want 100", gotPerPage)
	}
	if gotAuth != "Bearer tok" {
		t.Errorf("Authorization = %q, want Bearer tok", gotAuth)
	}

	if len(repos) != 1 {
		t.Fatalf("len(repos) = %d, want 1", len(repos))
	}
	want := UserRepo{
		FullName:        "foo/bar",
		Name:            "bar",
		Owner:           Actor{Login: "foo", AvatarURL: "https://avatars/foo"},
		StargazersCount: 42,
		ForksCount:      7,
		Fork:            false,
		Archived:        false,
		HTMLURL:         "https://github.com/foo/bar",
	}
	if repos[0] != want {
		t.Errorf("repo = %+v, want %+v", repos[0], want)
	}
}

func TestOwnedReposPaginates(t *testing.T) {
	// A full first page (100 items) must trigger a second request; a short
	// second page ends the loop. The merged result spans both pages.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		page := r.URL.Query().Get("page")
		switch page {
		case "1":
			var items []string
			for i := 0; i < 100; i++ {
				items = append(items, fmt.Sprintf(`{"full_name":"foo/r%d"}`, i))
			}
			_, _ = fmt.Fprintf(w, "[%s]", strings.Join(items, ","))
		case "2":
			_, _ = w.Write([]byte(`[{"full_name":"foo/last"}]`))
		default:
			t.Errorf("unexpected page %q", page)
			_, _ = w.Write([]byte(`[]`))
		}
	}))
	defer srv.Close()

	c := NewClient("tok")
	c.baseURL = srv.URL
	repos, err := c.OwnedRepos(context.Background())
	if err != nil {
		t.Fatalf("OwnedRepos returned error: %v", err)
	}
	if len(repos) != 101 {
		t.Fatalf("len(repos) = %d, want 101", len(repos))
	}
	if repos[100].FullName != "foo/last" {
		t.Errorf("last repo = %q, want foo/last", repos[100].FullName)
	}
}

func TestOwnedReposUnauthorized(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"message":"Bad credentials"}`))
	}))
	defer srv.Close()

	c := NewClient("tok")
	c.baseURL = srv.URL
	_, err := c.OwnedRepos(context.Background())
	if err == nil {
		t.Fatal("expected an error for a 401 response")
	}
	if !IsUnauthorized(err) {
		t.Errorf("IsUnauthorized = false, want true for err %v", err)
	}
}
