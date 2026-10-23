// D8 Task 2 (spec §1.3/§1.7) — registerView + ribbon + commands + "send to sidebar"
// wiring. Wired into main.ts's onload (a minimal, compile-proving call — full
// command/ribbon polish + the real per-block "send to sidebar" context-menu action is
// Task 10).
import { Notice, TFile } from 'obsidian';
import type { App, Editor, MarkdownFileInfo, MarkdownView, Plugin } from 'obsidian';
import { DseSidebarView, VIEW_TYPE_DSE_SIDEBAR, isUnderDeletedPath, renamedPanelPath } from './DseSidebarView';
import type { DseSidebarServices, DseSidebarState, SidebarPanelState } from './DseSidebarView';
import { stripBlockPrefix } from '../host/blockPrefix';
import { blockBodyLines, replaceFenceBody } from '../host/fenceLine';
import { splitLines } from '../host/lineEnding';
import { ensureAnchor, fenceAlias, findFenceAtLine, listFences, matchFenceLine, isFenceClose } from './anchor';

/** Top-down scan (fences don't nest — same rationale as anchor.ts's scanner, whose exact
 *  `matchFenceLine`/`isFenceClose` primitives this reuses rather than re-testing "is this
 *  a fence marker" a second way): the alias of whichever fence is open at `line`, or null
 *  if `line` isn't inside one. Deliberately its own traversal (not a call into anchor.ts's
 *  `iterateFences`/`findFenceAtLine`): those only recognize a fence once it has a matching
 *  CLOSE, whereas a command's `editorCheckCallback` must also recognize a fence the user is
 *  still typing (cursor inside an opened-but-not-yet-closed block) — a live Editor has no
 *  "rest of the note" to look ahead into for a close that may not exist yet.
 *
 *  SC-184 fix round (MEDIUM-2b): the alias is `fenceAlias(match.rest)` — the first
 *  whitespace-delimited token only, same as `iterateFences` — not the full trimmed rest.
 *  Before this, a fence carrying extra info-string content (e.g. ```` ```ds-counter extra
 *  ````) derived a different "alias" here than the chrome pin item's
 *  `getBlockInfo().language` did, so the two entry points disagreed about the identity of
 *  the exact same block.
 *
 *  SC-455: a fence may sit inside a blockquote / callout (`> ```ds-counter`); it is then only
 *  closed by a line in the same quote, and a line that has left the quote ends the open fence. */
function aliasAtLine(editor: Editor, line: number): string | null {
	let open: { fenceChar: string; fenceLen: number; alias: string; prefix: string } | null = null;
	for (let i = 0; i < line; i++) {
		const text = editor.getLine(i);
		if (open !== null && stripBlockPrefix(text, open.prefix) === null) open = null; // the quote ended, unclosed
		if (open === null) {
			const match = matchFenceLine(text);
			if (match) open = { fenceChar: match.marker[0], fenceLen: match.marker.length, alias: fenceAlias(match.rest), prefix: match.prefix };
		} else if (isFenceClose(open, text)) {
			open = null;
		}
	}
	return open?.alias ?? null;
}

/**
 * SC-184 — the most recently registered production sidebar services bundle, so the
 * chrome menu's "Pin to sidebar" item (pipeline.ts) can reach `sendToSidebar` without the
 * pipeline itself importing/knowing anything about DseSidebarView. Mirrors the encounter
 * builder's own late-bound hand-off (`setEncounterSidebarHandoff`,
 * elements/encounter/view.ts) for the same reason: the pipeline is constructed (and
 * exercised — every visual-harness/test build) long before `registerDseSidebar` ever runs,
 * often without it running at all. Set by `registerDseSidebar` below, cleared by
 * `unregisterDseSidebar` (main.ts onunload) so a stale plugin instance can never fire a
 * pin request against a torn-down bundle.
 */
let dseSidebarPinTarget: DseSidebarServices | null = null;

