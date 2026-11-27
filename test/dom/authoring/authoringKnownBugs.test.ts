// SC-443 — expected failures for the authoring bugs found by the e2e survey. Each `test.failing` encodes the CORRECT behaviour and goes
// green-as-failing while the bug exists; the moment the fix lands it fails with "expected to fail" and the marker comes off with the fix.
// Still open: SC-676 (/ds guard misses fences it cannot see), SC-677 (Ctrl/Cmd-click copy with a refusing clipboard), SC-678 (accepting a key
// mid-word doubles the tail). Each marker states only the OUTCOME the ticket asks for, so any
// reasonable fix (refuse, suppress, move below, replace the whole word) flips it.
// Fixed, and now plain tests that pin exact bytes: SC-675 (an insert not at the start of an empty line broke the block; related SC-462), SC-679
// (accepting a suggestion with nothing typed left the cursor in front of it) and SC-688 (a value accepted right after `key:` wrote `key:value`; a
// value accepted mid-word doubled its tail). The helper has its own matrix in insertOwnLines.test.ts.
// Fixed, and kept as plain tests of the outcome: SC-687 (an insert command or a compendium insert run inside an existing block, or the properties,
// wrote into it: it is refused with a Notice now; the exact refusals are in insertRefusal.test.ts and insertPositionScan.test.ts).
import { DsElementSuggest } from '../../../src/authoring/suggest';
import { DsSchemaSuggest } from '../../../src/authoring/schemaSuggest';
import { insertScaffold } from '../../../src/authoring/insert';
import { buildScaffold } from '../../../src/authoring/scaffold';
import { dispatchReferenceChoice, insertFullBlock, insertReferenceBlock } from '../../../src/authoring/compendiumInsert';
import { createElementRegistry } from '../../../src/framework/registry';
import { registerFrameworkElementDefinitions } from 'main';
import { App, Notice, TFile, flushAsync } from '../../mocks/obsidian';
import { existingBlocksIntactProblem } from '../../../e2e/driver/authoringIntact';
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
	// Both cursors end in the same note: `- item⏎  |` (the continuation line, the whitespace branch of the prefix rule) and `- item|` (the list-marker
	// branch: the block goes on the next lines at the item's indentation).
	test.each([
		['on the continuation line of the item', '- item\n  ', { line: 1, ch: 2 }],
		['at the end of the item line', '- item', { line: 0, ch: 6 }],
	])('the insert command inside a list item, %s: every line of the block sits under the item, the text before the cursor survives, a Markdown parser reads one fenced code block in the item', (_name, before, at) => {
		const counter = registry().get('counter')!;
		const scaffold = buildScaffold(counter).text;
		const editor = new CmEditor(before, at);
		insertScaffold(editor as never, counter);
		// the opening fence goes right behind the two spaces already on the line (or on the next line, at the item's indentation); the other lines carry
		// the item's two-space indentation; no blank line
		expect(editor.getValue()).toBe('- item\n  ' + scaffold.split('\n').join('\n  '));
		expect(editor.getCursor()).toEqual({ line: 2, ch: 2 }); // the first body character
		type Item = { tokens: Array<{ type: string; lang?: string; text?: string }> };
		const list = marked.lexer(editor.getValue()).find((t) => t.type === 'list') as unknown as { items: Item[] };
		expect(list.items).toHaveLength(1);
		const code = list.items[0].tokens.find((t) => t.type === 'code');
		expect(code?.lang).toBe('ds-ct');
		expect(code?.text).toBe(scaffold.split('\n').slice(1, -1).join('\n'));
	});

	test('the insert command inside a callout: an empty line of the block is `>` (no trailing space), every other line keeps `> `', () => {
		// the counter scaffold has no empty line, so the element's example gets one
		const withBlank = { id: 'ct', name: 'Counter', aliases: ['ds-ct'], authoring: { example: 'a: 1\n\nb: 2' } } as never;
		const editor = new CmEditor('> [!note]\n> ', { line: 1, ch: 2 });
		insertScaffold(editor as never, withBlank);
		expect(editor.getValue()).toBe('> [!note]\n> ```ds-ct\n> a: 1\n>\n> b: 2\n> ```');
		expect(editor.getCursor()).toEqual({ line: 2, ch: 2 });
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

	test('a compendium snapshot inserted at the end of a line of text: the block starts on the next line and ends its own line, the cursor is on the line after it', async () => {
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
		expect(editor.getCursor()).toEqual({ line: editor.lineCount() - 1, ch: 0 }); // the empty line the block ends with
		expect(editor.getLine(editor.lineCount() - 1)).toBe('');
		expect(editor.writes).toHaveLength(1);
	});
});

