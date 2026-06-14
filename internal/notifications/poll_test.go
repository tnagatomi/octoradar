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

// fakeClient is a stand-in for the github client. It records the ETag sent with
// each repo's request so tests can assert the baseline-without-ETag migration
// path, and can be told to reply 304 or error per repo.
type fakeClient struct {
	repos       []github.UserRepo
	reposErr    error
	events      map[string][]github.Event
	eventsErr   map[string]error
	notModified map[string]bool
	etagsSent   map[string]string
}

func (f *fakeClient) OwnedRepos(_ context.Context) ([]github.UserRepo, error) {
	return f.repos, f.reposErr
}

func (f *fakeClient) RepoEvents(_ context.Context, owner, repo, etag string) ([]github.Event, string, bool, error) {
	key := owner + "/" + repo
	if f.etagsSent == nil {
		f.etagsSent = map[string]string{}
	}
	f.etagsSent[key] = etag
	if err := f.eventsErr[key]; err != nil {
		return nil, "", false, err
	}
	if f.notModified[key] {
		return nil, etag, true, nil
	}
	return f.events[key], `"etag-` + key + `"`, false, nil
}

func TestPollColdStartBaselinesWithoutEmitting(t *testing.T) {
	t0 := time.Date(2026, 6, 14, 8, 0, 0, 0, time.UTC)
	client := &fakeClient{
		repos:  []github.UserRepo{{FullName: "me/a", Name: "a", Owner: github.Actor{Login: "me"}}},
		events: map[string][]github.Event{"me/a": {star("s2", "bob", t0.Add(2*time.Hour)), star("s1", "alice", t0.Add(time.Hour))}},
	}
	state := &State{}

	res := Poll(context.Background(), client, state)

	if client.etagsSent["me/a"] != "" {
		t.Errorf("baseline request sent ETag %q, want none", client.etagsSent["me/a"])
	}
	if len(state.RepoEventIDs["me/a"]) != 2 {
		t.Errorf("baseline RepoEventIDs[me/a] = %v, want the two event ids recorded", state.RepoEventIDs["me/a"])
	}
	if len(res.Items) != 0 {
		t.Errorf("Items = %+v, want none on the baseline poll", res.Items)
	}
	if res.UnreadCount != 0 {
		t.Errorf("UnreadCount = %d, want 0", res.UnreadCount)
	}
}

// TestPollDetectsNewReactionByEventID is the core of the redesign: alice
// unstars and bob stars between polls, so the star count is unchanged, yet bob's
// new WatchEvent must still surface because its event ID is unknown.
func TestPollDetectsNewReactionByEventID(t *testing.T) {
	t0 := time.Date(2026, 6, 14, 8, 0, 0, 0, time.UTC)
	client := &fakeClient{
		repos: []github.UserRepo{{FullName: "me/a", Name: "a", Owner: github.Actor{Login: "me"}}},
		events: map[string][]github.Event{"me/a": {
			star("s2", "bob", t0.Add(2*time.Hour)),
			star("s1", "alice", t0.Add(time.Hour)),
		}},
	}
	state := &State{
		RepoEventIDs: map[string][]string{"me/a": {"s1"}},
		RepoETags:    map[string]string{"me/a": `"old"`},
	}

	res := Poll(context.Background(), client, state)

	if client.etagsSent["me/a"] != `"old"` {
		t.Errorf("baselined repo sent ETag %q, want the stored \"old\"", client.etagsSent["me/a"])
	}
	if len(res.Items) != 1 || res.Items[0].ID != "s2" {
		t.Fatalf("Items = %+v, want only the new star s2", res.Items)
	}
	if len(state.RepoEventIDs["me/a"]) != 2 {
		t.Errorf("RepoEventIDs[me/a] = %v, want s2 folded into the set", state.RepoEventIDs["me/a"])
	}
}

// TestPollMigratesEtagOnlyStateByBaselining covers upgrading from the old
// count-delta state, which has ETags but no event-ID baseline. The repo must be
// fetched without its stale ETag so a baseline is recorded instead of a 304
// swallowing the first real reaction.
func TestPollMigratesEtagOnlyStateByBaselining(t *testing.T) {
	t0 := time.Date(2026, 6, 14, 8, 0, 0, 0, time.UTC)
	client := &fakeClient{
		repos:  []github.UserRepo{{FullName: "me/a", Name: "a", Owner: github.Actor{Login: "me"}}},
		events: map[string][]github.Event{"me/a": {star("s1", "alice", t0.Add(time.Hour))}},
	}
	state := &State{RepoETags: map[string]string{"me/a": `"stale"`}}

	res := Poll(context.Background(), client, state)

	if client.etagsSent["me/a"] != "" {
		t.Errorf("migration request sent ETag %q, want none so a baseline is recorded", client.etagsSent["me/a"])
	}
	if len(res.Items) != 0 {
		t.Errorf("Items = %+v, want none while baselining the migrated repo", res.Items)
	}
	if len(state.RepoEventIDs["me/a"]) != 1 {
		t.Errorf("RepoEventIDs[me/a] = %v, want the baseline recorded", state.RepoEventIDs["me/a"])
	}
}