/** Registers the view type, a ribbon icon, and the "Open Draw Steel sidebar" /
 *  "Send block to sidebar" commands. Call once, after the framework bundle (registry +
 *  pipeline) is constructed (main.ts onload). */
export function registerDseSidebar(plugin: Plugin, services: DseSidebarServices): void {
	dseSidebarPinTarget = services;
	plugin.registerView(VIEW_TYPE_DSE_SIDEBAR, (leaf) => new DseSidebarView(leaf, services));

	// SC-282 r2 (MEDIUM-1 fold) — DseSidebarView.registerVaultListeners only covers a
	// LOADED leaf's own panels; a deferred sidebar leaf (background/collapsed tab — the
	// common case at startup, since Obsidian defers every non-selected/non-visible
	// sidebar tab) has no DseSidebarView instance for a Component-scoped listener to run
	// on. This plugin-scoped pair (D3's literal `plugin.registerEvent(app.vault.on(...))`
	// shape) covers exactly that gap, so every sidebar leaf — loaded or deferred — follows
	// a rename/delete, not just the ones currently visible.
	plugin.registerEvent(
		services.app.vault.on('rename', (file, oldPath) =>
			patchDeferredSidebarLeaves(services.app, (panel) => {
				const newPath = renamedPanelPath(panel.filePath, file, oldPath);
				return newPath === null ? panel : { ...panel, filePath: newPath };
			}),
		),
	);
	plugin.registerEvent(
		services.app.vault.on('delete', (file) =>
			patchDeferredSidebarLeaves(services.app, (panel) => (isUnderDeletedPath(panel.filePath, file) ? null : panel)),
		),
	);

	plugin.addRibbonIcon('swords', 'Open Draw Steel sidebar', () => {
		void openSidebarView(services);
	});

	plugin.addCommand({
		id: 'open-dse-sidebar',
		name: 'Open Draw Steel sidebar',
		callback: () => {
			void openSidebarView(services);
		},
	});

	// MVP "send to sidebar": cursor must sit inside a ds-* fence; binds the occurrence at
	// (or nearest) the cursor when the note has more than one block of that alias, falling
	// back to the first with a Notice when the cursor's own block can't be pinpointed (spec
	// §1.7 / review finding #3 — the real per-block context-menu action with a live
	// BlockHost in hand is Task 10).
	plugin.addCommand({
		id: 'send-block-to-sidebar',
		name: 'Send block to sidebar',
		editorCheckCallback: (checking: boolean, editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
			const file = ctx.file;
			const cursorLine = editor.getCursor().line;
			const alias = aliasAtLine(editor, cursorLine);
			if (!file || !alias) return false;
			if (!checking) void sendToSidebar(services, file.path, alias, cursorLine);
			return true;
		},
	});
}

/**
 * SC-282 r2 (MEDIUM-1) — rewrites (or drops) each panel a deferred sidebar leaf's
 * persisted state carries, using `rewrite`, and requests a layout save if anything
 * actually changed. `rewrite` returning the SAME object (by reference) means "no change
 * for this panel" — `renamedPanelPath`/`isUnderDeletedPath` above are already written to
 * make that cheap for callers (returning the input `panel` unchanged, or a brand new
 * object only on a real match).
 *
 * Deliberately skips any leaf whose `view` IS a loaded `DseSidebarView`: that one already
 * has its own `registerVaultListeners`-registered listener handling it, and re-patching
 * its state here (bypassing the view's own in-memory `panels[]`/mounted hosts) would
 * desync the view's live state from what this just wrote to its `getState()`.
 *
 * Why this is safe against a deferred leaf's `View` (real Obsidian's `DeferredView`,
 * private/undocumented as a TYPE but not as a CONTRACT): `View.getState()`/`setState()`
 * are PUBLIC obsidian.d.ts API, and real Obsidian 1.14.2's `DeferredView.setState` is
 * verified (SC-282 r1 review, RN-4, a real-Obsidian scratch harness — see the ledger) to
 * ONLY store the passed state; it does not load the real view or touch anything else.
 * That is exactly the "rewrite state without force-loading" operation the SC-282 brief
 * asked for and round 1 wrongly concluded didn't exist.
 */
