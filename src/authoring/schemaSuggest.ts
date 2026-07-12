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
//    mergeShape walks the root plus every allOf entry (recursively, so a nested allOf/$ref
//    also resolves), merging `properties` and `required` from each. `$ref` entries resolve
//    against FRAMEWORK_V2_DEPENDENCY_SCHEMAS — the SAME dependency-schema data
//    ValidationService.addDependencySchema registers into AJV (main.ts onload) — rather than
//    a hand-copied list of component-wrapper property names, so the two stay in sync by
//    construction. That constant now lives in ./dependencySchemas (not main.ts): main.ts
//    imports DsSchemaSuggest (via this file), so importing it FROM main.ts here would cycle
//    (main.ts -> schemaSuggest.ts -> main.ts); main.ts re-exports it for existing external
//    call sites (tests, visual-harness) that still `import { ... } from 'main'`.
//  - onTrigger's key-suggestion context now bails on any indented line (Finding 2): the old
//    keyCtx regex matched a bare word at ANY indentation, then resolved it against the flat,
//    top-level property map — so typing an indented key under a nested object (e.g. `t` under
//    ds-roll's `tiers:`) could offer a TOP-LEVEL key (`tiers`) as if it were valid there. Nested
//    completion is future scope; a wrong suggestion is worse than none, so indented lines now
//    suppress key suggestions entirely rather than resolve against the wrong scope. Enum-value
//    completion is untouched: it already requires the key on the SAME line as `key:` immediately
//    before the cursor (enumCtx), so it can only ever resolve the key actually being completed
//    for — it has no top-level-vs-nested ambiguity to introduce, indented or not.
import { EditorSuggest, parseYaml } from 'obsidian';
import type { App, Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import type { ElementRegistry } from '@/framework/registry';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from '@/framework/dependencySchemas';
import { FENCE_LINE, scanFenceState } from './fenceScan';

type Mode = { kind: 'key'; id: string } | { kind: 'enum'; id: string; key: string };

interface SchemaProperty {
	enum?: unknown[];
}

/** Raw shape of a parsed JSON-Schema-in-YAML node, as far as this reader cares. */
interface RawSchemaNode {
	$ref?: string;
	properties?: Record<string, SchemaProperty | undefined>;
	required?: string[];
	allOf?: RawSchemaNode[];
}

interface SchemaShape {
	properties: Record<string, SchemaProperty | undefined>;
	required: string[];
}

export class DsSchemaSuggest extends EditorSuggest<string> {
	private mode: Mode | null = null;
	private readonly schemaCache = new Map<string, SchemaShape | null>();
	private dependencySchemas: Map<string, RawSchemaNode> | null = null;

	constructor(
		app: App,
		private readonly registry: ElementRegistry,
	) {
		super(app);
	}

	/** Lazily parsed, cached map of $ref id -> parsed schema node, sourced from the SAME
	 *  FRAMEWORK_V2_DEPENDENCY_SCHEMAS data main.ts registers into the real AJV validator. */
	private resolveRef(ref: string): RawSchemaNode | null {
		if (!this.dependencySchemas) {
			const map = new Map<string, RawSchemaNode>();
			for (const dep of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) {
				try {
					map.set(dep.id, parseYaml(dep.schema) as RawSchemaNode);
				} catch {
					// A malformed dependency schema just isn't offered for $ref resolution;
					// mirrors ValidationService's per-schema try/catch resilience (F1 Task-1).
				}
			}
			this.dependencySchemas = map;
		}
		return this.dependencySchemas.get(ref) ?? null;
	}

	/** Merges `properties`/`required` from a schema node, every `allOf` entry (recursively),
	 *  and `$ref` targets resolved via resolveRef — so ds-skills/ds-stam's
	 *  `allOf: [{$ref: component-wrapper}, {properties: {...}}]` shape yields the full
	 *  property set (Finding 1), while a plain `type: object` + `properties` schema
	 *  (ds-roll) is unaffected. */
	private mergeShape(node: RawSchemaNode | null | undefined, into: SchemaShape): void {
		if (!node) return;
		if (node.$ref) {
			this.mergeShape(this.resolveRef(node.$ref), into);
		}
		if (node.properties) {
			Object.assign(into.properties, node.properties);
		}
		if (Array.isArray(node.required)) {
			for (const key of node.required) {
				if (!into.required.includes(key)) into.required.push(key);
			}
		}
		if (Array.isArray(node.allOf)) {
			for (const entry of node.allOf) this.mergeShape(entry, into);
		}
	}

	private schemaFor(id: string): SchemaShape | null {
		if (!this.schemaCache.has(id)) {
			const def = this.registry.get(id);
			let shape: SchemaShape | null = null;
			if (def?.schema) {
				try {
					const root = parseYaml(def.schema) as RawSchemaNode;
					shape = { properties: {}, required: [] };
					this.mergeShape(root, shape);
				} catch {
					shape = null;
				}
			}
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
		if (!def?.schema) return null;

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
		const values = Array.isArray(prop?.enum) ? (prop!.enum as unknown[]).map(String) : [];
		return values.filter((v) => v.toLowerCase().startsWith(q));
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	selectSuggestion(value: string): void {
		if (!this.context) return;
		this.context.editor.replaceRange(value, this.context.start, this.context.end);
	}
}
