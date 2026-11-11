// SC-598 test helper: stands in for Obsidian 1.15.1's page-preview popover, the two pieces that decide whether a click inside a DSE
// modal opened from it closes the preview (app.js; measured in real Obsidian, see the SC-598 ledger):
//
// - `T3`, a window CAPTURE `click` listener installed when the preview is shown. It collects, synchronously, the preview when it is
//   not "focused" and does not contain the click, and hides it 5 ms later EVEN IF it has become focused in between. It never looks
//   at `defaultPrevented` or at a modal.
// - the click-to-edit helper (`zh`), a bubble `click` listener on the embed container. It arms ONE timer per click, 150 ms when the
//   click landed on text (`clientX` / `clientY` non-zero stand for "on text" here), else 10 ms. The timer callback does nothing for a
//   default-prevented event; otherwise it default-prevents the click, focuses the preview (`isFocused`, `.is-editing`, its keymap
//   scope) and switches it into a source editor UNLESS the focus is on a button or input or the click's target is (inside) a button,
//   an input or an `.interactive-child`. The delays are LITERALS, never `HOVER_HELPER_DELAYS_MS`: a stand-in built from the
//   production constant would shrink with it (SC-595 r5 MEDIUM-1).
//
// Detached after each test (registered on the importing file's root), so a failing assertion cannot leave T3 listening for the next one.
import type { Scope } from '../mocks/obsidian';

export interface PreviewStandIn {
	/** `div.popover.hover-popover`, or a plain `div` when `inPreview` is false. */
	popover: HTMLElement;
	/** The helper's container (`hoverEl > .markdown-embed`): put the anchor inside it. */
	embed: HTMLElement;
	/** The preview's own keymap scope, pushed by the helper's timer. */
	scope: Scope;
	/** Every click that reached `embed` (the helper's listener runs for each, as Obsidian's does). */
	clicks: MouseEvent[];
	/** `hidden`: T3 hid it. `editor`: the helper switched it into a source editor. */
	state: { hidden: boolean; isFocused: boolean; editor: boolean };
}

export interface PreviewStandInOptions {
	app: { keymap: { pushScope(scope: Scope): void } };
	scope: Scope;
	inPreview?: boolean;
	/** What hiding the preview does to the cards in it (unload the owner view, which closes the modal it opened). */
	onHide?: () => void;
}

const live = new Set<() => void>();
afterEach(() => {
	for (const detach of live) detach();
	live.clear();
});

export function previewStandIn(opts: PreviewStandInOptions): PreviewStandIn {
	const popover = document.body.appendChild(document.createElement('div'));
	if (opts.inPreview !== false) popover.className = 'popover hover-popover';
	const embed = popover.appendChild(document.createElement('div'));
	embed.className = 'markdown-embed';
	const state = { hidden: false, isFocused: false, editor: false };
	const clicks: MouseEvent[] = [];

	const T3 = (e: Event): void => {
		if (state.isFocused || popover.contains(e.target as Node)) return;
		setTimeout(() => {
			state.hidden = true;
			popover.remove();
			opts.onHide?.();
		}, 5);
	};
	window.addEventListener('click', T3, { capture: true });
	live.add(() => window.removeEventListener('click', T3, { capture: true }));

	embed.addEventListener('click', (evt) => {
		clicks.push(evt as MouseEvent);
		if (evt.defaultPrevented || (evt as MouseEvent).detail > 1) return;
		const me = evt as MouseEvent;
		setTimeout(
			() => {
				if (evt.defaultPrevented) return;
				evt.preventDefault();
				state.isFocused = true;
				popover.classList.add('is-editing');
				opts.app.keymap.pushScope(opts.scope);
				const focused = document.activeElement as Element | null;
				const target = evt.target as Element | null;
				if (focused?.closest('button, input') || target?.closest('button, input, .collapse-indicator, .interactive-child')) return;
				state.editor = true;
			},
			me.clientX || me.clientY ? 150 : 10,
		);
	});

	return { popover, embed, scope: opts.scope, clicks, state };
}
