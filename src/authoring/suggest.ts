// Plan 15 Task 3 (D9 §2.2) — the /ds EditorSuggest scaffolder. One suggester covers every
// element: type "/ds", filter by name/alias, pick, and the trigger token is REPLACED with
// the scaffold (start..end only — the rest of the line is kept, on a line of its own below the block). First-class Obsidian
// API; works in source mode + Live-Preview editing (independent of the LP render deferral).
import { EditorSuggest } from 'obsidian';
import type { App, Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import { stampControl } from '@/framework/kit/controlId';
import { isDefinitionHidden } from '@/framework/registry';
import type { ElementDefinition, ElementRegistry } from '@/framework/registry';
import { insertBlock } from './blockInsert';
import { buildScaffold } from './scaffold';
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
		// SC-190: `hidden` defs (e.g. `ds-hero`) stay registered but never appear in `/ds` —
		// this is a discovery surface, and the whole point is that nobody stumbles onto it.
		const advertised = this.registry.all().filter((d) => !isDefinitionHidden(d));
		if (q === '') return advertised;
		return advertised.filter((d) => d.name.toLowerCase().includes(q) || d.aliases.some((a) => a.includes(q)));
	}

	renderSuggestion(def: ElementDefinition, el: HTMLElement): void {
		// SC-443: the row is the control (obsidian delegates the click to `.suggestion-item` and the keys to the list's scope).
		stampControl(el, 'authoring.ds.item');
		el.createDiv({ cls: 'dse-suggest__title', text: def.name });
		el.createDiv({ cls: 'dse-suggest__alias', text: def.aliases[0] });
	}

	selectSuggestion(def: ElementDefinition, _evt: MouseEvent | KeyboardEvent): void {
		if (!this.context) return;
		const { editor, start, end } = this.context;
		// SC-675: the block gets its own lines (text before / after the token stays on separate lines, every line carries the list / callout prefix).
		// SC-687: a refused pick (inside a block or the properties, where this list should not have been offered, SC-676) shows its Notice once; the
		// typed token stays as typed.
		// SC-682: close the list after EVERY pick, a written one too, and even when the write throws (measured in Obsidian 1.14.4). Obsidian does not
		// close it after an accept: for some blocks, depending on the block and where the token was (Stamina bar and Skills on an empty line, for
		// example), it keeps the old row on screen, the context is already gone so Enter does nothing, and a click is no different; and just after the
		// pick a second Enter picks again with the old token range (a second Notice, or a second block written over the first under a list item).
		// Closing it here makes the next Enter a plain new line. SC-679 did the same for the in-block key / value list.
		try {
			insertBlock(editor, buildScaffold(def), { start, end });
		} finally {
			this.close();
		}
	}
}
