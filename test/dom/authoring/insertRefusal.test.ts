// SC-687 — an insert never writes inside an existing fenced block or the note's properties. The four insert paths (the Insert commands, the /ds pick,
// the compendium reference and the compendium snapshot) all write through blockInsert.ts `insertBlock`, so the guard is there; the two compendium commands
// also check when they start, before the search opens. These tests run each path against a REAL CodeMirror 6 state (`_cmEditor.ts`) and assert what the user
// is left with: the note, the cursor and the selection exactly as they were, no write (so no undo entry), and ONE Notice with the ruled text.
// The position scan itself (every verdict, as a table) is in insertPositionScan.test.ts.
import { insertScaffold } from '../../../src/authoring/insert';
import { DsElementSuggest } from '../../../src/authoring/suggest';
import { INSERT_REFUSED_NOTICE } from '../../../src/authoring/blockInsert';
import { CompendiumSearchModal } from '../../../src/authoring/CompendiumSearchModal';
import { dispatchBlockChoice, dispatchReferenceChoice, insertFullBlock, insertReferenceBlock, registerCompendiumInsertCommands } from '../../../src/authoring/compendiumInsert';
import { buildScaffold } from '../../../src/authoring/scaffold';
import { createElementRegistry } from '../../../src/framework/registry';
import { registerFrameworkElementDefinitions } from 'main';
import { App, Notice, Plugin, flushAsync } from '../../mocks/obsidian';
import { existingBlocksIntactProblem } from '../../../e2e/driver/authoringIntact';
import { scanFences } from '../../../e2e/driver/noteFences';
import { loadMdDseFixture, makeCompendiumDeps } from '../elements/_refHarness';
import { CmEditor } from './_cmEditor';

const registry = () => {
	const r = createElementRegistry();
	registerFrameworkElementDefinitions(r);
	return r;
};
const COUNTER = () => registry().get('counter')!;
const CT = () => buildScaffold(COUNTER()).text;
const KIT = 'mcdm.heroes.v1/kit/panther';
const GOBLIN = 'mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker';

const BLOCK_NOTICE = 'The cursor is inside another block, so nothing was inserted. Move it to a line outside the block and run the command again.';
const PROPERTIES_NOTICE = "The cursor is inside the note's properties, so nothing was inserted. Move it below the properties and run the command again.";

const STAM = '```ds-stam\nmax_stamina: 20\n\ncurrent_stamina: 5\n```\n\nafter text\n';
const IN_STAM = { line: 2, ch: 0 }; // the empty line inside the block: the ticket's repro
const FRONT = '---\ntags: [a]\n\n---\nbody\n';
const IN_FRONT = { line: 2, ch: 0 };

/** What an editor looks like from outside: the note, the cursor, the selection ends, and whether a write reached it. */
const snapshot = (e: CmEditor) => ({ value: e.getValue(), head: e.getCursor('head'), from: e.getCursor('from'), to: e.getCursor('to'), writes: e.writes.length });
const noticesSince = (n: number) => Notice.notices.slice(n);

function setupCompendium() {
	const harness = makeCompendiumDeps();
	loadMdDseFixture(harness.vault, 'kit/panther.md');
	loadMdDseFixture(harness.vault, 'monster/goblin/statblock/goblin-stinker.md');
	return { ...harness, kit: () => harness.index.getEntry(KIT)!, goblin: () => harness.index.getEntry(GOBLIN)! };
}

describe('SC-687: the Notice texts are the ruled ones', () => {
	test('both, verbatim', () => {
		expect(INSERT_REFUSED_NOTICE).toEqual({ block: BLOCK_NOTICE, properties: PROPERTIES_NOTICE });
	});
});

