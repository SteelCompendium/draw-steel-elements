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
import { claimChromeFocus, focusControl, isKeyboardClick } from './focusHandoff';

/** SessionStore slot for the user's collapse toggle. */
export const CHROME_COLLAPSE_SLOT = 'chrome.collapsed';

/**
 * SC-169 FIX ROUND 1 (H-1) — the last-resort safety net: a collapsed element must never be
 * a blank hole in the note.
 *
 * `data-dse-collapsed="on"` lives on the element ROOT, and the collapse rule hides every
 * one of root's children that is not chrome. The one-line summary bar is therefore the
 * ONLY thing a collapsed element paints, and the expand button on it is the only way back.
 * So the attribute and the bar are two halves of one state: if the bar is ever missing
 * while the attribute is set, the block renders as nothing at all AND offers no way to
 * recover — the exact failure H-1 reproduced (a rebuild dropped the bar and left the
 * attribute behind).
 *
 * The primary fix is that the pipeline re-mounts chrome after every rebuild. This runs
 * immediately after that, as an assertion with a safe fallback rather than a hope: if the
 * bar is somehow still absent, drop the attribute so the element renders EXPANDED. A
 * forgotten fold is a nuisance; an invisible, unrecoverable block is data the reader
 * cannot reach.
 */
export function ensureCollapseInvariant(root: HTMLElement): void {
	if (root.getAttribute('data-dse-collapsed') !== 'on') return;
	if (root.querySelector(':scope > .dse-chrome-summary') !== null) return;
	root.removeAttribute('data-dse-collapsed');
}

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
 * measures it and republishes it as a custom property the sheet subtracts. Border widths
 * are not layout-dependent, so this is a style read, not a layout read.
 *
 * SC-533: a style read forces a style recalc of the freshly drawn element (~190 ms on a
 * 25-hero tracker), and a custom-property write on the anchor dirties its whole subtree
 * again. So the read is deferred to the next animation frame, which has to style the new
 * DOM anyway, and is batched: every pending anchor is read before any panel is written,
 * and the vars go on the panel (their only consumer) so the write invalidates only the
 * panel. Until the frame runs the panel uses the sheet's `0px` fallback. The panel is
 * `opacity: 0` until hovered or revealed (always visible on mobile), so for a panel that is
 * in the document that is at most a 1px offset until the frame. A panel that is not in the
 * document when the frame runs
 * (Reading view renders blocks below the first screen off-document; Live Preview detaches
 * a widget shortly after mounting it and puts the same DOM back when it scrolls into
 * view) cannot be measured then: it waits in a per-window IntersectionObserver on its
 * anchor and is measured, in the same reads-then-writes batch, when the anchor first
 * intersects the viewport. That callback runs after the frame in which the card scrolls in
 * is painted, so such a panel can show the fallback for a frame or two (a collapsed block
 * expanded by a click, for a few); only a hovered panel, or any panel on mobile, shows it.
 * A window without IntersectionObserver keeps the fallback.
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

interface PendingFrameBorders {
	anchor: HTMLElement;
	panelEl: HTMLElement;
}
/** SC-533: per window, the panels waiting for their frame-border vars, and the one frame
 *  that will publish them all. */
const pendingFrameBorders = new Map<Window, { entries: Set<PendingFrameBorders>; frame: number }>();
/** SC-533: per window, the entries whose panel was not in the document at the frame, keyed
 *  by the anchor the observer watches until it intersects the viewport. */
const parkedFrameBorders = new Map<
	Window,
	{ io: IntersectionObserver; byAnchor: Map<HTMLElement, Set<PendingFrameBorders>> }
>();

/**
 * SC-533: publish the anchor's border widths on the panel in the next animation frame of the
 * anchor's OWN window (a popout has its own). One frame serves every mount queued before it
 * runs: all reads first, then all writes, so no write dirties the tree before a later read.
 * A panel that is out of the document at that frame is handed to an IntersectionObserver
 * (see FRAME_BORDER_VARS); unloading `owner` drops the entry from the queue and the observer.
 */
