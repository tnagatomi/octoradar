import {act} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {renderHook} from '@testing-library/react';
import {useTheme} from './useTheme';
import {STORAGE_KEY} from '../theme';

// Install a controllable matchMedia (jsdom has none). Every call shares one
// `matches` flag and listener set, so the hook's subscription sees `set()`.
function installMatchMedia(initial: boolean) {
    const state = {matches: initial};
    const listeners = new Set<(e: {matches: boolean}) => void>();
    window.matchMedia = vi.fn().mockImplementation(() => ({
        get matches() {
            return state.matches;
        },
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addEventListener: (_type: string, cb: (e: {matches: boolean}) => void) => listeners.add(cb),
        removeEventListener: (_type: string, cb: (e: {matches: boolean}) => void) => listeners.delete(cb),
        addListener: (cb: (e: {matches: boolean}) => void) => listeners.add(cb),
        removeListener: (cb: (e: {matches: boolean}) => void) => listeners.delete(cb),
        dispatchEvent: () => true,
    })) as unknown as typeof window.matchMedia;
    return {
        set(matches: boolean) {
            state.matches = matches;
            act(() => listeners.forEach((cb) => cb({matches})));
        },
    };
}

beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('useTheme', () => {
    it('resolves "auto" against the OS preference and applies it to <html>', () => {
        installMatchMedia(true);
        const {result} = renderHook(() => useTheme());

        expect(result.current.preference).toBe('auto');
        expect(result.current.resolved).toBe('dark');
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('applies and persists an explicit preference', () => {
        installMatchMedia(false);
        const {result} = renderHook(() => useTheme());

        act(() => result.current.setPreference('dark'));

        expect(result.current.resolved).toBe('dark');
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    });

    it('follows OS theme changes while on "auto"', () => {
        const media = installMatchMedia(false);
        const {result} = renderHook(() => useTheme());
        expect(result.current.resolved).toBe('light');

        media.set(true);
        expect(result.current.resolved).toBe('dark');
    });

    it('ignores OS theme changes once a fixed preference is chosen', () => {
        const media = installMatchMedia(false);
        const {result} = renderHook(() => useTheme());

        act(() => result.current.setPreference('light'));
        media.set(true);

        expect(result.current.resolved).toBe('light');
    });
});
