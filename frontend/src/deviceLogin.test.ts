import {expect, test, vi} from 'vitest';
import {runDeviceLogin, DeviceLoginPrompt} from './deviceLogin';

const prompt: DeviceLoginPrompt = {
    userCode: 'WDJB-MJHT',
    verificationUri: 'https://github.com/login/device',
    deviceCode: 'dev-abc',
    expiresIn: 900,
    interval: 5,
};

test('runs the device flow end to end', async () => {
    const start = vi.fn().mockResolvedValue(prompt);
    const complete = vi.fn().mockResolvedValue('octocat');
    const openURL = vi.fn();
    const onPrompt = vi.fn();

    const login = await runDeviceLogin({start, complete, openURL}, {onPrompt});

    expect(login).toBe('octocat');
    expect(onPrompt).toHaveBeenCalledWith(prompt);
    expect(openURL).toHaveBeenCalledWith('https://github.com/login/device');
    expect(complete).toHaveBeenCalledWith('dev-abc', 5, 900);
});

test('propagates a failure to start, without prompting or opening a browser', async () => {
    const start = vi.fn().mockRejectedValue(new Error('device_flow_disabled'));
    const complete = vi.fn();
    const openURL = vi.fn();
    const onPrompt = vi.fn();

    await expect(runDeviceLogin({start, complete, openURL}, {onPrompt})).rejects.toThrow(
        'device_flow_disabled',
    );
    expect(onPrompt).not.toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
});

test('propagates an authorization failure after prompting', async () => {
    const start = vi.fn().mockResolvedValue(prompt);
    const complete = vi.fn().mockRejectedValue(new Error('device authorization timed out'));
    const openURL = vi.fn();
    const onPrompt = vi.fn();

    await expect(runDeviceLogin({start, complete, openURL}, {onPrompt})).rejects.toThrow(
        'timed out',
    );
    // The user still saw the code and the browser still opened before the wait.
    expect(onPrompt).toHaveBeenCalledWith(prompt);
    expect(openURL).toHaveBeenCalledWith('https://github.com/login/device');
});
