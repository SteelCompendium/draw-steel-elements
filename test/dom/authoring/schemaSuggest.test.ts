// Plan 15 Task 4 (D9 §5.1) — key/enum autocomplete scoped to a ds-* fence body. onTrigger
// finds the enclosing opening fence (bail if a closing fence is hit first), resolves the
// element, and offers property names (key context) or enum values (after "key:").
//
// Fix round 1: schemaFor now resolves allOf/$ref (Finding 1 — ds-skills/ds-stam's real
// schemas are `type: object` + `allOf: [{$ref: component-wrapper}, {properties: {...}}]`,
// so their own properties + the shared collapsible/collapse_default only surface if allOf
// and $ref are both walked), and key-context suggestions bail on indented lines (Finding 2).
import { DsSchemaSuggest } from '../../../src/authoring/schemaSuggest';
import { scanFenceState } from '../../../src/authoring/fenceScan';
import { createElementRegistry, type ElementDefinition } from '../../../src/framework/registry';
import { skillsElement } from '../../../src/elements/skills/definition';
import { staminaBarElement } from '../../../src/elements/stamina-bar/definition';
import { rollElement } from '../../../src/elements/roll/definition';
// Editor/App are imported from the mock directly (not the bare 'obsidian' specifier): the
// real obsidian.d.ts declares Editor abstract and EditorSuggestContext.file non-nullable, so
// `new Editor(...)` and the `file: null` context stubs below only type-check against the
// concrete jest-free mock (established pattern — see test/dom/authoring/suggest.test.ts).
import { Editor, App } from '../../mocks/obsidian';
import { setExperimental } from '../../../src/framework/experimental';
import { surgesElement } from '../../../src/elements/surges/definition';
import { heroElement } from '../../../src/elements/hero/definition';
import { EditorSelection, EditorState } from '@codemirror/state';
import { fieldsFromSchema } from '../../../src/authoring/formModel';
import { buildScaffold } from '../../../src/authoring/scaffold';

const SCHEMA = `
type: object
properties:
  name: { type: string }
  style: { type: string, enum: [card, flat] }
`;

function suggest() {
	const registry = createElementRegistry();
	registry.register({
		id: 'x', name: 'X', aliases: ['ds-x'], shape: 'static', schema: SCHEMA,
		parse: (d) => d, createView: () => ({} as never),
	} as ElementDefinition);
	return new DsSchemaSuggest(new App() as any, registry);
}

/** A registry carrying the REAL skills/stamina-bar/roll element definitions (their actual
 *  schema.yaml content, not a synthetic stand-in) — used to prove Finding 1's allOf/$ref
 *  resolution against the exact schemas the review flagged as dead. */
function realSuggest() {
	const registry = createElementRegistry();
	registry.register(skillsElement as unknown as ElementDefinition);
	registry.register(staminaBarElement as unknown as ElementDefinition);
	registry.register(rollElement as unknown as ElementDefinition);
	return new DsSchemaSuggest(new App() as any, registry);
}

test('key context inside the fence → property-name completions', () => {
	const s = suggest();
	const editor = new Editor('```ds-x\nna');
	const info = s.onTrigger({ line: 1, ch: 2 }, editor as never, null);
	expect(info).not.toBeNull();
	expect(s.getSuggestions({ ...info!, editor: editor as never, file: null as never })).toEqual(['name']);
});

test('enum context after "style:" → enum values', () => {
	const s = suggest();
	const editor = new Editor('```ds-x\nstyle: ');
	const info = s.onTrigger({ line: 1, ch: 7 }, editor as never, null);
	expect(info).not.toBeNull();
	expect(s.getSuggestions({ ...info!, editor: editor as never, file: null as never })).toEqual(['card', 'flat']);
});

test('outside any ds fence → no trigger', () => {
	const s = suggest();
	const editor = new Editor('just prose\nna');
	expect(s.onTrigger({ line: 1, ch: 2 }, editor as never, null)).toBeNull();
});

