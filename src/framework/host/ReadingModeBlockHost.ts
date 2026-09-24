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
//
// SC-343 — durable identity + stale-position guard (spec SC-340 §6.5). The host remembers
// the body it last knew is on disk (mount source, then every successful write), the line it
// last saw the block at, and the fence language. Writes splice at getSectionInfo's range
// only when the LIVE content there still holds that body; otherwise the block is found again
// by its body, nearest the last known line (identical twins resolve by distance). A write
// that cannot be placed is dropped with a Notice (droppedWriteNotice.ts). A host whose
// section never resolved (hover, print, nested renders, canvas) never gets this identity.
import { MarkdownRenderChild, TFile } from 'obsidian';
import type { Component, MarkdownPostProcessorContext, MarkdownSectionInformation, Plugin } from 'obsidian';
import type { BlockHost, BlockInfo, RenderMode } from './BlockHost';
import type { PreviewScrollPin } from './previewScrollPin';
import { listFences } from '../sidebar/anchor';
import { notifyDroppedWrite } from './droppedWriteNotice';

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

/** SC-343: bodies compare equal across CRLF/CR/LF and trailing whitespace. */
export function normalizeBody(body: string): string {
	return body.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
}

/**
 * SC-343: find the `language` block whose body equals `body` in `content`, nearest
 * `nearLine` (ties go to the earlier block). Fence lines inclusive. Null when none matches.
 */
export function locateByBody(
	content: string,
	language: string,
	body: string,
	nearLine: number,
): { lineStart: number; lineEnd: number } | null {
	// SC-343 fix round 1: anchor.ts's FENCE_LINE is a plain `.` match, which never matches
	// `\r` — a CRLF note's fence lines fail to parse and listFences sees zero fences. Strip
	// just the `\r` immediately before each `\n` (never a lone `\r`, which would shift line
	// indices against replaceSource's own `content.split('\n')`) so fence lines parse while
	// every line NUMBER stays identical to the untouched content's.
	const lf = content.replace(/\r(?=\n)/g, '');
	const wanted = normalizeBody(body);
	const lines = lf.split('\n');
	let best: { lineStart: number; lineEnd: number } | null = null;
	let bestDistance = Infinity;
	for (const info of listFences(lf, language)) {
		const candidate = normalizeBody(lines.slice(info.lineStart + 1, info.lineEnd).join('\n'));
		if (candidate !== wanted) continue;
		const distance = Math.abs(info.lineStart - nearLine);
		if (distance < bestDistance) {
			best = { lineStart: info.lineStart, lineEnd: info.lineEnd };
			bestDistance = distance;
		}
	}
	return best;
}

export class ReadingModeBlockHost implements BlockHost {
	readonly mode: RenderMode = 'reading';
	readonly containerEl: HTMLElement;

	private readonly renderChild: MarkdownRenderChild;

	// -- SC-343 durable identity --------------------------------------------------------
	/** True once ctx.getSectionInfo(containerEl) has resolved at least once. */
	private sectionResolvedOnce = false;
	/** The body we last knew is on disk: the mount source, then every successful write. */
	private knownBody: string | null = null;
	/** The fence line the block was last seen at (refreshed on every resolving read). */
	private knownLineStart: number | null = null;
	/** The fence language read from the document (null until an opening fence parses). */
	private knownLanguage: string | null = null;

	constructor(
		private readonly plugin: Plugin,
		el: HTMLElement,
		private readonly ctx: MarkdownPostProcessorContext,
		/** Fallback label only — never used to reconstruct a fence (see file header). */
		private readonly alias: string,
		/** SC-198. Plugin-scoped, shared by every host; omitted (null) in unit tests and in
		 *  any caller that has no preview to protect. See previewScrollPin.ts. */
		private readonly scrollPin: PreviewScrollPin | null = null,
	) {
		this.containerEl = el;
		this.renderChild = new MarkdownRenderChild(el);
		this.ctx.addChild(this.renderChild);
		this.readSection();
	}

	get sourcePath(): string {
		return this.ctx.sourcePath;
	}

	/** SC-343: every section read goes through here so the durable position stays fresh. */
	private readSection(): MarkdownSectionInformation | null {
		if (this.ctx.sourcePath === '') return null; // canvas: quarantined, see file header
		const section = this.ctx.getSectionInfo(this.containerEl);
		if (!section) return null;
		this.sectionResolvedOnce = true;
		this.knownLineStart = section.lineStart;
		const fence = parseOpenFence(section.text, section.lineStart);
		if (fence) this.knownLanguage = fence.language;
		return section;
	}

