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
// section never resolved (print/export, canvas, blocks nested in another view's
// MarkdownRenderer.render) never gets this identity. Hover popovers are NOT in that list —
// measured on Obsidian 1.14.2 (base and head alike, 2026-09-24), a hover popover's section
// RESOLVES and a click writes the correct block, same as any other reading-mode context.
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
 * SC-343 final review (Important-1): `listFences` (via anchor.ts's `iterateFences`) SKIPS
 * a fence that never closes, so `locateByBody` alone could never find a block by body when
 * its closing fence is missing at end-of-note — a perfectly good write then fell through
 * to a FALSE "not saved" Notice on the durable path (e.g. a click then navigate-away 30 ms
 * later, nothing on disk actually changed). Mirrors `iterateFences`' own open/close bracket
 * matching locally — anchor.ts itself is out of scope (the sidebar depends on its current
 * skip-unterminated behaviour) — to find the trailing fence-open of `language` that never
 * finds a valid close before EOF: its body is everything from the line after it through
 * the note's last line (normalizeBody trims the trailing blank lines away for comparison);
 * its lineEnd is `lines.length - 1`.
 */
function locateUnterminatedTrailingFence(
	lines: string[],
	language: string,
): { lineStart: number; lineEnd: number } | null {
	let i = 0;
	let candidate: { lineStart: number; lineEnd: number } | null = null;
	while (i < lines.length) {
		const open = lines[i].match(OPEN_FENCE);
		if (!open) {
			i++;
			continue;
		}
		const fenceChar = open[1][0];
		const fenceLen = open[1].length;
		let j = i + 1;
		let closed = false;
		while (j < lines.length) {
			const close = lines[j].match(CLOSE_FENCE);
			if (close && close[1][0] === fenceChar && close[1].length >= fenceLen && lines[j].slice(close[1].length).trim() === '') {
				closed = true;
				break;
			}
			j++;
		}
		if (!closed) {
			// Runs off the end of the note — the trailing-unterminated candidate for this
			// open. Abandon it (same recovery as iterateFences: don't treat as opaque
			// through to EOF) and keep scanning from the very next line, so a later,
			// better-matching trailing open can still override.
			if (open[2] === language) candidate = { lineStart: i, lineEnd: lines.length - 1 };
			i++;
			continue;
		}
		i = j + 1;
	}
	return candidate;
}

/**
 * SC-343: find the `language` block whose body equals `body` in `content`, nearest
 * `nearLine` (ties go to the earlier block). Fence lines inclusive. Null when none matches.
 * Also considers a trailing fence of `language` that never closes (SC-343 final review
 * Important-1) — its body is everything from the fence-open line through EOF.
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
	// SC-343 final review (Important-1): listFences skips an unterminated fence entirely —
	// also consider the note's own trailing fence-open of `language`, if any, that never
	// closes (its body runs to EOF).
	const unterminated = locateUnterminatedTrailingFence(lines, language);
	if (unterminated) {
		const candidate = normalizeBody(lines.slice(unterminated.lineStart + 1, unterminated.lineEnd + 1).join('\n'));
		if (candidate === wanted) {
			const distance = Math.abs(unterminated.lineStart - nearLine);
			if (distance < bestDistance) {
				best = unterminated;
				bestDistance = distance;
			}
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
			// SC-343 fix round 1: set synchronously with the splice, inside the callback — not
			// after the `await` resumes. Two overlapping replaceSource calls on one host (a
			// timer flush racing the unload flush) each run their OWN Vault.process callback in
			// turn; if knownBody were only set after the first call's `await` returns, the
			// second call's callback (which can run before the first call's continuation) would
			// still see the OLD knownBody and fail the section-path body check against the disk
			// content the first call just wrote, sending the second write down the durable-
			// locate path hunting for a body nobody has any more — a dropped write + a false
			// Notice for two writes that both actually landed.
			this.knownBody = newSource;
			return lines.join('\n');
		});
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
			const openFence = parseOpenFence(content, lineStart);
			const openOk = openFence !== null;
			const closeOk = parseCloseFence(lines[lineEnd]) !== null;
			// SC-343 final review (close-fence hardening, data-loss note): "unterminated at
			// EOF" must ALSO confirm there is no matching close fence anywhere inside the
			// section's own range [lineStart+1, lineEnd] — not only at lineEnd itself. A stale/
			// oversized range (e.g. a section snapshot that grew to include trailing blank
			// lines past the block's REAL close) must never be treated as an open fence running
			// to EOF: the splice below would then delete the real close fence — and everything
			// between it and lineEnd — and write a second one, losing content. Reimplemented
			// locally (mirrors anchor.ts's isFenceClose: same fence char, at least as long, no
			// info string) — anchor.ts itself is out of scope (the sidebar depends on it).
			const hasCloseInRange =
				openOk &&
				lines.slice(lineStart + 1, lineEnd + 1).some((l) => {
					const close = l.match(CLOSE_FENCE);
					return (
						!!close &&
						close[1][0] === openFence.fence[0] &&
						close[1].length >= openFence.fence.length &&
						l.slice(close[1].length).trim() === ''
					);
				});
			// SC-343 fix round 1: "at EOF" tolerates trailing blank lines after the section's
			// reported lineEnd (a trailing '\n' or blank lines below an unterminated fence),
			// not only an exact match to the last line — Obsidian's own section range can land
			// short of the note's true last line when the note ends in blank lines.
			const unterminatedAtEof = !closeOk && !hasCloseInRange && lines.slice(lineEnd + 1).every((l) => l.trim() === '');
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