function patchDeferredSidebarLeaves(app: App, rewrite: (panel: SidebarPanelState) => SidebarPanelState | null): void {
	let anyChanged = false;
	for (const leaf of app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)) {
		if (leaf.view instanceof DseSidebarView) continue; // loaded: its own listener handles it
		const state = (leaf.view.getState() ?? {}) as Partial<DseSidebarState>;
		const before = state.panels ?? [];
		const after: SidebarPanelState[] = [];
		let leafChanged = false;
		for (const panel of before) {
			const next = rewrite(panel);
			if (next === null) {
				leafChanged = true; // dropped (delete)
				continue;
			}
			if (next !== panel) leafChanged = true; // rewritten (rename)
			after.push(next);
		}
		if (!leafChanged) continue;
		void leaf.view.setState({ ...state, panels: after }, { history: false });
		anyChanged = true;
	}
	if (anyChanged) app.workspace.requestSaveLayout();
}

/** Finds (or opens) the sidebar leaf and brings it to the foreground. Shared by the
 *  "Open Draw Steel sidebar" command and sendToSidebar below. */
async function openSidebarView(services: DseSidebarServices): Promise<DseSidebarView | null> {
	const existing = services.app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0];
	const leaf = existing ?? services.app.workspace.getRightLeaf(false);
	if (!leaf) return null; // no room for a right-sidebar leaf (spec: never throws)

	if (!existing) await leaf.setViewState({ type: VIEW_TYPE_DSE_SIDEBAR, active: true });
	await services.app.workspace.revealLeaf(leaf);
	return leaf.view instanceof DseSidebarView ? leaf.view : null;
}

/**
 * The shared "bind a block to the sidebar" entry point (spec §1.7 — D7's hero sheet and
 * D8's other trackers reuse this). Ensures the target block carries a `_dse_anchor`
 * (stamping one via an atomic Vault.process splice if it doesn't already), then opens/
 * reveals the sidebar and adds a panel for it.
 *
 * `cursorLine` (optional — callers with no live cursor, e.g. a future non-editor caller,
 * simply omit it) picks WHICH block gets bound when the note has more than one `alias`
 * fence: the one containing the cursor, when there is one. Falls back to the first
 * occurrence in the note — and, only when that fallback was actually ambiguous (more than
 * one candidate existed), surfaces a `Notice` naming the chosen block so the user isn't
 * left guessing which one just got wired up silently (review finding #3).
 *
 * Returns whether a block was actually bound (SC-184 fix round, MEDIUM-2a). Every existing
 * caller (the generic command, the initiative command, the encounter builder's hand-off)
 * already just fire-and-forgets or awaits this without inspecting a return value, so this
 * is additive; `requestPinToSidebar` below is the first caller that reads it, to turn a
 * "found nothing" outcome into an audible `Notice` instead of the silent no-op every other
 * entry point still gets today.
 */
export async function sendToSidebar(
	services: DseSidebarServices,
	filePath: string,
	alias: string,
	cursorLine?: number,
): Promise<boolean> {
	const result = await bindBlockToSidebar(services, filePath, alias, cursorLine);
	if (result === 'unreadable-anchor') new Notice(UNREADABLE_ANCHOR_NOTICE);
	else if (result === 'unregistered') new Notice(unregisteredNotice(alias));
	return result === 'bound';
}

/** SC-360 (r2 review LOW-1) - shown when the block already has an `_dse_anchor` key YAML can see but the
 *  sidebar cannot read, so pinning it would have appended a second key and killed the block. */
