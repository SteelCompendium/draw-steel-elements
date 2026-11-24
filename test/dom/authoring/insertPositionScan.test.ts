// SC-687 — the position scan behind the insert guard (src/authoring/fenceScan.ts `placeOfLine` / `insertRefusalAt` / `insertRefusal`): text in, verdict out.
// A block written at a position must not land inside an existing fenced block (any fence: backtick or tilde, any length, any language or none, in a
// callout, indented under a list item at any depth) or inside the note's properties. In a spec string `|` is the cursor; the verdict is 'block' (refused,
// inside a fence), 'properties' (refused, inside the properties) or null (allowed). The cases are the ones the ticket names plus the shapes
// `planBlockInsert` itself writes under a list item (so a second insert in a row is seen), and what real Obsidian 1.14.4 does with properties
// (measured, SC-687: the editor's rule, not the metadata cache's).
import { insertRefusal, insertRefusalAt, placeOfLine, scanFenceState } from '../../../src/authoring/fenceScan';
import type { InsertRefusal } from '../../../src/authoring/fenceScan';
import { CmEditor } from './_cmEditor';

/** The note's lines and the cursor of a spec with one `|`. */
function parse(spec: string): { lines: string[]; pos: { line: number; ch: number } } {
	const at = spec.indexOf('|');
	const before = spec.slice(0, at).split('\n');
	return { lines: spec.replace('|', '').split('\n'), pos: { line: before.length - 1, ch: before[before.length - 1].length } };
}
const verdict = (spec: string): InsertRefusal | null => {
	const { lines, pos } = parse(spec);
	return insertRefusalAt(lines, pos);
};

type Row = [name: string, spec: string, expected: InsertRefusal | null];

describe('SC-687 scan: the body of a fence is inside (verdict 1)', () => {
	const rows: Row[] = [
		['a backtick fence, an empty body line', '```ds-stam\nmax_stamina: 20\n|\ncurrent_stamina: 5\n```\n\nafter text', 'block'],
		['a backtick fence, the end of a body line', '```ds-stam\nmax_stamina: 20|\n```', 'block'],
		['a tilde fence', '~~~ds-stam\na: 1\n|\n~~~', 'block'],
		['a 4-backtick fence holding a 3-backtick line (cursor after the inner line)', '````md\n```\n|\n````', 'block'],
		['a 4-backtick fence holding a 3-backtick line (cursor on the inner line)', '````md\n```|\n````', 'block'],
		['a tilde fence holding a backtick fence', '~~~\n```\n|\n```\n~~~', 'block'],
		['a non-ds language', '```js\nconst a = 1;\n|\n```', 'block'],
		['a fence with no language', '```\ncode|\n```', 'block'],
		['an opener that carries an info string after the language', '```ds-ct extra\n|\n```', 'block'],
		['a line that looks like a closer but is too short', '````ds-ct\n|\n```\nmore\n````', 'block'],
		['a line that looks like a closer but is the other marker', '```ds-ct\n~~~\n|\n```', 'block'],
		['a line that looks like a closer but carries text', '```ds-ct\n``` tail\n|\n```', 'block'],
		['a closer indented 4 columns is body (CommonMark)', '```ds-ct\n    ```\n|\n```', 'block'],
		['an opener with trailing whitespace and 3 leading spaces (hand-edited)', '   ```ds-stam   \nx|\n   ```  ', 'block'],
		['a tab in the body (hand-edited)', '```ds-stam\n\tkey:\t1|\n```', 'block'],
		['an opener whose info string has a backtick is no fence: text after it is outside', '```ds-stam `x`\ntext|\n```', null],
		['a tilde opener may carry a backtick', '~~~ds-stam `x`\ntext|\n~~~', 'block'],
	];
	test.each(rows)('%s', (_name, spec, expected) => expect(verdict(spec)).toBe(expected));
});

