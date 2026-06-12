// DOM helpers for tracking and restoring the feed's scroll position. Kept pure
// (operate on a passed-in container) so the read-position hook stays readable.

// The id of the topmost at-least-partially-visible feed item, or null.
export function topmostVisibleId(container: HTMLElement): string | null {
    const top = container.getBoundingClientRect().top;
    const nodes = container.querySelectorAll<HTMLElement>('[data-item-id]');
    for (const node of nodes) {
        if (node.getBoundingClientRect().bottom > top + 1) {
            return node.dataset.itemId ?? null;
        }
    }
    return null;
}

// Scroll the feed so the given item sits at the top of the viewport. Returns
// false when the item is not rendered.
export function scrollToId(container: HTMLElement, id: string): boolean {
    const node = container.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`);
    if (!node) {
        return false;
    }
    container.scrollTop += node.getBoundingClientRect().top - container.getBoundingClientRect().top;
    return true;
}
