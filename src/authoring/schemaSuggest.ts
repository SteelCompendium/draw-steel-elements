// Plan 15 Task 4 (D9 §5.1) — key/enum autocomplete inside a ds-* fence. A supported
// EditorSuggest (NOT a CM6 extension — the squiggle linter, §5.2, stays deferred per OD-3).
// onTrigger uses the SAME top-down fence scan as the /ds suggester (./fenceScan — shared,
// not re-implemented, to avoid drift) to find the enclosing opening fence's language,
// resolves the element by that language, and offers either property names or, after "key:",
// that key's enum values. Reads def.schema (parsed once per id, cached).
//
// Fix round 1 (review findings):
//  - schemaFor now resolves `allOf` + `$ref` (Finding 1). ds-skills/ds-stam schemas are
//    `type: object` + `allOf: [{$ref: component-wrapper}, {properties: {...}}]` — their own
//    properties live under allOf[1], not the schema root, so the old direct
//    `parsed.properties` read yielded NOTHING for those two elements (autocomplete was dead).
//    The merge/resolve logic (mergeShape/resolveRef) now lives in ./schemaShape (Task 5,
//    D9 §3.1): formModel.ts's fieldsFromSchema needs the SAME allOf/$ref resolution to build
//    form fields for ds-skills/ds-stam, so it was extracted to one shared resolver rather
//    than duplicated. shapeFromSchemaYaml there walks the root plus every allOf entry
//    (recursively, so a nested allOf/$ref also resolves), merging `properties` and
//    `required` from each; `$ref` entries resolve against FRAMEWORK_V2_DEPENDENCY_SCHEMAS —
//    the SAME dependency-schema data ValidationService.addDependencySchema registers into
//    AJV (main.ts onload) — rather than a hand-copied list of component-wrapper property
//    names, so the two stay in sync by construction. That constant lives in
//    ./dependencySchemas (not main.ts): main.ts imports DsSchemaSuggest (via this file), so
//    importing it FROM main.ts here would cycle (main.ts -> schemaSuggest.ts -> main.ts);
//    main.ts re-exports it for existing external call sites (tests, visual-harness) that
//    still `import { ... } from 'main'`.
//  - onTrigger's key-suggestion context now bails on any indented line (Finding 2): the old
//    keyCtx regex matched a bare word at ANY indentation, then resolved it against the flat,
//    top-level property map — so typing an indented key under a nested object (e.g. `t` under
//    ds-roll's `tiers:`) could offer a TOP-LEVEL key (`tiers`) as if it were valid there. Nested
//    completion is future scope; a wrong suggestion is worse than none, so indented lines now
//    suppress key suggestions entirely rather than resolve against the wrong scope. Enum-value
//    completion is untouched: it already requires the key on the SAME line as `key:` immediately
//    before the cursor (enumCtx), so it can only ever resolve the key actually being completed
//    for — it has no top-level-vs-nested ambiguity to introduce, indented or not.
import { EditorSuggest } from 'obsidian';
import type { App, Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import { stampControl } from '@/framework/kit/controlId';
import { isDefinitionDeferredOff } from '@/framework/registry';
import type { ElementDefinition, ElementRegistry } from '@/framework/registry';
import { shapeFromSchemaYaml, type SchemaShape } from './schemaShape';
import { FENCE_LINE, scanFenceState } from './fenceScan';

/** SC-707: the schema text the autocomplete reads — the element's own `schema`, else its suggestions-only `authoring.suggestSchema`
 *  (never read by validation, the form editor or the scaffold; see AuthoringHint). */
function schemaYamlOf(def: ElementDefinition): string | undefined {
	return def.schema || def.authoring?.suggestSchema || undefined;
}

type Mode = { kind: 'key'; id: string } | { kind: 'enum'; id: string; key: string };

export class DsSchemaSuggest extends EditorSuggest<string> {
	private mode: Mode | null = null;
	private readonly schemaCache = new Map<string, SchemaShape | null>();

	constructor(
		app: App,
		private readonly registry: ElementRegistry,
	) {
		super(app);
	}

	/** Resolved (root + allOf + $ref, Finding 1) shape for `id`'s schema, cached per id.
	 *  Shared with formModel.ts's fieldsFromSchema (Task 5) via ./schemaShape — no second
	 *  resolver. */
	private schemaFor(id: string): SchemaShape | null {
		if (!this.schemaCache.has(id)) {
			const def = this.registry.get(id);
			const yaml = def ? schemaYamlOf(def) : undefined;
			const shape = yaml ? shapeFromSchemaYaml(yaml) : null;
			this.schemaCache.set(id, shape);
		}
		return this.schemaCache.get(id) ?? null;
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		// Don't trigger while the cursor sits on a fence marker line itself (opening, closing,
		// or any other fence-looking line) — that's fence syntax, not a key/value body line.
		if (FENCE_LINE.test(editor.getLine(cursor.line))) return null;

		const state = scanFenceState(editor, cursor.line);
		if (!state.inFence || !state.lang) return null;
		const def = this.registry.get(state.lang);
		// SC-406: a deferred element (switch off) gets no key/enum autocomplete either — its
		// block renders an inert card, so offering its schema's keys would advertise it.
		if (!def || !schemaYamlOf(def) || isDefinitionDeferredOff(def)) return null;

		const before = editor.getLine(cursor.line).slice(0, cursor.ch);
		const enumCtx = /^(\s*)([A-Za-z0-9_-]+):\s*(\S*)$/.exec(before);
		if (enumCtx) {
			// Finding 2 (same conservatism as the key-context fix below): `key` here is
			// resolved against the FLAT top-level property map, so an indented "key: value"
			// line could coincidentally name-match a top-level property that isn't actually
			// in scope there (and offer ITS enum values). Bail on any leading indentation
			// rather than risk a wrong suggestion — this enum path is not "safe" against
			// nested scope by construction, so it gets the same treatment as key-context.
			if (enumCtx[1].length > 0) return null;
			this.mode = { kind: 'enum', id: def.id, key: enumCtx[2] };
			return { start: { line: cursor.line, ch: cursor.ch - enumCtx[3].length }, end: cursor, query: enumCtx[3] };
		}
		// Finding 2: key-name completions are resolved against the FLAT top-level property
		// map only — there is no nested-scope resolution (yet). Offering them on an indented
		// line would suggest top-level keys as if valid inside a nested object (e.g. `tiers`
		// itself, while indented under ds-roll's own `tiers:`), which is invalid there. Bail
		// on any leading whitespace rather than risk a wrong suggestion; nested completion is
		// explicitly out of scope for this fix.
		const keyCtx = /^([A-Za-z0-9_-]*)$/.exec(before);
		if (keyCtx) {
			this.mode = { kind: 'key', id: def.id };
			return { start: { line: cursor.line, ch: cursor.ch - keyCtx[1].length }, end: cursor, query: keyCtx[1] };
		}
		return null;
	}

	getSuggestions(context: EditorSuggestContext): string[] {
		if (!this.mode) return [];
		const schema = this.schemaFor(this.mode.id);
		const props = schema?.properties ?? {};
		const q = context.query.toLowerCase();
		if (this.mode.kind === 'key') {
			return Object.keys(props).filter((k) => k.toLowerCase().startsWith(q));
		}
		const prop = props[this.mode.key];
		const values = Array.isArray(prop?.enum) ? prop.enum.map(String) : [];
		return values.filter((v) => v.toLowerCase().startsWith(q));
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		// SC-443: a key row and an enum-value row are different controls (`mode` was set by the onTrigger that produced this list).
		stampControl(el, this.mode?.kind === 'enum' ? 'authoring.schema.value' : 'authoring.schema.key');
		el.setText(value);
	}

	selectSuggestion(value: string): void {
		if (!this.context) return;
		const { editor, start } = this.context;
		let { end } = this.context;
		let text = value;
		if (this.mode?.kind === 'enum') {
			// SC-688, the VALUE list only (the key list's mid-word accept is SC-678 and is left as it was):
			//  - An accept replaces the whole value word under the cursor, not just the part before it, so `mode: op|posed` + `opposed` is
			//    `mode: opposed` and not `mode: opposedposed`: the range runs on to the next whitespace (or the end of the line).
			//  - The list opens on `mode:` with no space (the user already sees it there), so a value that starts right after the colon is written
			//    behind one space, `mode: power-roll`; `mode:power-roll` is not a mapping entry and the block renders a parse error card.
			const line = editor.getLine(start.line);
			let to = end.ch;
			while (to < line.length && !/\s/.test(line[to])) to++;
			end = { line: end.line, ch: to };
			if (start.ch > 0 && line[start.ch - 1] === ':') text = ' ' + value;
		}
		editor.replaceRange(text, start, end);
		// SC-679, two steps (measured in Obsidian 1.14.4):
		//  - With nothing typed (start == end) the write lands AT the cursor and a cursor at an insert point stays in front of it, so the next
		//    Enter wrote a second word ahead of the accepted one: put it behind the word, as the /ds suggester does.
		//  - Without close() the list stays up after an accept: Obsidian runs onTrigger again at the new cursor and refreshes the still-OPEN list
		//    (a one-row list repeating the accepted word), so the next Enter accepts it again (`heightheight`, `recoveriesoveries`). close() takes
		//    it down at once; Obsidian opens a CLOSED list again only on typed input, so nothing else is needed.
		editor.setCursor({ line: start.line, ch: start.ch + text.length });
		this.close();
	}
}