describe('SC-687 scan: a fence in a callout / quote is inside (verdict 2)', () => {
	const rows: Row[] = [
		['an empty body line of a callout block', '> [!note] T\n> ```ds-ct\n> a: 1\n> |\n> ```', 'block'],
		['a body line, the `>` alone as its empty line', '> ```ds-ct\n>|\n> ```', 'block'],
		['a nested callout', '> > ```ds-ct\n> > a: 1|\n> > ```', 'block'],
		['a block after the callout ended (an empty line ends the quote)', '> ```ds-ct\n> a: 1\n> ```\n\n|after', null],
		['text after a callout block, still in the callout', '> ```ds-ct\n> a: 1\n> ```\n> |tail', null],
		['an unclosed fence in a callout ends with the callout (a blank line)', '> ```ds-ct\n> a: 1\n\nafter|', null],
		['an unclosed fence in a callout runs to the end of the callout', '> ```ds-ct\n> a: 1\n> still|', 'block'],
		['a top-level fence holds a quoted fence-looking line as text', '```js\n> ```\n|\n```', 'block'],
	];
	test.each(rows)('%s', (_name, spec, expected) => expect(verdict(spec)).toBe(expected));
});

describe('SC-687 scan: a fence under a list item is inside, in every shape planBlockInsert writes (verdict 3)', () => {
	const rows: Row[] = [
		['under `- item` (2 spaces), an empty body line', '- item\n  ```ds-ct\n  |\n  ```', 'block'],
		['under `- item`, the first body character (where the cursor is left)', '- item\n  ```ds-ct\n  |name: x\n  ```', 'block'],
		['under `1. item` (3 spaces)', '1. item\n   ```ds-ct\n   name: x|\n   ```', 'block'],
		['under `10. item` (4 spaces: not an indented code block here, it is the item\'s text column)', '10. item\n    ```ds-ct\n    name: x|\n    ```', 'block'],
		['under a nested bullet (4 spaces)', '- a\n  - b\n    ```ds-ct\n    x|\n    ```', 'block'],
		['under a twice nested bullet (6 spaces)', '- a\n  - b\n    - c\n      ```ds-ct\n      x|\n      ```', 'block'],
		['under the outer item after a nested one (2 spaces)', '- a\n  - b\n  ```ds-ct\n  x|\n  ```', 'block'],
		['a list item inside a callout', '> - item\n>   ```ds-ct\n>   x|\n>   ```', 'block'],
		['a list item whose own text is a callout', '- > [!note] T\n  > ```ds-ct\n  > x|\n  > ```', 'block'],
		['tab-indented under a bullet (hand-edited)', '- item\n\t```ds-ct\n\tx|\n\t```', 'block'],
		['a blank line between the item and the block', '- item\n\n  ```ds-ct\n  x|\n  ```', 'block'],
		['a fence opened on the item\'s own line', '- ```js\n  x|\n  ```', 'block'],
		['an unclosed fence under an item runs to the end of the note, past an unindented line', '- item\n  ```ds-ct\n  x\nnot indented|', 'block'],
		['the item\'s line after the block (text, outside)', '- item\n  ```ds-ct\n  x\n  ```\n  |tail', null],
		['the next item after the block (outside)', '- item\n  ```ds-ct\n  x\n  ```\n- next|', null],
		['a block 4+ columns past the item\'s text column is an indented code block: no fence', '- item\n\n      ```ds-ct\n      x|\n      ```', null],
		['a closer under an item that is not indented to the item\'s text column does not close', '- item\n  ```ds-ct\n  x\n```\n  y|', 'block'],
	];
	test.each(rows)('%s', (_name, spec, expected) => expect(verdict(spec)).toBe(expected));

	test('4+ spaces at the top level, no list: an indented code block, a fence marker in it is literal text, so nothing below it is "inside"', () => {
		// Real Obsidian 1.14.4 (SC-687 measurement): `    ```\n    text` is an indented code block in Live Preview and Reading view, and the block after it still draws.
		expect(verdict('    ```\n    text|\n\n```ds-ct\na: 1\n```')).toBeNull();
		expect(verdict('para\n\n    ```ds-ct\n    x|\n    ```\n\nafter')).toBeNull();
		expect(verdict('    ```\n    text\n\n```ds-ct\n|a: 1\n```')).toBe('block');
	});
});

