// Package config persists application settings on disk.
package config

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
)

// Config holds the persisted application settings.
//
// The token is stored as plain text for now; moving it to the OS
// keychain is planned before any distribution.
type Config struct {
	Token string   `json:"token"`
	Users []string `json:"users"`
}

// appDir is the per-user config directory name. legacyAppDir is the name
// used before the app was renamed from octofeed; it is read once so an
// existing token and follow list survive the rename.
const (
	appDir       = "octoradar"
	legacyAppDir = "octofeed"
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
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
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
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	// Best-effort migration; ignore failure so a read-only legacy dir
	// does not block startup.
	_ = cfg.Save()
	return &cfg, nil
}

// Save writes the config to disk with owner-only permissions.
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
	return os.WriteFile(path, data, 0o600)
}
