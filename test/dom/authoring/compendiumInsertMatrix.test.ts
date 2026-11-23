// SC-443 — compendium search + insert as tables, over a small hand-picked fixture compendium (the same files the e2e vault gets):
// the query x `type:` / `source:` matrix, what each family inserts as a reference vs a snapshot, the click-modifier routing, the
// snapshot command's filter (SC-149) and what each choice leaves in a note around the cursor (line start, end of file, a selection, a callout).
import { CompendiumSearchModal } from '@/authoring/CompendiumSearchModal';
import {
	dispatchBlockChoice,
	dispatchReferenceChoice,
	insertFullBlock,
	insertInlineLink,
	insertReferenceBlock,
	registerCompendiumInsertCommands,
} from '@/authoring/compendiumInsert';
import { snapshotAliasForType } from '@/services/typeAdapters';
import type { CompendiumEntry } from '@/services/CompendiumIndex';
import { parseYaml } from 'obsidian';
import { Notice, Plugin, flushAsync } from '../../mocks/obsidian';
import { loadMdDseFixture, makeCompendiumDeps } from '../elements/_refHarness';
import { CmEditor } from './_cmEditor';

// The load order is the index order, and the index does not rank: a result list is in this order.
const FILES = [
	'kit/panther.md',
	'kit/mountain.md',
	'condition/bleeding.md',
	'monster/goblin/statblock/goblin-stinker.md',
	'monster/goblin/statblock/skitterling.md',
	'monster/retainer/gnoll-gnasher.md',
	'monster/devil/devil-malice.md',
	'feature/ability/shadow/level-1/coat-the-blade.md',
	'feature/fury/level-1/growing-ferocity.md',
	'feature/companion/beastheart/lightbender/level-3/hit-and-run.md',
	'feature/ability/fury/level-1/hit-and-run.md',
	'rule/combat/turn.md',
	'monster/companion/beastheart/statblock/panther.md',
];
const KIT = 'mcdm.heroes.v1/kit/panther';
const GOBLIN = 'mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker';
const MALICE = 'mcdm.monsters.v1/monster.devil/devil-malice';
const ABILITY = 'mcdm.heroes.v1/feature.ability.shadow.level-1/coat-the-blade';
const TRAIT = 'mcdm.heroes.v1/feature.fury.level-1/growing-ferocity';
const RULE = 'mcdm.heroes.v1/rule.combat/turn';
const CONDITION = 'mcdm.heroes.v1/condition/bleeding';

function setup(empty = false) {
	const harness = makeCompendiumDeps();
	if (!empty) for (const f of FILES) loadMdDseFixture(harness.vault, f);
	const modal = (opts: ConstructorParameters<typeof CompendiumSearchModal>[3] = {}) =>
		new CompendiumSearchModal(harness.app as any, harness.index, jest.fn(), opts);
	const entry = (code: string): CompendiumEntry => harness.index.getEntry(code)!;
	return { ...harness, modal, entry };
}
const names = (rows: CompendiumEntry[]) => rows.map((r) => `${r.name} [${r.type}]`);

