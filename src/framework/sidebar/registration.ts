// D8 Task 2 (spec §1.3/§1.7) — registerView + ribbon + commands + "send to sidebar"
// wiring. Wired into main.ts's onload (a minimal, compile-proving call — full
// command/ribbon polish + the real per-block "send to sidebar" context-menu action is
// Task 10).
import { Notice, TFile } from 'obsidian';
import type { Editor, MarkdownFileInfo, MarkdownView, Plugin } from 'obsidian';
import { DseSidebarView, VIEW_TYPE_DSE_SIDEBAR } from './DseSidebarView';
import type { DseSidebarServices } from './DseSidebarView';
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
 *  the exact same block. */
function aliasAtLine(editor: Editor, line: number): string | null {
	let open: { fenceChar: string; fenceLen: number; alias: string } | null = null;
	for (let i = 0; i < line; i++) {
		const match = matchFenceLine(editor.getLine(i));
		if (!match) continue;
		if (open === null) {
			open = { fenceChar: match.marker[0], fenceLen: match.marker.length, alias: fenceAlias(match.rest) };
		} else if (isFenceClose(open, editor.getLine(i))) {
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
	const file = services.app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) return false;

	// SC-158 — does this element's body tolerate a stamped line at all? A YAML-bodied
	// element carries `_dse_anchor` as an unknown key and never notices; `ds-scc`'s body is
	// one SCC code, and the stamp turned every pinned block into the element's own refusal
	// card, permanently. For a `strictBody` element the note is left BYTE-IDENTICAL and the
	// block is addressed by its body instead (SidebarBlockHost.findUnanchoredBlock).
	const strictBody = services.registry.get(alias)?.strictBody === true;

	let anchorId: string | null = null;
	let boundBody: string | null = null;
	let bound = false;
	let noticeLine: number | null = null;
	await services.app.vault.process(file, (content) => {
		const fences = listFences(content, alias);
		if (fences.length === 0) return content; // no such block in this note — no-op, nothing to bind

		const atCursor = cursorLine === undefined ? null : findFenceAtLine(content, alias, cursorLine);
		const info = atCursor ?? fences[0];
		if (!atCursor && fences.length > 1) noticeLine = info.lineStart + 1; // 1-based, for the user

		const lines = content.split('\n');
		const body = lines.slice(info.lineStart + 1, info.lineEnd).join('\n');
		bound = true;
		if (strictBody) {
			boundBody = body;
			return content; // never written — that is the whole point
		}

		const { body: anchoredBody, id } = ensureAnchor(body);
		anchorId = id;
		if (anchoredBody === body) return content; // already anchored — no write needed

		lines.splice(info.lineStart + 1, info.lineEnd - info.lineStart - 1, ...anchoredBody.split('\n'));
		return lines.join('\n');
	});
	if (!bound) return false; // no matching block found

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
	return true;
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
		const bound = await sendToSidebar(dseSidebarPinTarget, filePath, alias, cursorLine);
		if (!bound) {
			new Notice(`Draw Steel Elements: couldn't find that block in ${filePath}.`);
		}
	} catch (error) {
		new Notice(
			`Draw Steel Elements: pin to sidebar failed — ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
