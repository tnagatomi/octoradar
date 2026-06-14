// REACTIONS_POLL_INTERVAL_MS is the base cadence for polling reactions: often
// enough to keep the unread badge fresh, slow enough to stay well within
// GitHub's rate limits.
export const REACTIONS_POLL_INTERVAL_MS = 3 * 60 * 1000;

// nextPollDelayMs is the delay before the next reactions poll. It honours the
// base cadence, but backs off when GitHub's X-Poll-Interval (surfaced as
// minPollIntervalSec) asks for something slower under load. A missing,
// zero, or negative value leaves the base cadence unchanged.
export function nextPollDelayMs(minPollIntervalSec: number | undefined): number {
    const requested = (minPollIntervalSec ?? 0) * 1000;
    return Math.max(REACTIONS_POLL_INTERVAL_MS, requested);
}
