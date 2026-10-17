// SC-408 coverage check (a): the jsdom census for the e2e pilot surfaces. No Obsidian needed, runs
// in CI with the rest of jest. It mounts each pilot surface through its real pipeline / modal and
// fails when
//   - an interactive node (button, input, select, textarea, [role=button|slider], [tabindex],
//     [contenteditable]) has no `data-dse-control`, or
//   - any `data-dse-control` id is not declared in the surface's e2e manifest
//     (e2e/manifest/*.ts, the same files the e2e exercised-set gate reads).
// Framework chrome (the collapse / authoring toolbar, `[data-dse-chrome-item]`) is a separate
// surface and is excluded. Initiative is scoped to its stamina entry points, not the whole tracker.
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
import { App, Notice, Plugin } from '../mocks/obsidian';
import { staminaBarElement } from '../../src/elements/stamina-bar/definition';
import { initiativeElement } from '../../src/elements/initiative/definition';
import { undoNotice } from '../../src/framework/kit';
import { DSE_PREF_DESCRIPTORS } from '../../src/prefs/catalog';
import { FRAMEWORK_V2_DEPENDENCY_SCHEMAS } from 'main';
import staminaBarManifest from '../../e2e/manifest/stamina-bar';
import modalManifest from '../../e2e/manifest/stamina-edit-modal';
import { idsOf } from '../../e2e/manifest/surface';

const INTERACTIVE = 'button, input, select, textarea, [role="button"], [role="slider"], [tabindex], [contenteditable]';
const CHROME = '[data-dse-chrome-item]';

/** Problems found under `scope`: un-id'd interactive nodes and ids the manifest does not declare. */
function censusProblems(scope: Element, allowed: ReadonlySet<string>, interactive = INTERACTIVE): string[] {
	const problems: string[] = [];
	const describe = (el: Element): string => `<${el.tagName.toLowerCase()} class="${el.className}"> ${(el.textContent ?? '').trim().slice(0, 30)}`;
	scope.querySelectorAll(interactive).forEach((el) => {
		if (el.closest(CHROME)) return;
		if (!el.hasAttribute('data-dse-control')) problems.push(`no data-dse-control: ${describe(el)}`);
	});
	scope.querySelectorAll('[data-dse-control]').forEach((el) => {
		const id = el.getAttribute('data-dse-control') as string;
		if (!allowed.has(id)) problems.push(`id "${id}" is not in the manifest: ${describe(el)}`);
	});
	return problems;
}

const barIds = new Set(idsOf(staminaBarManifest));
const modalIds = new Set(idsOf(modalManifest));

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
});

describe('SC-408 census: initiative stamina entry points', () => {
	test('hero numeric control + row bar, creature detail control + bar, and every roster cell are identified', async () => {
		const host = makeHost('ds-initiative', 'Encounter.md');
		await new ElementPipeline(makeDeps()).run(initiativeElement, TRACKER, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		// Scope: the stamina entry points only, not the whole tracker (malice, conditions, ... are
		// other surfaces). Everything the tracker stamps with an id must still be in the manifest.
		const entryPoints = 'button.dse-init__stamina, .dse-init__bar.dse-stamina--clickable, button.dse-init__cell';
		expect(censusProblems(root, new Set(idsOf(modalManifest)), entryPoints)).toEqual([]);
		for (const id of ['init.hero.stamina', 'init.hero.bar', 'init.detail.stamina', 'init.detail.bar', 'init.cell.stamina']) {
			expect(root.querySelector(`[data-dse-control="${id}"]`)).not.toBeNull();
		}
		expect(root.querySelectorAll('[data-dse-control="init.cell.stamina"]')).toHaveLength(3);
	});
});
