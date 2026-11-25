// SC-443 — the /ds EditorSuggest as tables: where it triggers (and what it reads as the query), what it offers for a query (name and
// alias), where it stays silent (every kind of open fence), and what accepting one writes to a note (the `/ds…` token and nothing else).
import { DsElementSuggest } from '../../../src/authoring/suggest';
import { buildScaffold } from '../../../src/authoring/scaffold';
import { createElementRegistry } from '../../../src/framework/registry';
import { registerFrameworkElementDefinitions } from 'main';
import { App } from '../../mocks/obsidian';
import { CmEditor } from './_cmEditor';

const registry = () => {
	const r = createElementRegistry();
	registerFrameworkElementDefinitions(r);
	return r;
};
const make = () => new DsElementSuggest(new App() as any, registry());
const ctx = (query: string) => ({ editor: null as never, file: null as never, start: { line: 0, ch: 0 }, end: { line: 0, ch: 0 }, query });

describe('onTrigger: where the token starts, what the query is', () => {
	// [doc, line, ch (cursor), expected start ch + query, or null]
	const CASES: Array<[name: string, doc: string, line: number, ch: number, want: { start: number; query: string } | null]> = [
		['a bare /ds at the start of the line', '/ds', 0, 3, { start: 0, query: '' }],
		['a query after /ds', '/dsroll', 0, 7, { start: 0, query: 'roll' }],
		['after a space', 'see /dsroll', 0, 11, { start: 4, query: 'roll' }],
		['after a tab', '\t/ds', 0, 4, { start: 1, query: '' }],
		['the query is lower-cased', '/DSRoll', 0, 7, { start: 0, query: 'roll' }],
		['a hyphen belongs to the query (an alias is hyphenated)', '/ds-ro', 0, 6, { start: 0, query: '-ro' }],
		['on a later line', 'one\ntwo\n/dsst', 2, 5, { start: 0, query: 'st' }],
		['a cursor inside the token reads only what is before it', '/dsroll', 0, 4, { start: 0, query: 'r' }],
		['mid-word does not trigger', 'foo/ds', 0, 6, null],
		['after a digit does not trigger', '1/dsroll', 0, 8, null],
		['inside a URL does not trigger', 'http://x/ds', 0, 11, null],
		['a digit after the query ends the trigger', '/dsroll2', 0, 8, null],
		['no /ds on the line', 'plain text', 0, 10, null],
		['/d is not /ds', '/d', 0, 2, null],
		['only the text before the cursor counts', '/ds', 0, 2, null],
	];
	test.each(CASES)('%s', (_name, doc, line, ch, want) => {
		const info = make().onTrigger({ line, ch }, new CmEditor(doc) as never, null);
		if (!want) return expect(info).toBeNull();
		expect(info).toEqual({ start: { line, ch: want.start }, end: { line, ch }, query: want.query });
	});
});

describe('onTrigger: silent inside any fence, live again outside it', () => {
	const T = '/dsroll';
	// [lines of the note up to the cursor line (the last is the /ds line, without the token), triggers?]
	const CASES: Array<[name: string, above: string[], triggers: boolean]> = [
		['no fence at all', ['prose '], true],
		['inside an open ds-* fence', ['```ds-roll', 'name: '], false],
		['inside an open fence of another language', ['```js', 'const x = '], false],
		['inside an open bare fence', ['```', 'x '], false],
		['inside an open tilde fence', ['~~~ds-roll', 'name: '], false],
		['inside an open four-backtick fence', ['````ds-roll', 'name: '], false],
		['inside a four-backtick fence a three-backtick line does not close it', ['````ds-roll', '```', 'name: '], false],
		['inside a backtick fence a tilde line does not close it', ['```ds-roll', '~~~', 'name: '], false],
		['inside a fence with a closer that carries words (not a closer)', ['```ds-roll', '``` x', 'name: '], false],
		['inside a fence opened with extra info words (SC-476)', ['```ds-counter extra words', 'name: '], false],
		['inside a fence indented three spaces', ['   ```ds-roll', '   name: '], false],
		['inside a fence quoted in a callout', ['> [!note]', '> ```ds-roll', '> name: '], false],
		['inside a fence nested in a callout inside a callout', ['> > ```ds-roll', '> > name: '], false],
		['after a closed ds-* fence', ['```ds-roll', 'name: x', '```', 'prose '], true],
		['after a closed tilde fence', ['~~~js', 'x', '~~~', 'prose '], true],
		['after a fence closed by a longer closer', ['```ds-roll', 'x', '`````', 'prose '], true],
		['after a closed fence inside a callout', ['> ```ds-roll', '> x', '> ```', 'prose '], true],
		['a backtick in a backtick fence\'s info string is not an opener (SC-476)', ['```ds-roll `x`', 'prose '], true],
		['a backtick in a TILDE fence\'s info string still opens', ['~~~ds-roll `x`', 'prose '], false],
		['four-space indent is an indented code block, not a fence', ['    ```ds-roll', 'prose '], true],
		['an unclosed fence silences everything below it', ['```js', 'a', 'b', 'c', 'prose '], false],
		['the second of two blocks is a fence too', ['```ds-roll', 'x', '```', '', '```ds-counter', 'name: '], false],
	];
	test.each(CASES)('%s', (_name, above, triggers) => {
		const doc = [...above.slice(0, -1), above[above.length - 1] + T].join('\n');
		const last = above.length - 1;
		const info = make().onTrigger({ line: last, ch: above[last].length + T.length }, new CmEditor(doc) as never, null);
		expect(info !== null).toBe(triggers);
	});
});

