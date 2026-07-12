// Plan 15 Task 3 (D9 §2.2) — the /ds EditorSuggest scaffolder. One suggester covers every
// element: type "/ds", filter by name/alias, pick, and the trigger token is REPLACED with
// the scaffold (start..end only — the rest of the line is untouched). First-class Obsidian
// API; works in source mode + Live-Preview editing (independent of the LP render deferral).
import { EditorSuggest } from 'obsidian';
import type { App, Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import type { ElementDefinition, ElementRegistry } from '@/framework/registry';
import { buildScaffold } from './scaffold';

/** `/ds` optionally followed by a query, anchored to a word boundary so it never fires mid-word. */
const TRIGGER = /(?:^|\s)\/ds([a-z-]*)$/i;

// Trap guarded here (not deferred to Task 4's in-fence autocomplete): without this, typing
// "/ds" as free text INSIDE an already-inserted ds-* fence (e.g. as part of a value) would
// still trigger this suggester, and accepting the suggestion would replaceRange a brand-new
// fenced scaffold into the middle of the existing block — corrupting it. Task 4's
// DsSchemaSuggest is a *different* suggester that positively fires inside a fence for
// key/enum completion; this one must do the opposite and stay out entirely.
const OPEN_DS_FENCE = /^(?:```|~~~)\s*ds-[a-z0-9-]+\s*$/i;
const CLOSE_FENCE = /^(?:```|~~~)\s*$/;

/** True if `line` sits inside an already-opened ds-* fence (walk upward for the opener). */
function isInsideDsFence(editor: Editor, line: number): boolean {
	for (let i = line - 1; i >= 0; i--) {
		const text = editor.getLine(i);
		if (OPEN_DS_FENCE.test(text)) return true;
		if (CLOSE_FENCE.test(text)) return false;
	}
	return false;
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
		this.context.editor.replaceRange(buildScaffold(def).text, this.context.start, this.context.end);
	}
}
