import {describe, expect, it, vi} from 'vitest';
import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ReactionsView} from './ReactionsView';
import {makeReactionItem} from '../test/factories';

vi.mock('../../wailsjs/runtime/runtime', () => ({
    BrowserOpenURL: vi.fn(),
}));

describe('ReactionsView', () => {
    it('renders each reaction with its actor and target', () => {
        render(
            <ReactionsView
                items={[
                    makeReactionItem({actor: 'mona', action: 'starred', target: 'octocat/hello-world'}),
                ]}
                loading={false}
                errors={[]}
                unauthorized={false}
                onReauthenticate={() => {}}
            />,
        );

        expect(screen.getByRole('link', {name: 'mona'})).toBeInTheDocument();
        expect(screen.getByRole('link', {name: 'octocat/hello-world'})).toBeInTheDocument();
        expect(screen.getByText('starred')).toBeInTheDocument();
    });

    it('shows an empty state when there are no reactions and it is not loading', () => {
        render(
            <ReactionsView items={[]} loading={false} errors={[]} unauthorized={false} onReauthenticate={() => {}} />,
        );

        expect(screen.getByText(/no reactions yet/i)).toBeInTheDocument();
    });

    it('surfaces an expired session with a re-authenticate button', async () => {
        const user = userEvent.setup();
        const onReauthenticate = vi.fn();
        render(
            <ReactionsView items={[]} loading={false} errors={[]} unauthorized onReauthenticate={onReauthenticate} />,
        );

        const banner = (await screen.findByText(/session has expired/i)).closest('.banner') as HTMLElement;
        await user.click(within(banner).getByRole('button', {name: 'Re-authenticate'}));
        expect(onReauthenticate).toHaveBeenCalledTimes(1);
    });
});
