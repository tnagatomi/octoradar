import {describe, expect, it, vi} from 'vitest';
import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {DiscoverView} from './DiscoverView';
import type {DiscoverPrefs} from '../discover';
import {makeDiscoverResult, makeRepository} from '../test/factories';

// RepoCard renders ExternalLinks; stub the browser bridge.
vi.mock('../../wailsjs/runtime/runtime', () => ({
    BrowserOpenURL: vi.fn(),
}));

function setup(overrides: Partial<Parameters<typeof DiscoverView>[0]> = {}) {
    const props = {
        prefs: {period: 'month', language: ''} as DiscoverPrefs,
        onChangePrefs: vi.fn(),
        result: null,
        loading: false,
        unauthorized: false,
        onUpdateToken: vi.fn(),
        ...overrides,
    };
    render(<DiscoverView {...props} />);
    return props;
}

describe('DiscoverView filters', () => {
    it('marks the current period active and reports a new period choice', async () => {
        const user = userEvent.setup();
        const {onChangePrefs} = setup({prefs: {period: 'month', language: 'go'}});

        expect(screen.getByRole('button', {name: 'Monthly'})).toHaveClass('active');
        expect(screen.getByRole('button', {name: 'Weekly'})).not.toHaveClass('active');

        await user.click(screen.getByRole('button', {name: 'Weekly'}));
        // The whole prefs object is carried forward with only the period changed.
        expect(onChangePrefs).toHaveBeenCalledWith({period: 'week', language: 'go'});
    });

    it('reports a language change while preserving the period', async () => {
        const user = userEvent.setup();
        const {onChangePrefs} = setup({prefs: {period: 'quarter', language: ''}});

        await user.selectOptions(screen.getByLabelText('Language'), 'rust');
        expect(onChangePrefs).toHaveBeenCalledWith({period: 'quarter', language: 'rust'});
    });
});

describe('DiscoverView results', () => {
    it('renders a card per repository with formatted counts', () => {
        setup({
            result: makeDiscoverResult({
                repositories: [
                    makeRepository({fullName: 'octocat/spoon-knife', stars: 12345, forks: 6789}),
                ],
            }),
        });
        expect(screen.getByRole('link', {name: 'octocat/spoon-knife'})).toBeInTheDocument();
        // RepoCard formats large numbers with thousands separators.
        expect(screen.getByText('⭐ 12,345')).toBeInTheDocument();
        expect(screen.getByText('🍴 6,789')).toBeInTheDocument();
    });

    it('shows a loading hint while fetching with no results yet', () => {
        setup({result: null, loading: true});
        expect(screen.getByText('Loading trending repositories…')).toBeInTheDocument();
    });

    it('shows an empty hint when a finished load returned nothing', () => {
        setup({result: makeDiscoverResult({repositories: []}), loading: false});
        expect(screen.getByText('No trending repositories found.')).toBeInTheDocument();
    });

    it('renders per-source errors', () => {
        setup({result: makeDiscoverResult({errors: ['search: rate limited']})});
        expect(screen.getByText('search: rate limited')).toBeInTheDocument();
    });
});

describe('DiscoverView unauthorized', () => {
    it('offers re-authentication and suppresses the empty hint', async () => {
        const user = userEvent.setup();
        const {onUpdateToken} = setup({
            unauthorized: true,
            result: makeDiscoverResult({unauthorized: true}),
        });

        expect(screen.queryByText('No trending repositories found.')).not.toBeInTheDocument();

        const banner = screen.getByText(/session has expired/i).closest('.banner') as HTMLElement;
        await user.click(within(banner).getByRole('button', {name: 'Re-authenticate'}));
        expect(onUpdateToken).toHaveBeenCalled();
    });
});
