// D8 Task 2 (spec §1.5) — block addressing without `getSectionInfo`. The sidebar has no
// MarkdownPostProcessorContext, so it can't get block identity for free the way
// ReadingModeBlockHost does; instead every block bound to the sidebar carries a durable
// `_dse_anchor: <id>` line inside its YAML body (round-trips through `serialize` for free
// as long as an element's model passes the key through — see the caveat in
// SidebarBlockHost.ts's file header). `findAnchoredBlock` re-derives the fence position by
// scanning for it, so it survives arbitrary line drift elsewhere in the note (unlike
// reading-mode's lineStart-keyed SessionStore) — the id travels IN the content, not
// alongside it.
import type { BlockInfo } from '../host/BlockHost';

/** Exported so `framework/pipeline.ts`'s `prepareModel` can exclude this exact key from
 *  what SCHEMA VALIDATION sees (D7 Task 10 finding — see that file's own doc for the
 *  full rationale: an `additionalProperties: false` element schema has no way to "know"
 *  about this sidebar-only key, so the two files must never drift on its spelling). */
export const ANCHOR_KEY = '_dse_anchor';
const ANCHOR_LINE = new RegExp(`^${ANCHOR_KEY}:\\s*['"]?([A-Za-z0-9_-]+)['"]?\\s*$`, 'm');

/** A fence-marker line: 3+ backticks/tildes (captured), then the rest of the line — the
 *  info string for an opener, or (after trimming) empty for a closer. Exported so
 *  registration.ts's `aliasAtLine` (a live-Editor, prefix-scan variant of the same
 *  open/close matching — see that function's doc for why it can't just call the
 *  content-string scanner below) shares this single regex instead of carrying its own
 *  copy; the two files must never test "is this a fence marker line" two different ways. */
