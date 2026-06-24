import {FormEvent, RefObject, useState} from 'react';
import {feed} from '../../wailsjs/go/models';
import {Input} from '../Input';
import {ExternalLink} from './ExternalLink';
import {FeedItem} from './FeedItem';

export function FeedView({
    users,
    maxUsers,
    onAddUser,
    onRemoveUser,
    onImport,
    uiError,
    items,
    loading,
    fetchErrors,
    unauthorized,
    onReauthenticate,
    feedRef,
    newCount,
    onScroll,
    onJumpToTop,
}: {
    users: string[];
    maxUsers: number;
    // Returns whether the add succeeded, so the form can clear its input.
    onAddUser: (username: string) => Promise<boolean>;
    onRemoveUser: (username: string) => void;
    onImport: () => void;
    uiError: string;
    items: feed.Item[];
    loading: boolean;
    fetchErrors: string[];
    unauthorized: boolean;
    onReauthenticate: () => void;
    feedRef: RefObject<HTMLElement | null>;
    newCount: number;
    onScroll: () => void;
    onJumpToTop: () => void;
}) {
    const [newUser, setNewUser] = useState('');

    const addUser = async (e: FormEvent) => {
        e.preventDefault();
        if (await onAddUser(newUser)) {
            setNewUser('');
        }
    };

    return (
        <div className="layout">
            <aside className="sidebar">
                <div className="sidebar-heading">
                    <h2>Following</h2>
                    <span className="follow-count">
                        {users.length}/{maxUsers}
                    </span>
                </div>
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
                <button type="button" className="secondary import-button" onClick={onImport}>
                    Import from GitHub
                </button>
                {uiError && <div className="error">{uiError}</div>}
                <ul className="user-list">
                    {users.map((user) => (
                        <li key={user}>
                            <ExternalLink href={`https://github.com/${user}`}>{user}</ExternalLink>
                            <button className="remove" onClick={() => onRemoveUser(user)} title={`Unfollow ${user}`}>
                                ×
                            </button>
                        </li>
                    ))}
                </ul>
                {users.length === 0 && (
                    <p className="hint">Add GitHub usernames to build your feed.</p>
                )}
            </aside>
            <main className="feed" ref={feedRef} onScroll={onScroll}>
                <div className="new-badge-rail">
                    {newCount > 0 && (
                        <button className="new-badge" onClick={onJumpToTop}>
                            {newCount} new ↑
                        </button>
                    )}
                </div>
                {unauthorized && (
                    <div className="error banner auth-banner">
                        <span>Your GitHub session has expired. Re-authenticate to keep your feed working.</span>
                        <button className="secondary" onClick={onReauthenticate}>
                            Re-authenticate
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
    );
}
