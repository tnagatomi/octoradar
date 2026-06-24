import {useEffect, useState} from 'react';
import {FetchGitHubFollowing} from '../../wailsjs/go/main/App';
import {main} from '../../wailsjs/go/models';

// Modal that lists the accounts the viewer follows on GitHub so they can be
// imported into the follow list. Mounting it opens it; it fetches the following
// list once on mount.
export function ImportFollowingModal({onClose}: {onClose: () => void}) {
    const [accounts, setAccounts] = useState<main.FollowingAccount[]>([]);
    const [loading, setLoading] = useState(true);

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
                    <ul className="import-list">
                        {accounts.map((acc) => (
                            <li key={acc.login}>
                                <img className="avatar" src={acc.avatarUrl} alt="" />
                                <span className="import-login">{acc.login}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
