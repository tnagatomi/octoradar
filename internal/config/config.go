// Package config persists application settings on disk.
package config

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/zalando/go-keyring"
)

// Config holds the persisted application settings. The token lives in the
// OS keychain; the non-secret login and follow list are written to disk.
type Config struct {
	Token string   `json:"-"`
	Login string   `json:"login"`
	Users []string `json:"users"`
}

// appDir is the per-user config directory name. legacyAppDir is the name
// used before the app was renamed from octofeed; it is read once so an
// existing token and follow list survive the rename.
const (
	appDir       = "octoradar"
	legacyAppDir = "octofeed"
)

// keyring identifiers for the GitHub token.
const (
	keyringService = "octoradar"
	keyringUser    = "github-token"
)

// Path returns the location of the config file.
func Path() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, appDir, "config.json"), nil
}

// legacyPath returns the pre-rename config location.
func legacyPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, legacyAppDir, "config.json"), nil
}

// Load reads the config from disk. A missing file yields an empty config.
// If no config exists at the current path but a legacy one does, it is
// loaded and migrated to the new location.
func Load() (*Config, error) {
	path, err := Path()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return loadLegacy()
	}
	if err != nil {
		return nil, err
	}
	return fromFile(data)
}

// loadLegacy reads a pre-rename config and persists it at the new path.
// A missing legacy file yields an empty config.
func loadLegacy() (*Config, error) {
	path, err := legacyPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return &Config{}, nil
	}
	if err != nil {
		return nil, err
	}
	return fromFile(data)
}

// fromFile parses the on-disk settings and resolves the token from the
// keychain. A token still stored as plain text on disk (from before the
// keychain migration) is moved into the keychain and stripped from the file.
func fromFile(data []byte) (*Config, error) {
	var file struct {
		Token string   `json:"token"`
		Login string   `json:"login"`
		Users []string `json:"users"`
	}
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, err
	}
	cfg := &Config{Login: file.Login, Users: file.Users}

	token, err := keyring.Get(keyringService, keyringUser)
	if err != nil && !errors.Is(err, keyring.ErrNotFound) {
		return nil, err
	}
	cfg.Token = token

	if cfg.Token == "" && file.Token != "" {
		cfg.Token = file.Token
		if err := cfg.Save(); err != nil {
			return nil, err
		}
	}
	return cfg, nil
}

// Save persists the non-secret settings to disk and the token to the OS
// keychain. An empty token removes any stored keychain entry.
func (c *Config) Save() error {
	path, err := Path()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return err
	}

	if c.Token == "" {
		err := keyring.Delete(keyringService, keyringUser)
		if err != nil && !errors.Is(err, keyring.ErrNotFound) {
			return err
		}
		return nil
	}
	return keyring.Set(keyringService, keyringUser, c.Token)
}
