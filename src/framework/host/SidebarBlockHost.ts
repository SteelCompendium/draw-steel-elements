// D8 Task 2 (spec §1.4) — SidebarBlockHost: the third concrete BlockHost. Satisfies the
// exact F1 BlockHost interface (BlockHost.ts) but is backed by a *file + durable anchor*
// (anchor.ts) rather than a live MarkdownPostProcessorContext — the property that makes it
// a "running-session tool": it addresses `backingFile` directly by path, so a mounted panel
// keeps persisting correctly no matter which note is focused in the editor.
//
// Mechanically this mirrors ReadingModeBlockHost's replaceSource EXACTLY (atomic
// Vault.process; re-parse the fence run + language from the LIVE content at write time;
// splice exactly the located line range; preserve fence chars + alias) — see that file's
// header for the CB-3/CB-5 correctness rationale this inherits verbatim. The two
// differences: (1) block identity comes from findAnchoredBlock (anchor.ts), not
// ctx.getSectionInfo; (2) getBlockInfo()/canPersist need to be SYNCHRONOUS (F1 BlockHost
// contract) but the only way to know "is the anchored block still there" is to read the
// vault, which is async. Resolved the same way reading-mode gets its snapshot for free
// from Obsidian's own section-info cache: SidebarBlockHost keeps a private cachedContent
// string that mount-time priming (refresh(), called once by SidebarPanel right after
// construction — NOT part of the BlockHost interface) and the live vault.on("modify")
// listener below both keep fresh. getBlockInfo()/canPersist read that cache synchronously;
// nothing here ever awaits inside a BlockHost interface member.
//
// KNOWN GAP (flagged, not fixed by this task): a block's `_dse_anchor: <id>` line only
// round-trips through a persisted element's serialize() if that element's parse() passes
// unknown keys through untouched. None of the currently migrated persisted elements do
// (Counter.parse, e.g., builds a fixed-field class instance and drops anything else) — spec
// §1.5 calls this out ("persisted-element models add an optional passthrough field for
// it"), but wiring that through every persisted model's schema/model is out of this task's
// scope. Until that lands, the FIRST persist() through a real element view after "send to
// sidebar" WILL drop the anchor line. What this task DOES fix (review finding #1, HIGH): the
// safety net. replaceSource notices the resulting canPersist true->false flip immediately
// (the self-echo guard means the normal external-modify path would never catch it — see
// replaceSource's inline comment) and calls onAnchorLost, which SidebarPanel wires to the
// same read-only degrade card handleExternalChange's "block vanished" path already renders
// — so the failure is surfaced right away instead of every subsequent edit silently no-op'ing
// forever. Tracked for a FOLLOWUPS entry (the root fix: passthrough fields on the 4 migrated
// persisted models).
import type { Component, Plugin, TFile } from 'obsidian';
import type { BlockHost, BlockInfo, RenderMode } from './BlockHost';
import { findAnchoredBlock } from '../sidebar/anchor';

/** Matches a fence-open line, capturing the fence run and the language token — same shape
 *  as ReadingModeBlockHost's OPEN_FENCE (not exported there, so re-declared narrowly here
 *  rather than reaching into that module's internals). */
const OPEN_FENCE = /^([`~]{3,})(\S*)/;
/** Matches a fence-close line, capturing the fence run (mirrors ReadingModeBlockHost's
 *  CLOSE_FENCE — grabs whatever close-fence characters are actually there). */
const CLOSE_FENCE = /^([`~]{3,})/;

function parseOpenFence(line: string | undefined): { fence: string; language: string } | null {
	if (line == null) return null;
	const match = line.match(OPEN_FENCE);
	if (!match) return null;
	return { fence: match[1], language: match[2] };
}

function parseCloseFence(line: string | undefined): string | null {
	if (line == null) return null;
	const match = line.match(CLOSE_FENCE);
	return match ? match[1] : null;
}

/** Extracts the body text (lines strictly between the fences) at `info` from `content`. */
function extractBody(content: string, info: BlockInfo): string {
	return content.split('\n').slice(info.lineStart + 1, info.lineEnd).join('\n');
}

export class SidebarBlockHost implements BlockHost {
	readonly mode: RenderMode = 'sidebar';

	/** Last-known whole-note content, synchronously readable — see file header. Null
	 *  until the first refresh()/write; getBlockInfo()/canPersist treat null as
	 *  "unknown yet" (not addressable), same as "block not found". */
	private cachedContent: string | null = null;

	/** Self-echo guard (spec §1.6): the exact body this host itself last wrote. A
	 *  vault "modify" that reads back this same body is our own write echoing through
	 *  the vault event, not an external edit — suppressed so the sidebar doesn't loop. */
	private lastWritten: string | null = null;

	/** The Component pipeline.run() last handed to addChild (== the mounted
	 *  ElementView, since the pipeline calls addChild exactly once per render). Not part
	 *  of the BlockHost interface — SidebarPanel reads it to unload the previous view
	 *  before remounting on an external change, since pipeline.run() has no other way to
	 *  hand back what it mounted. */
	private mountedChild: Component | null = null;

	/** Guards registerModifyListener so it only ever runs once, even if refresh() were
	 *  ever called again — see that method's doc. */
	private listenerRegistered = false;

	constructor(
		private readonly plugin: Plugin,
		private readonly backingFile: TFile,
		private readonly alias: string,
		private readonly anchorId: string,
		readonly containerEl: HTMLElement,
		private readonly owner: Component,
		private readonly onExternalChange: (body: string) => void,
		private readonly onAnchorLost: () => void,
	) {
		// Deliberately does NOT register the vault listener here — see registerModifyListener,
		// called from refresh() instead (review finding #5, MEDIUM: a listener live before the
		// initial cachedContent priming read resolves can fire handleExternalModify -> the
		// panel's onExternalChange -> a full pipeline.run() remount BEFORE mount()'s own first
		// pipeline.run() has run, racing two mounts into the same panelEl).
	}