describe('the query matrix: fuzzy text x type: x source:', () => {
	// The fuzzy match is a subsequence match on the name, case-insensitive; results are unranked (index order).
	const CASES: Array<[query: string, results: string[]]> = [
		['', ['Panther [kit]', 'Mountain [kit]', 'Bleeding [condition]', 'Goblin Stinker [statblock]', 'Skitterling [statblock]', 'Gnoll Gnasher [statblock]', 'Devil Malice [featureblock]', 'Coat the Blade [ability]', 'Growing Ferocity [feature]', 'Hit and Run [feature]', 'Hit and Run [ability]', 'Taking a Turn [rule]', 'Panther [statblock]']],
		['gob', ['Goblin Stinker [statblock]']],
		['GOB', ['Goblin Stinker [statblock]']],
		['gs', ['Goblin Stinker [statblock]', 'Gnoll Gnasher [statblock]']], // a subsequence, not a substring
		['hit', ['Hit and Run [feature]', 'Hit and Run [ability]']], // two entries sharing a name
		['pan', ['Panther [kit]', 'Panther [statblock]']], // two entries sharing a word, told apart by type
		['  pan  ', ['Panther [kit]', 'Panther [statblock]']],
		['turn', ['Taking a Turn [rule]']],
		['zzz', []],
		['type:kit', ['Panther [kit]', 'Mountain [kit]']],
		['type:kit pan', ['Panther [kit]']],
		['pan type:statblock', ['Panther [statblock]']],
		['type:statblock', ['Goblin Stinker [statblock]', 'Skitterling [statblock]', 'Gnoll Gnasher [statblock]', 'Panther [statblock]']],
		['type:ability', ['Coat the Blade [ability]', 'Hit and Run [ability]']], // exact: `feature` does not match an ability
		['type:feature', ['Growing Ferocity [feature]', 'Hit and Run [feature]']],
		['type:nothing', []],
		['source:mcdm.beastheart.v1', ['Hit and Run [feature]', 'Panther [statblock]']],
		['source:mcdm.monsters.v1', ['Goblin Stinker [statblock]', 'Skitterling [statblock]', 'Devil Malice [featureblock]']],
		['source:mcdm.heroes.v1 type:statblock', ['Gnoll Gnasher [statblock]']],
		['source:mcdm.monsters.v1 type:kit', []],
		['pan source:mcdm.beastheart.v1', ['Panther [statblock]']],
		['type:kit type:statblock', ['Goblin Stinker [statblock]', 'Skitterling [statblock]', 'Gnoll Gnasher [statblock]', 'Panther [statblock]']], // the last repeat wins
	];
	test.each(CASES)('"%s"', (query, results) => {
		expect(names(setup().modal().getSuggestions(query))).toEqual(results);
	});

	test('the snapshot command offers only the three snapshottable families, whatever is typed (SC-149)', () => {
		const modal = setup().modal({ filter: (e) => snapshotAliasForType(e.type) !== null });
		expect(names(modal.getSuggestions(''))).toEqual(['Goblin Stinker [statblock]', 'Skitterling [statblock]', 'Gnoll Gnasher [statblock]', 'Devil Malice [featureblock]', 'Coat the Blade [ability]', 'Growing Ferocity [feature]', 'Hit and Run [feature]', 'Hit and Run [ability]', 'Panther [statblock]']);
		for (const q of ['type:kit', 'type:condition', 'type:rule', 'type:kit source:mcdm.heroes.v1', 'turn']) expect(modal.getSuggestions(q)).toEqual([]);
	});

	test('with nothing indexed both commands show the one Sync row, whatever is typed, filter or not', () => {
		const empty = setup(true);
		for (const modal of [empty.modal(), empty.modal({ filter: () => false })]) {
			for (const q of ['', 'gob', 'type:kit']) expect(modal.getSuggestions(q).map((r) => r.name)).toEqual(['Sync compendium…']);
		}
	});
});

describe('what each family inserts: a reference block vs a snapshot', () => {
	// [code, reference fence, snapshot fence or null (not snapshottable: SC-149)]
	const FAMILIES: Array<[family: string, code: string, reference: string, snapshot: string | null]> = [
		['statblock', GOBLIN, 'ds-sb', 'ds-sb'],
		['feature (ability)', ABILITY, 'ds-feature', 'ds-feature'],
		['feature (trait)', TRAIT, 'ds-feature', 'ds-feature'],
		['featureblock', MALICE, 'ds-featureblock', 'ds-featureblock'],
		['kit', KIT, 'ds-scc', null],
		['condition', CONDITION, 'ds-scc', null],
		['rule', RULE, 'ds-scc', null],
	];
	test.each(FAMILIES)('%s', async (_family, code, reference, snapshot) => {
		const { index, entry } = setup();
		const ref = new CmEditor('');
		insertReferenceBlock(ref as never, entry(code));
		expect(ref.getValue()).toBe('```' + reference + '\n' + code + '\n```\n');

		const snap = new CmEditor('');
		const wrote = await insertFullBlock(snap as never, (await index.getEntity(code))!);
		if (snapshot === null) {
			expect(wrote).toBe(false);
			expect(snap.getValue()).toBe('');
			expect(Notice.notices[Notice.notices.length - 1]).toMatch(/^No snapshot for /);
			return;
		}
		expect(wrote).toBe(true);
		const text = snap.getValue();
		expect(text.startsWith('```' + snapshot + '\n')).toBe(true);
		expect(text.endsWith('\n```\n')).toBe(true);
		const body = text.slice(text.indexOf('\n') + 1, text.length - '\n```\n'.length);
		const dto = parseYaml(body) as Record<string, unknown>;
		expect(typeof dto.name).toBe('string');
		// the snapshot is a block of its own: no second fence inside it (SC-147), and no sync-transport top-level keys (SC-165)
		expect(body).not.toContain('```');
		expect(dto.scc).toBeUndefined();
	});

	test('a snapshot keeps no dead copy of the entry under metadata: (SC-165) - featureblock none, statblock only scc, feature only the render keys', async () => {
		const { index } = setup();
		const dtoOf = async (code: string) => {
			const editor = new CmEditor('');
			await insertFullBlock(editor as never, (await index.getEntity(code))!);
			return parseYaml(editor.getValue().split('\n').slice(1, -2).join('\n')) as { metadata?: Record<string, unknown> };
		};
		expect((await dtoOf(MALICE)).metadata).toBeUndefined();
		expect(Object.keys((await dtoOf(GOBLIN)).metadata ?? {})).toEqual(['scc']);
		const FEATURE_KEYS = ['ancestry', 'class', 'kit', 'subclass', 'feature_source', 'type', 'level', 'scc', 'subtype'];
		for (const code of [ABILITY, TRAIT]) {
			for (const key of Object.keys((await dtoOf(code)).metadata ?? {})) expect(FEATURE_KEYS).toContain(key);
		}
	});

	test('a reference is the bare code, never the entry\'s content', () => {
		const { entry } = setup();
		const editor = new CmEditor('');
		insertReferenceBlock(editor as never, entry(GOBLIN));
		expect(editor.getValue().split('\n')).toEqual(['```ds-sb', GOBLIN, '```', '']);
	});
});

