import {ReactNode} from 'react';
import {BrowserOpenURL} from '../../wailsjs/runtime/runtime';

// Anchor that opens its href in the user's default browser instead of
// navigating the WebView.
export function ExternalLink({href, className, children}: {href: string; className?: string; children: ReactNode}) {
    return (
        <a
            href={href}
            className={className}
            onClick={(e) => {
                e.preventDefault();
                BrowserOpenURL(href);
            }}
        >
            {children}
        </a>
    );
}
