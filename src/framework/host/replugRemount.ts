// SC-545 - redraw the DSE cards Obsidian leaves in Live Preview callout and embed widgets across a plugin off/on.
//
// Turning the plugin off and on makes Obsidian fire `post-processor-change`. Reading views re-render and Live Preview rebuilds its
// CODE-BLOCK widgets (new processor calls, new cards), but a Live Preview CALLOUT or EMBED widget is reused while its text is
// unchanged and keeps its cached DOM: no processor runs for it. The card in it belongs to the old instance, whose view was unloaded
// (its `registerDomEvent` listeners are gone) and which no live ViewRegistry owns, so a click on it does nothing.
//
// Fix (option "AB" of the SC-545 diagnosis):
//  A. (normal path) The unloading instance leaves each such card's widget context on its element (`stashForReplug`, called from
//     `ViewRegistry.onunload`). The new instance draws a fresh card there once the layout is ready (`ReplugRemounter.run`).
//     A card CodeMirror had taken out of the page at the toggle (its widget keeps its cached DOM, detached, about a screen or more away
//     from the visible part of the note) is stashed too and drawn when the editor puts that DOM back, from the editor's own update
//     (`remountReattached`, called by the listener in livePreviewReconcile.ts).
//  B. (fallback, rare) A view that STILL holds a raw DSE fence or a DSE card nobody owns in such a widget after A settled is
//     rebuilt through `setViewData` (`ReplugRemounter.rebuildUndrawn`): a write that was pending at disable (the note changed, so
//     Obsidian built the callout while the plugin was off and drew the fence as code), a note opened while the plugin was off, or the
//     first update from a build that never stashed. B costs the note's undo history and re-renders the whole note, so a normal
//     off/on must never reach it. B looks only at what is in the page: a card that was off the page during the one-time update from a
//     build that never stashed is not seen, and stays dead until the note is reopened.
import type { App, MarkdownPostProcessorContext, MarkdownView } from 'obsidian';
import type { ViewRegistryEntry } from './viewRegistry';

/**
 * THE CROSS-VERSION CONTRACT. The stash is written by one build (the one being unloaded) and read by another (the one being loaded -
 * after a plugin UPDATE they are different builds). So:
 *  - The key carries the version. A build that changes the shape writes a NEW key (`...V2`) and may keep reading this one; a reader
 *    only ever trusts the key it knows.
 *  - It holds only Obsidian-owned objects and plain data: the widget's own `MarkdownPostProcessorContext` (Obsidian made it), the
 *    fence label and the block body (strings). NEVER a reference to an object or closure of the instance that wrote it - the writer
 *    is torn down, and a reader must not call into it.
 *  - The reader validates the shape (`readReplugStash`). A stash it cannot read is dropped and the element is left as it is: the
 *    card is then unowned and the fallback (B) rebuilds the view.
 */
export const REPLUG_KEY = '__dseReplugV1';
/** Marks an element that carries a stash, so one query finds them all. The value is the version too. */
export const REPLUG_ATTR = 'data-dse-replug';
const REPLUG_VERSION = 1;

/** What the unloading instance hands to the next one (see the contract at `REPLUG_KEY`). */
export interface ReplugStash {
	v: 1;
	ctx: MarkdownPostProcessorContext;
	alias: string;
	body: string;
}

type Stashable = HTMLElement & { [REPLUG_KEY]?: unknown };

/**
 * True for a root inside a Live Preview widget that Obsidian does not redraw on `post-processor-change`. A root CodeMirror has taken
 * out of the page sits in a detached widget subtree that has no `.markdown-source-view` above it: there the widget classes alone decide
 * (a Reading view embed that is detached is stashed too, which is harmless: nothing reads that mark unless the element is put back).
 */
function inStickyWidget(root: HTMLElement): boolean {
	if (root.isConnected && !root.closest('.markdown-source-view')) return false;
	return !!(root.closest('.cm-embed-block.cm-callout') || root.closest('.internal-embed'));
}

function writeStash(el: HTMLElement, stash: ReplugStash): void {
	(el as Stashable)[REPLUG_KEY] = stash;
	el.setAttribute(REPLUG_ATTR, String(REPLUG_VERSION));
}

function clearStash(el: HTMLElement): void {
	delete (el as Stashable)[REPLUG_KEY];
	el.removeAttribute(REPLUG_ATTR);
}

