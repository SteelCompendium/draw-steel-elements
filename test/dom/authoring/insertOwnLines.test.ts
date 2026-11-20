// SC-675 (+ SC-462 folded in) — a block insert always starts on its own line and ends on its own line.
//
// The four block-insert paths (the Insert command, the /ds pick, the compendium reference insert and the compendium snapshot
// insert) put the block in through ONE helper (src/authoring/blockInsert.ts). These tests run each path against a REAL
// CodeMirror 6 state (`_cmEditor.ts`, the SC-443 helper) so the assertions are on the note text a user is left with:
//   - text before the cursor stays on the line above the block, text after the cursor (or after a selection) goes to a
//     line below it, nothing is lost or reordered;
//   - every inserted line carries the cursor line's container prefix: a list item's indentation, a callout's `> `;
//   - an insert at the start of an empty, un-prefixed line is byte-identical to before (same text, same cursor).
// In a spec string `|` is the cursor and «…» is the selection; the expected note shows the cursor as `|` the same way.
import { insertScaffold } from '../../../src/authoring/insert';
import { DsElementSuggest } from '../../../src/authoring/suggest';
import { insertFullBlock, insertReferenceBlock } from '../../../src/authoring/compendiumInsert';
import { buildScaffold } from '../../../src/authoring/scaffold';
import { listFences } from '../../../src/framework/sidebar/anchor';
import { addBlockPrefix, matchFenceMarker } from '../../../src/framework/host/blockPrefix';
import { blockBodyLines, replaceFenceBlock } from '../../../src/framework/host/fenceLine';
import { splitLines } from '../../../src/framework/host/lineEnding';
import { createElementRegistry } from '../../../src/framework/registry';
import type { ElementDefinition } from '../../../src/framework/registry';
import { registerFrameworkElementDefinitions } from 'main';
import { App } from '../../mocks/obsidian';
import { CmEditor } from './_cmEditor';

// ---------------------------------------------------------------------------------------------------------------------------------
// harness

/** A CodeMirror-backed editor for `spec`, plus the offsets of the selection (`from`..`to`; equal for a bare cursor). */
function makeEditor(spec: string): { ed: CmEditor; from: number; to: number } {
	const sel = /«([\s\S]*?)»/.exec(spec);
	const note = sel ? spec.replace('«', '').replace('»', '') : spec.replace('|', '');
	const from = sel ? sel.index : spec.indexOf('|');
	const to = sel ? sel.index + sel[1].length : from;
	const at = (offset: number) => {
		const lines = note.slice(0, offset).split('\n');
		return { line: lines.length - 1, ch: lines[lines.length - 1].length };
	};
	return { ed: new CmEditor(note, at(from), sel ? at(to) : undefined), from, to };
}

/** The note as the user sees it, with the cursor shown as `|`. */
function shown(ed: CmEditor): string {
	const c = ed.getCursor('head');
	const lines = ed.getValue().split('\n');
	lines[c.line] = lines[c.line].slice(0, c.ch) + '|' + lines[c.line].slice(c.ch);
	return lines.join('\n');
}

// `marked` (a devDependency, the CommonMark-style parser the visual harness uses) is the Markdown oracle. It ships ESM for `main`, which jest does not
// transform, so the UMD build is loaded by path.
const { marked } = jest.requireActual('../../../node_modules/marked/lib/marked.umd.js') as { marked: { lexer: (src: string) => Array<{ type: string }> } };

const BODY = 'a: 1\nb:\n  c: 2';
const def = (body: string) => ({ id: 'ct', name: 'Counter', aliases: ['ds-ct'], authoring: { example: body } }) as unknown as ElementDefinition;
const CT = def(BODY);
const SCC = 'mcdm.heroes.v1/kit/panther';

function makeRegistry() {
	const r = createElementRegistry();
	registerFrameworkElementDefinitions(r);
	return r;
}

/** The Insert command. */
function runInsert(spec: string, d: ElementDefinition = CT): CmEditor {
	const { ed } = makeEditor(spec);
	insertScaffold(ed as never, d);
	return ed;
}