	get sourcePath(): string {
		return this.backingFile.path;
	}

	get canPersist(): boolean {
		return this.getBlockInfo() !== null;
	}

	addChild<T extends Component>(child: T): T {
		this.mountedChild = child;
		return this.owner.addChild(child);
	}

	getBlockInfo(): BlockInfo | null {
		if (this.cachedContent === null) return null;
		return findAnchoredBlock(this.cachedContent, this.alias, this.anchorId);
	}

	/** Not part of BlockHost — the sidebar's analogue of reading-mode's getSectionInfo
	 *  snapshot. Must be awaited once by the caller (SidebarPanel.mount) right after
	 *  construction, before canPersist/getBlockInfo/currentBody are relied on: the
	 *  constructor can't itself await a vault read, so this is the one explicit priming
	 *  step that seeds cachedContent for the first time. Also the point at which the vault
	 *  "modify" listener goes live (see registerModifyListener) — deliberately AFTER the
	 *  priming read resolves, not before (review finding #5). */
	async refresh(): Promise<void> {
		const content = await this.plugin.app.vault.cachedRead(this.backingFile);
		this.applyFreshContent(content, false);
		this.registerModifyListener();
	}

	/** Registers the live vault.on("modify") listener, scoped to `owner` (the SidebarPanel)
	 *  — cleanup must be scoped to THIS panel's lifecycle (torn down on removePanel), not the
	 *  whole plugin's unload; a plugin-scoped registration would leak one live listener per
	 *  note-modify per panel for as long as the plugin stays loaded, even after the panel
	 *  closes. Called once, from the end of refresh() (guard makes a second call a no-op):
	 *  registering only once the initial cachedContent priming read has resolved closes the
	 *  double-mount race a synchronous, constructor-time registration would otherwise open
	 *  (review finding #5, MEDIUM) — a genuine external modify landing in that window would
	 *  otherwise fire onExternalChange -> a full remount through the panel BEFORE mount()'s
	 *  own first pipeline.run() has even happened. */
	private registerModifyListener(): void {
		if (this.listenerRegistered) return;
		this.listenerRegistered = true;
		this.owner.registerEvent(
			this.plugin.app.vault.on('modify', (file) => {
				if (file.path !== this.backingFile.path) return;
				void this.handleExternalModify();
			}),
		);
	}

	/** Not part of BlockHost — extracts the anchored block's current body text (between
	 *  the fences) from the cached content, or null when not found/not primed yet. Lets
	 *  SidebarPanel get the initial render body without a second vault read. */
	currentBody(): string | null {
		if (this.cachedContent === null) return null;
		const info = findAnchoredBlock(this.cachedContent, this.alias, this.anchorId);
		return info ? extractBody(this.cachedContent, info) : null;
	}

	/** Not part of BlockHost — the Component the pipeline last mounted via addChild (see
	 *  the field doc above). */
	get lastMountedChild(): Component | null {
		return this.mountedChild;
	}

	async replaceSource(newSource: string): Promise<boolean> {
		if (!this.canPersist) return false;

		this.lastWritten = newSource;

		let wrote = false;
		let finalContent: string | null = null;
		await this.plugin.app.vault.process(this.backingFile, (content) => {
			const info = findAnchoredBlock(content, this.alias, this.anchorId);
			if (!info) return content; // block moved/vanished under us: abort, don't corrupt

			const lines = content.split('\n');
			const openFence = parseOpenFence(lines[info.lineStart]);
			if (!openFence) return content;
			const closeFence = parseCloseFence(lines[info.lineEnd]) ?? openFence.fence;

			const newBlockLines = [`${openFence.fence}${openFence.language}`, ...newSource.split('\n'), closeFence];
			lines.splice(info.lineStart, info.lineEnd - info.lineStart + 1, ...newBlockLines);
			wrote = true;
			finalContent = lines.join('\n');
			return finalContent;
		});

		if (wrote && finalContent !== null) {
			this.cachedContent = finalContent;
			// Safety net (review finding #1, HIGH): the self-echo guard (lastWritten, above)
			// deliberately suppresses onExternalChange for our OWN write — but that means if
			// THIS write's serialized body dropped the `_dse_anchor` line (a persisted
			// element's model not yet passing the anchor field through — the passthrough
			// gap flagged in this file's header), nothing else will ever notice the block
			// became unaddressable. replaceSource only reaches this branch when canPersist
			// was true a moment ago (the early return above) and the write itself is atomic
			// (no await inside the Vault.process callback, so nothing external could have
			// raced it) — so `getBlockInfo() === null` here can only mean OUR write just
			// dropped the anchor. Tell the panel immediately, rather than leaving every
			// subsequent interaction silently failing to save forever.
			if (this.getBlockInfo() === null) this.onAnchorLost();
		}
		return wrote;
	}

	blockKey(): string {
		return `${this.backingFile.path}::${this.alias}::${this.anchorId}`;
	}

	private async handleExternalModify(): Promise<void> {
		const content = await this.plugin.app.vault.cachedRead(this.backingFile);
		this.applyFreshContent(content, true);
	}

	private applyFreshContent(content: string, notify: boolean): void {
		this.cachedContent = content;
		if (!notify) return;

		const info = findAnchoredBlock(content, this.alias, this.anchorId);
		if (!info) return; // block gone — canPersist reflects it; nothing to hand a view
		const body = extractBody(content, info);
		if (body === this.lastWritten) return; // self-echo: our own write, not an external edit
		this.onExternalChange(body);
	}
}
