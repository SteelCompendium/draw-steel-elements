// Plan 15 Tasks 3-4 (D9 §2.2 + §5.1) — shared fence-scanning machinery. Two EditorSuggests
// need "is line N inside an already-opened fence" state: the /ds scaffolder (suppress
// itself inside ANY fence, regardless of language — accepting mid-fence would corrupt
// whatever block the cursor sits in) and the in-fence key/enum DsSchemaSuggest (needs to
// know not just IF the cursor is inside a fence but WHICH ds-* language it opened with).
// One scanner, two consumers — extracted here (rather than duplicated) to avoid drift.
//
// SC-687 adds a second question next to that one, `placeOfLine` / `insertRefusal` (below): not "is this line inside a fence the scaffolder may
// not offer itself in" but "would a block WRITTEN at this position land inside existing structure" — a fence of any kind (backtick or tilde,
// quoted, indented under a list item, 4+ spaces included) or the note's properties. It shares the fence-open / fence-close rules with
// `scanFenceState` (`openFenceOf`, `closesFence`) and leaves `scanFenceState` itself as it was, so the two suggesters trigger exactly where
// they did (SC-676 will move them onto `placeOfLine`).
import type { Editor, EditorPosition } from 'obsidian';
import { fenceLanguage, quoteMarkersOf, stripBlockPrefix } from '../framework/host/blockPrefix';
import { columnAfter, listItemOf } from './listItem';

// A fence-marker line: an optional Obsidian callout/blockquote prefix (one or more `> `,
// e.g. nested callouts), up to 3 leading spaces (CommonMark still treats that as
// unindented), then 3+ backticks OR 3+ tildes (captured — group 1), then the rest of the
// line (group 2: the info string for an opener, or nothing for a closer).
const BQ_PREFIX = String.raw`(?:>\s?)*`;
const LEADING_WS = '[ ]{0,3}';
export const FENCE_LINE = new RegExp(`^${BQ_PREFIX}${LEADING_WS}(\`{3,}|~{3,})(.*)$`);

export interface FenceState {
	/** True if `line` sits inside an already-opened fence (any language). */
	inFence: boolean;
	/** The opening fence's language: the first whitespace-delimited token of its info string, case kept (e.g. "ds-roll", "js", ""; Obsidian only dispatches an exact-case match). Null when not inside a fence. */
	lang: string | null;
}

/**
 * Scans top-down from the start of the document through (not including) `line`, threading
 * fence open/close state. This is deliberately a full top-down scan, not a walk-upward
 * first-match: fences don't nest in CommonMark, so "am I inside a fence" is state that must
 * be threaded from the top — walking upward and stopping at the nearest fence-looking line
 * can mis-clear that state when an unclosed fence is followed, further down but still above
 * the cursor, by a fence-looking line that isn't actually a valid closer for it (wrong
 * marker char, too short, or carrying an info string) — that line is just literal content of
 * the still-open fence, not a real close. A real closer must match the opener's marker
 * character and be at least as long (mirrors CommonMark: ```` ``` ```` can't close ` ```` `,
 * and a tilde fence only closes with tildes).
 */
export function scanFenceState(editor: Editor, line: number): FenceState {
	let open: FenceRun | null = null;
	for (let i = 0; i < line; i++) {
		const m = FENCE_LINE.exec(editor.getLine(i));
		if (!m) continue;
		if (!open) open = openFenceOf(m[1], m[2]);
		else if (closesFence(open, m[1], m[2])) open = null;
		// else: a fence-marker-looking line while already inside an open fence, but it
		// doesn't validly close it (wrong char, too short, or has an info string) — treat
		// it as literal content and keep scanning in the current state.
	}
	return { inFence: open !== null, lang: open?.lang ?? null };
}

/** An open fence: its marker character and length (a closer must match / reach them) and its language. */
interface FenceRun {
	char: string;
	len: number;
	lang: string;
}