	/** SC-343: identity good enough to find the block again by its body. */
	private get hasDurableIdentity(): boolean {
		return (
			this.sectionResolvedOnce &&
			this.knownBody !== null &&
			this.knownLineStart !== null &&
			this.knownLanguage !== null
		);
	}

	/** SC-343: registerFrameworkElements seeds the body the view is built from. */
	setMountedBody(source: string): void {
		this.knownBody = source;
	}

	/** SC-343 (BlockHost.notePersistIntent): refresh the durable position while live. */
	notePersistIntent(): void {
		this.readSection();
	}

	get lastKnownBody(): string | null {
		return this.knownBody;
	}

	get lastKnownLineStart(): number | null {
		return this.knownLineStart;
	}

	get canPersist(): boolean {
		if (this.ctx.sourcePath === '') return false; // canvas: quarantined, see file header
		if (this.readSection() !== null) return true;
		return this.hasDurableIdentity; // SC-343: section gone, but it resolved once
	}

	addChild<T extends Component>(child: T): T {
		return this.renderChild.addChild(child);
	}

	getBlockInfo(): BlockInfo | null {
		const section = this.readSection();
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

		// Captured immediately before entering Vault.process, with nothing async in between.
		// SC-343: it is only a HINT now — resolveWriteTarget re-validates it against the live
		// content inside the callback and falls back to the durable locate when it is stale.
		const section = this.readSection();

		// SC-198: hold the preview's height across the rebuild this write is about to
		// provoke (only meaningful while the block is on screen, i.e. its section resolves).
		if (section) this.scrollPin?.pin(this.containerEl);

		let wrote = false;
		let dropped = false;
		await this.plugin.app.vault.process(abstractFile, (content) => {
			const target = this.resolveWriteTarget(content, section);
			if (target === 'abort') return content;
			if (target === 'miss') {
				dropped = true;
				return content;
			}
			const lines = content.split('\n');
			const openFence = parseOpenFence(content, target.lineStart);
			if (!openFence) return content; // resolveWriteTarget guarantees one; defensive
			const closeFence = parseCloseFence(lines[target.lineEnd]) ?? openFence.fence;
			const newBlockLines = [`${openFence.fence}${openFence.language}`, ...newSource.split('\n'), closeFence];
			lines.splice(target.lineStart, target.lineEnd - target.lineStart + 1, ...newBlockLines);
			wrote = true;
			return lines.join('\n');
		});
		if (wrote) this.knownBody = newSource;
		if (dropped) notifyDroppedWrite(this.ctx.sourcePath, abstractFile.basename);
		return wrote;
	}

	/**
	 * SC-343: where this write goes, decided from the LIVE content inside Vault.process.
	 *  - the section range, when it still holds our block (opening fence, closing fence or
	 *    an unterminated fence running to the last line, and the body we last knew);
	 *  - else, with a durable identity, the block found by that body nearest the last line;
	 *  - 'miss' when the identity exists but nothing matches (dropped + Notice);
	 *  - 'abort' when there is no identity at all (today's silent no-write).
	 */
	private resolveWriteTarget(
		content: string,
		section: MarkdownSectionInformation | null,
	): { lineStart: number; lineEnd: number } | 'abort' | 'miss' {
		if (section) {
			const lines = content.split('\n');
			const { lineStart, lineEnd } = section;
			const openOk = parseOpenFence(content, lineStart) !== null;
			const closeOk = parseCloseFence(lines[lineEnd]) !== null;
			const unterminatedAtEof = !closeOk && lineEnd === lines.length - 1;
			const bodyEnd = unterminatedAtEof ? lineEnd + 1 : lineEnd;
			const bodyOk =
				this.knownBody === null ||
				normalizeBody(lines.slice(lineStart + 1, bodyEnd).join('\n')) === normalizeBody(this.knownBody);
			if (openOk && (closeOk || unterminatedAtEof) && bodyOk) return { lineStart, lineEnd };
		}
		if (!this.hasDurableIdentity) return 'abort';
		const located = locateByBody(content, this.knownLanguage!, this.knownBody!, this.knownLineStart!);
		if (!located) return 'miss';
		this.knownLineStart = located.lineStart;
		return located;
	}

	blockKey(): string {
		const info = this.getBlockInfo();
		if (info) return `${this.ctx.sourcePath}::${info.language}::${info.lineStart}`;
		// Best-effort fallback (F1 §4.3): no addressable position (canvas / hover /
		// print — NOT embeds, which resolve getSectionInfo/getBlockInfo normally; see
		// this file's canPersist getter and BlockHost.ts's own doc, SC-184 fix round).
		// Not stable across renders in the general case — session UI state only, never
		// document state.
		return `${this.ctx.sourcePath || 'canvas'}::${this.alias}::${this.ctx.docId}`;
	}
}