/** The /ds pick: the cursor in `spec` sits right after the typed `token`, which the pick replaces. */
function runSuggest(spec: string, token: string, d: ElementDefinition = CT): CmEditor {
	const { ed } = makeEditor(spec);
	const end = ed.getCursor('head');
	const s = new DsElementSuggest(new App() as never, makeRegistry());
	s.context = { editor: ed as never, file: null as never, start: { line: end.line, ch: end.ch - token.length }, end, query: token.slice(3) };
	s.selectSuggestion(d, null as never);
	return ed;
}

/** The compendium reference insert. */
function runReference(spec: string): CmEditor {
	const { ed } = makeEditor(spec);
	insertReferenceBlock(ed as never, { scc: SCC, type: 'kit', name: 'Panther', source: 'mcdm.heroes.v1', file: {} as never });
	return ed;
}

/** The compendium snapshot insert (an entity with no model: its resolved body is the snapshot). */
async function runSnapshot(spec: string): Promise<CmEditor> {
	const { ed } = makeEditor(spec);
	const entity = { type: 'monster.goblin.statblock', name: 'Goblin', model: async () => undefined, body: async () => SCC };
	expect(await insertFullBlock(ed as never, entity as never)).toBe(true);
	return ed;
}

interface Path {
	name: string;
	/** Runs the path with the cursor (or selection) of `spec`. The /ds pick types `/ds` at the cursor first and replaces it. */
	run: (spec: string) => Promise<CmEditor> | CmEditor;
	open: string;
	body: string[];
	/** The scaffold paths park the cursor on the first body line and end at the closing fence; the compendium inserts end the line (a trailing newline) and leave the cursor after it. */
	scaffold: boolean;
	selectable: boolean;
}

const PATHS: Path[] = [
	{ name: 'Insert command', run: (s) => runInsert(s), open: '```ds-ct', body: BODY.split('\n'), scaffold: true, selectable: true },
	{ name: '/ds pick', run: (s) => runSuggest(s.replace('|', '/ds|'), '/ds'), open: '```ds-ct', body: BODY.split('\n'), scaffold: true, selectable: false },
	{ name: 'compendium reference', run: (s) => runReference(s), open: '```ds-scc', body: [SCC], scaffold: false, selectable: true },
	{ name: 'compendium snapshot', run: (s) => runSnapshot(s), open: '```ds-sb', body: [SCC], scaffold: false, selectable: true },
];

/**
 * The expected block lines for `p` under `prefix` (the cursor `|` on the first body line for a scaffold path).
 * `onCursorLine`: the first line is already on the cursor line, behind the prefix that is there.
 */
function block(p: Path, prefix: string, onCursorLine = false): string {
	return [p.open, ...p.body, '```']
		.map((l, i) => (i === 0 && onCursorLine ? l : prefix + (i === 1 && p.scaffold ? '|' : '') + l))
		.join('\n');
}

/** What follows the closing fence: a compendium insert ends its line (cursor after it), a scaffold insert only when text follows. */
function end(p: Path, prefix: string, tail = ''): string {
	if (!p.scaffold) return '\n' + prefix + '|' + tail;
	return tail === '' ? '' : '\n' + prefix + tail;
}

// ---------------------------------------------------------------------------------------------------------------------------------

describe('the working case is unchanged: the cursor at the start of an empty line with no prefix', () => {
	test.each(PATHS)('$name: same note text and cursor as before the fix', async (p) => {
		const ed = await p.run('|');
		expect(shown(ed)).toBe(block(p, '') + end(p, ''));
		if (p.scaffold) expect(shown(ed)).toBe(`${p.open}\n|a: 1\nb:\n  c: 2\n\`\`\``);
		else expect(shown(ed)).toBe(`${p.open}\n${SCC}\n\`\`\`\n|`);
	});

	test.each(PATHS)('$name: text on the next line stays on the next line, no blank line is added', async (p) => {
		const ed = await p.run('|\nnext');
		expect(shown(ed)).toBe(block(p, '') + (p.scaffold ? '' : '\n|') + '\nnext');
	});
});

