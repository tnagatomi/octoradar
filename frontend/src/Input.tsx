import {InputHTMLAttributes, useId} from 'react';

/**
 * Shared text input that suppresses browser autofill by default.
 *
 * WebKit (WKWebView) ignores `autocomplete="off"` and drives autofill from
 * the field's name/label/placeholder heuristics plus previously entered
 * values. To defeat that we also give each field a unique, non-semantic
 * `name` so WebKit cannot match it against saved values, and turn off
 * autocorrect/capitalize/spellcheck. The companion CSS in App.css hides
 * WebKit's autofill buttons. Callers can override any of these via props.
 */
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
    const name = useId();
    return (
        <input
            name={name}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            {...props}
        />
    );
}
