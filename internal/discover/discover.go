// Package discover surfaces trending repositories by approximating GitHub's
// trending page with the search API: recently created repositories ordered by
// star count. The trending algorithm itself has no public API, so the period
// labels map to practical creation windows rather than literal day counts.
package discover

import "time"

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

// windowStart returns the lower bound for a repository's creation date given
// the requested period, relative to now.
func windowStart(now time.Time, period string) time.Time {
	days, ok := windowDays[period]
	if !ok {
		days = defaultWindowDays
	}
	return now.AddDate(0, 0, -days)
}