const UNREADABLE_ANCHOR_NOTICE =
	'Draw Steel Elements: this block already has an `_dse_anchor` line the sidebar cannot read, so it was not sent to the sidebar. Put it on one line as `_dse_anchor: value` (no comment or tag), or delete it, then send the block again.';

/** SC-487 - the alias as the Notice prints it: anything but printable ASCII (an invisible zero-width character, a
 *  no-break space, a non-ASCII letter) shows as `<U+XXXX>`, so the text never reads as a type that looks registered. */
const visibleAlias = (alias: string): string =>
	Array.from(alias, (ch) => (/[\x21-\x7e]/.test(ch) ? ch : `<U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}>`)).join('');

/** SC-487 - shown when the block's type is not one the sidebar can mount; nothing was written to the note. */
const unregisteredNotice = (alias: string): string =>
	`Draw Steel Elements: this block's type ("${visibleAlias(alias)}") is not one the sidebar can show, so it was not sent to the sidebar and the note was not changed.`;

/** SC-487 - can the sidebar mount a block fenced as `alias`? An element registered under that ALIAS - `registry.get`
 *  also matches element ids (`statblock`, `encounter`, `counter`), which no code-block processor is registered for. */
function isMountableAlias(services: DseSidebarServices, alias: string): boolean {
	const def = services.registry.get(alias);
	return def !== undefined && def.aliases.includes(alias);
}

type BindResult = 'bound' | 'not-found' | 'unreadable-anchor' | 'unregistered';

/** `sendToSidebar`'s body, reporting WHY nothing was bound so each caller can say the right thing
 *  (`requestPinToSidebar` must not answer an unreadable anchor with "couldn't find that block"). */
async function bindBlockToSidebar(
	services: DseSidebarServices,
	filePath: string,
	alias: string,
	cursorLine?: number,
): Promise<BindResult> {
	// SC-487: BEFORE any vault write - a stamp for a type the sidebar cannot mount only leaves a dead `_dse_anchor` line
	// in the note and an "unavailable" panel. Every entry point that stamps goes through here, so all refuse alike.
	if (!isMountableAlias(services, alias)) return 'unregistered';
	const file = services.app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) return 'not-found';

	// SC-158 — does this element's body tolerate a stamped line at all? A YAML-bodied
	// element carries `_dse_anchor` as an unknown key and never notices; `ds-scc`'s body is
	// one SCC code, and the stamp turned every pinned block into the element's own refusal
	// card, permanently. For a `strictBody` element the note is left BYTE-IDENTICAL and the
	// block is addressed by its body instead (SidebarBlockHost.findUnanchoredBlock).
	const strictBody = services.registry.get(alias)?.strictBody === true;

	let anchorId: string | null = null;
	let boundBody: string | null = null;
	let bound = false;
	let unreadableAnchor = false;
	let noticeLine: number | null = null;
	await services.app.vault.process(file, (content) => {
		const fences = listFences(content, alias);
		if (fences.length === 0) return content; // no such block in this note — no-op, nothing to bind

		const atCursor = cursorLine === undefined ? null : findFenceAtLine(content, alias, cursorLine);
		const info = atCursor ?? fences[0];
		if (!atCursor && fences.length > 1) noticeLine = info.lineStart + 1; // 1-based, for the user

		// SC-453: the body is LF-joined whatever the note's line ending (a CRLF note's `\r`
		// terminators dropped), so the strict-body identity below and ensureAnchor see the same
		// text as an LF note; the stamped lines get the note's own ending back when spliced in.
		// SC-455: and prefix-free — a block inside a callout is read, and re-stamped, without its `> `.
		const body = blockBodyLines(splitLines(content), info.lineStart, info.lineEnd).join('\n');
		bound = true;
		if (strictBody) {
			boundBody = body;
			return content; // never written — that is the whole point
		}

		const { body: anchoredBody, id } = ensureAnchor(body);
		if (id === null) {
			bound = false;
			unreadableAnchor = true;
			return content; // SC-360: never write; the caller tells the user
		}
		anchorId = id;
		if (anchoredBody === body) return content; // already anchored — no write needed

		return replaceFenceBody(content, info.lineStart, info.lineEnd, anchoredBody) ?? content;
	});
	if (unreadableAnchor) return 'unreadable-anchor';
	if (!bound) return 'not-found'; // no matching block found

	if (noticeLine !== null) {
		// `noticeLine` is only ever assigned inside the `vault.process(file, (content)
		// => {...})` callback above, which the preceding `await` guarantees has already
		// run synchronously by this point (Vault.process invokes its callback before
		// resolving) -- but TS's control-flow narrowing doesn't model that a value
		// mutated inside a passed-in closure has "already happened" by the time control
		// returns here, so it infers `noticeLine`'s type in this branch as `never`
		// (its ONLY value it can see pre-closure, `null`, minus the `!== null` guard)
		// rather than `number`. The runtime guard just above is what actually makes
		// this safe; the cast below only corrects the type the checker can't derive.
		const line = noticeLine as number;
		new Notice(
			`Draw Steel Elements: multiple "${alias}" blocks in this note — sent the one starting at line ${line}.`,
		);
	}

	const view = await openSidebarView(services);
	// Exactly one of the two identities is ever set: an id (stamped in the body) or the
	// body itself (strict-body elements, never stamped).
	view?.addPanel({ filePath, alias, anchorId, body: boundBody ?? undefined });
	return 'bound';
}