describe('SC-676: /ds offers itself where it must not', () => {
	// A fix may find the place from the note's text or from Obsidian's metadata cache (`onTrigger` is handed the file), so the markers give both:
	// the file and a cache shaped like Obsidian's (`frontmatterPosition`, and `sections` with the code / list sections of the note).
	const FILE = new TFile('Note.md');
	const cacheOf = (doc: string) => {
		const lines = doc.split('\n');
		const end = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
		const at = (line: number) => ({ line, col: 0, offset: 0 });
		const sections: Array<{ type: string; position: unknown }> = [];
		for (let i = Math.max(end + 1, 0); i < lines.length; i++) {
			if (/^\s*(```|~~~)/.test(lines[i])) {
				let j = i + 1;
				while (j < lines.length && !/^\s*(```|~~~)\s*$/.test(lines[j])) j++;
				sections.push({ type: /^\s/.test(lines[i]) ? 'list' : 'code', position: { start: at(i - (/^\s/.test(lines[i]) ? 1 : 0)), end: at(Math.min(j, lines.length - 1)) } });
				i = j;
			}
		}
		return { ...(end > 0 ? { frontmatterPosition: { start: at(0), end: at(end) } } : {}), sections };
	};
	const triggers = (doc: string, line: number, ch: number): boolean => {
		const app = new App();
		jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheOf(doc) as never);
		return new DsElementSuggest(app as any, registry()).onTrigger({ line, ch }, new CmEditor(doc) as never, FILE as never) !== null;
	};

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
	// The bug the user sees is "no Notice and an unhandled rejection" after a Ctrl-click, wherever the fix goes (copyCode itself, or the call in
	// dispatchReferenceChoice), so the marker drives the choice the way the search window does and asks for the outcome: the user is told, and no
	// rejection escapes. Jest owns the process's `unhandledRejection` handler and fails the running test on any escape, and a jest test's `process`
	// is a copy that never sees the real event, so the REAL process (the outer context `vm.runInThisContext` reaches) is borrowed for the call.
	const realProcess = (jest.requireActual('vm') as typeof import('vm')).runInThisContext('process') as NodeJS.Process;
	test.failing('a Ctrl-click choice with a refusing clipboard tells the user and no rejection escapes', async () => {
		(navigator as any).clipboard = { writeText: jest.fn().mockRejectedValue(new Error('NotAllowedError: Document is not focused')) };
		const escaped: unknown[] = [];
		const onRejection = (reason: unknown) => escaped.push(reason);
		const runners = realProcess.listeners('unhandledRejection');
		realProcess.removeAllListeners('unhandledRejection');
		realProcess.on('unhandledRejection', onRejection);
		try {
			const { vault, index } = makeCompendiumDeps();
			loadMdDseFixture(vault, 'kit/panther.md');
			const editor = new CmEditor('abc', { line: 0, ch: 3 });
			const told = Notice.notices.length;
			dispatchReferenceChoice(editor as never, index.getEntry(KIT)!, { ctrlKey: true });
			await flushAsync(8);
			await new Promise((resolve) => setTimeout(resolve, 50)); // node reports an unhandled rejection a tick after the microtasks drain
			expect(editor.getValue()).toBe('abc');
			expect(Notice.notices.length).toBeGreaterThan(told);
			expect(escaped).toEqual([]);
		} finally {
			realProcess.removeListener('unhandledRejection', onRejection);
			for (const l of runners) realProcess.on('unhandledRejection', l as never);
			delete (navigator as any).clipboard;
		}
	});
});

describe('SC-678: accepting a key with the cursor in the middle of a word', () => {
	test.failing('replaces the whole word, it does not double the tail (max|_stamina -> max_stamina)', () => {
		const editor = new CmEditor('```ds-stam\nmax_stamina: 5', { line: 1, ch: 3 });
		const s = new DsSchemaSuggest(new App() as any, registry());
		const info = s.onTrigger({ line: 1, ch: 3 }, editor as never, null);
		// Not offering the list mid-word is a fix too (as /ds never fires mid-word): then there is nothing to accept and the test passes.
		if (info !== null) {
			s.context = { editor: editor as never, file: null as never, ...info };
			s.selectSuggestion('max_stamina');
		}
		expect(editor.getValue()).not.toContain('max_stamina_stamina');
	});
});