/** The stash on `el`, or null when it is missing or does not have the shape this build writes (a wrong version, a half-written one, anything else). */
export function readReplugStash(el: HTMLElement): ReplugStash | null {
	const raw = (el as Stashable)[REPLUG_KEY];
	if (!raw || typeof raw !== 'object') return null;
	const s = raw as Partial<ReplugStash>;
	if (s.v !== REPLUG_VERSION) return null;
	if (typeof s.alias !== 'string' || s.alias === '' || typeof s.body !== 'string') return null;
	const ctx = s.ctx as Partial<MarkdownPostProcessorContext> | undefined;
	if (!ctx || typeof ctx !== 'object') return null;
	if (typeof ctx.sourcePath !== 'string' || typeof ctx.addChild !== 'function' || typeof ctx.getSectionInfo !== 'function') return null;
	return s as ReplugStash;
}

/**
 * At unload (`ViewRegistry.onunload`, after every view has unloaded and flushed its pending write): mark each live card that sits in
 * such a widget (in the page, or in a widget CodeMirror has taken out of it) with the context a fresh card needs. Returns how many were marked. Never throws - an unload must finish.
 */
export function stashForReplug(entries: Iterable<ViewRegistryEntry>): number {
	let n = 0;
	for (const entry of entries) {
		try {
			if (!inStickyWidget(entry.root)) continue;
			const body = entry.host.lastKnownBody;
			if (body === null) continue;
			const { el, ctx, alias } = entry.host.remountTarget();
			writeStash(el, { v: REPLUG_VERSION, ctx, alias, body });
			n++;
		} catch (error) {
			console.error('Draw Steel Elements: could not leave a card for the next load.', error);
		}
	}
	return n;
}

/**
 * Fallback detector: a Live Preview callout/embed widget in `view` that holds a DSE fence drawn as plain code (it was built while
 * the plugin was off) or a DSE card no live view owns (drawn by an instance that is gone, and not stashed).
 */
function hasUndrawnBlocks(view: MarkdownView, isDseAlias: (alias: string) => boolean, live: ReadonlySet<HTMLElement>): boolean {
	const src = view.containerEl.querySelector('.markdown-source-view');
	if (!src) return false;
	for (const w of Array.from(src.querySelectorAll('.cm-embed-block.cm-callout, .internal-embed'))) {
		for (const code of Array.from(w.querySelectorAll('pre > code'))) {
			const lang = Array.from(code.classList).find((k) => k.startsWith('language-'));
			if (lang && isDseAlias(lang.slice('language-'.length))) return true;
		}
		for (const r of Array.from(w.querySelectorAll<HTMLElement>('[data-dse-element]'))) {
			// Nested cards belong to their parent's view; the inert card of an unreleased element has no view by design.
			if (r.parentElement?.closest('[data-dse-element]') || r.getAttribute('data-dse-element') === 'deferred') continue;
			if (!live.has(r)) return true;
		}
	}
	return false;
}

/** Best effort: where the editor was scrolled, put back after the rebuild (Obsidian's own ephemeral scroll is line based and drifts). */
function scrollerOf(view: MarkdownView): HTMLElement | null {
	const cm = (view.editor as unknown as { cm?: { scrollDOM?: HTMLElement } } | undefined)?.cm;
	return cm?.scrollDOM ?? null;
}

/**
 * Rebuild `view` through public API: its own text, so nothing is lost, with the cursor and scroll Obsidian saves for it.
 * Cost: the undo history of the note, and every widget in it is drawn again.
 */
function rebuildView(view: MarkdownView): void {
	const scroller = scrollerOf(view);
	const top = scroller ? scroller.scrollTop : null;
	const state = view.getEphemeralState();
	view.setViewData(view.getViewData(), true);
	view.setEphemeralState(state);
	if (scroller && top !== null) {
		// The ephemeral scroll is a line, and heights are estimated again after a rebuild: put the pixel position back now and
		// again after the next two frames, which is when the editor has measured the new widgets.
		const restore = (): void => {
			if (Math.abs(scroller.scrollTop - top) > 0.5) scroller.scrollTop = top;
		};
		restore();
		const win = scroller.ownerDocument.defaultView;
		if (win) {
			win.requestAnimationFrame(() => {
				restore();
				win.requestAnimationFrame(restore);
			});
		}
	}
}

