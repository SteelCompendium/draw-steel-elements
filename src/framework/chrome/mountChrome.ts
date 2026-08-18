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
import type {
	ChromeHandle,
	ChromeMenuItem,
	ElementChrome,
	ElementChromeContext,
	ElementSummary,
} from './types';
import { isChromeMobile } from './platform';

/** SessionStore slot for the user's collapse toggle. */
export const CHROME_COLLAPSE_SLOT = 'chrome.collapsed';

/**
 * SC-169 round 2, Scott's PLACEMENT ruling ("the panel must sit at the same offset from the
 * card's right edge on every element").
 *
 * A `position: absolute` child is offset from its containing block's PADDING box, but the
 * thing a reader sees — and measures the panel against — is the card frame's BORDER box.
 * The two differ by the frame's own border width, and only for those elements whose chrome
 * anchor IS the framed node (`ds-statblock`'s `.dse-sb`) rather than an unframed wrapper
 * (`ds-hero`, `ds-stamina`). Left uncorrected that is the difference between a panel that
 * rests ON the top border and one that rests ABOVE it — i.e. exactly the "the panel covers
 * the border / the winded border looks cropped" report.
 *
 * There is no CSS way to read the containing block's own border width, so the framework
 * measures it ONCE at mount and republishes it as a custom property the sheet subtracts.
 * Border widths are not layout-dependent, so this is a style read, not a layout read, and a
 * detached node (jsdom, or a view built off-document) simply yields 0 — the pre-correction
 * geometry, never a crash.
 */
const FRAME_BORDER_VARS = {
	Top: '--dse-chrome-frame-border-top',
	Right: '--dse-chrome-frame-border-right',
} as const;

