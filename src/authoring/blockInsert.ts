// SC-675 (+ SC-462) — the ONE place a fenced block is put into the editor by the authoring inserts: the Insert commands (insert.ts),
// the /ds pick (suggest.ts) and the compendium reference / snapshot inserts (compendiumInsert.ts).
//
// A block put in "as is" at the cursor only works when the cursor is at the start of an empty line. Anywhere else the opening fence
// is glued onto text (```` abc```ds-ct ```` renders nothing), the closing fence gets words after it (```` ``` tail ```` never closes, so the
// block swallows the rest of the note), and inside a list item or a callout lines 2.. land outside it. So the insert works out what
// the cursor's line looks like first:
//   - its PREFIX: the quote markers (`> `, `> > ` — blockPrefix.ts, SC-455), then the item's continuation indentation when it is a
//     list item (`- item` -> two spaces, `1. ` three, `10. ` four; a quote opened after the marker, `- > [!note] T`, is part of it: `  > `),
//     else the width of the author's own leading whitespace. The indentation is always written as SPACES (under an ordered item a
//     tab counts to the next multiple of 4, under a bullet as 2 columns: how Obsidian's Reading view reads nesting, see blockContextOf): Live Preview draws a block whose body lines are tab-indented as a parse error ("Tabs are not allowed as
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
//
// SC-692: with SEVERAL cursors / selections (Alt-click) every one gets a block laid out for its own line (`planBlockInserts`): the result is
// exactly what single-cursor inserts would write if they were run one at a time from the last range in the note to the first (each sees the
// text the later writes left on its line, so two cursors on one line give two blocks and no blank line between them). All of it goes in as
// ONE `editor.transaction` (several changes, the cursors placed in the same change), so one undo restores the note; every cursor ends where a
// single insert would have left it for its block, the main one still the main. One cursor keeps the replaceSelection / setCursor path above.
//
// SC-687: a block is never written INSIDE existing structure. The write is the one place every authoring insert goes through, so the guard is
// here (`refuseInsert`): with the cursor (or either end of the selection / the /ds token) in the body of a fenced block of any kind, on its
// opening line after the start of the fence marker, on its closing line anywhere but the end, or in the note's properties, nothing is written,
// the cursor and selection stay where they were, the undo history gets no entry, and ONE Notice says why. Before the marker of an opening line
// the block lands above the fence; at the end of a closing line, below it. The position scan is fenceScan.ts `insertRefusal` (text only).
import { Notice } from 'obsidian';
import type { Editor, EditorPosition } from 'obsidian';
import { addBlockPrefix, quoteMarkersOf } from '@/framework/host/blockPrefix';
import { advancePosition } from './scaffold';
import { columnAfter, listItemOf } from './listItem';
import { insertRefusal } from './fenceScan';
import type { InsertRefusal } from './fenceScan';

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

/**
 * Reads `before` (the line's text up to the cursor). The prefix is the quote markers, plus the continuation indentation of a list item
 * (spaces up to the column where the item's text starts — CommonMark, except that a leading tab counts as 2 columns under a bullet, see below: the marker and the 1-4 spaces after it; 5 or more spaces read
 * as one, the rest being indented code — and any quote markers opened right after the marker), else spaces for the width of the
 * leading whitespace. Spaces only, never the line's tabs (see the header). The first line of a block that starts on the cursor
 * line goes behind the user's own whitespace, which is not part of `prefix`.
 */
