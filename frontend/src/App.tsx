import {FormEvent, ReactNode, useCallback, useEffect, useState} from 'react';
import './App.css';
import {Input} from './Input';
import {AddUser, CompleteDeviceLogin, FetchFeed, GetSettings, RemoveUser, StartDeviceLogin} from '../wailsjs/go/main/App';
import {feed, main} from '../wailsjs/go/models';
import {BrowserOpenURL} from '../wailsjs/runtime/runtime';
import {runDeviceLogin} from './deviceLogin';

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
    const [prompt, setPrompt] = useState<main.DeviceLogin | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const signIn = async () => {
        setBusy(true);
        setError('');
        setPrompt(null);
        try {
            await runDeviceLogin(
                {start: StartDeviceLogin, complete: CompleteDeviceLogin, openURL: BrowserOpenURL},
                {onPrompt: setPrompt},
            );
            onDone();
        } catch (err) {
            setError(String(err));
            setPrompt(null);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="token-setup">
            <div className="token-card">
                <h1>{reauth ? 'Sign in again' : 'Octoradar'}</h1>
                {notice && <div className="error">{notice}</div>}
                <p>
                    {reauth
                        ? 'Sign in with GitHub again to restore access.'
                        : 'Sign in with GitHub to get started.'}{' '}
                    Octoradar only reads public activity.
                </p>
                {prompt ? (
                    <div className="device-prompt">
                        <p>
                            In the browser window that opened, enter this code at{' '}
                            <ExternalLink href={prompt.verificationUri}>{prompt.verificationUri}</ExternalLink>:
                        </p>
                        <div className="device-code">{prompt.userCode}</div>
                        <p className="hint">Waiting for authorization…</p>
                    </div>
                ) : (
                    error && <div className="error">{error}</div>
                )}
                <div className="token-actions">
                    {onCancel && (
                        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
                            Cancel
                        </button>
                    )}
                    <button type="button" onClick={signIn} disabled={busy}>
                        {busy ? 'Waiting…' : reauth ? 'Sign in again' : 'Sign in with GitHub'}
                    </button>
                </div>
            </div>
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
        <li className="feed-item">
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

export default function App() {
    const [settings, setSettings] = useState<main.Settings | null>(null);
    const [items, setItems] = useState<feed.Item[]>([]);
    const [fetchErrors, setFetchErrors] = useState<string[]>([]);
    const [unauthorized, setUnauthorized] = useState(false);
    const [editingToken, setEditingToken] = useState(false);
    const [uiError, setUiError] = useState('');
    const [loading, setLoading] = useState(false);
    const [newUser, setNewUser] = useState('');

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

    return (
        <div className="app">
            <header className="header">
                <span className="brand">Octoradar</span>
                <div className="header-actions">
                    <button className="secondary" onClick={() => setEditingToken(true)}>
                        Update token
                    </button>
                    <button className="refresh" onClick={refresh} disabled={loading}>
                        {loading ? 'Refreshing…' : 'Refresh'}
                    </button>
                </div>
            </header>
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
                <main className="feed">
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
        </div>
    );
}
