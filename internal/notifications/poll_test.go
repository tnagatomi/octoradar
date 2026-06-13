package notifications

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/tnagatomi/octoradar/internal/github"
)

func star(id, login string, at time.Time) github.Event {
	return github.Event{ID: id, Type: "WatchEvent", Actor: github.Actor{Login: login}, Repo: github.Repo{Name: "me/a"}, CreatedAt: at}
}

// fakeClient is a stand-in for the github client, recording which repos had
// their events fetched so tests can assert the cheap-scan gating.
type fakeClient struct {
	repos           []github.UserRepo
	reposErr        error
	events          map[string][]github.Event
	eventsErr       map[string]error
	repoEventsCalls []string
}

func (f *fakeClient) OwnedRepos(_ context.Context) ([]github.UserRepo, error) {
	return f.repos, f.reposErr
}

func (f *fakeClient) RepoEvents(_ context.Context, owner, repo, _ string) ([]github.Event, string, bool, error) {
	key := owner + "/" + repo
	f.repoEventsCalls = append(f.repoEventsCalls, key)
	if f.eventsErr != nil {
		if err := f.eventsErr[key]; err != nil {
			return nil, "", false, err
		}
	}
	return f.events[key], `"etag-` + key + `"`, false, nil
}

func TestPollColdStartEstablishesBaseline(t *testing.T) {
	client := &fakeClient{repos: []github.UserRepo{
		{FullName: "me/a", Name: "a", Owner: github.Actor{Login: "me"}, StargazersCount: 10, ForksCount: 2},
	}}
	state := &State{}

	res := Poll(context.Background(), client, state)

	if !state.Initialized {
		t.Error("Initialized = false, want true after the first poll")
	}
	if len(client.repoEventsCalls) != 0 {
		t.Errorf("fetched events %v, want none on the baseline poll", client.repoEventsCalls)
	}
	if len(res.Items) != 0 {
		t.Errorf("Items = %+v, want none on the baseline poll", res.Items)
	}
	if res.UnreadCount != 0 {
		t.Errorf("UnreadCount = %d, want 0", res.UnreadCount)
	}
	if state.RepoCounts["me/a"] != (RepoCount{Stars: 10, Forks: 2}) {
		t.Errorf("baseline count = %+v, want {10 2}", state.RepoCounts["me/a"])
	}
}

func TestPollTakesOnlyDeltaNewestReactions(t *testing.T) {
	t0 := time.Date(2026, 6, 13, 8, 0, 0, 0, time.UTC)
	client := &fakeClient{
		repos: []github.UserRepo{
			{FullName: "me/a", Name: "a", Owner: github.Actor{Login: "me"}, StargazersCount: 12},
		},
		events: map[string][]github.Event{
			// Newest first, as the events API returns them.
			"me/a": {
				star("s3", "carol", t0.Add(3*time.Hour)),
				star("s2", "bob", t0.Add(2*time.Hour)),
				star("s1", "alice", t0.Add(1*time.Hour)), // pre-baseline, must not surface
			},
		},
	}
	// Baseline already had 10 stars; the count rose by 2.
	state := &State{
		Initialized: true,
		RepoCounts:  map[string]RepoCount{"me/a": {Stars: 10}},
		RepoETags:   map[string]string{},
	}

	res := Poll(context.Background(), client, state)

	if len(client.repoEventsCalls) != 1 || client.repoEventsCalls[0] != "me/a" {
		t.Errorf("repoEventsCalls = %v, want [me/a]", client.repoEventsCalls)
	}
	if len(res.Items) != 2 {
		t.Fatalf("len(Items) = %d, want 2 (the delta), got %+v", len(res.Items), res.Items)
	}
	// Newest first: carol then bob; alice is the historical star and excluded.
	if res.Items[0].ID != "s3" || res.Items[1].ID != "s2" {
		t.Errorf("items = [%s %s], want [s3 s2]", res.Items[0].ID, res.Items[1].ID)
	}
	if state.RepoCounts["me/a"].Stars != 12 {
		t.Errorf("updated star count = %d, want 12", state.RepoCounts["me/a"].Stars)
	}
	if state.RepoETags["me/a"] == "" {
		t.Error("RepoETags[me/a] not stored after fetching events")
	}
}

func TestPollUnreadCountAndMarkRead(t *testing.T) {
	t0 := time.Date(2026, 6, 13, 8, 0, 0, 0, time.UTC)
	client := &fakeClient{repos: []github.UserRepo{
		{FullName: "me/a", Name: "a", Owner: github.Actor{Login: "me"}, StargazersCount: 10},
	}}
	state := &State{
		Initialized: true,
		RepoCounts:  map[string]RepoCount{"me/a": {Stars: 10}},
		Items: []Item{
			{ID: "i2", CreatedAt: t0.Add(2 * time.Hour)},
			{ID: "i1", CreatedAt: t0.Add(1 * time.Hour)},
		},
	}

	res := Poll(context.Background(), client, state)
	if res.UnreadCount != 2 {
		t.Errorf("UnreadCount = %d, want 2 (nothing read yet)", res.UnreadCount)
	}

	MarkRead(state)

	res = Poll(context.Background(), client, state)
	if res.UnreadCount != 0 {
		t.Errorf("UnreadCount = %d, want 0 after MarkRead", res.UnreadCount)
	}
}

func TestPollUnauthorizedPreservesItems(t *testing.T) {
	client := &fakeClient{reposErr: &github.APIError{StatusCode: http.StatusUnauthorized}}
	state := &State{
		Initialized: true,
		RepoCounts:  map[string]RepoCount{"me/a": {Stars: 10}},
		Items:       []Item{{ID: "i1"}},
	}

	res := Poll(context.Background(), client, state)

	if !res.Unauthorized {
		t.Error("Unauthorized = false, want true on a 401")
	}
	if len(res.Items) != 1 || res.Items[0].ID != "i1" {
		t.Errorf("Items = %+v, want the existing list preserved", res.Items)
	}
}

func TestPollAccumulatesWithoutDuplicates(t *testing.T) {
	t0 := time.Date(2026, 6, 13, 8, 0, 0, 0, time.UTC)
	client := &fakeClient{
		repos:  []github.UserRepo{{FullName: "me/a", Name: "a", Owner: github.Actor{Login: "me"}, StargazersCount: 11}},
		events: map[string][]github.Event{"me/a": {star("s2", "bob", t0.Add(2*time.Hour)), star("s1", "alice", t0.Add(time.Hour))}},
	}
	state := &State{Initialized: true, RepoCounts: map[string]RepoCount{"me/a": {Stars: 10}}}

	// First poll: +1 star surfaces s2.
	Poll(context.Background(), client, state)

	// Second poll: another +1 star; the events page still lists s2 alongside
	// the new s3. s2 must not be duplicated.
	client.repos[0].StargazersCount = 12
	client.events["me/a"] = []github.Event{
		star("s3", "carol", t0.Add(3*time.Hour)),
		star("s2", "bob", t0.Add(2*time.Hour)),
		star("s1", "alice", t0.Add(time.Hour)),
	}
	res := Poll(context.Background(), client, state)

	if len(res.Items) != 2 {
		t.Fatalf("len(Items) = %d, want 2 (s3, s2 deduped), got %+v", len(res.Items), res.Items)
	}
	if res.Items[0].ID != "s3" || res.Items[1].ID != "s2" {
		t.Errorf("items = [%s %s], want [s3 s2]", res.Items[0].ID, res.Items[1].ID)
	}
}
