import {describe, expect, it} from 'vitest';
import {defaultPrefs, loadPrefs, savePrefs, type DiscoverPrefs} from './discover';

// A minimal in-memory storage stand-in so the pure load/save logic can be
// tested without a DOM.
function memoryStorage(initial: Record<string, string> = {}) {
    const map = new Map<string, string>(Object.entries(initial));
    return {
        getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
        setItem: (k: string, v: string) => void map.set(k, v),
        read: (k: string) => map.get(k) ?? null,
    };
}

describe('loadPrefs', () => {
    it('returns the defaults when nothing is stored', () => {
        expect(loadPrefs(memoryStorage())).toEqual(defaultPrefs);
    });

    it('round-trips a saved value', () => {
        const storage = memoryStorage();
        const prefs: DiscoverPrefs = {period: 'quarter', language: 'go'};
        savePrefs(prefs, storage);
        expect(loadPrefs(storage)).toEqual(prefs);
    });

    it('falls back to the default period when the stored one is unknown', () => {
        const storage = memoryStorage({
            'octoradar.discover.v1': JSON.stringify({period: 'decade', language: 'rust'}),
        });
        expect(loadPrefs(storage)).toEqual({period: defaultPrefs.period, language: 'rust'});
    });

    it('coerces a non-string language to the default', () => {
        const storage = memoryStorage({
            'octoradar.discover.v1': JSON.stringify({period: 'week', language: 42}),
        });
        expect(loadPrefs(storage)).toEqual({period: 'week', language: ''});
    });

    it('returns the defaults on a corrupt payload', () => {
        const storage = memoryStorage({'octoradar.discover.v1': 'not json'});
        expect(loadPrefs(storage)).toEqual(defaultPrefs);
    });

    it('returns the defaults when storage is unavailable', () => {
        expect(loadPrefs(null)).toEqual(defaultPrefs);
    });
});

describe('savePrefs', () => {
    it('writes the prefs as JSON under the versioned key', () => {
        const storage = memoryStorage();
        savePrefs({period: 'month', language: ''}, storage);
        expect(JSON.parse(storage.read('octoradar.discover.v1')!)).toEqual({period: 'month', language: ''});
    });

    it('is a no-op when storage is unavailable', () => {
        expect(() => savePrefs({period: 'month', language: ''}, null)).not.toThrow();
    });
});
