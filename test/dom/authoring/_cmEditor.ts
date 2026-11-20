// SC-443 test helper: a faithful stand-in for Obsidian's `Editor` over a REAL CodeMirror 6 EditorState, for the authoring matrix and
// integrity tests. The jest-free mock `Editor` (test/mocks/obsidian-core.ts) records writes and never changes its text; these tests need
// the text a user would be left with (CRLF split the way CodeMirror splits it, a selection replaced, the cursor mapped through a write).
// Only the surface src/authoring uses: getLine / lineCount / getCursor / setCursor / getValue / replaceSelection / replaceRange.
import { EditorSelection, EditorState } from '@codemirror/state';
import type { EditorPosition } from 'obsidian';

export class CmEditor {
	state: EditorState;
	/** Every call that changed the document, in order: what the product asked the editor to do. */
	readonly writes: Array<{ via: 'replaceSelection' | 'replaceRange'; text: string; from: number; to: number }> = [];

	constructor(text: string, cursor: EditorPosition = { line: 0, ch: 0 }, selectionTo?: EditorPosition) {
		this.state = EditorState.create({ doc: text, selection: EditorSelection.single(0) });
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
	/** Offset of a position (for asserting "the bytes before/after the write are untouched"). */
	offsetOf(pos: EditorPosition): number {
		return this.offset(pos);
	}
}
