// Package notifications tracks reactions to the authenticated user's own
// repositories — the stars and forks GitHub itself does not notify about.
package notifications

import (
	"time"

	"github.com/tnagatomi/octoradar/internal/github"
)

// Item is a single reaction on one of the user's repositories, rendered as
// "<actor> <action> <target>". Its shape mirrors the feed item so the same
// frontend component renders both. Trailer is unused by reactions but kept
// for that shared shape.
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

// parseReactions converts a repository's events into reaction items, keeping
// only stars (WatchEvent) and forks (ForkEvent); all other event types a repo
// emits (pushes, issues, ...) are dropped.
func parseReactions(events []github.Event) []Item {
	var items []Item
	for _, ev := range events {
		var action string
		switch ev.Type {
		case "WatchEvent":
			action = "starred"
		case "ForkEvent":
			action = "forked"
		default:
			continue
		}
		items = append(items, Item{
			ID:        ev.ID,
			Actor:     ev.Actor.Login,
			AvatarURL: ev.Actor.AvatarURL,
			Type:      ev.Type,
			Action:    action,
			Target:    ev.Repo.Name,
			TargetURL: "https://github.com/" + ev.Repo.Name,
			CreatedAt: ev.CreatedAt,
		})
	}
	return items
}
