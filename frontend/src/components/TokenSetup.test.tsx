import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {TokenSetup} from './TokenSetup';

// The device flow's backend steps and the browser/clipboard bridges are mocked;
// the real runDeviceLogin orchestration runs against them, so these tests cover
// TokenSetup wired to the actual sign-in sequence.
vi.mock('../../wailsjs/go/main/App', () => ({
    StartDeviceLogin: vi.fn(),
    CompleteDeviceLogin: vi.fn(),
    CancelDeviceLogin: vi.fn(),
}));
vi.mock('../../wailsjs/runtime/runtime', () => ({
    BrowserOpenURL: vi.fn(),
    ClipboardSetText: vi.fn().mockResolvedValue(undefined),
}));

import {CancelDeviceLogin, CompleteDeviceLogin, StartDeviceLogin} from '../../wailsjs/go/main/App';
import {BrowserOpenURL, ClipboardSetText} from '../../wailsjs/runtime/runtime';

const prompt = {
    userCode: 'WDJB-MJHT',
    verificationUri: 'https://github.com/login/device',
    deviceCode: 'dev-abc',
    expiresIn: 900,
    interval: 5,
};

// A promise whose resolve/reject is exposed, to hold a step "in flight" while
// the test inspects the intermediate UI.
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return {promise, resolve, reject};
}

beforeEach(() => {
    vi.mocked(StartDeviceLogin).mockReset();
    vi.mocked(CompleteDeviceLogin).mockReset();
    vi.mocked(CancelDeviceLogin).mockReset();
    vi.mocked(BrowserOpenURL).mockReset();
    vi.mocked(ClipboardSetText).mockReset().mockResolvedValue(true);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('TokenSetup initial screen', () => {
    it('shows the first-launch sign-in prompt with no cancel option', () => {
        render(<TokenSetup onDone={vi.fn()} />);
        expect(screen.getByRole('heading', {name: 'Octoradar'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Sign in with GitHub'})).toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'Cancel'})).not.toBeInTheDocument();
    });

    it('shows the re-auth variant with a notice and a cancel option', () => {
        render(<TokenSetup reauth notice="Your GitHub session has expired." onDone={vi.fn()} onCancel={vi.fn()} />);
        expect(screen.getByRole('heading', {name: 'Sign in again'})).toBeInTheDocument();
        expect(screen.getByText('Your GitHub session has expired.')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Cancel'})).toBeInTheDocument();
    });

    it('invokes onCancel without starting the flow', async () => {
        const user = userEvent.setup();
        const onCancel = vi.fn();
        render(<TokenSetup reauth onDone={vi.fn()} onCancel={onCancel} />);

        await user.click(screen.getByRole('button', {name: 'Cancel'}));
        expect(onCancel).toHaveBeenCalled();
        expect(StartDeviceLogin).not.toHaveBeenCalled();
    });
});

describe('TokenSetup device flow', () => {
    it('shows the user code while waiting, then completes', async () => {
        const user = userEvent.setup();
        const onDone = vi.fn();
        const complete = deferred<string>();
        vi.mocked(StartDeviceLogin).mockResolvedValue(prompt);
        vi.mocked(CompleteDeviceLogin).mockReturnValue(complete.promise);

        render(<TokenSetup onDone={onDone} />);
        await user.click(screen.getByRole('button', {name: 'Sign in with GitHub'}));

        // Once started, the user code and verification link appear and the
        // browser is opened, while completion is still pending.
        expect(await screen.findByText('WDJB-MJHT')).toBeInTheDocument();
        expect(screen.getByText('Waiting for authorization…')).toBeInTheDocument();
        expect(BrowserOpenURL).toHaveBeenCalledWith('https://github.com/login/device');
        expect(onDone).not.toHaveBeenCalled();

        complete.resolve('octocat');
        await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    });

    it('copies the user code to the clipboard', async () => {
        const user = userEvent.setup();
        vi.mocked(StartDeviceLogin).mockResolvedValue(prompt);
        vi.mocked(CompleteDeviceLogin).mockReturnValue(deferred<string>().promise);

        render(<TokenSetup onDone={vi.fn()} />);
        await user.click(screen.getByRole('button', {name: 'Sign in with GitHub'}));
        await screen.findByText('WDJB-MJHT');

        await user.click(screen.getByRole('button', {name: 'Copy'}));
        expect(ClipboardSetText).toHaveBeenCalledWith('WDJB-MJHT');
        expect(await screen.findByRole('button', {name: 'Copied'})).toBeInTheDocument();
    });

    it('surfaces an error when the flow fails and shows no code', async () => {
        const user = userEvent.setup();
        vi.mocked(StartDeviceLogin).mockRejectedValue(new Error('device_flow_disabled'));

        render(<TokenSetup onDone={vi.fn()} />);
        await user.click(screen.getByRole('button', {name: 'Sign in with GitHub'}));

        expect(await screen.findByText(/device_flow_disabled/)).toBeInTheDocument();
        expect(screen.queryByText('WDJB-MJHT')).not.toBeInTheDocument();
    });

    it('cancels the in-flight device login when unmounted', () => {
        const {unmount} = render(<TokenSetup onDone={vi.fn()} />);
        unmount();
        expect(CancelDeviceLogin).toHaveBeenCalled();
    });
});
