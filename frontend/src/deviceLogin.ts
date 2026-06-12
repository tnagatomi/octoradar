// Framework-agnostic orchestration of GitHub's OAuth device flow, kept free
// of React and Wails imports so the wiring can be unit-tested in isolation.

export interface DeviceLoginPrompt {
    userCode: string;
    verificationUri: string;
    deviceCode: string;
    expiresIn: number;
    interval: number;
}

export interface DeviceLoginDeps {
    // start begins the device flow and returns the codes to show the user.
    start: () => Promise<DeviceLoginPrompt>;
    // complete blocks until the user authorizes and resolves with the login.
    complete: (deviceCode: string, interval: number, expiresIn: number) => Promise<string>;
    // openURL opens the verification page in the user's browser.
    openURL: (url: string) => void;
}

export interface DeviceLoginHandlers {
    // onPrompt receives the codes as soon as they are available so the UI can
    // render the user code while complete() is still waiting.
    onPrompt: (prompt: DeviceLoginPrompt) => void;
}

// runDeviceLogin starts the device flow, surfaces the user code, opens the
// verification page, then waits for authorization and resolves with the
// authenticated login. It rejects if any step fails.
export async function runDeviceLogin(
    deps: DeviceLoginDeps,
    handlers: DeviceLoginHandlers,
): Promise<string> {
    const prompt = await deps.start();
    handlers.onPrompt(prompt);
    deps.openURL(prompt.verificationUri);
    return deps.complete(prompt.deviceCode, prompt.interval, prompt.expiresIn);
}
