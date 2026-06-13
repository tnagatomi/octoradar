import {describe, expect, it, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ThemeMenu} from './ThemeMenu';

function setup(overrides: Partial<Parameters<typeof ThemeMenu>[0]> = {}) {
    const props = {
        preference: 'auto' as const,
        resolved: 'light' as const,
        onSelect: vi.fn(),
        ...overrides,
    };
    render(<ThemeMenu {...props} />);
    return props;
}

describe('ThemeMenu', () => {
    it('keeps the popover closed until the toggle is clicked', async () => {
        const user = userEvent.setup();
        setup();

        const toggle = screen.getByRole('button', {name: 'Color theme'});
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();

        await user.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('checks the active preference in the popover', async () => {
        const user = userEvent.setup();
        setup({preference: 'dark'});

        await user.click(screen.getByRole('button', {name: 'Color theme'}));
        expect(screen.getByRole('menuitemradio', {name: 'Dark'})).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('menuitemradio', {name: 'Auto'})).toHaveAttribute('aria-checked', 'false');
    });

    it('reports the chosen preference and closes the popover', async () => {
        const user = userEvent.setup();
        const {onSelect} = setup({preference: 'auto'});

        await user.click(screen.getByRole('button', {name: 'Color theme'}));
        await user.click(screen.getByRole('menuitemradio', {name: 'Dark'}));

        expect(onSelect).toHaveBeenCalledWith('dark');
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('closes the popover on Escape', async () => {
        const user = userEvent.setup();
        setup();

        await user.click(screen.getByRole('button', {name: 'Color theme'}));
        expect(screen.getByRole('menu')).toBeInTheDocument();

        await user.keyboard('{Escape}');
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('closes the popover when clicking outside it', async () => {
        const user = userEvent.setup();
        render(
            <div>
                <ThemeMenu preference="auto" resolved="light" onSelect={vi.fn()} />
                <button>outside</button>
            </div>,
        );

        await user.click(screen.getByRole('button', {name: 'Color theme'}));
        expect(screen.getByRole('menu')).toBeInTheDocument();

        await user.click(screen.getByRole('button', {name: 'outside'}));
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
});