describe('getSuggestions: a query matches an element name or ANY of its aliases, as a substring', () => {
	const ALL = ['horizontal-rule', 'skills', 'stamina-bar', 'negotiation', 'initiative', 'feature', 'featureblock', 'statblock', 'counter', 'values-row', 'characteristics', 'roll', 'scc', 'encounter', 'montage', 'project', 'party', 'conditions', 'heroic-resource', 'surges', 'hero-tokens'];
	const CASES: Array<[query: string, ids: string[]]> = [
		['', ALL],
		['roll', ['roll']], // the name
		['power', ['roll']], // an alias only (ds-power-roll)
		['stam', ['stamina-bar']], // aliases ds-stam, ds-stamina
		['tracker', ['negotiation', 'initiative', 'montage', 'project', 'party']], // names
		['block', ['featureblock', 'statblock']],
		['feat', ['feature', 'featureblock']],
		['fb', ['featureblock']], // an alias only (ds-fb)
		['res', ['heroic-resource']],
		['hero', ['heroic-resource', 'hero-tokens']], // never ds-hero (SC-190)
		['ds', ALL], // every alias starts ds-
		['zz', []],
	];
	test.each(CASES)('/ds%s', (query, ids) => {
		expect(make().getSuggestions(ctx(query)).map((d) => d.id)).toEqual(ids);
	});

	test('a row draws the element name and its first alias, and nothing interactive of its own', () => {
		const s = make();
		const roll = s.getSuggestions(ctx('roll'))[0];
		const el = document.createElement('div');
		s.renderSuggestion(roll, el);
		expect(Array.from(el.children).map((c) => [c.className, c.textContent])).toEqual([
			['dse-suggest__title', 'Roll'],
			['dse-suggest__alias', 'ds-roll'],
		]);
		expect(el.getAttribute('data-dse-control')).toBe('authoring.ds.item');
	});
});

