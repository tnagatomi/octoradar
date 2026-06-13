// Runs before every component test (configured as the `components` project's
// setupFile). Registers jest-dom's matchers on Vitest's `expect` and augments
// its types so `toBeInTheDocument`, `toBeDisabled`, etc. are available.
import '@testing-library/jest-dom/vitest';
import {afterEach} from 'vitest';
import {cleanup} from '@testing-library/react';

// jsdom does not implement Element.scrollTo; components that reset their scroll
// position (e.g. DiscoverView on a new result) call it. Stub it as a no-op so
// those effects run without throwing.
if (typeof Element.prototype.scrollTo !== 'function') {
    Element.prototype.scrollTo = () => {};
}

// This jsdom build ships without Web Storage, so the theme/discover/read-position
// persistence (which reads window.localStorage) has nowhere to write. Provide a
// small in-memory Storage so those code paths run as they do in the browser.
if (typeof window.localStorage === 'undefined') {
    class MemoryStorage {
        private map = new Map<string, string>();
        get length() {
            return this.map.size;
        }
        clear() {
            this.map.clear();
        }
        getItem(key: string) {
            return this.map.has(key) ? this.map.get(key)! : null;
        }
        key(index: number) {
            return [...this.map.keys()][index] ?? null;
        }
        removeItem(key: string) {
            this.map.delete(key);
        }
        setItem(key: string, value: string) {
            this.map.set(key, String(value));
        }
    }
    Object.defineProperty(window, 'localStorage', {
        value: new MemoryStorage() as unknown as Storage,
        configurable: true,
    });
}

// Unmount anything mounted during a test so the DOM (and document-level event
// listeners registered by components) does not leak into the next one.
afterEach(() => {
    cleanup();
});
