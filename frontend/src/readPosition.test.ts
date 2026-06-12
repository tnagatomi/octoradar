import {describe, expect, it} from 'vitest';
import {
    countNew,
    emptyState,
    FeedItemLike,
    itemTime,
    loadReadState,
    newestRef,
    resolveScrollTarget,
    saveReadState,
    toRef,
    type ReadState,
} from './readPosition';

// Build a newest-first feed. Index 0 is the newest; each later item is one
// minute older, matching how the backend sorts the feed.
function feed(...ids: string[]): FeedItemLike[] {
    const base = Date.parse('2026-06-11T12:00:00Z');
    return ids.map((id, i) => ({id, createdAt: new Date(base - i * 60_000).toISOString()}));
}

// An in-memory Storage stand-in so persistence can be tested without a DOM.
function fakeStorage(initial: Record<string, string> = {}) {
    const store = new Map<string, string>(Object.entries(initial));
    return {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, v),
        store,
    };
}

describe('itemTime', () => {
    it('parses an ISO timestamp into epoch milliseconds', () => {
        expect(itemTime('2026-06-11T12:00:00Z')).toBe(Date.parse('2026-06-11T12:00:00Z'));
    });

    it('falls back to 0 for unparseable values', () => {
        expect(itemTime('not a date')).toBe(0);
        expect(itemTime(undefined)).toBe(0);
        expect(itemTime(null)).toBe(0);
    });
});

describe('newestRef', () => {
    it('returns the first (newest) item as a ref', () => {
        const items = feed('a', 'b', 'c');
        expect(newestRef(items)).toEqual(toRef(items[0]));
    });

    it('returns null for an empty feed', () => {
        expect(newestRef([])).toBeNull();
    });
});

describe('resolveScrollTarget', () => {
    it('returns null when there is no anchor', () => {
        expect(resolveScrollTarget(feed('a', 'b'), null)).toBeNull();
    });

    it('returns null when the feed is empty', () => {
        expect(resolveScrollTarget([], {id: 'a', time: 1})).toBeNull();
    });

    it('returns the exact id when the anchored item is still present', () => {
        const items = feed('a', 'b', 'c', 'd');
        const anchor = toRef(items[2]); // c
        expect(resolveScrollTarget(items, anchor)).toBe('c');
    });

    it('lands on the nearest still-present item at or older than a vanished anchor', () => {
        // The anchored item "c" aged out; "b" and "d" remain. We were reading at
        // c's time, so the nearest surviving item not newer than c is d.
        const full = feed('a', 'b', 'c', 'd', 'e');
        const anchor = toRef(full[2]); // c
        const remaining = [full[0], full[1], full[3], full[4]]; // a, b, d, e
        expect(resolveScrollTarget(remaining, anchor)).toBe('d');
    });

    it('lands on the oldest item when the anchor is older than everything present', () => {
        // Anchor is older than every surviving item (its whole neighbourhood
        // aged out), so we drop to the oldest available.
        const items = feed('a', 'b', 'c');
        const anchor = {id: 'gone', time: itemTime('2000-01-01T00:00:00Z')};
        expect(resolveScrollTarget(items, anchor)).toBe('c');
    });

    it('targets the newest item when the anchor is newer than everything present', () => {
        const items = feed('a', 'b', 'c');
        const anchor = {id: 'future', time: itemTime('2030-01-01T00:00:00Z')};
        expect(resolveScrollTarget(items, anchor)).toBe('a');
    });
});

describe('countNew', () => {
    it('counts nothing without a high-water mark', () => {
        expect(countNew(feed('a', 'b', 'c'), null)).toBe(0);
    });

    it('counts items strictly newer than the high-water mark', () => {
        // High-water at "c"; a and b are newer → 2 new.
        const items = feed('a', 'b', 'c', 'd');
        const highWater = toRef(items[2]); // c
        expect(countNew(items, highWater)).toBe(2);
    });

    it('does not count the high-water item itself or older items', () => {
        const items = feed('a', 'b', 'c');
        const highWater = toRef(items[0]); // a, the newest
        expect(countNew(items, highWater)).toBe(0);
    });

    it('counts every item when the high-water mark predates the feed', () => {
        const items = feed('a', 'b', 'c');
        const highWater = {id: 'old', time: itemTime('2000-01-01T00:00:00Z')};
        expect(countNew(items, highWater)).toBe(3);
    });
});

describe('persistence', () => {
    it('round-trips a state through storage', () => {
        const storage = fakeStorage();
        const state: ReadState = {
            anchor: {id: 'a', time: 111},
            highWater: {id: 'b', time: 222},
        };
        saveReadState(state, storage);
        expect(loadReadState(storage)).toEqual(state);
    });

    it('returns the empty state when nothing is stored', () => {
        expect(loadReadState(fakeStorage())).toEqual(emptyState);
    });

    it('returns the empty state for corrupt JSON', () => {
        const storage = fakeStorage({'octoradar.readPosition.v1': '{not json'});
        expect(loadReadState(storage)).toEqual(emptyState);
    });

    it('drops malformed refs instead of trusting them', () => {
        const storage = fakeStorage({
            'octoradar.readPosition.v1': JSON.stringify({
                anchor: {id: 'a', time: 'oops'},
                highWater: {id: 42, time: 222},
            }),
        });
        expect(loadReadState(storage)).toEqual(emptyState);
    });

    it('keeps a valid ref even when its sibling is malformed', () => {
        const storage = fakeStorage({
            'octoradar.readPosition.v1': JSON.stringify({
                anchor: {id: 'a', time: 111},
                highWater: {id: 'b'}, // missing time
            }),
        });
        expect(loadReadState(storage)).toEqual({anchor: {id: 'a', time: 111}, highWater: null});
    });
});
