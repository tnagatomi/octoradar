// Read-position memory for the activity feed.
//
// The feed is a single newest-first stream that is re-fetched on every refresh
// and restart. To make "remember where I was reading" survive those reloads we
// persist two references in localStorage:
//
//   - anchor:    the item that was at the top of the viewport, so we can scroll
//                back to it (or the nearest surviving item) after a reload.
//   - highWater: the newest item the user has actually caught up to, so we can
//                count how many genuinely-new items have arrived since.
//
// Everything in this module is pure and storage-injectable so it can be unit
// tested without a DOM.

export interface FeedRef {
    id: string;
    // Epoch milliseconds of the item's createdAt. Stored as a number so it can
    // be compared directly and survives a JSON round-trip.
    time: number;
}

export interface ReadState {
    anchor: FeedRef | null;
    highWater: FeedRef | null;
}

// The minimal shape we need from a feed item; feed.Item satisfies this.
export interface FeedItemLike {
    id: string;
    createdAt: unknown;
}

const STORAGE_KEY = 'octoradar.readPosition.v1';

export const emptyState: ReadState = {anchor: null, highWater: null};

// Convert an item's createdAt into epoch milliseconds, defaulting to 0 for
// unparseable values so comparisons stay well-defined.
export function itemTime(createdAt: unknown): number {
    const ms = new Date(createdAt as any).getTime();
    return Number.isNaN(ms) ? 0 : ms;
}

export function toRef(item: FeedItemLike): FeedRef {
    return {id: item.id, time: itemTime(item.createdAt)};
}

// The newest item is first in the list; null for an empty feed. The backend
// sorts the feed newest-first, which this relies on.
export function newestRef(items: FeedItemLike[]): FeedRef | null {
    return items.length > 0 ? toRef(items[0]) : null;
}

// Decide which item id to scroll back to after a reload. Returns null when there
// is no anchor or no items (fresh start → stay at the newest item / top).
export function resolveScrollTarget(items: FeedItemLike[], anchor: FeedRef | null): string | null {
    if (!anchor || items.length === 0) {
        return null;
    }
    // The anchored item is still present: scroll straight back to it.
    for (const it of items) {
        if (it.id === anchor.id) {
            return anchor.id;
        }
    }
    // The anchored item aged out of the feed. Land on the nearest still-present
    // item that is at or older than where we were. The list is newest-first, so
    // the first item not newer than the anchor is the closest one.
    for (const it of items) {
        if (itemTime(it.createdAt) <= anchor.time) {
            return it.id;
        }
    }
    // The anchor is older than everything still present → land on the oldest.
    return items[items.length - 1].id;
}

// Number of items strictly newer than the high-water mark — the "N new" badge.
// Without a high-water mark (first ever load) nothing is considered new.
export function countNew(items: FeedItemLike[], highWater: FeedRef | null): number {
    if (!highWater) {
        return 0;
    }
    let n = 0;
    for (const it of items) {
        if (itemTime(it.createdAt) > highWater.time) {
            n++;
        }
    }
    return n;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
    try {
        return window.localStorage;
    } catch {
        // localStorage can throw under strict privacy settings.
        return null;
    }
}

function validRef(value: any): FeedRef | null {
    if (value && typeof value.id === 'string' && typeof value.time === 'number' && Number.isFinite(value.time)) {
        return {id: value.id, time: value.time};
    }
    return null;
}

export function loadReadState(storage: StorageLike | null = defaultStorage()): ReadState {
    if (!storage) {
        return {...emptyState};
    }
    let raw: string | null;
    try {
        raw = storage.getItem(STORAGE_KEY);
    } catch {
        return {...emptyState};
    }
    if (!raw) {
        return {...emptyState};
    }
    try {
        const parsed = JSON.parse(raw);
        return {
            anchor: validRef(parsed?.anchor),
            highWater: validRef(parsed?.highWater),
        };
    } catch {
        // Corrupt payload: start clean rather than crash on launch.
        return {...emptyState};
    }
}

export function saveReadState(state: ReadState, storage: StorageLike | null = defaultStorage()): void {
    if (!storage) {
        return;
    }
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Ignore quota / privacy-mode write failures.
    }
}