test('a closing fence above the cursor means NOT inside → no trigger', () => {
	const s = suggest();
	const editor = new Editor('```ds-x\nname: A\n```\nna');
	expect(s.onTrigger({ line: 3, ch: 2 }, editor as never, null)).toBeNull();
});

test('unknown fence language → no trigger', () => {
	const s = suggest();
	const editor = new Editor('```python\nna');
	expect(s.onTrigger({ line: 1, ch: 2 }, editor as never, null)).toBeNull();
});

// Finding 1 — allOf/$ref resolution. ds-skills and ds-stam are `type: object` +
// `allOf: [{$ref: component-wrapper}, {properties: {...}}]`; the old direct
// `parsed.properties` read never walked allOf, so schemaFor saw zero properties for
// either element and autocomplete was dead. These use the REAL element definitions
// (real schema.yaml content) rather than a synthetic stand-in.
test('ds-skills fence resolves allOf/$ref: offers component-wrapper fields + its own inline properties', () => {
	const s = realSuggest();
	const editor = new Editor('```ds-skills\n');
	const info = s.onTrigger({ line: 1, ch: 0 }, editor as never, null);
	expect(info).not.toBeNull();
	const keys = s.getSuggestions({ ...info!, editor: editor as never, file: null as never });
	// From the component-wrapper $ref:
	expect(keys).toContain('collapsible');
	expect(keys).toContain('collapse_default');
	// From SkillsSchema.yaml's own allOf[1].properties:
	expect(keys).toContain('only_show_selected');
	expect(keys).toContain('skills');
	expect(keys).toContain('custom_skills');
});

test('ds-stam fence resolves allOf/$ref: offers component-wrapper fields + its own inline properties', () => {
	const s = realSuggest();
	const editor = new Editor('```ds-stam\n');
	const info = s.onTrigger({ line: 1, ch: 0 }, editor as never, null);
	expect(info).not.toBeNull();
	const keys = s.getSuggestions({ ...info!, editor: editor as never, file: null as never });
	expect(keys).toContain('collapsible');
	expect(keys).toContain('collapse_default');
	expect(keys).toContain('max_stamina');
	expect(keys).toContain('current_stamina');
	expect(keys).toContain('style');
});

test('ds-roll fence (no allOf) is unchanged: only its own top-level properties are offered', () => {
	const s = realSuggest();
	const editor = new Editor('```ds-roll\n');
	const info = s.onTrigger({ line: 1, ch: 0 }, editor as never, null);
	expect(info).not.toBeNull();
	const keys = s.getSuggestions({ ...info!, editor: editor as never, file: null as never });
	expect(keys).toContain('tiers');
	expect(keys).toContain('mode');
	// No component-wrapper $ref on ds-roll (D5 §5.4 — no collapsible chrome).
	expect(keys).not.toContain('collapsible');
	expect(keys).not.toContain('collapse_default');
});

// Finding 2 — key suggestions must not mis-fire on nested/indented lines. ds-roll's `tiers:` is a nested object with its OWN t1/t2/t3
// properties; the flat top-level property map only knows about `tiers` itself, so an indented `t` must never resolve against it (that
// would offer `tiers` again, invalid inside `tiers:`). Since SC-707 the line resolves against the nested object instead: `t` offers t1..t3.
test('indented key under a nested object → the nested object\'s keys (SC-707), never the top level\'s', () => {
	const s = realSuggest();
	const editor = new Editor('```ds-roll\ntiers:\n  t');
	const info = s.onTrigger({ line: 2, ch: 3 }, editor as never, null);
	expect(info).not.toBeNull();
	expect(s.getSuggestions({ ...info!, editor: editor as never, file: null as never })).toEqual(['t1', 't2', 't3']);
});

test('top-level key (no indentation) still resolves normally → suggests "tiers"', () => {
	const s = realSuggest();
	const editor = new Editor('```ds-roll\nt');
	const info = s.onTrigger({ line: 1, ch: 1 }, editor as never, null);
	expect(info).not.toBeNull();
	const keys = s.getSuggestions({ ...info!, editor: editor as never, file: null as never });
	expect(keys).toEqual(['tiers']);
});

