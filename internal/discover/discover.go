// Package discover surfaces trending repositories by approximating GitHub's
// trending page with the search API: recently created repositories ordered by
// star count. The trending algorithm itself has no public API, so the period
// labels map to practical creation windows rather than literal day counts.
package discover

import (
	"fmt"
	"strings"
	"time"
)

// windowDays maps a period to the number of days back its "created since"
// boundary reaches. The windows are wider than their labels suggest because a
// literal one-day window yields too few starred repositories to be useful; the
// labels ("This week/month/quarter") are chosen to stay honest about the
// actual span. An unknown period falls back to the month window.
var windowDays = map[string]int{
	"week":    7,
	"month":   30,
	"quarter": 90,
}

const defaultWindowDays = 30

// buildQuery assembles the search query for trending repositories: those
// created since the period's window boundary, optionally restricted to a
// single language. Sorting by stars is applied by the client, not here. A
// blank language is omitted so the search spans all languages.
func buildQuery(now time.Time, period, language string) string {
	query := fmt.Sprintf("created:>=%s", windowStart(now, period).Format("2006-01-02"))
	if lang := strings.TrimSpace(language); lang != "" {
		query += " language:" + lang
	}
	return query
}

// windowStart returns the lower bound for a repository's creation date given
// the requested period, relative to now.
func windowStart(now time.Time, period string) time.Time {
	days, ok := windowDays[period]
	if !ok {
		days = defaultWindowDays
	}
	return now.AddDate(0, 0, -days)
}
