// SC-443 — expected failures for the authoring bugs found by the e2e survey. Each `test.failing` encodes the CORRECT behaviour and goes
// green-as-failing while the bug exists; the moment the fix lands it fails with "expected to fail" and the marker comes off with the fix.
// SC-675 (an insert not at the start of an empty line breaks the block; related SC-462), SC-676 (/ds guard misses fences it cannot see),
// SC-677 (Ctrl/Cmd-click copy with a refusing clipboard), SC-678 (accepting a key mid-word doubles the tail).
// The SC-675 assertions are the NEUTRAL outcome (`insertOutcomeProblem`): the note is left alone, OR it holds one more sound block with every
// other byte intact, so a fix that splits onto its own lines and one that refuses with a Notice both flip them.
import { DsElementSuggest } from '../../../src/authoring/suggest';
import { DsSchemaSuggest } from '../../../src/authoring/schemaSuggest';
import { insertScaffold } from '../../../src/authoring/insert';
import { copyCode, insertFullBlock, insertReferenceBlock } from '../../../src/authoring/compendiumInsert';
import { createElementRegistry } from '../../../src/framework/registry';
import { registerFrameworkElementDefinitions } from 'main';
import { App } from '../../mocks/obsidian';
import { insertOutcomeProblem } from '../../../e2e/driver/authoringAssert';
import { loadMdDseFixture, makeCompendiumDeps } from '../elements/_refHarness';
import { CmEditor } from './_cmEditor';

const registry = () => {
	const r = createElementRegistry();
	registerFrameworkElementDefinitions(r);
	return r;
};
const KIT = 'mcdm.heroes.v1/kit/panther';
const GOBLIN = 'mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker';

describe('SC-675: an insert not at the start of an empty line (the neutral outcome)', () => {
	test('the helper itself: a refused insert, a split-onto-own-lines insert and a sound block pass; a glued opener, an unclosed block and lost text fail', () => {
		const block = '```ds-ct\nname: x\n```';
		expect(insertOutcomeProblem('abc', 'abc', 'ds-ct')).toBeNull();
		expect(insertOutcomeProblem('abc', `abc\n${block}\n`, 'ds-ct')).toBeNull();
		expect(insertOutcomeProblem('abcdef', `abc\n${block}\ndef`, 'ds-ct')).toBeNull();
		expect(insertOutcomeProblem('abc', `abc${block}`, 'ds-ct')).toMatch(/unclosed|expected/);
		expect(insertOutcomeProblem('', '```ds-ct\nname: x\n``` tail', 'ds-ct')).toMatch(/unclosed|expected/);
		expect(insertOutcomeProblem('abc', `\n${block}\n`, 'ds-ct')).toMatch(/did not survive/);
		expect(insertOutcomeProblem('- item\n  ', '- item\n  ```ds-ct\nname: x\n```', 'ds-ct', { indented: true })).toMatch(/unclosed|lost its indent/);
	});

	test.failing('the insert command inside a list item keeps every line of the block inside the item', () => {
		const before = '- item\n  ';
		const editor = new CmEditor(before, { line: 1, ch: 2 });
		insertScaffold(editor as never, registry().get('counter')!);
		expect(insertOutcomeProblem(before, editor.getValue(), 'ds-ct', { indented: true })).toBeNull();
	});

	test.failing('a compendium reference inserted mid-line is a sound block (or refused)', () => {
		const { vault, index } = makeCompendiumDeps();
		loadMdDseFixture(vault, 'kit/panther.md');
		const before = 'abcdef';
		const editor = new CmEditor(before, { line: 0, ch: 3 });
		insertReferenceBlock(editor as never, index.getEntry(KIT)!);
		expect(insertOutcomeProblem(before, editor.getValue(), 'ds-scc')).toBeNull();
	});

	test.failing('a compendium snapshot inserted at the end of a line of text is a sound block (or refused)', async () => {
		const { vault, index } = makeCompendiumDeps();
		loadMdDseFixture(vault, 'monster/goblin/statblock/goblin-stinker.md');
		const before = 'abc';
		const editor = new CmEditor(before, { line: 0, ch: 3 });
		await insertFullBlock(editor as never, (await index.getEntity(GOBLIN))!);
		expect(insertOutcomeProblem(before, editor.getValue(), 'ds-sb')).toBeNull();
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