describe('SC-687 (fixed): an insert command or a compendium insert run with the cursor inside an existing block', () => {
	// The ticket asks that every existing block, and the frontmatter, are left byte for byte (`existingBlocksIntactProblem`); the fix refuses.
	const STAM = '```ds-stam\nmax_stamina: 20\n\ncurrent_stamina: 5\n```\n\nafter text\n';
	const FRONT = '---\ntags: [a]\n\n---\nbody\n';

	test('the helper itself: an unchanged note and a block moved below pass; a block pushed into the existing fence, an unclosed fence and a changed frontmatter fail', () => {
		const block = '```ds-ct\nname: x\n```';
		expect(existingBlocksIntactProblem(STAM, STAM)).toBeNull();
		expect(existingBlocksIntactProblem(STAM, '```ds-stam\nmax_stamina: 20\n\ncurrent_stamina: 5\n```\n' + block + '\n\nafter text\n')).toBeNull();
		expect(existingBlocksIntactProblem(STAM, '```ds-stam\nmax_stamina: 20\n' + block + '\ncurrent_stamina: 5\n```\n\nafter text\n')).toMatch(/did not survive|unclosed/);
		expect(existingBlocksIntactProblem('a\n', 'a\n```ds-ct\nname: x\n')).toMatch(/unclosed/);
		expect(existingBlocksIntactProblem(FRONT, FRONT.replace('\n\n---', '\n' + block + '\n---'))).toMatch(/frontmatter/);
		expect(existingBlocksIntactProblem(FRONT, FRONT + block + '\n')).toBeNull();
	});

	test('the insert command on an empty line inside a ds-stam block leaves that block intact', () => {
		const editor = new CmEditor(STAM, { line: 2, ch: 0 });
		insertScaffold(editor as never, registry().get('counter')!);
		expect(existingBlocksIntactProblem(STAM, editor.getValue())).toBeNull();
	});

	test('a compendium reference inserted inside a ds-stam block leaves that block intact', () => {
		const { vault, index } = makeCompendiumDeps();
		loadMdDseFixture(vault, 'kit/panther.md');
		const editor = new CmEditor(STAM, { line: 2, ch: 0 });
		insertReferenceBlock(editor as never, index.getEntry(KIT)!);
		expect(existingBlocksIntactProblem(STAM, editor.getValue())).toBeNull();
	});

	test('the insert command on an empty line of the frontmatter leaves the frontmatter intact', () => {
		const editor = new CmEditor(FRONT, { line: 2, ch: 0 });
		insertScaffold(editor as never, registry().get('counter')!);
		expect(existingBlocksIntactProblem(FRONT, editor.getValue())).toBeNull();
	});
});

describe('SC-688 (fixed): the value list and a word accepted mid-value', () => {
	// The twin of SC-678 for the enum list (ds-roll is deferred: the list exists with the experimental gate on, the suite default). An accept replaces the
	// whole value word under the cursor, through the next whitespace. The other half of SC-688, an accept right after `key:` with no space, is in
	// schemaSuggestMatrix.test.ts.
	const accept = (doc: string, ch: number, value: string) => {
		const editor = new CmEditor(doc, { line: 1, ch });
		const s = new DsSchemaSuggest(new App() as any, registry());
		const info = s.onTrigger({ line: 1, ch }, editor as never, null)!;
		s.context = { editor: editor as never, file: null as never, ...info };
		s.selectSuggestion(value);
		return editor;
	};

	test('with the cursor mid-word (`mode: op|posed`) the whole word is replaced, the tail is not doubled', () => {
		const editor = accept('```ds-roll\nmode: opposed', 8, 'opposed');
		expect(editor.getValue()).toBe('```ds-roll\nmode: opposed');
		expect(editor.getCursor()).toEqual({ line: 1, ch: 13 });
	});

	test('only the word under the cursor is replaced: text after the whitespace survives (`mode: op|p xyz`, `mode: op|posed # c`)', () => {
		expect(accept('```ds-roll\nmode: opp xyz', 8, 'opposed').getLine(1)).toBe('mode: opposed xyz');
		const editor = accept('```ds-roll\nmode: opposed # c', 8, 'opposed');
		expect(editor.getLine(1)).toBe('mode: opposed # c');
		expect(editor.getCursor()).toEqual({ line: 1, ch: 13 });
	});
});

describe('SC-679: accepting a suggestion with nothing typed', () => {
	test('leaves the cursor after the inserted value (an empty range maps the cursor to the front of it)', () => {
		const editor = new CmEditor('```ds-roll\nmode: \n```', { line: 1, ch: 6 });
		const s = new DsSchemaSuggest(new App() as any, registry());
		const info = s.onTrigger({ line: 1, ch: 6 }, editor as never, null)!;
		s.context = { editor: editor as never, file: null as never, ...info };
		s.selectSuggestion('opposed');
		expect(editor.getValue()).toBe('```ds-roll\nmode: opposed\n```');
		expect(editor.getCursor()).toEqual({ line: 1, ch: 13 });
	});
});
