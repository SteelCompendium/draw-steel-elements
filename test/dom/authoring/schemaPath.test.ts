// SC-707 — nested completion in the in-block autocomplete: the cursor's YAML path (indentation and `- ` list entries) resolved against the schema.
// Real elements (the initiative tracker's suggestions-only schema, ds-roll's `tiers`, ds-skills' `custom_skills`) plus a synthetic schema for the
// shapes no shipped element has. A list is what `offered` returns at the END of the document: null = the list does not open at all.
import { DsSchemaSuggest } from '../../../src/authoring/schemaSuggest';
import { createElementRegistry } from '../../../src/framework/registry';
import type { ElementDefinition } from '../../../src/framework/registry';
import { setExperimental } from '../../../src/framework/experimental';
import { registerFrameworkElementDefinitions } from 'main';
import { App } from '../../mocks/obsidian';
import { CmEditor } from './_cmEditor';

const real = () => {
	const r = createElementRegistry();
	registerFrameworkElementDefinitions(r);
	return r;
};
const SYNTH = `
type: object
properties:
  title: { type: string }
  mode: { type: string, enum: [fast, slow] }
  note: { type: string }
  tags:
    type: array
    items: { type: string, enum: [a, b] }
  entries:
    type: array
    items:
      type: object
      properties:
        id: { type: string }
        kind: { type: string, enum: [one, two] }
        parts:
          type: array
          items:
            type: object
            properties:
              label: { type: string }
              size: { type: string, enum: [s, m, l] }
  mixed:
    type: array
    items:
      oneOf:
        - type: string
        - type: object
          properties:
            key: { type: string }
  box:
    type: object
    properties:
      width: { type: number }
      inner:
        type: object
        properties:
          depth: { type: number }
          unit: { type: string, enum: [cm, in] }
`;
const synth = () => {
	const r = createElementRegistry();
	r.register({ id: 'x', name: 'X', aliases: ['ds-x'], shape: 'static', schema: SYNTH, parse: (d: unknown) => d, createView: () => ({} as never) } as ElementDefinition);
	return r;
};

function offered(registry: ReturnType<typeof real>, fence: string, body: string): string[] | null {
	const s = new DsSchemaSuggest(new App() as any, registry);
	const editor = new CmEditor('```' + fence + '\n' + body);
	const line = editor.lineCount() - 1;
	const info = s.onTrigger({ line, ch: editor.getLine(line).length }, editor as never, null);
	return info === null ? null : (s.getSuggestions({ editor: editor as never, file: null as never, ...info }) as string[]);
}
const init = (body: string) => offered(real(), 'ds-initiative', body);
const x = (body: string) => offered(synth(), 'ds-x', body);

const HERO_KEYS = ['name', 'max_stamina', 'statblock', 'current_stamina', 'temp_stamina', 'image', 'conditions'];
const CREATURE_KEYS = ['name', 'max_stamina', 'amount', 'statblock', 'image', 'squad_role', 'captain_of', 'with_captain_stamina'];

