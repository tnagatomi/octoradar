import {FormEvent, ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import './App.css';
import {Input} from './Input';
import {AddUser, FetchFeed, FetchTrending, GetSettings, RemoveUser, SetToken} from '../wailsjs/go/main/App';
import {discover, feed, main} from '../wailsjs/go/models';
import {BrowserOpenURL} from '../wailsjs/runtime/runtime';
import {LANGUAGES, PERIODS, loadPrefs, savePrefs, type DiscoverPrefs} from './discover';
import {
    countNew,
    loadReadState,
    newestRef,
    resolveScrollTarget,
    saveReadState,
    toRef,
    type ReadState,
} from './readPosition';

// How long after the last scroll event we record the read position, and how
// close to the top counts as "caught up to the newest item".
const SCROLL_SAVE_DELAY = 200;
const TOP_THRESHOLD = 4;

// The id of the topmost at-least-partially-visible feed item, or null.
function topmostVisibleId(container: HTMLElement): string | null {
    const top = container.getBoundingClientRect().top;
    const nodes = container.querySelectorAll<HTMLElement>('[data-item-id]');
    for (const node of nodes) {
        if (node.getBoundingClientRect().bottom > top + 1) {
            return node.dataset.itemId ?? null;
        }
    }
    return null;
}

// Scroll the feed so the given item sits at the top of the viewport. Returns
// false when the item is not rendered.
function scrollToId(container: HTMLElement, id: string): boolean {
    const node = container.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`);
    if (!node) {
        return false;
    }
    container.scrollTop += node.getBoundingClientRect().top - container.getBoundingClientRect().top;
    return true;
}

function relativeTime(value: any): string {
    const date = new Date(value);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return date.toLocaleDateString();
}

function absoluteTime(value: any): string {
    return new Date(value).toLocaleString();
}

function ExternalLink({href, className, children}: {href: string; className?: string; children: ReactNode}) {
    return (
        <a
            href={href}
            className={className}
            onClick={(e) => {
                e.preventDefault();
                BrowserOpenURL(href);
            }}
        >
            {children}
        </a>
    );
}

function TokenSetup({
    onDone,
    onCancel,
    reauth = false,
    notice,
}: {
    onDone: () => void;
    onCancel?: () => void;
    reauth?: boolean;
    notice?: string;
}) {
    const [token, setToken] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        try {
            await SetToken(token);
            onDone();
        } catch (err) {
            setError(String(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="token-setup">
            <form className="token-card" onSubmit={submit}>
                <h1>{reauth ? 'Update token' : 'Octoradar'}</h1>
                {notice && <div className="error">{notice}</div>}
                <p>
                    {reauth
                        ? 'Enter a new GitHub personal access token to replace the current one.'
                        : 'Enter a GitHub personal access token to get started.'}{' '}
                    A fine-grained token with no extra permissions is enough for public activity.
                </p>
                <Input
                    type="password"
                    placeholder="github_pat_... / ghp_..."
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    autoFocus
                />
                {error && <div className="error">{error}</div>}
                <div className="token-actions">
                    {onCancel && (
                        <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
                            Cancel
                        </button>
                    )}
                    <button type="submit" disabled={saving || token.trim() === ''}>
                        {saving ? 'Validating…' : 'Save token'}
                    </button>
                </div>
            </form>
        </div>
    );
}

const typeIcons: Record<string, string> = {
    WatchEvent: '⭐',
    ForkEvent: '🍴',
    ReleaseEvent: '🚀',
    PublicEvent: '🎉',
    CreateEvent: '📦',
    SponsorshipEvent: '💖',
    MergedPullRequest: '🔀',
};

function FeedItem({item}: {item: feed.Item}) {
    return (
        <li className="feed-item" data-item-id={item.id}>
            <img className="avatar" src={item.avatarUrl} alt="" />
            <div className="feed-body">
                <div className="feed-line">
                    <ExternalLink href={`https://github.com/${item.actor}`} className="actor">
                        {item.actor}
                    </ExternalLink>{' '}
                    {item.action}{' '}
                    <ExternalLink href={item.targetUrl} className="target">
                        {item.target}
                    </ExternalLink>
                    {item.trailer && <> {item.trailer}</>}
                </div>
                <div className="feed-meta">
                    <span className="type-icon">{typeIcons[item.type] ?? ''}</span>
                    <span className="time" title={absoluteTime(item.createdAt)}>{relativeTime(item.createdAt)}</span>
                </div>
            </div>
        </li>
    );
}

function RepoCard({repo}: {repo: discover.Repository}) {
    return (
        <li className="repo-card">
            <img className="avatar" src={repo.ownerAvatarUrl} alt="" />
            <div className="repo-body">
                <ExternalLink href={repo.url} className="repo-name">
                    {repo.fullName}
                </ExternalLink>
                {repo.description && <p className="repo-desc">{repo.description}</p>}
                <div className="repo-meta">
                    {repo.language && <span className="repo-lang">{repo.language}</span>}
                    <span className="repo-stat">⭐ {repo.stars.toLocaleString()}</span>
                    <span className="repo-stat">🍴 {repo.forks.toLocaleString()}</span>
                </div>
            </div>
        </li>
    );
}