describe('SC-687 scan: the properties (verdict 4)', () => {
	const rows: Row[] = [
		['an empty line inside the properties', '---\ntags: [a]\n|\n---\nbody', 'properties'],
		['a value line', '---\ntags: [a|]\n---\nbody', 'properties'],
		['line 0 `---`, before it', '|---\ntags: [a]\n---\nbody', 'properties'],
		['line 0 `---`, after it', '---|\ntags: [a]\n---\nbody', 'properties'],
		['the closing `---`, before it', '---\ntags: [a]\n|---\nbody', 'properties'],
		['the closing `---`, inside it', '---\ntags: [a]\n-|--\nbody', 'properties'],
		['the end of the closing `---` line: the block lands below, allowed', '---\ntags: [a]\n---|\nbody', null],
		['the end of a closing `---` with trailing spaces, allowed', '---\ntags: [a]\n---  |\nbody', null],
		['the closing `---` with trailing spaces, between the marker and the spaces', '---\ntags: [a]\n---| \nbody', 'properties'],
		['the line below the properties', '---\ntags: [a]\n---\n|body', null],
		['an empty pair `---` `---`: its first line', '|---\n---\nbody', 'properties'],
		['an empty pair: the end of its closing line', '---\n---|\nbody', null],
		['an empty pair with a blank line between', '---\n|\n---\nbody', 'properties'],
		['an unclosed `---` is properties to the end of the note (the editor styles it so, Live Preview draws no block there)', '---\na: 1\nbody|', 'properties'],
		['a lone `---` line', '---|', 'properties'],
		['invalid YAML is still properties', '---\na: [|\n---\nbody', 'properties'],
		['the closer must be `---` and whitespace only: `----` does not close', '---\na: 1\n----|\nbody\n---\nafter', 'properties'],
		['`---x` does not close', '---\na: 1\n---x|\n---\nbody', 'properties'],
		['a YAML `...` does not close', '---\na: 1\n...|\nbody', 'properties'],
		['` ---` (a leading space) does not close', '---\na: 1\n ---|\nbody\n---\nafter', 'properties'],
		['an opener with trailing whitespace is not properties (a rule)', '--- \na: 1|\n---\nbody', null],
		['`----` as line 0 is a rule, not properties', '----\na: 1|\n----', null],
		['a blank first line: `---` below it is a rule, not properties', '\n---\na|\n---', null],
		['a `---` rule lower in the note is not properties', 'text\n---\nmore|\n---\nend', null],
		['a CRLF note read as lines (the CR is not part of the marker)', '---\r\na: 1\r\n---|\r\nbody', null],
		['a CRLF note, inside', '---\r\na: 1|\r\n---\r\nbody', 'properties'],
		['a fence marker in a YAML block scalar is text, the note below is not "in a fence"', '---\na: >\n  ```\n  x\n---\nbody|\n', null],
		['a block after the properties is still a block', '---\na: 1\n---\n```ds-ct\n|\n```', 'block'],
	];
	test.each(rows)('%s', (_name, spec, expected) => expect(verdict(spec)).toBe(expected));
});

describe('SC-687 scan: an opening fence line (verdict 5)', () => {
	test.each<Row>([
		['top level, before the marker', '|```ds-stam\nx\n```', null],
		['top level, right after the marker', '```|ds-stam\nx\n```', 'block'],
		['top level, at the end of the line', '```ds-stam|\nx\n```', 'block'],
		['top level, 2 leading spaces: before the marker (inside the indentation)', ' |```ds-stam\nx\n```', null],
		['top level, 2 leading spaces: at the marker', '  |```ds-stam\nx\n```', null],
		['top level, 2 leading spaces: after the marker', '  ```|ds-stam\nx\n```', 'block'],
		['quoted: ch 0', '|> ```ds-stam\n> x\n> ```', null],
		['quoted: between the marker and the fence', '> |```ds-stam\n> x\n> ```', null],
		['quoted: after the fence marker', '> ```|ds-stam\n> x\n> ```', 'block'],
		['list-indented: ch 0', '- item\n|  ```ds-stam\n  x\n  ```', null],
		['list-indented: inside the indentation', '- item\n | ```ds-stam\n  x\n  ```', null],
		['list-indented: at the marker', '- item\n  |```ds-stam\n  x\n  ```', null],
		['list-indented: after the marker', '- item\n  ```|ds-stam\n  x\n  ```', 'block'],
		['a tilde opener', '~~~|ds-stam\nx\n~~~', 'block'],
		['the opener of the SECOND block in the note, before its marker', '```a\nx\n```\n|```b\ny\n```', null],
	])('%s', (_name, spec, expected) => expect(verdict(spec)).toBe(expected));
});

