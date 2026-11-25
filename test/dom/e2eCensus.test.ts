// SC-408 coverage check (a): the jsdom census for the e2e pilot surfaces. No Obsidian needed, runs
// in CI with the rest of jest. It mounts each pilot surface through its real pipeline / modal and
// fails when
//   - an interactive node (button, input, select, textarea, [role=button|slider], [tabindex],
//     [contenteditable]) has no `data-dse-control`, or
//   - any `data-dse-control` id is not declared in the surface's e2e manifest
//     (e2e/manifest/*.ts, the same files the e2e exercised-set gate reads).
// Framework chrome (the collapse / authoring toolbar, `[data-dse-chrome-item]`) is a separate
// surface and is excluded, except for the initiative tracker (SC-437), whose scope is the whole tracker root
// (rows, grid and its own chrome-panel items, no CSS-class lookup).
// A new control added to a pilot surface without an id and a manifest row fails HERE first.
import { ElementPipeline } from '../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../src/framework/host/BlockHost';
import { createThemeService } from '../../src/framework/seams/theme';
import { createPreferenceStore } from '../../src/framework/seams/prefs';
import { createRollService } from '../../src/framework/roll/service';
import type { PrefsStorage } from '../../src/framework/seams/prefs';
import { createReferenceService } from '../../src/framework/seams/refs';
import { createValidationService } from '../../src/framework/validation';
import { createSessionStore } from '../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import * as fs from 'fs';
import * as path from 'path';
import { App, Notice, Plugin, flushAsync } from '../mocks/obsidian';
import { setExperimental } from '../../src/framework/experimental';
import { DseSettingTab } from '../../src/views/SettingsTab';
import { staminaBarElement } from '../../src/elements/stamina-bar/definition';
import { initiativeElement } from '../../src/elements/initiative/definition';
import { montageElement } from '../../src/elements/montage/definition';
import { undoNotice } from '../../src/framework/kit';
import { DSE_PREF_DESCRIPTORS } from '../../src/prefs/catalog';
import DrawSteelAdmonitionPlugin, { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';
import staminaBarManifest from '../../e2e/manifest/stamina-bar';
import modalManifest from '../../e2e/manifest/stamina-edit-modal';
import conditionsManifest from '../../e2e/manifest/conditions-modal';
import poolManifest from '../../e2e/manifest/minion-pool-modal';
import initiativeManifest from '../../e2e/manifest/initiative';
import { ResetEncounterModal } from '../../src/views/ResetEncounterModal';
import { MinionStaminaPoolModal } from '../../src/views/MinionStaminaPoolModal';
import { ConditionsModal } from '../../src/views/ConditionsModal';
import { ConditionManager } from '../../src/utils/Conditions';
import { parseEncounterData } from '../../src/drawSteelAdmonition/EncounterData';
import squadYaml from '../fixtures/initiative/squad.yaml';
import exampleYaml from '../../src/elements/montage/example.yaml';
import midYaml from '../../src/elements/montage/fixture-mid.yaml';
import doneYaml from '../../src/elements/montage/fixture-done.yaml';
import failedYaml from '../../src/elements/montage/fixture-failed.yaml';
import oldShapeYaml from '../../src/elements/montage/fixture-old-shape.yaml';
import chromeManifest from '../../e2e/manifest/chrome';
import resetManifest from '../../e2e/manifest/reset-encounter-modal';
import montageManifest from '../../e2e/manifest/montage';
import montageLogManifest from '../../e2e/manifest/montage-log-modal';
import montageAddHeroManifest from '../../e2e/manifest/montage-add-hero-modal';
import montageRemoveHeroManifest from '../../e2e/manifest/montage-remove-hero-modal';
import montageLimitsManifest from '../../e2e/manifest/montage-limits-modal';
import { idsOf } from '../../e2e/manifest/surface';
import { Menu } from '../mocks/obsidian';
import { negotiationElement } from '../../src/elements/negotiation/definition';
import negotiationManifest from '../../e2e/manifest/negotiation';
import settingsManifest from '../../e2e/manifest/settings-tab';
import commandsManifest from '../../e2e/manifest/authoring-commands';
import dsSuggestManifest, { VIRTUAL_IDS as DS_VIRTUAL } from '../../e2e/manifest/authoring-ds-suggest';
import schemaSuggestManifest, { VIRTUAL_IDS as SCHEMA_VIRTUAL } from '../../e2e/manifest/authoring-schema-suggest';
import searchManifest from '../../e2e/manifest/authoring-search';
import { DsElementSuggest } from '../../src/authoring/suggest';
import { DsSchemaSuggest } from '../../src/authoring/schemaSuggest';
import { registerInsertCommands } from '../../src/authoring/insert';
import { registerCompendiumInsertCommands } from '../../src/authoring/compendiumInsert';
import { CompendiumSearchModal } from '../../src/authoring/CompendiumSearchModal';
import { createElementRegistry } from '../../src/framework/registry';
import { registerFrameworkElementDefinitions } from 'main';
import { Editor } from '../mocks/obsidian';
import { loadMdDseFixture, makeCompendiumDeps } from './elements/_refHarness';
import { counterElement } from '../../src/elements/counter/definition';
import counterManifest from '../../e2e/manifest/counter';
import legacyWindowManifest, { VIRTUAL_IDS as LEGACY_VIRTUAL, HOST_IDS as LEGACY_HOST } from '../../e2e/manifest/sync-legacy-window';
import migrationWindowManifest, { VIRTUAL_IDS as MIGRATION_VIRTUAL, HOST_IDS as MIGRATION_HOST } from '../../e2e/manifest/sync-migration-window';
import syncCommandsManifest, { SYNC_COMMANDS } from '../../e2e/manifest/sync-commands';
import { LegacyCompendiumModal } from '../../src/views/LegacyCompendiumModal';
import { CompendiumMigrationModal } from '../../src/views/CompendiumMigrationModal';
import type { MigrationPlan, MigrationReport } from '../../src/data/CompendiumMigration';

const INTERACTIVE = 'button, input, select, textarea, [role="button"], [role="slider"], [tabindex], [contenteditable]';
const CHROME = '[data-dse-chrome-item]';

/** Problems found under `scope`: un-id'd interactive nodes and ids the manifest does not declare. */
function censusProblems(scope: Element, allowed: ReadonlySet<string>, interactive = INTERACTIVE, skipChrome = true): string[] {
	const problems: string[] = [];
	const describe = (el: Element): string => `<${el.tagName.toLowerCase()} class="${el.className}"> ${(el.textContent ?? '').trim().slice(0, 30)}`;
	scope.querySelectorAll(interactive).forEach((el) => {
		if (skipChrome && el.closest(CHROME)) return;
		if (!el.hasAttribute('data-dse-control')) problems.push(`no data-dse-control: ${describe(el)}`);
	});
	scope.querySelectorAll('[data-dse-control]').forEach((el) => {
		const id = el.getAttribute('data-dse-control') as string;
		if (!allowed.has(id)) problems.push(`id "${id}" is not in the manifest: ${describe(el)}`);
	});
	return problems;
}

// SC-505: the framework chrome buttons carry `chrome.*` ids (the interactive-node check still skips them, but an id that is
// stamped must be declared); every surface that mounts the standard panel may therefore see them.
const chromeIds = idsOf(chromeManifest);
const barIds = new Set([...idsOf(staminaBarManifest), ...chromeIds]);
const modalIds = new Set(idsOf(modalManifest));
const poolIds = new Set(idsOf(poolManifest));
const conditionIds = new Set(idsOf(conditionsManifest));

function makeHost(language: string, sourcePath: string) {
	const replaceSource = jest.fn(async (_s: string) => true);
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath,
		containerEl: document.createElement('div'),
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language, lineStart: 0, lineEnd: 30 }),
		replaceSource,
		blockKey: () => `${sourcePath}::${language}::0`,
	};
	return host as unknown as BlockHost & { containerEl: HTMLElement };
}

function makeDeps(): ElementPipelineDeps {
	const app = new App();
	app.vault.setFile('Media/token_1.png', '');
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	prefs.describe(DSE_PREF_DESCRIPTORS);
	const theme = createThemeService(prefs, plugin as any);
	const validation = createValidationService();
	for (const { id, schema } of FRAMEWORK_V2_DEPENDENCY_SCHEMAS) validation.addDependencySchema(id, schema);
	return {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme,
		prefs,
		refs: createReferenceService(app as any, DEFAULT_SETTINGS),
		validation,
		session: createSessionStore(),
		roll: createRollService(prefs),
	};
}

const RECOVERIES = ['max_stamina: 30', 'current_stamina: 12', 'temp_stamina: 0', 'recoveries: 3', 'recoveries_max: 6'].join('\n');
const LEGACY = ['max_stamina: 20', 'current_stamina: 15', 'temp_stamina: 5'].join('\n');
const TRACKER = [
	'heroes:',
	'  - name: "Alice Alpha"',
	'    max_stamina: 30',
	'enemy_groups:',
	'  - name: "Ogres"',
	'    creatures:',
	'      - name: "Ogre"',
	'        max_stamina: 60',
	'        amount: 3',
	'malice:',
	'  value: 3',
].join('\n');