describe('selectSuggestion writes the scaffold over the /ds token and touches no other byte', () => {
	/** Open a note with the cursor right after `token` on `line`, pick `id`, return what the note holds. */
	function pick(doc: string, line: number, token: string, id: string): { editor: CmEditor; before: string; start: number; end: number } {
		const editor = new CmEditor(doc);
		const ch = editor.getLine(line).indexOf(token) + token.length;
		const s = make();
		const info = s.onTrigger({ line, ch }, editor as never, null)!;
		s.context = { editor: editor as never, file: null as never, ...info };
		const before = editor.getValue();
		const start = editor.offsetOf(info.start);
		const end = editor.offsetOf(info.end);
		s.selectSuggestion(registry().get(id)!, null as never);
		return { editor, before, start, end };
	}
	const SCAFFOLD = buildScaffold(registry().get('counter')!).text;

	test.each([
		['the middle of a note', 'above\n/dsct\nbelow\n'],
		['the first line', '/dsct\nbelow\n'],
		['the last line with no trailing newline', 'above\n/dsct'],
		['a CRLF note (CodeMirror reads and holds it as LF lines)', 'above\r\n/dsct\r\nbelow\r\n'],
		['a note with a closed block above', '```ds-counter\nname: x\n```\n/dsct\n'],
	])('%s: the note is the text before the token + the scaffold + the text after it', (_name, doc) => {
		const line = doc.split(/\r\n|\n/).findIndex((l) => l.includes('/dsct'));
		const { editor, before, start, end } = pick(doc, line, '/dsct', 'counter');
		expect(editor.getValue()).toBe(before.slice(0, start) + SCAFFOLD + before.slice(end));
		expect(editor.writes).toHaveLength(1);
		expect(editor.writes[0]).toMatchObject({ via: 'replaceRange', from: start, to: end, text: SCAFFOLD });
	});

	test('the cursor lands on the first body line of the inserted block, wherever the token was', () => {
		const { editor } = pick('a\nb\n  /dsct\nc', 2, '/dsct', 'counter');
		expect(editor.getCursor()).toEqual({ line: 3, ch: 2 }); // behind the two typed spaces SC-675 carries onto every line
		expect(editor.getLine(2)).toBe('  ```ds-ct');
	});

	// SC-675: a token typed behind whitespace puts the whitespace on every line of the block (the block's own lines are new text, the typed
	// whitespace stays where it is; the first fence line goes right behind it), so the block stays at one indentation.
	test('an indented token: the typed indentation goes on every line of the block, the first fence line stays behind it', () => {
		const { editor, before, start, end } = pick('above\n  /dsct\nbelow', 1, '/dsct', 'counter');
		const indented = SCAFFOLD.split('\n').join('\n  ');
		expect(editor.getValue()).toBe(before.slice(0, start) + indented + before.slice(end));
		expect(editor.getValue()).toBe('above\n  ' + indented + '\nbelow');
		expect(editor.writes).toHaveLength(1);
		expect(editor.writes[0]).toMatchObject({ via: 'replaceRange', from: start, to: end, text: indented });
	});
});

// SC-682: after ANY pick the list is closed (Obsidian keeps a list open after an accept unless the suggester closes it, and the next Enter
// then lands on the stale row: nothing, a second Notice, or a second pick written with the old token range).
describe('selectSuggestion closes the list exactly once, whether the pick wrote or was refused (SC-682)', () => {
	function pickAndCountCloses(doc: string, token: string): { editor: CmEditor; closed: number; before: string } {
		const lines = doc.split('\n');
		const line = lines.findIndex((l) => l.includes(token));
		const start = { line, ch: lines[line].indexOf(token) };
		const end = { line, ch: start.ch + token.length };
		const editor = new CmEditor(doc, end);
		const s = make();
		s.context = { editor: editor as never, file: null as never, start, end, query: token.slice(3) };
		const close = jest.spyOn(s, 'close');
		const before = editor.getValue();
		s.selectSuggestion(registry().get('counter')!, null as never);
		return { editor, closed: close.mock.calls.length, before };
	}

	test.each([
		['the middle of a note', 'above\n/dsct\nbelow\n'],
		['a token with nothing around it', '/dsct'],
		['a list item', '- first\n- /dsct\n'],
		['a callout', '> [!note] T\n> /dsct\n'],
		['a note with a closed block above', '```ds-counter\nname: x\n```\n/dsct\n'],
	])('a pick that writes (%s): close() is called once, and the block is in the note', (_name, doc) => {
		const { editor, closed, before } = pickAndCountCloses(doc, '/dsct');
		expect(editor.writes).toHaveLength(1);
		expect(editor.getValue()).not.toBe(before);
		expect(closed).toBe(1);
	});

	test.each([
		['inside the note\'s properties', '---\ntags: /dsct\n---\nbody\n'],
		['inside a block under a list item, which the fence scan does not see (SC-676)', '- item\n  ```ds-ct\n  name: /dsct\n  ```\n'],
	])('a refused pick (%s): close() is called once, and the note is unchanged', (_name, doc) => {
		const { editor, closed, before } = pickAndCountCloses(doc, '/dsct');
		expect(editor.writes).toHaveLength(0);
		expect(editor.getValue()).toBe(before);
		expect(closed).toBe(1);
	});

	test('a pick with no context (the list was already closed) writes nothing and closes nothing', () => {
		const s = make();
		const close = jest.spyOn(s, 'close');
		s.selectSuggestion(registry().get('counter')!, null as never);
		expect(close).not.toHaveBeenCalled();
	});
});
