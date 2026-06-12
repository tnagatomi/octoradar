package config

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

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

func TestSaveLoadRoundTrip(t *testing.T) {
	redirectHome(t)

	cfg := &Config{Token: "gho_secret", Users: []string{"alice"}}
	if err := cfg.Save(); err != nil {
		t.Fatalf("Save: %v", err)
	}

	// The token must never be written to disk.
	path, err := Path()
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "gho_secret") {
		t.Errorf("token leaked into config.json: %s", data)
	}

	loaded, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if loaded.Token != "gho_secret" {
		t.Errorf("token = %q, want gho_secret", loaded.Token)
	}
	if len(loaded.Users) != 1 || loaded.Users[0] != "alice" {
		t.Errorf("users = %v, want [alice]", loaded.Users)
	}
}

func TestSaveLoadPersistsLogin(t *testing.T) {
	redirectHome(t)

	cfg := &Config{Token: "gho_secret", Login: "alice", Users: []string{"bob"}}
	if err := cfg.Save(); err != nil {
		t.Fatalf("Save: %v", err)
	}

	loaded, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if loaded.Login != "alice" {
		t.Errorf("login = %q, want alice", loaded.Login)
	}
}

func TestLoadMigratesPlaintextToken(t *testing.T) {
	redirectHome(t)

	// Seed a legacy config that still holds the token in plain text.
	path, err := Path()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(`{"token":"gho_legacy","users":["bob"]}`), 0o600); err != nil {
		t.Fatal(err)
	}

	loaded, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if loaded.Token != "gho_legacy" {
		t.Errorf("token = %q, want gho_legacy", loaded.Token)
	}

	// The token must be moved into the keychain and removed from disk.
	got, err := keyring.Get(keyringService, keyringUser)
	if err != nil {
		t.Fatalf("keyring.Get: %v", err)
	}
	if got != "gho_legacy" {
		t.Errorf("keychain token = %q, want gho_legacy", got)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "gho_legacy") {
		t.Errorf("legacy token still on disk: %s", data)
	}
}

func TestSaveEmptyTokenClearsKeychain(t *testing.T) {
	redirectHome(t)

	if err := (&Config{Token: "gho_secret", Users: []string{"alice"}}).Save(); err != nil {
		t.Fatal(err)
	}
	// Signing out persists an empty token.
	if err := (&Config{Token: "", Users: []string{"alice"}}).Save(); err != nil {
		t.Fatal(err)
	}

	if _, err := keyring.Get(keyringService, keyringUser); !errors.Is(err, keyring.ErrNotFound) {
		t.Errorf("expected the keychain entry to be cleared, got err=%v", err)
	}
}
