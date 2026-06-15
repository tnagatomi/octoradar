package github

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRepoEvents(t *testing.T) {
	var gotPath, gotPerPage, gotAuth, gotIfNoneMatch string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotPerPage = r.URL.Query().Get("per_page")
		gotAuth = r.Header.Get("Authorization")
		gotIfNoneMatch = r.Header.Get("If-None-Match")
		w.Header().Set("ETag", `"abc123"`)
		_, _ = w.Write([]byte(`[
			{"id":"1","type":"WatchEvent","actor":{"login":"alice","avatar_url":"https://avatars/alice"},"repo":{"name":"foo/bar"},"created_at":"2026-06-13T10:00:00Z"}
		]`))
	}))
	defer srv.Close()

	c := NewClient("tok")
	c.baseURL = srv.URL
	events, etag, notModified, err := c.RepoEvents(context.Background(), "foo", "bar", "")
	if err != nil {
		t.Fatalf("RepoEvents returned error: %v", err)
	}

	if gotPath != "/repos/foo/bar/events" {
		t.Errorf("path = %q, want /repos/foo/bar/events", gotPath)
	}
	if gotPerPage != "100" {
		t.Errorf("per_page = %q, want 100", gotPerPage)
	}
	if gotAuth != "Bearer tok" {
		t.Errorf("Authorization = %q, want Bearer tok", gotAuth)
	}
	if gotIfNoneMatch != "" {
		t.Errorf("If-None-Match = %q, want empty when no prior etag", gotIfNoneMatch)
	}
	if notModified {
		t.Error("notModified = true, want false for a 200 response")
	}
	if etag != `"abc123"` {
		t.Errorf("etag = %q, want \"abc123\"", etag)
	}
	if len(events) != 1 || events[0].Type != "WatchEvent" || events[0].Actor.Login != "alice" {
		t.Fatalf("events = %+v, want one WatchEvent by alice", events)
	}
}

func TestRepoEventsPage(t *testing.T) {
	var gotPath, gotPerPage, gotPage, gotIfNoneMatch string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotPerPage = r.URL.Query().Get("per_page")
		gotPage = r.URL.Query().Get("page")
		gotIfNoneMatch = r.Header.Get("If-None-Match")
		_, _ = w.Write([]byte(`[
			{"id":"9","type":"ForkEvent","actor":{"login":"bob"},"repo":{"name":"foo/bar"},"created_at":"2026-06-14T10:00:00Z"}
		]`))
	}))
	defer srv.Close()

	c := NewClient("tok")
	c.baseURL = srv.URL
	events, err := c.RepoEventsPage(context.Background(), "foo", "bar", 2)
	if err != nil {
		t.Fatalf("RepoEventsPage returned error: %v", err)
	}

	if gotPath != "/repos/foo/bar/events" {
		t.Errorf("path = %q, want /repos/foo/bar/events", gotPath)
	}
	if gotPerPage != "100" {
		t.Errorf("per_page = %q, want 100", gotPerPage)
	}
	if gotPage != "2" {
		t.Errorf("page = %q, want 2", gotPage)
	}
	if gotIfNoneMatch != "" {
		t.Errorf("If-None-Match = %q, want none on a deep page", gotIfNoneMatch)
	}
	if len(events) != 1 || events[0].Type != "ForkEvent" {
		t.Fatalf("events = %+v, want one ForkEvent", events)
	}
}

func TestRepoEventsNotModified(t *testing.T) {
	var gotIfNoneMatch string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotIfNoneMatch = r.Header.Get("If-None-Match")
		w.WriteHeader(http.StatusNotModified)
	}))
	defer srv.Close()

	c := NewClient("tok")
	c.baseURL = srv.URL
	events, etag, notModified, err := c.RepoEvents(context.Background(), "foo", "bar", `"abc123"`)
	if err != nil {
		t.Fatalf("RepoEvents returned error: %v", err)
	}
	if gotIfNoneMatch != `"abc123"` {
		t.Errorf("If-None-Match = %q, want \"abc123\"", gotIfNoneMatch)
	}
	if !notModified {
		t.Error("notModified = false, want true for a 304 response")
	}
	// The prior etag is retained so the next poll stays conditional.
	if etag != `"abc123"` {
		t.Errorf("etag = %q, want the prior \"abc123\" retained", etag)
	}
	if len(events) != 0 {
		t.Errorf("events = %+v, want none on a 304", events)
	}
}

func TestPollIntervalSecondsTracksMax(t *testing.T) {
	interval := "60"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("X-Poll-Interval", interval)
		w.Header().Set("ETag", `"e"`)
		_, _ = w.Write([]byte(`[]`))
	}))
	defer srv.Close()

	c := NewClient("tok")
	c.baseURL = srv.URL
	if c.PollIntervalSeconds() != 0 {
		t.Errorf("PollIntervalSeconds = %d before any request, want 0", c.PollIntervalSeconds())
	}

	if _, _, _, err := c.RepoEvents(context.Background(), "o", "r", ""); err != nil {
		t.Fatalf("RepoEvents: %v", err)
	}
	if got := c.PollIntervalSeconds(); got != 60 {
		t.Errorf("PollIntervalSeconds = %d, want 60 from the header", got)
	}

	interval = "120"
	if _, _, _, err := c.RepoEvents(context.Background(), "o", "r", ""); err != nil {
		t.Fatalf("RepoEvents: %v", err)
	}
	if got := c.PollIntervalSeconds(); got != 120 {
		t.Errorf("PollIntervalSeconds = %d, want 120 (the larger interval)", got)
	}

	interval = "90"
	if _, _, _, err := c.RepoEvents(context.Background(), "o", "r", ""); err != nil {
		t.Fatalf("RepoEvents: %v", err)
	}
	if got := c.PollIntervalSeconds(); got != 120 {
		t.Errorf("PollIntervalSeconds = %d, want 120 retained (max, not last)", got)
	}
}

func TestRepoEventsUnauthorized(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"message":"Bad credentials"}`))
	}))
	defer srv.Close()

	c := NewClient("tok")
	c.baseURL = srv.URL
	_, _, _, err := c.RepoEvents(context.Background(), "foo", "bar", "")
	if err == nil {
		t.Fatal("expected an error for a 401 response")
	}
	if !IsUnauthorized(err) {
		t.Errorf("IsUnauthorized = false, want true for err %v", err)
	}
}