/** SC-184 — plugin onunload cleanup, mirroring `setEncounterSidebarHandoff(null)`: drops
 *  the reference to THIS instance's services so a stale plugin instance (reload/disable/
 *  re-enable) can never fire a pin request against a torn-down bundle. */
export function unregisterDseSidebar(): void {
	dseSidebarPinTarget = null;
}

/**
 * SC-184 (item 2) — the element chrome menu's "Pin to sidebar" action (pipeline.ts).
 * A thin wrapper over `sendToSidebar` that degrades to a `Notice` instead of a silent
 * no-op when no plugin instance has registered a sidebar yet — the same shape as the
 * encounter builder's own hand-off degrade (`encounter/view.ts`'s
 * `handleOpenInSidebar`), for the same reason: a harness/test pipeline build, or a
 * render that somehow races plugin onload, must never throw from inside a chrome
 * button's click handler.
 *
 * SC-184 fix round (MEDIUM-2a) — `sendToSidebar` resolving `false` (nothing bound: the
 * fence the click's own `getBlockInfo()` snapshot pointed at can no longer be found when
 * `vault.process` actually re-reads the note) used to reach here and simply do nothing —
 * no Notice, no leaf, no panel, and no way for the user to tell the click even registered.
 * This is the one caller that reads the return value: every other entry point
 * (`send-block-to-sidebar`, the initiative command, the encounter builder's hand-off) keeps
 * its existing silent-no-op-on-not-found behavior unchanged.
 */
export async function requestPinToSidebar(filePath: string, alias: string, cursorLine?: number): Promise<void> {
	if (!dseSidebarPinTarget) {
		new Notice(
			'Draw Steel Elements: sidebar not available in this build — try "send block to sidebar" from the command palette.',
		);
		return;
	}
	try {
		const result = await bindBlockToSidebar(dseSidebarPinTarget, filePath, alias, cursorLine);
		if (result === 'unreadable-anchor') {
			new Notice(UNREADABLE_ANCHOR_NOTICE);
		} else if (result === 'unregistered') {
			new Notice(unregisteredNotice(alias));
		} else if (result !== 'bound') {
			new Notice(`Draw Steel Elements: couldn't find that block in ${filePath}.`);
		}
	} catch (error) {
		new Notice(
			`Draw Steel Elements: pin to sidebar failed — ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
