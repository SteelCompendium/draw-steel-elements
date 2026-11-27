// SC-443 — the in-fence key / enum autocomplete as tables: which keys each element offers, which enum values, where it triggers, which
// block's schema it uses when a note holds two, and what accepting one writes (the key or value, no other byte).
import { DsSchemaSuggest } from '../../../src/authoring/schemaSuggest';
import { createElementRegistry } from '../../../src/framework/registry';
import { setExperimental } from '../../../src/framework/experimental';
import { registerFrameworkElementDefinitions } from 'main';
import { App } from '../../mocks/obsidian';
import { CmEditor } from './_cmEditor';

const registry = () => {
	const r = createElementRegistry();
	registerFrameworkElementDefinitions(r);
	return r;
};
const make = () => new DsSchemaSuggest(new App() as any, registry());
afterEach(() => setExperimental(true)); // the suite default (test/setup/experimental-on.ts)

/** Open the list at the end of the last line of `doc`; null when it does not trigger. */
function offered(s: DsSchemaSuggest, doc: string): { kind: 'key' | 'enum' | 'none'; values: string[]; query: string } | null {
	const editor = new CmEditor(doc);
	const line = editor.lineCount() - 1;
	const info = s.onTrigger({ line, ch: editor.getLine(line).length }, editor as never, null);
	if (!info) return null;
	const values = s.getSuggestions({ editor: editor as never, file: null as never, ...info }) as string[];
	const mode = (s as unknown as { mode: { kind: 'key' | 'enum' } | null }).mode;
	return { kind: values.length ? (mode?.kind ?? 'none') : 'none', values, query: info.query };
}

describe('the keys each element offers on an empty body line (its schema, allOf and $ref resolved)', () => {
	const COLLAPSE = ['collapsible', 'collapse_default'];
	// [fence, keys in schema order]
	const CASES: Array<[fence: string, keys: string[]]> = [
		['ds-skills', [...COLLAPSE, 'only_show_selected', 'style', 'skills', 'custom_skills']],
		['ds-stam', [...COLLAPSE, 'max_stamina', 'current_stamina', 'temp_stamina', 'recoveries', 'recoveries_max', 'height', 'style']],
		['ds-stamina', [...COLLAPSE, 'max_stamina', 'current_stamina', 'temp_stamina', 'recoveries', 'recoveries_max', 'height', 'style']],
		['ds-stamina-bar', [...COLLAPSE, 'max_stamina', 'current_stamina', 'temp_stamina', 'recoveries', 'recoveries_max', 'height', 'style']],
		['ds-roll', ['name', 'roll', 'mode', 'characteristic', 'skill', 'edges', 'banes', 'bonus', 'difficulty', 'main_action', 'dice', 'tiers', 'crit', 'auto_roll']],
		['ds-power-roll', ['name', 'roll', 'mode', 'characteristic', 'skill', 'edges', 'banes', 'bonus', 'difficulty', 'main_action', 'dice', 'tiers', 'crit', 'auto_roll']],
		['ds-conditions', ['conditions']],
		['ds-resource', ['class', 'type', 'current', 'min', 'max']],
		['ds-surges', ['surges', 'highest_characteristic']],
		['ds-tokens', ['label', 'tokens']],
		['ds-hero', ['name', 'level', 'ancestry', 'class', 'subclass', 'kits', 'characteristics', 'skills', 'abilities', 'max_stamina', 'recoveries_max', 'resource', 'titles', 'perks', 'treasures', 'complication', 'state']],
	];
	test.each(CASES)('%s (gate on)', (fence, keys) => {
		expect(offered(make(), '```' + fence + '\n')).toEqual({ kind: 'key', values: keys, query: '' });
	});

	test.each(['ds-roll', 'ds-conditions', 'ds-resource', 'ds-surges', 'ds-tokens', 'ds-hero'])('%s gets nothing with the gate off (SC-406: its block is an inert card)', (fence) => {
		setExperimental(false);
		expect(offered(make(), '```' + fence + '\n')).toBeNull();
	});

	test.each(['ds-skills', 'ds-stam', 'ds-stamina-bar'])('%s keeps its keys with the gate off', (fence) => {
		setExperimental(false);
		expect(offered(make(), '```' + fence + '\n')?.values.length).toBeGreaterThan(5);
	});

	test.each(['ds-hr', 'ds-nt', 'ds-it', 'ds-ft', 'ds-fb', 'ds-sb', 'ds-ct', 'ds-vr', 'ds-char', 'ds-scc', 'ds-montage'])('%s has no schema, so it offers no keys (even though its scaffold is a valid block)', (fence) => {
		expect(offered(make(), '```' + fence + '\n')).toBeNull();
	});
});

