import {describe, expect, it, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ExternalLink} from './ExternalLink';

// ExternalLink must never let the WebView navigate; clicking it hands the URL
// to the OS browser via Wails instead.
vi.mock('../../wailsjs/runtime/runtime', () => ({
    BrowserOpenURL: vi.fn(),
}));

import {BrowserOpenURL} from '../../wailsjs/runtime/runtime';

describe('ExternalLink', () => {
    it('opens the href in the system browser and suppresses navigation', async () => {
        const user = userEvent.setup();
        render(<ExternalLink href="https://github.com/octocat">octocat</ExternalLink>);

        const link = screen.getByRole('link', {name: 'octocat'});
        // The href is still set so the link is real (and right-clickable), even
        // though the default navigation is prevented.
        expect(link).toHaveAttribute('href', 'https://github.com/octocat');

        await user.click(link);

        expect(BrowserOpenURL).toHaveBeenCalledWith('https://github.com/octocat');
    });

    it('forwards a className to the anchor', () => {
        render(
            <ExternalLink href="https://example.test" className="actor">
                link
            </ExternalLink>,
        );
        expect(screen.getByRole('link', {name: 'link'})).toHaveClass('actor');
    });
});