describe('SC-687: the insert command with the cursor inside an existing block or the properties', () => {
	test.each([
		['the empty line of a ds-stam block (the ticket\'s repro)', STAM, IN_STAM, BLOCK_NOTICE],
		['the end of a body line', STAM, { line: 1, ch: 15 }, BLOCK_NOTICE],
		['the opening line, after the marker', STAM, { line: 0, ch: 5 }, BLOCK_NOTICE],
		['the closing line, in front of the marker', STAM, { line: 4, ch: 0 }, BLOCK_NOTICE],
		['an empty line of the properties', FRONT, IN_FRONT, PROPERTIES_NOTICE],
		['the first line of the properties', FRONT, { line: 0, ch: 0 }, PROPERTIES_NOTICE],
		['the closing line of the properties, in front of the marker', FRONT, { line: 3, ch: 0 }, PROPERTIES_NOTICE],
	])('%s: nothing is written, the cursor stays, exactly one Notice', (_name, note, at, notice) => {
		const editor = new CmEditor(note, at);
		const before = snapshot(editor);
		const state = editor.state;
		const told = Notice.notices.length;
		expect(insertScaffold(editor as never, COUNTER())).toBe(false);
		expect(snapshot(editor)).toEqual(before);
		expect(editor.state).toBe(state); // not even a no-op transaction: the editor's undo history never saw it
		expect(noticesSince(told)).toEqual([notice]);
	});

	test('a selection with one end inside is refused and left selected; with both ends outside it is replaced as before', () => {
		const inside = new CmEditor(STAM, { line: 0, ch: 0 }, { line: 3, ch: 4 }); // from the start of the opening line (outside) to a body line (inside)
		const told = Notice.notices.length;
		const before = snapshot(inside);
		expect(insertScaffold(inside as never, COUNTER())).toBe(false);
		expect(snapshot(inside)).toEqual(before);
		expect(noticesSince(told)).toEqual([BLOCK_NOTICE]);

		// the whole block selected, from before its marker to the end of its closing line: both ends outside, replaced (today's behaviour)
		const whole = new CmEditor(STAM, { line: 0, ch: 0 }, { line: 4, ch: 3 });
		expect(insertScaffold(whole as never, COUNTER())).toBe(true);
		expect(whole.getValue()).toBe(CT() + '\n\nafter text\n');
	});

	test('text above and below the refused position is byte for byte what it was, in a note with a CRLF-written block and odd spacing', () => {
		const note = 'Intro\r\n\r\n   ```ds-stam  \r\n\tmax_stamina:\t20\r\n\r\ncurrent_stamina: 5\r\n   ```  \r\n\r\nafter text\r\n';
		const editor = new CmEditor(note, { line: 4, ch: 0 }); // CodeMirror splits CRLF, so the editor holds LF
		const before = editor.getValue();
		expect(insertScaffold(editor as never, COUNTER())).toBe(false);
		expect(editor.getValue()).toBe(before);
		expect(editor.writes).toHaveLength(0);
	});
});

