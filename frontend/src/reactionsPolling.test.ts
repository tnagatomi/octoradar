import {describe, expect, it} from 'vitest';
import {REACTIONS_POLL_INTERVAL_MS, nextPollDelayMs} from './reactionsPolling';

describe('nextPollDelayMs', () => {
    it('uses the base interval when GitHub asks for nothing slower', () => {
        expect(nextPollDelayMs(undefined)).toBe(REACTIONS_POLL_INTERVAL_MS);
        expect(nextPollDelayMs(0)).toBe(REACTIONS_POLL_INTERVAL_MS);
        // 60s is below the 3-minute base, so the base still wins.
        expect(nextPollDelayMs(60)).toBe(REACTIONS_POLL_INTERVAL_MS);
    });

    it('backs off to GitHub interval when it exceeds the base', () => {
        // 5 minutes > the 3-minute base.
        expect(nextPollDelayMs(300)).toBe(300_000);
    });

    it('ignores negative or nonsensical intervals', () => {
        expect(nextPollDelayMs(-5)).toBe(REACTIONS_POLL_INTERVAL_MS);
    });
});
