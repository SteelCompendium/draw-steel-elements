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
import { App, Notice, Plugin } from '../mocks/obsidian';
import { staminaBarElement } from '../../src/elements/stamina-bar/definition';
import { initiativeElement } from '../../src/elements/initiative/definition';
import { undoNotice } from '../../src/framework/kit';
import { DSE_PREF_DESCRIPTORS } from '../../src/prefs/catalog';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';
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
import chromeManifest from '../../e2e/manifest/chrome';
import resetManifest from '../../e2e/manifest/reset-encounter-modal';
import { idsOf } from '../../e2e/manifest/surface';

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

	test('with a row editor open: the icon search, every icon choice, every duration chip, swatch, the custom colour input and every effect chip are identified', () => {
		const { content } = openConditions();
		content.querySelectorAll<HTMLElement>('[data-dse-control="cond.edit"]')[1].click();
		expect(censusProblems(content, conditionIds)).toEqual([]);
		expect(ids(content, 'cond.icon-search')).toBe(1);
		expect(ids(content, 'cond.icon')).toBeGreaterThan(1); // "Use default" plus the suggested icons
		expect(ids(content, 'cond.duration')).toBe(4);
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