export function blockContextOf(before: string): BlockContext {
	const quote = quoteMarkersOf(before);
	const rest = before.slice(quote.length);
	const item = listItemOf(rest);
	if (item) {
		const innerQuote = quoteMarkersOf(rest.slice(item.length));
		return { prefix: quote + ' '.repeat(item.contentColumn) + innerQuote, hasTextBefore: true };
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

/** A range an insert replaces: a cursor (`from` equals `to`) or a selection, `from` before `to`. */
export interface InsertRange {
	from: EditorPosition;
	to: EditorPosition;
}

/** One replacement, in the note's coordinates BEFORE any of the changes of its plan is applied. */
export interface BlockChange {
	from: EditorPosition;
	to: EditorPosition;
	text: string;
}

export interface BlockInsertsPlan {
	/** One per range, in note order, none overlapping: apply them together as one change. */
	changes: BlockChange[];
	/** Where each range's cursor is once every change is applied (parallel to `changes`). */
	cursors: EditorPosition[];
}

/** Where `p` (at or after `change.to`, in the note before the change) is once `change` is applied. */
function mapThrough(p: EditorPosition, change: BlockChange): EditorPosition {
	const end = advancePosition(change.from, change.text, change.text.length);
	return p.line === change.to.line ? { line: end.line, ch: end.ch + (p.ch - change.to.ch) } : { line: p.line + (end.line - change.to.line), ch: p.ch };
}

/**
 * SC-692 — the blocks for several ranges (sorted, not overlapping), as one set of changes. Pure.
 *
 * The rule: the same text as single-cursor inserts (`planBlockInsert`) run one at a time from the LAST range to the first. A later write sits at
 * or after this range's end, so it only matters to what this range sees as the text after it: when the next range is on the same line, the
 * line's remainder is the text between the two, then whatever the next range's write left on that line (its first line, or all of it when it is
 * one line). Every change keeps its coordinates in the note as it was. Each cursor is where its single insert leaves it, moved by the changes
 * above it (an earlier range on the same line shifts its column, earlier line breaks its line).
 */
export function planBlockInserts(getLine: (line: number) => string, ranges: InsertRange[], block: BlockToInsert): BlockInsertsPlan {
	const plans: BlockInsertPlan[] = [];
	let nextResidue: string | undefined; // what range i + 1 leaves on its own first line, from the start of its write
	for (let i = ranges.length - 1; i >= 0; i--) {
		const { from, to } = ranges[i];
		const sameLineAsNext = i < ranges.length - 1 && ranges[i + 1].from.line === to.line;
		const rest = getLine(to.line).slice(to.ch, sameLineAsNext ? ranges[i + 1].from.ch : undefined);
		const after = sameLineAsNext ? rest + nextResidue : rest;
		const plan = planBlockInsert(getLine(from.line).slice(0, from.ch), after, block);
		plans[i] = plan;
		const firstBreak = plan.text.indexOf('\n');
		nextResidue = firstBreak >= 0 ? plan.text.slice(0, firstBreak) : plan.text + after;
	}
	const changes = ranges.map((r, i) => ({ from: r.from, to: r.to, text: plans[i].text }));
	const cursors = ranges.map((r, i) => {
		let p = advancePosition(r.from, plans[i].text, plans[i].cursor ?? plans[i].text.length);
		for (let j = i - 1; j >= 0; j--) p = mapThrough(p, changes[j]);
		return p;
	});
	return { changes, cursors };
}

/** The editor's selections as insert ranges: each ordered from / to, sorted by position, overlapping ones joined; `main` is the index of the main one. */
export function insertRangesOf(editor: Editor): { ranges: InsertRange[]; main: number } {
	const before = (a: EditorPosition, b: EditorPosition) => a.line < b.line || (a.line === b.line && a.ch < b.ch);
	const head = editor.getCursor('head');
	const anchor = editor.getCursor('anchor');
	const picked = editor.listSelections().map((s) => ({
		range: before(s.head, s.anchor) ? { from: s.head, to: s.anchor } : { from: s.anchor, to: s.head },
		isMain: s.head.line === head.line && s.head.ch === head.ch && s.anchor.line === anchor.line && s.anchor.ch === anchor.ch,
	}));
	picked.sort((a, b) => (before(a.range.from, b.range.from) ? -1 : before(b.range.from, a.range.from) ? 1 : 0));
	const ranges: InsertRange[] = [];
	let main = 0;
	for (const { range, isMain } of picked) {
		const last = ranges[ranges.length - 1];
		if (last && before(range.from, last.to)) {
			if (before(last.to, range.to)) last.to = range.to;
		} else ranges.push({ from: range.from, to: range.to });
		if (isMain) main = ranges.length - 1;
	}
	return { ranges, main };
}

/** SC-687 — what the user is told when an insert is refused, by reason (same sentence shape as the compendium's CLOSED_EDITOR_NOTICE). */
export const INSERT_REFUSED_NOTICE: Record<InsertRefusal, string> = {
	block: 'The cursor is inside another block, so nothing was inserted. Move it to a line outside the block and run the command again.',
	properties: "The cursor is inside the note's properties, so nothing was inserted. Move it below the properties and run the command again.",
};

/**
 * SC-687 — why an insert at the cursor (or over the selection, or over `range`, the /ds pick's typed token) would be refused, or null when it
 * may go ahead: the write would land inside an existing fenced block or the note's properties (`insertRefusal`, fenceScan.ts), at any of the
 * editor's cursors / selections when there are several. Reads the
 * editor's text, never the metadata cache (it lags the editor: a block typed a second ago is not in it). Shows nothing.
 */
export function insertRefusalFor(editor: Editor, range?: { start: EditorPosition; end: EditorPosition }): InsertRefusal | null {
	const lines: string[] = [];
	for (let i = 0, n = editor.lineCount(); i < n; i++) lines.push(editor.getLine(i));
	if (range) return insertRefusal(lines, range.start, range.end);
	// Without a range the write goes over EVERY selection range (`replaceSelection` writes at each cursor), so any range with an end inside refuses.
	for (const { anchor, head } of editor.listSelections()) {
		const why = insertRefusal(lines, anchor, head);
		if (why !== null) return why;
	}
	return null;
}

/**
 * SC-687 — the refusal as the user meets it: when the insert would land inside existing structure, ONE Notice says so and this returns true;
 * the caller writes nothing (no cursor move, no undo entry). `insertBlock` calls it, so every authoring insert is covered at the write; the
 * two compendium commands call it as well when they start, before the search opens, and then never reach `insertBlock` (one Notice per action).
 */
export function refuseInsert(editor: Editor, range?: { start: EditorPosition; end: EditorPosition }): boolean {
	const why = insertRefusalFor(editor, range);
	if (why === null) return false;
	new Notice(INSERT_REFUSED_NOTICE[why]);
	return true;
}

/**
 * Puts `block` into `editor` over the selection (`replaceSelection`) or, when `range` is given, over that range (`replaceRange`: the /ds
 * pick's typed token), then moves the cursor to the block's `cursorOffset` when it has one. One editor change. SC-687: with the position
 * inside an existing block or the properties (`refuseInsert`) nothing is written and the editor is left as it was; returns whether the block
 * was written, so a caller does no follow-up work (and shows no second Notice) after a refusal.
 */
export function insertBlock(editor: Editor, block: BlockToInsert, range?: { start: EditorPosition; end: EditorPosition }): boolean {
	if (refuseInsert(editor, range)) return false;
	if (!range) {
		const { ranges, main } = insertRangesOf(editor);
		if (ranges.length > 1) return insertAtEveryCursor(editor, block, ranges, main);
	}
	const from = range?.start ?? editor.getCursor('from');
	const to = range?.end ?? editor.getCursor('to');
	const plan = planBlockInsert(editor.getLine(from.line).slice(0, from.ch), editor.getLine(to.line).slice(to.ch), block);
	if (range) editor.replaceRange(plan.text, from, to);
	else editor.replaceSelection(plan.text);
	if (plan.cursor !== undefined) editor.setCursor(advancePosition(from, plan.text, plan.cursor));
	return true;
}

/** SC-692 — `insertBlock` with several cursors: every range gets its own block, in one `editor.transaction` (one undo); the main cursor stays the main one. */
function insertAtEveryCursor(editor: Editor, block: BlockToInsert, ranges: InsertRange[], main: number): boolean {
	const plan = planBlockInserts((n) => editor.getLine(n), ranges, block);
	// Obsidian takes the FIRST of `selections` as the main selection (measured in 1.14.4), and reads them in the new note's coordinates.
	const order = [main, ...plan.cursors.map((_, i) => i).filter((i) => i !== main)];
	editor.transaction({
		changes: plan.changes.map((c) => ({ from: c.from, to: c.to, text: c.text })),
		selections: order.map((i) => ({ from: plan.cursors[i] })),
	});
	return true;
}
