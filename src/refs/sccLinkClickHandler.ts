// src/refs/sccLinkClickHandler.ts — SC-135 phase 1 (option C): delegated click resolution
// for scc.v1: links on the surfaces the render-time DOM rewrite (rewriteSccAnchors.ts)
// never reaches — Live Preview, Source mode, and any third-party render of a note body.
//
// Why this exists (SC-135 diagnosis): rewriteSccAnchors only runs where the plugin
// controls the render (the vault-wide reading-mode post-processor, main.ts, and our own
// ElementView.renderMarkdown). Live Preview's CM6 pipeline and Source mode never invoke
// either, so an scc.v1: href survives to click time looking scheme-shaped
// (`[a-z][a-z0-9+.-]*:`) — Obsidian classifies it external, shows its "open an external
// application?" confirmation, and on approval hands the string to shell.openExternal,
// which finds no OS handler for the `scc.v1` scheme and does nothing. This module makes
// that click work instead of prompting-then-silently-failing, WITHOUT touching the note
// or the DOM rewrite — it's a pure click-time interception, reusing SccResolver verbatim.
//
// Capture-phase + stopImmediatePropagation is required to beat Obsidian's own confirm,
// which the SAME click would otherwise trigger a heartbeat later in the bubble phase.
import { Keymap, Notice } from 'obsidian';
import type { App, PaneType, WorkspaceWindow } from 'obsidian';
import { SccAnchorResolver } from './rewriteSccAnchors';

const SCC_PREFIX = /^scc(\.v\d+)?:/;

/**
 * What the handler does once it has decided a click is an (unrewritten) scc link — a
 * structural seam (mirrors SccAnchorResolver) so the branch logic below is unit-testable
 * in jsdom without standing up a real obsidian App/Workspace. main.ts wires this to the
 * real primitives via createSccClickActions.
 */
export interface SccClickActions {
	/** vault resolution — open the target file, honoring modifier/middle-click via `newLeaf`
	 *  (Keymap.isModEvent's return: false = same leaf, 'tab'/'split'/'window' otherwise). */
	openVault(linkpath: string, newLeaf: PaneType | boolean): void;
	/** web resolution — open the steelcompendium.io redirect in the browser, on the SAME
	 *  window the click happened in (popout-safe: never assumes the main window's `window`). */
	openWeb(url: string, win: Window): void;
	/** unresolved — a plain-language Notice instead of silently doing nothing (the exact
	 *  bug this ticket reports: prompt, then no action, no explanation). */
	notifyUnresolved(code: string): void;
}

/**
 * Capture-phase click/auxclick handler body. Returns true when the event targeted an
 * scc link and was handled (preventDefault + stopImmediatePropagation already called on
 * it); false when the event should fall through untouched (no anchor, or a non-scc href —
 * including an already-rewritten one, since rewriteSccAnchors always replaces the `scc`
 * href with a vault path / steelcompendium.io URL / removes the anchor entirely, so a
 * rewritten anchor never matches SCC_PREFIX here).
 */
export function handleSccLinkEvent(evt: MouseEvent, resolver: SccAnchorResolver, actions: SccClickActions): boolean {
	const target = evt.target as HTMLElement | null;
	const anchor = target?.closest?.('a') ?? null;
	if (!anchor) return false;
	const href = anchor.getAttribute('href');
	if (href === null || !SCC_PREFIX.test(href)) return false;

	// Beat Obsidian's own external-link confirmation, which would otherwise fire on this
	// SAME click a moment later (the unrewritten href still looks scheme-shaped to
	// Obsidian's link classifier).
	evt.preventDefault();
	evt.stopImmediatePropagation();

	const resolution = resolver.resolve(href);
	if (resolution.kind === 'vault') {
		actions.openVault(resolution.linkpath, Keymap.isModEvent(evt));
	} else if (resolution.kind === 'web') {
		const win = anchor.ownerDocument.defaultView ?? window;
		actions.openWeb(resolution.url, win);
	} else {
		actions.notifyUnresolved(resolution.code);
	}
	return true;
}

/** The one method this module needs from a Component/Plugin, so tests attach against a
 *  plain object instead of standing up the full obsidian mock — real Plugin satisfies
 *  this structurally (Component.registerDomEvent). */
export interface DomEventOwner {
	registerDomEvent(
		el: Document,
		type: string,
		callback: (evt: MouseEvent) => void,
		options?: boolean | AddEventListenerOptions,
	): void;
}