function queueFrameBorders(anchor: HTMLElement, panelEl: HTMLElement, owner: Component): void {
	const win = anchor.ownerDocument?.defaultView;
	if (!win || typeof win.requestAnimationFrame !== 'function') return;
	const entry: PendingFrameBorders = { anchor, panelEl };
	let queue = pendingFrameBorders.get(win);
	if (!queue) {
		const created = { entries: new Set<PendingFrameBorders>(), frame: 0 };
		created.frame = win.requestAnimationFrame(() => flushFrameBorders(win));
		pendingFrameBorders.set(win, created);
		queue = created;
	}
	queue.entries.add(entry);
	owner.register(() => dropFrameBorders(win, entry));
}

/** Read every entry's anchor borders first, then write every panel's vars. */
function publishFrameBorders(entries: Iterable<PendingFrameBorders>): void {
	const list = [...entries];
	const widths = list.map((e) => ({ Top: usedBorderPx(e.anchor, 'Top'), Right: usedBorderPx(e.anchor, 'Right') }));
	list.forEach((e, i) => {
		// The only sanctioned `.style` use in this codebase is `setProperty('--dse-*', …)` (SC-5).
		for (const [side, prop] of Object.entries(FRAME_BORDER_VARS) as ['Top' | 'Right', string][]) {
			e.panelEl.style.setProperty(prop, `${widths[i][side]}px`);
		}
	});
}

function flushFrameBorders(win: Window): void {
	const queue = pendingFrameBorders.get(win);
	pendingFrameBorders.delete(win);
	if (!queue) return;
	const live: PendingFrameBorders[] = [];
	for (const e of queue.entries) {
		if (e.panelEl.isConnected) live.push(e);
		else parkFrameBorders(win, e);
	}
	publishFrameBorders(live);
}