export interface ReplugDeps {
	/** Is `alias` a fence label of a registered element? (An unknown label is never drawn, so its element is left alone.) */
	hasAlias(alias: string): boolean;
	/** Draw a fresh view for `body` into the empty `el`. Never rejects. */
	mount(el: HTMLElement, ctx: MarkdownPostProcessorContext, alias: string, body: string): Promise<void>;
	/** The roots of the live registry's views: a card in none of them is unowned. */
	liveRoots(): Iterable<HTMLElement>;
}

export interface ReplugResult {
	/** Cards drawn from a stash. */
	remounted: number;
	/** Paths of the notes the fallback rebuilt. */
	rebuilt: string[];
}

/** The load side: draws the stashed cards, then runs the fallback. One per plugin instance; `dispose` at its unload. */
export class ReplugRemounter {
	private disposed = false;
	/** Elements emptied for a remount whose draw has not finished. */
	private readonly inFlight = new Map<HTMLElement, ReplugStash>();

	constructor(
		private readonly app: App,
		private readonly deps: ReplugDeps,
	) {}

	/** Layout is ready: A, then (once A has settled) B. Does nothing after `dispose`. */
	async run(): Promise<ReplugResult> {
		if (this.disposed) return { remounted: 0, rebuilt: [] };
		const remounted = await this.remountMarked();
		if (this.disposed) return { remounted, rebuilt: [] };
		return { remounted, rebuilt: this.rebuildUndrawn() };
	}

	/**
	 * This instance is unloading. A draw that is still running will finish into an element nobody owns; put its stash back so the
	 * next instance draws it again (the registry's own stash cannot see it: its view is not registered yet).
	 */
	dispose(): void {
		this.disposed = true;
		// Connected or not (as on the stash side): CodeMirror may have taken the widget off the page since; `remountWithin` skips a detached element.
		for (const [el, stash] of this.inFlight) writeStash(el, stash);
		this.inFlight.clear();
	}

	/**
	 * The editor put DOM back (a scroll, a text change, a selection move): draw the marked cards in it. A card that was off the page at
	 * the toggle is marked on its detached widget, which no query from the leaf can reach; CodeMirror attaches that DOM again when the
	 * block comes near the visible part of the note. Called from every editor update, so the common case (nothing marked) is one
	 * `querySelector` and no work.
	 */
	remountReattached(scope: ParentNode): void {
		if (this.disposed) return;
		if (scope.querySelector(`[${REPLUG_ATTR}]`) === null) return;
		this.remountWithin(scope).catch((error) => console.error('Draw Steel Elements: redrawing a card after it came back into view failed.', error));
	}

	private async remountMarked(): Promise<number> {
		const runs: Promise<number>[] = [];
		for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
			const root = leaf.view?.containerEl;
			if (root) runs.push(this.remountWithin(root));
		}
		return (await Promise.all(runs)).reduce((sum, n) => sum + n, 0);
	}

	/** Draw a fresh card into every marked element under `scope` that is in the document; one that throws is logged and left, the rest go on. */
	private async remountWithin(scope: ParentNode): Promise<number> {
		const jobs: Promise<void>[] = [];
		for (const el of Array.from(scope.querySelectorAll<HTMLElement>(`[${REPLUG_ATTR}]`))) {
			try {
				const stash = readReplugStash(el);
				clearStash(el);
				if (!stash || !el.isConnected || !this.deps.hasAlias(stash.alias)) continue;
				// The old card goes with its listeners (the click shield's are on its root).
				el.replaceChildren();
				this.inFlight.set(el, stash);
				jobs.push(this.deps.mount(el, stash.ctx, stash.alias, stash.body).finally(() => this.inFlight.delete(el)));
			} catch (error) {
				this.inFlight.delete(el);
				clearStash(el);
				console.error('Draw Steel Elements: could not redraw a card after the plugin was turned on.', error);
			}
		}
		await Promise.all(jobs);
		return jobs.length;
	}

	private rebuildUndrawn(): string[] {
		const rebuilt: string[] = [];
		const live = new Set(this.deps.liveRoots());
		for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
			const view = leaf.view as MarkdownView | undefined;
			if (!view || view.getViewType?.() !== 'markdown' || typeof view.setViewData !== 'function') continue;
			try {
				if (!hasUndrawnBlocks(view, (alias) => this.deps.hasAlias(alias), live)) continue;
				rebuildView(view);
				rebuilt.push(view.file?.path ?? '?');
			} catch (error) {
				console.error('Draw Steel Elements: redrawing a note after the plugin was turned on failed.', error);
			}
		}
		return rebuilt;
	}
}
