// D8 Task 2 (spec §1.3/§1.7) — registerView + ribbon + commands + "send to sidebar"
// wiring. Wired into main.ts's onload (a minimal, compile-proving call — full
// command/ribbon polish + the real per-block "send to sidebar" context-menu action is
// Task 10).
import { Notice, TFile } from 'obsidian';
import type { Editor, MarkdownFileInfo, MarkdownView, Plugin } from 'obsidian';
import { DseSidebarView, VIEW_TYPE_DSE_SIDEBAR } from './DseSidebarView';
import type { DseSidebarServices } from './DseSidebarView';
import { ensureAnchor, findFenceAtLine, listFences, matchFenceLine, isFenceClose } from './anchor';

/** Top-down scan (fences don't nest — same rationale as anchor.ts's scanner, whose exact
 *  `matchFenceLine`/`isFenceClose` primitives this reuses rather than re-testing "is this
 *  a fence marker" a second way): the alias of whichever fence is open at `line`, or null
 *  if `line` isn't inside one. Deliberately its own traversal (not a call into anchor.ts's
 *  `iterateFences`/`findFenceAtLine`): those only recognize a fence once it has a matching
 *  CLOSE, whereas a command's `editorCheckCallback` must also recognize a fence the user is
 *  still typing (cursor inside an opened-but-not-yet-closed block) — a live Editor has no
 *  "rest of the note" to look ahead into for a close that may not exist yet. */
function aliasAtLine(editor: Editor, line: number): string | null {
	let open: { fenceChar: string; fenceLen: number; alias: string } | null = null;
	for (let i = 0; i < line; i++) {
		const match = matchFenceLine(editor.getLine(i));
		if (!match) continue;
		if (open === null) {
			open = { fenceChar: match.marker[0], fenceLen: match.marker.length, alias: match.rest };
		} else if (isFenceClose(open, editor.getLine(i))) {
			open = null;
		}
	}
	return open?.alias ?? null;
}

/** Registers the view type, a ribbon icon, and the "Open Draw Steel sidebar" /
 *  "Send block to sidebar" commands. Call once, after the framework bundle (registry +
 *  pipeline) is constructed (main.ts onload). */
export function registerDseSidebar(plugin: Plugin, services: DseSidebarServices): void {
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
 */
export async function sendToSidebar(
	services: DseSidebarServices,
	filePath: string,
	alias: string,
	cursorLine?: number,
): Promise<void> {
	const file = services.app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) return;

	let anchorId: string | null = null;
	let noticeLine: number | null = null;
	await services.app.vault.process(file, (content) => {
		const fences = listFences(content, alias);
		if (fences.length === 0) return content; // no such block in this note — no-op, nothing to bind

		const atCursor = cursorLine === undefined ? null : findFenceAtLine(content, alias, cursorLine);
		const info = atCursor ?? fences[0];
		if (!atCursor && fences.length > 1) noticeLine = info.lineStart + 1; // 1-based, for the user

		const lines = content.split('\n');
		const body = lines.slice(info.lineStart + 1, info.lineEnd).join('\n');
		const { body: anchoredBody, id } = ensureAnchor(body);
		anchorId = id;
		if (anchoredBody === body) return content; // already anchored — no write needed

		lines.splice(info.lineStart + 1, info.lineEnd - info.lineStart - 1, ...anchoredBody.split('\n'));
		return lines.join('\n');
	});
	if (anchorId === null) return; // no matching block found

	if (noticeLine !== null) {
		new Notice(
			`Draw Steel Elements: multiple "${alias}" blocks in this note — sent the one starting at line ${noticeLine}.`,
		);
	}

	const view = await openSidebarView(services);
	view?.addPanel({ filePath, alias, anchorId });
}
