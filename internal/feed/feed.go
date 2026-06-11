// Package feed aggregates GitHub events into renderable feed items.
package feed

import (
	"cmp"
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/tnagatomi/octoradar/internal/github"
)

// maxItems caps the merged feed size returned to the UI.
const maxItems = 200

// Item is a single feed entry, rendered as "<actor> <action> <target> <trailer>"
// where the target is a link.
type Item struct {
	ID        string    `json:"id"`
	Actor     string    `json:"actor"`
	AvatarURL string    `json:"avatarUrl"`
	Type      string    `json:"type"`
	Action    string    `json:"action"`
	Target    string    `json:"target"`
	TargetURL string    `json:"targetUrl"`
	Trailer   string    `json:"trailer"`
	CreatedAt time.Time `json:"createdAt"`
}

// Result is a merged feed along with per-user fetch failures, so one
// failing user does not blank out the whole feed. Unauthorized is set when
// any request was rejected with a 401, signalling that the token must be
// re-entered; the noisy per-request 401s are suppressed in that case.
type Result struct {
	Items        []Item   `json:"items"`
	Errors       []string `json:"errors"`
	Unauthorized bool     `json:"unauthorized"`
}

// Fetch retrieves events for all usernames concurrently and merges them
// into a single timeline, newest first. Only event types with a mapping
// in newItem appear in the result.
func Fetch(ctx context.Context, client *github.Client, usernames []string) Result {
	var (
		mu           sync.Mutex
		wg           sync.WaitGroup
		items        = []Item{}
		errs         = []string{}
		unauthorized bool
	)
	for _, username := range usernames {
		wg.Add(1)
		go func() {
			defer wg.Done()
			events, err := client.UserEvents(ctx, username)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				if github.IsUnauthorized(err) {
					unauthorized = true
					return
				}
				errs = append(errs, fmt.Sprintf("%s: %v", username, err))
				return
			}
			for _, ev := range events {
				if item, ok := newItem(ev); ok {
					items = append(items, item)
				}
			}
		}()
	}
	if len(usernames) > 0 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			prs, err := client.MergedPullRequests(ctx, usernames)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				if github.IsUnauthorized(err) {
					unauthorized = true
					return
				}
				errs = append(errs, fmt.Sprintf("merged pull requests: %v", err))
				return
			}
			for _, pr := range prs {
				items = append(items, newMergedPRItem(pr))
			}
		}()
	}
	wg.Wait()

	sort.Slice(items, func(i, j int) bool { return items[i].CreatedAt.After(items[j].CreatedAt) })
	if len(items) > maxItems {
		items = items[:maxItems]
	}
	sort.Strings(errs)
	return Result{Items: items, Errors: errs, Unauthorized: unauthorized}
}

// newItem converts a raw event into a display item. It returns false for
// event types the feed does not surface (pushes, issues, comments, ...).
func newItem(ev github.Event) (Item, bool) {
	item := Item{
		ID:        ev.ID,
		Actor:     ev.Actor.Login,
		AvatarURL: ev.Actor.AvatarURL,
		Type:      ev.Type,
		CreatedAt: ev.CreatedAt,
	}
	repoURL := "https://github.com/" + ev.Repo.Name

	switch ev.Type {
	case "WatchEvent":
		item.Action = "starred"
		item.Target = ev.Repo.Name
		item.TargetURL = repoURL

	case "ForkEvent":
		item.Action = "forked"
		item.Target = ev.Repo.Name
		item.TargetURL = repoURL

	case "ReleaseEvent":
		var p struct {
			Release struct {
				Name    string `json:"name"`
				TagName string `json:"tag_name"`
				HTMLURL string `json:"html_url"`
			} `json:"release"`
		}
		json.Unmarshal(ev.Payload, &p)
		item.Action = "released"
		item.Target = ev.Repo.Name
		item.TargetURL = cmp.Or(p.Release.HTMLURL, repoURL)
		item.Trailer = cmp.Or(p.Release.Name, p.Release.TagName)

	case "PublicEvent":
		item.Action = "made"
		item.Target = ev.Repo.Name
		item.TargetURL = repoURL
		item.Trailer = "public"

	case "CreateEvent":
		// Only repository creation is surfaced; branch and tag creation
		// would flood the timeline.
		var p struct {
			RefType string `json:"ref_type"`
		}
		json.Unmarshal(ev.Payload, &p)
		if p.RefType != "repository" {
			return Item{}, false
		}
		item.Action = "created"
		item.Target = ev.Repo.Name
		item.TargetURL = repoURL

	case "SponsorshipEvent":
		var p struct {
			Sponsorship struct {
				Sponsorable struct {
					Login   string `json:"login"`
					HTMLURL string `json:"html_url"`
				} `json:"sponsorable"`
			} `json:"sponsorship"`
		}
		json.Unmarshal(ev.Payload, &p)
		item.Action = "sponsored"
		if login := p.Sponsorship.Sponsorable.Login; login != "" {
			item.Target = login
			item.TargetURL = cmp.Or(p.Sponsorship.Sponsorable.HTMLURL, "https://github.com/"+login)
		} else {
			item.Target = "a developer"
			item.TargetURL = "https://github.com/" + ev.Actor.Login + "?tab=sponsoring"
		}

	default:
		return Item{}, false
	}
	return item, true
}

// newMergedPRItem converts a merged pull request authored by a followed
// user into a feed item, timestamped at the moment of the merge.
func newMergedPRItem(pr github.MergedPullRequest) Item {
	return Item{
		ID:        fmt.Sprintf("merged-pr-%d", pr.ID),
		Actor:     pr.AuthorLogin,
		AvatarURL: pr.AuthorAvatar,
		Type:      "MergedPullRequest",
		Action:    "got a pull request merged into",
		Target:    fmt.Sprintf("%s #%d", pr.RepoName, pr.Number),
		TargetURL: pr.HTMLURL,
		Trailer:   pr.Title,
		CreatedAt: pr.MergedAt,
	}
}