describe('SC-707 nested keys: the initiative tracker', () => {
	test('the first key on a `- ` line of a hero: the hero\'s keys (max_stamina is one), not the top level\'s', () => {
		expect(init('heroes:\n  - ')).toEqual(HERO_KEYS);
		expect(init('heroes:\n  - max')).toEqual(['max_stamina']);
		expect(init('heroes:\n- max')).toEqual(['max_stamina']); // the non-indented list style
	});

	test('a key aligned under the `- name:` line of a hero is a sibling in that hero', () => {
		expect(init('heroes:\n  - name: Frodo\n    max')).toEqual(['max_stamina']);
		expect(init('heroes:\n  - name: Frodo\n    ')).toEqual(HERO_KEYS);
	});

	test('the second hero is resolved like the first (the previous entry\'s keys do not leak)', () => {
		expect(init('heroes:\n  - name: Frodo\n    max_stamina: 80\n  - name: Sam\n    ima')).toEqual(['image']);
	});

	test('a creature, two lists deep (enemy_groups > creatures): the creature\'s keys', () => {
		const doc = 'enemy_groups:\n  - name: Orcs\n    creatures:\n      - name: Orc\n        ';
		expect(init(doc)).toEqual(CREATURE_KEYS);
		expect(init(doc + 'max')).toEqual(['max_stamina']);
		expect(init('enemy_groups:\n  - name: Orcs\n    creatures:\n      - max')).toEqual(['max_stamina']);
	});

	test('the group level (between the list and its creatures) is the group\'s keys', () => {
		expect(init('enemy_groups:\n  - name: Orcs\n    ')).toEqual(['name', 'creatures', 'is_squad']);
		expect(init('enemy_groups:\n  - name: Orcs\n    creatures:\n      - name: Orc\n    is_')).toEqual(['is_squad']);
	});

	test('the malice object: its own keys', () => {
		expect(init('malice:\n  ')).toEqual(['value', 'round_gain']);
		expect(init('malice:\n  round')).toEqual(['round_gain']);
	});

	test('an enum nested under a creature: `squad_role:` offers the roles, on a `- ` line and under it', () => {
		const head = 'enemy_groups:\n  - name: Squad\n    creatures:\n';
		expect(init(head + '      - name: G\n        squad_role: ')).toEqual(['minion', 'captain', 'attached']);
		expect(init(head + '      - name: G\n        squad_role: ca')).toEqual(['captain']);
		expect(init(head + '      - squad_role: ')).toEqual(['minion', 'captain', 'attached']);
	});

	test('an enum key that is not in the nested object offers no values (`name` has none)', () => {
		expect(init('heroes:\n  - name: ')).toEqual([]);
		expect(init('heroes:\n  - squad_role: ')).toEqual([]);
	});

	test('a top-level key is never offered inside a nested object (`heroes`, `malice`, `round` are not hero keys)', () => {
		for (const typed of ['hero', 'mal', 'rou', 'enemy']) expect(init('heroes:\n  - name: A\n    ' + typed)).toEqual([]);
		expect(init('malice:\n  hero')).toEqual([]);
	});

	test('a bare word in a `conditions:` list is a condition name, never a key (the entries are strings or objects: no entry schema)', () => {
		expect(init('heroes:\n  - name: A\n    conditions:\n      - gra')).toBeNull();
		expect(init('heroes:\n  - name: A\n    conditions:\n      - ')).toBeNull();
		expect(init('heroes:\n  - name: A\n    conditions:\n      - key: grabbed\n        dur')).toBeNull();
	});

	test('the top level is untouched: a bare word at column 0 after nested content still lists the top-level keys', () => {
		expect(init('heroes:\n  - name: A\n    max_stamina: 5\nmal')).toEqual(['malice']);
		expect(init('heroes:\n  - name: A\nround: ')).toEqual([]);
	});
});

describe('SC-707 nested keys: other elements with nested objects', () => {
	test('ds-roll `tiers:` offers t1 / t2 / t3, and `tiers` itself is not offered inside it', () => {
		expect(offered(real(), 'ds-roll', 'tiers:\n  ')).toEqual(['t1', 't2', 't3']);
		expect(offered(real(), 'ds-roll', 'tiers:\n  t')).toEqual(['t1', 't2', 't3']);
		expect(offered(real(), 'ds-roll', 'tiers:\n  tie')).toEqual([]);
	});

	test('ds-skills `custom_skills:` entries (a list of objects behind allOf / $ref): the entry\'s keys, and a `- ` first key', () => {
		expect(offered(real(), 'ds-skills', 'custom_skills:\n  - ')).toEqual(['name', 'has_skill', 'skill_group', 'description']);
		expect(offered(real(), 'ds-skills', 'custom_skills:\n  - name: Juggling\n    has')).toEqual(['has_skill']);
		// the entries of `skills:` are plain strings: a bare word there is a skill name, not a key
		expect(offered(real(), 'ds-skills', 'skills:\n  - cl')).toBeNull();
	});

	test('ds-conditions `conditions:` entries are a string-or-object choice: nothing is offered in them', () => {
		expect(offered(real(), 'ds-conditions', 'conditions:\n  - ')).toBeNull();
		expect(offered(real(), 'ds-conditions', 'conditions:\n  - key: grabbed\n    ')).toBeNull();
	});
});

