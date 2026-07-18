// D8 Task 2 (spec §1.3/§1.7) — registerView + ribbon + commands + "send to sidebar"
// wiring. Wired into main.ts's onload (a minimal, compile-proving call — full
// command/ribbon polish + the real per-block "send to sidebar" context-menu action is
// Task 10).
import { TFile } from 'obsidian';
import type { Editor, MarkdownFileInfo, MarkdownView, Plugin } from 'obsidian';
import { DseSidebarView, VIEW_TYPE_DSE_SIDEBAR } from './DseSidebarView';
import type { DseSidebarServices } from './DseSidebarView';
import { ensureAnchor, findFirstFence } from './anchor';

/** A fence-marker line: 3+ backticks/tildes then the info string. Deliberately a small
 *  standalone copy (not shared with src/authoring/fenceScan.ts's identical scanner) —
 *  framework/ stays dependency-free of authoring/ (mirrors the F1 §2.5 "framework is the
 *  dependency-free keystone" principle the OD-8 lint enforces one-directionally against
 *  src/elements/; this keeps it true in spirit for src/authoring/ too). */
const FENCE_LINE = /^([`~]{3,})(.*)$/;

/** Top-down scan (fences don't nest — same rationale as anchor.ts's scanner): the alias
 *  of whichever fence is open at `line`, or null if `line` isn't inside one. */
function aliasAtLine(editor: Editor, line: number): string | null {
	let alias: string | null = null;
	let fenceChar = '';
	let fenceLen = 0;
	for (let i = 0; i < line; i++) {
		const match = editor.getLine(i).match(FENCE_LINE);
		if (!match) continue;
		if (alias === null) {
			fenceChar = match[1][0];
			fenceLen = match[1].length;
			alias = match[2].trim();
		} else if (match[1][0] === fenceChar && match[1].length >= fenceLen && match[2].trim() === '') {
			alias = null;
		}
	}
	return alias;
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

	// MVP "send to sidebar": cursor must sit inside a ds-* fence; binds the FIRST block of
	// that alias in the note (multi-instance-per-note disambiguation — which ds-counter,
	// if there are three — is deferred to the real per-block action, Task 10, which has a
	// live BlockHost in hand and doesn't need to guess; see findFirstFence's doc).
	plugin.addCommand({
		id: 'send-block-to-sidebar',
		name: 'Send block to sidebar',
		editorCheckCallback: (checking: boolean, editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
			const file = ctx.file;
			const alias = aliasAtLine(editor, editor.getCursor().line);
			if (!file || !alias) return false;
			if (!checking) void sendToSidebar(services, file.path, alias);
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
 */
export async function sendToSidebar(services: DseSidebarServices, filePath: string, alias: string): Promise<void> {
	const file = services.app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) return;

	let anchorId: string | null = null;
	await services.app.vault.process(file, (content) => {
		const info = findFirstFence(content, alias);
		if (!info) return content; // no such block in this note — no-op, nothing to bind

		const lines = content.split('\n');
		const body = lines.slice(info.lineStart + 1, info.lineEnd).join('\n');
		const { body: anchoredBody, id } = ensureAnchor(body);
		anchorId = id;
		if (anchoredBody === body) return content; // already anchored — no write needed

		lines.splice(info.lineStart + 1, info.lineEnd - info.lineStart - 1, ...anchoredBody.split('\n'));
		return lines.join('\n');
	});
	if (anchorId === null) return; // no matching block found

	const view = await openSidebarView(services);
	view?.addPanel({ filePath, alias, anchorId });
}