func TestPollSkipsNotModified(t *testing.T) {
	client := &fakeClient{
		repos:       []github.UserRepo{{FullName: "me/a", Name: "a", Owner: github.Actor{Login: "me"}}},
		notModified: map[string]bool{"me/a": true},
	}
	state := &State{
		RepoEventIDs: map[string][]string{"me/a": {"s1"}},
		RepoETags:    map[string]string{"me/a": `"etag"`},
	}

	res := Poll(context.Background(), client, state)

	if len(res.Items) != 0 {
		t.Errorf("Items = %+v, want none on a 304", res.Items)
	}
	if len(res.Errors) != 0 {
		t.Errorf("Errors = %v, want none on a 304", res.Errors)
	}
}

func TestPollAccumulatesWithoutDuplicates(t *testing.T) {
	t0 := time.Date(2026, 6, 14, 8, 0, 0, 0, time.UTC)
	client := &fakeClient{
		repos:  []github.UserRepo{{FullName: "me/a", Name: "a", Owner: github.Actor{Login: "me"}}},
		events: map[string][]github.Event{"me/a": {star("s2", "bob", t0.Add(2*time.Hour))}},
	}
	state := &State{RepoEventIDs: map[string][]string{"me/a": {"s1"}}}

	// First poll: the new star s2 surfaces.
	Poll(context.Background(), client, state)

	// Second poll: the events page still lists s2 alongside the new s3.
	// s2 must not be duplicated in the list.
	client.events["me/a"] = []github.Event{
		star("s3", "carol", t0.Add(3*time.Hour)),
		star("s2", "bob", t0.Add(2*time.Hour)),
	}
	res := Poll(context.Background(), client, state)

	if len(res.Items) != 2 {
		t.Fatalf("len(Items) = %d, want 2 (s3, s2 deduped), got %+v", len(res.Items), res.Items)
	}
	if res.Items[0].ID != "s3" || res.Items[1].ID != "s2" {
		t.Errorf("items = [%s %s], want [s3 s2]", res.Items[0].ID, res.Items[1].ID)
	}
}

func TestPollUnreadCountAndMarkRead(t *testing.T) {
	t0 := time.Date(2026, 6, 14, 8, 0, 0, 0, time.UTC)
	client := &fakeClient{
		repos:       []github.UserRepo{{FullName: "me/a", Name: "a", Owner: github.Actor{Login: "me"}}},
		notModified: map[string]bool{"me/a": true},
	}
	state := &State{
		RepoEventIDs: map[string][]string{"me/a": {"i2", "i1"}},
		RepoETags:    map[string]string{"me/a": `"etag"`},
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
		RepoEventIDs: map[string][]string{"me/a": {"s1"}},
		Items:        []Item{{ID: "i1"}},
	}

	res := Poll(context.Background(), client, state)

	if !res.Unauthorized {
		t.Error("Unauthorized = false, want true on a 401")
	}
	if len(res.Items) != 1 || res.Items[0].ID != "i1" {
		t.Errorf("Items = %+v, want the existing list preserved", res.Items)
	}
}

// TestPollPrunesIneligibleRepos asserts that state for repos no longer in the
// eligible set (deleted, renamed, archived, or turned into a fork) is dropped,
// so the persisted maps do not grow unbounded.
func TestPollPrunesIneligibleRepos(t *testing.T) {
	client := &fakeClient{
		repos:       []github.UserRepo{{FullName: "me/a", Name: "a", Owner: github.Actor{Login: "me"}}},
		notModified: map[string]bool{"me/a": true},
	}
	state := &State{
		RepoEventIDs: map[string][]string{"me/a": {"s1"}, "me/gone": {"g1"}},
		RepoETags:    map[string]string{"me/a": `"etag"`, "me/gone": `"goneetag"`},
	}

	Poll(context.Background(), client, state)

	if _, ok := state.RepoEventIDs["me/gone"]; ok {
		t.Error("RepoEventIDs still has me/gone, want it pruned")
	}
	if _, ok := state.RepoETags["me/gone"]; ok {
		t.Error("RepoETags still has me/gone, want it pruned")
	}
	if _, ok := state.RepoEventIDs["me/a"]; !ok {
		t.Error("RepoEventIDs dropped me/a, want the eligible repo retained")
	}
}

// TestPollFailedRepoRetriesBaseline asserts a repo whose fetch errors stays
// unbaselined (absent from RepoEventIDs) so the next poll retries its baseline
// rather than treating it as established.
func TestPollFailedRepoRetriesBaseline(t *testing.T) {
	t0 := time.Date(2026, 6, 14, 8, 0, 0, 0, time.UTC)
	client := &fakeClient{
		repos:     []github.UserRepo{{FullName: "me/a", Name: "a", Owner: github.Actor{Login: "me"}}},
		eventsErr: map[string]error{"me/a": &github.APIError{StatusCode: http.StatusInternalServerError}},
	}
	state := &State{}

	res := Poll(context.Background(), client, state)
	if len(res.Errors) != 1 {
		t.Fatalf("Errors = %v, want one fetch failure", res.Errors)
	}
	if _, baselined := state.RepoEventIDs["me/a"]; baselined {
		t.Error("failed repo was baselined, want it left unbaselined for retry")
	}

	// Recover: the next poll succeeds and records the baseline.
	client.eventsErr = nil
	client.events = map[string][]github.Event{"me/a": {star("s1", "alice", t0)}}
	Poll(context.Background(), client, state)
	if _, baselined := state.RepoEventIDs["me/a"]; !baselined {
		t.Error("repo not baselined after a successful retry")
	}
}
