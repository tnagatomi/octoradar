import {useCallback, useEffect, useState} from 'react';
import {loadPreference, resolveTheme, savePreference, type ResolvedTheme, type ThemePreference} from '../theme';

// Reads (window.matchMedia) the current OS dark-mode preference.
function systemPrefersDark(): boolean {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Owns the color-theme preference: applies the resolved theme to <html>,
// persists the choice, and — while following the OS — re-applies when the OS
// theme flips. The inline script in index.html applies the theme before this
// mounts; this keeps it in sync afterwards. The resolved theme is exposed so
// the header control can show the matching icon.
export function useTheme(): {
    preference: ThemePreference;
    resolved: ResolvedTheme;
    setPreference: (pref: ThemePreference) => void;
} {
    const [preference, setPreference] = useState<ThemePreference>(() => loadPreference());
    const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(preference, systemPrefersDark()));

    const apply = useCallback((theme: ResolvedTheme) => {
        setResolved(theme);
        document.documentElement.setAttribute('data-theme', theme);
    }, []);

    useEffect(() => {
        apply(resolveTheme(preference, systemPrefersDark()));
        savePreference(preference);
    }, [preference, apply]);

    useEffect(() => {
        if (preference !== 'auto') {
            return;
        }
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = () => apply(resolveTheme('auto', media.matches));
        media.addEventListener('change', onChange);
        return () => media.removeEventListener('change', onChange);
    }, [preference, apply]);

    return {preference, resolved, setPreference};
}
