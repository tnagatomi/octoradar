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
    onReauthenticate,
}: {
    onClose: () => void;
    onAddUsers: (logins: string[]) => Promise<boolean>;
    users: string[];
    maxUsers: number;
    onReauthenticate?: () => void;
}) {
    const [accounts, setAccounts] = useState<main.FollowingAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [errors, setErrors] = useState<string[]>([]);
    const [truncated, setTruncated] = useState(false);
    const [unauthorized, setUnauthorized] = useState(false);

    useEffect(() => {
        let cancelled = false;
        FetchGitHubFollowing()
            .then((res) => {
                if (cancelled) {
                    return;
                }
                const sorted = [...(res.accounts ?? [])].sort((a, b) =>
                    a.login.toLowerCase().localeCompare(b.login.toLowerCase()),
                );
                setAccounts(sorted);
                setErrors(res.errors ?? []);
                setTruncated(res.truncated ?? false);
                setUnauthorized(res.unauthorized ?? false);
                setLoading(false);
            })
            .catch((err) => {
                if (cancelled) {
                    return;
                }
                setErrors([String(err)]);
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

    // True when the current view offers nothing to pick: either the search
    // matched nothing, or every shown account is already followed. Drives a
    // single message so the list area is never a confusing blank.
    const nothingToImport = !filtered.some((acc) => !isFollowed(acc.login));

    const errorBanner = errors.length > 0 && (
        <div className="error banner">
            {errors.map((err) => (
                <div key={err}>{err}</div>
            ))}
        </div>
    );

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
                ) : unauthorized ? (
                    <div className="error banner auth-banner">
                        <span>Your GitHub session has expired. Re-authenticate to import your following.</span>
                        {onReauthenticate && (
                            <button className="secondary" onClick={onReauthenticate}>
                                Re-authenticate
                            </button>
                        )}
                    </div>
                ) : accounts.length === 0 ? (
                    // An error that yielded no accounts shows the banner; a genuinely
                    // empty following list shows the friendly empty state.
                    errorBanner || <p className="hint empty">You don't follow anyone on GitHub yet.</p>
                ) : (
                    <>
                        {errorBanner}
                        {truncated && (
                            <p className="hint">
                                You follow a lot of people — not all of them are shown.
                            </p>
                        )}
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
                        {nothingToImport && <p className="hint empty">No accounts to import.</p>}
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
