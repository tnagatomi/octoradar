package notifications

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"time"
)

// appDir is the per-user config directory, shared with the main config file.
const appDir = "octoradar"

// maxItems caps the retained reaction list, matching the feed's cap.
const maxItems = 200

// capItems trims a newest-first item list to maxItems, dropping the oldest
// entries past the cap.
func capItems(items []Item) []Item {
	if len(items) > maxItems {
		return items[:maxItems]
	}
	return items
}

// State is the persisted reaction tracking state. RepoEventIDs holds, per
// repository, the recently seen reaction event IDs the next poll diffs against;
// a repository's presence in the map marks it as baselined, so cold start, new
// repositories, and failed fetches are all handled by membership. RepoETags
// keeps per-repo conditional-request tags so unchanged repos cost no rate
// limit; Items is the capped, newest-first list shown in the UI; ReadWatermark
// is the timestamp up to which the user has seen reactions, so anything newer
// counts as unread.
type State struct {
	RepoEventIDs  map[string][]string `json:"repoEventIDs"`
	RepoETags     map[string]string   `json:"repoETags"`
	Items         []Item              `json:"items"`
	ReadWatermark time.Time           `json:"readWatermark"`
}

// Path returns the location of the reaction state file.
func Path() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, appDir, "notifications.json"), nil
}

// Load reads the state from disk. A missing file yields an empty,
// uninitialized state so the first poll establishes a baseline.
func Load() (*State, error) {
	path, err := Path()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return &State{}, nil
	}
	if err != nil {
		return nil, err
	}
	var state State
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, err
	}
	return &state, nil
}

// Save persists the state to disk.
func (s *State) Save() error {
	path, err := Path()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}
