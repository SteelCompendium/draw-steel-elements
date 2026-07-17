// D6 Task 10 (spec §4) — CompendiumSearchModal (fuzzy search + type:/source: filters +
// empty-index sync CTA) and the compendiumInsert.ts action functions/commands.
import * as fs from 'fs';
import * as path from 'path';
// Editor/Plugin/App are imported from the mock directly (not the bare 'obsidian'
// specifier): the real obsidian.d.ts declares them abstract/constructor-less, so `new`
// only type-checks against the concrete jest-free mock — established pattern (see
// test/dom/authoring/insert.test.ts).
import { App, Editor, Plugin } from '../../mocks/obsidian';
import { createCompendiumIndex } from '@/services/CompendiumIndex';
import type { CompendiumIndex, CompendiumEntry } from '@/services/CompendiumIndex';
import { SccResolver } from '@/refs/SccResolver';
import { DEFAULT_SETTINGS } from '@model/Settings';
// `loadMdDseFixture` (not test/fakes/fakeObsidian.ts's `loadFixtureIntoVault`): this test
// runs under the `dom` (jsdom) jest project, and that fake's `FakeVault.setText` calls the
// global `TextEncoder`, which isn't polyfilled there (it's only ever been exercised from
// the `unit` project's node environment before now). `_refHarness.ts`'s `FakeVault.setFile`
// is a plain-string store, already proven under test/dom/**.
import { loadMdDseFixture } from '../elements/_refHarness';
import { CompendiumSearchModal, isSyncCtaEntry, parseCompendiumQuery } from '@/authoring/CompendiumSearchModal';
import {
	insertReferenceBlock,
	insertInlineLink,
	insertFullBlock,
	copyCode,
	dispatchReferenceChoice,
	dispatchBlockChoice,
	registerCompendiumInsertCommands,
} from '@/authoring/compendiumInsert';
import { typeToAlias } from '@/services/typeAdapters';
import type { CompendiumSyncService } from '@/data/CompendiumSyncService';

const KIT = 'mcdm.heroes.v1/kit/panther';
const COND = 'mcdm.heroes.v1/condition/bleeding';
const GOBLIN = 'mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker';