describe('SC-687: the other three insert paths', () => {
	test('the compendium reference insert, inside a block and inside the properties', () => {
		const { kit } = setupCompendium();
		for (const [note, at, notice] of [[STAM, IN_STAM, BLOCK_NOTICE], [FRONT, IN_FRONT, PROPERTIES_NOTICE]] as const) {
			const editor = new CmEditor(note, at);
			const before = snapshot(editor);
			const told = Notice.notices.length;
			expect(insertReferenceBlock(editor as never, kit())).toBe(false);
			expect(snapshot(editor)).toEqual(before);
			expect(noticesSince(told)).toEqual([notice]);
		}
	});

	test('the compendium snapshot insert, inside a block and inside the properties: refused after its awaits, returns false, one Notice', async () => {
		const { index, goblin } = setupCompendium();
		const entity = (await index.getEntity(goblin().scc))!;
		for (const [note, at, notice] of [[STAM, IN_STAM, BLOCK_NOTICE], [FRONT, IN_FRONT, PROPERTIES_NOTICE]] as const) {
			const editor = new CmEditor(note, at);
			const before = snapshot(editor);
			const told = Notice.notices.length;
			await expect(insertFullBlock(editor as never, entity)).resolves.toBe(false);
			expect(snapshot(editor)).toEqual(before);
			expect(noticesSince(told)).toEqual([notice]);
		}
		// and through the choice dispatcher the search window calls: still one Notice
		const editor = new CmEditor(STAM, IN_STAM);
		const told = Notice.notices.length;
		await dispatchBlockChoice(editor as never, index, goblin());
		expect(editor.getValue()).toBe(STAM);
		expect(noticesSince(told)).toEqual([BLOCK_NOTICE]);
	});

	test('a reference choice made after the cursor moved into a block while the search was open: refused, one Notice', () => {
		const { kit } = setupCompendium();
		const editor = new CmEditor('abc\n\n' + STAM, { line: 1, ch: 0 });
		editor.setCursor({ line: 4, ch: 0 }); // the search window was open; the cursor is now on the block's empty line
		const told = Notice.notices.length;
		dispatchReferenceChoice(editor as never, kit(), {});
		expect(editor.writes).toHaveLength(0);
		expect(noticesSince(told)).toEqual([BLOCK_NOTICE]);
	});

	describe('the /ds pick', () => {
		const pick = (note: string, at: { line: number; ch: number }, token: string): { editor: CmEditor; notices: string[]; closed: number } => {
			const editor = new CmEditor(note, at);
			const s = new DsElementSuggest(new App() as never, registry());
			const end = editor.getCursor('head');
			s.context = { editor: editor as never, file: null as never, start: { line: end.line, ch: end.ch - token.length }, end, query: token.slice(3) };
			const close = jest.spyOn(s, 'close');
			const told = Notice.notices.length;
			s.selectSuggestion(COUNTER(), null as never);
			return { editor, notices: noticesSince(told), closed: close.mock.calls.length };
		};

		test('a refused pick closes the suggestion list (a second Enter must not show a second Notice); the token stays as typed', () => {
			const note = '---\ntags: /dsct\n---\nbody';
			const refused = pick(note, { line: 1, ch: 10 }, '/dsct');
			expect(refused.closed).toBe(1);
			expect(refused.editor.getValue()).toBe(note);
			expect(refused.notices).toEqual([PROPERTIES_NOTICE]);
			// a pick that writes leaves closing to Obsidian, as before
			expect(pick('/dsct', { line: 0, ch: 5 }, '/dsct').closed).toBe(0);
		});

		test('typed inside a block the suggester did not see (a block indented under a list item: SC-676): refused, the typed token stays as typed', () => {
			const note = '- item\n  ```ds-ct\n  name: /dsct\n  ```\n';
			const { editor, notices } = pick(note, { line: 2, ch: 14 }, '/dsct');
			expect(editor.getValue()).toBe(note);
			expect(editor.writes).toHaveLength(0);
			expect(notices).toEqual([BLOCK_NOTICE]);
		});

		test('typed in the properties (SC-676): refused, the token stays', () => {
			const note = '---\ntags: /dsct\n---\nbody';
			const { editor, notices } = pick(note, { line: 1, ch: 10 }, '/dsct');
			expect(editor.getValue()).toBe(note);
			expect(notices).toEqual([PROPERTIES_NOTICE]);
		});

		test('typed on a fence\'s own opening line (SC-676): refused, the token stays', () => {
			const note = '```js /dsct\nx\n```';
			const { editor, notices } = pick(note, { line: 0, ch: 11 }, '/dsct');
			expect(editor.getValue()).toBe(note);
			expect(notices).toEqual([BLOCK_NOTICE]);
		});

		test('typed outside every block: the token is replaced by the block, no Notice (as before)', () => {
			const { editor, notices } = pick('/dsct', { line: 0, ch: 5 }, '/dsct');
			expect(editor.getValue()).toBe(CT());
			expect(notices).toEqual([]);
		});
	});
});

