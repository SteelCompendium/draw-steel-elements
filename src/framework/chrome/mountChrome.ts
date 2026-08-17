// SC-169 — the ONE implementation of the standard element menu panel + whole-element
// collapse. Framework-level chrome: every opted-in element gets the identical panel, the
// identical collapsed form and the identical persistence semantics; per-element code
// supplies only the `chrome` slot (types.ts).
//
// SHAPE (Scott's description on SC-169): top-right, positioned OUTSIDE the container —
// overlapping ABOVE its top edge — hidden until the cursor is over the container or the
// panel, icon-only, short, growing right-to-left as items are added, in the form factor of
// an OS window's minimise/maximise/close cluster. It may overlap the element above; the
// attachment styling (square bottom corners seated on the card's top edge, shared border,
// downward shadow) is what makes ownership read. All of that is CSS
// (`styles-source.css` → "Element chrome (SC-169)"); this module owns DOM + behaviour only.
//
// COLLAPSE is the two-layer pattern the kit collapsible already established, lifted to the
// whole element:
//   layer 1 — the AUTHORED default: the reserved `collapsed:` YAML key (collapsedKey.ts).
//   layer 2 — the USER toggle: SessionStore, keyed (blockKey, "chrome.collapsed"), so it
//             survives the reading-mode echo-rebuild and is forgotten on plugin unload.
// Toggling NEVER writes the note (F1 §4.3 / SC-169 ruling 1).
//
// PRINT: this module emits DOM unconditionally; the print scheme hides all of it
// (`.dse-chrome`/`.dse-chrome-summary` are `display:none` in the unscoped base and are
// only revealed under `[data-dse-theme='steel']:not([data-dse-print="on"])`), and the
// collapse rules are print-excluded too, so a collapsed element prints in FULL — the same
// answer print rule 3 already gives the kit collapsible. An opted-in element's print
// rendering is therefore byte-identical to what it was before it opted in; the freeze gate
// proves that rather than being told.
import type { Component } from 'obsidian';
import { setIcon } from 'obsidian';
import { iconButton } from '../kit/iconButton';
import type { SessionPersist } from '../session';
import type { ChromeHandle, ChromeMenuItem, ElementChrome, ElementChromeContext } from './types';
import { isChromeMobile } from './platform';

/** SessionStore slot for the user's collapse toggle. */
export const CHROME_COLLAPSE_SLOT = 'chrome.collapsed';

export interface MountChromeOptions<M> {
	/** The element root (`[data-dse-element]`) — carries the collapse attribute and hosts
	 *  the collapsed one-line bar. */
	root: HTMLElement;
	/**
	 * The node the PANEL is positioned against: whichever node carries the element's
	 * visible card frame. The pipeline passes `view.authoringAnchor()` — SC-145 already
	 * defined exactly that contract for the edit pencil, and the panel wants the same
	 * answer for the same reason (a panel seated on the ROOT's top edge floats in space
	 * for any view whose visible frame is a nested child). Defaults to `root`.
	 */
	anchor?: HTMLElement;
	chrome: ElementChrome<M>;
	ctx: ElementChromeContext<M>;
	/** Session round-trip for the collapse state. Omit in contexts with no block key. */
	persist?: SessionPersist;
	/** Authored default from the reserved `collapsed:` key. Default false (expanded). */
	collapsedDefault?: boolean;
	/**
	 * Items the PIPELINE contributes (today: the `authoringControls` edit pencil). They
	 * render left of the element's own items, which render left of collapse/expand.
	 */
	pipelineItems?: ChromeMenuItem[];
}

/**
 * Mounts the standard chrome onto `root`. Returns a handle; every listener is bound to
 * `owner` (F1 §4.5), so unloading the view detaches everything.
 */
