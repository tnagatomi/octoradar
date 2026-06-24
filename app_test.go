package main

import (
	"errors"
	"fmt"
	"slices"
	"testing"

	"github.com/tnagatomi/octoradar/internal/config"
	"github.com/zalando/go-keyring"
)

// redirectHome points os.UserConfigDir at a temp dir and swaps the keychain
// for an in-memory mock so tests never touch the real config dir or keychain.
func redirectHome(t *testing.T) {
	t.Helper()
	keyring.MockInit()
	t.Setenv("HOME", t.TempDir())
	t.Setenv("XDG_CONFIG_HOME", "")
}

func TestGetSettingsExposesLogin(t *testing.T) {
	redirectHome(t)

	a := &App{cfg: &config.Config{Token: "gho_secret", Login: "alice", Users: []string{"bob"}}}

	s := a.GetSettings()
	if !s.HasToken {
		t.Error("HasToken = false, want true")
	}
	if s.Login != "alice" {
		t.Errorf("Login = %q, want alice", s.Login)
	}
	if s.MaxUsers != maxUsers {
		t.Errorf("MaxUsers = %d, want %d", s.MaxUsers, maxUsers)
	}
}

func TestAddUsersAppendsAndSorts(t *testing.T) {
	redirectHome(t)

	a := &App{cfg: &config.Config{Token: "gho_secret", Login: "alice", Users: []string{"bob"}}}

	s, err := a.AddUsers([]string{"carol", "dave"})
	if err != nil {
		t.Fatalf("AddUsers: %v", err)
	}
	if want := []string{"bob", "carol", "dave"}; !slices.Equal(s.Users, want) {
		t.Errorf("Users = %v, want %v", s.Users, want)
	}
}

func TestAddUsersDeduplicates(t *testing.T) {
	redirectHome(t)

	a := &App{cfg: &config.Config{Token: "t", Users: []string{"bob"}}}

	// "BOB" duplicates the existing entry case-insensitively; "carol" appears
	// twice in the input and "@dave" carries a leading @. The result keeps one
	// of each, normalized.
	s, err := a.AddUsers([]string{"BOB", "carol", "Carol", "@dave"})
	if err != nil {
		t.Fatalf("AddUsers: %v", err)
	}
	if want := []string{"bob", "carol", "dave"}; !slices.Equal(s.Users, want) {
		t.Errorf("Users = %v, want %v", s.Users, want)
	}
}

func TestAddUsersRejectsWhenOverCap(t *testing.T) {
	redirectHome(t)

	existing := make([]string, maxUsers-1)
	for i := range existing {
		existing[i] = fmt.Sprintf("u%03d", i)
	}
	a := &App{cfg: &config.Config{Token: "t", Users: existing}}

	// One slot remains, but two new users are offered: the whole batch is
	// rejected and nothing is added.
	_, err := a.AddUsers([]string{"newa", "newb"})
	if err == nil {
		t.Fatal("AddUsers returned nil error, want a cap error")
	}
	if got := len(a.cfg.Users); got != maxUsers-1 {
		t.Errorf("Users length = %d, want %d (nothing added)", got, maxUsers-1)
	}
}

func TestAddUsersEmptyInputNoop(t *testing.T) {
	redirectHome(t)

	a := &App{cfg: &config.Config{Token: "t", Users: []string{"bob"}}}

	s, err := a.AddUsers([]string{"", "  ", "@"})
	if err != nil {
		t.Fatalf("AddUsers: %v", err)
	}
	if len(s.Users) != 1 || s.Users[0] != "bob" {
		t.Errorf("Users = %v, want [bob]", s.Users)
	}
}

func TestSignOutClearsTokenAndLogin(t *testing.T) {
	redirectHome(t)

	a := &App{cfg: &config.Config{Token: "gho_secret", Login: "alice", Users: []string{"bob"}}}

	s, err := a.SignOut()
	if err != nil {
		t.Fatalf("SignOut: %v", err)
	}
	if s.HasToken {
		t.Error("HasToken = true after sign out, want false")
	}
	if s.Login != "" {
		t.Errorf("Login = %q after sign out, want empty", s.Login)
	}
	// The follow list survives a sign out so it is restored on the next login.
	if len(s.Users) != 1 || s.Users[0] != "bob" {
		t.Errorf("Users = %v, want [bob]", s.Users)
	}

	// The token must be gone from the keychain.
	if _, err := keyring.Get("octoradar", "github-token"); !errors.Is(err, keyring.ErrNotFound) {
		t.Errorf("expected the keychain entry to be cleared, got err=%v", err)
	}
}
