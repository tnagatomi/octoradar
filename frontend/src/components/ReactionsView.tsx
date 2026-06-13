import {notifications} from '../../wailsjs/go/models';
import {FeedItem} from './FeedItem';

export function ReactionsView({
    items,
    loading,
    errors,
    unauthorized,
    onReauthenticate,
}: {
    items: notifications.Item[];
    loading: boolean;
    errors: string[];
    unauthorized: boolean;
    onReauthenticate: () => void;
}) {
    return (
        <div className="layout">
            <main className="feed">
                {unauthorized && (
                    <div className="error banner auth-banner">
                        <span>Your GitHub session has expired. Re-authenticate to keep tracking reactions.</span>
                        <button className="secondary" onClick={onReauthenticate}>
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
                {items.length === 0 && !loading ? (
                    <p className="hint empty">No reactions yet. You'll see stars and forks on your repos here.</p>
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