// Enum-value suggestions get the same conservatism: an indented "key: value" line must
// not resolve against the flat top-level property map either.
test('indented enum context → no suggestions (same conservatism as key context)', () => {
	const s = suggest();
	const editor = new Editor('```ds-x\n  style: ');
	const info = s.onTrigger({ line: 1, ch: 9 }, editor as never, null);
	expect(info).toBeNull();
});

// SC-406 — a deferred element gets no in-fence autocomplete while the switch is off (its block
// renders an inert card), but ds-hero — `hidden` since SC-190, deferred since SC-406 — keeps
// every key it offered before with the switch ON.
describe('SC-406 — deferred elements and key autocomplete', () => {
	function deferredSuggest() {
		const registry = createElementRegistry();
		registry.register(surgesElement as unknown as ElementDefinition);
		registry.register(heroElement as unknown as ElementDefinition);
		return new DsSchemaSuggest(new App() as any, registry);
	}
	const keysIn = (s: DsSchemaSuggest, lang: string): string[] | null => {
		const editor = new Editor('```' + lang + '\n');
		const info = s.onTrigger({ line: 1, ch: 0 }, editor as never, null);
		return info === null ? null : (s.getSuggestions({ ...info, editor: editor as never, file: null as never }) as string[]);
	};

	test('off: no trigger inside a ds-surges or ds-hero fence', () => {
		setExperimental(false);
		const s = deferredSuggest();
		expect(keysIn(s, 'ds-surges')).toBeNull();
		expect(keysIn(s, 'ds-hero')).toBeNull();
	});

	test('on: ds-surges and the hidden ds-hero are offered their keys exactly as before', () => {
		setExperimental(true);
		const s = deferredSuggest();
		expect(keysIn(s, 'ds-surges')!.length).toBeGreaterThan(0);
		expect(keysIn(s, 'ds-hero')!.length).toBeGreaterThanOrEqual(17);
	});
});

