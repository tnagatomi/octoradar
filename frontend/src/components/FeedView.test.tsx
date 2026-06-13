import {createRef} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {FeedView} from './FeedView';
import {makeItem} from '../test/factories';

// FeedView renders ExternalLinks (followed users, feed targets); stub the
// browser bridge so clicks do not reach the absent Wails runtime.
vi.mock('../../wailsjs/runtime/runtime', () => ({
    BrowserOpenURL: vi.fn(),
}));

// Sensible defaults so each test overrides only the props it exercises.
function setup(overrides: Partial<Parameters<typeof FeedView>[0]> = {}) {
    const props = {
        users: ['octocat'],
        onAddUser: vi.fn().mockResolvedValue(true),
        onRemoveUser: vi.fn(),
        uiError: '',
        items: [],
        loading: false,
        fetchErrors: [],
        unauthorized: false,
        onReauthenticate: vi.fn(),
        feedRef: createRef<HTMLElement>(),
        newCount: 0,
        onScroll: vi.fn(),
        onJumpToTop: vi.fn(),
        ...overrides,
    };
    render(<FeedView {...props} />);
    return props;
}

describe('FeedView following list', () => {
    it('lists followed users and removes one on click', async () => {
        const user = userEvent.setup();
        const {onRemoveUser} = setup({users: ['octocat', 'torvalds']});

        expect(screen.getByRole('link', {name: 'octocat'})).toBeInTheDocument();
        expect(screen.getByRole('link', {name: 'torvalds'})).toBeInTheDocument();

        await user.click(screen.getByTitle('Unfollow torvalds'));
        expect(onRemoveUser).toHaveBeenCalledWith('torvalds');
    });

    it('prompts to add usernames when nobody is followed', () => {
        setup({users: []});
        expect(screen.getByText('Add GitHub usernames to build your feed.')).toBeInTheDocument();
    });
});

describe('FeedView add form', () => {
    it('keeps Add disabled until a non-blank username is typed', async () => {
        const user = userEvent.setup();
        setup({users: []});

        const add = screen.getByRole('button', {name: 'Add'});
        expect(add).toBeDisabled();

        await user.type(screen.getByPlaceholderText('Add a username'), '   ');
        expect(add).toBeDisabled();

        await user.type(screen.getByPlaceholderText('Add a username'), 'octocat');
        expect(add).toBeEnabled();
    });

    it('submits the username and clears the field on success', async () => {
        const user = userEvent.setup();
        const onAddUser = vi.fn().mockResolvedValue(true);
        setup({users: [], onAddUser});

        const field = screen.getByPlaceholderText('Add a username');
        await user.type(field, 'octocat');
        await user.click(screen.getByRole('button', {name: 'Add'}));

        expect(onAddUser).toHaveBeenCalledWith('octocat');
        expect(field).toHaveValue('');
    });

    it('keeps the typed value when the add is rejected', async () => {
        const user = userEvent.setup();
        const onAddUser = vi.fn().mockResolvedValue(false);
        setup({users: [], onAddUser});

        const field = screen.getByPlaceholderText('Add a username');
        await user.type(field, 'ghost');
        await user.click(screen.getByRole('button', {name: 'Add'}));

        expect(onAddUser).toHaveBeenCalledWith('ghost');
        expect(field).toHaveValue('ghost');
    });
});

describe('FeedView feed body', () => {
    it('renders an item per feed entry', () => {
        setup({
            items: [
                makeItem({actor: 'alice', action: 'starred', target: 'alice/repo'}),
                makeItem({actor: 'bob', action: 'forked', target: 'bob/repo'}),
            ],
        });
        expect(screen.getByRole('link', {name: 'alice'})).toBeInTheDocument();
        expect(screen.getByRole('link', {name: 'bob'})).toBeInTheDocument();
    });

    it('shows the empty state only when not loading', () => {
        const {rerender} = renderFeed({items: [], loading: false});
        expect(screen.getByText('No events yet.')).toBeInTheDocument();

        rerender({items: [], loading: true});
        expect(screen.queryByText('No events yet.')).not.toBeInTheDocument();
    });

    it('surfaces a UI error and per-source fetch errors', () => {
        setup({uiError: 'could not add user', fetchErrors: ['octocat: rate limited']});
        expect(screen.getByText('could not add user')).toBeInTheDocument();
        expect(screen.getByText('octocat: rate limited')).toBeInTheDocument();
    });
});

describe('FeedView banners and badge', () => {
    it('offers re-authentication when the session is unauthorized', async () => {
        const user = userEvent.setup();
        const {onReauthenticate} = setup({unauthorized: true});

        const banner = screen.getByText(/session has expired/i).closest('.banner') as HTMLElement;
        await user.click(within(banner).getByRole('button', {name: 'Re-authenticate'}));
        expect(onReauthenticate).toHaveBeenCalled();
    });

    it('shows the new-items badge and jumps to top when clicked', async () => {
        const user = userEvent.setup();
        const {onJumpToTop} = setup({newCount: 3});

        await user.click(screen.getByRole('button', {name: '3 new ↑'}));
        expect(onJumpToTop).toHaveBeenCalled();
    });

    it('hides the new-items badge when there is nothing new', () => {
        setup({newCount: 0});
        expect(screen.queryByRole('button', {name: /new ↑/})).not.toBeInTheDocument();
    });
});

// A render helper that returns a typed rerender for the loading-state assertion.
function renderFeed(overrides: Partial<Parameters<typeof FeedView>[0]>) {
    const base = {
        users: [],
        onAddUser: vi.fn().mockResolvedValue(true),
        onRemoveUser: vi.fn(),
        uiError: '',
        items: [],
        loading: false,
        fetchErrors: [],
        unauthorized: false,
        onReauthenticate: vi.fn(),
        feedRef: createRef<HTMLElement>(),
        newCount: 0,
        onScroll: vi.fn(),
        onJumpToTop: vi.fn(),
    };
    const {rerender} = render(<FeedView {...base} {...overrides} />);
    return {
        rerender: (next: Partial<Parameters<typeof FeedView>[0]>) =>
            rerender(<FeedView {...base} {...overrides} {...next} />),
    };
}
