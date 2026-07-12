// Plan 15 Task 4 (D9 §5.1) — key/enum autocomplete scoped to a ds-* fence body. onTrigger
// finds the enclosing opening fence (bail if a closing fence is hit first), resolves the
// element, and offers property names (key context) or enum values (after "key:").
//
// Fix round 1: schemaFor now resolves allOf/$ref (Finding 1 — ds-skills/ds-stam's real
// schemas are `type: object` + `allOf: [{$ref: component-wrapper}, {properties: {...}}]`,
// so their own properties + the shared collapsible/collapse_default only surface if allOf
// and $ref are both walked), and key-context suggestions bail on indented lines (Finding 2).
import { DsSchemaSuggest } from '../../../src/authoring/schemaSuggest';
import { createElementRegistry, type ElementDefinition } from '../../../src/framework/registry';
import { skillsElement } from '../../../src/elements/skills/definition';
import { staminaBarElement } from '../../../src/elements/stamina-bar/definition';
import { rollElement } from '../../../src/elements/roll/definition';
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

// Finding 2 — key suggestions must not mis-fire on nested/indented lines. ds-roll's
// `tiers:` is a nested object with its OWN t1/t2/t3 properties; the flat top-level
// property map only knows about `tiers` itself, so an indented `t` must not resolve
// against it (that would incorrectly offer `tiers` again, invalid inside `tiers:`).
test('indented key under a nested object → no key suggestions (bails, does not mis-resolve)', () => {
	const s = realSuggest();
	const editor = new Editor('```ds-roll\ntiers:\n  t');
	const info = s.onTrigger({ line: 2, ch: 3 }, editor as never, null);
	expect(info).toBeNull();
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
