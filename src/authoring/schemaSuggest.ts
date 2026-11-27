// Plan 15 Task 4 (D9 §5.1) — key/enum autocomplete inside a ds-* fence. A supported
// EditorSuggest (NOT a CM6 extension — the squiggle linter, §5.2, stays deferred per OD-3).
// onTrigger uses the SAME top-down fence scan as the /ds suggester (./fenceScan — shared,
// not re-implemented, to avoid drift) to find the enclosing opening fence's language,
// resolves the element by that language, and offers either property names or, after "key:",
// that key's enum values. Reads def.schema, else authoring.suggestSchema (parsed once per id, cached).
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
//  - onTrigger's key-suggestion context bailed on any indented line (Finding 2): the old keyCtx regex matched a bare word at ANY
//    indentation, then resolved it against the flat, top-level property map — so typing an indented key under a nested object (e.g. `t`
//    under ds-roll's `tiers:`) could offer a TOP-LEVEL key (`tiers`) as if it were valid there. A wrong suggestion is worse than none, so
//    indented lines suppressed key suggestions entirely rather than resolve against the wrong scope. Enum-value completion got the same
//    bail: it resolved `key` against the flat top-level map too, so an indented `style:` could name-match a top-level property that is not
//    in scope there.
//
// SC-707 replaced that blanket bail with a scope walk (./schemaPath, `resolveKeyScope`). An indented line, or a `- ` list item, is
// resolved against the schema by the block structure above the cursor: each `key:` with an empty value above it, at a smaller indentation,
// opens that key's `properties[key]`; a `- ` steps into the parent's `items`; the first key on a `- key:` line and the keys aligned under
// it are siblings in that entry. The keys (and enum values after `key:`) offered are those of the object the walk ends in, never the top
// level's. It offers NOTHING unless every step resolves to a schema node: flow style (`{` `[`), block scalars (`|` `>`), a multi-line
// quote, tabs, odd indentation, an unknown key, a list whose entries are not one described object, or a callout line (`> ` in front) all
// leave the list empty. The top-level lines (no indentation, no `- `) are answered exactly as before. The walk reuses schemaShape's one
// allOf/$ref resolver (`shapeOfNode`, `itemsOfNode`); there is no second one.
//
// SC-707 also lets an element with no `schema` of its own (the initiative tracker, whose parse is its validator) complete through
// `authoring.suggestSchema` — read here and nowhere else (see AuthoringHint).
import { EditorSuggest } from 'obsidian';
import type { App, Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import { stampControl } from '@/framework/kit/controlId';
import { isDefinitionDeferredOff } from '@/framework/registry';
import type { ElementDefinition, ElementRegistry } from '@/framework/registry';
import { nodeFromSchemaYaml, shapeFromSchemaYaml, shapeOfNode, type RawSchemaNode, type SchemaShape } from './schemaShape';
import { FENCE_LINE, scanOpenFence } from './fenceScan';
import { resolveKeyScope } from './schemaPath';

/** SC-707: the schema text the autocomplete reads — the element's own `schema`, else its suggestions-only `authoring.suggestSchema`
 *  (never read by validation, the form editor or the scaffold; see AuthoringHint). */
function schemaYamlOf(def: ElementDefinition): string | undefined {
	return def.schema || def.authoring?.suggestSchema || undefined;
}

type Props = Record<string, RawSchemaNode | undefined>;
/** `props`: the properties of the NESTED object the list was resolved in (SC-707); absent for a top-level list, which reads the element's root shape. */
type Mode = { kind: 'key'; id: string; props?: Props } | { kind: 'enum'; id: string; key: string; props?: Props };

// SC-707: a line that is not at the top level. Spaces only (a tab in the indentation resolves nothing); an optional `- ` (the first key of a list
// entry); then the key being typed, or `key:` and the value typed so far. Not `-foo`: a word that starts with a dash is not a key being typed here.
const NESTED_KEY = /^( *)(-[ ]+)?((?:[A-Za-z0-9_][A-Za-z0-9_-]*)?)$/;
const NESTED_ENUM = /^( *)(-[ ]+)?([A-Za-z0-9_-]+):[ ]*(\S*)$/;

export class DsSchemaSuggest extends EditorSuggest<string> {
	private mode: Mode | null = null;
	private readonly schemaCache = new Map<string, SchemaShape | null>();
	private readonly rootCache = new Map<string, RawSchemaNode | null>();

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

	/** SC-707: the raw schema root for `id` (same text as `schemaFor`), cached per id, for the nested scope walk. */
	private rootFor(id: string): RawSchemaNode | null {
		if (!this.rootCache.has(id)) {
			const def = this.registry.get(id);
			const yaml = def ? schemaYamlOf(def) : undefined;
			this.rootCache.set(id, yaml ? nodeFromSchemaYaml(yaml) : null);
		}
		return this.rootCache.get(id) ?? null;
	}

	/** SC-707: the properties of the object the cursor's key belongs to, resolved from the block structure above the cursor line; null = offer nothing. */
	private scopeProps(editor: Editor, line: number, openLine: number, id: string, indent: number, dash: boolean): Props | null {
		const root = this.rootFor(id);
		if (!root) return null;
		const above: string[] = [];
		for (let i = openLine + 1; i < line; i++) above.push(editor.getLine(i));
		const node = resolveKeyScope(above, indent, dash, root);
		if (!node) return null;
		const props = shapeOfNode(node).properties;
		return Object.keys(props).length > 0 ? props : null;
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		// Don't trigger while the cursor sits on a fence marker line itself (opening, closing,
		// or any other fence-looking line) — that's fence syntax, not a key/value body line.
		if (FENCE_LINE.test(editor.getLine(cursor.line))) return null;

		const open = scanOpenFence(editor, cursor.line);
		if (!open || !open.lang) return null;
		const def = this.registry.get(open.lang);
		// SC-406: a deferred element (switch off) gets no key/enum autocomplete either — its
		// block renders an inert card, so offering its schema's keys would advertise it.
		if (!def || !schemaYamlOf(def) || isDefinitionDeferredOff(def)) return null;

		const before = editor.getLine(cursor.line).slice(0, cursor.ch);
		const enumCtx = /^(\s*)([A-Za-z0-9_-]+):\s*(\S*)$/.exec(before);
		if (enumCtx && enumCtx[1].length === 0) {
			// The top level: `key` is resolved against the element's root property map.
			this.mode = { kind: 'enum', id: def.id, key: enumCtx[2] };
			return { start: { line: cursor.line, ch: cursor.ch - enumCtx[3].length }, end: cursor, query: enumCtx[3] };
		}
		const keyCtx = enumCtx ? null : /^([A-Za-z0-9_-]*)$/.exec(before);
		if (keyCtx) {
			this.mode = { kind: 'key', id: def.id };
			return { start: { line: cursor.line, ch: cursor.ch - keyCtx[1].length }, end: cursor, query: keyCtx[1] };
		}
		// SC-707: an indented line, or a `- ` list entry (the top-level cases above are as they always were). Resolved against the schema by the
		// block structure above the cursor; anything that does not resolve to an object with properties offers nothing.
		const nestedEnum = NESTED_ENUM.exec(before);
		const nestedKey = nestedEnum ? null : NESTED_KEY.exec(before);
		const m = nestedEnum ?? nestedKey;
		if (!m || (m[1].length === 0 && !m[2])) return null;
		const props = this.scopeProps(editor, cursor.line, open.openLine, def.id, m[1].length, !!m[2]);
		if (!props) return null;
		if (nestedEnum) {
			this.mode = { kind: 'enum', id: def.id, key: nestedEnum[3], props };
			return { start: { line: cursor.line, ch: cursor.ch - nestedEnum[4].length }, end: cursor, query: nestedEnum[4] };
		}
		const query = nestedKey![3];
		this.mode = { kind: 'key', id: def.id, props };
		return { start: { line: cursor.line, ch: cursor.ch - query.length }, end: cursor, query };
	}

	getSuggestions(context: EditorSuggestContext): string[] {
		if (!this.mode) return [];
		const props = this.mode.props ?? this.schemaFor(this.mode.id)?.properties ?? {};
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