describe('SC-687: the two compendium commands refuse before the search opens', () => {
	const opened: CompendiumSearchModal[] = [];
	let spy: jest.SpyInstance;
	beforeEach(() => {
		opened.length = 0;
		spy = jest.spyOn(CompendiumSearchModal.prototype, 'onOpen').mockImplementation(function (this: CompendiumSearchModal) {
			opened.push(this);
		});
	});
	afterEach(() => spy.mockRestore());

	function commands() {
		const { app, index } = setupCompendium();
		const plugin = new Plugin(app as any) as any;
		plugin.syncCompendium = jest.fn();
		registerCompendiumInsertCommands(plugin, index, {} as never);
		return (id: string) => plugin.commands.find((c: { id: string }) => c.id === id).editorCallback as (editor: unknown, ctx?: unknown) => void;
	}

	test.each([
		['insert-compendium-reference', STAM, IN_STAM, BLOCK_NOTICE],
		['insert-compendium-block', STAM, IN_STAM, BLOCK_NOTICE],
		['insert-compendium-reference', FRONT, IN_FRONT, PROPERTIES_NOTICE],
		['insert-compendium-block', FRONT, IN_FRONT, PROPERTIES_NOTICE],
	])('%s with the cursor inside %#: one Notice, no search window, the note unchanged', (id, note, at, notice) => {
		const run = commands()(id);
		const editor = new CmEditor(note, at);
		const before = snapshot(editor);
		const told = Notice.notices.length;
		run(editor);
		expect(opened).toHaveLength(0);
		expect(snapshot(editor)).toEqual(before);
		expect(noticesSince(told)).toEqual([notice]);
	});

	test.each(['insert-compendium-reference', 'insert-compendium-block'])('%s outside every block: the search opens, no Notice', (id) => {
		const run = commands()(id);
		const editor = new CmEditor(STAM, { line: 6, ch: 0 }); // the blank line below the block
		const told = Notice.notices.length;
		run(editor);
		expect(opened).toHaveLength(1);
		expect(noticesSince(told)).toEqual([]);
	});

	test('a choice picked in the search after a command that passed: the block lands (the write-time check does not double the start check)', async () => {
		const run = commands()('insert-compendium-reference');
		const editor = new CmEditor('abc\n\n', { line: 2, ch: 0 });
		run(editor);
		const { kit } = setupCompendium();
		opened[0].onChooseSuggestion(kit(), {} as never);
		await flushAsync(6);
		expect(editor.getValue()).toBe('abc\n\n```ds-scc\n' + KIT + '\n```\n');
	});
});

describe('SC-687: where an insert IS allowed next to a block, and both blocks are intact', () => {
	const KEEP = (before: string, after: string, count: number) => {
		expect(existingBlocksIntactProblem(before, after)).toBeNull();
		expect(scanFences(after).filter((f) => f.closed)).toHaveLength(count);
	};

	test('in front of the opening marker of a top-level fence: the block lands above, the existing block follows byte for byte', () => {
		const note = 'above\n```ds-stam\nmax_stamina: 20\n```\nbelow\n';
		for (const ch of [0]) {
			const editor = new CmEditor(note, { line: 1, ch });
			expect(insertScaffold(editor as never, COUNTER())).toBe(true);
			expect(editor.getValue()).toBe('above\n' + CT() + '\n```ds-stam\nmax_stamina: 20\n```\nbelow\n');
			KEEP(note, editor.getValue(), 2);
		}
	});

	test('in front of the opening marker of a quoted fence (ch 0, in the prefix, at the marker): the existing callout block is intact', () => {
		const note = '> [!note]\n> ```ds-stam\n> max_stamina: 20\n> ```\n';
		for (const ch of [0, 1, 2]) {
			const editor = new CmEditor(note, { line: 1, ch });
			expect(insertScaffold(editor as never, COUNTER())).toBe(true);
			const after = editor.getValue();
			expect(after.endsWith('```ds-stam\n> max_stamina: 20\n> ```\n')).toBe(true);
			expect(after.startsWith('> [!note]\n')).toBe(true);
			KEEP(note.replace(/> /g, ''), after.replace(/> /g, ''), 2); // quote prefix aside, two closed blocks, the first intact
		}
	});

	test('in front of the opening marker of a list-indented fence (ch 0, 1, 2): the existing block\'s own lines are all still there, in order', () => {
		const note = '- item\n  ```ds-stam\n  max_stamina: 20\n  ```\n';
		for (const ch of [0, 1, 2]) {
			const editor = new CmEditor(note, { line: 1, ch });
			expect(insertScaffold(editor as never, COUNTER())).toBe(true);
			const lines = editor.getValue().split('\n');
			const at = lines.findIndex((l) => l.trimStart() === '```ds-stam');
			expect(at).toBeGreaterThan(0);
			expect(lines.slice(at).map((l) => l.trim())).toEqual(['```ds-stam', 'max_stamina: 20', '```', '']);
			expect(lines.slice(0, 1)).toEqual(['- item']);
		}
	});

	test('at the end of the closing line: the block lands below, the first block is intact and the text after it moves down untouched', () => {
		const note = '```ds-stam\nmax_stamina: 20\n```\nafter text\n';
		const editor = new CmEditor(note, { line: 2, ch: 3 });
		expect(insertScaffold(editor as never, COUNTER())).toBe(true);
		expect(editor.getValue()).toBe('```ds-stam\nmax_stamina: 20\n```\n' + CT() + '\nafter text\n');
		KEEP(note, editor.getValue(), 2);
	});

	test('at the end of the closing line of a block that is the last thing in the note, and of the properties', () => {
		const a = new CmEditor('```ds-stam\nmax_stamina: 20\n```', { line: 2, ch: 3 });
		expect(insertScaffold(a as never, COUNTER())).toBe(true);
		expect(a.getValue()).toBe('```ds-stam\nmax_stamina: 20\n```\n' + CT());
		const b = new CmEditor(FRONT, { line: 3, ch: 3 });
		expect(insertScaffold(b as never, COUNTER())).toBe(true);
		expect(b.getValue()).toBe('---\ntags: [a]\n\n---\n' + CT() + '\nbody\n');
		expect(b.getValue().startsWith(FRONT.slice(0, FRONT.indexOf('body')))).toBe(true); // the properties are byte-identical at the start of the note
	});
});