describe('the key list: prefix match on the word before the cursor', () => {
	test.each([
		['cur', ['current_stamina']],
		['CUR', ['current_stamina']], // case-insensitive
		['max', ['max_stamina']],
		['stamina', []], // a prefix, not a substring
		['re', ['recoveries', 'recoveries_max']],
		['zz', []],
	])('/ds-stam block, "%s"', (typed, keys) => {
		const got = offered(make(), '```ds-stam\n' + typed);
		expect(got === null ? [] : got.values).toEqual(keys);
	});
});

describe('the enum list: the values of the key before the cursor, prefix match', () => {
	test.each([
		['mode: ', ['power-roll', 'test', 'opposed', 'flat']],
		['mode:', ['power-roll', 'test', 'opposed', 'flat']],
		['mode: te', ['test']],
		['mode: TE', ['test']],
		['mode: zz', []],
		['difficulty: ', ['easy', 'medium', 'hard']],
		['difficulty: m', ['medium']],
		['name: ', []], // a string with no enum
		['no_such_key: ', []],
		['edges: ', []],
	])('ds-roll block, "%s"', (typed, values) => {
		const got = offered(make(), '```ds-roll\n' + typed);
		expect(got === null ? [] : got.values).toEqual(values);
	});

	test('the value list is the enum mode: a key row and a value row are different lists', () => {
		expect(offered(make(), '```ds-roll\nmode: ')?.kind).toBe('enum');
		expect(offered(make(), '```ds-roll\nmod')?.kind).toBe('key');
	});
});

describe('onTrigger: where the lists open, and which block\'s schema they use', () => {
	// [name, doc (cursor at the end), expected: keys-list / enum-list / null]
	const CASES: Array<[name: string, doc: string, want: 'key' | 'enum' | null]> = [
		['a blank line inside the block', '```ds-roll\n', 'key'],
		['a block opened with extra info words (SC-476)', '```ds-roll   extra words\nmod', 'key'],
		['a tilde fence', '~~~ds-roll\nmod', 'key'],
		['a four-backtick fence', '````ds-roll\nmod', 'key'],
		['a fence indented three spaces', '   ```ds-roll\nmod', 'key'],
		['after prose and another block\'s closing fence, inside a new one', 'text\n```js\nx\n```\n```ds-roll\nmod', 'key'],
		['outside any fence', 'mod', null],
		['after the block closed', '```ds-roll\nmode: flat\n```\nmod', null],
		['on the opening fence line', '```ds-roll', null],
		['on the closing fence line', '```ds-roll\nmode: flat\n```', null],
		['an unknown language', '```ds-nothing\nmod', null],
		['a language written in another case (it never renders)', '```DS-Roll\nmod', null],
		['a non-ds fence', '```js\nmod', null],
		['an indented line (nested keys are out of scope)', '```ds-roll\ntiers:\n  mod', null],
		['an indented key: value line', '```ds-roll\ntiers:\n  mode: ', null],
		['a comment line', '```ds-roll\n# mod', null],
		['a value that already has a space in it', '```ds-roll\nmode: power roll', null],
		['a list item', '```ds-roll\n- mod', null],
		['a callout-quoted block body (the "> " prefix is not skipped)', '> ```ds-roll\n> mod', null],
		['the key line of a value being typed', '```ds-roll\nmode: ', 'enum'],
		['two blocks: the second is a ds-roll', '```ds-stam\nmax_stamina: 5\n```\n\n```ds-roll\nmod', 'key'],
	];
	test.each(CASES)('%s', (_name, doc, want) => {
		expect(offered(make(), doc)?.kind ?? null).toBe(want);
	});

	test('two blocks in one note: autocomplete in the second uses the second\'s language, and in the first the first\'s', () => {
		const note = (cursor: string) => '```ds-stam\n' + (cursor === 'first' ? 'ma' : 'max_stamina: 5') + '\n```\n\n```ds-roll\n' + (cursor === 'second' ? 'ma' : 'mode: flat') + '\n```';
		const at = (doc: string, line: number) => {
			const editor = new CmEditor(doc);
			const s = make();
			const info = s.onTrigger({ line, ch: editor.getLine(line).length }, editor as never, null)!;
			return s.getSuggestions({ editor: editor as never, file: null as never, ...info }) as string[];
		};
		expect(at(note('first'), 1)).toEqual(['max_stamina']);
		expect(at(note('second'), 5)).toEqual(['main_action']);
	});
});

