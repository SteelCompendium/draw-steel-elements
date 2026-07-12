// Plan 15 Task 3 (D9 §2.2) — the /ds EditorSuggest scaffolder. One suggester covers every
// element: type "/ds", filter by name/alias, pick, and the trigger token is REPLACED with
// the scaffold (start..end only — the rest of the line is untouched). First-class Obsidian
// API; works in source mode + Live-Preview editing (independent of the LP render deferral).
import { EditorSuggest } from 'obsidian';
import type { App, Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import type { ElementDefinition, ElementRegistry } from '@/framework/registry';
import { advancePosition, buildScaffold } from './scaffold';
import { scanFenceState } from './fenceScan';

/** `/ds` optionally followed by a query, anchored to a word boundary so it never fires mid-word. */
const TRIGGER = /(?:^|\s)\/ds([a-z-]*)$/i;

// Trap guarded here (not deferred to Task 4's in-fence autocomplete): without this, typing
// "/ds" as free text INSIDE an already-inserted fence (e.g. as part of a value, or inside a
// wholly unrelated ```js block) would still trigger this suggester, and accepting the
// suggestion would replaceRange a brand-new ds-* scaffold into the middle of the existing
// block — corrupting it. The guard is fence-TYPE-AGNOSTIC: suppress inside ANY open fence,
// not just ds-* ones, because the corruption is just as real either way. Task 4's
// DsSchemaSuggest is a *different* suggester that positively fires inside a ds-* fence for
// key/enum completion; this one must do the opposite and stay out entirely — of every fence.
// Fence-state scanning itself is shared with DsSchemaSuggest via ./fenceScan (one scanner,
// two consumers) to avoid drift between the two suggesters' notions of "inside a fence".

export class DsElementSuggest extends EditorSuggest<ElementDefinition> {
	constructor(
		app: App,
		private readonly registry: ElementRegistry,
	) {
		super(app);
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		if (scanFenceState(editor, cursor.line).inFence) return null;
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
