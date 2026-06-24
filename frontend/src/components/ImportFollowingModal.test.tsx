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

        render(<ImportFollowingModal onClose={() => {}} />);

        const items = await screen.findAllByRole('listitem');
        expect(items).toHaveLength(2);
        expect(within(items[0]).getByText('amy')).toBeInTheDocument();
        expect(within(items[1]).getByText('zoe')).toBeInTheDocument();
        // The avatar is decorative (alt="") like the feed, so assert its src directly.
        expect(items[0].querySelector('img')).toHaveAttribute('src', 'https://avatars/amy');
    });

    it('shows a loading state while the fetch is in flight', () => {
        mockFollowing.mockReturnValue(new Promise(() => {}) as ReturnType<typeof FetchGitHubFollowing>);

        render(<ImportFollowingModal onClose={() => {}} />);

        expect(screen.getByText(/loading/i)).toBeInTheDocument();
        expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    });

    it('shows an empty state when you do not follow anyone on GitHub', async () => {
        mockFollowing.mockResolvedValue(result({accounts: []}));

        render(<ImportFollowingModal onClose={() => {}} />);

        expect(await screen.findByText(/don't follow anyone/i)).toBeInTheDocument();
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

        render(<ImportFollowingModal onClose={() => {}} />);
        await screen.findAllByRole('listitem');

        await userEvent.type(screen.getByPlaceholderText(/search/i), 'an');

        const items = screen.getAllByRole('listitem');
        expect(items).toHaveLength(1);
        expect(within(items[0]).getByText('Andrew')).toBeInTheDocument();
    });
});
