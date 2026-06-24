import {useCallback, useEffect, useRef, useState} from 'react';
import './App.css';
import {
    AddUser,
    AddUsers,
    FetchFeed,
    FetchTrending,
    GetSettings,
    MarkReactionsRead,
    PollReactions,
    RemoveUser,
    SignOut,
    Version,
} from '../wailsjs/go/main/App';
import {discover, feed, main, notifications} from '../wailsjs/go/models';
import {savePrefs, loadPrefs, type DiscoverPrefs} from './discover';
import {DiscoverView} from './components/DiscoverView';
import {FeedView} from './components/FeedView';
import {ImportFollowingModal} from './components/ImportFollowingModal';
import {ReactionsView} from './components/ReactionsView';
import {ThemeMenu} from './components/ThemeMenu';
import {TokenSetup} from './components/TokenSetup';
import {useFeedReadPosition} from './hooks/useFeedReadPosition';
import {useTheme} from './hooks/useTheme';
import {REACTIONS_POLL_INTERVAL_MS, nextPollDelayMs} from './reactionsPolling';

export default function App() {
    const [settings, setSettings] = useState<main.Settings | null>(null);
    const [items, setItems] = useState<feed.Item[]>([]);
    const [fetchErrors, setFetchErrors] = useState<string[]>([]);
    const [unauthorized, setUnauthorized] = useState(false);
    const [editingToken, setEditingToken] = useState(false);
    const [importing, setImporting] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const accountRef = useRef<HTMLDivElement>(null);
    const [uiError, setUiError] = useState('');
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState<'feed' | 'discover' | 'reactions'>('feed');
    const [version, setVersion] = useState('');
    const theme = useTheme();

    // Reactions (stars and forks on the user's own repos). Polled in the
    // background so the unread badge updates regardless of the active tab.
    const [reactionItems, setReactionItems] = useState<notifications.Item[]>([]);
    const [reactionErrors, setReactionErrors] = useState<string[]>([]);
    const [reactionUnauthorized, setReactionUnauthorized] = useState(false);
    const [reactionUnread, setReactionUnread] = useState(0);
    const [reactionLoading, setReactionLoading] = useState(false);
    // Tracks the active view for callbacks that must read it without being
    // recreated on every switch (the background poll closes over it).
    const viewRef = useRef(view);
    viewRef.current = view;

    // Owns the feed's scroll/read position and the "new since last read" badge.
    const {feedRef, newCount, handleScroll, jumpToTop} = useFeedReadPosition(items, view);

    // Discover (trending) state. Results are cached per (period, language) for
    // the session so flipping tabs or filters back and forth does not re-spend
    // the scarce search API quota; an explicit Refresh bypasses the cache.
    const [discoverPrefs, setDiscoverPrefs] = useState<DiscoverPrefs>(() => loadPrefs());
    const [discoverResult, setDiscoverResult] = useState<discover.Result | null>(null);
    const [discoverLoading, setDiscoverLoading] = useState(false);
    const discoverCache = useRef<Map<string, discover.Result>>(new Map());
    // The delay before the next reactions poll, adjusted to honour GitHub's
    // X-Poll-Interval. A ref so the polling loop reads the latest value without
    // restarting its timer.
    const pollDelayRef = useRef(REACTIONS_POLL_INTERVAL_MS);

    // Close the account menu when clicking outside it or pressing Escape.
    useEffect(() => {
        if (!menuOpen) {
            return;
        }
        const onPointerDown = (e: MouseEvent) => {
            if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [menuOpen]);


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

    // Poll for new reactions (stars/forks) on the user's repos, updating the
    // list and unread badge. Failures surface in the Reactions view, not as a
    // global error, so a transient hiccup does not disrupt the other tabs.
    const pollReactions = useCallback(async () => {
        setReactionLoading(true);
        try {
            const res = await PollReactions();
            pollDelayRef.current = nextPollDelayMs(res.minPollIntervalSec);
            setReactionItems(res.items ?? []);
            setReactionErrors(res.errors ?? []);
            setReactionUnauthorized(res.unauthorized ?? false);
            // If the user is already viewing the tab, anything this poll found
            // counts as seen: keep it read so leaving the tab shows no badge.
            if (viewRef.current === 'reactions') {
                setReactionUnread(0);
                MarkReactionsRead();
            } else {
                setReactionUnread(res.unreadCount ?? 0);
            }
        } catch (err) {
            setUiError(String(err));
        } finally {
            setReactionLoading(false);
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

    useEffect(() => {
        Version().then(setVersion);
    }, []);

    // While signed in, poll reactions on load and then on a self-scheduling
    // timer so the unread badge stays current without the user visiting the
    // tab. A chained timeout (rather than a fixed interval) lets each poll pick
    // up the backed-off delay GitHub may have asked for.
    useEffect(() => {
        if (!settings?.hasToken) {
            return;
        }
        let timer: ReturnType<typeof setTimeout>;
        let cancelled = false;
        const tick = async () => {
            await pollReactions();
            if (!cancelled) {
                timer = setTimeout(tick, pollDelayRef.current);
            }
        };
        tick();
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [settings?.hasToken, pollReactions]);

    // Opening the Reactions tab marks everything seen, matching the inbox
    // model: the badge clears and the read watermark advances on the backend.
    const selectView = useCallback(
        (next: 'feed' | 'discover' | 'reactions') => {
            setView(next);
            if (next === 'reactions' && settings?.hasToken) {
                setReactionUnread(0);
                MarkReactionsRead();
            }
        },
        [settings?.hasToken],
    );

    if (settings === null) {
        return null;
    }

    const finishTokenEdit = () => {
        setEditingToken(false);
        setUnauthorized(false);
        setReactionUnauthorized(false);
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
            if (s.hasToken) {
                pollReactions();
            }
        });
    };

    // Switch account reuses the re-authentication flow: signing in again
    // replaces the stored token and login with a new one.
    const switchAccount = () => {
        setMenuOpen(false);
        setEditingToken(true);
    };

    // Sign out clears the backend token and login, then drops back to the
    // sign-in screen by clearing the local feed state.
    const signOut = async () => {
        setMenuOpen(false);
        try {
            const s = await SignOut();
            setSettings(s);
            setUnauthorized(false);
            setItems([]);
            setFetchErrors([]);
            setReactionItems([]);
            setReactionErrors([]);
            setReactionUnread(0);
            setReactionUnauthorized(false);
        } catch (err) {
            setUiError(String(err));
        }
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

    // Bulk add from the import picker. Returns whether it succeeded so the
    // modal only closes once the follows are saved; on success the feed is
    // refreshed to pull in the newly followed users' events.
    const addUsers = async (logins: string[]): Promise<boolean> => {
        setUiError('');
        try {
            const updated = await AddUsers(logins);
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
    const onRefresh = () => {
        if (view === 'feed') {
            return refresh();
        }
        if (view === 'discover') {
            return loadTrending(discoverPrefs, true);
        }
        return pollReactions();
    };
    const headerLoading = view === 'feed' ? loading : view === 'discover' ? discoverLoading : reactionLoading;

    return (
        <div className="app">
            <header className="header">
                <div className="header-left">
                    <span className="brand">Octoradar</span>
                    <nav className="tabs">
                        <button
                            className={view === 'feed' ? 'tab active' : 'tab'}
                            onClick={() => selectView('feed')}
                        >
                            Feed
                        </button>
                        <button
                            className={view === 'discover' ? 'tab active' : 'tab'}
                            onClick={() => selectView('discover')}
                        >
                            Discover
                        </button>
                        <button
                            className={view === 'reactions' ? 'tab active' : 'tab'}
                            onClick={() => selectView('reactions')}
                        >
                            Reactions
                            {view !== 'reactions' && reactionUnread > 0 && (
                                <span className="tab-badge">{reactionUnread}</span>
                            )}
                        </button>
                    </nav>
                </div>
                <div className="header-actions">
                    <ThemeMenu
                        preference={theme.preference}
                        resolved={theme.resolved}
                        onSelect={theme.setPreference}
                    />
                    <div className="account" ref={accountRef}>
                        <button
                            className="secondary account-button"
                            onClick={() => setMenuOpen((open) => !open)}
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                        >
                            {settings.login ? `@${settings.login}` : 'Account'}
                            <span className="caret" aria-hidden="true">▾</span>
                        </button>
                        {menuOpen && (
                            <div className="account-menu" role="menu">
                                <button role="menuitem" onClick={switchAccount}>
                                    Switch account
                                </button>
                                <button role="menuitem" onClick={signOut}>
                                    Sign out
                                </button>
                                {version && <div className="account-version">Octoradar {version}</div>}
                            </div>
                        )}
                    </div>
                    <button className="refresh" onClick={onRefresh} disabled={headerLoading}>
                        {headerLoading ? 'Refreshing…' : 'Refresh'}
                    </button>
                </div>
            </header>
            {view === 'reactions' ? (
                <ReactionsView
                    items={reactionItems}
                    loading={reactionLoading}
                    errors={reactionErrors}
                    unauthorized={reactionUnauthorized}
                    onReauthenticate={() => setEditingToken(true)}
                />
            ) : view === 'discover' ? (
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
                    maxUsers={settings.maxUsers}
                    onAddUser={addUser}
                    onRemoveUser={removeUser}
                    onImport={() => setImporting(true)}
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
            {importing && (
                <ImportFollowingModal
                    users={settings.users}
                    maxUsers={settings.maxUsers}
                    onAddUsers={addUsers}
                    onClose={() => setImporting(false)}
                    onReauthenticate={() => {
                        setImporting(false);
                        setEditingToken(true);
                    }}
                />
            )}
        </div>
    );
}
