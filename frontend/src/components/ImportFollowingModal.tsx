import {useEffect, useMemo, useState} from 'react';
import {FetchGitHubFollowing} from '../../wailsjs/go/main/App';
import {main} from '../../wailsjs/go/models';
import {Input} from '../Input';

// Modal that lists the accounts the viewer follows on GitHub so they can be
// imported into the follow list. Mounting it opens it; it fetches the following
// list once on mount. onAddUsers persists the picked logins and returns whether
// it succeeded, so the modal only closes once they are saved.
export function ImportFollowingModal({
    onClose,
    onAddUsers,
    users,
    maxUsers,
}: {
    onClose: () => void;
    onAddUsers: (logins: string[]) => Promise<boolean>;
    users: string[];
    maxUsers: number;
}) {
    const [accounts, setAccounts] = useState<main.FollowingAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());

    useEffect(() => {
        let cancelled = false;
        FetchGitHubFollowing().then((res) => {
            if (cancelled) {
                return;
            }
            const sorted = [...(res.accounts ?? [])].sort((a, b) =>
                a.login.toLowerCase().localeCompare(b.login.toLowerCase()),
            );
            setAccounts(sorted);
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (q === '') {
            return accounts;
        }
        return accounts.filter((acc) => acc.login.toLowerCase().includes(q));
    }, [accounts, query]);

    // Logins already in the follow list, lower-cased to match GitHub's
    // case-insensitive identity (mirrors AddUsers on the backend).
    const followed = useMemo(() => new Set(users.map((u) => u.toLowerCase())), [users]);
    const isFollowed = (login: string) => followed.has(login.toLowerCase());

    // Slots used = current follows plus what is staged for import. Once it hits
    // the cap, unselected rows lock so the picker never stages more than fits.
    const used = users.length + selected.size;
    const atCap = used >= maxUsers;

    const toggle = (login: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(login)) {
                next.delete(login);
            } else {
                next.add(login);
            }
            return next;
        });
    };

    const add = async () => {
        if (await onAddUsers([...selected])) {
            onClose();
        }
    };

    return (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Import from GitHub">
            <div className="modal">
                <header className="modal-header">
                    <h2>Import from GitHub</h2>
                    <button className="remove" onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </header>
                {loading ? (
                    <p className="hint empty">Loading…</p>
                ) : accounts.length === 0 ? (
                    <p className="hint empty">You don't follow anyone on GitHub yet.</p>
                ) : (
                    <>
                        <Input
                            className="import-search"
                            placeholder="Search GitHub following"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                        <ul className="import-list">
                            {filtered.map((acc) => {
                                const followedAlready = isFollowed(acc.login);
                                const checked = followedAlready || selected.has(acc.login);
                                return (
                                    <li key={acc.login}>
                                        <label className={followedAlready ? 'import-row followed' : 'import-row'}>
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                disabled={followedAlready || (atCap && !selected.has(acc.login))}
                                                onChange={() => toggle(acc.login)}
                                            />
                                            <img className="avatar" src={acc.avatarUrl} alt="" />
                                            <span className="import-login">{acc.login}</span>
                                            {followedAlready && <span className="import-tag">Following</span>}
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                        <footer className="modal-footer">
                            <span className="import-count">
                                {used}/{maxUsers}
                            </span>
                            <button type="button" onClick={add} disabled={selected.size === 0}>
                                Add {selected.size}
                            </button>
                        </footer>
                    </>
                )}
            </div>
        </div>
    );
}
