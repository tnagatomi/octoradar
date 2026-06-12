package main

import (
	"errors"
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
