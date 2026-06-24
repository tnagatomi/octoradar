package github

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFollowing(t *testing.T) {
	var gotPath, gotPerPage, gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotPerPage = r.URL.Query().Get("per_page")
		gotAuth = r.Header.Get("Authorization")
		_, _ = w.Write([]byte(`[
			{"login":"alice","avatar_url":"https://avatars/alice"},
			{"login":"bob","avatar_url":"https://avatars/bob"}
		]`))
	}))
	defer srv.Close()

	c := NewClient("tok")
	c.baseURL = srv.URL
	accounts, truncated, err := c.Following(context.Background())
	if err != nil {
		t.Fatalf("Following returned error: %v", err)
	}

	if gotPath != "/user/following" {
		t.Errorf("path = %q, want /user/following", gotPath)
	}
	if gotPerPage != "100" {
		t.Errorf("per_page = %q, want 100", gotPerPage)
	}
	if gotAuth != "Bearer tok" {
		t.Errorf("Authorization = %q, want Bearer tok", gotAuth)
	}
	if truncated {
		t.Error("truncated = true, want false for a short page")
	}

	want := []Actor{
		{Login: "alice", AvatarURL: "https://avatars/alice"},
		{Login: "bob", AvatarURL: "https://avatars/bob"},
	}
	if len(accounts) != len(want) {
		t.Fatalf("len(accounts) = %d, want %d", len(accounts), len(want))
	}
	for i := range want {
		if accounts[i] != want[i] {
			t.Errorf("account %d = %+v, want %+v", i, accounts[i], want[i])
		}
	}
}

func TestFollowingPaginates(t *testing.T) {
	// A full first page (100 items) must trigger a second request; a short
	// second page ends the loop. The merged result spans both pages.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Query().Get("page") {
		case "1":
			var items []string
			for i := 0; i < 100; i++ {
				items = append(items, fmt.Sprintf(`{"login":"u%d"}`, i))
			}
			_, _ = fmt.Fprintf(w, "[%s]", strings.Join(items, ","))
		case "2":
			_, _ = w.Write([]byte(`[{"login":"last"}]`))
		default:
			t.Errorf("unexpected page %q", r.URL.Query().Get("page"))
			_, _ = w.Write([]byte(`[]`))
		}
	}))
	defer srv.Close()

	c := NewClient("tok")
	c.baseURL = srv.URL
	accounts, truncated, err := c.Following(context.Background())
	if err != nil {
		t.Fatalf("Following returned error: %v", err)
	}
	if truncated {
		t.Error("truncated = true, want false")
	}
	if len(accounts) != 101 {
		t.Fatalf("len(accounts) = %d, want 101", len(accounts))
	}
	if accounts[100].Login != "last" {
		t.Errorf("last account = %q, want last", accounts[100].Login)
	}
}

func TestFollowingTruncatesAtSafetyValve(t *testing.T) {
	// Every page is full, so the loop would never stop on its own. The safety
	// valve must cap the fetch at maxFollowingPages and report truncation
	// without ever requesting one page beyond the cap.
	var pages int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		pages++
		var items []string
		for i := 0; i < followingPerPage; i++ {
			items = append(items, fmt.Sprintf(`{"login":"u%d"}`, i))
		}
		_, _ = fmt.Fprintf(w, "[%s]", strings.Join(items, ","))
	}))
	defer srv.Close()

	c := NewClient("tok")
	c.baseURL = srv.URL
	accounts, truncated, err := c.Following(context.Background())
	if err != nil {
		t.Fatalf("Following returned error: %v", err)
	}
	if !truncated {
		t.Error("truncated = false, want true at the safety valve")
	}
	if pages != maxFollowingPages {
		t.Errorf("requested %d pages, want %d", pages, maxFollowingPages)
	}
	if len(accounts) != maxFollowingPages*followingPerPage {
		t.Errorf("len(accounts) = %d, want %d", len(accounts), maxFollowingPages*followingPerPage)
	}
}

func TestFollowingReturnsPartialOnError(t *testing.T) {
	// A failure partway through pagination must surface the error while still
	// returning the accounts gathered from the pages that did succeed, so the
	// UI can show a partial list rather than nothing.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Query().Get("page") {
		case "1":
			var items []string
			for i := 0; i < followingPerPage; i++ {
				items = append(items, fmt.Sprintf(`{"login":"u%d"}`, i))
			}
			_, _ = fmt.Fprintf(w, "[%s]", strings.Join(items, ","))
		default:
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"message":"boom"}`))
		}
	}))
	defer srv.Close()

	c := NewClient("tok")
	c.baseURL = srv.URL
	accounts, truncated, err := c.Following(context.Background())
	if err == nil {
		t.Fatal("Following returned nil error, want the page-2 failure")
	}
	if truncated {
		t.Error("truncated = true, want false on error")
	}
	if len(accounts) != followingPerPage {
		t.Errorf("len(accounts) = %d, want %d partial accounts", len(accounts), followingPerPage)
	}
}

func TestFollowingUnauthorized(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"message":"Bad credentials"}`))
	}))
	defer srv.Close()

	c := NewClient("tok")
	c.baseURL = srv.URL
	_, _, err := c.Following(context.Background())
	if !IsUnauthorized(err) {
		t.Errorf("IsUnauthorized(err) = false, want true (err=%v)", err)
	}
}
