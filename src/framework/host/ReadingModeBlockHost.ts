// F1 §3.4 — ReadingModeBlockHost: the reading-mode BlockHost implementation and the
// persisted-write path (F1 §4.2).
//
// Construction (pipeline-internal, per §3.4): `new ReadingModeBlockHost(plugin, el,
// ctx, alias)` wraps a MarkdownPostProcessorContext, creates one
// MarkdownRenderChild(el) and `ctx.addChild`s it; `addChild` proxies to that render
// child, tying an AUXILIARY Component's lifecycle to the block's section being torn
// down/re-rendered. SC-340 (spec §7) amends this for the ElementVIEW itself: the
// pipeline hands the view to the plugin-scoped ViewRegistry (host.registry.own), never
// to host.addChild, so the view can outlive its render child (adoption) — the render
// child's unload only SIGNALS the registry (registry.release) rather than owning the
// view directly. See viewRegistry.ts's file header. Per spec §6.1, anything an adopted
// view depends on that hangs off the OLD render child dies ~50 ms after adoption — so a
// view adds its OWN auxiliary Components (a modal, a popover) through `this.addChild`,
// never `host.addChild`; `host.addChild` here is for something meant to die with the
// section that no view depends on.
//
// Correctness fixes over the former legacy src/utils/CodeBlocks.ts (deleted in SC-454;
// it had no caller in src/ after the Plan 07 counter migration, afedb2a):
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
// the legacy canvas-selection-matching fallback (the former CodeBlocks.findCanvasNodeAndUpdate /
// updateCanvasCard, deleted in SC-454) is intentionally NOT ported here. Per spec §9 that risk is
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
// MarkdownRenderer.render) never gets this identity.
//
// SC-455 — a block inside a blockquote / callout. Measured in real Obsidian 1.14.4: in Reading view
// getSectionInfo returns the WHOLE quote/callout (lineStart = its first line, e.g. the `> [!note]`
// header, not the fence), so the host finds its own fence INSIDE that window (`locateInSection`: by
// body, identical twins by their DOM order); in Live Preview a callout is one CodeMirror widget whose
// processors get NO section info at all, so the host finds the callout through the editor instead
// (`livePreviewCalloutSection`: cm.posAtDOM). The write re-emits the block's own `> ` prefix on every
// line (fenceLine.ts / blockPrefix.ts), and a write that cannot be placed says so (a Notice) rather
// than returning false silently. Hover popovers are NOT in that list —
// measured on Obsidian 1.14.2 (base and head alike, 2026-09-24), a hover popover's section
// RESOLVES and a click writes the correct block, same as any other reading-mode context.
import { MarkdownRenderChild, TFile, resolveSubpath } from 'obsidian';
import type { CachedMetadata, Component, MarkdownPostProcessorContext, MarkdownSectionInformation, MarkdownView, Plugin } from 'obsidian';
import type { BlockHost, BlockInfo, BlockPin, BlockWriteOptions, RenderMode } from './BlockHost';
import { editDistance, mapLine, mapLineFromTail, mapLineStrict, LINE_MAP_MAX_EDITS } from './lineMap';
import type { PreviewScrollPin } from './previewScrollPin';
import { listFences } from '../sidebar/anchor';
import { notifyDroppedWrite, notifyUnsavableWrite } from './droppedWriteNotice';
import { splitLines, splitWithEols } from './lineEnding';
import { hoverDrawnText, hoverLinkOf } from './hoverLinks';
import { atxHeadings, normalizeHeadingName } from './headingNames';
import { blockBodyLines, parseOpenFenceLine, replaceFenceBlock } from './fenceLine';
import type { ViewRegistry, ViewRegistryEntry } from './viewRegistry';

