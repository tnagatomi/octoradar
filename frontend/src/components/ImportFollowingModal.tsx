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
}: {
    onClose: () => void;
    onAddUsers: (logins: string[]) => Promise<boolean>;
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
                            {filtered.map((acc) => (
                                <li key={acc.login}>
                                    <label className="import-row">
                                        <input
                                            type="checkbox"
                                            checked={selected.has(acc.login)}
                                            onChange={() => toggle(acc.login)}
                                        />
                                        <img className="avatar" src={acc.avatarUrl} alt="" />
                                        <span className="import-login">{acc.login}</span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                        <footer className="modal-footer">
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