function parkFrameBorders(win: Window, entry: PendingFrameBorders): void {
	const IO = (win as Window & { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
	if (typeof IO !== 'function') return;
	let parked = parkedFrameBorders.get(win);
	if (!parked) {
		parked = {
			// The callback runs after layout, so the style read is cheap. rootMargin only widens the window
			// rectangle; the scroller's own clip still applies, so nothing fires before the card enters the
			// scroller, and the callback is a task that runs after that frame is painted. A panel can
			// therefore show the 1 px fallback for a frame or two as it scrolls in (and a collapsed block
			// expanded by a click for a few frames). That is only visible on a hovered panel or on mobile.
			io: new IO((records) => publishParkedFrameBorders(win, records), { rootMargin: '200px 0px' }),
			byAnchor: new Map(),
		};
		parkedFrameBorders.set(win, parked);
	}
	let set = parked.byAnchor.get(entry.anchor);
	if (!set) {
		set = new Set();
		parked.byAnchor.set(entry.anchor, set);
	}
	set.add(entry);
	parked.io.observe(entry.anchor);
}

function publishParkedFrameBorders(win: Window, records: IntersectionObserverEntry[]): void {
	const parked = parkedFrameBorders.get(win);
	if (!parked) return;
	const ready = new Set<PendingFrameBorders>();
	for (const rec of records) {
		if (!rec.isIntersecting) continue;
		for (const e of parked.byAnchor.get(rec.target as HTMLElement) ?? []) if (e.panelEl.isConnected) ready.add(e);
	}
	publishFrameBorders(ready);
	for (const e of ready) dropFrameBorders(win, e);
}

/** Remove `entry` from the frame queue and the observer (both may hold it at most once). */
function dropFrameBorders(win: Window, entry: PendingFrameBorders): void {
	const queue = pendingFrameBorders.get(win);
	if (queue) {
		queue.entries.delete(entry);
		if (queue.entries.size === 0) {
			win.cancelAnimationFrame(queue.frame);
			pendingFrameBorders.delete(win);
		}
	}
	const parked = parkedFrameBorders.get(win);
	const set = parked?.byAnchor.get(entry.anchor);
	if (!parked || !set) return;
	set.delete(entry);
	if (set.size > 0) return;
	parked.byAnchor.delete(entry.anchor);
	parked.io.unobserve(entry.anchor);
	if (parked.byAnchor.size === 0) {
		parked.io.disconnect();
		parkedFrameBorders.delete(win);
	}
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
	/** SC-505: the block's key AS OF NOW (`host.blockKey()`). `persist.blockKey` is a snapshot taken at mount, and a fresh
	 *  render mounts before Obsidian can say where the block is (its key is then the position-free fallback); a
	 *  keyboard Pin's request for its button back is matched against the live value once the panel is in the document. */
	blockKeyNow?: () => string;
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
	if (isChromeMobile()) root.setAttribute('data-dse-chrome-mobile', 'on');

	// SC-520: in Live Preview a block inside a `> [!note]` callout is drawn in Obsidian's callout widget, and that widget's own
	// `click` handler (bubble phase; it honours defaultPrevented) moves the editor cursor into the callout: the callout turns into
	// its source and the block is gone, whichever chrome button was pressed. The element click shield (pipeline.ts armClickShield)
	// only covers pointerdown/mousedown, which is all Obsidian's code-block widgets listen to. A chrome button's own handler runs
	// first (it is the target), so cancelling the click's default here costs it nothing; the click still bubbles on, so
	// document-level listeners (the Recoveries popover's click-outside close) are untouched.
	const keepClickOutOfObsidian = (evt: MouseEvent): void => evt.preventDefault();

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
	if (summaryEl) owner.registerDomEvent(summaryEl, 'click', keepClickOutOfObsidian);

	// ------------------------------------------------------------- the panel
	const panelEl = anchor.createDiv({ cls: 'dse-chrome' });
	panelEl.setAttribute('role', 'toolbar');
	panelEl.setAttribute('aria-label', `${ctx.def.name} actions`);
	// …and republish the anchor's own border widths on the panel, next frame, so the sheet can
	// offset it from the frame's BORDER box rather than its padding box (SC-533, see FRAME_BORDER_VARS).
	queueFrameBorders(anchor, panelEl, owner);

	owner.registerDomEvent(panelEl, 'click', keepClickOutOfObsidian);

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
					control: 'chrome.collapse',
					onClick: (evt) => apply(!collapsed, true, isKeyboardClick(evt)),
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
					control: 'chrome.expand',
					onClick: (evt) => apply(false, true, isKeyboardClick(evt)),
				},
				owner,
			)
		: undefined;
	expand?.buttonEl.setAttribute('data-dse-chrome-item', 'expand');

	/** Appends an item and keeps the collapse toggle rightmost. */
	function pushItem(item: ChromeMenuItem, itemOwner: Component): void {
		const handle = iconButton(
			panelEl,
			{ icon: item.icon, label: item.label, variant: 'ghost', control: item.control, onClick: item.onClick },
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

	/**
	 * SC-505 — a KEYBOARD toggle hands focus to the control that replaces the one it just hid: Collapse hides the
	 * panel (and the Collapse button with it), so focus goes to the one-liner's Expand button; Expand hides the
	 * one-liner, so focus goes back to the restored Collapse button. Toggling writes no note and rebuilds nothing,
	 * so both buttons are final by now. If the Collapse button cannot take focus (a hidden panel), the nearest tab
	 * stop around it inside the element is the fallback (the stamina bar, whose panel sits inside it); never <body>.
	 */
	function handOffFocus(nowCollapsed: boolean): void {
		if (nowCollapsed) {
			focusControl(expand?.buttonEl);
			return;
		}
		if (focusControl(toggle?.buttonEl)) return;
		const stop = toggle?.buttonEl.closest<HTMLElement>('[tabindex]:not([tabindex="-1"])');
		if (stop && root.contains(stop)) focusControl(stop);
	}

	function apply(next: boolean, write: boolean, keyboard = false): void {
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
		if (keyboard) handOffFocus(next);
	}

	for (const item of items) pushItem(item, owner);

	// Initial mount writes no session value — only real state CHANGES are persisted
	// (the kit collapsible's contract, framework/kit/collapsible.ts).
	apply(collapsed, false);

	// SC-505: a keyboard Pin rebuilt this block; if it asked for its button back, claim it (focusHandoff.ts).
	if (opts.blockKeyNow) claimChromeFocus(opts.blockKeyNow, root);

	return {
		panelEl,
		summaryEl,
		isCollapsed: () => collapsed,
		setCollapsed: (next: boolean) => apply(next, true),
		addItem: pushItem,
	};
}