describe.each(PATHS)('$name: the block gets its own lines', (p) => {
	test('cursor after text (abc|): the opening fence starts its own line', async () => {
		expect(shown(await p.run('abc|'))).toBe('abc\n' + block(p, '') + end(p, ''));
	});

	test('cursor mid-line (abc|def): the closing fence is alone on its line and def follows it', async () => {
		expect(shown(await p.run('abc|def'))).toBe('abc\n' + block(p, '') + end(p, '', 'def'));
	});

	test('cursor at the start of a non-empty line (|tail): the block goes above and tail moves below it', async () => {
		expect(shown(await p.run('|tail'))).toBe(block(p, '') + end(p, '', 'tail'));
	});

	test('inside a list item, after text (- item|): the block is indented under the item', async () => {
		expect(shown(await p.run('- item|'))).toBe('- item\n' + block(p, '  ') + end(p, '  '));
	});

	test('an empty list item (- |): the item stays and the block sits under it', async () => {
		expect(shown(await p.run('- |'))).toBe('- \n' + block(p, '  ') + end(p, '  '));
	});

	test('on the indented continuation line of a list item (the ticket case): every line carries the indentation', async () => {
		expect(shown(await p.run('- item\n  |'))).toBe('- item\n  ' + block(p, '  ', true) + end(p, '  '));
	});

	test('text after the cursor inside a list item goes to its own indented line', async () => {
		expect(shown(await p.run('- item|tail'))).toBe('- item\n' + block(p, '  ') + end(p, '  ', 'tail'));
	});

	test.each([
		['an ordered item (1. )', '1. item', '   ', false],
		['a two-digit ordered item (10. )', '10. item', '    ', false],
		['a task item (- [ ] )', '- [ ] task', '  ', false],
		['a star bullet', '* item', '  ', false],
		['a nested item', '- a\n  - b', '    ', false],
		// SC-675 r3: a tab never goes on an inserted line (Live Preview shows a parse error for a tab-indented body); it counts to the next multiple of 4.
		// SC-675 r5: under a BULLET each leading tab counts as 2 columns (Obsidian's Reading view, measured in 1.14.4, sc675-r4-rereview-report.md MEDIUM-2); under an ordered item 4.
		['a bullet nested with a tab (- a, tab, - b): 4 spaces', '- a\n\t- b', '    ', false],
		['an empty bullet nested with a tab', '- a\n\t- ', '    ', false],
		['a bullet nested with two tabs: 6 spaces', '- a\n\t- b\n\t\t- c', '      ', false],
		['a bullet nested with three tabs: 8 spaces', '- a\n\t- b\n\t\t- c\n\t\t\t- d', '        ', false],
		['a star bullet nested with a tab', '* a\n\t* b', '    ', false],
		['a task item nested with a tab', '- [ ] a\n\t- [ ] b', '    ', false],
		['an ordered item nested with a tab keeps 4 per tab', '1. a\n\t1. b', '       ', false],
		['a tab-indented continuation line (the tab itself is kept, the block starts behind it)', '- item\n\t', '    ', true],
		['a tab inside a callout list', '> - a\n> \t- b', '>     ', false],
		['a callout opened in a list item (- > [!note] T)', '- > [!note] T', '  > ', false],
		['a quote opened in a list item (- > quote)', '- > quote', '  > ', false],
	])('%s', async (_name, lead, prefix, continuation) => {
		const ed = await p.run(lead + '|');
		expect(shown(ed)).toBe(lead + (continuation ? '' : '\n') + block(p, prefix, continuation) + end(p, prefix));
	});

	test('inside a callout, on an empty body line: every line keeps the callout marker (SC-462)', async () => {
		expect(shown(await p.run('> [!note]\n> |'))).toBe('> [!note]\n> ' + block(p, '> ', true) + end(p, '> '));
	});

	test('inside a callout, after text (> abc|): the block follows on callout lines', async () => {
		expect(shown(await p.run('> abc|'))).toBe('> abc\n' + block(p, '> ') + end(p, '> '));
	});

	test('inside a callout, mid-line (> abc|def): def goes to its own callout line', async () => {
		expect(shown(await p.run('> abc|def'))).toBe('> abc\n' + block(p, '> ') + end(p, '> ', 'def'));
	});

	test('inside a nested callout (> > |): both markers are kept', async () => {
		expect(shown(await p.run('> > |'))).toBe('> > ' + block(p, '> > ', true) + end(p, '> > '));
	});

	test('a list inside a callout (> - item|): marker and indentation go on every line', async () => {
		expect(shown(await p.run('> - item|'))).toBe('> - item\n' + block(p, '>   ') + end(p, '>   '));
	});
});

