// Plan 15 Task 3 (D9 §2.2) — the /ds EditorSuggest scaffolder. One suggester covers every
// element: type "/ds", filter by name/alias, pick, and the trigger token is REPLACED with
// the scaffold (start..end only — the rest of the line is untouched). First-class Obsidian
// API; works in source mode + Live-Preview editing (independent of the LP render deferral).
import { EditorSuggest } from 'obsidian';
import type { App, Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import type { ElementDefinition, ElementRegistry } from '@/framework/registry';
import { advancePosition, buildScaffold } from './scaffold';

/** `/ds` optionally followed by a query, anchored to a word boundary so it never fires mid-word. */
const TRIGGER = /(?:^|\s)\/ds([a-z-]*)$/i;

// Trap guarded here (not deferred to Task 4's in-fence autocomplete): without this, typing
// "/ds" as free text INSIDE an already-inserted ds-* fence (e.g. as part of a value) would
// still trigger this suggester, and accepting the suggestion would replaceRange a brand-new
// fenced scaffold into the middle of the existing block — corrupting it. Task 4's
// DsSchemaSuggest is a *different* suggester that positively fires inside a fence for
// key/enum completion; this one must do the opposite and stay out entirely.
//
// A fence-marker line: an optional Obsidian callout/blockquote prefix (one or more `> `,
// e.g. nested callouts), up to 3 leading spaces (CommonMark still treats that as
// unindented), then 3+ backticks OR 3+ tildes (captured — group 1), then the rest of the
// line (group 2: the info string for an opener, or nothing for a closer).
const BQ_PREFIX = String.raw`(?:>\s?)*`;
const LEADING_WS = '[ ]{0,3}';
const FENCE_LINE = new RegExp(`^${BQ_PREFIX}${LEADING_WS}(\`{3,}|~{3,})(.*)$`);
const DS_INFO = /^\s*ds-[a-z0-9-]+\s*$/i;

/**
 * True if `line` sits inside an already-opened ds-* fence. This is a full top-down scan
 * from the start of the document (not a walk-upward first-match): fences don't nest in
 * CommonMark, so "am I inside a fence" is state that must be threaded from the top —
 * walking upward and stopping at the nearest fence-looking line can mis-clear that state
 * when an unclosed ds- fence is followed, further down but still above the cursor, by a
 * fence-looking line that isn't actually a valid closer for it (wrong marker char, too
 * short, or carrying an info string) — that line is just literal content of the still-open
 * fence, not a real close. A real closer must match the opener's marker character and be at
 * least as long (mirrors CommonMark: ```` ``` ```` can't close ` ```` `, and a tilde fence
 * only closes with tildes).
 */
function isInsideDsFence(editor: Editor, line: number): boolean {
	let inFence = false;
	let isDs = false;
	let fenceChar = '';
	let fenceLen = 0;
	for (let i = 0; i < line; i++) {
		const m = FENCE_LINE.exec(editor.getLine(i));
		if (!m) continue;
		const marker = m[1];
		const rest = m[2];
		if (!inFence) {
			inFence = true;
			fenceChar = marker[0];
			fenceLen = marker.length;
			isDs = DS_INFO.test(rest);
		} else if (marker[0] === fenceChar && marker.length >= fenceLen && rest.trim() === '') {
			inFence = false;
			isDs = false;
		}
		// else: a fence-marker-looking line while already inside an open fence, but it
		// doesn't validly close it (wrong char, too short, or has an info string) — treat
		// it as literal content and keep scanning in the current state.
	}
	return inFence && isDs;
}

export class DsElementSuggest extends EditorSuggest<ElementDefinition> {
	constructor(
		app: App,
		private readonly registry: ElementRegistry,
	) {
		super(app);
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		if (isInsideDsFence(editor, cursor.line)) return null;
		const before = editor.getLine(cursor.line).slice(0, cursor.ch);
		const m = TRIGGER.exec(before);
		if (!m) return null;
		const tokenLength = m[1].length + 3; // "/ds" + query
		return {
			start: { line: cursor.line, ch: cursor.ch - tokenLength },
			end: cursor,
			query: m[1].toLowerCase(),
		};
	}

	getSuggestions(context: EditorSuggestContext): ElementDefinition[] {
		const q = context.query;
		if (q === '') return this.registry.all().slice();
		return this.registry
			.all()
			.filter((d) => d.name.toLowerCase().includes(q) || d.aliases.some((a) => a.includes(q)));
	}

	renderSuggestion(def: ElementDefinition, el: HTMLElement): void {
		el.createDiv({ cls: 'dse-suggest__title', text: def.name });
		el.createDiv({ cls: 'dse-suggest__alias', text: def.aliases[0] });
	}

	selectSuggestion(def: ElementDefinition, _evt: MouseEvent | KeyboardEvent): void {
		if (!this.context) return;
		const { editor, start, end } = this.context;
		const scaffold = buildScaffold(def);
		editor.replaceRange(scaffold.text, start, end);
		editor.setCursor(advancePosition(start, scaffold.text, scaffold.cursorOffset));
	}
}