// SC-476 — the block's type is the FIRST whitespace-delimited token of the opening line's info
// string (the rest of DSE reads it that way); scanFenceState used to return the whole info string.
describe('SC-476 — extra words after the fence language', () => {
	const langAt = (opener: string) => scanFenceState(new Editor(opener + '\nbody') as never, 1).lang;

	test.each([
		['extra words after the language', '```ds-counter extra', 'ds-counter'],
		['leading space before the language', '``` ds-counter', 'ds-counter'],
		['a tab between the language and the extra word', '```ds-counter\textra', 'ds-counter'],
		['a tilde fence with extra words', '~~~ds-counter extra words', 'ds-counter'],
		['a callout-prefixed fence with extra words', '> ```ds-counter extra', 'ds-counter'],
		['the language alone (unchanged)', '```ds-counter', 'ds-counter'],
		['SC-457: a no-break space right after the name (Live Preview renders it as the block)', '```ds-counter\u00a0x', 'ds-counter'],
		['SC-457: two spaces then a word (the language is the first word only)', '```ds-counter  extra', 'ds-counter'],
		['SC-457: a trailing U+3000 then a word', '```ds-counter\u3000 extra', 'ds-counter'],
		['SC-457: a trailing no-break space after the name (Obsidian renders it as the block)', '```ds-counter\u00a0', 'ds-counter'],
		['SC-457: a trailing U+3000 after the name', '``` ds-counter\u3000', 'ds-counter'],
		['SC-457: a no-break space before the name is not a ds-counter (Obsidian does not render it)', '```\u00a0ds-counter', '\u00a0ds-counter'],
		['SC-457: U+3000 before the name is not a ds-counter', '``` \u3000ds-counter', '\u3000ds-counter'],
		['mixed case is kept: Obsidian only renders an exact-case language', '```DS-Counter extra', 'DS-Counter'],
		['a tilde fence may carry a backtick in its info string', '~~~ds-counter `x`', 'ds-counter'],
	])('scanFenceState lang: %s', (_name, opener, expected) => {
		expect(langAt(opener)).toBe(expected);
	});

	test('a backtick fence whose info string contains a backtick is not an opener (CommonMark)', () => {
		expect(langAt('```ds-counter `x`')).toBeNull();
		expect(scanFenceState(new Editor('```ds-counter `x`\n```js\nbody') as never, 2).lang).toBe('js');
	});

	test('a bare fence has the empty language; outside a fence it is null', () => {
		expect(langAt('```')).toBe('');
		expect(langAt('```   ')).toBe('');
		expect(scanFenceState(new Editor('prose\nbody') as never, 1).lang).toBeNull();
	});

	test('a block opened with extra info words still gets key completions', () => {
		const s = suggest();
		const editor = new Editor('```ds-x extra words\nna');
		const info = s.onTrigger({ line: 1, ch: 2 }, editor as never, null);
		expect(info).not.toBeNull();
		expect(s.getSuggestions({ ...info!, editor: editor as never, file: null as never })).toEqual(['name']);
	});

	test('a block opened with extra info words still gets enum completions', () => {
		const s = suggest();
		const editor = new Editor('~~~ ds-x\textra\nstyle: ');
		const info = s.onTrigger({ line: 1, ch: 7 }, editor as never, null);
		expect(info).not.toBeNull();
		expect(s.getSuggestions({ ...info!, editor: editor as never, file: null as never })).toEqual(['card', 'flat']);
	});

	// The REAL ds-stamina-bar definition, not the synthetic ds-x: guards the example the CHANGELOG gives.
	test('a real ds-stamina-bar block opened with extra info words gets the same keys as the bare opener', () => {
		const keysAt = (opener: string) => {
			const s = realSuggest();
			const editor = new Editor(opener + '\n');
			const info = s.onTrigger({ line: 1, ch: 0 }, editor as never, null);
			return info === null ? null : s.getSuggestions({ ...info, editor: editor as never, file: null as never });
		};
		const bare = keysAt('```ds-stamina-bar');
		expect(bare).toContain('max_stamina');
		expect(keysAt('```ds-stamina-bar extra')).toEqual(bare);
	});

	test('a language written in a different case never renders, so it gets no completions', () => {
		const s = realSuggest();
		for (const opener of ['```DS-Stamina-Bar', '```DS-Stamina-Bar extra']) {
			const editor = new Editor(opener + '\n');
			expect(s.onTrigger({ line: 1, ch: 0 }, editor as never, null)).toBeNull();
		}
	});

	test('a backtick-in-info line is not a block opener, so it gets no completions', () => {
		const s = realSuggest();
		const editor = new Editor('```ds-stamina-bar `x`\n');
		expect(s.onTrigger({ line: 1, ch: 0 }, editor as never, null)).toBeNull();
	});
});