describe.each(PATHS.filter((p) => p.selectable))('$name: a selection', (p) => {
	test('mid-line is replaced: the text before it stays above the block, the text after it goes below', async () => {
		expect(shown(await p.run('ab«XY»cd'))).toBe('ab\n' + block(p, '') + end(p, '', 'cd'));
	});

	test('across lines is replaced the same way, the lines after it are untouched', async () => {
		expect(shown(await p.run('ab«X\nY»cd\nnext'))).toBe('ab\n' + block(p, '') + end(p, '', 'cd') + '\nnext');
	});

	test('in a callout the moved text keeps the callout marker', async () => {
		expect(shown(await p.run('> ab«XY»cd'))).toBe('> ab\n' + block(p, '> ') + end(p, '> ', 'cd'));
	});

	test('is the ONLY thing removed, in ONE editor change', async () => {
		const { from, to } = makeEditor('ab«XY»cd');
		const ed = await p.run('ab«XY»cd');
		expect(ed.writes).toHaveLength(1);
		expect(ed.writes[0]).toMatchObject({ via: 'replaceSelection', from, to });
		expect(ed.getValue()).not.toContain('XY');
		expect(ed.getValue().startsWith('ab\n```')).toBe(true);
	});
});

describe('the /ds pick', () => {
	test('/dsct| tail: the token is replaced, the closing fence is alone and tail follows on its own line', () => {
		const ed = runSuggest('/dsct| tail', '/dsct');
		expect(shown(ed)).toBe('```ds-ct\n|a: 1\nb:\n  c: 2\n```\n tail');
	});

	test('abc /dsct| tail: text before stays above the block, only the token is removed, in one replaceRange', () => {
		const ed = runSuggest('abc /dsct| tail', '/dsct');
		expect(shown(ed)).toBe('abc \n```ds-ct\n|a: 1\nb:\n  c: 2\n```\n tail');
		expect(ed.writes).toHaveLength(1);
		expect(ed.writes[0].via).toBe('replaceRange');
		expect(ed.writes[0].to - ed.writes[0].from).toBe('/dsct'.length);
	});

	test('- /dsct| in a list item: the item stays and the block is indented under it', () => {
		expect(shown(runSuggest('- /dsct|', '/dsct'))).toBe('- \n  ```ds-ct\n  |a: 1\n  b:\n    c: 2\n  ```');
	});

	test('> /dsct| in a callout: the callout marker is on every line', () => {
		expect(shown(runSuggest('> /dsct|', '/dsct'))).toBe('> ```ds-ct\n> |a: 1\n> b:\n>   c: 2\n> ```');
	});

	test('indentation typed before the token is carried to every line', () => {
		expect(shown(runSuggest('  /dsct|', '/dsct'))).toBe('  ```ds-ct\n  |a: 1\n  b:\n    c: 2\n  ```');
	});
});