/**
 * Attaches capture-phase `click` + `auxclick` (middle-click; browsers route the middle
 * button through auxclick, not click) listeners to `doc`, lifecycle-bound to `owner` —
 * `registerDomEvent` detaches automatically when `owner` unloads, so calling this once per
 * window (main + each popout, see registerSccLinkClickHandling below) and letting the
 * plugin's own unload tear every one of them down is sufficient; no separate per-window
 * detach is needed (a torn-down popout `document` silently accepts a stale
 * removeEventListener call).
 */
export function attachSccLinkClickHandling(
	owner: DomEventOwner,
	doc: Document,
	resolver: SccAnchorResolver,
	actions: SccClickActions,
): void {
	const onEvent = (evt: MouseEvent): void => {
		handleSccLinkEvent(evt, resolver, actions);
	};
	owner.registerDomEvent(doc, 'click', onEvent, { capture: true });
	owner.registerDomEvent(doc, 'auxclick', onEvent, { capture: true });
}

/** The one thing this module needs from Plugin beyond DomEventOwner: registerEvent, to
 *  hand the 'window-open' EventRef to the plugin's own auto-cleanup on unload. */
export interface SccClickPlugin extends DomEventOwner {
	registerEvent(ref: unknown): void;
}

/** A leaf's container, narrowed to just the `.doc` field WorkspaceWindow carries — the
 *  main window's root split is a WorkspaceContainer without `.doc`; only WorkspaceWindow
 *  (a popout) has one, which is exactly the distinction this module needs. */
export interface SccClickLeafContainer {
	doc?: Document;
}
export interface SccClickLeaf {
	getContainer(): SccClickLeafContainer;
}

/** The one slice of Workspace this module needs to reach every open window (main +
 *  popouts) and stay attached to freshly-opened ones — a structural seam (see
 *  DomEventOwner's doc) so registerSccLinkClickHandling is unit-testable without the full
 *  obsidian mock. The real Workspace satisfies this shape as-is. */
export interface SccClickWorkspace {
	readonly containerEl: HTMLElement;
	on(name: 'window-open', callback: (win: WorkspaceWindow, window: Window) => unknown): unknown;
	iterateAllLeaves(callback: (leaf: SccClickLeaf) => unknown): void;
}

/**
 * Top-level wiring (SC-135 phase 1 §2): attaches click handling to the main window's
 * document, every popout already open (covers a plugin reload while a popout is open —
 * without this, that popout's links would stay broken until the user closed and reopened
 * it), and every popout opened from here on (`workspace.on('window-open')` — each popout
 * window has its own `document`, this repo's eslint-plugin-obsidianmd config lints for
 * exactly this popout-safety class of bug).
 */
export function registerSccLinkClickHandling(
	plugin: SccClickPlugin,
	workspace: SccClickWorkspace,
	resolver: SccAnchorResolver,
	actions: SccClickActions,
): void {
	const attached = new Set<Document>();
	const attach = (doc: Document | null | undefined): void => {
		if (!doc || attached.has(doc)) return;
		attached.add(doc);
		attachSccLinkClickHandling(plugin, doc, resolver, actions);
	};

	// Main window.
	attach(workspace.containerEl.ownerDocument);

	// Any popout already open (dev-reload edge case).
	workspace.iterateAllLeaves((leaf) => {
		attach(leaf.getContainer().doc);
	});

	// Every popout opened from here on.
	plugin.registerEvent(workspace.on('window-open', (win) => attach(win.doc)));
}

/**
 * Production wiring of SccClickActions over the real obsidian App — thin glue, not unit
 * tested (mirrors main.ts's un-unit-tested `sccPostProcessor` registration line); exercised
 * by the real-Obsidian verification instead. `sourcePath` for `openLinkText` is the active
 * file at click time — the standard choice for a raw document-level click delegator, which
 * (unlike a markdown-post-processor) has no `ctx.sourcePath` of its own. It only matters
 * for RELATIVE linktext resolution; `resolution.linkpath` here is always vault-absolute
 * (SccResolver's derivation/index both produce absolute paths), so sourcePath is inert in
 * the common case and only a fallback aid to Obsidian's own resolution.
 */
export function createSccClickActions(app: App): SccClickActions {
	return {
		openVault(linkpath, newLeaf) {
			const sourcePath = app.workspace.getActiveFile()?.path ?? '';
			void app.workspace.openLinkText(linkpath, sourcePath, newLeaf);
		},
		openWeb(url, win) {
			win.open(url, '_blank', 'noopener');
		},
		notifyUnresolved(code) {
			new Notice(`Draw Steel Elements: no compendium entry found for "${code}".`);
		},
	};
}