/** The used `border-*-width` of `el`, in CSS px; 0 for a detached/unstyled node. */
function usedBorderPx(el: HTMLElement, side: 'Top' | 'Right'): number {
	const win = el.ownerDocument?.defaultView;
	if (!win) return 0;
	const raw = win.getComputedStyle(el)[`border${side}Width` as 'borderTopWidth'];
	const n = Number.parseFloat(raw ?? '');
	return Number.isFinite(n) ? n : 0;
}

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
	/** Authored default from the reserved `collapsed:`/`collapse_default:` keys. Default
	 *  false (expanded). */
	collapsedDefault?: boolean;
	/**
	 * SC-169 round 2, Scott's ruling 2: `collapsible: false` removes the collapse control
	 * altogether. Default true. When false AND no menu item survives, `mountChrome` mounts
	 * NOTHING — no panel, no summary, no attributes — and returns undefined.
	 */
	collapsible?: boolean;
	/**
	 * SC-169 round 2, Scott's ruling 5 ("the collapsed form should show the actual name, not
	 * the scc entity"). Consulted BEFORE `chrome.summary(ctx)` every time the element
	 * collapses; returning undefined falls back to it. The one implementer is
	 * `RefUnwrapView`, whose resolved model — the real statblock/feature — only exists after
	 * an async round-trip that has no representative in `ctx.model` (a `{kind:'ref'}`
	 * wrapper holding the code the author typed).
	 */
	summary?: () => ElementSummary | undefined;
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
export function mountChrome<M>(opts: MountChromeOptions<M>, owner: Component): ChromeHandle | undefined {
	const { root, chrome, ctx, persist } = opts;
	const anchor = opts.anchor ?? root;
	const collapsible = opts.collapsible !== false;
	const items = [...(opts.pipelineItems ?? []), ...(chrome.items?.(ctx) ?? [])];

	// Scott's ruling 2, second half: "when false, no collapse item, no panel if that leaves
	// it empty". An element that declares `collapsible: false` and contributes no other
	// affordance gets the DOM it had before it opted into chrome — not an empty plate that
	// appears on hover and does nothing.
	if (!collapsible && items.length === 0) return undefined;

	root.setAttribute('data-dse-chrome', '');
	// The panel is absolutely positioned against this node, so it must establish the
	// containing block. A class (not an inline style) — F1 §1.4 bans `el.style.*`.
	anchor.addClass('dse-chrome-anchor');
	// …and republish the anchor's own border widths so the sheet can offset the panel from
	// the frame's BORDER box rather than its padding box (see FRAME_BORDER_VARS). The only
	// sanctioned `.style` use in this codebase is `setProperty('--dse-*', …)` (SC-5).
	for (const [side, prop] of Object.entries(FRAME_BORDER_VARS) as ['Top' | 'Right', string][]) {
		anchor.style.setProperty(prop, `${usedBorderPx(anchor, side)}px`);
	}
	if (isChromeMobile()) root.setAttribute('data-dse-chrome-mobile', 'on');

	// ------------------------------------------------------------- the collapsed form
	// Appended before the panel so the panel stays the root's last child (the pipeline's
	// own pencil convention). Both are display:none until collapse/hover reveals them.
	// Built only when the element can actually collapse — `collapsible: false` means the
	// one-line form is unreachable, so it is not in the DOM at all.
	const summaryEl = collapsible ? root.createDiv({ cls: 'dse-chrome-summary' }) : undefined;
	const summaryTextEl = summaryEl?.createDiv({ cls: 'dse-chrome-summary__text' });
	const labelEl = summaryTextEl?.createSpan({ cls: 'dse-chrome-summary__label' });
	const nameEl = summaryTextEl?.createSpan({ cls: 'dse-chrome-summary__name' });
	const detailEl = summaryTextEl?.createSpan({ cls: 'dse-chrome-summary__detail' });

	// ------------------------------------------------------------- the panel
	const panelEl = anchor.createDiv({ cls: 'dse-chrome' });
	panelEl.setAttribute('role', 'toolbar');
	panelEl.setAttribute('aria-label', `${ctx.def.name} actions`);

	let collapsed =
		collapsible &&
		(persist?.session.get<boolean>(persist.blockKey, CHROME_COLLAPSE_SLOT) ?? opts.collapsedDefault === true);

	// The collapse/expand toggle is built FIRST and kept as the panel's last child, so it
	// is always the rightmost button — the fixed anchor the panel grows leftward from
	// (SC-169: "can expand from right-to-left as items get added").
	const toggle = collapsible
		? iconButton(
				panelEl,
				{
					icon: 'chevron-up',
					label: `Collapse ${ctx.def.name}`,
					variant: 'ghost',
					tooltip: `Collapse ${ctx.def.name}`,
					onClick: () => apply(!collapsed, true),
				},
				owner,
			)
		: undefined;
	toggle?.buttonEl.setAttribute('data-dse-chrome-item', 'collapse');
	const toggleIconEl = toggle?.buttonEl.querySelector<HTMLElement>('.dse-btn__icon') ?? toggle?.buttonEl;

	// The collapsed bar's OWN expand affordance, on the right (SC-169: "on the right will
	// be the expand button"). It is IN FLOW and always visible while collapsed — without
	// it a collapsed element would be a dead end anywhere hover is unavailable, and per
	// Scott's ruling 4 it is the ONLY control a collapsed element shows (the floating panel
	// is suppressed while collapsed — styles-source.css, "COLLAPSED").
	const expand = summaryEl
		? iconButton(
				summaryEl,
				{
					icon: 'chevron-down',
					label: `Expand ${ctx.def.name}`,
					variant: 'ghost',
					tooltip: `Expand ${ctx.def.name}`,
					onClick: () => apply(false, true),
				},
				owner,
			)
		: undefined;
	expand?.buttonEl.setAttribute('data-dse-chrome-item', 'expand');

	/** Appends an item and keeps the collapse toggle rightmost. */
	function pushItem(item: ChromeMenuItem, itemOwner: Component): void {
		const handle = iconButton(
			panelEl,
			{ icon: item.icon, label: item.label, variant: 'ghost', tooltip: item.label, onClick: item.onClick },
			itemOwner,
		);
		handle.buttonEl.setAttribute('data-dse-chrome-item', item.id);
		if (toggle) panelEl.appendChild(toggle.buttonEl);
	}

	/** Recomputed on every collapse so a live model (stamina, resources) reads current, and
	 *  so a REFERENCE body that has since resolved reports the entry's real name rather than
	 *  the code the author typed (Scott's ruling 5 — see MountChromeOptions.summary). */
	function paintSummary(): void {
		const summary = opts.summary?.() ?? chrome.summary(ctx);
		labelEl?.setText(summary.label);
		nameEl?.setText(summary.name ? `: ${summary.name}` : '');
		detailEl?.setText(summary.detail ? ` (${summary.detail})` : '');
	}

	function apply(next: boolean, write: boolean): void {
		if (!collapsible) return;
		collapsed = next;
		if (next) {
			paintSummary();
			root.setAttribute('data-dse-collapsed', 'on');
		} else {
			root.removeAttribute('data-dse-collapsed');
		}
		toggle?.setLabel(next ? `Expand ${ctx.def.name}` : `Collapse ${ctx.def.name}`);
		toggle?.buttonEl.setAttribute('aria-expanded', String(!next));
		if (toggleIconEl) setIcon(toggleIconEl, next ? 'chevron-down' : 'chevron-up');
		expand?.buttonEl.setAttribute('aria-expanded', String(!next));
		if (write && persist) persist.session.set(persist.blockKey, CHROME_COLLAPSE_SLOT, next);
	}

	for (const item of items) pushItem(item, owner);

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