function DiscoverView({
    prefs,
    onChangePrefs,
    result,
    loading,
    unauthorized,
    onUpdateToken,
}: {
    prefs: DiscoverPrefs;
    onChangePrefs: (next: DiscoverPrefs) => void;
    result: discover.Result | null;
    loading: boolean;
    unauthorized: boolean;
    onUpdateToken: () => void;
}) {
    const repositories = result?.repositories ?? [];
    const errors = result?.errors ?? [];
    return (
        <div className="layout">
            <aside className="sidebar">
                <h2>Discover</h2>
                <div className="segmented" role="group" aria-label="Time period">
                    {PERIODS.map((p) => (
                        <button
                            key={p.value}
                            className={p.value === prefs.period ? 'segment active' : 'segment'}
                            onClick={() => onChangePrefs({...prefs, period: p.value})}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
                <label className="field-label" htmlFor="discover-language">
                    Language
                </label>
                <select
                    id="discover-language"
                    className="language-select"
                    value={prefs.language}
                    onChange={(e) => onChangePrefs({...prefs, language: e.target.value})}
                >
                    {LANGUAGES.map((l) => (
                        <option key={l.value} value={l.value}>
                            {l.label}
                        </option>
                    ))}
                </select>
                <p className="hint">Newly created repositories, most-starred first.</p>
            </aside>
            <main className="feed">
                {unauthorized && (
                    <div className="error banner auth-banner">
                        <span>Your GitHub token is invalid or expired. Update it to keep discovering.</span>
                        <button className="secondary" onClick={onUpdateToken}>
                            Update token
                        </button>
                    </div>
                )}
                {errors.length > 0 && (
                    <div className="error banner">
                        {errors.map((err) => (
                            <div key={err}>{err}</div>
                        ))}
                    </div>
                )}
                {repositories.length > 0 ? (
                    <ul className="repo-list">
                        {repositories.map((repo) => (
                            <RepoCard key={repo.fullName} repo={repo} />
                        ))}
                    </ul>
                ) : loading ? (
                    <p className="hint empty">Loading trending repositories…</p>
                ) : (
                    !unauthorized && <p className="hint empty">No trending repositories found.</p>
                )}
            </main>
        </div>
    );
}

export default function App() {
    const [settings, setSettings] = useState<main.Settings | null>(null);
    const [items, setItems] = useState<feed.Item[]>([]);
    const [fetchErrors, setFetchErrors] = useState<string[]>([]);
    const [unauthorized, setUnauthorized] = useState(false);
    const [editingToken, setEditingToken] = useState(false);
    const [uiError, setUiError] = useState('');
    const [loading, setLoading] = useState(false);
    const [newUser, setNewUser] = useState('');
    const [newCount, setNewCount] = useState(0);
    const [view, setView] = useState<'feed' | 'discover'>('feed');

    // Discover (trending) state. Results are cached per (period, language) for
    // the session so flipping tabs or filters back and forth does not re-spend
    // the scarce search API quota; an explicit Refresh bypasses the cache.
    const [discoverPrefs, setDiscoverPrefs] = useState<DiscoverPrefs>(() => loadPrefs());
    const [discoverResult, setDiscoverResult] = useState<discover.Result | null>(null);
    const [discoverLoading, setDiscoverLoading] = useState(false);
    const discoverCache = useRef<Map<string, discover.Result>>(new Map());

    // The scroll container, the latest items, and the persisted read state are
    // held in refs so the scroll handler always sees current values without
    // being re-created on every render.
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
                notice={unauthorized ? 'Your GitHub token is invalid or expired. Enter a new one to continue.' : undefined}
                onDone={finishTokenEdit}
                onCancel={() => setEditingToken(false)}
            />
        );
    }

    const addUser = async (e: FormEvent) => {
        e.preventDefault();
        setUiError('');
        try {
            const updated = await AddUser(newUser);
            setSettings(updated);
            setNewUser('');
            refresh();
        } catch (err) {
            setUiError(String(err));
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
                    <button className="secondary" onClick={() => setEditingToken(true)}>
                        Update token
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
            <div className="layout">
                <aside className="sidebar">
                    <h2>Following</h2>
                    <form className="add-user" onSubmit={addUser}>
                        <Input
                            placeholder="Add a username"
                            value={newUser}
                            onChange={(e) => setNewUser(e.target.value)}
                        />
                        <button type="submit" disabled={newUser.trim() === ''}>
                            Add
                        </button>
                    </form>
                    {uiError && <div className="error">{uiError}</div>}
                    <ul className="user-list">
                        {settings.users.map((user) => (
                            <li key={user}>
                                <ExternalLink href={`https://github.com/${user}`}>{user}</ExternalLink>
                                <button className="remove" onClick={() => removeUser(user)} title={`Unfollow ${user}`}>
                                    ×
                                </button>
                            </li>
                        ))}
                    </ul>
                    {settings.users.length === 0 && (
                        <p className="hint">Add GitHub usernames to build your feed.</p>
                    )}
                </aside>
                <main className="feed" ref={feedRef} onScroll={handleScroll}>
                    <div className="new-badge-rail">
                        {newCount > 0 && (
                            <button className="new-badge" onClick={jumpToTop}>
                                {newCount} new ↑
                            </button>
                        )}
                    </div>
                    {unauthorized && (
                        <div className="error banner auth-banner">
                            <span>Your GitHub token is invalid or expired. Update it to keep your feed working.</span>
                            <button className="secondary" onClick={() => setEditingToken(true)}>
                                Update token
                            </button>
                        </div>
                    )}
                    {fetchErrors.length > 0 && (
                        <div className="error banner">
                            {fetchErrors.map((err) => (
                                <div key={err}>{err}</div>
                            ))}
                        </div>
                    )}
                    {items.length === 0 && !loading ? (
                        <p className="hint empty">No events yet.</p>
                    ) : (
                        <ul className="feed-list">
                            {items.map((item) => (
                                <FeedItem key={item.id} item={item} />
                            ))}
                        </ul>
                    )}
                </main>
            </div>
            )}
        </div>
    );
}
