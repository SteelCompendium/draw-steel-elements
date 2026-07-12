// Plan 15 Task 4 (D9 §5.1) — key/enum autocomplete scoped to a ds-* fence body. onTrigger
// finds the enclosing opening fence (bail if a closing fence is hit first), resolves the
// element, and offers property names (key context) or enum values (after "key:").
import { DsSchemaSuggest } from '../../../src/authoring/schemaSuggest';
import { createElementRegistry, type ElementDefinition } from '../../../src/framework/registry';
// Editor/App are imported from the mock directly (not the bare 'obsidian' specifier): the
// real obsidian.d.ts declares Editor abstract and EditorSuggestContext.file non-nullable, so
// `new Editor(...)` and the `file: null` context stubs below only type-check against the
// concrete jest-free mock (established pattern — see test/dom/authoring/suggest.test.ts).
import { Editor, App } from '../../mocks/obsidian';

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