/** Matches a fence-close line, capturing the fence run. */
const CLOSE_FENCE = /^([`~]{3,})/;

// SC-460: every line number in this file (a section's lineStart/lineEnd, the positions locateByBody and
// locateInSection return, anything spliced by replaceFenceBlock) is in OBSIDIAN's numbering, where a lone
// CR is a line break like LF and CRLF (lineEnding.ts) - so every index into the note goes through splitLines.
function parseOpenFence(text: string, lineStart: number) {
	return parseOpenFenceLine(splitLines(text)[lineStart]);
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
 * SC-477: the last line in `[from, to]` that is not blank (empty or whitespace-only), floored at `from`.
 * Where an unterminated trailing fence's replaced range stops, so the note's trailing newline(s) / blank
 * lines survive the splice (see `locateUnterminatedTrailingFence` and `resolveWriteTarget`).
 */
function lastNonBlankLine(lines: string[], from: number, to: number): number {
	let end = to;
	while (end > from && lines[end].trim() === '') end--;
	return end;
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
 * the note's last NON-BLANK line, and its lineEnd is that line (or the fence-open line itself
 * for an empty body). SC-477: the note's trailing newline(s) / blank / whitespace-only lines
 * are NOT part of the range - the splice replaces [lineStart, lineEnd] and the close fence
 * takes the terminator of the lineEnd line, so a range running to `lines.length - 1` swallowed
 * those bytes. The in-place path clamps the section Obsidian reports to the same line
 * (`lastNonBlankLine`, in resolveWriteTarget), so for the same note and body both paths write
 * byte-identical output.
 */
function locateUnterminatedTrailingFence(
	lines: string[],
	language: string,
): { lineStart: number; lineEnd: number } | null {
	let i = 0;
	let candidate: { lineStart: number; lineEnd: number } | null = null;
	while (i < lines.length) {
		const open = parseOpenFenceLine(lines[i]);
		if (!open || open.prefix !== '') {
			// (SC-455: a trailing fence that never closes is only ever recovered for an un-nested block.)
			i++;
			continue;
		}
		const fenceChar = open.fence[0];
		const fenceLen = open.fence.length;
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
			if (open.language === language) {
				candidate = { lineStart: i, lineEnd: lastNonBlankLine(lines, i, lines.length - 1) };
			}
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
	nearLine: number | null,
): { lineStart: number; lineEnd: number } | 'ambiguous' | null {
	// SC-343 fix round 1 / SC-453: a CRLF note's fence lines must parse (the old fence regex's `.` never
	// matched `\r`). SC-460: lines are split by Obsidian's rule (CR, CRLF, LF), which also drops every CR
	// terminator, so `lines` is CR-free for the fence-matching helpers and the positions returned are in
	// the same numbering as a section's lineStart/lineEnd and replaceFenceBlock's indices.
	const wanted = normalizeBody(body);
	const lines = splitLines(content);
	let best: { lineStart: number; lineEnd: number } | null = null;
	let bestDistance = Infinity;
	let matched = 0;
	for (const info of listFences(content, language)) {
		const candidate = normalizeBody(blockBodyLines(lines, info.lineStart, info.lineEnd).join('\n'));
		if (candidate !== wanted) continue;
		matched++;
		const distance = Math.abs(info.lineStart - (nearLine ?? 0));
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
			matched++;
			const distance = Math.abs(unterminated.lineStart - (nearLine ?? 0));
			if (distance < bestDistance) {
				best = unterminated;
				bestDistance = distance;
			}
		}
	}
	// SC-455 review LOW-1: with no known position (a Live Preview callout written before its widget was
	// ever attached) equal bodies cannot be told apart by distance - never guess one.
	if (nearLine === null && matched > 1) return 'ambiguous';
	return best;
}

/**
 * SC-480: how many blocks of `language` in `content` hold `body` - the same scope as `locateByBody` (closed fences, quoted ones
 * included, and the note's trailing fence that never closes).
 */
export function countByBody(content: string, language: string, body: string): number {
	const wanted = normalizeBody(body);
	const lines = splitLines(content);
	let n = 0;
	for (const info of listFences(content, language)) {
		if (normalizeBody(blockBodyLines(lines, info.lineStart, info.lineEnd).join('\n')) === wanted) n++;
	}
	const open = locateUnterminatedTrailingFence(lines, language);
	if (open && normalizeBody(lines.slice(open.lineStart + 1, open.lineEnd + 1).join('\n')) === wanted) n++;
	return n;
}

/**
 * SC-455: the `language` block inside a Reading-view / Live Preview SECTION WINDOW
 * `[section.lineStart, section.lineEnd]` of `content` — the whole quote or callout Obsidian reports
 * for a block nested in one, where the section's first line is NOT the fence. Fence lines inclusive.
 *  - the block whose (prefix-free) body equals `body` (any block of the language when `body` is null);
 *  - several equal ones (identical twins in one callout) are told apart by `ordinal` — this block's
 *    position among the language's blocks in the callout's DOM, which is document order — else by the
 *    one nearest `near`; 'ambiguous' when even that cannot pick one;
 *  - null when the window holds no such block.
 */
export function locateInSection(
	content: string,
	section: { lineStart: number; lineEnd: number },
	language: string,
	body: string | null,
	ordinal: number,
	near: number | null,
): { lineStart: number; lineEnd: number } | 'ambiguous' | null {
	return locateInSectionLines(splitLines(content), section, language, body, ordinal, near);
}

type FenceSpan = { lineStart: number; lineEnd: number };
/** A window's fences, with the `lines` they were read from: a list is only reused for the text it came from. */
type WindowFences = { lines: readonly string[]; spans: readonly FenceSpan[] };

/**
 * The `language` fences inside `section` (document line numbers, fence lines inclusive), in document order.
 * `cache` (SC-547) is one pass's memory of each window's list, keyed by window and language: the pass asks once per block of a callout,
 * and without it each ask scanned every line of the callout (cost grew with the square of the blocks in one callout). It must not outlive
 * the pass: the lines it was read from change between passes.
 */
function windowFences(
	lines: readonly string[],
	section: { lineStart: number; lineEnd: number },
	language: string,
	cache?: Map<string, WindowFences>,
): readonly FenceSpan[] {
	const key = `${section.lineStart}:${section.lineEnd}:${language}`;
	// Two hosts of one pass can hold sections of different texts with the same bounds (a callout that embeds a section of its own
	// note: Obsidian's `getSectionInfo` answers with the embed's text, the editor with the document's), so a hit must be the same lines.
	const cached = cache?.get(key);
	if (cached && cached.lines === lines) return cached.spans;
	const windowLines = lines.slice(section.lineStart, section.lineEnd + 1);
	// A section starts at a block boundary, so scanning the window on its own sees what a scan of the whole note would.
	const fences = listFences(windowLines.join('\n'), language).map((f) => ({
		lineStart: f.lineStart + section.lineStart,
		lineEnd: f.lineEnd + section.lineStart,
	}));
	cache?.set(key, { lines, spans: fences });
	return fences;
}

/** `locateInSection` over a note already split into lines (`splitLines`), for a caller that asks about one note many times. */
function locateInSectionLines(
	lines: readonly string[],
	section: { lineStart: number; lineEnd: number },
	language: string,
	body: string | null,
	ordinal: number,
	near: number | null,
	fenceCache?: Map<string, WindowFences>,
): { lineStart: number; lineEnd: number } | 'ambiguous' | null {
	const fences = windowFences(lines, section, language, fenceCache);
	const wanted = body === null ? null : normalizeBody(body);
	const matches =
		wanted === null
			? fences
			: fences.filter((f) => normalizeBody(blockBodyLines(lines, f.lineStart, f.lineEnd).join('\n')) === wanted);
	if (matches.length <= 1) return matches[0] ?? null;
	const byOrder = ordinal >= 0 ? fences[ordinal] : undefined;
	if (byOrder && matches.includes(byOrder)) return byOrder;
	if (near !== null) {
		const ranked = matches.map((f) => ({ f, d: Math.abs(f.lineStart - near) })).sort((a, b) => a.d - b.d);
		if (ranked[0].d < ranked[1].d) return ranked[0].f;
	}
	return 'ambiguous';
}

/** CodeMirror's EditorView, as much of it as the Live Preview callout lookup touches. */
export interface CmEditorView {
	dom: HTMLElement;
	posAtDOM(node: Node, offset?: number): number;
	state: { doc: { lineAt(pos: number): { number: number }; toString(): string } };
}

/**
 * SC-537: an editor update the Live Preview pass reads the note from: the view that holds the widgets, and the note text of
 * ITS document (not `editor.getValue()` per host). `text` is read lazily - it is only needed once a callout widget is judged.
 */
export interface LivePreviewScope extends PassMemo {
	readonly view: CmEditorView;
	readonly text: string;
}

/**
 * What ONE editor pass remembers so that asking about every block of a callout reads the callout once, not once per block
 * (SC-537 `blocks`; SC-547 `fences`, `windowEnds`). Made fresh for each pass (`newPassMemo`) and dropped with it: the document
 * changes between passes.
 */
export interface PassMemo {
	/** The block list of each quote/callout and alias (`quoteOrdinal`'s cache). */
	readonly blocks: Map<Element, Map<string, readonly Element[]>>;
	/** The fences of each callout window and language, with the text they were read from (`windowFences`'s cache). */
	readonly fences: Map<string, WindowFences>;
	/** The last line of the callout starting at each line (`calloutWindow`'s cache). Filled only from the editor's own text (`scope.text`), one text per pass. */
	readonly windowEnds: Map<number, number>;
}

export const newPassMemo = (): PassMemo => ({ blocks: new Map(), fences: new Map(), windowEnds: new Map() });

/**
 * SC-455 / SC-537: the section of the Live Preview callout `widget` as `cm` draws it now: the callout's lines (a run of quote
 * lines), starting at the document line CodeMirror reports for the widget. Throws when the widget is not in this editor's
 * document (callers treat that as "no section").
 */
function calloutWindow(
	cm: CmEditorView,
	widget: Element,
	getText: () => string,
	linesOf: (text: string) => readonly string[],
	windowEnds?: Map<number, number>,
): MarkdownSectionInformation {
	const lineStart = cm.state.doc.lineAt(cm.posAtDOM(widget)).number - 1;
	const text = getText();
	const lines = linesOf(text);
	// SC-547: the callout's last line is found once per callout and pass, not once per block in it.
	let lineEnd = windowEnds?.get(lineStart) ?? lineStart;
	if (!windowEnds?.has(lineStart)) {
		while (lineEnd + 1 < lines.length && /^[ ]{0,3}>/.test(lines[lineEnd + 1])) lineEnd++;
		windowEnds?.set(lineStart, lineEnd);
	}
	return { text, lineStart, lineEnd };
}

/**
 * SC-455: the position of the `alias` block drawn in `el` among the `alias` blocks of the outermost quote/callout around it,
 * in document order (the DOM's). -1 when `el` is in no quote/callout or is not found among them.
 * `cache` (SC-537) is one pass's memory of each quote/callout's block list per alias: a pass that asks about every block of a callout
 * reads the list once instead of once per block (the editor pass runs on every scroll and keystroke). The list is per alias: a callout
 * holding blocks of two aliases has two lists, and a block is never looked up in the other alias's.
 */
export function quoteOrdinal(el: HTMLElement, alias: string, cache?: Map<Element, Map<string, readonly Element[]>>): number {
	let top: Element | null = null;
	for (let n = el.parentElement; n; n = n.parentElement) {
		if (n.matches('.callout, blockquote, .cm-embed-block')) top = n;
	}
	if (!top) return -1;
	let perAlias = cache?.get(top);
	let blocks = perAlias?.get(alias);
	if (!blocks) {
		// a sibling Obsidian has not handed to its processor yet is still a bare <pre><code>
		blocks = Array.from(top.querySelectorAll(`div.block-language-${alias}, pre > code.language-${alias}`)).filter((n) => !n.parentElement?.closest('[data-dse-element]'));
		if (cache) {
			if (!perAlias) cache.set(top, (perAlias = new Map<string, readonly Element[]>()));
			perAlias.set(alias, blocks);
		}
	}
	return blocks.indexOf(el);
}

/** SC-556: the rebase (`ReadingModeBlockHost.rebaseCardPin`) a pin made by `pinPosition` is waiting for; a pin made elsewhere has none. */
const pinRebased = new WeakMap<object, Promise<void>>();
/**
 * SC-556: pins of blocks drawn inside an embed of PART of a note (or a hover preview, which has no `src`) that are still in the PART's
 * coordinates (text and line numbers of the part, not of the note). `rebaseCardPin` takes a pin out of the set when it has put it into the
 * note's coordinates. A pin still in the set must never be mapped against the whole note (`pinnedTarget` refuses it): the map would treat
 * the part's lines as the note's and can land on an identical block elsewhere.
 */
const partialPins = new WeakSet<object>();
/**
 * SC-596: the pin of a block (a block edit form's, or a card write's) drawn inside an embed or hover preview whose position could not be found at
 * all (no section, or no own fence in the part and no own write to stand in). Before, such a block had NO pin and its write went without
 * `pinOnly`: the part's line numbers and the body against the whole note (`resolveWriteTarget` -> `locateByBody`), which finds the identical twin
 * when the block was edited from outside. A refusing pin writes nothing and says so (the "can't tell where" Notice, as an unplaceable write).
 */
const refusingPins = new WeakSet<object>();
/**
 * SC-607: pins of blocks drawn in an embed or hover preview of PART of a note, placed in the note as the card was DRAWN (the snapshot taken when
 * it was mounted, or this host's own last write), never where the link points now. Mapped strictly: the head-first and the tail-first line map
 * (`mapLine`, `mapLineFromTail`) must agree on the line (two identical blocks with identical surroundings, one deleted, read either way: refused),
 * and a miss is never given the fallback placement (`twinned` / `resolveWriteTarget`).
 */
const strictPins = new WeakSet<object>();

/**
 * SC-607: whether the metadata cache `meta` describes `text` (taken together when a card is mounted; the cache lags an outside edit by 6-45 ms, and
 * a snapshot whose cache is not of its text is not kept). Every heading is on its line and the last section ends where the text ends.
 */
function metaMatchesText(meta: CachedMetadata | null, text: string): boolean {
	if (!meta) return false;
	const lines = splitLines(text);
	for (const h of meta.headings ?? []) {
		const l = lines[h.position.start.line];
		if (l === undefined || !l.includes(h.heading)) return false;
	}
	const sections = meta.sections;
	if (sections && sections.length > 0) {
		const end = sections[sections.length - 1].position.end;
		if (end.line >= lines.length || text.slice(end.offset).trim() !== '') return false;
	}
	return true;
}

/**
 * SC-481: the fence the element `el` is drawn on RIGHT NOW, read from the section Obsidian reports for it, or null when that
 * cannot be told. Shared by both ways of finding an element Obsidian reused for another block (`reusedBlockBody` for a live
 * view, `ReusedElementRemounter.remountVacated` for the element an adoption emptied), so they judge a section the same way.
 *  - a plain section (its first line is the fence) must be a closed fence;
 *  - a quote/callout window (SC-455) holds the fence somewhere inside it: found as the host finds its own block, by the
 *    block's place among the `alias` blocks of the window (`quoteOrdinal`), or the window's only one. Several blocks and no
 *    ordinal is never guessed (no `near`);
 *  - `body` is the fence's own lines, quote prefix off, exactly what Obsidian hands a processor.
 * `linesOf` lets a caller that asks many times about one note split its text once. `sectionOf` is the section to judge when the
 * caller knows it better than the context does (SC-537: the editor's section for a Live Preview callout widget, whose
 * `getSectionInfo` is null); left out, the context is asked. `memo` is the pass's memory (`PassMemo`); left out, nothing is remembered.
 */
export function fenceOnElement(
	ctx: MarkdownPostProcessorContext,
	el: HTMLElement,
	alias: string,
	linesOf: (text: string) => readonly string[] = splitLines,
	sectionOf?: MarkdownSectionInformation | null,
	memo?: PassMemo,
): { lineStart: number; lineEnd: number; body: string } | null {
	if (ctx.sourcePath === '') return null;
	let section: MarkdownSectionInformation | null;
	if (sectionOf !== undefined) {
		section = sectionOf;
	} else {
		try {
			section = ctx.getSectionInfo(el);
		} catch {
			return null;
		}
	}
	if (!section || section.lineEnd <= section.lineStart) return null;
	const lines = linesOf(section.text);
	const open = parseOpenFenceLine(lines[section.lineStart]);
	let fence: { lineStart: number; lineEnd: number };
	if (open && open.prefix === '') {
		if (parseCloseFence(lines[section.lineEnd]) === null) return null;
		fence = { lineStart: section.lineStart, lineEnd: section.lineEnd };
	} else {
		const found = locateInSectionLines(lines, section, alias, null, quoteOrdinal(el, alias, memo?.blocks), null, memo?.fences);
		if (found === null || found === 'ambiguous') return null;
		fence = found;
	}
	return { ...fence, body: blockBodyLines(lines, fence.lineStart, fence.lineEnd).join('\n') };
}

export class ReadingModeBlockHost implements BlockHost {
	readonly mode: RenderMode = 'reading';
	private el: HTMLElement;

	/** SC-340: a getter — rebind() re-points the host at the adopting section. */
	get containerEl(): HTMLElement {
		return this.el;
	}

	private renderChild: MarkdownRenderChild;

	// -- SC-343 durable identity --------------------------------------------------------
	/** True once ctx.getSectionInfo(containerEl) has resolved at least once. */
	private sectionResolvedOnce = false;
	/** The body we last knew is on disk: the mount source, then every successful write. */
	private knownBody: string | null = null;
	/** The fence line the block was last seen at (refreshed on every resolving read). */
	private knownLineStart: number | null = null;
	/** The fence language read from the document (null until an opening fence parses). */
	private knownLanguage: string | null = null;
	/** SC-455: this block lives in a Live Preview callout widget — Obsidian gives those no section
	 *  info, so the durable identity stands in for the section the host never resolves once. */
	private lpCalloutSeen = false;
	/** SC-455: the block's own fence inside the section window, as of the last section read (null = not found). */
	private ownFence: { lineStart: number; lineEnd: number; language: string } | null = null;
	/** SC-455: the block's position among the language's blocks in its callout's DOM, as of the last time it was attached. */
	private lastOrdinal = -1;
	/** SC-481: the fence line this host's last write landed at (null until it writes). */
	private lastWriteLine: number | null = null;
	/**
	 * SC-584: this host's own last write to its block while it was drawn inside an embed or a hover preview: the body it wrote, the note
	 * as that write left it, and the line of the block's fence in it. A form opened right after a + on the card (the card's own write)
	 * finds its block from this when the part Obsidian reports for the card is still the one from before the +. It is only ever a
	 * position the host itself wrote, so every outside edit since then is judged by the usual pin rules (`mapLine`, the body check in
	 * `pinnedTarget`). Replaced by the next write of this host; dropped when the host is given a new mounted body. A write by
	 * ANOTHER host of the same block (a second pane) is not recorded here.
	 */
	private lastWrite: { body: string; text: string; lineStart: number; seq: number } | null = null;
	/**
	 * SC-607: the note as this card was DRAWN, read when it was mounted (`setMountedBody`) or re-bound (`rebind`), with the metadata cache of that
	 * moment; `text: null` when the card's section was the whole note (nothing to keep: a pin of it is already a pin of the note). Null when the
	 * read was not consistent with its cache (an outside edit landed then), when there is no note, or after the section unloads. `seq` orders it
	 * against `lastWrite` (the newer one places a pin first).
	 */
	private drawn: { text: string | null; meta: CachedMetadata | null; seq: number; rebound: boolean } | null = null;
	private drawnRead: Promise<void> | null = null;
	private drawnToken: object | null = null;
	private drawnSeq = 0;

	/** SC-340: this host's registry entry (set by ViewRegistry.own). */
	private entry: ViewRegistryEntry | null = null;
	/** SC-340 fix round 1 (Important-1): true once the CURRENT render child has unloaded,
	 *  even before a view exists to release — see onRenderChildUnload / makeRenderChild. */
	private _renderChildGone = false;

	private ctx: MarkdownPostProcessorContext;

	constructor(
		private readonly plugin: Plugin,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
		/** Fallback label only — never used to reconstruct a fence (see file header). */
		private readonly alias: string,
		/** SC-198. Plugin-scoped, shared by every host; omitted (null) in unit tests and in
		 *  any caller that has no preview to protect. See previewScrollPin.ts. */
		private readonly scrollPin: PreviewScrollPin | null = null,
		/** SC-340: the plugin-scoped owner of this host's view; null in unit tests / non-owned use. */
		readonly registry: ViewRegistry | null = null,
	) {
		this.ctx = ctx;
		this.el = el;
		this.renderChild = this.makeRenderChild(el, ctx);
		this.readSection();
	}

	private makeRenderChild(el: HTMLElement, ctx: MarkdownPostProcessorContext): MarkdownRenderChild {
		const renderChild = new MarkdownRenderChild(el);
		// SC-340 fix round 1: a freshly made render child describes the CURRENT binding —
		// reset the flag here (not just at field-init) so Task 3's rebind, which calls this
		// factory again for a new render child, never inherits a stale `true` from the one
		// it superseded.
		this._renderChildGone = false;
		renderChild.register(() => this.onRenderChildUnload(renderChild));
		ctx.addChild(renderChild);
		return renderChild;
	}

	/**
	 * SC-340 §6.4: only the host's CURRENT render child releases the view. A render child the
	 * host was rebound away from (Task 3) is superseded: its unload is a no-op.
	 */
	private onRenderChildUnload(renderChild: MarkdownRenderChild): void {
		if (renderChild !== this.renderChild) return;
		this.lastWrite = null; // SC-584: the record of this host's own write (a whole note's text) is not kept past the section it was made for
		this.drawn = null; // SC-607: nor the note as drawn,
		this.drawnRead = null; // nor a read of it still in flight (it must not fill `drawn` of an unloaded host)
		this.drawnToken = null;
		// SC-340 fix round 1 (Important-1): recorded whether or not an entry exists yet — the
		// pipeline can still be awaiting prepareModel (refs) when the section is torn down, so
		// ViewRegistry.own() would otherwise hand the view to a host whose render child has
		// already gone, leaking it until the plugin unloads. See the `renderChildGone` getter.
		this._renderChildGone = true;
		this.readSection(); // last chance to refresh the durable position while it may resolve
		if (this.entry && this.registry) this.registry.release(this.entry, 'render-child-unload');
	}

	/** SC-340 fix round 1: true once the CURRENT render child has unloaded — checked by
	 *  ViewRegistry.own() so a view mounted after the section is already gone is released
	 *  immediately instead of leaking until the plugin unloads. */
	get renderChildGone(): boolean {
		return this._renderChildGone;
	}

	/** SC-340 Task 5 fix round 1 (Minor-2): whether the CURRENT render child has been
	 *  loaded (i.e. is really on screen) — a leaked entry whose render child was added but
	 *  never loaded is not a real second instance of anything, so the collision guard must
	 *  not count it. */
	get renderChildLoaded(): boolean {
		return (this.renderChild as unknown as { _loaded: boolean })._loaded;
	}

	/**
	 * SC-552 (BlockHost.keepFormOpenOn): the registry, when this host's section has been thrown away (its render child unloaded) while the
	 * note is still shown in some pane and the plugin is still loaded - a block edit form of this host may then outlive its view and hang its
	 * close on the registry. That is the redraw case (an identical twin took the block's text; the block is still in the note on screen). Null
	 * when the note is no longer shown in any pane (the leaf was closed or navigated away: the form closes with its view as it always did,
	 * F1 section 4.5), when the plugin is going away (the registry has unloaded or is unloading), and for a host with no registry.
	 */
	keepFormOpenOn(): Component | null {
		const registry = this.registry;
		if (!registry || !this._renderChildGone) return null;
		if (!(registry as unknown as { _loaded: boolean })._loaded) return null;
		const shown = this.plugin.app.workspace
			.getLeavesOfType('markdown')
			.some((leaf) => (leaf.view as MarkdownView).file?.path === this.ctx.sourcePath);
		return shown ? registry : null;
	}

	attachEntry(entry: ViewRegistryEntry): void {
		this.entry = entry;
	}

	get sourcePath(): string {
		return this.ctx.sourcePath;
	}

	get docId(): string {
		return this.ctx.docId;
	}

	/**
	 * SC-340 §6.3: re-point this SAME host (so every closure holding cx.host stays valid) at a
	 * new section. The previous render child is left to Obsidian; its unload is a no-op.
	 */
	rebind(el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
		this.el = el;
		this.ctx = ctx;
		this.renderChild = this.makeRenderChild(el, ctx);
		this.readSection();
		this.snapshotDrawn(true); // SC-607: drawn again
	}

	/**
	 * SC-607: read the note this card is drawn from, now (it is being mounted or re-bound), with the metadata cache of this moment. Kept only for a
	 * card whose section is a PART of the note (an embed or hover preview of a heading or block) and only when the cache describes the text read.
	 */
	private snapshotDrawn(rebound: boolean): void {
		this.drawn = null;
		this.drawnRead = null;
		const seq = ++this.drawnSeq;
		const token = {};
		this.drawnToken = token;
		if (this.ctx.sourcePath === '') return;
		const file = this.plugin.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
		if (!(file instanceof TFile)) return;
		let partText: string | null = null;
		try {
			partText = this.ctx.getSectionInfo(this.containerEl)?.text ?? null;
		} catch {
			partText = null;
		}
		const meta = this.plugin.app.metadataCache.getFileCache(file);
		this.drawnRead = this.plugin.app.vault.cachedRead(file).then(
			(text) => {
				if (this.drawnToken !== token) return;
				if (partText !== null && text === partText) {
					this.drawn = { text: null, meta: null, seq, rebound };
					return;
				}
				if (!metaMatchesText(meta, text)) return;
				this.drawn = { text, meta, seq, rebound };
			},
			() => undefined,
		);
	}

	/** SC-343: every section read goes through here so the durable position stays fresh. */
	private readSection(): MarkdownSectionInformation | null {
		if (this.ctx.sourcePath === '') return null; // canvas: quarantined, see file header
		let section = this.ctx.getSectionInfo(this.containerEl);
		if (!section && this.livePreviewCalloutWidget()) {
			// SC-455: Live Preview gives a callout's blocks no section; remember that this is one (so the
			// durable identity applies even before the editor can place it) and ask the editor.
			this.lpCalloutSeen = true;
			this.knownLanguage ??= this.alias;
			section = this.livePreviewCalloutSection();
		}
		if (!section) return null;
		this.sectionResolvedOnce = true;
		this.ownFence = this.findOwnFence(section.text, section);
		this.knownLineStart = this.ownFence ? this.ownFence.lineStart : section.lineStart;
		if (this.ownFence) this.knownLanguage = this.ownFence.language;
		return section;
	}

	/**
	 * SC-455: this block's fence within `text` for `section`: the section's own first line when that is
	 * a plain (un-nested) fence — every block outside a quote/callout, exactly as before — else the
	 * block found inside the quote/callout window (`locateInSection`).
	 */
	private findOwnFence(
		text: string,
		section: { lineStart: number; lineEnd: number },
	): { lineStart: number; lineEnd: number; language: string } | null {
		const open = parseOpenFence(text, section.lineStart);
		if (open && open.prefix === '') return { lineStart: section.lineStart, lineEnd: section.lineEnd, language: open.language };
		const found = locateInSection(text, section, this.alias, this.knownBody, this.domOrdinal(), this.knownLineStart);
		if (found === null || found === 'ambiguous') return null;
		return { ...found, language: parseOpenFence(text, found.lineStart)?.language ?? this.alias };
	}

	/** SC-455: the Live Preview callout widget this block is rendered in (not a nested render inside a DSE element), or null. */
	private livePreviewCalloutWidget(): Element | null {
		const el = this.containerEl;
		const widget = el.closest('.cm-embed-block.cm-callout');
		if (!widget || el.parentElement?.closest('[data-dse-element]')) return null;
		return widget;
	}

	/**
	 * SC-455: Obsidian's Live Preview draws a callout as one CodeMirror widget and hands its blocks a
	 * context whose getSectionInfo is null (measured, 1.14.4). The editor knows where the widget sits:
	 * the section is the callout's lines, starting at the document line `cm.posAtDOM(widget)` reports.
	 * Null while the widget is not attached to an editor yet (the host's construction) or is gone.
	 */
	private livePreviewCalloutSection(scope?: LivePreviewScope, linesOf: (text: string) => readonly string[] = splitLines): MarkdownSectionInformation | null {
		const widget = this.livePreviewCalloutWidget();
		if (!widget) return null;
		if (scope) {
			// SC-537: the editor update names its own view and document; ask that one only.
			if (!scope.view.dom.contains(widget)) return null;
			try {
				return calloutWindow(scope.view, widget, () => scope.text, linesOf, scope.windowEnds);
			} catch {
				return null;
			}
		}
		for (const leaf of this.plugin.app.workspace.getLeavesOfType('markdown')) {
			const view = leaf.view as MarkdownView;
			if (view.file?.path !== this.ctx.sourcePath) continue;
			const cm = (view.editor as unknown as { cm?: CmEditorView } | undefined)?.cm;
			if (!cm?.dom.contains(widget)) continue;
			try {
				return calloutWindow(cm, widget, () => view.editor.getValue(), linesOf);
			} catch {
				continue; // the widget is not in this editor's viewport / document any more
			}
		}
		return null;
	}

	/**
	 * SC-455: this block's position among the blocks of its language in its quote/callout (document
	 * order), from the DOM — what tells identical twins in one callout apart. -1 when it cannot be
	 * read (no callout, detached); the last good value is kept for a write after the section is gone.
	 */
	private domOrdinal(): number {
		const own = quoteOrdinal(this.containerEl, this.alias);
		if (own >= 0) this.lastOrdinal = own;
		return own >= 0 ? own : this.lastOrdinal;
	}

	/** SC-343: identity good enough to find the block again by its body. */
	private get hasDurableIdentity(): boolean {
		return (
			(this.sectionResolvedOnce || this.lpCalloutSeen) &&
			this.knownBody !== null &&
			this.knownLanguage !== null
		);
	}

	/** SC-343: registerFrameworkElements seeds the body the view is built from. */
	setMountedBody(source: string): void {
		this.knownBody = source;
		this.lastWrite = null;
		this.snapshotDrawn(false); // SC-607: the note as this card is drawn
	}

	/** SC-343 (BlockHost.notePersistIntent): refresh the durable position while live. */
	notePersistIntent(): void {
		// SC-552: the FIRST intent of a pending round (a click, then more clicks inside the debounce) also pins the block where it is
		// drawn at that moment - the click on the card that is on its own block. The view's debounced write, ~400 ms later, goes
		// through that pin: another block's write, an outside edit or typing in the note can make Obsidian redraw the identical
		// blocks meanwhile and hand this card's element to a twin, and the write would follow the element (SC-549). Later intents of
		// the round do not re-pin: they come after such a redraw may have happened.
		const pin = this.takePin();
		if (pin && !this.pendingPin) this.pendingPin = pin;
	}

	/** SC-552: the pin of the view's pending edit, taken at its first persist intent; consumed (and cleared) by the view's write. */
	private pendingPin: BlockPin | null = null;

	get lastKnownBody(): string | null {
		return this.knownBody;
	}

	get lastKnownLineStart(): number | null {
		return this.knownLineStart;
	}

	/** SC-481: the fence line this host's last write landed at, or null if it has not written. */
	get lastWriteLineStart(): number | null {
		return this.lastWriteLine;
	}

	/**
	 * SC-481: what a remount into this host's element needs: the element, the context Obsidian built it with and the
	 * fence label. Obsidian reuses an old section's element for a later block with the same text and calls no
	 * processor for it, so the element is still ours to fill.
	 */
	remountTarget(): { el: HTMLElement; ctx: MarkdownPostProcessorContext; alias: string } {
		return { el: this.el, ctx: this.ctx, alias: this.alias };
	}

	/**
	 * SC-481: the body of the fence this host's element sits on NOW, when that is not the block this host knows -
	 * Obsidian moved the element to another block (an identical twin below the one this host wrote) without calling a
	 * processor. null when the element is where its block is. Read-only: it does not refresh the durable position.
	 *  - the fence on the element is read by `fenceOnElement` (plain section or quote/callout window; an unterminated fence, or a
	 *    window with several blocks and no ordinal, is never judged);
	 *  - an element still on the line this host's last write landed at is the host's own block, whose rebuild has not
	 *    arrived yet (`knownBody` is ahead of the section on purpose): not reused.
	 * `linesOf` lets a caller that asks many hosts about one note split its text once. `scope` (SC-537) is the editor update that
	 * asks: a callout widget in Live Preview is then judged by the section that editor reports for it.
	 */
	reusedBlockBody(linesOf: (text: string) => readonly string[] = splitLines, scope?: LivePreviewScope): string | null {
		if (this.knownBody === null) return null;
		let section: MarkdownSectionInformation | null | undefined;
		if (scope) {
			// SC-537: the editor-driven pass (livePreviewReconcile.ts) judges Live Preview CALLOUT widgets only: they get no section from
			// Obsidian (`getSectionInfo` is null) and no processor call when their widget is handed to a twin, so the editor is asked.
			if (!this.livePreviewCalloutWidget()) return null;
			try {
				section = this.ctx.getSectionInfo(this.el);
			} catch {
				return null;
			}
			section ??= this.livePreviewCalloutSection(scope, linesOf);
			if (!section) return null;
		}
		const fence = fenceOnElement(this.ctx, this.el, this.alias, linesOf, section, scope);
		if (!fence) return null;
		if (this.lastWriteLine !== null && fence.lineStart === this.lastWriteLine) return null;
		return normalizeBody(fence.body) === normalizeBody(this.knownBody) ? null : fence.body;
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
		// SC-455: the block's own fence — for a block in a quote/callout that is inside the section, not its first line.
		if (this.ownFence) return { language: this.ownFence.language, lineStart: this.ownFence.lineStart, lineEnd: this.ownFence.lineEnd };
		const fence = parseOpenFence(section.text, section.lineStart);
		return {
			language: fence?.language ?? this.alias,
			lineStart: section.lineStart,
			lineEnd: section.lineEnd,
		};
	}

	/** SC-455: whether the last failed `replaceSource` already showed the user a Notice (BlockHost.lastWriteReported). */
	private reported = false;
	get lastWriteReported(): boolean {
		return this.reported;
	}

	/** SC-455: does the section window look like a list (a list-item line, or a fence indented 2+ spaces)? Only used to word the Notice. */
	private looksLikeList(content: string, section: MarkdownSectionInformation | null): boolean {
		if (!section) return false;
		return splitLines(content)
			.slice(section.lineStart, section.lineEnd + 1)
			.some((l) => /^[ \t]*(?:[-*+]|\d+[.)])[ \t]/.test(l) || /^ {2,}[`~]{3,}/.test(l));
	}

	/**
	 * SC-552 (BlockHost.pinPosition): the note text this host's section was read from and the line of the block's own opening fence in
	 * it, as the block is drawn now. Null while the block has no section or no readable fence of its own.
	 */
	pinPosition(): BlockPin | null {
		return this.takePin();
	}

	/**
	 * The pin of a block edit form (`pinPosition`) and of a card write (`notePersistIntent`): made exactly as before SC-584 outside an embed or
	 * hover preview. SC-594 / SC-596: inside one, both are made the same way (the host's own last write, the r7 guard below) and placed by
	 * `rebaseCardPin` (the link, never a search for the body); one that cannot be pinned at all is a refusing pin (`refusingPins`).
	 */
	private takePin(): BlockPin | null {
		const section = this.readSection();
		const embedded = this.containerEl.closest('.markdown-embed, .internal-embed') !== null;
		if (!section) return embedded ? this.refusingPin() : null;
		if (!this.ownFence) {
			// SC-584: a callout in an embed or hover preview whose part is stale (right after a + on its card) holds no block with the body this
			// host knows, so its own fence cannot be found in it; the host's own last write still says where the block is.
			// SC-594: a card write takes it too (the same stale window right after its own +).
			// SC-596: with neither (a block written by another pane, or this host's record dropped) the pin refuses: never no pin, which wrote the
			// part's line numbers and the body against the whole note and found the twin (see `refusingPins`).
			return embedded ? (this.strictIfPart(this.pinFromLastWrite()) ?? this.refusingPin()) : null;
		}
		// SC-584 r7 (r5 had it as "the fence is not the window's first line", which a quote whose FIRST line is the twin's fence defeats): unless the
		// card's section window IS its own plain fenced block (its first line is an un-prefixed fence - `findOwnFence`'s shortcut, nothing is searched),
		// the own fence above was found in the window BY BODY. A window that holds other content (callout, header-less quote, nested quote, list item,
		// footnote, ...) can hold a twin of the block, and right after a + on this card it is stale (old body), so the only block holding the body this
		// host knows can be the TWIN (two identical counters, the + made the lower one read like the upper): the form would be pinned on it. When this
		// host's own last write is of the body it knows, that write is the exact position of its block, so a form takes it instead. Record-first for
		// EVERY form was tried and refuses a CURRENT plain block after hundreds of lines changed since the + (the diff gives up; the link finds it fine),
		// hence the plain-block exception; a form in a multi-block window with an old record can refuse that way (a Notice, never a twin).
		// SC-594: a card write (a second + in a stale callout window) is pinned the same way, so it can never be written into the twin callout. LOAD-BEARING
		// (jest J19): with it gone, a second + after an outside edit that put the first block back to the old value writes the SIBLING counter of the callout.
		if (embedded) {
			const first = parseOpenFence(section.text, section.lineStart);
			if (!(first && first.prefix === '')) {
				const w = this.pinFromLastWrite();
				if (w) return this.strictIfPart(w);
			}
		}
		const pin = { text: section.text, lineStart: this.ownFence.lineStart };
		// SC-556: only a block drawn inside an embed can be given a part of the note (see rebaseCardPin); every other pin is taken as before.
		if (embedded) {
			// An embed of a WHOLE note (`![[note]]`: a link with no `#`) is given the note's own text and lines, so its pin is already a pin of the
			// note. Any other embed, and a hover preview (no `src` to tell), may be given a part: partial until `rebaseCardPin` has placed it.
			// SC-594: a hover preview of a WHOLE note is known by its recorded link (no `#`): the note as drawn, a pin of the note (`mapLine` judges every
			// edit since, so an identical block added from outside is never taken for it). A form's pin asks too (SC-596).
			const src = this.embedSrc();
			const link = src ?? hoverLinkOf(this.plugin.app, this.containerEl)?.linktext;
			if (typeof link !== 'string' || link.includes('#')) partialPins.add(pin);
			// SC-596: a form's pin is placed exactly like a card's. It used to be searched for in the note by the part's text, which finds the twin's
			// lines when the form's own block was edited from outside before the form opened.
			pinRebased.set(pin, this.rebaseCardPin(pin, section.text, this.lastWrite));
		}
		return pin;
	}

	/** SC-607: a pin of this host's own write in an embed or hover preview of PART of a note is mapped strictly (`strictPins`). */
	private strictIfPart(pin: BlockPin | null): BlockPin | null {
		if (pin === null) return null;
		const link = this.embedSrc() ?? hoverLinkOf(this.plugin.app, this.containerEl)?.linktext;
		if (typeof link !== 'string' || link.includes('#')) strictPins.add(pin);
		return pin;
	}

	/** SC-596: a pin that places nothing (see `refusingPins`). */
	private refusingPin(): BlockPin {
		const pin = { text: '', lineStart: -1 };
		partialPins.add(pin);
		refusingPins.add(pin);
		return pin;
	}

	/** SC-584: a pin of the note as this host's own last write left it, when that write is of the body this host knows now; else null. */
	private pinFromLastWrite(): BlockPin | null {
		const w = this.lastWrite;
		if (w === null || this.knownBody === null || normalizeBody(w.body) !== normalizeBody(this.knownBody)) return null;
		return { text: w.text, lineStart: w.lineStart };
	}

	/** The `src` of the embed this block is drawn in (the nearest one), or null: no embed element with a `src` (a hover preview has none). */
	private embedSrc(): string | null {
		return this.containerEl.closest('.internal-embed[src], .markdown-embed[src]')?.getAttribute('src') ?? null;
	}

	/**
	 * SC-556 / SC-594 / SC-596: the placement of a pin made inside an embed of PART of a note (`![[note#Heading]]`, `![[note#^id]]`; Reading view,
	 * Live Preview, hover preview) - a card write's pin and a block edit form's pin alike. Such a block is given only that part's text, with line
	 * numbers counted from its first line. A pin made of that is not a position in the note: mapped against the whole note every line outside the
	 * part looks like an insertion, and an identical block elsewhere can be taken for it. So the pin is rebased onto the whole note as the vault holds
	 * it now: `pin.text` becomes the note's text and the pin's line moves by where the part starts. Where it starts comes from the LINK, never from
	 * searching the note for the part's text (the part can be stale when the pin is made, a heading hover's part is the heading's BODY which an
	 * identical counter under another heading repeats, and a block edited from outside leaves its twin as the only block the text matches): the link
	 * is checked over the whole part (`cardLinkLine`). Order: the part IS the note; the link; this host's own last write (taken when the pin was
	 * made) when it is of the body known at click; else the pin stays partial and `replaceSource` writes nothing (the dropped-write Notice).
	 * SC-607: the link is not trusted alone either: the note as it is now can have another, identical block at the link (a preview whose part's text
	 * did not change is not redrawn), so the link's line is accepted only when the block the card was DRAWN from maps strictly to it (see below).
	 * Asynchronous (`cachedRead`); `replaceSource` waits for it.
	 */
	private async rebaseCardPin(pin: { text: string; lineStart: number }, sectionText: string, write: { body: string; text: string; lineStart: number; seq: number } | null): Promise<void> {
		const known = this.knownBody;
		const seqAtPin = this.drawnSeq;
		const reading = this.drawnRead;
		try {
			const file = this.plugin.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
			if (!(file instanceof TFile)) return;
			if (!partialPins.has(pin)) {
				// a pin of a WHOLE note (an embed / hover of a link with no `#`): placed as before SC-607
				const whole = await this.plugin.app.vault.cachedRead(file);
				if (whole === sectionText) return;
				if (write !== null && known !== null && normalizeBody(write.body) === normalizeBody(known)) {
					pin.text = write.text;
					pin.lineStart = write.lineStart;
				}
				return;
			}
			// SC-607: a pin of PART of a note is placed through the link as before (`cardLinkLine` on the note as it is now), and only when the block the
			// card was DRAWN from - the note read when it was mounted, or this host's own last write, whichever is newer - mapped strictly to the note as
			// it is now, is that same block. A preview whose part's text did not change is not redrawn, so the link can name another, identical block (the
			// hovered one of two identical sections deleted, two heading names swapped): refused. With no link placement (the part is stale right after
			// this host's own +), the own write alone places it, as before.
			if (reading) await reading;
			const drawn = this.drawn !== null && this.drawn.seq <= seqAtPin ? this.drawn : null;
			const own = write !== null && known !== null && normalizeBody(write.body) === normalizeBody(known) ? write : null;
			const whole = await this.plugin.app.vault.cachedRead(file);
			if (whole === sectionText) {
				partialPins.delete(pin); // the part IS the note
				strictPins.add(pin);
				return;
			}
			const linkLine = this.cardLinkLine(file, whole, sectionText, pin.lineStart, known, this.plugin.app.metadataCache.getFileCache(file));
			const drawnFrom = (): { text: string; line: number } | null => {
				if (drawn === null) return null;
				if (drawn.text === null) return { text: sectionText, line: pin.lineStart }; // the part was the whole note as drawn
				const line = this.cardLinkLine(file, drawn.text, sectionText, pin.lineStart, known, drawn.meta);
				return line === null ? null : { text: drawn.text, line };
			};
			const ownFrom = (): { text: string; line: number } | null => (own === null ? null : { text: own.text, line: own.lineStart });
			const ownFirst = own !== null && (drawn === null || own.seq > drawn.seq);
			if (linkLine !== null) {
				const fromOwn = ownFirst ? ownFrom() : null;
				const fromDrawn = fromOwn === null ? drawnFrom() : null;
				const from = fromOwn ?? fromDrawn ?? ownFrom();
				if (from === null) return; // nothing says which block the card was drawn from: refused
				// A hover preview's own record of the note it was drawn from (`hoverDrawnText`, internal API: skipped when absent) must be the note this card
				// read: the card's read comes ~100 ms after Obsidian's, and an outside edit between the two would make the card "drawn from" a note the preview
				// never showed. Only a card's MOUNT snapshot is checked (a position taken from this host's own write has no such window, an embed has no
				// popover, and a re-bind follows this host's own redraw). Measured (G-S92 (e), Obsidian 1.15.1): the record is NOT refreshed when the preview
				// is redrawn from a changed part (after a + it still holds the note as first drawn), so it is compared only while it still contains the part
				// this card was given: a part that is not in it was drawn from a newer note, which the card's own read (taken at that redraw) is.
				if (fromDrawn !== null && drawn?.text != null && !drawn.rebound && this.embedSrc() === null) {
					const shown = hoverDrawnText(this.plugin.app, this.containerEl);
					const part = sectionText.trim();
					if (shown !== null && shown !== drawn.text && part !== '' && shown.includes(part)) return;
				}
				const at = mapLineStrict(from.text, whole, from.line);
				if (at === 'gave up') {
					// The line map has no answer (more than LINE_MAP_MAX_EDITS lines changed around the block): that says nothing about the block. The link
					// places it, as before SC-607, only while no identical block exists to confuse it with: the known body occurs exactly once in the note
					// the card was drawn from and exactly once in the note now.
					const language = this.knownLanguage ?? this.alias;
					if (known === null || countByBody(from.text, language, known) !== 1 || countByBody(whole, language, known) !== 1) return;
				} else if (typeof at === 'string' || at.line !== linkLine) return; // deleted, a tie between identical blocks, or the link names another block: refused
				pin.text = whole;
				pin.lineStart = linkLine;
				partialPins.delete(pin);
				strictPins.add(pin);
				return;
			}
			const o = ownFrom();
			if (o !== null) {
				pin.text = o.text;
				pin.lineStart = o.line;
				partialPins.delete(pin);
				strictPins.add(pin);
			}
			// else: stays partial: the write is refused (replaceSource)
		} catch {
			// no readable note: the pin stays partial
		}
	}

	/**
	 * SC-594: the card's line in `whole` through the link of the part it is drawn in: the embed's `src`, or for a hover preview the link it was
	 * opened for (`hoverLinkOf`). Nothing is trusted that the note does not confirm (the metadata cache can lag):
	 *  - the link must resolve to this note; a HEADING link is placed from the note's TEXT, never from the metadata cache alone (the cache lags an
	 *    outside edit by a moment): for a hover (the part hangs from the line above it) the line the cache says the heading is on must be, in the text,
	 *    an ATX heading line of that name (no such line: refused), and while the known body occurs more than once the text must hold exactly ONE heading of that name; a `^id` link needs exactly
	 *    ONE `^id` marker line in the text while the known body occurs more than once; a unique body needs no count;
	 *  - the part's first line must be where the link starts (an embed's part includes the heading) or, for a heading link, on the line after it
	 *    (measured: the part Obsidian gives a hover card is the heading's BODY, no heading line, `lineStart` 1);
	 *  - EVERY line of the part (trailing blank lines dropped) must equal the note's lines from there: a part that differs anywhere (a block
	 *    deleted above the card, another moved onto its line) is stale and is not placed;
	 *  - a counter fence of this language must open at the card's line, holding the known body, and a `#^id` link needs its `^id` marker after it.
	 */
	private cardLinkLine(file: TFile, whole: string, sectionText: string, relLine: number, known: string | null, meta: CachedMetadata | null): number | null {
		const src = this.embedSrc();
		const hovered = src === null ? hoverLinkOf(this.plugin.app, this.containerEl) : null;
		const link = src ?? hovered?.linktext ?? null;
		if (!link) return null;
		const hash = link.indexOf('#');
		if (hash < 0) return null;
		const cache = this.plugin.app.metadataCache;
		if (!meta) return null;
		const dest = cache.getFirstLinkpathDest(link.slice(0, hash), hovered ? hovered.sourcePath : this.ctx.sourcePath);
		if (!dest || dest.path !== file.path) return null;
		const subpath = link.slice(hash);
		const start = resolveSubpath(meta, subpath)?.start?.line;
		if (typeof start !== 'number' || start < 0) return null;
		const lines = splitLines(whole);
		const blockId = subpath.startsWith('#^') ? subpath.slice(2) : null;
		const twin = known !== null && countByBody(whole, this.knownLanguage ?? this.alias, known) > 1;
		let named: number[] = [];
		if (blockId === null) {
			// the heading lines of that name in the note TEXT; the cache's line must be one of them (it is the line the part hangs from)
			const name = normalizeHeadingName(subpath.split('#').pop() ?? '');
			named = atxHeadings(lines).filter((h) => normalizeHeadingName(h.name) === name).map((h) => h.line);
		}
		if (twin) {
			if (blockId !== null) {
				const marker = new RegExp(`(^|\\s)\\^${blockId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
				if (lines.filter((l) => marker.test(l)).length !== 1) return null;
			} else if (named.length !== 1) return null;
		}
		// SC-619: Obsidian cuts a heading HOVER's part from one character after the heading line's content (measured, 1.15.1): the LF of an LF note,
		// but only the CR of a CRLF note, so the part starts with that note's stray LF and every line sits one lower. Drop it: the part is then
		// compared line for line exactly as the same LF note's part.
		const crlfHover = hovered !== null && blockId === null && sectionText.startsWith('\n') && splitWithEols(whole).eols[start] === '\r\n';
		const part = splitLines(crlfHover ? sectionText.slice(1) : sectionText);
		const rel = crlfHover ? relLine - 1 : relLine;
		const wholePart = part.slice();
		while (wholePart.length > 0 && wholePart[wholePart.length - 1].trim() === '') wholePart.pop();
		if (wholePart.length === 0) return null;
		let partStart: number | null = null;
		if (lines[start] === part[0]) partStart = start;
		else if (blockId === null && lines[start + 1] === part[0]) {
			// a hover's part is the heading's BODY: the line it hangs from (`start`) was never compared with anything, so it must be the heading's
			// own line in the note text (a cache that lags a moved, pasted or deleted section points at another section's heading or a blank line)
			if (!named.includes(start)) return null;
			partStart = start + 1;
		}
		if (partStart === null) return null;
		for (let i = 0; i < wholePart.length; i++) if (lines[partStart + i] !== wholePart[i]) return null;
		const line = partStart + rel;
		const found = this.fenceAt(whole, line);
		if (!found) return null;
		if (blockId !== null) {
			const quoted = (parseOpenFenceLine(lines[found.lineStart])?.prefix ?? '') !== '';
			const partEnd = partStart + wholePart.length - 1;
			let next = (quoted ? Math.max(found.lineEnd, partEnd) : found.lineEnd) + 1;
			while (next < lines.length && lines[next].trim() === '') next++;
			if (next >= lines.length || lines[next].trim().toLowerCase() !== `^${blockId.toLowerCase()}`) return null;
		}
		const own = blockBodyLines(part, rel, rel + (found.lineEnd - found.lineStart)).join('\n');
		return normalizeBody(found.body) === normalizeBody(known ?? own) ? line : null;
	}

	/** The fence of this host's language that opens at `line` of `content` (a closed fence, or the note's trailing fence that never closes), with its body; else null. */
	private fenceAt(content: string, line: number): { lineStart: number; lineEnd: number; body: string } | null {
		const language = this.knownLanguage ?? this.alias;
		const lines = splitLines(content);
		const fence = listFences(content, language).find((f) => f.lineStart === line);
		if (fence) return { ...fence, body: blockBodyLines(lines, fence.lineStart, fence.lineEnd).join('\n') };
		const unterminated = locateUnterminatedTrailingFence(lines, language);
		if (!unterminated || unterminated.lineStart !== line) return null;
		return { ...unterminated, body: lines.slice(unterminated.lineStart + 1, unterminated.lineEnd + 1).join('\n') };
	}

	/**
	 * SC-552: the block `pin` names, found again in `content`: the pinned fence line mapped through the changes made to the note since
	 * (`mapLine`), accepted only when a fence of this host's language opens there and holds the body this host knows. A closed fence,
	 * or the note's trailing fence that never closes (the same rule as `locateUnterminatedTrailingFence`, which `locateByBody` also
	 * considers). Null when the line was changed or removed or no such block is there. No search by body: identical twins cannot be told
	 * apart that way (SC-480), the position is what tells them apart.
	 * Identical twins (SC-612): two identical blocks with identical surroundings (separated only by blank lines): a deletion of one cannot be told from a deletion of the other - the note
	 * that is left is the same. The head-first line diff always reads the LOWER one as deleted, so (SC-556) a form on the upper block used to place its pin on the surviving block and
	 * write it, which is a different block that only looks the same. Now, while the known body occurs twice (in the note as the pin was taken, or now), the head-first answer is
	 * accepted only when it is the UNIQUE cheapest placement of the pinned block (`placedUniquely`): paired with each block of the note now whose lines are identical to it, or deleted,
	 * priced by the line edits of everything around it. A tie (or a cheaper placement elsewhere) is refused (a Notice, nothing written, the form stays open): the form's block, or the
	 * card, may have been the one deleted. The cost, accepted: an identical block added or removed next to the pinned one by an outside edit inside the form / click round is refused
	 * when the note cannot tell which was meant. Every pinned write counts the known body in two scans of the note (`twinned`); a note without identical blocks is never refused by this
	 * rule and runs no placement. Measured guarantee: on the sweep's layouts and the seeded fuzz of `reading-mode-host-whole-pin*.test.ts`, no write in a cell the oracle calls ambiguous
	 * and no refusal in one it calls unambiguous (where the pinned block still exists unedited). Residuals: a move or paste within identical blocks leaves the note text unchanged
	 * (no line map can see it), a placement the capped diff cannot price (more than `LINE_MAP_MAX_EDITS` lines changed around the block) keeps the head-first answer, and an outside edit
	 * that changes only whitespace INSIDE the pinned block (a trailing space on a body line, a blank line before the closing fence) inside the round, in a note with identical blocks,
	 * is refused: the block's lines are no longer identical to its pinned lines, so it is no candidate placement (the base saved it). Accepted: the block did change on disk, the Notice is
	 * true, nothing is written, and the next round saves.
	 * A pin is also refused when more than `LINE_MAP_MAX_EDITS` lines changed on both sides of the block (see lineMap.ts).
	 */
	private pinnedTarget(content: string, pin: BlockPin): { lineStart: number; lineEnd: number } | null {
		if (partialPins.has(pin)) return null; // SC-556: a pin in an embedded part's coordinates is not a place in the note
		const line = mapLine(pin.text, content, pin.lineStart);
		if (line === null) return null;
		// SC-607: the head-first map reads the LOWER of two identical blocks as deleted; a pin placed in the note as drawn must not depend on that tie
		if (strictPins.has(pin) && mapLineFromTail(pin.text, content, pin.lineStart) !== line) return null;
		// SC-612: a pin of a block that has an identical twin (in the note as pinned or now) is placed only on the unique cheapest placement
		if (this.twinned(content, pin) && !this.placedUniquely(content, pin, line)) return null;
		const fence = this.fenceAt(content, line);
		if (!fence) return null;
		if (this.knownBody !== null && normalizeBody(fence.body) !== normalizeBody(this.knownBody)) return null;
		return { lineStart: fence.lineStart, lineEnd: fence.lineEnd };
	}

	/** The closed fences of this host's language in `text`, and the note's trailing fence that never closes (as `fenceAt` reads them), as [first line, last line]. */
	private blockSpans(text: string): Array<[number, number]> {
		const language = this.knownLanguage ?? this.alias;
		const out: Array<[number, number]> = listFences(text, language).map((f) => [f.lineStart, f.lineEnd]);
		const unterminated = locateUnterminatedTrailingFence(splitLines(text), language);
		if (unterminated) out.push([unterminated.lineStart, unterminated.lineEnd]);
		return out;
	}

	/**
	 * SC-612: whether `line` (where the head-first map put the pinned block) is the one cheapest placement of that block in `content`. A placement is the block paired with a block of
	 * `content` whose lines are identical to it, or the block deleted; its cost is the line edits (`editDistance`) of everything before the block plus everything after it, plus the block's
	 * own lines when deleted. False when another placement costs the same or less (a tie: the note reads the same whichever block was meant) or `line` is no such block. True when the
	 * block is not a fence of the note as pinned, or the capped diff cannot price `line` (more than LINE_MAP_MAX_EDITS lines changed around it): the head-first answer stands. A placement
	 * that cannot cost at most the cost of `line` is dropped without pricing it (its distance is capped there, and the line counts between the block and the ends bound it from below).
	 */
	private placedUniquely(content: string, pin: BlockPin, line: number): boolean {
		const A = splitLines(pin.text);
		const B = splitLines(content);
		const own = this.blockSpans(pin.text).find(([first]) => first === pin.lineStart);
		if (!own) return true;
		const [s, e] = own;
		const blk = A.slice(s, e + 1);
		const pre = A.slice(0, s);
		const suf = A.slice(e + 1);
		const same = this.blockSpans(content).filter(([q, qe]) => qe - q === e - s && blk.every((l, i) => B[q + i] === l));
		const here = same.find(([q]) => q === line);
		if (!here) return false;
		const around = ([q, qe]: [number, number], cap: number): number | null => {
			const before = editDistance(pre, B.slice(0, q), cap);
			if (before === null) return null;
			const after = editDistance(suf, B.slice(qe + 1), cap - before);
			return after === null ? null : before + after;
		};
		const best = around(here, LINE_MAP_MAX_EDITS);
		if (best === null) return true;
		for (const span of same) {
			if (span === here) continue;
			if (Math.abs(span[0] - s) + Math.abs(B.length - 1 - span[1] - (A.length - 1 - e)) > best) continue;
			const cost = around(span, best);
			if (cost !== null && cost <= best) return false;
		}
		if (blk.length > best) return true;
		const gone = editDistance([...pre, ...suf], B, best - blk.length);
		return gone === null || gone + blk.length > best;
	}

	/** SC-480: another block holds this block's body, in the note as the pin was taken (`pin.text`) or in `content` now. */
	private twinned(content: string, pin: BlockPin): boolean {
		if (this.knownBody === null || this.knownLanguage === null) return false;
		return countByBody(pin.text, this.knownLanguage, this.knownBody) > 1 || countByBody(content, this.knownLanguage, this.knownBody) > 1;
	}

	/**
	 * SC-480: whether `target` (a block of `content`, the note now) is a block that already existed in the note as the pin was taken
	 * (`pin.text`) at another line than the pinned one: the line diff carries its fence line back to a different, unchanged line. A
	 * block that was moved or is new maps to nothing (null) and stays allowed; so does a pin line that is no fence in `pin.text`
	 * (nothing to compare with), a partial (embed) pin, a note changed past the diff's limit (the count rule decides there), and a
	 * neighbour that is still in the note somewhere (swapped / reordered blocks).
	 */
	private landsOnOtherBlock(content: string, pin: BlockPin, target: { lineStart: number }): boolean {
		if (partialPins.has(pin) || this.fenceAt(pin.text, pin.lineStart) === null) return false;
		const back = mapLine(content, pin.text, target.lineStart);
		if (back === null || back === pin.lineStart) return false;
		// The diff pairs identical fence lines, so a block that was moved or swapped can map back onto a neighbour's old line. The target is
		// that neighbour only when the neighbour as clicked (the block that stood at `back`) is no longer anywhere in the note. Known
		// corner case, accepted: a bumped neighbour whose old body still exists elsewhere in the note lets the write through; and a
		// block moved into the place of a deleted neighbour reads the same as "deleted, neighbour rewritten to match", so it is refused.
		const other = this.fenceAt(pin.text, back);
		if (!other || this.knownLanguage === null) return true;
		return countByBody(content, this.knownLanguage, other.body) === 0;
	}

	async replaceSource(newSource: string, options?: BlockWriteOptions): Promise<boolean> {
		this.reported = false;
		if (options?.pin) await pinRebased.get(options.pin); // SC-556: a section pin is rebased onto the whole note first (rebaseCardPin)
		// SC-552: the view's own write is placed through the pin its round's first click took (a form's Save brings its own).
		const pin = options?.pin ?? (options?.fromView === true ? this.pendingPin : null);
		if (options?.fromView === true) this.pendingPin = null;
		// SC-594: a card's pin is rebased onto the note (rebaseCardPin) before the write, awaited only when there is one: an unconditional
		// await moves every other write a tick later (it broke the SC-340 / SC-544 ordering of a view's write against its siblings').
		const cardRebase = pin && !options?.pin ? pinRebased.get(pin) : undefined;
		if (cardRebase) await cardRebase;
		if (!this.canPersist) return false;

		const abstractFile = this.plugin.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
		if (!(abstractFile instanceof TFile)) {
			// SC-455: the note is gone (deleted / renamed mid-write): never a silent false.
			const name = this.ctx.sourcePath.split('/').pop()?.replace(/\.md$/, '') ?? this.ctx.sourcePath;
			notifyUnsavableWrite(this.ctx.sourcePath, name, false, Date.now(), options?.fromView !== true);
			this.reported = true;
			return false;
		}

		// SC-544: every other view of this note with an edit still in its debounce writes first. This write's rebuild hands Obsidian's old
		// element of a block to an identical twin below it, and that includes the element of a view that still has an edit pending (a
		// second click inside the first block's 400 ms window); flushed after the rebuild, that edit would be placed through the twin's
		// block. Flushed here, each pending edit is placed while its element still sits on its own block. Synchronous: every one of
		// them reads its section before any Vault.process of this round runs. They are written in the order their views were mounted, once each, and this write comes last (a sibling's own
		// nested call returns at once, so it never flushes this writer's own waiting view), and the Vault.process calls then chain.
		this.registry?.flushPendingWrites(this.ctx.sourcePath, this.entry);

		// Captured immediately before entering Vault.process, with nothing async in between.
		// SC-343: it is only a HINT now — resolveWriteTarget re-validates it against the live
		// content inside the callback and falls back to the durable locate when it is stale.
		const section = this.readSection();

		const inEmbed = this.containerEl.closest('.markdown-embed, .internal-embed') !== null;
		let wrote = false;
		let dropped = false;
		let unplaceable = false;
		let listShape = false;
		let changedContent = false;
		let settled = false;
		// SC-340 §6.2: the claim ticket must exist before Vault.process — Obsidian fires
		// `modify` inside it and runs the new section's processor right after. Task 4 review
		// (carried fix): kept so it can be dropped below if this write changes nothing — a
		// no-op write causes no rebuild, so an uncollected ticket would otherwise linger up to
		// CLAIM_WINDOW_MS and could let claim() hand this view to an unrelated rebuild of an
		// identical-body TWIN block.
		//
		// SC-509: only the VIEW's own write earns a ticket. A write from anywhere else (the block
		// edit form's Save, the hero's "Edit definition") is not content the live view holds, so
		// adopting it on the rebuild would put the OLD root and model back and the card would keep
		// showing the old content. Without a ticket `claim()` misses and the section is built
		// fresh from the saved body, exactly like an external edit. (`knownBody` upkeep below and
		// the SC-478 scroll pin do not depend on the ticket and run for both kinds of write.)
		const ticket =
			options?.fromView === true && this.entry && this.registry ? this.registry.noteWrite(this.entry, newSource) : null;
		try {
			await this.plugin.app.vault.process(abstractFile, (content) => {
				// SC-552: a pinned write goes to the pinned block when it can still be found. If it cannot: today's placement (the view's
				// own debounced write, which has a card behind it), or - for a caller that asked for `pinOnly`, which every block edit
				// form's Save does (SC-556) - nowhere (the block changed on disk first).
				if (pin !== null && refusingPins.has(pin)) {
					unplaceable = true; // SC-596: a block in an embed / hover preview that could not be pinned writes nothing
					listShape = this.looksLikeList(content, section);
					return content;
				}
				const pinned = pin ? this.pinnedTarget(content, pin) : null;
				if (pinned) this.knownLineStart = pinned.lineStart;
				// SC-480: a card write whose pin missed falls back to today's placement only when its block's body was unique in the note as
				// clicked (pin.text) and is unique now; with an identical twin the pin was the only identity, so nothing is written (the
				// dropped-write Notice) rather than a click landing in a block the user never touched. Evaluated on a miss only; a write
				// with no pin at all keeps today's path.
				const twinned = !pinned && pin !== null && !options?.pinOnly && this.twinned(content, pin);
				// SC-594: a card write whose pin is still in the part's coordinates has no place in the note: refused, never `twinned` /
				// `resolveWriteTarget` (a search by body that picks the twin when the part's text occurs twice).
				const partialCard = !pinned && pin !== null && (partialPins.has(pin) || strictPins.has(pin));
				let target = pinned ?? (pin && (options?.pinOnly || twinned || partialCard) ? 'miss' : this.resolveWriteTarget(content, section));
				// SC-480: the same refusal when the fallback lands in a block that was already a different block in the note as clicked (one
				// outside edit deleted the clicked block and made a neighbour read the same: the counts above see one block each time).
				if (!pinned && pin !== null && !options?.pinOnly && typeof target === 'object' && this.landsOnOtherBlock(content, pin, target)) target = 'miss';
				if (target === 'abort') {
					unplaceable = true; // SC-455: a write that cannot land is never silent
					listShape = this.looksLikeList(content, section);
					return content;
				}
				if (target === 'miss') {
					dropped = true;
					return content;
				}
				// SC-453: the splice re-emits the block in the note's own line ending.
				// SC-455: and with the block's own quote/callout prefix on every line it writes.
				const next = replaceFenceBlock(content, target.lineStart, target.lineEnd, newSource);
				if (next === null) {
					unplaceable = true; // resolveWriteTarget guarantees an open fence; defensive
					return content;
				}
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
				this.lastWriteLine = target.lineStart; // SC-481
				// SC-584: where this write put the block, in the note as it leaves (only a host drawn in an embed or hover preview needs it).
				this.lastWrite = null;
				if (inEmbed && this.fenceAt(next, target.lineStart) !== null) this.lastWrite = { body: newSource, text: next, lineStart: target.lineStart, seq: ++this.drawnSeq };
				changedContent = next !== content;
				// SC-198: hold the preview's height across the rebuild this write is about to
				// provoke (only meaningful while the block is on screen, i.e. its section
				// resolves). SC-260: decided HERE, not before Vault.process — a write whose result
				// is byte-identical to the disk is no-opped by Obsidian (no `modify`, no rebuild),
				// so a pin taken for it would hold phantom scroll space for the full PIN_TTL_MS.
				// Still synchronous inside the callback, i.e. before Obsidian writes and so before
				// the rebuild. `pin` is fail-safe by construction, but it now runs AFTER
				// `knownBody = newSource`: a throw here would abort the write and leave knownBody
				// ahead of the disk, so a pin failure is contained (warn, write proceeds).
				if (section && changedContent) {
					try {
						this.scrollPin?.pin(this.containerEl);
					} catch (err) {
						console.warn('[DSE] scroll pin failed; continuing with the write', err);
					}
				}
				return next;
			});
			settled = true;
		} finally {
			// Fix round 1 (I-1): a REJECTED vault.process (file deleted/renamed mid-write, I/O
			// error, a throw in the callback) must not leave the ticket live for
			// CLAIM_WINDOW_MS either — exactly the hazard carried fix 1 closed for a normal
			// no-op return, just reached via an exception instead. `finally` runs on both the
			// normal path and the rejection path; the rejection itself still propagates out of
			// replaceSource unchanged (SC-350 owns making it not reject at all).
			if (ticket && this.entry && this.registry && (!settled || !wrote || !changedContent)) {
				this.registry.dropTicket(this.entry, ticket);
			}
		}
		// SC-556: only the view's own (card) write is rate limited; a form's Save always says why it wrote nothing - exactly one
		// Notice, and `reported` tells the form not to add its own.
		const userSave = options?.fromView !== true;
		if (dropped) notifyDroppedWrite(this.ctx.sourcePath, abstractFile.basename, Date.now(), userSave);
		if (unplaceable) notifyUnsavableWrite(this.ctx.sourcePath, abstractFile.basename, listShape, Date.now(), userSave);
		this.reported = dropped || unplaceable;
		return wrote;
	}

	/**
	 * SC-343: where this write goes, decided from the LIVE content inside Vault.process.
	 *  - the section range, when it still holds our block (opening fence, closing fence or
	 *    an unterminated fence running to the last line, and the body we last knew);
	 *  - else, with a durable identity, the block found by that body nearest the last line;
	 *  - 'miss' when the identity exists but nothing matches (dropped + Notice);
	 *  - 'abort' when the block cannot be placed at all — no readable fence at the section, no
	 *    identity, or a callout's identical twins that cannot be told apart (SC-455: this used to
	 *    be a silent no-write; the caller now says so with a Notice).
	 */
	private resolveWriteTarget(
		content: string,
		section: MarkdownSectionInformation | null,
	): { lineStart: number; lineEnd: number } | 'abort' | 'miss' {
		if (section) {
			const lines = splitLines(content);
			const { lineStart, lineEnd } = section;
			const openFence = parseOpenFence(content, lineStart);
			if (!openFence || openFence.prefix !== '') {
				// SC-455: the section is a quote/callout (or a list, or something else whose first line is no
				// plain fence): find this block's own fence inside the window.
				const found = locateInSection(content, section, this.alias, this.knownBody, this.domOrdinal(), this.knownLineStart);
				if (found === 'ambiguous') return 'abort';
				if (found) {
					this.knownLineStart = found.lineStart;
					return found;
				}
			}
			const openOk = openFence !== null && openFence.prefix === '';
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
			// not only an exact match to the last line. SC-477: measured on Obsidian 1.14.4, an
			// unterminated fence's lineEnd IS the note's last line, blank / whitespace-only tail
			// included (the tolerance is for a range that stops short of it).
			const unterminatedAtEof = !closeOk && !hasCloseInRange && lines.slice(lineEnd + 1).every((l) => l.trim() === '');
			const bodyEnd = unterminatedAtEof ? lineEnd + 1 : lineEnd;
			const bodyOk =
				this.knownBody === null ||
				normalizeBody(lines.slice(lineStart + 1, bodyEnd).join('\n')) === normalizeBody(this.knownBody);
			if (openOk && (closeOk || unterminatedAtEof) && bodyOk) {
				if (!unterminatedAtEof) return { lineStart, lineEnd };
				// SC-477: the splice replaces [lineStart, lineEnd] and the close fence takes the terminator of the
				// lineEnd line, so the range stops at the last non-blank line - the note's trailing newline(s) / blank /
				// whitespace-only lines stay after the new close fence, exactly as on the durable path.
				return { lineStart, lineEnd: lastNonBlankLine(lines, lineStart, lineEnd) };
			}
		}
		if (!this.hasDurableIdentity) return 'abort';
		const located = locateByBody(content, this.knownLanguage!, this.knownBody!, this.knownLineStart);
		if (located === 'ambiguous') return 'abort';
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
