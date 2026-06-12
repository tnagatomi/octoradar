// Discover-tab filter persistence.
//
// The trending view is parameterized by a creation-window period and an
// optional language. Both survive restarts so the user returns to the filters
// they last browsed, mirroring the read-position memory in readPosition.ts.
// Everything here is pure and storage-injectable so it can be unit tested
// without a DOM.

// Period selects the creation window the backend searches within. The labels
// shown in the UI ("This week/month/quarter") stay honest about the span; the
// backend maps these values to practical day counts.
export type Period = 'week' | 'month' | 'quarter';

export const PERIODS: ReadonlyArray<{value: Period; label: string}> = [
    {value: 'week', label: 'This week'},
    {value: 'month', label: 'This month'},
    {value: 'quarter', label: 'This quarter'},
];

// The fixed language filter list. An empty value spans all languages.
export const LANGUAGES: ReadonlyArray<{value: string; label: string}> = [
    {value: '', label: 'All languages'},
    {value: 'go', label: 'Go'},
    {value: 'typescript', label: 'TypeScript'},
    {value: 'javascript', label: 'JavaScript'},
    {value: 'python', label: 'Python'},
    {value: 'rust', label: 'Rust'},
    {value: 'ruby', label: 'Ruby'},
    {value: 'java', label: 'Java'},
    {value: 'c', label: 'C'},
    {value: 'cpp', label: 'C++'},
    {value: 'csharp', label: 'C#'},
    {value: 'php', label: 'PHP'},
    {value: 'swift', label: 'Swift'},
    {value: 'kotlin', label: 'Kotlin'},
    {value: 'scala', label: 'Scala'},
    {value: 'shell', label: 'Shell'},
    {value: 'zig', label: 'Zig'},
    {value: 'lua', label: 'Lua'},
    {value: 'elixir', label: 'Elixir'},
    {value: 'dart', label: 'Dart'},
];

export interface DiscoverPrefs {
    period: Period;
    language: string;
}

// Default to a month window across all languages: wide enough that the first
// view is populated, recent enough to feel like discovery.
export const defaultPrefs: DiscoverPrefs = {period: 'month', language: ''};

const STORAGE_KEY = 'octoradar.discover.v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
    try {
        return window.localStorage;
    } catch {
        // localStorage can throw under strict privacy settings.
        return null;
    }
}

function isPeriod(value: unknown): value is Period {
    return PERIODS.some((p) => p.value === value);
}

export function loadPrefs(storage: StorageLike | null = defaultStorage()): DiscoverPrefs {
    if (!storage) {
        return {...defaultPrefs};
    }
    let raw: string | null;
    try {
        raw = storage.getItem(STORAGE_KEY);
    } catch {
        return {...defaultPrefs};
    }
    if (!raw) {
        return {...defaultPrefs};
    }
    try {
        const parsed = JSON.parse(raw);
        return {
            period: isPeriod(parsed?.period) ? parsed.period : defaultPrefs.period,
            language: typeof parsed?.language === 'string' ? parsed.language : defaultPrefs.language,
        };
    } catch {
        // Corrupt payload: start from defaults rather than crash on launch.
        return {...defaultPrefs};
    }
}

export function savePrefs(prefs: DiscoverPrefs, storage: StorageLike | null = defaultStorage()): void {
    if (!storage) {
        return;
    }
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
        // Ignore quota / privacy-mode write failures.
    }
}
