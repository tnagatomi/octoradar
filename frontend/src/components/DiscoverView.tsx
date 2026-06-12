import {discover} from '../../wailsjs/go/models';
import {LANGUAGES, PERIODS, type DiscoverPrefs} from '../discover';
import {RepoCard} from './RepoCard';

export function DiscoverView({
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
                        <span>Your GitHub session has expired. Re-authenticate to keep discovering.</span>
                        <button className="secondary" onClick={onUpdateToken}>
                            Re-authenticate
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
