import {useEffect, useState} from 'react';
import {CancelDeviceLogin, CompleteDeviceLogin, StartDeviceLogin} from '../../wailsjs/go/main/App';
import {main} from '../../wailsjs/go/models';
import {BrowserOpenURL, ClipboardSetText} from '../../wailsjs/runtime/runtime';
import {runDeviceLogin} from '../deviceLogin';
import {ExternalLink} from './ExternalLink';

// GitHub device-flow sign-in screen, shown on first launch and for re-auth.
export function TokenSetup({
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
    const [copied, setCopied] = useState(false);

    // Stop any in-progress poll when the sign-in screen goes away, so the
    // backend does not keep waiting after the user backs out.
    useEffect(() => {
        return () => {
            CancelDeviceLogin();
        };
    }, []);

    const copyCode = async () => {
        if (!prompt) return;
        await ClipboardSetText(prompt.userCode);
        setCopied(true);
    };

    const signIn = async () => {
        setBusy(true);
        setError('');
        setPrompt(null);
        setCopied(false);
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
                        <div className="device-code-row">
                            <div className="device-code">{prompt.userCode}</div>
                            <button type="button" className="secondary copy" onClick={copyCode}>
                                {copied ? 'Copied' : 'Copy'}
                            </button>
                        </div>
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