/**
 * The fence a marker line opens (`marker` is the run of backticks / tildes, `rest` what follows it), or null when the line opens none.
 * SC-476: CommonMark forbids a backtick in a BACKTICK fence's info string, so ```` ```ds-stamina-bar `x` ```` is paragraph text, not an
 * opener (tilde fences may carry backticks). The block's type is the FIRST token of the info string (```` ```ds-counter extra ```` is a
 * ds-counter), by the one rule the rest of DSE uses (SC-457 `fenceLanguage`: leading spaces and tabs only are skipped, so a no-break space
 * before the name gives no type, as in Obsidian). Case is kept: Obsidian dispatches a block to its processor by exact language, so
 * ```` ```DS-Stamina-Bar ```` never renders.
 */
function openFenceOf(marker: string, rest: string): FenceRun | null {
	if (marker[0] === '`' && rest.includes('`')) return null;
	return { char: marker[0], len: marker.length, lang: fenceLanguage(rest, marker[0]) };
}

/** A real closer matches the opener's marker character, is at least as long and carries no info string (mirrors CommonMark). */
function closesFence(open: FenceRun, marker: string, rest: string): boolean {
	return marker[0] === open.char && marker.length >= open.len && rest.trim() === '';
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// SC-687 — where a block written at a position would land.

/** What a line of the note is, for a block written on it. `markerStart` / `markerEnd` are indexes into the line text (CR stripped). */
export type LinePlace =
	| { kind: 'outside' }
	/** The note's properties (line 0 `---` through the closing `---`; an unclosed `---` is not properties, see `propertiesOf`). */
	| { kind: 'properties'; role: 'open' | 'body' | 'close'; markerStart: number; markerEnd: number }
	/** A fenced block (any language): its opening line, a body line, or its closing line. `lang` is the opener's (see `scanFenceState`). */
	| { kind: 'fence'; role: 'open' | 'body' | 'close'; lang: string; markerStart: number; markerEnd: number };

/** Why an insert at a position is refused: it would write into an existing fenced block, or into the note's properties. */
export type InsertRefusal = 'block' | 'properties';

const FENCE_RUN_LINE = /^([ \t]*)(`{3,}|~{3,})(.*)$/;
// A line that starts a block of its own and is never a lazy paragraph continuation: an ATX heading or a thematic break (a fence line and a list item are read separately).
const NOT_PARAGRAPH = /^[ ]{0,3}(?:#{1,6}(?:[ \t]|$)|([-*_])(?:[ \t]*\1){2,}[ \t]*$)/;
const FENCE_RUN_AFTER_ITEM = /^(`{3,}|~{3,})(.*)$/;
const OUTSIDE: LinePlace = { kind: 'outside' };
const noCr = (line: string | undefined): string => (line ?? '').replace(/\r$/, '');

/**
 * The note's properties for the guard: line 0 is exactly `---` (no leading or trailing whitespace; `----` is a rule) and the properties end at
 * the first later line of `---` and whitespace only (`--- ` closes; `----`, ` ---`, `---x` and a YAML `...` do not), as Obsidian's EDITOR reads
 * them (Live Preview and Source mode, measured in Obsidian 1.14.4, SC-687). YAML validity does not matter (`a: [` is properties) and neither does
 * the metadata cache (it lags the editor and disagrees on `----` and an empty pair). Only a CLOSED pair counts: an unclosed line-0 `---` is
 * not properties here, although the editor styles everything below it as properties and Live Preview draws no block there (Reading view does
 * draw one): an insert below it damages no structure that exists in any view, and refusing the whole note would be a broad false refusal (SC-687
 * O8). `end` is the line of the closing `---`.
 */
function propertiesOf(lines: readonly string[]): { end: number } | null {
	if (noCr(lines[0]) !== '---') return null;
	for (let i = 1; i < lines.length; i++) if (/^---\s*$/.test(noCr(lines[i]))) return { end: i };
	return null;
}

/**
 * A line that does not carry the whole quote prefix of the quoted fence it follows (fewer `>` markers, or none): does it end that fence? Yes when,
 * after the markers it does have, it is blank (a blank line, or a bare shallower `>`) or a fence marker line at the left margin (indent <= 3); that
 * line is then read fresh, so a fence line opens a fence of its own at the shallower depth (measured, Reading view, r3 / r5: `> > ```js⏎> > a⏎> ```⏎> > b⏎> > ```⏎> c`
 * is a depth-2 fence closed by the depth-1 fence line, whose own fence then runs over the rest of that quote).
 */
function endsQuotedFence(text: string): boolean {
	const rest = text.slice(quoteMarkersOf(text).length);
	if (rest.trim() === '') return true;
	const run = FENCE_RUN_LINE.exec(rest);
	return run !== null && columnAfter(run[1]) <= 3;
}

/**
 * What line `target` of the note (`lines`, one entry per line, no line breaks) is: outside everything, in the properties, or a part of a fenced
 * block, with where the fence marker sits on an opening / closing line. Scans top-down like `scanFenceState`, threading the open fence, plus:
 *   - the properties are skipped over (a fence marker in them is YAML text);
 *   - a fence in a quote (`> ```ds-ct`, any depth) is open while its lines carry the quote prefix. A line without it ends the fence only when
 *     it is blank or a fence marker line, after its own (fewer) quote markers (`endsQuotedFence`); any other line stays in the code (measured, see the comment there);
 *   - a fence indented under a list item is seen at any indentation that sits at the item's text column up to 3 columns further (the indent
 *     `planBlockInsert` writes under `- `, `1. `, `10. `, nested bullets, a list item inside a callout), with a stack of the open items'
 *     text columns; 4+ columns past the item (or past nothing, at the top level) is an INDENTED CODE block in CommonMark, where a fence marker
 *     is literal text, and is not a fence here. A line's own tabs and the items' text columns are both read with CommonMark's tab stops
 *     (`ListItemStart.readColumn`; a tab-indented fence under a nested bullet, Obsidian's default list indentation, is seen; measured, r5).
 *     A fence can also open on the item's own line (`- ```js`);
 *     (a line less indented than the item's text ends it, unless it is a paragraph line directly under the item's paragraph: lazy continuation);
 *   - an unclosed fence runs to the end of the note (a fence indented under a list item too: Live Preview keeps drawing it as code to the end,
 *     even past an unindented line or an unindented ```` ``` ````, measured, so a closer under a list item must sit at the item's text column or
 *     further in).
 * A closer is a line of the opener's marker character, at least as long, with nothing after it but whitespace (`closesFence`), at the same
 * quote depth, and indented at most 3 columns past the container.
 */
export function placeOfLine(lines: readonly string[], target: number): LinePlace {
	const props = propertiesOf(lines);
	if (props && target <= props.end) {
		const role = target === 0 ? 'open' : target === props.end ? 'close' : 'body';
		return { kind: 'properties', role, markerStart: 0, markerEnd: 3 };
	}
	let open: (FenceRun & { prefix: string; listColumn: number }) | null = null;
	let items: number[] = []; // text columns of the list items the lines above are in, outermost first
	let itemsDepth = 0; // quote depth `items` was read at
	let lazy = false; // the line above is a paragraph line inside an item, so an unindented line below it continues that paragraph
	for (let i = props ? props.end + 1 : 0; i <= target; i++) {
		const text = noCr(lines[i]);
		if (open) {
			const body = stripBlockPrefix(text, open.prefix);
			if (body !== null) {
				const at = text.length - body.length;
				const run = FENCE_RUN_LINE.exec(body);
				const indent = run ? columnAfter(run[1]) : 0;
				if (run && indent >= open.listColumn && indent - open.listColumn <= 3 && closesFence(open, run[2], run[3])) {
					const { lang } = open;
					open = null;
					if (i === target) return { kind: 'fence', role: 'close', lang, markerStart: at + run[1].length, markerEnd: at + run[1].length + run[2].length };
				} else if (i === target) {
					return { kind: 'fence', role: 'body', lang: open.lang, markerStart: 0, markerEnd: 0 };
				}
				continue;
			}
			// The line does not carry the fence's quote prefix. Measured (Obsidian 1.14.4, Live Preview, Source mode and Reading view, plain
			// quote and callout, SC-687 r3 / r5): only a blank line (also a bare shallower `>`), or a fence marker line after the markers it has (which
			// then opens a fence of its own, at that depth), ends a quoted fence. Any other non-blank line stays in the code: text, shallower-quoted
			// text, and a heading, list item or thematic rule too (there the views disagree: Reading view ends the fence, Live Preview and Source
			// mode do not; the scan takes the reading that refuses).
			if (!endsQuotedFence(text)) {
				if (i === target) return { kind: 'fence', role: 'body', lang: open.lang, markerStart: 0, markerEnd: 0 };
				continue;
			}
			open = null; // the quote the fence was in ended: this line is read fresh, outside it
		}
		const quote = quoteMarkersOf(text);
		const depth = quote.split('>').length - 1;
		if (depth !== itemsDepth) {
			items = [];
			itemsDepth = depth;
		}
		const rest = text.slice(quote.length);
		if (rest.trim() === '') {
			lazy = false;
			if (i === target) return OUTSIDE;
			continue;
		}
		const indent = columnAfter(/^[ \t]*/.exec(rest)![0]);
		const run = FENCE_RUN_LINE.exec(rest);
		// A line less indented than an item's text ends the item, except a paragraph line right under an item's paragraph (lazy continuation).
		// Only a paragraph line continues lazily: a fence line, an ATX heading, a thematic break and a list item each start a new block, so
		// they end the item (a fence directly under `- item` is a top-level fence that its own closer closes).
		if (!lazy || run !== null || NOT_PARAGRAPH.test(rest) || listItemOf(rest) !== null) while (items.length > 0 && indent < items[items.length - 1]) items.pop();
		let opener: { marker: string; info: string; start: number; listColumn: number } | null = null;
		const base = items.length > 0 ? items[items.length - 1] : 0;
		if (run && indent - base <= 3) {
			opener = { marker: run[2], info: run[3], start: quote.length + run[1].length, listColumn: base };
		} else {
			const item = listItemOf(rest);
			if (item) {
				items.push(item.readColumn);
				const inline = FENCE_RUN_AFTER_ITEM.exec(rest.slice(item.length));
				if (inline) opener = { marker: inline[1], info: inline[2], start: quote.length + item.length, listColumn: item.readColumn };
			}
		}
		const fence = opener ? openFenceOf(opener.marker, opener.info) : null;
		lazy = !fence && items.length > 0;
		if (opener && fence) {
			open = { ...fence, prefix: quote, listColumn: opener.listColumn };
			if (i === target) return { kind: 'fence', role: 'open', lang: fence.lang, markerStart: opener.start, markerEnd: opener.start + opener.marker.length };
		} else if (i === target) {
			return OUTSIDE;
		}
	}
	return OUTSIDE;
}

/**
 * Whether a block written with the cursor at `pos` (column `ch` of line `pos.line` of `lines`) would land inside existing structure, and in
 * which. Inside: the body of a fenced block, its opening line after the start of the marker, its closing line anywhere but the end, the
 * properties from line 0 `---` to the closing `---` (its end too, as far as the closing marker). At the start of an opening line (the
 * marker, or the quote / indentation in front of it) the block lands above the fence; at the end of a closing line (after the marker and
 * the whitespace behind it) it lands below.
 */
export function insertRefusalAt(lines: readonly string[], pos: EditorPosition): InsertRefusal | null {
	const place = placeOfLine(lines, pos.line);
	if (place.kind === 'outside') return null;
	const refusal: InsertRefusal = place.kind === 'properties' ? 'properties' : 'block';
	if (place.role === 'body') return refusal;
	if (place.role === 'open') return place.kind === 'properties' || pos.ch > place.markerStart ? refusal : null;
	return pos.ch >= noCr(lines[pos.line]).length ? null : refusal;
}

/** `insertRefusalAt` for both ends of a selection (or of the `/ds` token being replaced): the first end that is inside decides. */
export function insertRefusal(lines: readonly string[], from: EditorPosition, to: EditorPosition = from): InsertRefusal | null {
	return insertRefusalAt(lines, from) ?? (to.line === from.line && to.ch === from.ch ? null : insertRefusalAt(lines, to));
}