describe('SC-687 scan: a closing fence line (verdict 6)', () => {
	test.each<Row>([
		['the end of the closing line: the block lands below', '```ds-stam\nx\n```|\nafter', null],
		['the end of the closing line with trailing spaces', '```ds-stam\nx\n```   |\nafter', null],
		['the closing line, in front of the marker', '```ds-stam\nx\n|```\nafter', 'block'],
		['the closing line, inside the marker', '```ds-stam\nx\n``|`\nafter', 'block'],
		['the closing line, between the marker and its trailing spaces', '```ds-stam\nx\n```| \nafter', 'block'],
		['the closing line of a 4-backtick fence, end', '````ds-stam\nx\n````|', null],
		['a quoted closing line, end', '> ```ds-stam\n> x\n> ```|\n> tail', null],
		['a quoted closing line, in front of the marker', '> ```ds-stam\n> x\n> |```', 'block'],
		['a list-indented closing line, end', '- item\n  ```ds-stam\n  x\n  ```|\n  tail', null],
		['a list-indented closing line, in front of the marker', '- item\n  ```ds-stam\n  x\n  |```', 'block'],
		['a tilde closing line, end', '~~~\nx\n~~~|', null],
		['the line after the closing line', '```ds-stam\nx\n```\n|after', null],
	])('%s', (_name, spec, expected) => expect(verdict(spec)).toBe(expected));
});

describe('SC-687 scan: an unclosed fence runs to the end of the note (verdict 7)', () => {
	test.each<Row>([
		['the line after the opener', '```ds-stam\n|', 'block'],
		['a blank line, then text, far below', '```ds-stam\na: 1\n\n\ntext\nmore|', 'block'],
		['a tilde fence', '~~~\nx|', 'block'],
		['after an earlier closed block, still inside the later unclosed one', '```a\nx\n```\ntext\n```b\ny|', 'block'],
		['between the closed block and the unclosed one, outside', '```a\nx\n```\ntext|\n```b\ny', null],
		['a fence closed by a longer run', '```a\nx\n`````\ntext|', null],
	])('%s', (_name, spec, expected) => expect(verdict(spec)).toBe(expected));
});

describe('SC-687 scan: a selection (verdict 8)', () => {
	const NOTE = ['before', '```ds-stam', 'a: 1', '', 'b: 2', '```', 'after', '---'].join('\n').split('\n');
	test.each<[string, [number, number], [number, number], InsertRefusal | null]>([
		['both ends outside, a whole block selected and replaced (as today)', [0, 0], [5, 3], null],
		['both ends outside, above the block', [0, 0], [0, 6], null],
		['both ends outside, below the block', [6, 0], [6, 5], null],
		['the start inside the block', [2, 1], [6, 5], 'block'],
		['the end inside the block', [0, 0], [3, 0], 'block'],
		['both ends inside the same block', [2, 0], [4, 2], 'block'],
		['the end on the opening line, after the marker', [0, 0], [1, 5], 'block'],
		['the end at the start of the opening line, the start above', [0, 2], [1, 0], null],
		['the start in the middle of the closing line', [5, 1], [6, 2], 'block'],
	])('%s', (_name, from, to, expected) => {
		expect(insertRefusal(NOTE, { line: from[0], ch: from[1] }, { line: to[0], ch: to[1] })).toBe(expected);
	});

	test('a selection from the properties to the body: refused, as the properties', () => {
		const note = ['---', 'a: 1', '---', 'body'];
		expect(insertRefusal(note, { line: 1, ch: 0 }, { line: 3, ch: 2 })).toBe('properties');
		expect(insertRefusal(note, { line: 2, ch: 3 }, { line: 3, ch: 2 })).toBeNull();
	});
});