export function mountChrome<M>(opts: MountChromeOptions<M>, owner: Component): ChromeHandle {
	const { root, chrome, ctx, persist } = opts;
	const anchor = opts.anchor ?? root;

	root.setAttribute('data-dse-chrome', '');
	// The panel is absolutely positioned against this node, so it must establish the
	// containing block. A class (not an inline style) — F1 §1.4 bans `el.style.*`.
	anchor.addClass('dse-chrome-anchor');
	if (isChromeMobile()) root.setAttribute('data-dse-chrome-mobile', 'on');

	// ------------------------------------------------------------- the collapsed form
	// Appended before the panel so the panel stays the root's last child (the pipeline's
	// own pencil convention). Both are display:none until collapse/hover reveals them.
	const summaryEl = root.createDiv({ cls: 'dse-chrome-summary' });
	const summaryTextEl = summaryEl.createDiv({ cls: 'dse-chrome-summary__text' });
	const labelEl = summaryTextEl.createSpan({ cls: 'dse-chrome-summary__label' });
	const nameEl = summaryTextEl.createSpan({ cls: 'dse-chrome-summary__name' });
	const detailEl = summaryTextEl.createSpan({ cls: 'dse-chrome-summary__detail' });

	// ------------------------------------------------------------- the panel
	const panelEl = anchor.createDiv({ cls: 'dse-chrome' });
	panelEl.setAttribute('role', 'toolbar');
	panelEl.setAttribute('aria-label', `${ctx.def.name} actions`);

	let collapsed =
		persist?.session.get<boolean>(persist.blockKey, CHROME_COLLAPSE_SLOT) ?? opts.collapsedDefault === true;

	// The collapse/expand toggle is built FIRST and kept as the panel's last child, so it
	// is always the rightmost button — the fixed anchor the panel grows leftward from
	// (SC-169: "can expand from right-to-left as items get added").
	const toggle = iconButton(
		panelEl,
		{
			icon: 'chevron-up',
			label: `Collapse ${ctx.def.name}`,
			variant: 'ghost',
			tooltip: `Collapse ${ctx.def.name}`,
			onClick: () => apply(!collapsed, true),
		},
		owner,
	);
	toggle.buttonEl.setAttribute('data-dse-chrome-item', 'collapse');
	const toggleIconEl = toggle.buttonEl.querySelector<HTMLElement>('.dse-btn__icon') ?? toggle.buttonEl;

	// The collapsed bar's OWN expand affordance, on the right (SC-169: "on the right will
	// be the expand button"). It is IN FLOW and always visible while collapsed — without
	// it a collapsed element would be a dead end anywhere hover is unavailable.
	const expand = iconButton(
		summaryEl,
		{
			icon: 'chevron-down',
			label: `Expand ${ctx.def.name}`,
			variant: 'ghost',
			tooltip: `Expand ${ctx.def.name}`,
			onClick: () => apply(false, true),
		},
		owner,
	);
	expand.buttonEl.setAttribute('data-dse-chrome-item', 'expand');

	/** Appends an item and keeps the collapse toggle rightmost. */
	function pushItem(item: ChromeMenuItem, itemOwner: Component): void {
		const handle = iconButton(
			panelEl,
			{ icon: item.icon, label: item.label, variant: 'ghost', tooltip: item.label, onClick: item.onClick },
			itemOwner,
		);
		handle.buttonEl.setAttribute('data-dse-chrome-item', item.id);
		panelEl.appendChild(toggle.buttonEl);
	}

	/** Recomputed on every collapse so a live model (stamina, resources) reads current. */
	function paintSummary(): void {
		const summary = chrome.summary(ctx);
		labelEl.setText(summary.label);
		nameEl.setText(summary.name ? `: ${summary.name}` : '');
		detailEl.setText(summary.detail ? ` (${summary.detail})` : '');
	}

	function apply(next: boolean, write: boolean): void {
		collapsed = next;
		if (next) {
			paintSummary();
			root.setAttribute('data-dse-collapsed', 'on');
		} else {
			root.removeAttribute('data-dse-collapsed');
		}
		toggle.setLabel(next ? `Expand ${ctx.def.name}` : `Collapse ${ctx.def.name}`);
		toggle.buttonEl.setAttribute('aria-expanded', String(!next));
		setIcon(toggleIconEl, next ? 'chevron-down' : 'chevron-up');
		expand.buttonEl.setAttribute('aria-expanded', String(!next));
		if (write && persist) persist.session.set(persist.blockKey, CHROME_COLLAPSE_SLOT, next);
	}

	for (const item of opts.pipelineItems ?? []) pushItem(item, owner);
	for (const item of chrome.items?.(ctx) ?? []) pushItem(item, owner);

	// Initial mount writes no session value — only real state CHANGES are persisted
	// (the kit collapsible's contract, framework/kit/collapsible.ts).
	apply(collapsed, false);

	return {
		panelEl,
		summaryEl,
		isCollapsed: () => collapsed,
		setCollapsed: (next: boolean) => apply(next, true),
		addItem: pushItem,
	};
}