export const FENCE_LINE = /^([`~]{3,})(.*)$/;

/** Small non-crypto id generator (Math.random-based — mobile-safe, no `crypto` node
 *  module; F1/D8 convention for anything that doesn't need cryptographic uniqueness). */
function generateAnchorId(): string {
	return Math.random().toString(16).slice(2, 8).padEnd(6, '0');
}

/** Finds an existing `_dse_anchor:` line in `body`, or appends a fresh one. Pure string
 *  op — `body` is a fenced block's BODY text (no fences), never the whole note. */
export function ensureAnchor(body: string): { body: string; id: string } {
	const existing = readAnchor(body);
	if (existing) return { body, id: existing };

	const id = generateAnchorId();
	const trimmed = body.replace(/\s+$/, '');
	const newBody = trimmed.length > 0 ? `${trimmed}\n${ANCHOR_KEY}: ${id}` : `${ANCHOR_KEY}: ${id}`;
	return { body: newBody, id };
}

/** Reads the `_dse_anchor:` value out of a block body, or null if absent/malformed. */
export function readAnchor(body: string): string | null {
	const match = ANCHOR_LINE.exec(body);
	return match ? match[1] : null;
}

/**
 * Scans `content` (a whole note's text) top-down for a ```` ```<alias> ```` (or
 * `~~~`-fenced) block whose body contains `_dse_anchor: <id>`. Returns the fence's
 * position (fence lines inclusive), or null when no such block exists — the caller (the
 * sidebar host) reads that as "not addressable right now" (block deleted/renamed/note
 * edited out from under the panel), never throws.
 *
 * Fences don't nest (CommonMark): a full top-down scan threading open/close state is used
 * rather than a naive "first fence-looking line" walk, so a fence-marker-looking line
 * inside an open block's own content (wrong char, too short, or carrying an info string)
 * is correctly treated as literal content instead of a spurious close.
 */
export function findAnchoredBlock(content: string, alias: string, id: string): BlockInfo | null {
	for (const block of iterateFences(content, alias)) {
		if (readAnchor(block.body) === id) return block.info;
	}
	return null;
}

/**
 * The un-anchored counterpart: the FIRST ```` ```<alias> ```` (or `~~~`) block in `content`,
 * regardless of whether it already carries an anchor — `listFences(content, alias)[0]`.
 * `sendToSidebar` (spec §1.7) computes `listFences` itself for the ambiguity check and reuses
 * that array rather than calling this a second time, but this is the small standalone form
 * for any caller that just wants "the first one" (e.g. a future no-cursor entry point).
 */
export function findFirstFence(content: string, alias: string): BlockInfo | null {
	return listFences(content, alias)[0] ?? null;
}

/**
 * Every ```` ```<alias> ```` (or `~~~`) block in `content`, top-down, in encounter order.
 * `sendToSidebar` uses the length of this to decide whether picking "first" is actually
 * ambiguous (worth a `Notice`) — see registration.ts.
 */
export function listFences(content: string, alias: string): BlockInfo[] {
	return [...iterateFences(content, alias)].map((block) => block.info);
}

/**
 * The ```` ```<alias> ```` (or `~~~`) block whose fence lines (inclusive) contain `line`,
 * or null when `line` doesn't sit inside one. Used by `sendToSidebar` (spec §1.7 / review
 * finding #3) to bind the occurrence nearest the cursor rather than always the first, when
 * a note has multiple blocks sharing the same alias.
 */
export function findFenceAtLine(content: string, alias: string, line: number): BlockInfo | null {
	for (const info of listFences(content, alias)) {
		if (line >= info.lineStart && line <= info.lineEnd) return info;
	}
	return null;
}

/** Matches a fence-marker line, trimming the rest-of-line into either the info string or
 *  empty. Null when `line` isn't a fence marker at all. Exported (with `isFenceClose`
 *  below) so registration.ts's `aliasAtLine` — a live-Editor, prefix-scan variant of this
 *  same open/close matching, needed because it must recognize a fence that's open but
 *  not yet closed (the cursor sitting inside a block the user is still typing) — builds
 *  its open/close test on the exact same primitives instead of a second hand-rolled copy. */
export function matchFenceLine(line: string): { marker: string; rest: string } | null {
	const match = FENCE_LINE.exec(line);
	return match ? { marker: match[1], rest: match[2].trim() } : null;
}

/** True when `line` is a valid CLOSE for a fence opened with `open` — same character,
 *  at least as long, and carrying no info string of its own (a bare close). */
export function isFenceClose(open: { fenceChar: string; fenceLen: number }, line: string): boolean {
	const match = matchFenceLine(line);
	return !!match && match.rest === '' && match.marker[0] === open.fenceChar && match.marker.length >= open.fenceLen;
}

/**
 * Shared fence scanner: yields every CLOSED fence block found in `content`, top-down, with
 * its alias/position/body text, regardless of alias — `findAnchoredBlock`/`listFences`
 * filter by alias afterward. Uniform bracket matching (review finding #4, CRITICAL): opens
 * on ANY fence-marker line, whatever its language token, and only treats the region as
 * closed when a bracket-matching close (same char, length >= open length, no info string)
 * is found — mirroring registration.ts's `aliasAtLine`. This is what makes a
 * fence-marker-looking line INSIDE an already-open region (wrong char, too short, or
 * carrying an info string — e.g. a `_dse_anchor`-lookalike nested in an unrelated
 * ` ```md ` example fence) correctly opaque body content instead of being individually
 * tested and matched: the forward search below only ever calls `isFenceClose` on body
 * lines, never `matchFenceLine`-as-an-opener, so a nested "```ds-counter" body line can
 * never re-open state mid-region.
 *
 * A fence-open that never finds a valid close before EOF is NOT treated as opaque through
 * to EOF (that would let one malformed/truncated fence anywhere earlier in the note
 * permanently hide every real block after it — the second consequence flagged by finding
 * #4). Instead that single candidate open is abandoned (treated as ordinary content) and
 * the scan resumes on the very next line, so a later well-formed block is still found.
 */
function* iterateFences(content: string, alias: string): Generator<{ info: BlockInfo; body: string }> {
	const lines = content.split('\n');
	let i = 0;
	while (i < lines.length) {
		const openMatch = matchFenceLine(lines[i]);
		if (!openMatch) {
			i++;
			continue;
		}
		const open = { fenceChar: openMatch.marker[0], fenceLen: openMatch.marker.length, alias: openMatch.rest };
		let j = i + 1;
		while (j < lines.length && !isFenceClose(open, lines[j])) j++;
		if (j >= lines.length) {
			// Unterminated — lenient recovery, see doc above: don't abandon the whole
			// scan, just this one candidate open.
			i++;
			continue;
		}

		if (open.alias === alias) {
			yield { info: { language: open.alias, lineStart: i, lineEnd: j }, body: lines.slice(i + 1, j).join('\n') };
		}
		i = j + 1;
	}
}
