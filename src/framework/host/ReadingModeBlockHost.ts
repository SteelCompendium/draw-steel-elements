// F1 §3.4 — ReadingModeBlockHost: the reading-mode BlockHost implementation and the
// persisted-write path (F1 §4.2).
//
// Construction (pipeline-internal, per §3.4): `new ReadingModeBlockHost(plugin, el,
// ctx, alias)` wraps a MarkdownPostProcessorContext, creates one
// MarkdownRenderChild(el) and `ctx.addChild`s it; `addChild` proxies to that render
// child so anything an ElementView registers unloads in lockstep with the block's
// section being torn down/re-rendered.
//
// Correctness fixes over the legacy src/utils/CodeBlocks.ts (NOT modified by this
// file — it stays live for unmigrated elements until D1):
//   - CB-3 (lost update): legacy `vault.read` → splice → `vault.modify` is a
//     non-atomic read-modify-write; two concurrent updates race and one is silently
//     dropped. replaceSource() here uses `Vault.process` (atomic read-modify-write)
//     and re-resolves the block's fence position from the LIVE content at write time
//     (never a value cached before entering the process() callback), so a concurrent
//     write that shifts line numbers elsewhere in the note cannot corrupt or drop this
//     write.
//   - CB-5 (alias rewrite): legacy always re-emits the *canonical* language it was
//     called with, silently rewriting e.g. `ds-it` to `ds-initiative`. replaceSource()
//     here re-parses the fence line (chars + language) from the document on every
//     write and reuses exactly what it finds. The constructor's `alias` argument is
//     NEVER used to reconstruct the fence — it is only a fallback label (getBlockInfo/
//     blockKey) for the rare case a fence can't be re-parsed.
//
// Canvas / non-addressable contexts (F1 §4.4, §9 risk "Canvas writeback fragility"):
// the legacy canvas-selection-matching fallback (CodeBlocks.findCanvasNodeAndUpdate /
// updateCanvasCard) is intentionally NOT ported here. Per spec §9 that risk is
// "quarantined ... converted to explicit false/read-only; a proper canvas-node
// identity fix is out of scope (FOLLOWUPS candidate)". Any context with
// `sourcePath === ""` (canvas text nodes) therefore always resolves
// `canPersist = false` / `replaceSource() -> false`, even in the rare case
// `ctx.getSectionInfo` itself still resolves (a real quirk of canvas rendering the
// legacy code relied on for its text-matching fallback) — never a console.log.
import { MarkdownRenderChild, TFile } from 'obsidian';
import type { Component, MarkdownPostProcessorContext, Plugin } from 'obsidian';
import type { BlockHost, BlockInfo, RenderMode } from './BlockHost';

/** Matches a fence-open line, capturing the fence run and the language token. */
const OPEN_FENCE = /^([`~]{3,})(\S*)/;
/** Matches a fence-close line, capturing the fence run. */
const CLOSE_FENCE = /^([`~]{3,})/;

function parseOpenFence(text: string, lineStart: number): { fence: string; language: string } | null {
	const line = text.split('\n')[lineStart];
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

export class ReadingModeBlockHost implements BlockHost {
	readonly mode: RenderMode = 'reading';
	readonly containerEl: HTMLElement;

	private readonly renderChild: MarkdownRenderChild;

	constructor(
		private readonly plugin: Plugin,
		el: HTMLElement,
		private readonly ctx: MarkdownPostProcessorContext,
		/** Fallback label only — never used to reconstruct a fence (see file header). */
		private readonly alias: string,
	) {
		this.containerEl = el;
		this.renderChild = new MarkdownRenderChild(el);
		this.ctx.addChild(this.renderChild);
	}

	get sourcePath(): string {
		return this.ctx.sourcePath;
	}

	get canPersist(): boolean {
		if (this.ctx.sourcePath === '') return false; // canvas: quarantined, see file header
		return this.ctx.getSectionInfo(this.containerEl) !== null;
	}

	addChild<T extends Component>(child: T): T {
		return this.renderChild.addChild(child);
	}

	getBlockInfo(): BlockInfo | null {
		if (this.ctx.sourcePath === '') return null; // canvas: quarantined, see file header
		const section = this.ctx.getSectionInfo(this.containerEl);
		if (!section) return null;
		const fence = parseOpenFence(section.text, section.lineStart);
		return {
			language: fence?.language ?? this.alias,
			lineStart: section.lineStart,
			lineEnd: section.lineEnd,
		};
	}

	async replaceSource(newSource: string): Promise<boolean> {
		if (!this.canPersist) return false;

		const abstractFile = this.plugin.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
		if (!(abstractFile instanceof TFile)) return false;

		// Captured immediately before entering Vault.process, with nothing async in
		// between — on the real vault this is still the freshest position we can know
		// without racing; the process() callback below re-derives the fence text itself
		// from the content IT receives, rather than trusting this snapshot, so a
		// concurrent write that shifted lines is still handled correctly (see file header).
		const section = this.ctx.getSectionInfo(this.containerEl);
		if (!section) return false;
		const { lineStart, lineEnd } = section;

		let wrote = false;
		await this.plugin.app.vault.process(abstractFile, (content) => {
			const openFence = parseOpenFence(content, lineStart);
			if (!openFence) return content; // block moved/vanished under us: abort, don't corrupt

			const lines = content.split('\n');
			const closeFence = parseCloseFence(lines[lineEnd]) ?? openFence.fence;

			const newBlockLines = [`${openFence.fence}${openFence.language}`, ...newSource.split('\n'), closeFence];
			lines.splice(lineStart, lineEnd - lineStart + 1, ...newBlockLines);
			wrote = true;
			return lines.join('\n');
		});
		return wrote;
	}

	blockKey(): string {
		const info = this.getBlockInfo();
		if (info) return `${this.ctx.sourcePath}::${info.language}::${info.lineStart}`;
		// Best-effort fallback (F1 §4.3): no addressable position (canvas / embed /
		// hover / print). Not stable across renders in the general case — session UI
		// state only, never document state.
		return `${this.ctx.sourcePath || 'canvas'}::${this.alias}::${this.ctx.docId}`;
	}
}