describe('SC-687: running an insert twice in a row under a list item or in a callout', () => {
	// The first insert leaves the cursor on the new block's first body line; the second must not write into that block.
	test.each([
		['- item', { line: 0, ch: 6 }],
		['1. item', { line: 0, ch: 7 }],
		['10. item', { line: 0, ch: 8 }],
		['- a\n  - b', { line: 1, ch: 7 }],
		['- a\n  - b\n    - c', { line: 2, ch: 9 }],
		['> [!note] T\n> first', { line: 1, ch: 7 }],
		['> - item', { line: 0, ch: 8 }],
		['- > [!note] T', { line: 0, ch: 13 }],
	])('%j: the second run is refused and the note stays as the first run left it', (note, at) => {
		const editor = new CmEditor(note, at);
		expect(insertScaffold(editor as never, COUNTER())).toBe(true);
		const afterFirst = snapshot(editor);
		const told = Notice.notices.length;
		expect(insertScaffold(editor as never, COUNTER())).toBe(false);
		expect(snapshot(editor)).toEqual(afterFirst);
		expect(noticesSince(told)).toEqual([BLOCK_NOTICE]);
	});
});

describe('SC-687 r3: the plugin\'s own insert under a list item does not make the rest of the note refuse', () => {
	test('insert on the empty line under `- item`, then a second insert at `tail`: both are written, the second one below the first', () => {
		const note = '- item\n\ntail\n';
		const editor = new CmEditor(note, { line: 1, ch: 0 });
		expect(insertScaffold(editor as never, COUNTER())).toBe(true);
		expect(editor.getValue()).toBe('- item\n' + CT() + '\ntail\n'); // the SC-675 shape for an empty line with no prefix
		const tail = editor.getValue().split('\n').indexOf('tail');
		editor.setCursor({ line: tail, ch: 4 });
		const told = Notice.notices.length;
		expect(insertScaffold(editor as never, COUNTER())).toBe(true);
		expect(noticesSince(told)).toEqual([]);
		expect(editor.getValue()).toBe('- item\n' + CT() + '\ntail\n' + CT() + '\n');
	});

	test('a real block lower in the note under a later item (after a fence under an earlier one) is refused, nothing written', () => {
		const note = '- item\n```js\nx\n```\n- other\n  ```\n  a: 1\n  ```\ntail\n';
		const editor = new CmEditor(note, { line: 6, ch: 6 });
		const told = Notice.notices.length;
		expect(insertScaffold(editor as never, COUNTER())).toBe(false);
		expect(editor.getValue()).toBe(note);
		expect(noticesSince(told)).toEqual([BLOCK_NOTICE]);
	});
});

