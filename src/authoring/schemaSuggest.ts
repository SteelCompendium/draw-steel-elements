// Plan 15 Task 4 (D9 §5.1) — key/enum autocomplete inside a ds-* fence. A supported
// EditorSuggest (NOT a CM6 extension — the squiggle linter, §5.2, stays deferred per OD-3).
// onTrigger uses the SAME top-down fence scan as the /ds suggester (./fenceScan — shared,
// not re-implemented, to avoid drift) to find the enclosing opening fence's language,
// resolves the element by that language, and offers either property names or, after "key:",
// that key's enum values. Reads def.schema (parsed once per id, cached).
import { EditorSuggest, parseYaml } from 'obsidian';
import type { App, Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import type { ElementRegistry } from '@/framework/registry';
import { FENCE_LINE, scanFenceState } from './fenceScan';

type Mode = { kind: 'key'; id: string } | { kind: 'enum'; id: string; key: string };

interface SchemaShape {
	properties?: Record<string, { enum?: unknown[] } | undefined>;
}

export class DsSchemaSuggest extends EditorSuggest<string> {
	private mode: Mode | null = null;
	private readonly schemaCache = new Map<string, SchemaShape | null>();

	constructor(
		app: App,
		private readonly registry: ElementRegistry,
	) {
		super(app);
	}

	private schemaFor(id: string): SchemaShape | null {
		if (!this.schemaCache.has(id)) {
			const def = this.registry.get(id);
			let parsed: SchemaShape | null = null;
			if (def?.schema) {
				try {
					parsed = parseYaml(def.schema) as SchemaShape;
				} catch {
					parsed = null;
				}
			}
			this.schemaCache.set(id, parsed);
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
			this.mode = { kind: 'enum', id: def.id, key: enumCtx[2] };
			return { start: { line: cursor.line, ch: cursor.ch - enumCtx[3].length }, end: cursor, query: enumCtx[3] };
		}
		const keyCtx = /^(\s*)([A-Za-z0-9_-]*)$/.exec(before);
		if (keyCtx) {
			this.mode = { kind: 'key', id: def.id };
			return { start: { line: cursor.line, ch: cursor.ch - keyCtx[2].length }, end: cursor, query: keyCtx[2] };
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
