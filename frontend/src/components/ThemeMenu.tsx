import {useEffect, useRef, useState} from 'react';
import {type ResolvedTheme, type ThemePreference} from '../theme';
import {MoonIcon, SunIcon} from './icons';

// Appearance picker: an icon button (sun/moon for the active theme) that opens
// a small popover to choose Auto / Light / Dark.
export function ThemeMenu({
    preference,
    resolved,
    onSelect,
}: {
    preference: ThemePreference;
    resolved: ResolvedTheme;
    onSelect: (pref: ThemePreference) => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Close on outside click or Escape while the popover is open.
    useEffect(() => {
        if (!open) {
            return;
        }
        const onPointerDown = (e: PointerEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOpen(false);
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const options: {value: ThemePreference; label: string}[] = [
        {value: 'auto', label: 'Auto'},
        {value: 'light', label: 'Light'},
        {value: 'dark', label: 'Dark'},
    ];

    return (
        <div className="theme-menu" ref={ref}>
            <button
                className="secondary theme-toggle"
                aria-label="Color theme"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
            >
                {resolved === 'dark' ? <MoonIcon /> : <SunIcon />}
            </button>
            {open && (
                <ul className="theme-popover" role="menu">
                    {options.map((opt) => (
                        <li key={opt.value} role="none">
                            <button
                                role="menuitemradio"
                                aria-checked={preference === opt.value}
                                className={preference === opt.value ? 'active' : ''}
                                onClick={() => {
                                    onSelect(opt.value);
                                    setOpen(false);
                                }}
                            >
                                <span className="check" aria-hidden="true">
                                    {preference === opt.value ? '✓' : ''}
                                </span>
                                {opt.label}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
