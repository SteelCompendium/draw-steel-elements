// SC-431 test helper: stands in for Obsidian's Keymap, which listens for keydown on `window` in
// the CAPTURE phase and runs the active modal's Scope from there (app.js 1.14.4: `Keymap`
// constructor, `window.addEventListener("keydown", onKeyEvent, true)`; a `false` result from
// the Scope means preventDefault + stopPropagation). This is the ordering jsdom tests were blind
// to: the Scope sees the key BEFORE the focused field's own keydown handler.
import type { Scope } from '../mocks/obsidian';

const modifiersOf = (e: KeyboardEvent): string =>
	[e.ctrlKey && 'Ctrl', e.metaKey && 'Meta', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean).join(',');

/** Routes window-capture keydowns to `modal.scope`; returns the detach function. */
export function attachObsidianKeymap(modal: { scope: unknown }): () => void {
	// jest maps `obsidian` to the mock, whose Scope carries the `handleKey` the real one keeps internal.
	const scope = modal.scope as Scope;
	const onKey = (e: KeyboardEvent): void => {
		const result = scope.handleKey(e, { modifiers: modifiersOf(e), key: e.key, vkey: e.code });
		if (result === false) {
			e.preventDefault();
			e.stopPropagation();
		}
	};
	window.addEventListener('keydown', onKey, true);
	return () => window.removeEventListener('keydown', onKey, true);
}

/** Dispatches a real, bubbling, cancelable Escape keydown at `target`; true = not default-prevented. */
export function pressEscape(target: HTMLElement): boolean {
	return target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
}