// SC-679 — accepting a suggestion. The jest-free mock Editor never changes its text, and a real editor maps the cursor through a write: a
// cursor AT the point where text is inserted stays in front of it. So these use a small editor over a real CodeMirror 6 EditorState (only the
// surface src/authoring touches), which is what made the bug visible: with nothing typed (start == end) the cursor stayed before the value.
describe('SC-679 — after an accept the cursor is behind the value and the list is closed', () => {
	class CmDoc {
		state: EditorState;
		constructor(text: string, cursor: { line: number; ch: number }) {
			this.state = EditorState.create({ doc: text });
			this.setCursor(cursor);
		}
		private offset(p: { line: number; ch: number }): number {
			const line = this.state.doc.line(p.line + 1);
			return line.from + Math.min(p.ch, line.length);
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
		getCursor(): { line: number; ch: number } {
			const head = this.state.selection.main.head;
			const line = this.state.doc.lineAt(head);
			return { line: line.number - 1, ch: head - line.from };
		}
		setCursor(p: { line: number; ch: number }): void {
			this.state = this.state.update({ selection: EditorSelection.cursor(this.offset(p)) }).state;
		}
		replaceRange(text: string, from: { line: number; ch: number }, to: { line: number; ch: number }): void {
			this.state = this.state.update({ changes: { from: this.offset(from), to: this.offset(to), insert: text } }).state;
		}
		/** What typing does: insert at the cursor, cursor behind it. */
		type(text: string): void {
			this.state = this.state.update(this.state.replaceSelection(text)).state;
		}
		backspace(): void {
			const head = this.state.selection.main.head;
			this.state = this.state.update({ changes: { from: head - 1, to: head }, selection: EditorSelection.cursor(head - 1) }).state;
		}
	}

	/** Open the suggester where the editor's cursor is, as Obsidian does on every editor change. */
	const trigger = (s: DsSchemaSuggest, editor: CmDoc) => {
		const info = s.onTrigger(editor.getCursor(), editor as never, null);
		return info === null ? null : { info, rows: s.getSuggestions({ ...info, editor: editor as never, file: null as never }) as string[] };
	};
	/** Accept `value` from the open list (Obsidian sets `context` from the trigger before it asks for rows). */
	const accept = (s: DsSchemaSuggest, editor: CmDoc, value: string) => {
		const opened = trigger(s, editor)!;
		expect(opened.rows).toContain(value);
		s.context = { editor: editor as never, file: null as never, ...opened.info };
		s.selectSuggestion(value);
	};
	const stam = (body: string, cursor: { line: number; ch: number }) => ({ s: realSuggest(), editor: new CmDoc('```ds-stam\n' + body + '\n```', cursor) });

	test('key list, nothing typed: the cursor is behind the key, which is on the line whole', () => {
		const { s, editor } = stam('', { line: 1, ch: 0 });
		accept(s, editor, 'collapsible');
		expect(editor.getLine(1)).toBe('collapsible');
		expect(editor.getCursor()).toEqual({ line: 1, ch: 11 });
	});

	test('value list, nothing typed: the cursor is behind the value', () => {
		const s = suggest();
		const editor = new CmDoc('```ds-x\nstyle: \n```', { line: 1, ch: 7 });
		accept(s, editor, 'flat');
		expect(editor.getLine(1)).toBe('style: flat');
		expect(editor.getCursor()).toEqual({ line: 1, ch: 11 });
	});

	test('a typed prefix is replaced and the cursor is behind the key (key list and value list)', () => {
		const a = stam('cur', { line: 1, ch: 3 });
		accept(a.s, a.editor, 'current_stamina');
		expect(a.editor.getLine(1)).toBe('current_stamina');
		expect(a.editor.getCursor()).toEqual({ line: 1, ch: 15 });
		const s = suggest();
		const editor = new CmDoc('```ds-x\nstyle: fl\n```', { line: 1, ch: 9 });
		accept(s, editor, 'flat');
		expect(editor.getLine(1)).toBe('style: flat');
		expect(editor.getCursor()).toEqual({ line: 1, ch: 11 });
	});

	test('the accept closes the list once (key list and value list)', () => {
		const { s, editor } = stam('', { line: 1, ch: 0 });
		const close = jest.spyOn(s, 'close');
		accept(s, editor, 'max_stamina');
		expect(close).toHaveBeenCalledTimes(1);
		const v = suggest();
		const vclose = jest.spyOn(v, 'close');
		accept(v, new CmDoc('```ds-x\nstyle: \n```', { line: 1, ch: 7 }), 'card');
		expect(vclose).toHaveBeenCalledTimes(1);
	});

	test('after an accept onTrigger answers as it does for the same text and cursor without one (a key that starts a longer key: recoveries / recoveries_max)', () => {
		const { s, editor } = stam('rec', { line: 1, ch: 3 });
		expect(trigger(s, editor)!.rows).toEqual(['recoveries', 'recoveries_max']);
		accept(s, editor, 'recoveries');
		const fresh = stam('recoveries', { line: 1, ch: 10 });
		expect(editor.getValue()).toBe(fresh.editor.getValue());
		expect(editor.getCursor()).toEqual(fresh.editor.getCursor());
		expect(trigger(s, editor)).toEqual(trigger(fresh.s, fresh.editor));
		expect(trigger(s, editor)!.rows).toEqual(['recoveries', 'recoveries_max']);
		editor.type('_');
		expect(trigger(s, editor)!.rows).toEqual(['recoveries_max']);
		editor.backspace();
		expect(trigger(s, editor)!.rows).toEqual(['recoveries', 'recoveries_max']);
	});

	test('typing on after an accept behaves as before: `: ` after a key opens its value list', () => {
		const { s, editor } = stam('sty', { line: 1, ch: 3 });
		accept(s, editor, 'style');
		editor.type(': ');
		expect(trigger(s, editor)!.rows).toEqual(['default', 'sheet']);
	});

	test('unchanged: a letter lists every key that starts with it, and a fully typed key (not accepted) still lists itself and the longer keys', () => {
		const c = stam('c', { line: 1, ch: 1 });
		expect(trigger(c.s, c.editor)!.rows).toEqual(['collapsible', 'collapse_default', 'current_stamina']);
		const full = stam('recoveries', { line: 1, ch: 10 });
		expect(trigger(full.s, full.editor)!.rows).toEqual(['recoveries', 'recoveries_max']);
		const only = stam('style', { line: 1, ch: 5 });
		expect(trigger(only.s, only.editor)!.rows).toEqual(['style']);
	});

	test('an accept with no context does nothing: no write, the cursor stays, the list is not closed', () => {
		const { s, editor } = stam('c', { line: 1, ch: 1 });
		const close = jest.spyOn(s, 'close');
		s.context = null;
		s.selectSuggestion('collapsible');
		expect(editor.getLine(1)).toBe('c');
		expect(editor.getCursor()).toEqual({ line: 1, ch: 1 });
		expect(close).not.toHaveBeenCalled();
	});
});

// SC-707 — `authoring.suggestSchema`: a suggestions-only schema. The autocomplete reads it when the element has no `schema`; nothing else does.
describe('SC-707 — authoring.suggestSchema is read by the autocomplete only', () => {
	const SUGGEST_ONLY = `
type: object
properties:
  title: { type: string }
  mode: { type: string, enum: [fast, slow] }
`;
	const defOf = (extra: Partial<ElementDefinition>): ElementDefinition =>
		({ id: 'y', name: 'Y', aliases: ['ds-y'], shape: 'static', parse: (d: unknown) => d, createView: () => ({} as never), ...extra }) as ElementDefinition;
	const suggestFor = (def: ElementDefinition) => {
		const registry = createElementRegistry();
		registry.register(def);
		return new DsSchemaSuggest(new App() as any, registry);
	};
	const keysIn = (s: DsSchemaSuggest, body: string): string[] | null => {
		const editor = new Editor('```ds-y\n' + body);
		const line = editor.lineCount() - 1;
		const info = s.onTrigger({ line, ch: editor.getLine(line).length }, editor as never, null);
		return info === null ? null : (s.getSuggestions({ ...info, editor: editor as never, file: null as never }) as string[]);
	};

	test('an element with only a suggestSchema offers its keys and its enum values', () => {
		const s = suggestFor(defOf({ authoring: { suggestSchema: SUGGEST_ONLY } }));
		expect(keysIn(s, '')).toEqual(['title', 'mode']);
		expect(keysIn(s, 'mode: ')).toEqual(['fast', 'slow']);
	});

	test('def.schema wins over suggestSchema when both are present', () => {
		const s = suggestFor(defOf({ schema: SCHEMA, authoring: { suggestSchema: SUGGEST_ONLY } }));
		expect(keysIn(s, '')).toEqual(['name', 'style']);
	});

	test('the SC-406 deferred-off check covers a suggestSchema-only element', () => {
		const def = defOf({ deferred: true, authoring: { suggestSchema: SUGGEST_ONLY } });
		setExperimental(false);
		expect(keysIn(suggestFor(def), '')).toBeNull();
		setExperimental(true);
		expect(keysIn(suggestFor(def), '')).toEqual(['title', 'mode']);
	});

	test('validation, the form and the scaffold do not see it: no form fields, the scaffold is the plain placeholder', () => {
		const def = defOf({ authoring: { suggestSchema: SUGGEST_ONLY } });
		expect(fieldsFromSchema(def)).toEqual([]);
		expect(buildScaffold(def).text).toBe('```ds-y\n# fill in fields\n```');
	});
});