describe('SC-687 r3: several cursors', () => {
	const note = 'before\n\n' + STAM;
	const INSIDE = { line: 4, ch: 0 }; // the empty line inside the block
	const OUTSIDE = { line: 8, ch: 10 }; // the end of `after text`

	test.each([
		['the main cursor inside, the other outside', 0],
		['the main cursor outside, the other inside (the reviewer\'s case: the write used to go into the block)', 1],
	])('%s: refused, one Notice, nothing written at either cursor', (_name, main) => {
		const editor = new CmEditor(note);
		editor.setSelections([{ anchor: INSIDE }, { anchor: OUTSIDE }], main === 0 ? 0 : 1); // index 0 is the cursor inside, 1 the one outside
		expect(editor.getCursor('head')).toEqual(main === 0 ? INSIDE : OUTSIDE);
		expect(editor.getLine(INSIDE.line)).toBe('');
		const before = { value: editor.getValue(), sel: editor.listSelections() };
		const told = Notice.notices.length;
		expect(insertScaffold(editor as never, COUNTER())).toBe(false);
		expect(editor.getValue()).toBe(before.value);
		expect(editor.listSelections()).toEqual(before.sel);
		expect(editor.writes).toHaveLength(0);
		expect(noticesSince(told)).toEqual([BLOCK_NOTICE]);
	});

	test('a selection range with its anchor inside and its head outside refuses too', () => {
		const editor = new CmEditor(note);
		editor.setSelections([{ anchor: { line: 0, ch: 0 } }, { anchor: { line: 3, ch: 2 }, head: { line: 7, ch: 0 } }], 0);
		expect(insertScaffold(editor as never, COUNTER())).toBe(false);
		expect(editor.writes).toHaveLength(0);
	});

	test('both cursors outside: written exactly as before (one replaceSelection that writes at each cursor)', () => {
		const editor = new CmEditor('abc\n\nxyz\n');
		editor.setSelections([{ anchor: { line: 1, ch: 0 } }, { anchor: { line: 3, ch: 0 } }], 1);
		const told = Notice.notices.length;
		expect(insertScaffold(editor as never, COUNTER())).toBe(true);
		expect(noticesSince(told)).toEqual([]);
		expect(editor.writes).toHaveLength(1);
		expect(editor.getValue()).toBe('abc\n' + CT() + '\nxyz\n' + CT());
	});
});

describe('SC-687: integrity around a refusal', () => {
	test('a refusal in one block, then a valid insert between two same-kind blocks in the same note: it lands there, neither block is touched', () => {
		const note = '```ds-stam\na: 1\n```\nbetween\n\n```ds-stam\nb: 2\n```\n';
		const editor = new CmEditor(note, { line: 1, ch: 2 });
		expect(insertScaffold(editor as never, COUNTER())).toBe(false);
		expect(editor.getValue()).toBe(note);
		editor.setCursor({ line: 4, ch: 0 }); // the blank line between the blocks
		expect(insertScaffold(editor as never, COUNTER())).toBe(true);
		expect(editor.getValue()).toBe('```ds-stam\na: 1\n```\nbetween\n' + CT() + '\n```ds-stam\nb: 2\n```\n');
		expect(existingBlocksIntactProblem(note, editor.getValue())).toBeNull();
		// and inside the second one, after the first insert, it is still refused
		editor.setCursor({ line: editor.lineCount() - 3, ch: 0 });
		expect(editor.getLine(editor.lineCount() - 3)).toBe('b: 2');
		expect(insertScaffold(editor as never, COUNTER())).toBe(false);
	});

	test('the properties then a block: inside the block is refused, below the properties is not, and the properties never change', () => {
		const note = '---\ntags: [a]\n---\n```ds-stam\na: 1\n```\n';
		const editor = new CmEditor(note, { line: 4, ch: 0 });
		expect(insertScaffold(editor as never, COUNTER())).toBe(false);
		editor.setCursor({ line: 2, ch: 3 });
		expect(insertScaffold(editor as never, COUNTER())).toBe(true);
		expect(editor.getValue().startsWith('---\ntags: [a]\n---\n```ds-ct\n')).toBe(true);
		expect(editor.getValue().endsWith('```ds-stam\na: 1\n```\n')).toBe(true);
	});
});