function setup(empty = false): { index: CompendiumIndex; app: App } {
	const app = new App();
	if (!empty) {
		loadMdDseFixture(app.vault, 'kit/panther.md');
		loadMdDseFixture(app.vault, 'condition/bleeding.md');
		loadMdDseFixture(app.vault, 'monster/goblin/statblock/goblin-stinker.md');
	}
	const resolver = new SccResolver(app as any, DEFAULT_SETTINGS);
	return { app, index: createCompendiumIndex(app as any, resolver) };
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('parseCompendiumQuery', () => {
	test('a bare query has no filters', () => {
		expect(parseCompendiumQuery('panth')).toEqual({ text: 'panth', filters: {} });
	});
	test('type: prefix is extracted, remaining text is empty', () => {
		expect(parseCompendiumQuery('type:condition ')).toEqual({ text: '', filters: { type: 'condition' } });
	});
	test('source: prefix is extracted, remaining text is empty', () => {
		expect(parseCompendiumQuery('source:mcdm.monsters.v1 ')).toEqual({
			text: '',
			filters: { source: 'mcdm.monsters.v1' },
		});
	});
	test('a type: prefix combined with free text keeps both', () => {
		expect(parseCompendiumQuery('type:kit panth')).toEqual({ text: 'panth', filters: { type: 'kit' } });
	});
	test('both type: and source: in the same query parse together', () => {
		expect(parseCompendiumQuery('type:kit source:mcdm.heroes.v1 panth')).toEqual({
			text: 'panth',
			filters: { type: 'kit', source: 'mcdm.heroes.v1' },
		});
	});
	test('a colon adjacent to non-keyword text falls through to plain fuzzy text', () => {
		expect(parseCompendiumQuery('Anti-type:hero')).toEqual({
			text: 'Anti-type:hero',
			filters: {},
		});
		expect(parseCompendiumQuery('Open source: License')).toEqual({
			text: 'Open source: License',
			filters: {},
		});
	});
});

describe('CompendiumSearchModal (spec §4.2)', () => {
	test('getSuggestions("panth") fuzzy-matches item_name and returns the kit entry', () => {
		const { app, index } = setup();
		const modal = new CompendiumSearchModal(app as any, index, jest.fn());
		const results = modal.getSuggestions('panth');
		expect(results.map((r) => r.scc)).toContain(KIT);
	});

	test('getSuggestions("type:condition ") filters to conditions', () => {
		const { app, index } = setup();
		const modal = new CompendiumSearchModal(app as any, index, jest.fn());
		const results = modal.getSuggestions('type:condition ');
		expect(results.map((r) => r.scc)).toEqual([COND]);
	});

	test('getSuggestions("source:mcdm.monsters.v1 ") filters by book', () => {
		const { app, index } = setup();
		const modal = new CompendiumSearchModal(app as any, index, jest.fn());
		const results = modal.getSuggestions('source:mcdm.monsters.v1 ');
		expect(results.map((r) => r.scc)).toEqual([GOBLIN]);
	});

	test('an empty index yields the single synthetic "Sync compendium" affordance', () => {
		const { app, index } = setup(true);
		const modal = new CompendiumSearchModal(app as any, index, jest.fn());
		const results = modal.getSuggestions('');
		expect(results).toHaveLength(1);
		expect(isSyncCtaEntry(results[0])).toBe(true);
	});

	test('choosing the sync CTA calls onSyncRequested, never the ctor onChoose', () => {
		const { app, index } = setup(true);
		const onChoose = jest.fn();
		const onSyncRequested = jest.fn();
		const modal = new CompendiumSearchModal(app as any, index, onChoose, { onSyncRequested });
		const [cta] = modal.getSuggestions('');
		modal.onChooseSuggestion(cta, {} as MouseEvent);
		expect(onSyncRequested).toHaveBeenCalledTimes(1);
		expect(onChoose).not.toHaveBeenCalled();
	});

	test('choosing a real entry calls onChoose with the entry and event', () => {
		const { app, index } = setup();
		const onChoose = jest.fn();
		const modal = new CompendiumSearchModal(app as any, index, onChoose);
		const [entry] = modal.getSuggestions('panth');
		const evt = {} as MouseEvent;
		modal.onChooseSuggestion(entry, evt);
		expect(onChoose).toHaveBeenCalledWith(entry, evt);
	});

	test('selectSuggestion (real click/Enter path) dispatches through onChooseSuggestion then closes', () => {
		const { app, index } = setup();
		const onChoose = jest.fn();
		const modal = new CompendiumSearchModal(app as any, index, onChoose);
		modal.open();
		const [entry] = modal.getSuggestions('panth');
		modal.selectSuggestion(entry, {} as MouseEvent);
		expect(onChoose).toHaveBeenCalledWith(entry, expect.anything());
		expect(document.body.contains((modal as any).containerEl)).toBe(false);
	});

	test('renderSuggestion shows name, type chip, source, and the bare code in a <code> element', () => {
		const { app, index } = setup();
		const modal = new CompendiumSearchModal(app as any, index, jest.fn());
		const [entry] = modal.getSuggestions('panth');
		const el = document.createElement('div');
		modal.renderSuggestion(entry, el);
		expect(el.textContent).toContain('Panther');
		expect(el.textContent).toContain('kit');
		expect(el.textContent).toContain('mcdm.heroes.v1');
		expect(el.querySelector('code')?.textContent).toBe(KIT);
	});

	test('renderSuggestion of the sync CTA shows the sync prompt, not a code chip', () => {
		const { app, index } = setup(true);
		const modal = new CompendiumSearchModal(app as any, index, jest.fn());
		const [cta] = modal.getSuggestions('');
		const el = document.createElement('div');
		modal.renderSuggestion(cta, el);
		expect(el.textContent).toContain('Sync compendium');
		expect(el.querySelector('code')).toBeNull();
	});
});

describe('typeToAlias (spec §4.3)', () => {
	test('a fully-qualified statblock type maps to ds-statblock', () => {
		expect(typeToAlias('monster.goblin.statblock')).toBe('ds-statblock');
	});
	test('a bare kit type maps to ds-kit', () => {
		expect(typeToAlias('kit')).toBe('ds-kit');
	});
	test('a bare condition type maps to ds-condition', () => {
		expect(typeToAlias('condition')).toBe('ds-condition');
	});
	test('a namespaced feature type maps to ds-feature', () => {
		expect(typeToAlias('feature.fury.level-1')).toBe('ds-feature');
	});
	test('an unrecognized type falls back to the generic ds-rule card', () => {
		expect(typeToAlias('nonsense.unknown-type')).toBe('ds-rule');
	});
});

describe('compendiumInsert action functions (spec §4.3)', () => {
	const kitEntry: CompendiumEntry = {
		scc: KIT,
		type: 'kit',
		name: 'Panther',
		source: 'mcdm.heroes.v1',
		file: {} as any,
	};

	test('insertReferenceBlock writes a fenced ds-<alias> block whose body is the bare code', () => {
		const editor = new Editor('');
		insertReferenceBlock(editor as any, kitEntry);
		expect(editor.writes).toHaveLength(1);
		expect(editor.writes[0].text).toBe(`\`\`\`ds-kit\n${KIT}\n\`\`\`\n`);
		expect(editor.writes[0].from).toEqual(editor.writes[0].to); // pure insert
	});

	test('insertInlineLink writes a scc.v1 markdown link', () => {
		const editor = new Editor('');
		insertInlineLink(editor as any, kitEntry);
		expect(editor.writes).toHaveLength(1);
		expect(editor.writes[0].text).toBe(`[Panther](scc.v1:${KIT})`);
	});

	test('insertFullBlock serializes the resolved entity model DTO as YAML inside a ds-<alias> block', async () => {
		const { index } = setup();
		const entity = await index.getEntity(KIT);
		const editor = new Editor('');
		await insertFullBlock(editor as any, entity!);
		expect(editor.writes).toHaveLength(1);
		const text = editor.writes[0].text;
		expect(text.startsWith('```ds-kit\n')).toBe(true);
		expect(text.trim().endsWith('```')).toBe(true);
		expect(text).toContain('name: Panther');
		expect(text).toContain('stamina_bonus:');
	});

	test('insertFullBlock falls back to the raw source body for the model-less rule family', async () => {
		const app = new App();
		loadMdDseFixture(app.vault, 'rule/combat/turn.md');
		const resolver = new SccResolver(app as any, DEFAULT_SETTINGS);
		const index = createCompendiumIndex(app as any, resolver);
		const entity = await index.getEntity('mcdm.heroes.v1/rule.combat/turn');
		const editor = new Editor('');
		await insertFullBlock(editor as any, entity!);
		expect(editor.writes[0].text.startsWith('```ds-rule\n')).toBe(true);
	});

	test('copyCode writes scc:<code> to the clipboard when available', async () => {
		const writeText = jest.fn().mockResolvedValue(undefined);
		(navigator as any).clipboard = { writeText };
		await copyCode(kitEntry);
		expect(writeText).toHaveBeenCalledWith(`scc:${KIT}`);
		delete (navigator as any).clipboard;
	});

	test('copyCode always shows a Notice with the copied text on success', async () => {
		const { Notice: NoticeMock } = await import('../../mocks/obsidian');
		NoticeMock.notices.length = 0;
		const writeText = jest.fn().mockResolvedValue(undefined);
		(navigator as any).clipboard = { writeText };
		await copyCode(kitEntry);
		expect(NoticeMock.notices).toContain(`Copied scc:${KIT}`);
		delete (navigator as any).clipboard;
	});

	test('copyCode shows a Notice even when clipboard is unavailable (older mobile webviews)', async () => {
		const { Notice: NoticeMock } = await import('../../mocks/obsidian');
		NoticeMock.notices.length = 0;
		delete (navigator as any).clipboard;
		await copyCode(kitEntry);
		expect(NoticeMock.notices).toContain(`Copied scc:${KIT}`);
	});
});

describe('dispatchReferenceChoice modifier-key dispatch (spec §4.3)', () => {
	const kitEntry: CompendiumEntry = {
		scc: KIT,
		type: 'kit',
		name: 'Panther',
		source: 'mcdm.heroes.v1',
		file: {} as any,
	};

	test('no modifiers -> reference block (the default, OD-D6-6)', () => {
		const editor = new Editor('');
		dispatchReferenceChoice(editor as any, kitEntry, {});
		expect(editor.writes[0].text).toBe(`\`\`\`ds-kit\n${KIT}\n\`\`\`\n`);
	});

	test('shift -> inline link', () => {
		const editor = new Editor('');
		dispatchReferenceChoice(editor as any, kitEntry, { shiftKey: true });
		expect(editor.writes[0].text).toBe(`[Panther](scc.v1:${KIT})`);
	});

	test('ctrl/cmd -> copy code, editor untouched', () => {
		const writeText = jest.fn().mockResolvedValue(undefined);
		(navigator as any).clipboard = { writeText };
		const editor = new Editor('');
		dispatchReferenceChoice(editor as any, kitEntry, { ctrlKey: true });
		expect(editor.writes).toHaveLength(0);
		expect(writeText).toHaveBeenCalledWith(`scc:${KIT}`);
		delete (navigator as any).clipboard;
	});
});

describe('dispatchBlockChoice (spec §4.3, full-block command)', () => {
	test('resolves the entry to a CompendiumEntity and inserts the full-block snapshot', async () => {
		const { index } = setup();
		const editor = new Editor('');
		const [entry] = index.query('panth');
		await dispatchBlockChoice(editor as any, index, entry);
		expect(editor.writes).toHaveLength(1);
		expect(editor.writes[0].text.startsWith('```ds-kit\n')).toBe(true);
	});

	test('a code that no longer resolves is a silent no-op', async () => {
		const { index } = setup();
		const editor = new Editor('');
		const ghost: CompendiumEntry = {
			scc: 'mcdm.heroes.v1/kit/does-not-exist',
			type: 'kit',
			name: 'Ghost',
			source: 'mcdm.heroes.v1',
			file: {} as any,
		};
		await dispatchBlockChoice(editor as any, index, ghost);
		expect(editor.writes).toHaveLength(0);
	});
});

describe('registerCompendiumInsertCommands (spec §4.1)', () => {
	function makeHost() {
		const { app, index } = setup();
		const plugin = new Plugin(app as any) as any;
		plugin.syncCompendium = jest.fn().mockResolvedValue(undefined);
		return { plugin, index };
	}

	test('registers exactly insert-compendium-reference and insert-compendium-block', () => {
		const { plugin, index } = makeHost();
		registerCompendiumInsertCommands(plugin, index, {} as CompendiumSyncService);
		const ids = plugin.commands.map((c: any) => c.id);
		expect(ids).toEqual(['insert-compendium-reference', 'insert-compendium-block']);
		expect(plugin.commands.every((c: any) => typeof c.editorCallback === 'function')).toBe(true);
	});

	test('each command opens the search modal on invocation (real containerEl in the DOM)', () => {
		const { plugin, index } = makeHost();
		registerCompendiumInsertCommands(plugin, index, {} as CompendiumSyncService);
		const editor = new Editor('');
		for (const id of ['insert-compendium-reference', 'insert-compendium-block']) {
			document.body.innerHTML = '';
			const cmd = plugin.commands.find((c: any) => c.id === id);
			cmd.editorCallback(editor);
			expect(document.querySelector('.modal-container')).not.toBeNull();
		}
	});

	test('source hygiene: both commands wire opts.onSyncRequested to plugin.syncCompendium()', () => {
		// CompendiumSearchModal's own suite proves "choosing the sync CTA invokes
		// opts.onSyncRequested"; this proves the OTHER half of that wiring —
		// registerCompendiumInsertCommands actually threads plugin.syncCompendium() in as
		// that callback for both commands — without the fragility of spying on an ES class
		// constructor (jest can't reliably intercept `new` on a real class mid-suite
		// without module-mocking the whole file, which would break the modal's own
		// behavioral tests above).
		const src = fs.readFileSync(
			path.join(__dirname, '../../../src/authoring/compendiumInsert.ts'),
			'utf8',
		);
		expect(src).toMatch(/const onSyncRequested = \(\) => plugin\.syncCompendium\(\);/);
		expect(src.match(/\bonSyncRequested\b/g)?.length).toBeGreaterThanOrEqual(3);
	});
});