async function mountBar(yaml: string, popover = false) {
	const deps = makeDeps();
	if (popover) await deps.prefs.set('staminaRecoveryPopover', true);
	const host = makeHost('ds-stamina-bar', 'Note.md');
	await new ElementPipeline(deps).run(staminaBarElement, yaml, host);
	return host.containerEl.firstElementChild as HTMLElement;
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('SC-408 census: the helper itself bites', () => {
	test('an interactive node without an id, and an id outside the manifest, are both reported', () => {
		const scope = document.createElement('div');
		scope.innerHTML = '<button>Rogue</button><button data-dse-control="sedit.damage">ok</button><div tabindex="0" data-dse-control="nope.nope"></div>';
		const problems = censusProblems(scope, modalIds);
		expect(problems).toHaveLength(2);
		expect(problems.join('\n')).toMatch(/no data-dse-control: <button/);
		expect(problems.join('\n')).toMatch(/id "nope.nope" is not in the manifest/);
	});
});

describe('SC-408 census: ds-stamina-bar', () => {
	test('a legacy bar: the bar itself is the only control', async () => {
		const root = await mountBar(LEGACY);
		expect(censusProblems(root, barIds)).toEqual([]);
		expect(root.querySelector('[data-dse-control="stamina.bar"]')).not.toBeNull();
	});

	test('a bar with Recoveries: markers, Catch Breath and the bar are all identified', async () => {
		const root = await mountBar(RECOVERIES);
		expect(censusProblems(root, barIds)).toEqual([]);
		for (const id of ['stamina.bar', 'recov.markers', 'recov.marker', 'recov.catch-breath']) {
			expect(root.querySelector(`[data-dse-control="${id}"]`)).not.toBeNull();
		}
	});

	test('the popover editor (preference on): its three buttons are identified', async () => {
		const root = await mountBar(RECOVERIES, true);
		root.querySelector<HTMLElement>('.dse-stamina-rec__pip')!.click(); // opens the popover
		expect(root.querySelector('.dse-stamina-rec__pop')).not.toBeNull();
		expect(censusProblems(root, barIds)).toEqual([]);
		for (const id of ['recov.pop.dec', 'recov.pop.inc', 'recov.pop.catch-breath']) {
			expect(root.querySelector(`[data-dse-control="${id}"]`)).not.toBeNull();
		}
	});

	test('the undo toast action is identified', () => {
		const { undoEl } = undoNotice('Caught breath', () => undefined);
		const toast = (Notice.last as Notice).noticeEl as HTMLElement;
		expect(censusProblems(toast, barIds)).toEqual([]);
		expect(undoEl.getAttribute('data-dse-control')).toBe('undo.action');
	});
});

describe('SC-408 census: the StaminaEditModal', () => {
	const openModal = async (yaml: string): Promise<HTMLElement> => {
		const root = await mountBar(yaml);
		root.querySelector<HTMLElement>('.dse-stamina--clickable')!.click();
		return document.body.lastElementChild as HTMLElement;
	};

	test('with Recoveries tracked: every control (steppers, quick actions, footer) is identified', async () => {
		const modalEl = await openModal(RECOVERIES);
		expect(censusProblems(modalEl, modalIds)).toEqual([]);
		for (const id of [
			'sedit.apply-amount', 'sedit.damage', 'sedit.healing',
			'sedit.stamina.dec', 'sedit.stamina.input', 'sedit.stamina.inc',
			'sedit.temp.dec', 'sedit.temp.input', 'sedit.temp.inc',
			'sedit.kill', 'sedit.full-heal', 'sedit.spend-recovery', 'sedit.reset', 'sedit.apply',
		]) {
			expect(modalEl.querySelector(`[data-dse-control="${id}"]`)).not.toBeNull();
		}
	});

	test('on a bar that does not track Recoveries the same controls are identified', async () => {
		expect(censusProblems(await openModal(LEGACY), modalIds)).toEqual([]);
	});

	test('SC-432: the free-heal confirmation (first press of the relabelled button, no pool) has both its buttons identified', async () => {
		const modalEl = await openModal(LEGACY);
		modalEl.querySelector<HTMLButtonElement>('[data-dse-control="sedit.spend-recovery"]')!.click();
		const dialogEl = document.body.lastElementChild as HTMLElement;
		expect(dialogEl).not.toBe(modalEl);
		expect(censusProblems(dialogEl, modalIds)).toEqual([]);
		for (const id of ['sedit.free-heal.cancel', 'sedit.free-heal.confirm']) {
			expect(dialogEl.querySelector(`[data-dse-control="${id}"]`)).not.toBeNull();
		}
	});
});

describe('SC-437 census: the initiative tracker, scoped by container', () => {
	/** Mount `source` through the real pipeline; `canPersist` false is the read-only (canvas) host. */
	async function mountTracker(source: string, canPersist = true): Promise<HTMLElement> {
		const host = makeHost('ds-initiative', 'Encounter.md');
		(host as any).canPersist = canPersist;
		await new ElementPipeline(makeDeps()).run(initiativeElement, source, host);
		return host.containerEl.firstElementChild as HTMLElement;
	}

	// SC-437 (R1 L-4): the scope is the tracker's root (every row, the grid, the chrome panel inside it), not a CSS class
	// per entry point, so a new control anywhere in the tracker needs an id from the initiative manifest or one of the
	// other surfaces' reach rows (stamina, pool, conditions).
	const reachFromInitiative = (...ms: Array<{ reach: readonly { host: string; control: string }[] }>): string[] =>
		ms.flatMap((m) => m.reach.filter((r) => r.host === 'initiative').map((r) => r.control));
	const trackerIds = new Set([
		...idsOf(initiativeManifest),
		...idsOf(resetManifest),
		...reachFromInitiative(modalManifest, conditionsManifest, poolManifest),
		...chromeIds,
	]);
	const census = (root: Element): string[] => censusProblems(root, trackerIds, INTERACTIVE, false);

	const initFixture = (name: string): string => {
		const text = fs.readFileSync(path.join(__dirname, '../../e2e/vaults/shipped/Initiative', `${name}.md`), 'utf8');
		return /```ds-initiative\n([\s\S]*?)\n```/.exec(text)![1];
	};
	const idsIn = (root: Element): Set<string> =>
		new Set(Array.from(root.querySelectorAll('[data-dse-control]')).map((el) => el.getAttribute('data-dse-control') as string));

	test('the census itself bites: an un-id\'d button injected into a row, the grid or the root is a finding, as is an id outside the manifest', async () => {
		const root = await mountTracker(TRACKER);
		expect(census(root)).toEqual([]);
		for (const host of ['.dse-init__row', '.dse-init__grid', '.dse-init__detail']) {
			const rogue = document.createElement('button');
			rogue.textContent = 'Rogue';
			root.querySelector(host)!.appendChild(rogue);
			expect(census(root)).toEqual([expect.stringMatching(/^no data-dse-control: <button/)]);
			rogue.remove();
		}
		const div = document.createElement('div');
		div.setAttribute('tabindex', '0');
		root.querySelector('.dse-init__group--enemies')!.appendChild(div);
		expect(census(root)).toHaveLength(1);
		div.remove();
		const stray = root.querySelector('.dse-init__cell')!;
		stray.setAttribute('data-dse-control', 'init.not-a-control');
		expect(census(root)).toEqual([expect.stringMatching(/id "init\.not-a-control" is not in the manifest/)]);
	});

	test('the chrome panel is inside the scope: its items and the framework chrome buttons are identified too', async () => {
		const root = await mountTracker(TRACKER);
		const items = Array.from(root.querySelectorAll('[data-dse-chrome-item]'));
		expect(items.length).toBeGreaterThan(0);
		for (const id of ['init.reset-turns', 'init.reset-encounter']) expect(root.querySelector(`[data-dse-control="${id}"]`)).not.toBeNull();
		const rogue = document.createElement('button');
		root.querySelector('[data-dse-chrome-item]')!.parentElement!.appendChild(rogue);
		expect(census(root)).toEqual([expect.stringMatching(/^no data-dse-control: <button/)]);
	});

	test.each([
		['the quick-start tracker (a hero, three Ogres, Malice)', () => TRACKER],
		['every variant: a title, two heroes, conditions, round gain + log, a grid group and a single-creature group', () => initFixture('rich')],
		['a captained minion squad with an attached creature', () => initFixture('captain')],
		['a hurt minion squad (dead minions, conditions)', () => initFixture('squad-hurt')],
		['the squad fixture of the stamina suites (a captain, minions)', () => squadYaml],
	])('%s: every interactive node carries an id the manifests declare', async (_name, source) => {
		expect(census(await mountTracker(source()))).toEqual([]);
	});

	test('every control the initiative and reset manifests declare is stamped by SOME tracker variant (no dead manifest row)', async () => {
		const seen = new Set<string>();
		for (const source of [initFixture('rich'), initFixture('captain'), initFixture('squad-hurt'), TRACKER]) {
			const root = await mountTracker(source);
			idsIn(root).forEach((id) => seen.add(id));
			// Open the title editor (the textarea exists only while editing) and select every cell (a squad's
			// other creatures make the detail row offer "Make captain").
			root.querySelector<HTMLElement>('[data-dse-control="init.title"]')?.click();
			root.querySelectorAll<HTMLElement>('.dse-init__cell').forEach((cell) => cell.click());
			idsIn(root).forEach((id) => seen.add(id));
			document.body.innerHTML = '';
		}
		const modal = new ResetEncounterModal(new App() as any, () => undefined);
		modal.open();
		idsIn(modal.contentEl).forEach((id) => seen.add(id));
		const declared = [...Object.keys(initiativeManifest.controls), ...Object.keys(resetManifest.controls)].filter((id) => !id.startsWith('modal.'));
		expect(declared.filter((id) => !seen.has(id))).toEqual([]);
	});

	test('the stamina entry points and the roster cells are identified (hero numeric + bar, creature numeric + bar, one id per cell)', async () => {
		const root = await mountTracker(TRACKER);
		for (const id of ['init.hero.stamina', 'init.hero.bar', 'init.detail.stamina', 'init.detail.bar', 'init.cell.stamina', 'init.cond.add']) {
			expect(root.querySelector(`[data-dse-control="${id}"]`)).not.toBeNull();
		}
		expect(root.querySelectorAll('[data-dse-control="init.cell.stamina"]')).toHaveLength(3);
	});

	test('SC-500: the hero turn overlay (hero rows only), the chrome Reset encounter item and the modal buttons are identified and in their manifests', async () => {
		const root = await mountTracker(TRACKER);
		const turn = root.querySelectorAll('.dse-init__portrait-toggle');
		expect(turn).toHaveLength(1); // one hero, no overlay on creature rows
		expect(turn[0].getAttribute('data-dse-control')).toBe('init.hero.turn');
		const reset = root.querySelector('[data-dse-chrome-item="initiative-reset-encounter"]')!;
		expect(reset.getAttribute('data-dse-control')).toBe('init.reset-encounter');
		const modal = new ResetEncounterModal(new App() as any, () => undefined);
		modal.open();
		expect(modal.contentEl.querySelector('button[aria-label="Yes, Reset"]')!.getAttribute('data-dse-control')).toBe('init.reset-encounter.confirm');
		expect(modal.contentEl.querySelector('button[aria-label="Cancel"]')!.getAttribute('data-dse-control')).toBe('init.reset-encounter.cancel');
		expect(censusProblems(modal.contentEl, new Set(idsOf(resetManifest)))).toEqual([]);
		const declared = new Set(idsOf(initiativeManifest));
		for (const id of ['init.hero.turn', 'init.reset-encounter']) expect(declared.has(id)).toBe(true);
	});

	test('a read-only host (canvas) offers no write control: the only interactive nodes are the Malice log disclosure and the framework chrome', async () => {
		for (const source of [initFixture('rich'), initFixture('captain')]) {
			const root = await mountTracker(source, false);
			const ids = Array.from(root.querySelectorAll(INTERACTIVE)).map((el) => el.getAttribute('data-dse-control'));
			expect(ids.filter((id) => id !== 'init.malice.log' && !chromeIds.includes(id as string))).toEqual([]);
			expect(ids).toContain('init.malice.log');
			expect(census(root)).toEqual([]);
			document.body.innerHTML = '';
		}
	});
});

describe('SC-435 census: the MinionStaminaPoolModal', () => {
	/** The pool modal over the 5-goblin squad fixture (minion #1 dead, #2 grabbed, so every control kind exists). */
	async function openPool(): Promise<HTMLElement> {
		const app = new App();
		const data = await parseEncounterData(squadYaml, app as any, DEFAULT_SETTINGS);
		const group = data.enemy_groups[0];
		const minion = group.creatures[0];
		minion.instances![0].isDead = true;
		minion.instances![1].conditions = [{ key: 'grabbed' }];
		const modal = new MinionStaminaPoolModal(app as any, group, minion, jest.fn());
		modal.open();
		return (modal as any).contentEl as HTMLElement;
	}

	test('every control (stepper, Apply Damage row, kill boxes + names, condition icon, footer) is identified and in the manifest', async () => {
		const content = await openPool();
		expect(censusProblems(content, poolIds)).toEqual([]);
		for (const id of [
			'pool.stamina.dec', 'pool.stamina.input', 'pool.stamina.inc',
			'pool.damage-amount', 'pool.minion-count', 'pool.apply-damage',
			'pool.kill', 'pool.minion-name', 'pool.condition',
			'pool.reset', 'pool.apply',
		]) {
			expect(content.querySelector(`[data-dse-control="${id}"]`)).not.toBeNull();
		}
	});

	test('the kill checkbox and name label repeat once per LIVING minion (the dead one has no row)', async () => {
		const content = await openPool();
		expect(content.querySelectorAll('[data-dse-control="pool.kill"]')).toHaveLength(4);
		expect(content.querySelectorAll('[data-dse-control="pool.minion-name"]')).toHaveLength(4);
		expect(content.querySelectorAll('[data-dse-control="pool.condition"]')).toHaveLength(1);
	});

	test('the three initiative entry points are declared by the manifest as reach rows', () => {
		expect(poolManifest.reach.map((r) => r.control).sort()).toEqual(['init.cell.stamina', 'init.detail.bar', 'init.detail.stamina']);
	});
});

describe('SC-436 census: the ConditionsModal', () => {
	/** The window over a hero with a registered condition, a custom one and a plain string, so every row control exists. */
	function openConditions(): { content: HTMLElement; modal: ConditionsModal } {
		const holder = { conditions: ['bleeding', { key: 'dazed', duration: 'eot' as const }, { key: 'hexed' }] };
		const modal = new ConditionsModal(new App() as any, holder, new ConditionManager(), jest.fn());
		modal.open();
		return { content: (modal as any).contentEl as HTMLElement, modal };
	}
	const ids = (scope: Element, id: string): number => scope.querySelectorAll(`[data-dse-control="${id}"]`).length;

	test('at rest: each row has a cog and a trash button, then "+ Add condition" and Done, all identified and in the manifest', () => {
		const { content } = openConditions();
		expect(censusProblems(content, conditionIds)).toEqual([]);
		expect(ids(content, 'cond.edit')).toBe(3);
		expect(ids(content, 'cond.remove')).toBe(3);
		for (const id of ['cond.add', 'cond.done']) expect(ids(content, id)).toBe(1);
	});

	test('with a row editor open: the icon search, every icon choice, every duration chip, the Default colour chip, swatch, the custom colour input and every effect chip are identified', () => {
		const { content } = openConditions();
		content.querySelectorAll<HTMLElement>('[data-dse-control="cond.edit"]')[1].click();
		expect(censusProblems(content, conditionIds)).toEqual([]);
		expect(ids(content, 'cond.icon-search')).toBe(1);
		expect(ids(content, 'cond.icon')).toBeGreaterThan(1); // "Use default" plus the suggested icons
		expect(ids(content, 'cond.duration')).toBe(4);
		expect(ids(content, 'cond.color-default')).toBe(1);
		expect(ids(content, 'cond.swatch')).toBe(5);
		expect(ids(content, 'cond.color-custom')).toBe(1);
		expect(ids(content, 'cond.effect')).toBe(6);
		expect(content.querySelector('[data-dse-control="cond.color-custom"]')!.getAttribute('type')).toBe('color');
	});

	test('with the Add dropdown open: the combobox input and every option (known conditions and the custom row) are identified', () => {
		const { content } = openConditions();
		content.querySelector<HTMLElement>('[data-dse-control="cond.add"]')!.click();
		expect(censusProblems(content, conditionIds)).toEqual([]);
		expect(ids(content, 'cond.add')).toBe(0); // the button is swapped out while the dropdown is open
		expect(ids(content, 'cond.input')).toBe(1);
		const input = content.querySelector<HTMLInputElement>('[data-dse-control="cond.input"]')!;
		const known = ids(content, 'cond.option');
		expect(known).toBeGreaterThan(5);
		input.value = 'nothing like it';
		input.dispatchEvent(new Event('input'));
		expect(ids(content, 'cond.option')).toBe(1); // filtered to the "Add custom" row, which is an option too
	});

	test('the tracker\'s "Add Condition" buttons (the window\'s reach row) carry init.cond.add: one on the hero row, one on the selected creature row', async () => {
		const host = makeHost('ds-initiative', 'Encounter.md');
		await new ElementPipeline(makeDeps()).run(initiativeElement, TRACKER, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(ids(root, 'init.cond.add')).toBe(2);
		expect(root.querySelector('.dse-init__conditions [data-dse-control="init.cond.add"]')).not.toBeNull();
		expect(conditionsManifest.reach.map((r) => r.control)).toEqual(['init.cond.add']);
		expect(conditionsManifest.reach[0].host).toBe('initiative');
	});
});

describe('SC-438 census: the montage tracker and its four modals, scoped by container', () => {
	// The hand-written fixture holds an unrecognised result on purpose: the model warns about it, which is not what is under test.
	beforeEach(() => {
		jest.spyOn(console, 'warn').mockImplementation(() => undefined);
	});
	afterEach(() => {
		jest.restoreAllMocks();
	});

	/** Mount `source` through the real pipeline; `canPersist` false is the read-only (canvas) host. */
	async function mountMontage(source: string, canPersist = true): Promise<HTMLElement> {
		const host = makeHost('ds-montage', 'Montage.md');
		(host as any).canPersist = canPersist;
		await new ElementPipeline(makeDeps()).run(montageElement, source, host);
		document.body.appendChild(host.containerEl);
		return host.containerEl.firstElementChild as HTMLElement;
	}

	// The scope is the montage's root (the board, the bar, the disclosures and the chrome panel inside it) and each modal's root, not a CSS
	// class per entry point: a new control anywhere in either needs an id from the montage manifests (or the framework chrome's).
	const montageIds = new Set([...idsOf(montageManifest), ...chromeIds]);
	const logIds = new Set(idsOf(montageLogManifest));
	const addHeroIds = new Set(idsOf(montageAddHeroManifest));
	const removeHeroIds = new Set(idsOf(montageRemoveHeroManifest));
	const limitsIds = new Set(idsOf(montageLimitsManifest));
	const census = (root: Element): string[] => censusProblems(root, montageIds, INTERACTIVE, false);

	const fixtureDir = path.join(__dirname, '../../e2e/vaults/shipped/Montage');
	const montageFixture = (name: string): string => {
		const text = fs.readFileSync(path.join(fixtureDir, `${name}.md`), 'utf8');
		return /```ds-montage\n([\s\S]*?)\n```/.exec(text)![1];
	};
	const FIXTURES = fs.readdirSync(fixtureDir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')).sort();
	const idsIn = (root: Element): Set<string> =>
		new Set(Array.from(root.querySelectorAll('[data-dse-control]')).map((el) => el.getAttribute('data-dse-control') as string));
	/** The newest modal's content element, found by one of its own controls. */
	const modalOf = (id: string): HTMLElement => (document.querySelector(`[data-dse-control="${id}"]`) as HTMLElement).closest('.modal-content') as HTMLElement;
	const byId = (root: Element, id: string, n = 0): HTMLElement => root.querySelectorAll<HTMLElement>(`[data-dse-control="${id}"]`)[n];

	test('the census itself bites: an un-id\'d button injected into the board, the action bar or the root is a finding, as is an id outside the manifest', async () => {
		const root = await mountMontage(montageFixture('mid'));
		expect(census(root)).toEqual([]);
		for (const host of ['.dse-mt__board', '.dse-mt__actionrow', '.dse-mt__board-name', '.dse-mt__outcome', '.dse-mt']) {
			const rogue = document.createElement('button');
			rogue.textContent = 'Rogue';
			root.querySelector(host)!.appendChild(rogue);
			expect(census(root)).toEqual([expect.stringMatching(/^no data-dse-control: <button/)]);
			rogue.remove();
		}
		const div = document.createElement('div');
		div.setAttribute('tabindex', '0');
		root.querySelector('.dse-mt__board')!.appendChild(div);
		expect(census(root)).toHaveLength(1);
		div.remove();
		byId(root, 'montage.cell').setAttribute('data-dse-control', 'montage.not-a-control');
		expect(census(root)).toEqual([expect.stringMatching(/id "montage\.not-a-control" is not in the manifest/)]);
	});

	test('the census bites inside each modal: an un-id\'d button in the Log an action sheet, Add a hero, Remove a hero or Set limits is a finding, and so is a foreign id', async () => {
		const root = await mountMontage(montageFixture('mid'));
		const rogue = document.createElement('button');
		rogue.textContent = 'Rogue';
		const open = (id: string, ids: ReadonlySet<string>): HTMLElement => {
			const content = modalOf(id);
			expect(censusProblems(content, ids, INTERACTIVE, false)).toEqual([]);
			content.appendChild(rogue);
			expect(censusProblems(content, ids, INTERACTIVE, false)).toEqual([expect.stringMatching(/^no data-dse-control: <button/)]);
			rogue.remove();
			// An id of another modal's manifest is a finding too.
			byId(content, [...ids].find((x) => x.endsWith('.cancel'))!).setAttribute('data-dse-control', 'montage.limits.nope');
			expect(censusProblems(content, ids, INTERACTIVE, false)).toEqual([expect.stringMatching(/id "montage\.limits\.nope" is not in the manifest/)]);
			return content;
		};
		byId(root, 'montage.bar.log').click();
		open('montage.log.submit', logIds);
		document.querySelectorAll('.modal-container, .modal').forEach((m) => m.remove());
		byId(root, 'montage.board.add-hero').click();
		open('montage.add-hero.submit', addHeroIds);
		document.querySelectorAll('.modal-container, .modal').forEach((m) => m.remove());
		byId(root, 'montage.chrome.remove-hero').click();
		open('montage.remove-hero.submit', removeHeroIds);
		document.querySelectorAll('.modal-container, .modal').forEach((m) => m.remove());
		byId(root, 'montage.chrome.set-limits').click();
		open('montage.limits.save', limitsIds);
	});

	test.each(FIXTURES.map((name) => [name]))('the %s fixture note: every interactive node carries an id the montage manifest declares', async (name) => {
		const source = montageFixture(name);
		expect(census(await mountMontage(source))).toEqual([]);
		document.body.innerHTML = '';
		expect(census(await mountMontage(source, false))).toEqual([]);
	});

	test('the framework fixtures of the montage (example, mid-game, done, failed, old shape) are identified too', async () => {
		for (const yaml of [exampleYaml, midYaml, doneYaml, failedYaml, oldShapeYaml]) {
			expect(census(await mountMontage(yaml))).toEqual([]);
			document.body.innerHTML = '';
		}
	});

	test('the chrome panel is inside the scope: its five items carry montage.chrome.* ids and the framework chrome buttons chrome.* ids', async () => {
		const root = await mountMontage(montageFixture('mid'));
		const items = Array.from(root.querySelectorAll('[data-dse-chrome-item]'));
		expect(items.length).toBeGreaterThan(5);
		for (const id of ['montage.chrome.add-round', 'montage.chrome.add-hero', 'montage.chrome.remove-hero', 'montage.chrome.set-limits', 'montage.chrome.reset-progress']) {
			expect(root.querySelectorAll(`[data-dse-control="${id}"]`)).toHaveLength(1);
		}
		const rogue = document.createElement('button');
		root.querySelector('[data-dse-chrome-item]')!.parentElement!.appendChild(rogue);
		expect(census(root)).toEqual([expect.stringMatching(/^no data-dse-control: <button/)]);
	});

	test('every control the montage manifest declares is stamped by SOME variant of the board (no dead manifest row)', async () => {
		const seen = new Set<string>();
		for (const name of FIXTURES) {
			const root = await mountMontage(montageFixture(name));
			idsIn(root).forEach((id) => seen.add(id));
			document.body.innerHTML = '';
		}
		const declared = Object.keys(montageManifest.controls);
		expect(declared.filter((id) => !seen.has(id))).toEqual([]);
	});

	test('every control the four modal manifests declare is stamped by SOME variant of the modal (no dead manifest row)', async () => {
		const seen = new Set<string>();
		const collect = (id: string): void => idsIn(modalOf(id)).forEach((x) => seen.add(x));
		const sweep = (): void => document.querySelectorAll('.modal-container, .modal').forEach((m) => m.remove());
		const root = await mountMontage(montageFixture('mid'));
		byId(root, 'montage.bar.log').click(); // new sheet
		collect('montage.log.submit');
		sweep();
		byId(root, 'montage.cell').click(); // Kira round 1: the edit sheet
		collect('montage.log.submit');
		sweep();
		byId(root, 'montage.board.add-hero').click();
		collect('montage.add-hero.submit');
		sweep();
		byId(root, 'montage.chrome.remove-hero').click();
		collect('montage.remove-hero.submit');
		sweep();
		byId(root, 'montage.chrome.set-limits').click();
		collect('montage.limits.save');
		const declared = [montageLogManifest, montageAddHeroManifest, montageRemoveHeroManifest, montageLimitsManifest]
			.flatMap((m) => Object.keys(m.controls))
			.filter((id) => !id.startsWith('modal.'));
		expect(declared.filter((id) => !seen.has(id))).toEqual([]);
	});

	test('the entry points of each modal are declared by its manifest as reach rows, and every reach id is a real montage control', () => {
		const montage = new Set(Object.keys(montageManifest.controls));
		for (const m of [montageLogManifest, montageAddHeroManifest, montageRemoveHeroManifest, montageLimitsManifest]) {
			expect(m.reach.length).toBeGreaterThan(0);
			for (const r of m.reach) {
				expect(r.host).toBe('montage');
				expect(montage.has(r.control)).toBe(true);
			}
		}
		expect(montageLogManifest.reach.map((r) => r.control).sort()).toEqual(['montage.bar.log', 'montage.board.row-act', 'montage.cell', 'montage.cell.socket']);
		expect(montageAddHeroManifest.reach.map((r) => r.control).sort()).toEqual(['montage.board.add-hero', 'montage.chrome.add-hero']);
		expect(montageRemoveHeroManifest.reach.map((r) => r.control)).toEqual(['montage.chrome.remove-hero']);
		expect(montageLimitsManifest.reach.map((r) => r.control)).toEqual(['montage.chrome.set-limits']);
	});

	test('the stamped controls repeat as the board does: one cell id per filled / past cell, one socket per hero in the round in play, one quick trio per socket', async () => {
		const root = await mountMontage(montageFixture('mid')); // 4 heroes, round 2 of 3, round 1 filled for three heroes
		expect(root.querySelectorAll('[data-dse-control="montage.board.row-act"]')).toHaveLength(4);
		expect(root.querySelectorAll('[data-dse-control="montage.cell"]')).toHaveLength(4); // 3 filled + Yenna's empty past cell
		expect(root.querySelectorAll('[data-dse-control="montage.cell.socket"]')).toHaveLength(4);
		for (const kind of ['success', 'failure', 'assist']) expect(root.querySelectorAll(`[data-dse-control="montage.quick.${kind}"]`)).toHaveLength(4);
	});

	test('a read-only host (canvas): the board keeps its ids on the stubs, the chrome panel items are absent, nothing offers a socket id', async () => {
		const root = await mountMontage(montageFixture('mid'), false);
		expect(census(root)).toEqual([]);
		expect(root.querySelector('[data-dse-control="montage.cell.socket"]')).toBeNull();
		for (const id of ['montage.chrome.add-round', 'montage.chrome.add-hero', 'montage.chrome.remove-hero', 'montage.chrome.set-limits', 'montage.chrome.reset-progress']) {
			expect(root.querySelector(`[data-dse-control="${id}"]`)).toBeNull();
		}
		expect((byId(root, 'montage.bar.log') as HTMLButtonElement).disabled).toBe(true);
	});
});

describe('SC-439 census: the negotiation tracker, scoped by container', () => {
	/** Mount `source` through the real pipeline; `canPersist` false is the read-only (canvas) host. */
	async function mountNegotiation(source: string, canPersist = true): Promise<HTMLElement> {
		const host = makeHost('ds-negotiation', 'Negotiation.md');
		(host as any).canPersist = canPersist;
		await new ElementPipeline(makeDeps()).run(negotiationElement, source, host);
		return host.containerEl.firstElementChild as HTMLElement;
	}

	// The scope is the negotiation's ROOT (card head, both tabs, the standing region, the Motivations cards and the framework
	// chrome panel inside it), not a CSS class per entry point: a new control anywhere in it needs an id from the negotiation
	// manifest or the framework chrome's (`chrome.collapse` / `chrome.expand`).
	const negotiationIds = new Set([...idsOf(negotiationManifest), ...chromeIds]);
	const census = (root: Element): string[] => censusProblems(root, negotiationIds, INTERACTIVE, false);

	const negoFixture = (name: string): string => {
		const text = fs.readFileSync(path.join(__dirname, '../../e2e/vaults/shipped/Negotiation', `${name}.md`), 'utf8');
		return /```ds-negotiation\n([\s\S]*?)\n```/.exec(text)![1];
	};
	const idsIn = (root: Element): Set<string> =>
		new Set(Array.from(root.querySelectorAll('[data-dse-control]')).map((el) => el.getAttribute('data-dse-control') as string));
	const count = (root: Element, id: string): number => root.querySelectorAll(`[data-dse-control="${id}"]`).length;

	afterEach(() => {
		Menu.lastMenu = null;
	});

	test('the census itself bites: an un-id\'d button injected into the head, either tab, the standing region or the cards is a finding, as is an id outside the manifest', async () => {
		const root = await mountNegotiation(negoFixture('basic'));
		expect(census(root)).toEqual([]);
		for (const host of ['.dse-nt__head', '.dse-nt__patience', '.dse-nt__interest', '.dse-nt__argument', '.dse-nt__learn-more', '.dse-nt__dossier-col', '.dse-nt']) {
			const rogue = document.createElement('button');
			rogue.textContent = 'Rogue';
			root.querySelector(host)!.appendChild(rogue);
			expect(census(root)).toEqual([expect.stringMatching(/^no data-dse-control: <button/)]);
			rogue.remove();
		}
		const div = document.createElement('div');
		div.setAttribute('tabindex', '0');
		root.querySelector('.dse-nt__learn-more')!.appendChild(div);
		expect(census(root)).toHaveLength(1); // a div with a tabindex is interactive, on the tab that is hidden too
		div.remove();
		const stray = root.querySelector('.dse-track__slot')!;
		stray.setAttribute('data-dse-control', 'negotiation.not-a-control');
		expect(census(root)).toEqual([expect.stringMatching(/id "negotiation\.not-a-control" is not in the manifest/)]);
	});

	test('the chrome panel is inside the scope: its Collapse button and the one-line form\'s Expand button are identified, and a rogue item in the panel is a finding', async () => {
		const root = await mountNegotiation(negoFixture('basic'));
		for (const id of ['chrome.collapse', 'chrome.expand']) expect(count(root, id)).toBe(1);
		expect(root.querySelectorAll('[data-dse-chrome-item]').length).toBeGreaterThan(0);
		const rogue = document.createElement('button');
		root.querySelector('.dse-chrome')!.appendChild(rogue);
		expect(census(root)).toEqual([expect.stringMatching(/^no data-dse-control: <button/)]);
	});

	test.each([
		['a live negotiation with two motivations and a pitfall', 'basic'],
		['one motivation already spent (the reuse modifier can apply)', 'spent'],
		['Patience spent: the "final offer" band, Complete disabled, the tier rows static', 'ended'],
		['Interest 5: a deal', 'deal'],
		['Interest 0: hostile', 'hostile'],
		['a name only: no chips and no cards', 'minimal'],
		['a block with keys the element does not know', 'unknown-keys'],
	])('%s: every interactive node carries an id the manifest declares', async (_name, fixture) => {
		const root = await mountNegotiation(negoFixture(fixture));
		expect(census(root)).toEqual([]);
		expect(count(root, 'negotiation.patience')).toBe(1);
		expect(count(root, 'negotiation.patience.seal')).toBe(6);
		expect(count(root, 'negotiation.interest.seal')).toBe(6);
	});

	test('with the Learn Motivation/Pitfall tab showing (hidden argument tab included) every interactive node is still identified', async () => {
		const root = await mountNegotiation(negoFixture('basic'));
		root.querySelector<HTMLElement>('[data-dse-control="negotiation.tab.learn-more"]')!.click();
		expect(root.querySelector('.dse-nt__learn-more')!.closest('[role="tabpanel"]')!.hasAttribute('hidden')).toBe(false);
		expect(census(root)).toEqual([]);
		expect(root.querySelector('.dse-nt__learn-more [data-dse-control], .dse-nt__learn-more button, .dse-nt__learn-more [tabindex]')).toBeNull(); // the rules text offers nothing to press
	});

	test('the repeated controls repeat once per thing they stand for (seals, tabs, chips, tier rows, Spent chips)', async () => {
		const root = await mountNegotiation(negoFixture('basic'));
		const counts: Record<string, number> = {
			'negotiation.menu': 1, 'negotiation.tablist': 1, 'negotiation.tab.argument': 1, 'negotiation.tab.learn-more': 1,
			'negotiation.patience': 1, 'negotiation.patience.seal': 6, 'negotiation.interest': 1, 'negotiation.interest.seal': 6,
			'negotiation.appeal.motivation': 2, 'negotiation.appeal.pitfall': 1, 'negotiation.spent': 2,
			'negotiation.mod.reuse': 1, 'negotiation.mod.lie': 1, 'negotiation.mod.same': 1,
			'negotiation.mod.reuse.label': 1, 'negotiation.mod.lie.label': 1, 'negotiation.mod.same.label': 1,
			'negotiation.tier': 1, 'negotiation.tier.row': 4, 'negotiation.complete': 1,
		};
		for (const [id, n] of Object.entries(counts)) expect([id, count(root, id)]).toEqual([id, n]);
		// the Patience seals read 0..5 left to right and the Interest rows 5..0 top to bottom (the `nth` the specs rely on)
		const values = (id: string): string[] => Array.from(root.querySelectorAll(`[data-dse-control="${id}"]`)).map((el) => el.getAttribute('data-value') as string);
		expect(values('negotiation.patience.seal')).toEqual(['0', '1', '2', '3', '4', '5']);
		expect(values('negotiation.interest.seal')).toEqual(['5', '4', '3', '2', '1', '0']);
	});

	test('a name-only block has no chip and no Spent chip to identify (nothing stamped for rows that do not exist), and still has its card controls', async () => {
		const root = await mountNegotiation(negoFixture('minimal'));
		for (const id of ['negotiation.appeal.motivation', 'negotiation.appeal.pitfall', 'negotiation.spent']) expect(count(root, id)).toBe(0);
		for (const id of ['negotiation.menu', 'negotiation.complete', 'negotiation.mod.lie']) expect(count(root, id)).toBe(1);
		expect(census(root)).toEqual([]);
	});

	test('every control the manifest declares is stamped by SOME negotiation variant (no dead manifest row)', async () => {
		const seen = new Set<string>();
		for (const fixture of ['basic', 'spent', 'ended', 'minimal']) {
			const root = await mountNegotiation(negoFixture(fixture));
			idsIn(root).forEach((id) => seen.add(id));
			document.body.innerHTML = '';
		}
		// the native menu's one item is outside the card: open the menu and read what the product stamped on it
		const root = await mountNegotiation(negoFixture('basic'));
		root.querySelector<HTMLElement>('[data-dse-control="negotiation.menu"]')!.click();
		const itemEl = (Menu.lastMenu!.items[0] as unknown as { dom: HTMLElement }).dom;
		if (itemEl.hasAttribute('data-dse-control')) seen.add(itemEl.getAttribute('data-dse-control') as string);
		expect(Object.keys(negotiationManifest.controls).filter((id) => !seen.has(id))).toEqual([]);
	});

	test('the Reset menu item is a native node outside the card: it carries negotiation.menu.reset (the manifest\'s id) and nothing else is stamped on the menu', async () => {
		const root = await mountNegotiation(negoFixture('basic'));
		root.querySelector<HTMLElement>('[data-dse-control="negotiation.menu"]')!.click();
		expect(Menu.lastMenu!.items).toHaveLength(1);
		const itemEl = (Menu.lastMenu!.items[0] as unknown as { dom: HTMLElement }).dom;
		expect(itemEl.getAttribute('data-dse-control')).toBe('negotiation.menu.reset');
		expect(negotiationIds.has('negotiation.menu.reset')).toBe(true);
		expect(itemEl.querySelectorAll('[data-dse-control]')).toHaveLength(0);
	});

	test('a read-only host (canvas) keeps every node identified, and offers no menu, no Complete and no live seal', async () => {
		for (const fixture of ['basic', 'ended']) {
			const root = await mountNegotiation(negoFixture(fixture), false);
			expect(census(root)).toEqual([]);
			for (const id of ['negotiation.menu', 'negotiation.complete']) expect(count(root, id)).toBe(0);
			expect(Array.from(root.querySelectorAll('[data-dse-control="negotiation.patience.seal"], [data-dse-control="negotiation.interest.seal"], [data-dse-control="negotiation.spent"], [data-dse-control="negotiation.appeal.motivation"], [data-dse-control="negotiation.mod.lie"]')).every((el) => (el as HTMLButtonElement).disabled)).toBe(true);
			expect(count(root, 'negotiation.tier.row')).toBe(0); // the tier rows are static: no radio leads nowhere
			document.body.innerHTML = '';
		}
	});
});

describe('SC-440 census: the settings tab, scoped by its container, page by page', () => {
	/* eslint-disable @typescript-eslint/no-explicit-any */
	// What a user can operate in the tab: the generic interactive nodes plus the rows and widgets obsidian renders without a
	// button/tabindex of their own (a navigable page row, an action row, the toggle's label, the file combobox and its clear X).
	const SETTINGS_INTERACTIVE = `${INTERACTIVE}, .mod-navigable, .mod-action, .checkbox-container, .combobox-button, .combobox-clear-button, .clickable-icon`;
	// The live preview's stage holds an element mounted through the pipeline: its controls belong to that element's surface.
	const PREVIEW_STAGE = '.dse-settings-preview__stage';
	const settingsIds = new Set(idsOf(settingsManifest));
	/** Gated: present only with the experimental switch on. */
	const GATED = ['settings.print-preview', 'settings.authoring-controls', 'settings.page.authoring', 'settings.reset.authoring'];

	const census = (scope: Element, allowed: ReadonlySet<string> = settingsIds): string[] => {
		const problems: string[] = [];
		const describe = (el: Element): string => `<${el.tagName.toLowerCase()} class="${el.className}"> ${(el.textContent ?? '').trim().slice(0, 30)}`;
		scope.querySelectorAll(SETTINGS_INTERACTIVE).forEach((el) => {
			if (el.closest(PREVIEW_STAGE)) return;
			if (el.matches('.checkbox-container > input')) return; // the toggle's own checkbox: its label carries the id
			if (!el.hasAttribute('data-dse-control')) problems.push(`no data-dse-control: ${describe(el)}`);
		});
		scope.querySelectorAll('[data-dse-control]').forEach((el) => {
			if (el.closest(PREVIEW_STAGE)) return;
			const id = el.getAttribute('data-dse-control') as string;
			if (!allowed.has(id)) problems.push(`id "${id}" is not in the manifest: ${describe(el)}`);
		});
		return problems;
	};

	async function openTab(experimental: boolean): Promise<{ tab: any; plugin: DrawSteelAdmonitionPlugin }> {
		const app = new App();
		const plugin = new DrawSteelAdmonitionPlugin(app as never, { id: 'draw-steel-elements', version: 'test' } as never);
		plugin.loadData = async () => (experimental ? { experimental: true } : {}); // the mock vault's own data.json turns the gate on
		setExperimental(experimental); // onload re-reads it from data.json; the suite default is ON
		await plugin.onload();
		const tab: any = new DseSettingTab(plugin.app as never, plugin);
		tab.update();
		return { tab, plugin };
	}
	/** Every page the tab has, as the path obsidian would take to it: the index, each section, each nested Advanced page. */
	function pagePaths(tab: any): string[][] {
		const out: string[][] = [[]];
		const walk = (items: any[], path: string[]): void => {
			for (const item of items) {
				if (item?.type === 'group') walk(item.items ?? [], path);
				else if (item?.type === 'page') {
					out.push([...path, item.name]);
					walk(item.items ?? [], [...path, item.name]);
				}
			}
		};
		walk(tab.settingItems, []);
		return out;
	}
	const stampedIds = (root: Element): string[] =>
		Array.from(root.querySelectorAll('[data-dse-control]')).filter((el) => !el.closest(PREVIEW_STAGE)).map((el) => el.getAttribute('data-dse-control') as string);

	beforeEach(() => {
		(window as any).queryLocalFonts = async () => []; // the font rows' "List installed fonts" button exists only where the Local Font Access API does
	});
	afterEach(async () => {
		delete (window as any).queryLocalFonts;
		await flushAsync(2); // let each page's preview mount settle before the next test
	});

	test('the census itself bites: an un-id\'d button, an un-id\'d action or page row, or an id outside the manifest is a finding; the preview stage is not scanned', async () => {
		const { tab } = await openTab(true);
		tab.renderPage(['Statblock display']);
		const root = tab.containerEl as HTMLElement;
		expect(census(root)).toEqual([]);
		for (const host of ['.setting-items', '.setting-item-control']) {
			const rogue = document.createElement('button');
			rogue.textContent = 'Rogue';
			root.querySelector(host)!.appendChild(rogue);
			expect(census(root)).toEqual([expect.stringMatching(/^no data-dse-control: <button/)]);
			rogue.remove();
		}
		for (const cls of ['mod-action', 'mod-navigable']) {
			const row = document.createElement('div');
			row.className = `setting-item ${cls}`;
			root.querySelector('.setting-items')!.appendChild(row);
			expect(census(root)).toEqual([expect.stringMatching(/^no data-dse-control: <div class="setting-item mod-/)]);
			row.remove();
		}
		const first = root.querySelector<HTMLElement>('[data-dse-control="settings.sb-density"]')!;
		first.setAttribute('data-dse-control', 'settings.not-a-control');
		expect(census(root)).toEqual([expect.stringMatching(/id "settings\.not-a-control" is not in the manifest/)]);
		first.setAttribute('data-dse-control', 'settings.sb-density');
		// An interactive node inside the preview stage is another surface's: not a finding.
		await flushAsync(3);
		const stage = root.querySelector(PREVIEW_STAGE)!;
		expect(stage).not.toBeNull();
		const inStage = document.createElement('button');
		stage.appendChild(inStage);
		expect(census(root)).toEqual([]);
	});

	test('the index, every section page and every nested Advanced page: every interactive node carries an id the manifest declares (gate on)', async () => {
		const { tab } = await openTab(true);
		const paths = pagePaths(tab);
		expect(paths.map((p) => p.join(' > '))).toEqual([
			'', 'Appearance', 'Typography', 'Typography > Advanced', 'Statblock display', 'Statblock display > Advanced', 'Featureblock display',
			'Feature display', 'Element defaults', 'Element defaults > Advanced', 'Rolling', 'Authoring', 'Compendium', 'Links', 'Initiative tracker',
		]);
		for (const path of paths) {
			tab.renderPage(path);
			expect({ page: path.join(' > '), findings: census(tab.containerEl) }).toEqual({ page: path.join(' > '), findings: [] });
			await flushAsync(1);
		}
	});

	test('the ids stamped across every page are exactly the manifest\'s: no unidentified control, no dead manifest row (gate on)', async () => {
		const { tab } = await openTab(true);
		const seen = new Set<string>();
		for (const path of pagePaths(tab)) {
			tab.renderPage(path);
			stampedIds(tab.containerEl).forEach((id) => seen.add(id));
			await flushAsync(1);
		}
		expect([...seen].filter((id) => !settingsIds.has(id))).toEqual([]);
		expect([...settingsIds].filter((id) => !seen.has(id))).toEqual([]);
	});

	test('the shipped tab (gate off): the same pages minus Authoring, and none of the four gated ids exists', async () => {
		const { tab } = await openTab(false);
		const names = pagePaths(tab).map((p) => p.join(' > '));
		expect(names).not.toContain('Authoring');
		const seen = new Set<string>();
		for (const path of pagePaths(tab)) {
			tab.renderPage(path);
			expect({ page: path.join(' > '), findings: census(tab.containerEl) }).toEqual({ page: path.join(' > '), findings: [] });
			stampedIds(tab.containerEl).forEach((id) => seen.add(id));
			await flushAsync(1);
		}
		for (const id of GATED) expect(seen.has(id)).toBe(false);
		expect([...settingsIds].filter((id) => !seen.has(id) && !GATED.includes(id))).toEqual([]);
	});

	test('a descriptor\'s id comes from its key: every described pref with a settings row is stamped settings.<kebab-key>', async () => {
		const { tab, plugin } = await openTab(true);
		const seen = new Set<string>();
		for (const path of pagePaths(tab)) {
			tab.renderPage(path);
			stampedIds(tab.containerEl).forEach((id) => seen.add(id));
			await flushAsync(1);
		}
		const keys = plugin.frameworkV2!.services.prefs.descriptors().filter((d) => (d.ui as { control?: string } | undefined)?.control);
		expect(keys.length).toBeGreaterThanOrEqual(30);
		for (const d of keys) {
			expect({ key: d.key, id: `settings.${String(d.key).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`, stamped: seen.has(`settings.${String(d.key).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`) })
				.toEqual({ key: d.key, id: expect.any(String), stamped: true });
		}
	});

	test('the stamps survive what obsidian does to a rendered page: a repaint from the cache, refreshDomState() and a dependent row\'s disabling', async () => {
		const { tab, plugin } = await openTab(true);
		tab.renderPage(['Statblock display']);
		const before = stampedIds(tab.containerEl).sort();
		tab.renderPage(['Statblock display']);
		expect(stampedIds(tab.containerEl).sort()).toEqual(before);
		await plugin.frameworkV2!.services.prefs.set('sbSticky', 'off');
		tab.refreshDomState();
		expect(stampedIds(tab.containerEl).sort()).toEqual(before);
		const meta = tab.containerEl.querySelector('[data-dse-control="settings.sb-sticky-meta"]') as HTMLElement;
		expect(meta.classList.contains('is-disabled')).toBe(true);
		expect(tab.containerEl.querySelectorAll('[data-dse-control="settings.sb-sticky-meta"]')).toHaveLength(1);
	});
});

// SC-443: the authoring surface (src/authoring): the /ds suggest rows, the in-fence key / value rows, the compendium search window and the
// insert commands. The popup an EditorSuggest draws and the dialog a SuggestModal draws are Obsidian's; what our code draws is the content
// of each `.suggestion-item`, and obsidian delegates the click to that row, so the ROW is the control here (`.suggestion-item` joins the
// interactive selector). Scoped by container: the suggestion container while our suggester is open, the search modal's root.
describe('authoring surface census (SC-443)', () => {
	const SUGGEST_INTERACTIVE = `${INTERACTIVE}, .suggestion-item`;
	const domIds = (m: { controls: Record<string, unknown> }, virtual: readonly string[]): Set<string> =>
		new Set(Object.keys(m.controls).filter((id) => !virtual.includes(id)));
	const dsIds = domIds(dsSuggestManifest, DS_VIRTUAL);
	const schemaIds = domIds(schemaSuggestManifest, SCHEMA_VIRTUAL);
	const searchIds = new Set(idsOf(searchManifest));
	const stamped = (scope: Element): string[] => Array.from(scope.querySelectorAll('[data-dse-control]')).map((el) => el.getAttribute('data-dse-control') as string);

	/** An open EditorSuggest popup, the way obsidian builds it: `.suggestion-container > .suggestion > .suggestion-item`. */
	function popup(): { container: HTMLElement; row: () => HTMLElement } {
		const container = document.createElement('div');
		container.className = 'suggestion-container';
		const list = container.appendChild(document.createElement('div'));
		list.className = 'suggestion';
		return { container, row: () => list.appendChild(Object.assign(document.createElement('div'), { className: 'suggestion-item' })) };
	}
	const registry = () => {
		const r = createElementRegistry();
		registerFrameworkElementDefinitions(r);
		return r;
	};
	const ctx = (query: string) => ({ editor: null as never, file: null as never, start: { line: 0, ch: 0 }, end: { line: 0, ch: 0 }, query });

	function dsPopup(): HTMLElement {
		const s = new DsElementSuggest(new App() as any, registry());
		const { container, row } = popup();
		for (const def of s.getSuggestions(ctx(''))) s.renderSuggestion(def, row());
		return container;
	}
	function schemaPopup(lines: string[], ch: number): HTMLElement {
		const s = new DsSchemaSuggest(new App() as any, registry());
		const editor = new Editor(lines.join('\n'));
		const cursor = { line: lines.length - 1, ch };
		const info = s.onTrigger(cursor, editor as never, null)!;
		const { container, row } = popup();
		for (const v of s.getSuggestions({ ...ctx(info.query), editor: editor as never })) s.renderSuggestion(v, row());
		return container;
	}
	function searchModal(empty = false): CompendiumSearchModal {
		const { app, vault, index } = makeCompendiumDeps();
		if (!empty) for (const f of ['kit/panther.md', 'condition/bleeding.md', 'monster/goblin/statblock/goblin-stinker.md']) loadMdDseFixture(vault, f);
		const modal = new CompendiumSearchModal(app as any, index, jest.fn(), { onSyncRequested: jest.fn() });
		modal.open();
		for (const entry of modal.getSuggestions('')) modal.renderSuggestion(entry, modal.resultContainerEl.appendChild(Object.assign(document.createElement('div'), { className: 'suggestion-item' })));
		return modal;
	}
	afterEach(() => {
		document.body.innerHTML = '';
	});

	test('the /ds list: every row is the identified control authoring.ds.item, and nothing else inside the popup is interactive', () => {
		const container = dsPopup();
		expect(container.querySelectorAll('.suggestion-item').length).toBeGreaterThanOrEqual(13);
		expect(censusProblems(container, dsIds, SUGGEST_INTERACTIVE, false)).toEqual([]);
		expect(new Set(stamped(container))).toEqual(new Set(['authoring.ds.item']));
		expect(stamped(container)).toHaveLength(container.querySelectorAll('.suggestion-item').length);
	});

	// (The only top-level enums are ds-roll's `mode` and `difficulty`, and ds-roll is deferred: the value list exists with the gate on only. The suite default is ON.)
	test('the in-fence lists: a key row is authoring.schema.key and an enum value row is authoring.schema.value', () => {
		const keys = schemaPopup(['```ds-stamina-bar', 'cur'], 3);
		expect(keys.querySelectorAll('.suggestion-item').length).toBeGreaterThan(0);
		expect(censusProblems(keys, schemaIds, SUGGEST_INTERACTIVE, false)).toEqual([]);
		expect(new Set(stamped(keys))).toEqual(new Set(['authoring.schema.key']));
		const values = schemaPopup(['```ds-roll', 'mode: '], 6);
		expect(values.querySelectorAll('.suggestion-item').length).toBeGreaterThan(0);
		expect(censusProblems(values, schemaIds, SUGGEST_INTERACTIVE, false)).toEqual([]);
		expect(new Set(stamped(values))).toEqual(new Set(['authoring.schema.value']));
	});

	test('the search window with a compendium: the input is authoring.search.input and each result row authoring.search.result; the empty state is authoring.search.sync', () => {
		const full = searchModal();
		expect(censusProblems(full.containerEl, searchIds, SUGGEST_INTERACTIVE, false)).toEqual([]);
		expect(full.inputEl.getAttribute('data-dse-control')).toBe('authoring.search.input');
		const rows = Array.from(full.resultContainerEl.querySelectorAll('.suggestion-item'));
		expect(rows).toHaveLength(3);
		for (const row of rows) expect(row.getAttribute('data-dse-control')).toBe('authoring.search.result');
		full.close();
		const empty = searchModal(true);
		expect(censusProblems(empty.containerEl, searchIds, SUGGEST_INTERACTIVE, false)).toEqual([]);
		const only = Array.from(empty.resultContainerEl.querySelectorAll('.suggestion-item'));
		expect(only.map((r) => r.getAttribute('data-dse-control'))).toEqual(['authoring.search.sync']);
		empty.close();
	});

	test('the census itself bites: an un-id\'d button or row inside any of the three surfaces, or an id outside the manifest, is a finding', () => {
		const surfaces: Array<[string, HTMLElement, ReadonlySet<string>]> = [
			['/ds popup', dsPopup(), dsIds],
			['schema popup', schemaPopup(['```ds-stamina-bar', 'cur'], 3), schemaIds],
			['search window', searchModal().containerEl, searchIds],
		];
		for (const [name, root, allowed] of surfaces) {
			expect({ name, findings: censusProblems(root, allowed, SUGGEST_INTERACTIVE, false) }).toEqual({ name, findings: [] });
			const row = root.querySelector('.suggestion-item') as HTMLElement;
			// an un-id'd button drawn inside a row
			const rogue = row.appendChild(document.createElement('button'));
			expect({ name, findings: censusProblems(root, allowed, SUGGEST_INTERACTIVE, false) }).toEqual({ name, findings: [expect.stringMatching(/^no data-dse-control: <button/)] });
			rogue.remove();
			// a row that lost its id
			const id = row.getAttribute('data-dse-control') as string;
			row.removeAttribute('data-dse-control');
			expect({ name, findings: censusProblems(root, allowed, SUGGEST_INTERACTIVE, false) }).toEqual({ name, findings: [expect.stringMatching(/^no data-dse-control: <div class="[^"]*suggestion-item/)] });
			// an id the manifest does not declare
			row.setAttribute('data-dse-control', 'authoring.not-a-control');
			expect({ name, findings: censusProblems(root, allowed, SUGGEST_INTERACTIVE, false) }).toEqual({ name, findings: [expect.stringMatching(/id "authoring\.not-a-control" is not in the manifest/)] });
			row.setAttribute('data-dse-control', id);
		}
	});

	test('no dead manifest row: the ids drawn across the variants above are exactly the manifests\' DOM ids (the typed triggers are virtual)', () => {
		const all = [
			...stamped(dsPopup()),
			...stamped(schemaPopup(['```ds-stamina-bar', 'cur'], 3)),
			...stamped(schemaPopup(['```ds-roll', 'mode: '], 6)),
			...stamped(searchModal().containerEl),
			...stamped(searchModal(true).containerEl),
		];
		expect(new Set(all)).toEqual(new Set([...dsIds, ...schemaIds, ...searchIds]));
		expect(DS_VIRTUAL.concat(SCHEMA_VIRTUAL)).toEqual(['authoring.ds.trigger', 'authoring.schema.trigger']);
		for (const id of [...DS_VIRTUAL, ...SCHEMA_VIRTUAL]) expect(all).not.toContain(id);
	});

	test('the command manifest is exactly the commands the plugin registers: thirteen element commands + two compendium commands shipped, eight more with the gate on, never insert-hero', () => {
		const declared = new Set(idsOf(commandsManifest));
		const registered = (experimental: boolean): string[] => {
			setExperimental(experimental);
			const plugin = new Plugin(new App()) as any;
			registerInsertCommands(plugin, registry());
			registerCompendiumInsertCommands(plugin, makeCompendiumDeps().index, {} as never);
			return plugin.commands.map((c: { id: string }) => `authoring.cmd.${c.id}`);
		};
		try {
			const off = registered(false);
			const on = registered(true);
			expect(off).toHaveLength(15);
			expect(on).toHaveLength(23);
			expect(new Set(on)).toEqual(declared);
			expect(off.every((id) => declared.has(id))).toBe(true);
			expect(on).not.toContain('authoring.cmd.insert-hero');
		} finally {
			setExperimental(true);
		}
	});
});

describe('SC-442 census: the counter, scoped by container', () => {
	/** Mount `source` through the real pipeline; `canPersist` false is the read-only (canvas) host. */
	async function mountCounter(source: string, canPersist = true): Promise<HTMLElement> {
		const host = makeHost('ds-counter', 'Counter.md');
		(host as any).canPersist = canPersist;
		await new ElementPipeline(makeDeps()).run(counterElement, source, host);
		return host.containerEl.firstElementChild as HTMLElement;
	}

	// The scope is the counter's ROOT (the stepper, the name and the framework chrome panel inside it), not a CSS class: a new control
	// anywhere in it needs an id from the counter manifest or the framework chrome's (`chrome.collapse` / `chrome.expand` / `chrome.pin`).
	const counterIds = new Set([...idsOf(counterManifest), ...chromeIds]);
	const census = (root: Element): string[] => censusProblems(root, counterIds, INTERACTIVE, false);
	const count = (root: Element, id: string): number => root.querySelectorAll(`[data-dse-control="${id}"]`).length;

	const fixtureDir = path.join(__dirname, '../../e2e/vaults/shipped/Counter');
	const counterFixture = (name: string): string => {
		const text = fs.readFileSync(path.join(fixtureDir, `${name}.md`), 'utf8');
		return /```ds-counter\n([\s\S]*?)\n?```/.exec(text)![1];
	};
	const FIXTURES = fs.readdirSync(fixtureDir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')).sort();

	// The fixtures whose block is not a map (`wrong-block`, `wrong-list`, `wrong-number`, `wrong-tagged`: SC-672) draw a plain error card, not a counter, so they
	// are left out of the "draws the normal card" rows; the row below asserts what holds for ANY card (every interactive node it draws has an id the manifest
	// declares). Every other fixture, an empty block included (SC-672: a counter at 0), draws the normal card.
	// Convention: an error-card fixture is named `wrong-*`; one that is misnamed lands in RENDERS and goes red there (the safe direction).
	const WRONG_BLOCKS = FIXTURES.filter((name) => name.startsWith('wrong-'));
	const RENDERS = FIXTURES.filter((name) => !WRONG_BLOCKS.includes(name));

	// The kept-keys fixture holds a `prefs:` scalar and a non-boolean `collapsed:` on purpose: the framework warns about both, which is not what is under test.
	beforeEach(() => {
		jest.spyOn(console, 'warn').mockImplementation(() => undefined);
	});
	afterEach(() => {
		jest.restoreAllMocks();
		setExperimental(true); // the suite default
	});

	test.each([
		['an editable counter', true],
		['a read-only counter (canvas host)', false],
	])('the census itself bites on %s: an un-id\'d button injected into the stepper, the card, the chrome panel or the root is a finding, as is an id outside the manifest', async (_name, canPersist) => {
		const root = await mountCounter(counterFixture('counter'), canPersist);
		expect(census(root)).toEqual([]);
		for (const host of ['.dse-stepper', '.dse-counter', '.dse-chrome', null]) {
			const rogue = document.createElement('button');
			rogue.textContent = 'Rogue';
			(host === null ? root : root.querySelector(host)!).appendChild(rogue);
			expect(census(root)).toEqual([expect.stringMatching(/^no data-dse-control: <button/)]);
			rogue.remove();
		}
		const div = document.createElement('div');
		div.setAttribute('tabindex', '0');
		root.querySelector('.dse-counter')!.appendChild(div);
		expect(census(root)).toHaveLength(1);
		div.remove();
		const field = document.createElement('input');
		root.querySelector('.dse-stepper')!.appendChild(field);
		expect(census(root)).toEqual([expect.stringMatching(/^no data-dse-control: <input/)]);
		field.remove();
		const stray = root.querySelector('[data-dse-control="counter.inc"]')!;
		stray.setAttribute('data-dse-control', 'counter.not-a-control');
		expect(census(root)).toEqual([expect.stringMatching(/id "counter\.not-a-control" is not in the manifest/)]);
	});

	test.each(RENDERS.map((name) => [name]))('the %s fixture note, editable: every interactive node carries an id the counter manifest declares, and the value is the input', async (name) => {
		const root = await mountCounter(counterFixture(name));
		expect(census(root)).toEqual([]);
		for (const id of ['counter.dec', 'counter.input', 'counter.inc']) expect(count(root, id)).toBe(1);
		expect(count(root, 'counter.value')).toBe(0);
	});

	test.each(RENDERS.map((name) => [name]))('the %s fixture note, read-only: every interactive node carries an id the counter manifest declares, and the value is a plain span', async (name) => {
		const root = await mountCounter(counterFixture(name), false);
		expect(census(root)).toEqual([]);
		for (const id of ['counter.dec', 'counter.value', 'counter.inc']) expect(count(root, id)).toBe(1);
		expect(count(root, 'counter.input')).toBe(0);
		expect(root.querySelector('input')).toBeNull();
	});

	test.each(WRONG_BLOCKS.map((name) => [name]))('the %s fixture note (SC-672: an error card): whatever card it draws, no interactive node lacks an id the manifest declares', async (name) => {
		for (const canPersist of [true, false]) {
			const root = await mountCounter(counterFixture(name), canPersist);
			expect(root.hasAttribute('data-dse-error-stage')).toBe(true); // it IS an error card
			expect(census(root)).toEqual([]);
		}
	});

	test('a counter pinned to the sidebar (mode sidebar, experimental gate on) carries chrome.unpin, which the census accepts as shared chrome, and still flags a rogue node', async () => {
		const host = makeHost('ds-counter', 'Counter.md');
		(host as any).mode = 'sidebar';
		(host as any).requestRemoval = jest.fn();
		await new ElementPipeline(makeDeps()).run(counterElement, counterFixture('counter'), host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(count(root, 'chrome.unpin')).toBe(1);
		expect(count(root, 'chrome.pin')).toBe(0);
		for (const id of ['counter.dec', 'counter.input', 'counter.inc']) expect(count(root, id)).toBe(1);
		expect(census(root)).toEqual([]);
		const rogue = document.createElement('button');
		root.querySelector('.dse-stepper')!.appendChild(rogue);
		expect(census(root)).toEqual([expect.stringMatching(/^no data-dse-control: <button/)]);
	});

	test('every control the counter manifest declares is stamped by SOME variant of the card (no dead manifest row), and the manifest lists nothing else', async () => {
		const seen = new Set<string>();
		for (const canPersist of [true, false]) {
			const root = await mountCounter(counterFixture('counter'), canPersist);
			root.querySelectorAll('[data-dse-control]').forEach((el) => seen.add(el.getAttribute('data-dse-control') as string));
		}
		expect(Object.keys(counterManifest.controls).sort()).toEqual(['counter.dec', 'counter.inc', 'counter.input', 'counter.value']);
		for (const id of Object.keys(counterManifest.controls)) expect({ id, stamped: seen.has(id) }).toEqual({ id, stamped: true });
		expect(counterManifest.reach).toEqual([]);
	});

	test('the stamps are on the nodes a user reaches: two real buttons, the number field and (read-only) the span the focus hand-off targets', async () => {
		const editable = await mountCounter(counterFixture('counter'));
		expect(editable.querySelector('[data-dse-control="counter.dec"]')!.tagName).toBe('BUTTON');
		expect(editable.querySelector('[data-dse-control="counter.inc"]')!.tagName).toBe('BUTTON');
		expect(editable.querySelector('[data-dse-control="counter.input"]')!.tagName).toBe('INPUT');
		const readOnly = await mountCounter(counterFixture('counter'), false);
		const value = readOnly.querySelector('[data-dse-control="counter.value"]') as HTMLElement;
		expect(value.tagName).toBe('SPAN');
		expect(value.getAttribute('tabindex')).toBe('-1'); // a programmatic focus target, not a tab stop
		expect(manifestKinds('counter.value')).toEqual([]); // so nothing is expected to drive it
	});

	test('the chrome panel is inside the scope: Collapse and the one-line form\'s Expand are identified, the experimental Pin item appears only with the gate on, and a rogue item in the panel is a finding', async () => {
		setExperimental(false);
		const shipped = await mountCounter(counterFixture('counter'));
		expect(census(shipped)).toEqual([]);
		for (const id of ['chrome.collapse', 'chrome.expand']) expect(count(shipped, id)).toBe(1);
		expect(count(shipped, 'chrome.pin')).toBe(0);
		setExperimental(true);
		const gated = await mountCounter(counterFixture('counter'));
		expect(census(gated)).toEqual([]);
		for (const id of ['chrome.collapse', 'chrome.expand', 'chrome.pin']) expect(count(gated, id)).toBe(1);
		const rogue = document.createElement('button');
		gated.querySelector('.dse-chrome')!.appendChild(rogue);
		expect(census(gated)).toEqual([expect.stringMatching(/^no data-dse-control: <button/)]);
	});

	test('a read-only counter keeps both buttons disabled and offers no field, so no id on it takes a key or a typed value', async () => {
		const root = await mountCounter(counterFixture('counter'), false);
		expect((root.querySelector('[data-dse-control="counter.dec"]') as HTMLButtonElement).disabled).toBe(true);
		expect((root.querySelector('[data-dse-control="counter.inc"]') as HTMLButtonElement).disabled).toBe(true);
		expect(root.getAttribute('data-dse-readonly')).toBe('true');
	});

	/** The interaction kinds the manifest lists for `id`. */
	function manifestKinds(id: string): readonly string[] {
		return counterManifest.controls[id].kinds;
	}
});

describe('SC-441 census: the compendium sync windows, scoped by container, window by window and phase by phase', () => {
	// Both windows are scanned by their dialog root (the whole container, not a CSS class): every interactive node inside must carry an id of
	// the window's manifest. Obsidian's own X and backdrop are not part of the mock (and are host ids in the real-Obsidian census).
	const ROOT = 'DS Compendium';
	const legacyIds = new Set(idsOf(legacyWindowManifest).filter((id) => !LEGACY_VIRTUAL.includes(id) && !LEGACY_HOST.includes(id)));
	const migrationIds = new Set(idsOf(migrationWindowManifest).filter((id) => !MIGRATION_VIRTUAL.includes(id) && !MIGRATION_HOST.includes(id)));
	type Phase = 'preview' | 'running' | 'summary' | 'stopped' | 'error';
	const PHASES: Phase[] = ['preview', 'running', 'summary', 'stopped', 'error'];
	/** What a user can press in each phase (the id names the phase; the number in a label never reaches an id). */
	const EXPECTED: Record<Phase, string[]> = {
		preview: ['migration.preview.not-now', 'migration.preview.sync-anyway', 'migration.preview.move'],
		running: ['migration.running.stop'],
		summary: ['migration.list.backed-up', 'migration.list.moved-modified', 'migration.list.blocked', 'migration.list.failed', 'migration.list.unmapped', 'migration.summary.close', 'migration.summary.sync-now'],
		stopped: ['migration.list.backed-up', 'migration.list.moved-modified', 'migration.list.blocked', 'migration.list.failed', 'migration.list.unmapped', 'migration.stopped.close', 'migration.stopped.finish'],
		error: ['migration.error.close'],
	};

	const rename = (oldRelative: string, newRelative: string, modified: boolean | null = false) => ({
		fromPath: `${ROOT}/${oldRelative}`, toPath: `${ROOT}/${newRelative}`, oldRelative, newRelative, modified,
	});
	const plan: MigrationPlan = {
		root: ROOT,
		detection: { root: ROOT, filesInRoot: 9, legacyPaths: 8, newLayoutPaths: 0, isLegacyLayout: true },
		renames: [rename('Rules/Careers/Disciple.md', 'career/disciple.md'), rename('Rules/Careers/Sage.md', 'career/sage.md', true)],
		blocked: [{ fromPath: `${ROOT}/Rules/Careers/Agent.md`, toPath: `${ROOT}/career/agent.md` }],
		unmapped: [`${ROOT}/Rules/_Index.md`],
		backupCount: 1,
		backupFolder: `${ROOT} backup (pre-7.0.0)`,
	};
	// Every per-path list non-empty, so every disclosure button is drawn.
	const fullReport = (aborted: boolean): MigrationReport => ({
		root: ROOT, mapRelease: 'v3.20260403152914',
		migrated: [rename('Rules/Careers/Disciple.md', 'career/disciple.md'), rename('Rules/Careers/Sage.md', 'career/sage.md', true)],
		migratedModified: [rename('Rules/Careers/Sage.md', 'career/sage.md', true)],
		blocked: [{ fromPath: `${ROOT}/Rules/Careers/Agent.md`, toPath: `${ROOT}/career/agent.md` }],
		failed: [{ fromPath: `${ROOT}/Rules/Careers/Bard.md`, toPath: `${ROOT}/career/bard.md`, error: 'refused' }],
		unmapped: [`${ROOT}/Rules/_Index.md`],
		aborted, remaining: aborted ? 7 : 0,
		reportNotePath: 'Draw Steel Elements migration report.md',
		backedUp: [{ fromPath: `${ROOT}/Rules/Careers/Sage.md`, backupPath: `${ROOT} backup (pre-7.0.0)/Rules/Careers/Sage.md` }],
		backupFolder: `${ROOT} backup (pre-7.0.0)`,
	});
	const settle = async (): Promise<void> => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

	function legacyWindow(): LegacyCompendiumModal {
		const modal = new LegacyCompendiumModal(new App() as any, ROOT, jest.fn());
		modal.open();
		return modal;
	}
	/** The migration window in `phase`, driven there through its real buttons and callbacks. */
	async function migrationWindow(phase: Phase): Promise<CompendiumMigrationModal> {
		let resolveRun!: (r: MigrationReport) => void;
		let rejectRun!: (e: unknown) => void;
		const noop = jest.fn();
		const modal = new CompendiumMigrationModal(new App() as any, plan, {
			run: () => new Promise<MigrationReport>((resolve, reject) => { resolveRun = resolve; rejectRun = reject; }),
			decline: noop, syncAnyway: noop, finishRemaining: noop, syncAfter: noop, dismissed: noop, failed: noop,
		});
		modal.open();
		if (phase === 'preview') return modal;
		modal.containerEl.querySelector<HTMLButtonElement>('[data-dse-control="migration.preview.move"]')!.click();
		if (phase === 'running') return modal;
		if (phase === 'error') rejectRun(new Error('vault write refused'));
		else resolveRun(fullReport(phase === 'stopped'));
		await settle();
		return modal;
	}
	const stampedIn = (el: Element): string[] =>
		Array.from(el.querySelectorAll('[data-dse-control]')).map((n) => n.getAttribute('data-dse-control') as string);

	afterEach(() => {
		document.body.innerHTML = '';
	});

	test('"Existing compendium folder found": both buttons are identified and in the manifest, nothing else in the dialog is interactive', () => {
		const modal = legacyWindow();
		expect(censusProblems(modal.containerEl, legacyIds, INTERACTIVE, false)).toEqual([]);
		expect(stampedIn(modal.containerEl)).toEqual(['sync.legacy.keep', 'sync.legacy.trash']);
		// the ids sit on the real <button>s a user presses, not on a wrapper
		for (const id of ['sync.legacy.keep', 'sync.legacy.trash']) {
			expect(modal.containerEl.querySelector(`[data-dse-control="${id}"]`)!.tagName).toBe('BUTTON');
		}
	});

	test.each(PHASES)('the migration window, %s phase: every interactive node is identified and the ids are exactly that phase\'s buttons', async (phase) => {
		const modal = await migrationWindow(phase);
		expect(censusProblems(modal.containerEl, migrationIds, INTERACTIVE, false)).toEqual([]);
		expect(stampedIn(modal.containerEl)).toEqual(EXPECTED[phase]);
	});

	test('a label that carries a number never reaches an id: "Move N file(s)" and "Finish moving the remaining N" are one id each', async () => {
		const preview = await migrationWindow('preview');
		const move = preview.containerEl.querySelector('[data-dse-control="migration.preview.move"]') as HTMLButtonElement;
		expect(move.getAttribute('aria-label')).toBe('Move 2 file(s)');
		const stopped = await migrationWindow('stopped');
		const finish = stopped.containerEl.querySelector('[data-dse-control="migration.stopped.finish"]') as HTMLButtonElement;
		expect(finish.getAttribute('aria-label')).toBe('Finish moving the remaining 7');
	});

	test('Stop keeps its id when it turns into the disabled "Stopping…" (the click-disabled pair addresses the same node)', async () => {
		const modal = await migrationWindow('running');
		const stop = modal.containerEl.querySelector('[data-dse-control="migration.running.stop"]') as HTMLButtonElement;
		stop.click();
		const after = modal.containerEl.querySelector('[data-dse-control="migration.running.stop"]') as HTMLButtonElement;
		expect(after).toBe(stop);
		expect(after.disabled).toBe(true);
		expect(after.getAttribute('aria-label')).toBe('Stopping…');
	});

	test('the census itself bites: an un-id\'d button in any window or phase, a button that lost its id, or an id outside the manifest is a finding', async () => {
		const windows: Array<[string, HTMLElement, ReadonlySet<string>]> = [
			['legacy window', legacyWindow().containerEl, legacyIds],
			...(await Promise.all(PHASES.map(async (phase): Promise<[string, HTMLElement, ReadonlySet<string>]> =>
				[`migration ${phase}`, (await migrationWindow(phase)).containerEl, migrationIds]))),
		];
		for (const [name, root, allowed] of windows) {
			expect({ name, findings: censusProblems(root, allowed, INTERACTIVE, false) }).toEqual({ name, findings: [] });
			// an un-id'd button injected into the body, and one into the footer
			const body = root.querySelector('.dse-modal__body') as HTMLElement;
			const rogue = body.appendChild(document.createElement('button'));
			expect({ name, findings: censusProblems(root, allowed, INTERACTIVE, false) }).toEqual({ name, findings: [expect.stringMatching(/^no data-dse-control: <button/)] });
			rogue.remove();
			const footerRogue = (root.querySelector('.dse-modal__footer') as HTMLElement).appendChild(document.createElement('button'));
			expect({ name, findings: censusProblems(root, allowed, INTERACTIVE, false) }).toEqual({ name, findings: [expect.stringMatching(/^no data-dse-control: <button/)] });
			footerRogue.remove();
			// an eventful node that is not a <button> at all (a div the page gave a tabindex)
			const tabbable = body.appendChild(Object.assign(document.createElement('div'), { tabIndex: 0 }));
			expect({ name, findings: censusProblems(root, allowed, INTERACTIVE, false) }).toEqual({ name, findings: [expect.stringMatching(/^no data-dse-control: <div/)] });
			tabbable.remove();
			// a button that lost its id
			const first = root.querySelector('[data-dse-control]') as HTMLElement;
			const id = first.getAttribute('data-dse-control') as string;
			first.removeAttribute('data-dse-control');
			expect({ name, findings: censusProblems(root, allowed, INTERACTIVE, false) }).toEqual({ name, findings: [expect.stringMatching(/^no data-dse-control: <button/)] });
			// an id the manifest does not declare
			first.setAttribute('data-dse-control', 'sync.not-a-control');
			expect({ name, findings: censusProblems(root, allowed, INTERACTIVE, false) }).toEqual({ name, findings: [expect.stringMatching(/id "sync\.not-a-control" is not in the manifest/)] });
			first.setAttribute('data-dse-control', id);
		}
	});

	test('the two windows never share an id: a legacy-window id is a finding inside the migration window and the other way round', async () => {
		const legacy = legacyWindow().containerEl;
		const migration = (await migrationWindow('preview')).containerEl;
		expect(censusProblems(legacy, migrationIds, INTERACTIVE, false).length).toBe(2);
		expect(censusProblems(migration, legacyIds, INTERACTIVE, false).length).toBe(3);
	});

	test('no dead manifest row: the ids drawn across both windows and every phase are exactly the manifests\' DOM ids; the dismissals are virtual and never stamped', async () => {
		const drawn = [
			...stampedIn(legacyWindow().containerEl),
			...(await Promise.all(PHASES.map(async (p) => stampedIn((await migrationWindow(p)).containerEl)))).flat(),
		];
		expect(new Set(drawn)).toEqual(new Set([...legacyIds, ...migrationIds]));
		expect(LEGACY_VIRTUAL).toEqual(['sync.legacy.escape', 'sync.legacy.x', 'sync.legacy.backdrop']);
		expect(MIGRATION_VIRTUAL).toEqual(['preview', 'running', 'summary', 'stopped', 'error'].flatMap((p) => [`migration.${p}.escape`, `migration.${p}.x`, `migration.${p}.backdrop`]));
		for (const id of [...LEGACY_VIRTUAL, ...MIGRATION_VIRTUAL, ...LEGACY_HOST, ...MIGRATION_HOST]) expect(drawn).not.toContain(id);
		// one virtual id per window, phase and way out, each with a kind that already exists (no `click:X` / `click:Backdrop`)
		for (const id of [...LEGACY_VIRTUAL, ...MIGRATION_VIRTUAL]) {
			const spec = (legacyWindowManifest.controls[id] ?? migrationWindowManifest.controls[id]);
			expect(spec.kinds).toEqual([id.endsWith('.escape') ? 'press:Escape' : 'click']);
		}
		// Obsidian's own X and backdrop: the shared host ids, with the kinds every modal manifest declares
		for (const m of [legacyWindowManifest, migrationWindowManifest]) {
			expect(m.controls['modal.close'].kinds).toEqual(['click', 'press:Escape']);
			expect(m.controls['modal.backdrop'].kinds).toEqual(['click']);
		}
	});

	test('every button the windows draw is declared with a click and Enter on the focused button, as the other modal manifests do (no Space)', () => {
		for (const id of [...legacyIds, ...migrationIds]) {
			const spec = legacyWindowManifest.controls[id] ?? migrationWindowManifest.controls[id];
			expect(spec.kinds).toEqual(expect.arrayContaining(['click', 'press:Enter']));
			expect(spec.kinds).not.toContain('press:Space');
		}
	});

	test('the entry points are owned by the SC-440 / SC-443 manifests and NOT re-declared by the window manifests', () => {
		expect(Object.keys(settingsManifest.controls)).toContain('settings.compendium.sync');
		expect(Object.keys(searchManifest.controls)).toContain('authoring.search.sync');
		for (const m of [legacyWindowManifest, migrationWindowManifest]) {
			expect(m.reach).toEqual([]);
			expect(Object.keys(m.controls)).not.toContain('settings.compendium.sync');
			expect(Object.keys(m.controls)).not.toContain('authoring.search.sync');
		}
	});

	test('the command manifest is exactly the sync / migration commands the plugin registers (the retired legacy alias is gone, no new one slipped in)', async () => {
		const app = new App();
		const plugin = new DrawSteelAdmonitionPlugin(app as never, { id: 'draw-steel-elements', version: 'test' } as never);
		await plugin.onload();
		const registered = (plugin as unknown as { commands: Array<{ id: string; name: string }> }).commands;
		const declaredAuthoring = new Set(idsOf(commandsManifest));
		const related = registered.filter((cmd) => /sync|migrat|compendium|download/i.test(cmd.id));
		// the compendium INSERT commands belong to the authoring manifest (SC-443); everything else that mentions sync / migration is ours
		const ours = related.filter((cmd) => !declaredAuthoring.has(`authoring.cmd.${cmd.id}`));
		expect(ours.map((cmd) => `sync.cmd.${cmd.id}`).sort()).toEqual(idsOf(syncCommandsManifest).sort());
		for (const cmd of ours) expect(cmd.name).toBe(SYNC_COMMANDS[cmd.id]);
		expect(registered.map((cmd) => cmd.id)).not.toContain('download-data-md-dse');
		for (const id of idsOf(syncCommandsManifest)) expect(syncCommandsManifest.controls[id].kinds).toEqual(['palette']);
	});
});
