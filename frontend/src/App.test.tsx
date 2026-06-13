import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import {makeDiscoverResult, makeFeedResult, makeItem, makeRepository, makeSettings} from './test/factories';

// App orchestrates the whole UI on top of the Wails backend; mock the backend
// bindings and the browser bridge so these tests cover the real wiring between
// App and its views.
vi.mock('../wailsjs/go/main/App', () => ({
    GetSettings: vi.fn(),
    FetchFeed: vi.fn(),
    FetchTrending: vi.fn(),
    AddUser: vi.fn(),
    RemoveUser: vi.fn(),
    SignOut: vi.fn(),
    Version: vi.fn(),
    // Pulled in by TokenSetup, reached on the re-auth path.
    StartDeviceLogin: vi.fn(),
    CompleteDeviceLogin: vi.fn(),
    CancelDeviceLogin: vi.fn(),
}));
vi.mock('../wailsjs/runtime/runtime', () => ({
    BrowserOpenURL: vi.fn(),
    ClipboardSetText: vi.fn().mockResolvedValue(undefined),
}));

import {FetchFeed, FetchTrending, GetSettings, Version} from '../wailsjs/go/main/App';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return {promise, resolve};
}

beforeEach(() => {
    localStorage.clear();
    // useTheme reads matchMedia on mount; jsdom has none.
    window.matchMedia = vi.fn().mockImplementation(() => ({
        matches: false,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: () => true,
    })) as unknown as typeof window.matchMedia;

    vi.mocked(Version).mockResolvedValue('1.2.3');
    vi.mocked(FetchFeed).mockResolvedValue(makeFeedResult());
    vi.mocked(FetchTrending).mockResolvedValue(makeDiscoverResult());
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

describe('App startup gating', () => {
    it('renders nothing until settings have loaded', async () => {
        const settings = deferred<ReturnType<typeof makeSettings>>();
        vi.mocked(GetSettings).mockReturnValue(settings.promise);

        render(<App />);
        // Settings are still in flight: no chrome at all.
        expect(screen.queryByText('Octoradar')).not.toBeInTheDocument();

        settings.resolve(makeSettings({hasToken: false}));
        // Once resolved with no token, the sign-in screen appears.
        expect(await screen.findByRole('heading', {name: 'Octoradar'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Sign in with GitHub'})).toBeInTheDocument();
    });

    it('does not fetch the feed when there is no token', async () => {
        vi.mocked(GetSettings).mockResolvedValue(makeSettings({hasToken: false}));
        render(<App />);

        await screen.findByRole('button', {name: 'Sign in with GitHub'});
        expect(FetchFeed).not.toHaveBeenCalled();
    });
});

describe('App authenticated feed', () => {
    it('loads and renders the feed for a signed-in user', async () => {
        vi.mocked(GetSettings).mockResolvedValue(makeSettings({login: 'octocat', users: ['octocat']}));
        vi.mocked(FetchFeed).mockResolvedValue(
            makeFeedResult({items: [makeItem({target: 'octocat/hello-world'})]}),
        );

        render(<App />);

        expect(await screen.findByRole('link', {name: 'octocat/hello-world'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /@octocat/})).toBeInTheDocument();
        expect(FetchFeed).toHaveBeenCalledTimes(1);
    });
});

describe('App tab switching and trending cache', () => {
    it('loads trending on first Discover visit and serves the cache on return', async () => {
        const user = userEvent.setup();
        vi.mocked(GetSettings).mockResolvedValue(makeSettings({users: ['octocat']}));
        vi.mocked(FetchTrending).mockResolvedValue(
            makeDiscoverResult({repositories: [makeRepository({fullName: 'trending/repo'})]}),
        );

        render(<App />);
        await screen.findByRole('button', {name: 'Discover'});

        // First visit: a fetch happens for the (month, all-languages) default.
        await user.click(screen.getByRole('button', {name: 'Discover'}));
        expect(await screen.findByRole('link', {name: 'trending/repo'})).toBeInTheDocument();
        expect(FetchTrending).toHaveBeenCalledTimes(1);
        expect(FetchTrending).toHaveBeenCalledWith('month', '');

        // Flip away and back: the cached result is reused, no new fetch.
        await user.click(screen.getByRole('button', {name: 'Feed'}));
        await user.click(screen.getByRole('button', {name: 'Discover'}));
        expect(await screen.findByRole('link', {name: 'trending/repo'})).toBeInTheDocument();
        expect(FetchTrending).toHaveBeenCalledTimes(1);

        // Refresh forces a fresh fetch past the cache.
        await user.click(screen.getByRole('button', {name: 'Refresh'}));
        await waitFor(() => expect(FetchTrending).toHaveBeenCalledTimes(2));
    });
});

describe('App re-authentication', () => {
    it('surfaces an expired session and opens the re-auth screen', async () => {
        const user = userEvent.setup();
        vi.mocked(GetSettings).mockResolvedValue(makeSettings({users: ['octocat']}));
        vi.mocked(FetchFeed).mockResolvedValue(makeFeedResult({unauthorized: true}));

        render(<App />);

        const banner = (await screen.findByText(/session has expired/i)).closest('.banner') as HTMLElement;
        await user.click(within(banner).getByRole('button', {name: 'Re-authenticate'}));

        // The re-auth variant of the sign-in screen takes over.
        expect(await screen.findByRole('heading', {name: 'Sign in again'})).toBeInTheDocument();
        expect(screen.getByText('Your GitHub session has expired. Sign in again to continue.')).toBeInTheDocument();
    });
});