describe('the Insert command', () => {
	test('the ticket case: Counter after text (abc|) leaves a working block, cursor on its first body line', () => {
		const counter = makeRegistry().get('counter')!;
		const ed = runInsert('abc|', counter);
		expect(ed.getValue()).toBe('abc\n' + buildScaffold(counter).text);
		const c = ed.getCursor();
		expect(ed.getLine(c.line - 1).startsWith('```ds-')).toBe(true);
		expect(c.ch).toBe(0);
	});

	test('a blank line in the scaffold body is `>` in a callout and the indentation in a list item', () => {
		const blank = def('a: 1\n\nb: 2');
		expect(shown(runInsert('> |', blank))).toBe('> ```ds-ct\n> |a: 1\n>\n> b: 2\n> ```');
		expect(shown(runInsert('- item|', blank))).toBe('- item\n  ```ds-ct\n  |a: 1\n  \n  b: 2\n  ```');
	});
});

describe('the inserted block reads back through the framework', () => {
	test.each([
		['an empty callout line', '> [!note]\n> |', '> '],
		['text in a callout', '> abc|', '> '],
		['a nested callout', '> > |', '> > '],
		['a list inside a callout', '> - item|', '>   '],
		['a callout opened in a list item (SC-675 r3)', '- > [!note] T|', '  > '],
		['a quote opened in a list item (SC-675 r3)', '- > quote|', '  > '],
	])('%s: the write path finds the block with the same prefix and rewrites it in place', (_name, spec, prefix) => {
		const note = runInsert(spec).getValue();
		const found = listFences(note, 'ds-ct');
		expect(found).toHaveLength(1);
		const lines = splitLines(note);
		expect(matchFenceMarker(lines[found[0].lineStart])?.prefix).toBe(prefix);
		expect(blockBodyLines(lines, found[0].lineStart, found[0].lineEnd)).toEqual(BODY.split('\n'));
		// What a later + on the card writes: the body changed, every line still under the same prefix.
		const expected = lines.slice();
		expected.splice(found[0].lineStart + 1, 3, ...['a: 2', 'b:', '  c: 2'].map((l) => addBlockPrefix(prefix, l)));
		expect(replaceFenceBlock(note, found[0].lineStart, found[0].lineEnd, 'a: 2\nb:\n  c: 2')).toBe(expected.join('\n'));
	});

	// (`- a⏎⇥- b|` is not in this list either: its block is at 4 spaces, where Obsidian's Reading view counts a bullet tab as 2 columns (measured in Obsidian 1.14.4, SC-675 r4, sc675-r4-rereview-report.md MEDIUM-2) and CommonMark's tab stops would want 6.)
	// (An EMPTY item nested right under a paragraph line, `- a⏎⇥- |`, is not in this list: `marked` reads that bare `-` as a setext heading underline, as CommonMark does, which is the note's own text, not the insert's.)
	test.each(['- item|', '- |', '- item\n  |', '1. item|', '- [ ] task|', '- a\n  - b|', '- item\n\t|'])(
		'a block inserted at %j is a fenced code block inside that list item for a Markdown parser',
		(spec) => {
			const note = runInsert(spec).getValue();
			type Item = { tokens: Array<{ type: string; lang?: string; text?: string; items?: Item[] }> };
			let item = (marked.lexer(note).find((t) => t.type === 'list') as unknown as { items: Item[] }).items[0];
			// the nested case: the block belongs to the inner item
			const inner = item.tokens.find((t) => t.type === 'list');
			if (inner) item = inner.items![0];
			const code = item.tokens.find((t) => t.type === 'code');
			expect(code?.lang).toBe('ds-ct');
			expect(code?.text).toBe(BODY);
		},
	);

	test('with text after the cursor in a list item the closing fence closes: the tail is text of the item', () => {
		const note = runInsert('- item|tail').getValue();
		const list = marked.lexer(note).find((t) => t.type === 'list') as unknown as { items: Array<{ tokens: Array<{ type: string; text?: string }> }> };
		expect(list.items).toHaveLength(1);
		expect(list.items[0].tokens.map((t) => t.type)).toEqual(['text', 'code', 'text']);
		expect(list.items[0].tokens[2].text).toBe('tail');
	});
});
