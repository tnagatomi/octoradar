package github

import (
	"strings"
	"testing"
)

func TestBuildAuthorQueries(t *testing.T) {
	tests := []struct {
		name      string
		usernames []string
		want      []string
	}{
		{
			name:      "empty",
			usernames: nil,
			want:      nil,
		},
		{
			name:      "single",
			usernames: []string{"alice"},
			want:      []string{"is:pr is:merged (author:alice)"},
		},
		{
			name:      "fits in one query",
			usernames: []string{"alice", "bob", "carol"},
			want:      []string{"is:pr is:merged (author:alice OR author:bob OR author:carol)"},
		},
		{
			name:      "splits after six authors",
			usernames: []string{"u1", "u2", "u3", "u4", "u5", "u6", "u7"},
			want: []string{
				"is:pr is:merged (author:u1 OR author:u2 OR author:u3 OR author:u4 OR author:u5 OR author:u6)",
				"is:pr is:merged (author:u7)",
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := buildAuthorQueries(tt.usernames)
			if len(got) != len(tt.want) {
				t.Fatalf("got %d queries %q, want %d", len(got), got, len(tt.want))
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Errorf("query %d:\ngot  %q\nwant %q", i, got[i], tt.want[i])
				}
			}
		})
	}
}

func TestBuildAuthorQueriesRespectsLengthLimit(t *testing.T) {
	// GitHub usernames max out at 39 characters; long names must force
	// splits below the 256-character query limit.
	long := strings.Repeat("a", 39)
	usernames := []string{long + "1", long + "2", long + "3", long + "4", long + "5", long + "6"}
	queries := buildAuthorQueries(usernames)
	if len(queries) < 2 {
		t.Fatalf("expected long usernames to split into multiple queries, got %d", len(queries))
	}
	for _, q := range queries {
		if len(q) > 256 {
			t.Errorf("query exceeds 256 characters (%d): %q", len(q), q)
		}
	}
	joined := strings.Join(queries, " ")
	for _, u := range usernames {
		if !strings.Contains(joined, "author:"+u) {
			t.Errorf("username %s missing from queries", u)
		}
	}
}
