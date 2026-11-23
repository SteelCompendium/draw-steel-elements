// SC-443 — expected failures for the authoring bugs found by the e2e survey. Each `test.failing` encodes the CORRECT behaviour and goes
// green-as-failing while the bug exists; the moment the fix lands it fails with "expected to fail" and the marker comes off with the fix.
// Still open: SC-676 (/ds guard misses fences it cannot see), SC-677 (Ctrl/Cmd-click copy with a refusing clipboard), SC-678 (accepting a key
// mid-word doubles the tail), SC-679 (accepting a suggestion with nothing typed leaves the cursor in front of it).
// SC-675 (an insert not at the start of an empty line broke the block; related SC-462) is fixed: its three cases below are plain tests that pin
// the exact bytes the fix writes (src/authoring/blockInsert.ts; the helper has its own matrix in insertOwnLines.test.ts).
import { DsElementSuggest } from '../../../src/authoring/suggest';
import { DsSchemaSuggest } from '../../../src/authoring/schemaSuggest';
import { insertScaffold } from '../../../src/authoring/insert';
import { buildScaffold } from '../../../src/authoring/scaffold';
import { copyCode, insertFullBlock, insertReferenceBlock } from '../../../src/authoring/compendiumInsert';
import { createElementRegistry } from '../../../src/framework/registry';
import { registerFrameworkElementDefinitions } from 'main';
import { App } from '../../mocks/obsidian';
import { loadMdDseFixture, makeCompendiumDeps } from '../elements/_refHarness';
import { CmEditor } from './_cmEditor';

// `marked` (a devDependency, the CommonMark-style parser the visual harness uses) is the list-aware oracle: `scanFences` does not see a fence
// indented inside a list item. It ships ESM for `main`, which jest does not transform, so the UMD build is loaded by path.
const { marked } = jest.requireActual('../../../node_modules/marked/lib/marked.umd.js') as { marked: { lexer: (src: string) => Array<{ type: string }> } };

const registry = () => {
	const r = createElementRegistry();
	registerFrameworkElementDefinitions(r);
	return r;
};
const KIT = 'mcdm.heroes.v1/kit/panther';
const GOBLIN = 'mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker';

describe('SC-675 (fixed): an insert not at the start of an empty line puts the block on its own lines, byte for byte', () => {
	test('the insert command inside a list item: every line of the block sits under the item, the text before the cursor survives, a Markdown parser reads one fenced code block in the item', () => {
		const counter = registry().get('counter')!;
		const scaffold = buildScaffold(counter).text;
		const before = '- item\n  ';
		const editor = new CmEditor(before, { line: 1, ch: 2 });
		insertScaffold(editor as never, counter);
		// the opening fence goes right behind the two spaces already on the line; the other lines carry the item's two-space indentation; no blank line
		expect(editor.getValue()).toBe('- item\n  ' + scaffold.split('\n').join('\n  '));
		expect(editor.getCursor()).toEqual({ line: 2, ch: 2 }); // the first body character
		type Item = { tokens: Array<{ type: string; lang?: string; text?: string }> };
		const list = marked.lexer(editor.getValue()).find((t) => t.type === 'list') as unknown as { items: Item[] };
		expect(list.items).toHaveLength(1);
		const code = list.items[0].tokens.find((t) => t.type === 'code');
		expect(code?.lang).toBe('ds-ct');
		expect(code?.text).toBe(scaffold.split('\n').slice(1, -1).join('\n'));
	});

	test('a compendium reference inserted mid-line: the text after the cursor goes to its own line below the block, the text before stays above it', () => {
		const { vault, index } = makeCompendiumDeps();
		loadMdDseFixture(vault, 'kit/panther.md');
		const editor = new CmEditor('abcdef', { line: 0, ch: 3 });
		insertReferenceBlock(editor as never, index.getEntry(KIT)!);
		expect(editor.getValue()).toBe('abc\n```ds-scc\n' + KIT + '\n```\ndef');
		expect(editor.getCursor()).toEqual({ line: 4, ch: 0 }); // after the line break the block ends with: the start of the line `def` moved to
		expect(editor.writes).toHaveLength(1);
	});

	test('a compendium snapshot inserted at the end of a line of text: the block starts on the next line and ends its own line', async () => {
		const { vault, index } = makeCompendiumDeps();
		loadMdDseFixture(vault, 'monster/goblin/statblock/goblin-stinker.md');
		const entity = (await index.getEntity(GOBLIN))!;
		// the snapshot's own text, as the same insert leaves it in an empty note
		const alone = new CmEditor('');
		await insertFullBlock(alone as never, entity);
		const block = alone.getValue();
		expect(block.startsWith('```ds-sb\n')).toBe(true);
		expect(block.endsWith('\n```\n')).toBe(true);
		const editor = new CmEditor('abc', { line: 0, ch: 3 });
		await insertFullBlock(editor as never, entity);
		expect(editor.getValue()).toBe('abc\n' + block);
		expect(editor.writes).toHaveLength(1);
	});
});

describe('SC-676: /ds offers itself where it must not', () => {
	const triggers = (doc: string, line: number, ch: number): boolean => new DsElementSuggest(new App() as any, registry()).onTrigger({ line, ch }, new CmEditor(doc) as never, null) !== null;

	test.failing('inside a list-indented code block', () => {
		expect(triggers('- item\n    ```ds-counter\n    name: /dsct\n    ```', 2, 14)).toBe(false);
	});
	test.failing('in the YAML frontmatter', () => {
		expect(triggers('---\ntags: /dsct\n---', 1, 10)).toBe(false);
	});
	test.failing('on a fence\'s own opening line', () => {
		expect(triggers('```js /dsct', 0, 11)).toBe(false);
	});
});

describe('SC-677: Ctrl/Cmd-click copy when the clipboard refuses', () => {
	test.failing('copyCode does not reject (the choice is handled, the user is told)', async () => {
		(navigator as any).clipboard = { writeText: jest.fn().mockRejectedValue(new Error('NotAllowedError: Document is not focused')) };
		try {
			const { vault, index } = makeCompendiumDeps();
			loadMdDseFixture(vault, 'kit/panther.md');
			await expect(copyCode(index.getEntry(KIT)!)).resolves.toBeUndefined();
		} finally {
			delete (navigator as any).clipboard;
		}
	});
});

describe('SC-678: accepting a key with the cursor in the middle of a word', () => {
	test.failing('replaces the whole word, it does not double the tail (max|_stamina -> max_stamina)', () => {
		const editor = new CmEditor('```ds-stam\nmax_stamina: 5', { line: 1, ch: 3 });
		const s = new DsSchemaSuggest(new App() as any, registry());
		const info = s.onTrigger({ line: 1, ch: 3 }, editor as never, null)!;
		s.context = { editor: editor as never, file: null as never, ...info };
		s.selectSuggestion('max_stamina');
		expect(editor.getValue()).not.toContain('max_stamina_stamina');
	});
});

describe('SC-679: accepting a suggestion with nothing typed', () => {
	test.failing('leaves the cursor after the inserted value (an empty range maps the cursor to the front of it)', () => {
		const editor = new CmEditor('```ds-roll\nmode: \n```', { line: 1, ch: 6 });
		const s = new DsSchemaSuggest(new App() as any, registry());
		const info = s.onTrigger({ line: 1, ch: 6 }, editor as never, null)!;
		s.context = { editor: editor as never, file: null as never, ...info };
		s.selectSuggestion('opposed');
		expect(editor.getValue()).toBe('```ds-roll\nmode: opposed\n```');
		expect(editor.getCursor()).toEqual({ line: 1, ch: 13 });
	});
});
