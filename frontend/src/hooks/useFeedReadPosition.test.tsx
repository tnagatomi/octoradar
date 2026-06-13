import {beforeEach, describe, expect, it} from 'vitest';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {feed} from '../../wailsjs/go/models';
import {loadReadState, saveReadState, toRef} from '../readPosition';
import {makeItem} from '../test/factories';
import {useFeedReadPosition} from './useFeedReadPosition';

// A minimal scroll container wired to the hook, standing in for FeedView. jsdom
// has no layout, so getBoundingClientRect()/scrollTop are inert — these tests
// exercise the read-state bookkeeping (badge count, high-water mark), which is
// the hook's non-trivial glue. The geometry helpers in feedScroll have their own
// concern.
function Harness({items}: {items: feed.Item[]}) {
    const {feedRef, newCount, handleScroll, jumpToTop} = useFeedReadPosition(items, 'feed');
    return (
        <div>
            <span data-testid="new-count">{newCount}</span>
            <button onClick={jumpToTop}>jump to top</button>
            <main data-testid="feed" ref={feedRef} onScroll={handleScroll}>
                {items.map((it) => (
                    <div key={it.id} data-item-id={it.id}>
                        {it.id}
                    </div>
                ))}
            </main>
        </div>
    );
}

function newCount() {
    return screen.getByTestId('new-count').textContent;
}

// Three items, newest-first, with distinct timestamps for ordering.
function threeItems() {
    return [
        makeItem({id: 'a', createdAt: '2020-01-03T00:00:00Z'}),
        makeItem({id: 'b', createdAt: '2020-01-02T00:00:00Z'}),
        makeItem({id: 'c', createdAt: '2020-01-01T00:00:00Z'}),
    ];
}

beforeEach(() => {
    localStorage.clear();
});

describe('useFeedReadPosition', () => {
    it('treats a first-ever load as caught up and records the newest item', () => {
        const items = threeItems();
        render(<Harness items={items} />);

        // No prior anchor: land at the top, nothing is "new".
        expect(newCount()).toBe('0');
        // The high-water mark advances to the newest item so later arrivals count.
        expect(loadReadState().highWater).toEqual(toRef(items[0]));
    });

    it('counts items newer than the high-water mark when returning', () => {
        const items = threeItems();
        // Last caught up at the oldest item, anchored on the middle one.
        saveReadState({anchor: toRef(items[1]), highWater: toRef(items[2])});

        render(<Harness items={items} />);

        // Items a (newest) and b are newer than the high-water mark c.
        expect(newCount()).toBe('2');
    });

    it('clears the badge and advances the high-water mark on jump-to-top', async () => {
        const user = userEvent.setup();
        const items = threeItems();
        saveReadState({anchor: toRef(items[1]), highWater: toRef(items[2])});
        render(<Harness items={items} />);
        expect(newCount()).toBe('2');

        await user.click(screen.getByRole('button', {name: 'jump to top'}));

        expect(newCount()).toBe('0');
        expect(loadReadState().highWater).toEqual(toRef(items[0]));
    });

    it('marks caught up after scrolling to the top settles', async () => {
        const items = threeItems();
        saveReadState({anchor: toRef(items[1]), highWater: toRef(items[2])});
        render(<Harness items={items} />);
        expect(newCount()).toBe('2');

        // Scrolling while parked at the top (scrollTop 0) records that we have
        // caught up — but only after the debounce window passes.
        fireEvent.scroll(screen.getByTestId('feed'));

        await waitFor(() => expect(newCount()).toBe('0'));
        expect(loadReadState().highWater).toEqual(toRef(items[0]));
    });
});