describe('click modifiers on a result row (the reference command)', () => {
	// What `dispatchReferenceChoice` makes of the MouseEvent obsidian hands it. Obsidian\'s Enter takes no modifier, so these are click-only.
	const CASES: Array<[modifiers: string, evt: Partial<MouseEvent>, outcome: 'reference' | 'inline' | 'copy']> = [
		['none', {}, 'reference'],
		['shift', { shiftKey: true }, 'inline'],
		['ctrl', { ctrlKey: true }, 'copy'],
		['meta (cmd)', { metaKey: true }, 'copy'],
		['ctrl+shift', { ctrlKey: true, shiftKey: true }, 'inline'], // shift wins
		['meta+shift', { metaKey: true, shiftKey: true }, 'inline'],
		['alt', { altKey: true }, 'reference'],
	];
	test.each(CASES)('%s', async (_name, evt, outcome) => {
		const writeText = jest.fn().mockResolvedValue(undefined);
		(navigator as any).clipboard = { writeText };
		try {
			const { entry } = setup();
			const editor = new CmEditor('before\n');
			editor.setCursor({ line: 1, ch: 0 });
			dispatchReferenceChoice(editor as never, entry(KIT), evt as never);
			await Promise.resolve();
			const doc = editor.getValue();
			if (outcome === 'reference') expect(doc).toBe('before\n```ds-scc\n' + KIT + '\n```\n');
			if (outcome === 'inline') expect(doc).toBe(`before\n[Panther](scc.v1:${KIT})`);
			if (outcome === 'copy') expect(doc).toBe('before\n');
			expect(writeText.mock.calls.map((c) => c[0])).toEqual(outcome === 'copy' ? [`scc:${KIT}`] : []);
		} finally {
			delete (navigator as any).clipboard;
		}
	});

	test('through the registered commands: the reference command routes on the click, the snapshot command ignores it', async () => {
		const writeText = jest.fn().mockResolvedValue(undefined);
		(navigator as any).clipboard = { writeText };
		const opened: CompendiumSearchModal[] = [];
		const spy = jest.spyOn(CompendiumSearchModal.prototype, 'onOpen').mockImplementation(function (this: CompendiumSearchModal) {
			opened.push(this);
		});
		try {
			const { app, index, entry } = setup();
			const plugin = new Plugin(app as any) as any;
			plugin.syncCompendium = jest.fn();
			registerCompendiumInsertCommands(plugin, index, {} as never);
			const choose = async (command: string, evt: Partial<MouseEvent>, code: string): Promise<string> => {
				const editor = new CmEditor('');
				plugin.commands.find((c: { id: string }) => c.id === command).editorCallback(editor);
				opened[opened.length - 1].onChooseSuggestion(entry(code), evt as never);
				await flushAsync(6);
				return editor.getValue();
			};
			expect(await choose('insert-compendium-reference', {}, GOBLIN)).toBe('```ds-sb\n' + GOBLIN + '\n```\n');
			expect(await choose('insert-compendium-reference', { shiftKey: true }, GOBLIN)).toBe(`[Goblin Stinker](scc.v1:${GOBLIN})`);
			expect(await choose('insert-compendium-reference', { ctrlKey: true }, GOBLIN)).toBe('');
			expect(writeText).toHaveBeenCalledTimes(1);
			for (const evt of [{}, { ctrlKey: true }, { shiftKey: true }, { metaKey: true }]) {
				const text = await choose('insert-compendium-block', evt, GOBLIN);
				expect(text.startsWith('```ds-sb\n')).toBe(true);
				expect(text).toContain('name: Goblin Stinker');
			}
			expect(writeText).toHaveBeenCalledTimes(1); // the snapshot command never copies
		} finally {
			spy.mockRestore();
			delete (navigator as any).clipboard;
		}
	});
});

