import {describe, expect, it} from 'vitest';
import {loadPreference, resolveTheme, savePreference} from './theme';

// An in-memory Storage stand-in so persistence can be tested without a DOM,
// matching the helper used in readPosition.test.ts.
function fakeStorage(initial: Record<string, string> = {}) {
    const store = new Map<string, string>(Object.entries(initial));
    return {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, v),
        store,
    };
}

describe('resolveTheme', () => {
    it('returns the explicit preference unchanged for light', () => {
        expect(resolveTheme('light', false)).toBe('light');
    });

    it('returns the explicit preference unchanged for dark, ignoring the OS', () => {
        expect(resolveTheme('dark', false)).toBe('dark');
    });

    it('follows the OS when auto and the OS prefers dark', () => {
        expect(resolveTheme('auto', true)).toBe('dark');
    });

    it('follows the OS when auto and the OS prefers light', () => {
        expect(resolveTheme('auto', false)).toBe('light');
    });
});

describe('loadPreference', () => {
    it('defaults to auto when nothing is stored', () => {
        expect(loadPreference(fakeStorage())).toBe('auto');
    });

    it('returns a stored valid preference', () => {
        expect(loadPreference(fakeStorage({'octoradar.theme.v1': 'dark'}))).toBe('dark');
        expect(loadPreference(fakeStorage({'octoradar.theme.v1': 'light'}))).toBe('light');
    });

    it('falls back to auto for an unrecognized stored value', () => {
        expect(loadPreference(fakeStorage({'octoradar.theme.v1': 'neon'}))).toBe('auto');
    });

    it('falls back to auto when storage is unavailable', () => {
        expect(loadPreference(null)).toBe('auto');
    });
});

describe('savePreference', () => {
    it('persists the preference so it round-trips through loadPreference', () => {
        const storage = fakeStorage();
        savePreference('dark', storage);
        expect(loadPreference(storage)).toBe('dark');
    });

    it('swallows write failures rather than throwing', () => {
        const throwing = {
            getItem: () => null,
            setItem: () => {
                throw new Error('quota exceeded');
            },
        };
        expect(() => savePreference('light', throwing)).not.toThrow();
    });
});
