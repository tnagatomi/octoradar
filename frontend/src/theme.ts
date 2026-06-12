// Color-theme preference for the app.
//
// The user picks one of three preferences and we persist it in localStorage:
//
//   - auto:  follow the OS setting (prefers-color-scheme).
//   - light: always light.
//   - dark:  always dark.
//
// "auto" is resolved to a concrete light/dark theme at apply time, so the rest
// of the UI only ever deals with a resolved theme. Everything here is pure and
// storage-injectable so it can be unit tested without a DOM, mirroring
// readPosition.ts.

export type ThemePreference = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

// Shared with the inline bootstrap script in index.html, which reads the same
// key before first paint. Keep the two in sync.
export const STORAGE_KEY = 'octoradar.theme.v1';

const DEFAULT_PREFERENCE: ThemePreference = 'auto';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
    try {
        return window.localStorage;
    } catch {
        // localStorage can throw under strict privacy settings.
        return null;
    }
}

function isThemePreference(value: unknown): value is ThemePreference {
    return value === 'auto' || value === 'light' || value === 'dark';
}

// Read the stored preference, falling back to "auto" for a missing, corrupt, or
// unreadable value so a bad entry never blocks launch.
export function loadPreference(storage: StorageLike | null = defaultStorage()): ThemePreference {
    if (!storage) {
        return DEFAULT_PREFERENCE;
    }
    let raw: string | null;
    try {
        raw = storage.getItem(STORAGE_KEY);
    } catch {
        return DEFAULT_PREFERENCE;
    }
    return isThemePreference(raw) ? raw : DEFAULT_PREFERENCE;
}

// Persist the preference, ignoring write failures (quota or privacy mode) so a
// theme change never surfaces an error to the user.
export function savePreference(pref: ThemePreference, storage: StorageLike | null = defaultStorage()): void {
    if (!storage) {
        return;
    }
    try {
        storage.setItem(STORAGE_KEY, pref);
    } catch {
        // Ignore quota / privacy-mode write failures.
    }
}

// Resolve a preference to the concrete theme to apply. "auto" follows the OS,
// whose dark-mode state the caller supplies (window.matchMedia in the app).
export function resolveTheme(pref: ThemePreference, prefersDark: boolean): ResolvedTheme {
    if (pref === 'auto') {
        return prefersDark ? 'dark' : 'light';
    }
    return pref;
}
