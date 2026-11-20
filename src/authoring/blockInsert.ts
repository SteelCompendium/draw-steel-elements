// SC-675 (+ SC-462) — the ONE place a fenced block is put into the editor by the authoring inserts: the Insert commands (insert.ts),
// the /ds pick (suggest.ts) and the compendium reference / snapshot inserts (compendiumInsert.ts).
//
// A block put in "as is" at the cursor only works when the cursor is at the start of an empty line. Anywhere else the opening fence
// is glued onto text (```` abc```ds-ct ```` renders nothing), the closing fence gets words after it (```` ``` tail ```` never closes, so the
// block swallows the rest of the note), and inside a list item or a callout lines 2.. land outside it. So the insert works out what
// the cursor's line looks like first:
//   - its PREFIX: the quote markers (`> `, `> > ` — blockPrefix.ts, SC-455), then the item's continuation indentation when it is a
//     list item (`- item` -> two spaces, `1. ` three, `10. ` four; a quote opened after the marker, `- > [!note] T`, is part of it: `  > `),
//     else the width of the author's own leading whitespace. The indentation is always written as SPACES (a tab counts to the next
//     multiple of 4): Live Preview draws a block whose body lines are tab-indented as a parse error ("Tabs are not allowed as
//     indentation"). The inserted lines are new text; the user's own whitespace on the cursor line is never rewritten, the first
//     fence line goes right behind it. Every line written carries the prefix;
//   - whether text sits before the cursor. If so the block starts on the NEXT line (a line break is inserted; the text stays where it is).
//     If the line before the cursor is only its prefix (an empty line, an empty quote line, the indentation of a list item's
//     continuation line), the block starts right there;
//   - whether text follows the cursor (or the selection). If so it moves to a line of its own below the closing fence, behind the same prefix.
//
// Never blank lines (a blank line ends a callout, and a fence may follow a paragraph line directly). Never a rewrite of existing text:
// the write is ONE replaceSelection / replaceRange over exactly what the caller replaced before (the selection, or the typed `/ds…` token),
// moving the tail down is an inserted line break in front of it. One change, so one undo restores the note.
// At the start of an empty line with no prefix the text written and the cursor position are exactly what they were before SC-675.
import type { Editor, EditorPosition } from 'obsidian';
import { addBlockPrefix, quoteMarkersOf } from '@/framework/host/blockPrefix';
import { advancePosition } from './scaffold';

export interface BlockToInsert {
	/** The fenced block, un-prefixed, without a trailing newline (`wrapFence`, `Scaffold.text`). */
	text: string;
	/** Offset in `text` to put the cursor at (a scaffold's first body character); the cursor is left after the write when absent. */
	cursorOffset?: number;
	/** End the closing fence's line (the compendium inserts: the cursor is left on the line after the block). */
	endLine?: boolean;
}

export interface BlockInsertPlan {
	/** What to write over the selection / token. */
	text: string;
	/** Offset in `text` of the cursor, when the block asked for one. */
	cursor?: number;
}

/** The prefix a line written at the cursor needs, and whether text sits before the cursor on its line. */
export interface BlockContext {
	prefix: string;
	hasTextBefore: boolean;
}

// A list item marker and the whitespace after it, after the line's own leading whitespace (CommonMark: a bullet, or 1-9 digits and a `.` / `)`).
const LIST_MARKER = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)/;

/** Column reached after `text` when it starts at column `start` (a tab goes to the next multiple of 4). */
function columnAfter(text: string, start = 0): number {
	let col = start;
	for (const ch of text) col = ch === '\t' ? col + 4 - (col % 4) : col + 1;
	return col;
}

/**
 * Reads `before` (the line's text up to the cursor). The prefix is the quote markers, plus the continuation indentation of a list item
 * (spaces up to the column where the item's text starts — CommonMark: the marker and the 1-4 spaces after it; 5 or more spaces read
 * as one, the rest being indented code — and any quote markers opened right after the marker), else spaces for the width of the
 * leading whitespace. Spaces only, never the line's tabs (see the header). The first line of a block that starts on the cursor
 * line goes behind the user's own whitespace, which is not part of `prefix`.
 */
export function blockContextOf(before: string): BlockContext {
	const quote = quoteMarkersOf(before);
	const rest = before.slice(quote.length);
	const list = LIST_MARKER.exec(rest);
	if (list) {
		const [, lead, marker, gap] = list;
		const markerEnd = columnAfter(marker, columnAfter(lead));
		const gapEnd = columnAfter(gap, markerEnd);
		const contentColumn = gapEnd - markerEnd >= 5 ? markerEnd + 1 : gapEnd;
		const innerQuote = quoteMarkersOf(rest.slice(list[0].length));
		return { prefix: quote + ' '.repeat(contentColumn) + innerQuote, hasTextBefore: true };
	}
	const indent = /^[ \t]*/.exec(rest)![0];
	return { prefix: quote + ' '.repeat(columnAfter(indent)), hasTextBefore: rest.length > indent.length };
}

/** `text` as one line under `prefix`: the quote rules of blockPrefix.ts (`>` for an empty line), plain whitespace indentation as written. */
function withPrefix(prefix: string, text: string): string {
	return prefix.includes('>') ? addBlockPrefix(prefix, text) : prefix + text;
}

/**
 * The text to write, given the line before the cursor and the line text after the cursor / selection end. Pure.
 */
export function planBlockInsert(before: string, after: string, block: BlockToInsert): BlockInsertPlan {
	const { prefix, hasTextBefore } = blockContextOf(before);
	const lines = block.text.split('\n');
	let out = '';
	let cursor: number | undefined;
	let blockOffset = 0; // offset of the current line in block.text
	lines.forEach((line, i) => {
		// The first line goes right behind the prefix already on the cursor line, unless text is in the way.
		const sep = i === 0 ? (hasTextBefore ? '\n' : '') : '\n';
		const written = i === 0 && !hasTextBefore ? line : withPrefix(prefix, line);
		const lineStart = out.length + sep.length;
		if (cursor === undefined && block.cursorOffset !== undefined && block.cursorOffset <= blockOffset + line.length) {
			// Where the line's own text starts in what was written (after the prefix, and the space `addBlockPrefix` may put in).
			const textStart = lineStart + (line === '' ? written.length : written.length - line.length);
			cursor = textStart + (block.cursorOffset - blockOffset);
		}
		out += sep + written;
		blockOffset += line.length + 1;
	});
	// Text after the cursor goes to its own line; whitespace alone may stay behind the closing fence (CommonMark allows it).
	if (block.endLine || after.trim() !== '') out += '\n' + prefix;
	return { text: out, cursor };
}

/**
 * Puts `block` into `editor` over the selection (`replaceSelection`) or, when `range` is given, over that range (`replaceRange`: the /ds
 * pick's typed token), then moves the cursor to the block's `cursorOffset` when it has one. One editor change.
 */
export function insertBlock(editor: Editor, block: BlockToInsert, range?: { start: EditorPosition; end: EditorPosition }): void {
	const from = range?.start ?? editor.getCursor('from');
	const to = range?.end ?? editor.getCursor('to');
	const plan = planBlockInsert(editor.getLine(from.line).slice(0, from.ch), editor.getLine(to.line).slice(to.ch), block);
	if (range) editor.replaceRange(plan.text, from, to);
	else editor.replaceSelection(plan.text);
	if (plan.cursor !== undefined) editor.setCursor(advancePosition(from, plan.text, plan.cursor));
}