describe('SC-707 the path walk on a synthetic schema', () => {
	test('two levels of objects, and an enum at the bottom', () => {
		expect(x('box:\n  inner:\n    ')).toEqual(['depth', 'unit']);
		expect(x('box:\n  inner:\n    unit: ')).toEqual(['cm', 'in']);
		expect(x('box:\n  ')).toEqual(['width', 'inner']);
	});

	test('a list inside a list entry: the inner entry\'s keys', () => {
		expect(x('entries:\n  - id: 1\n    parts:\n      - label: a\n        ')).toEqual(['label', 'size']);
		expect(x('entries:\n  - id: 1\n    parts:\n      - label: a\n        size: ')).toEqual(['s', 'm', 'l']);
		expect(x('entries:\n  - id: 1\n    parts:\n      - label: a\n    ')).toEqual(['id', 'kind', 'parts']);
	});

	test('a key above the cursor with a value does not open a child: an indented line under it resolves to nothing', () => {
		expect(x('title: Foo\n  ')).toBeNull();
		expect(x('title: Foo\n  bar')).toBeNull();
		expect(x('note:\n  ')).toBeNull(); // a string-typed key: no properties to offer
	});

	test('an unknown key opens nothing', () => {
		expect(x('nothing:\n  ')).toBeNull();
		expect(x('"quoted key":\n  ')).toBeNull();
	});

	test('a list of plain strings, and a string-or-object list, offer no keys', () => {
		expect(x('tags:\n  - ')).toBeNull();
		expect(x('mixed:\n  - ')).toBeNull();
		expect(x('mixed:\n  - ke')).toBeNull();
	});

	test('odd indentation: a line that matches no open level offers nothing', () => {
		expect(x('box:\n    inner:\n  ')).toBeNull(); // 2 is neither the children\'s column (4) nor the top level
		expect(x('box:\n    inner:\n      unit: cm\n     ')).toBeNull(); // 5, between the two levels (4 and 6)
		expect(x('entries:\n  - id: 1\n   ')).toBeNull(); // 3, between the dash and its keys
	});

	test('a tab in the indentation (the cursor line or above it) offers nothing', () => {
		expect(x('box:\n\t')).toBeNull();
		expect(x('box:\n\twidth: 1\n  ')).toBeNull();
	});

	test('flow style: nothing inside a flow collection, and a flow value does not open a child', () => {
		expect(x('box: { width: 1,\n  ')).toBeNull();
		expect(x('tags: [a,\n  ')).toBeNull();
		expect(x('box: { width: 1 }\n  ')).toBeNull();
		expect(x('entries:\n  - { id: 1 }\n  - ')).toEqual(['id', 'kind', 'parts']);
	});

	test('block scalars: the text of one is not a key, and the line after it is read again', () => {
		expect(x('note: |\n  some text\n  ')).toBeNull();
		expect(x('note: >-\n  some text\n  more')).toBeNull();
		expect(x('box:\n  inner:\n    unit: cm\n  note: |\n    text\n  ')).toEqual(['width', 'inner']);
	});

	test('a quoted string that runs over lines is not a key line', () => {
		expect(x('note: "one\n  two\n  ')).toBeNull();
		expect(x('note: "one\n  two"\nbox:\n  ')).toEqual(['width', 'inner']);
	});

	test('comments and blank lines between the parent and the cursor are ignored', () => {
		expect(x('box:\n\n  # a note\n  ')).toEqual(['width', 'inner']);
		expect(x('entries:  # the list\n  - id: 1 # first\n    ')).toEqual(['id', 'kind', 'parts']);
	});

	test('a value after a comment-only tail still opens the child; a wrapped scalar line above does not break the walk', () => {
		expect(x('note: one\n  more text\nbox:\n  ')).toEqual(['width', 'inner']);
	});

	test('a callout-quoted block offers nothing at any depth (the `> ` prefix is not skipped, as before)', () => {
		const s = new DsSchemaSuggest(new App() as any, synth());
		const editor = new CmEditor('> ```ds-x\n> box:\n>   wi');
		expect(s.onTrigger({ line: 2, ch: 7 }, editor as never, null)).toBeNull();
	});

	test('a comment line, a list-in-list and a flow item on the cursor line offer nothing', () => {
		expect(x('box:\n  # wi')).toBeNull();
		expect(x('entries:\n  - - ')).toBeNull();
		expect(x('entries:\n  - {')).toBeNull();
	});

	test('the deferred-off check (SC-406) still covers nested lines', () => {
		const r = real();
		setExperimental(false);
		expect(offered(r, 'ds-roll', 'tiers:\n  t')).toBeNull();
		setExperimental(true);
		expect(offered(r, 'ds-roll', 'tiers:\n  t')).toEqual(['t1', 't2', 't3']);
	});
});

describe('SC-707 accepting a nested suggestion writes the key or value and nothing else', () => {
	test('a nested key replaces the typed prefix and the cursor lands behind it', () => {
		const s = new DsSchemaSuggest(new App() as any, real());
		const editor = new CmEditor('```ds-initiative\nheroes:\n  - name: A\n    max', { line: 3, ch: 7 });
		const info = s.onTrigger({ line: 3, ch: 7 }, editor as never, null)!;
		s.getSuggestions({ editor: editor as never, file: null as never, ...info });
		s.context = { editor: editor as never, file: null as never, ...info };
		s.selectSuggestion('max_stamina');
		expect(editor.getValue()).toBe('```ds-initiative\nheroes:\n  - name: A\n    max_stamina');
		expect(editor.getCursor()).toEqual({ line: 3, ch: 15 });
	});

	test('a nested enum value is written after the colon with one space, over the value word', () => {
		const s = new DsSchemaSuggest(new App() as any, real());
		const doc = '```ds-initiative\nenemy_groups:\n  - name: S\n    creatures:\n      - name: G\n        squad_role:';
		const editor = new CmEditor(doc, { line: 5, ch: 19 });
		const info = s.onTrigger({ line: 5, ch: 19 }, editor as never, null)!;
		s.context = { editor: editor as never, file: null as never, ...info };
		s.selectSuggestion('minion');
		expect(editor.getValue()).toBe(doc + ' minion');
	});
});
