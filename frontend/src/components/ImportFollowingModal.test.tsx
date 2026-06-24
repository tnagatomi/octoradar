import {describe, expect, it, vi, beforeEach} from 'vitest';
import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ImportFollowingModal} from './ImportFollowingModal';

vi.mock('../../wailsjs/go/main/App', () => ({
    FetchGitHubFollowing: vi.fn(),
}));
vi.mock('../../wailsjs/runtime/runtime', () => ({
    BrowserOpenURL: vi.fn(),
}));

import {FetchGitHubFollowing} from '../../wailsjs/go/main/App';

const mockFollowing = vi.mocked(FetchGitHubFollowing);

function result(overrides: Partial<Awaited<ReturnType<typeof FetchGitHubFollowing>>> = {}) {
    return {accounts: [], truncated: false, errors: [], unauthorized: false, ...overrides} as Awaited<
        ReturnType<typeof FetchGitHubFollowing>
    >;
}

describe('ImportFollowingModal', () => {
    beforeEach(() => {
        mockFollowing.mockReset();
    });

    it('fetches on open and lists the accounts sorted by login', async () => {
        mockFollowing.mockResolvedValue(
            result({
                accounts: [
                    {login: 'zoe', avatarUrl: 'https://avatars/zoe'},
                    {login: 'amy', avatarUrl: 'https://avatars/amy'},
                ],
            }),
        );

        render(<ImportFollowingModal onClose={() => {}} onAddUsers={vi.fn()} users={[]} maxUsers={50} />);

        const items = await screen.findAllByRole('listitem');
        expect(items).toHaveLength(2);
        expect(within(items[0]).getByText('amy')).toBeInTheDocument();
        expect(within(items[1]).getByText('zoe')).toBeInTheDocument();
        // The avatar is decorative (alt="") like the feed, so assert its src directly.
        expect(items[0].querySelector('img')).toHaveAttribute('src', 'https://avatars/amy');
    });

    it('shows a loading state while the fetch is in flight', () => {
        mockFollowing.mockReturnValue(new Promise(() => {}) as ReturnType<typeof FetchGitHubFollowing>);

        render(<ImportFollowingModal onClose={() => {}} onAddUsers={vi.fn()} users={[]} maxUsers={50} />);

        expect(screen.getByText(/loading/i)).toBeInTheDocument();
        expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    });

    it('shows an empty state when you do not follow anyone on GitHub', async () => {
        mockFollowing.mockResolvedValue(result({accounts: []}));

        render(<ImportFollowingModal onClose={() => {}} onAddUsers={vi.fn()} users={[]} maxUsers={50} />);

        expect(await screen.findByText(/don't follow anyone/i)).toBeInTheDocument();
    });

    it('disables Add until something is selected, then labels it with the count', async () => {
        mockFollowing.mockResolvedValue(
            result({
                accounts: [
                    {login: 'amy', avatarUrl: 'https://avatars/amy'},
                    {login: 'zoe', avatarUrl: 'https://avatars/zoe'},
                ],
            }),
        );

        render(<ImportFollowingModal onClose={() => {}} onAddUsers={vi.fn().mockResolvedValue(true)} users={[]} maxUsers={50} />);
        await screen.findAllByRole('listitem');

        const add = screen.getByRole('button', {name: /^add/i});
        expect(add).toBeDisabled();

        await userEvent.click(screen.getByRole('checkbox', {name: 'amy'}));
        expect(screen.getByRole('button', {name: 'Add 1'})).toBeEnabled();

        await userEvent.click(screen.getByRole('checkbox', {name: 'zoe'}));
        expect(screen.getByRole('button', {name: 'Add 2'})).toBeInTheDocument();
    });

    it('passes the selected logins to onAddUsers and closes on success', async () => {
        mockFollowing.mockResolvedValue(
            result({
                accounts: [
                    {login: 'amy', avatarUrl: 'https://avatars/amy'},
                    {login: 'zoe', avatarUrl: 'https://avatars/zoe'},
                ],
            }),
        );
        const onAddUsers = vi.fn().mockResolvedValue(true);
        const onClose = vi.fn();

        render(<ImportFollowingModal onClose={onClose} onAddUsers={onAddUsers} users={[]} maxUsers={50} />);
        await screen.findAllByRole('listitem');

        await userEvent.click(screen.getByRole('checkbox', {name: 'zoe'}));
        await userEvent.click(screen.getByRole('button', {name: 'Add 1'}));

        expect(onAddUsers).toHaveBeenCalledWith(['zoe']);
        expect(onClose).toHaveBeenCalled();
    });

    it('keeps the modal open when the add fails', async () => {
        mockFollowing.mockResolvedValue(
            result({accounts: [{login: 'amy', avatarUrl: 'https://avatars/amy'}]}),
        );
        const onAddUsers = vi.fn().mockResolvedValue(false);
        const onClose = vi.fn();

        render(<ImportFollowingModal onClose={onClose} onAddUsers={onAddUsers} users={[]} maxUsers={50} />);
        await screen.findAllByRole('listitem');

        await userEvent.click(screen.getByRole('checkbox', {name: 'amy'}));
        await userEvent.click(screen.getByRole('button', {name: 'Add 1'}));

        expect(onAddUsers).toHaveBeenCalledWith(['amy']);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('grays out and disables accounts already followed, case-insensitively', async () => {
        mockFollowing.mockResolvedValue(
            result({
                accounts: [
                    {login: 'amy', avatarUrl: 'https://avatars/amy'},
                    {login: 'bob', avatarUrl: 'https://avatars/bob'},
                ],
            }),
        );

        render(
            <ImportFollowingModal onClose={() => {}} onAddUsers={vi.fn()} users={['BOB']} maxUsers={50} />,
        );
        await screen.findAllByRole('listitem');

        expect(screen.getByRole('checkbox', {name: /bob/i})).toBeDisabled();
        expect(screen.getByRole('checkbox', {name: 'amy'})).toBeEnabled();
        expect(screen.getByText('Following')).toBeInTheDocument();
    });

    it('shows the running count out of the cap and updates it as you select', async () => {
        mockFollowing.mockResolvedValue(
            result({
                accounts: [
                    {login: 'amy', avatarUrl: 'https://avatars/amy'},
                    {login: 'carol', avatarUrl: 'https://avatars/carol'},
                ],
            }),
        );

        render(
            <ImportFollowingModal onClose={() => {}} onAddUsers={vi.fn()} users={['bob']} maxUsers={50} />,
        );
        await screen.findAllByRole('listitem');

        expect(screen.getByText('1/50')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('checkbox', {name: 'amy'}));
        expect(screen.getByText('2/50')).toBeInTheDocument();
    });

    it('blocks selecting past the remaining slots', async () => {
        mockFollowing.mockResolvedValue(
            result({
                accounts: [
                    {login: 'amy', avatarUrl: 'https://avatars/amy'},
                    {login: 'dave', avatarUrl: 'https://avatars/dave'},
                    {login: 'eve', avatarUrl: 'https://avatars/eve'},
                ],
            }),
        );

        // cap 3, two slots already taken => one remaining.
        render(
            <ImportFollowingModal
                onClose={() => {}}
                onAddUsers={vi.fn()}
                users={['bob', 'carol']}
                maxUsers={3}
            />,
        );
        await screen.findAllByRole('listitem');

        await userEvent.click(screen.getByRole('checkbox', {name: 'amy'}));

        // The single slot is now spoken for: the other unselected rows lock.
        expect(screen.getByRole('checkbox', {name: 'dave'})).toBeDisabled();
        expect(screen.getByRole('checkbox', {name: 'eve'})).toBeDisabled();
        // The selected one stays enabled so it can be unchecked.
        expect(screen.getByRole('checkbox', {name: 'amy'})).toBeEnabled();
    });

    it('prompts to re-authenticate when the fetch is unauthorized', async () => {
        mockFollowing.mockResolvedValue(result({accounts: [], unauthorized: true}));
        const onReauthenticate = vi.fn();

        render(
            <ImportFollowingModal
                onClose={() => {}}
                onAddUsers={vi.fn()}
                users={[]}
                maxUsers={50}
                onReauthenticate={onReauthenticate}
            />,
        );

        await userEvent.click(await screen.findByRole('button', {name: /re-authenticate/i}));
        expect(onReauthenticate).toHaveBeenCalled();
        // The list never renders in this state.
        expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    });

    it('shows a partial-fetch error while still listing what loaded', async () => {
        mockFollowing.mockResolvedValue(
            result({
                accounts: [{login: 'amy', avatarUrl: 'https://avatars/amy'}],
                errors: ['following page 2: boom'],
            }),
        );

        render(<ImportFollowingModal onClose={() => {}} onAddUsers={vi.fn()} users={[]} maxUsers={50} />);

        expect(await screen.findByText(/boom/)).toBeInTheDocument();
        expect(screen.getByRole('checkbox', {name: 'amy'})).toBeInTheDocument();
    });

    it('notes when the list was truncated at the safety valve', async () => {
        mockFollowing.mockResolvedValue(
            result({accounts: [{login: 'amy', avatarUrl: 'https://avatars/amy'}], truncated: true}),
        );

        render(<ImportFollowingModal onClose={() => {}} onAddUsers={vi.fn()} users={[]} maxUsers={50} />);

        expect(await screen.findByText(/not all of them are shown/i)).toBeInTheDocument();
    });

    it('shows an error when the fetch itself rejects', async () => {
        mockFollowing.mockRejectedValue(new Error('bridge down'));

        render(<ImportFollowingModal onClose={() => {}} onAddUsers={vi.fn()} users={[]} maxUsers={50} />);

        expect(await screen.findByText(/bridge down/)).toBeInTheDocument();
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    it('filters the list by the search query, case-insensitively', async () => {
        mockFollowing.mockResolvedValue(
            result({
                accounts: [
                    {login: 'amy', avatarUrl: 'https://avatars/amy'},
                    {login: 'Andrew', avatarUrl: 'https://avatars/andrew'},
                    {login: 'zoe', avatarUrl: 'https://avatars/zoe'},
                ],
            }),
        );

        render(<ImportFollowingModal onClose={() => {}} onAddUsers={vi.fn()} users={[]} maxUsers={50} />);
        await screen.findAllByRole('listitem');

        await userEvent.type(screen.getByPlaceholderText(/search/i), 'an');

        const items = screen.getAllByRole('listitem');
        expect(items).toHaveLength(1);
        expect(within(items[0]).getByText('Andrew')).toBeInTheDocument();
    });
});