describe('selectSuggestion writes the key or value over the typed word only', () => {
	function accept(doc: string, pickValue: string): { editor: CmEditor; before: string } {
		const editor = new CmEditor(doc);
		const line = editor.lineCount() - 1;
		const s = make();
		const info = s.onTrigger({ line, ch: editor.getLine(line).length }, editor as never, null)!;
		s.context = { editor: editor as never, file: null as never, ...info };
		const before = editor.getValue();
		s.selectSuggestion(pickValue);
		return { editor, before };
	}

	test.each([
		['a key: the typed prefix becomes the key (no colon is added)', '```ds-stam\nmax_stamina: 20\nrec', 'recoveries', '```ds-stam\nmax_stamina: 20\nrecoveries'],
		['an enum value: the typed prefix becomes the value', '```ds-roll\nmode: po', 'power-roll', '```ds-roll\nmode: power-roll'],
		['an empty query inserts at the cursor', '```ds-roll\n', 'name', '```ds-roll\nname'],
		['a CRLF note: the text above is kept (CodeMirror holds it as LF)', 'above\r\n```ds-roll\r\ndiff', 'difficulty', 'above\n```ds-roll\ndifficulty'],
	])('%s', (_name, doc, value, expected) => {
		const { editor } = accept(doc, value);
		expect(editor.getValue()).toBe(expected);
		expect(editor.writes).toHaveLength(1);
		expect(editor.writes[0]).toMatchObject({ via: 'replaceRange', text: value });
	});

	// SC-688: typing `mode:` opens the value list at once (the row in the trigger table above), and an accept there writes the space too, so the line is
	// the mapping entry the user meant (`mode:flat` is not one: the block would render a parse error card). Only the VALUE list does this: the key list is
	// untouched (a key is typed from column 0, SC-678 is its mid-word twin).
	describe('an enum value accepted right after the colon (SC-688)', () => {
		const at = (doc: string, ch: number, value: string) => {
			const editor = new CmEditor(doc, { line: 1, ch });
			const s = make();
			const info = s.onTrigger({ line: 1, ch }, editor as never, null)!;
			s.context = { editor: editor as never, file: null as never, ...info };
			s.selectSuggestion(value);
			return editor;
		};

		test('`mode:` with nothing typed: the accepted line is `mode: flat`, the cursor is after it and the write is one replaceRange', () => {
			const editor = at('```ds-roll\nmode:', 5, 'flat');
			expect(editor.getLine(1)).toBe('mode: flat');
			expect(editor.getCursor()).toEqual({ line: 1, ch: 10 });
			expect(editor.writes).toHaveLength(1);
			expect(editor.writes[0]).toMatchObject({ via: 'replaceRange', text: ' flat' });
		});

		test('`mode:te` (a partial query, no space): `mode: test`, the cursor after it', () => {
			const editor = at('```ds-roll\nmode:te', 7, 'test');
			expect(editor.getLine(1)).toBe('mode: test');
			expect(editor.getCursor()).toEqual({ line: 1, ch: 10 });
		});

		test('`difficulty:` (another enum key): `difficulty: easy`', () => {
			const editor = at('```ds-roll\ndifficulty:', 11, 'easy');
			expect(editor.getLine(1)).toBe('difficulty: easy');
			expect(editor.getCursor()).toEqual({ line: 1, ch: 16 });
		});

		test('`mode:op|posed` (no space and the cursor mid-word): `mode: opposed`, the tail is not doubled', () => {
			const editor = at('```ds-roll\nmode:opposed', 7, 'opposed');
			expect(editor.getLine(1)).toBe('mode: opposed');
			expect(editor.getCursor()).toEqual({ line: 1, ch: 13 });
		});

		test('with a space already there, exactly one space is written (`mode: ` and `mode:  ` keep their spacing, no double space)', () => {
			expect(at('```ds-roll\nmode: ', 6, 'flat').getLine(1)).toBe('mode: flat');
			expect(at('```ds-roll\nmode:  ', 7, 'flat').getLine(1)).toBe('mode:  flat');
		});

		test('the lines above and below the block line are untouched', () => {
			const doc = 'intro\n```ds-roll\nname: x\nmode:\ndifficulty: easy\n```\nafter';
			const editor = new CmEditor(doc, { line: 3, ch: 5 });
			const s = make();
			const info = s.onTrigger({ line: 3, ch: 5 }, editor as never, null)!;
			s.context = { editor: editor as never, file: null as never, ...info };
			s.selectSuggestion('flat');
			expect(editor.getValue()).toBe('intro\n```ds-roll\nname: x\nmode: flat\ndifficulty: easy\n```\nafter');
		});
	});

	test('everything above and below the word is untouched', () => {
		const above = 'intro\n\n```ds-stam\nmax_stamina: 20\n';
		const { editor, before } = accept(above + 'cur', 'current_stamina');
		expect(editor.getValue().startsWith(above)).toBe(true);
		expect(editor.getValue()).toBe(before.slice(0, before.length - 3) + 'current_stamina');
	});
});