describe('SC-687 scan: two blocks in one note do not cross-talk', () => {
	const TWO = '```ds-stam\na: 1\n```\nbetween\n\n```ds-stam\nb: 2\n```';
	test.each<Row>([
		['inside the first', '```ds-stam\na|: 1\n```\nbetween\n\n```ds-stam\nb: 2\n```', 'block'],
		['between the two (text)', '```ds-stam\na: 1\n```\nbet|ween\n\n```ds-stam\nb: 2\n```', null],
		['between the two (the blank line)', '```ds-stam\na: 1\n```\nbetween\n|\n```ds-stam\nb: 2\n```', null],
		['inside the second', '```ds-stam\na: 1\n```\nbetween\n\n```ds-stam\nb|: 2\n```', 'block'],
		['after the second', '```ds-stam\na: 1\n```\nbetween\n\n```ds-stam\nb: 2\n```|', null],
		['a ds-stam block, then a js block, cursor in the js one', '```ds-stam\na: 1\n```\n```js\nx|\n```', 'block'],
	])('%s', (_name, spec, expected) => expect(verdict(spec)).toBe(expected));

	test('the same note read at every line gives the same answer twice (the scan keeps no state)', () => {
		const lines = TWO.split('\n');
		const first = lines.map((_l, i) => placeOfLine(lines, i));
		const second = lines.map((_l, i) => placeOfLine(lines, i));
		expect(second).toEqual(first);
		expect(first.map((p) => (p.kind === 'fence' ? p.role : p.kind))).toEqual(['open', 'body', 'close', 'outside', 'outside', 'open', 'body', 'close']);
	});
});

describe('SC-687 scan: placeOfLine answers what SC-676 needs (in a fence? which language? opening / closing line and where the marker is? properties?)', () => {
	test('a fence: role, language, marker start and end on the opening and closing lines', () => {
		const lines = ['> - item', '>   ```ds-ct extra', '>   x', '>   ````', '> ```js', '> ```'];
		expect(placeOfLine(lines, 0)).toEqual({ kind: 'outside' });
		expect(placeOfLine(lines, 1)).toEqual({ kind: 'fence', role: 'open', lang: 'ds-ct', markerStart: 4, markerEnd: 7 });
		expect(placeOfLine(lines, 2)).toMatchObject({ kind: 'fence', role: 'body', lang: 'ds-ct' });
		expect(placeOfLine(lines, 3)).toEqual({ kind: 'fence', role: 'close', lang: 'ds-ct', markerStart: 4, markerEnd: 8 });
		expect(placeOfLine(lines, 4)).toMatchObject({ kind: 'fence', role: 'open', lang: 'js', markerStart: 2, markerEnd: 5 });
	});
	test('the properties: role per line', () => {
		const lines = ['---', 'a: 1', '---', 'x'];
		expect([0, 1, 2, 3].map((i) => placeOfLine(lines, i).kind + ':' + (placeOfLine(lines, i) as { role?: string }).role)).toEqual([
			'properties:open',
			'properties:body',
			'properties:close',
			'outside:undefined',
		]);
	});
});

describe('SC-687 scan: scanFenceState (the suggesters\' scan) is untouched', () => {
	// The scan the suggesters use does not see what this one sees (SC-676): it answers the same as before for these notes.
	const inFence = (doc: string, line: number) => scanFenceState(new CmEditor(doc) as never, line);
	test('it still sees a plain fence and still misses a list-indented one, the properties and an opening line', () => {
		expect(inFence('```ds-ct\na\n```', 1)).toEqual({ inFence: true, lang: 'ds-ct' });
		expect(inFence('```ds-ct\na\n```', 3)).toEqual({ inFence: false, lang: null });
		expect(inFence('- item\n    ```ds-counter\n    name: x\n    ```', 2)).toEqual({ inFence: false, lang: null });
		expect(inFence('---\ntags: x\n---', 1)).toEqual({ inFence: false, lang: null });
		expect(inFence('```js x', 0)).toEqual({ inFence: false, lang: null });
		expect(inFence('```ds-ct `x`\nt', 1)).toEqual({ inFence: false, lang: null });
	});
});
