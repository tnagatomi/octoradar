package notifications

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/tnagatomi/octoradar/internal/github"
)

func TestReviewColdBaselineDoesNotReplayBuriedHistory(t *testing.T) {
	t0 := time.Date(2026, 6, 14, 8, 0, 0, 0, time.UTC)
	client := &fakeClient{
		repos:  []github.UserRepo{{FullName: "me/a", Name: "a", Owner: github.Actor{Login: "me"}}},
		events: map[string][]github.Event{"me/a": pushes(github.EventsPerPage)},
		deepPages: map[string]map[int][]github.Event{"me/a": {
			2: {star("old", "alice", t0)},
		}},
	}
	state := &State{}

	Poll(context.Background(), client, state)
	res := Poll(context.Background(), client, state)

	if len(res.Items) != 0 {
		t.Fatalf("Items = %+v, want buried pre-baseline history to stay suppressed", res.Items)
	}
}

type retryPaginationClient struct {
	pageCalls int
}

func (c *retryPaginationClient) OwnedRepos(context.Context) ([]github.UserRepo, error) {
	return []github.UserRepo{{FullName: "me/a", Name: "a", Owner: github.Actor{Login: "me"}}}, nil
}

func (c *retryPaginationClient) RepoEvents(_ context.Context, _, _, etag string) ([]github.Event, string, bool, error) {
	if etag == `"new"` {
		return nil, etag, true, nil
	}
	return pushes(github.EventsPerPage), `"new"`, false, nil
}

func (c *retryPaginationClient) RepoEventsPage(_ context.Context, _, _ string, _ int) ([]github.Event, error) {
	c.pageCalls++
	if c.pageCalls == 1 {
		return nil, errors.New("temporary page failure")
	}
	t0 := time.Date(2026, 6, 14, 8, 0, 0, 0, time.UTC)
	return []github.Event{
		star("s2", "bob", t0.Add(time.Hour)),
		star("s1", "alice", t0),
	}, nil
}

func TestReviewPaginationFailureIsRetried(t *testing.T) {
	client := &retryPaginationClient{}
	state := &State{
		RepoEventIDs: map[string][]string{"me/a": {"s1"}},
		RepoETags:    map[string]string{"me/a": `"old"`},
	}

	first := Poll(context.Background(), client, state)
	if len(first.Errors) != 1 {
		t.Fatalf("first Errors = %v, want the temporary page failure", first.Errors)
	}
	second := Poll(context.Background(), client, state)

	if client.pageCalls != 2 || len(second.Items) != 1 || second.Items[0].ID != "s2" {
		t.Fatalf("pageCalls = %d, Items = %+v; want a deep-page retry that surfaces s2", client.pageCalls, second.Items)
	}
}
