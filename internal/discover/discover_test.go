package discover

import (
	"testing"
	"time"
)

func TestWindowStart(t *testing.T) {
	now := time.Date(2026, 6, 13, 9, 30, 0, 0, time.UTC)
	tests := []struct {
		name   string
		period string
		want   string
	}{
		{name: "week", period: "week", want: "2026-06-06"},
		{name: "month", period: "month", want: "2026-05-14"},
		{name: "quarter", period: "quarter", want: "2026-03-15"},
		{name: "unknown falls back to month", period: "decade", want: "2026-05-14"},
		{name: "empty falls back to month", period: "", want: "2026-05-14"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := windowStart(now, tt.period).Format("2006-01-02")
			if got != tt.want {
				t.Errorf("windowStart(%q) = %s, want %s", tt.period, got, tt.want)
			}
		})
	}
}
