import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {feed} from '../../wailsjs/go/models';
import {
    countNew,
    loadReadState,
    newestRef,
    resolveScrollTarget,
    saveReadState,
    toRef,
    type ReadState,
} from '../readPosition';
import {scrollToId, topmostVisibleId} from '../utils/feedScroll';

// How long after the last scroll event we record the read position, and how
// close to the top counts as "caught up to the newest item".
const SCROLL_SAVE_DELAY = 200;
const TOP_THRESHOLD = 4;

// Encapsulates the feed's reading position: it restores the scroll offset after
// each fetch, persists the position as the user scrolls, and exposes the "new
// since last read" badge count plus a jump-to-top action.
//
// The scroll container, the latest items, and the persisted read state are held
// in refs so the scroll handler always sees current values without being
// re-created on every render.
export function useFeedReadPosition(items: feed.Item[], view: 'feed' | 'discover') {
    const [newCount, setNewCount] = useState(0);

    const feedRef = useRef<HTMLElement>(null);
    const itemsRef = useRef<feed.Item[]>([]);
    itemsRef.current = items;
    const stateRef = useRef<ReadState | null>(null);
    if (stateRef.current === null) {
        stateRef.current = loadReadState();
    }
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Advance the high-water mark to the newest item: the user has caught up, so
    // the "new" count resets to zero.
    const markCaughtUp = useCallback(() => {
        const state = stateRef.current!;
        state.highWater = newestRef(itemsRef.current) ?? state.highWater;
        saveReadState(state);
        setNewCount(0);
    }, []);

    // After each fetch, restore the reading position and recompute the badge.
    useLayoutEffect(() => {
        const container = feedRef.current;
        if (!container || items.length === 0) {
            return;
        }
        const state = stateRef.current!;
        const target = resolveScrollTarget(items, state.anchor);
        if (target && scrollToId(container, target)) {
            setNewCount(countNew(items, state.highWater));
        } else {
            // Fresh start (no anchor) or the anchor is gone: sit at the newest
            // item, which means we are already caught up.
            container.scrollTop = 0;
            markCaughtUp();
        }
    }, [items, markCaughtUp, view]);

    const handleScroll = useCallback(() => {
        if (saveTimer.current) {
            clearTimeout(saveTimer.current);
        }
        saveTimer.current = setTimeout(() => {
            const container = feedRef.current;
            if (!container) {
                return;
            }
            const state = stateRef.current!;
            const topId = topmostVisibleId(container);
            if (topId) {
                const item = itemsRef.current.find((it) => it.id === topId);
                if (item) {
                    state.anchor = toRef(item);
                }
            }
            if (container.scrollTop <= TOP_THRESHOLD) {
                markCaughtUp();
            }
            saveReadState(state);
        }, SCROLL_SAVE_DELAY);
    }, [markCaughtUp]);

    const jumpToTop = useCallback(() => {
        const container = feedRef.current;
        if (container) {
            container.scrollTop = 0;
        }
        markCaughtUp();
    }, [markCaughtUp]);

    useEffect(() => () => {
        if (saveTimer.current) {
            clearTimeout(saveTimer.current);
        }
    }, []);

    return {feedRef, newCount, handleScroll, jumpToTop};
}