describe('where a choice lands in the note', () => {
	const BLOCK = (code: string) => '```ds-scc\n' + code + '\n```\n';
	test('at the start of an empty note, and at the start of the first line of a note', () => {
		const { entry } = setup();
		const a = new CmEditor('');
		insertReferenceBlock(a as never, entry(KIT));
		expect(a.getValue()).toBe(BLOCK(KIT));
		const b = new CmEditor('first\nsecond');
		insertReferenceBlock(b as never, entry(KIT));
		expect(b.getValue()).toBe(BLOCK(KIT) + 'first\nsecond');
		expect(b.getCursor()).toEqual({ line: 3, ch: 0 }); // after the inserted block: replaceSelection leaves the cursor at the end of the text
	});

	test('on an empty last line, and at the start of a last line with no trailing newline', () => {
		const { entry } = setup();
		const empty = new CmEditor('above\n', { line: 1, ch: 0 });
		insertReferenceBlock(empty as never, entry(KIT));
		expect(empty.getValue()).toBe('above\n' + BLOCK(KIT));
		const bare = new CmEditor('above\nlast', { line: 1, ch: 0 });
		insertReferenceBlock(bare as never, entry(KIT));
		expect(bare.getValue()).toBe('above\n' + BLOCK(KIT) + 'last');
	});

	test('a selection is replaced and nothing else; text above and below survives byte for byte', () => {
		const { entry } = setup();
		const editor = new CmEditor('above\nSELECTED\nbelow\n', { line: 1, ch: 0 }, { line: 1, ch: 8 });
		insertReferenceBlock(editor as never, entry(KIT));
		expect(editor.getValue()).toBe('above\n' + BLOCK(KIT) + '\nbelow\n');
		expect(editor.writes).toHaveLength(1);
	});

	test('an inline link goes where the cursor is, mid-line, without touching either side', () => {
		const { entry } = setup();
		const editor = new CmEditor('see  here', { line: 0, ch: 4 });
		insertInlineLink(editor as never, entry(KIT));
		expect(editor.getValue()).toBe(`see [Panther](scc.v1:${KIT}) here`);
	});

	test('a snapshot of a CRLF note keeps the text above as lines (CodeMirror holds LF) and writes one block', async () => {
		const { index } = setup();
		const editor = new CmEditor('above\r\nbelow\r\n', { line: 1, ch: 0 });
		await dispatchBlockChoice(editor as never, index, setup().entry(GOBLIN));
		expect(editor.getValue().startsWith('above\n```ds-sb\n')).toBe(true);
		expect(editor.getValue().endsWith('\n```\nbelow\n')).toBe(true);
		expect(editor.writes).toHaveLength(1);
	});

	test('a snapshot does not land when the editor was closed while the choice resolved (SC-601)', async () => {
		const { index, entry } = setup();
		const editor = new CmEditor('x');
		await dispatchBlockChoice(editor as never, index, entry(GOBLIN), () => false);
		expect(editor.getValue()).toBe('x');
		expect(editor.writes).toHaveLength(0);
	});

	// Fixed by SC-675 (SC-462 folded in): the block's lines carry the cursor line's callout marker, the line after it too.
	test('inside a callout every inserted line keeps the "> " prefix', () => {
		const { entry } = setup();
		const editor = new CmEditor('> [!note]\n> ', { line: 1, ch: 2 });
		insertReferenceBlock(editor as never, entry(KIT));
		expect(editor.getValue()).toBe('> [!note]\n> ```ds-scc\n> ' + KIT + '\n> ```\n> ');
		expect(editor.getCursor()).toEqual({ line: 4, ch: 2 }); // on the callout line the block ends with
		expect(editor.writes).toHaveLength(1);
	});
});
