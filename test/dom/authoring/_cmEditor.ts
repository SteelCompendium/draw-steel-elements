// SC-443 test helper: a faithful stand-in for Obsidian's `Editor` over a REAL CodeMirror 6 EditorState, for the authoring matrix and
// integrity tests. The jest-free mock `Editor` (test/mocks/obsidian-core.ts) records writes and never changes its text; these tests need
// the text a user would be left with (CRLF split the way CodeMirror splits it, a selection replaced, the cursor mapped through a write).
// Only the surface src/authoring uses: getLine / lineCount / getCursor / setCursor / getValue / replaceSelection / replaceRange / transaction.
import { EditorSelection, EditorState } from '@codemirror/state';
import type { EditorPosition } from 'obsidian';

export class CmEditor {
	state: EditorState;
	/** Every call that changed the document, in order: what the product asked the editor to do. */
	readonly writes: Array<{ via: 'replaceSelection' | 'replaceRange' | 'transaction'; text: string; from: number; to: number }> = [];

	constructor(text: string, cursor: EditorPosition = { line: 0, ch: 0 }, selectionTo?: EditorPosition) {
		// Obsidian's editor allows several cursors (`listSelections`, `setSelections`); the facet is what keeps CodeMirror from collapsing them.
		this.state = EditorState.create({ doc: text, selection: EditorSelection.single(0), extensions: [EditorState.allowMultipleSelections.of(true)] });
		this.state = this.state.update({
			selection: selectionTo ? EditorSelection.single(this.offset(cursor), this.offset(selectionTo)) : EditorSelection.cursor(this.offset(cursor)),
		}).state;
	}

	private offset(pos: EditorPosition): number {
		const doc = this.state.doc;
		const line = doc.line(Math.min(Math.max(pos.line, 0), doc.lines - 1) + 1);
		return line.from + Math.min(pos.ch, line.length);
	}
	private pos(offset: number): EditorPosition {
		const line = this.state.doc.lineAt(offset);
		return { line: line.number - 1, ch: offset - line.from };
	}

	getLine(n: number): string {
		return n >= 0 && n < this.state.doc.lines ? this.state.doc.line(n + 1).text : '';
	}
	lineCount(): number {
		return this.state.doc.lines;
	}
	getValue(): string {
		return this.state.doc.toString();
	}
	listSelections(): Array<{ anchor: EditorPosition; head: EditorPosition }> {
		return this.state.selection.ranges.map((r) => ({ anchor: this.pos(r.anchor), head: this.pos(r.head) }));
	}
	/**
	 * Several cursors / selections at once (Obsidian's multiple cursors); the last one is the main one when `main` is not given.
	 * NOT like Obsidian 1.14.4 (measured, SC-692): there `main` is ignored and the FIRST range is the main one (`getCursor()` follows it; so does
	 * `transaction({ selections })`). The jsdom tests here set `main` to say which cursor is the main one, so this keeps honouring it; the e2e
	 * specs put the main range first.
	 */
	setSelections(ranges: Array<{ anchor: EditorPosition; head?: EditorPosition }>, main = ranges.length - 1): void {
		this.state = this.state.update({
			selection: EditorSelection.create(
				ranges.map((r) => EditorSelection.range(this.offset(r.anchor), this.offset(r.head ?? r.anchor))),
				main,
			),
		}).state;
	}
	getCursor(side: 'from' | 'to' | 'head' | 'anchor' = 'head'): EditorPosition {
		const r = this.state.selection.main;
		return this.pos(side === 'from' ? r.from : side === 'to' ? r.to : side === 'anchor' ? r.anchor : r.head);
	}
	setCursor(pos: EditorPosition): void {
		this.state = this.state.update({ selection: EditorSelection.cursor(this.offset(pos)) }).state;
	}
	replaceSelection(text: string): void {
		const r = this.state.selection.main;
		this.writes.push({ via: 'replaceSelection', text, from: r.from, to: r.to });
		this.state = this.state.update(this.state.replaceSelection(text)).state;
	}
	replaceRange(text: string, from: EditorPosition, to?: EditorPosition): void {
		const a = this.offset(from);
		const b = to ? this.offset(to) : a;
		this.writes.push({ via: 'replaceRange', text, from: a, to: b });
		this.state = this.state.update({ changes: { from: a, to: b, insert: text } }).state;
	}
	/**
	 * Obsidian's `editor.transaction` (SC-692): every change in the note's coordinates BEFORE the transaction, `selections` in the coordinates AFTER it
	 * (measured in Obsidian 1.14.4), the first of them the main one. One CodeMirror transaction, and one entry in `writes` (text: the inserted texts joined).
	 */
	transaction(tx: { changes?: Array<{ from: EditorPosition; to?: EditorPosition; text: string }>; selections?: Array<{ from: EditorPosition; to?: EditorPosition }> }): void {
		const changes = (tx.changes ?? []).map((c) => ({ from: this.offset(c.from), to: this.offset(c.to ?? c.from), insert: c.text }));
		if (changes.length) this.writes.push({ via: 'transaction', text: changes.map((c) => c.insert).join(''), from: Math.min(...changes.map((c) => c.from)), to: Math.max(...changes.map((c) => c.to)) });
		const doc = this.state.update({ changes }).state.doc;
		const after = (pos: EditorPosition) => {
			const line = doc.line(Math.min(Math.max(pos.line, 0), doc.lines - 1) + 1);
			return line.from + Math.min(pos.ch, line.length);
		};
		const selection = tx.selections && EditorSelection.create(tx.selections.map((r) => EditorSelection.range(after(r.from), after(r.to ?? r.from))), 0);
		this.state = this.state.update({ changes, selection }).state;
	}
	/** Offset of a position (for asserting "the bytes before/after the write are untouched"). */
	offsetOf(pos: EditorPosition): number {
		return this.offset(pos);
	}
}
