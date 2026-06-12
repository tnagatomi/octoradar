import {useCallback, useEffect, useRef, useState} from 'react';
import './App.css';
import {AddUser, FetchFeed, FetchTrending, GetSettings, RemoveUser} from '../wailsjs/go/main/App';
import {discover, feed, main} from '../wailsjs/go/models';
import {savePrefs, loadPrefs, type DiscoverPrefs} from './discover';
import {DiscoverView} from './components/DiscoverView';
import {FeedView} from './components/FeedView';
import {ThemeMenu} from './components/ThemeMenu';
import {TokenSetup} from './components/TokenSetup';
import {useFeedReadPosition} from './hooks/useFeedReadPosition';
import {useTheme} from './hooks/useTheme';

export default function App() {
    const [settings, setSettings] = useState<main.Settings | null>(null);
    const [items, setItems] = useState<feed.Item[]>([]);
    const [fetchErrors, setFetchErrors] = useState<string[]>([]);
    const [unauthorized, setUnauthorized] = useState(false);
    const [editingToken, setEditingToken] = useState(false);
    const [uiError, setUiError] = useState('');
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState<'feed' | 'discover'>('feed');
    const theme = useTheme();

    // Owns the feed's scroll/read position and the "new since last read" badge.
    const {feedRef, newCount, handleScroll, jumpToTop} = useFeedReadPosition(items, view);

    // Discover (trending) state. Results are cached per (period, language) for
    // the session so flipping tabs or filters back and forth does not re-spend
    // the scarce search API quota; an explicit Refresh bypasses the cache.
    const [discoverPrefs, setDiscoverPrefs] = useState<DiscoverPrefs>(() => loadPrefs());
    const [discoverResult, setDiscoverResult] = useState<discover.Result | null>(null);
    const [discoverLoading, setDiscoverLoading] = useState(false);
    const discoverCache = useRef<Map<string, discover.Result>>(new Map());

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const result = await FetchFeed();
            setItems(result.items ?? []);
            setFetchErrors(result.errors ?? []);
            setUnauthorized(result.unauthorized ?? false);
        } catch (err) {
            setUiError(String(err));
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch trending repositories, serving a cached result for the current
    // (period, language) unless force bypasses it (the Refresh button).
    const loadTrending = useCallback(async (prefs: DiscoverPrefs, force: boolean) => {
        const key = `${prefs.period}|${prefs.language}`;
        if (!force && discoverCache.current.has(key)) {
            setDiscoverResult(discoverCache.current.get(key)!);
            return;
        }
        setDiscoverLoading(true);
        setUiError('');
        try {
            const result = await FetchTrending(prefs.period, prefs.language);
            if (result.unauthorized) {
                setUnauthorized(true);
            } else {
                // Only cache good results so a Refresh can recover from an
                // expired token or a transient rate-limit error.
                discoverCache.current.set(key, result);
            }
            setDiscoverResult(result);
        } catch (err) {
            setUiError(String(err));
        } finally {
            setDiscoverLoading(false);
        }
    }, []);

    const changeDiscoverPrefs = useCallback((next: DiscoverPrefs) => {
        setDiscoverPrefs(next);
        savePrefs(next);
    }, []);

    // Load trending when the Discover tab is shown and whenever its filters
    // change while it is shown. The cache keeps repeat visits free.
    useEffect(() => {
        if (view === 'discover') {
            loadTrending(discoverPrefs, false);
        }
    }, [view, discoverPrefs, loadTrending]);

    useEffect(() => {
        GetSettings().then((s) => {
            setSettings(s);
            if (s.hasToken && s.users.length > 0) {
                refresh();
            }
        });
    }, [refresh]);

    if (settings === null) {
        return null;
    }

    const finishTokenEdit = () => {
        setEditingToken(false);
        setUnauthorized(false);
        // The cached trending results were fetched with the old token; drop
        // them so the new token takes effect on the next Discover load.
        discoverCache.current.clear();
        if (view === 'discover') {
            loadTrending(discoverPrefs, true);
        }
        GetSettings().then((s) => {
            setSettings(s);
            if (s.hasToken && s.users.length > 0) {
                refresh();
            }
        });
    };

    if (!settings.hasToken) {
        return <TokenSetup onDone={finishTokenEdit} />;
    }

    if (editingToken) {
        return (
            <TokenSetup
                reauth
                notice={unauthorized ? 'Your GitHub session has expired. Sign in again to continue.' : undefined}
                onDone={finishTokenEdit}
                onCancel={() => setEditingToken(false)}
            />
        );
    }

    // Returns whether the add succeeded, so FeedView can clear its input.
    const addUser = async (username: string): Promise<boolean> => {
        setUiError('');
        try {
            const updated = await AddUser(username);
            setSettings(updated);
            refresh();
            return true;
        } catch (err) {
            setUiError(String(err));
            return false;
        }
    };

    const removeUser = async (username: string) => {
        setUiError('');
        try {
            const updated = await RemoveUser(username);
            setSettings(updated);
            refresh();
        } catch (err) {
            setUiError(String(err));
        }
    };

    // The header Refresh and its spinner track whichever tab is active.
    const onRefresh = () => (view === 'feed' ? refresh() : loadTrending(discoverPrefs, true));
    const headerLoading = view === 'feed' ? loading : discoverLoading;

    return (
        <div className="app">
            <header className="header">
                <div className="header-left">
                    <span className="brand">Octoradar</span>
                    <nav className="tabs">
                        <button
                            className={view === 'feed' ? 'tab active' : 'tab'}
                            onClick={() => setView('feed')}
                        >
                            Feed
                        </button>
                        <button
                            className={view === 'discover' ? 'tab active' : 'tab'}
                            onClick={() => setView('discover')}
                        >
                            Discover
                        </button>
                    </nav>
                </div>
                <div className="header-actions">
                    <ThemeMenu
                        preference={theme.preference}
                        resolved={theme.resolved}
                        onSelect={theme.setPreference}
                    />
                    <button className="secondary" onClick={() => setEditingToken(true)}>
                        Re-authenticate
                    </button>
                    <button className="refresh" onClick={onRefresh} disabled={headerLoading}>
                        {headerLoading ? 'Refreshing…' : 'Refresh'}
                    </button>
                </div>
            </header>
            {view === 'discover' ? (
                <DiscoverView
                    prefs={discoverPrefs}
                    onChangePrefs={changeDiscoverPrefs}
                    result={discoverResult}
                    loading={discoverLoading}
                    unauthorized={unauthorized}
                    onUpdateToken={() => setEditingToken(true)}
                />
            ) : (
                <FeedView
                    users={settings.users}
                    onAddUser={addUser}
                    onRemoveUser={removeUser}
                    uiError={uiError}
                    items={items}
                    loading={loading}
                    fetchErrors={fetchErrors}
                    unauthorized={unauthorized}
                    onReauthenticate={() => setEditingToken(true)}
                    feedRef={feedRef}
                    newCount={newCount}
                    onScroll={handleScroll}
                    onJumpToTop={jumpToTop}
                />
            )}
        </div>
    );
}
