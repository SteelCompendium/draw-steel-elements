// SC-569 — which squad's pool modal is this? Drives the REAL tracker (view + pipeline) and opens the pool modal
// through each of its routes (a roster cell's double-click, the detail row's stamina readout and bar), asserting the
// title the user reads. The helper's own cases live in test/dom/views/minion-stamina-pool-modal.test.ts; this file
// proves the squad the tracker hands the modal is the one that was opened (identity, tracker order), and that only
// squads the roster draws are counted.
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin } from '../../mocks/obsidian';
import { initiativeElement } from '../../../src/elements/initiative/definition';

function makeHost() {
	const containerEl = document.createElement('div');
	document.body.appendChild(containerEl);
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Encounter.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-initiative', lineStart: 0, lineEnd: 40 }),
		replaceSource: jest.fn(async (_newSource: string) => true),
		blockKey: () => 'Encounter.md::ds-initiative::0',
	};
	return host as BlockHost & { containerEl: HTMLElement };
}

function makeDeps(): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	prefs.describe(DSE_PREF_DESCRIPTORS);
	return {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme: createThemeService(prefs, plugin as any),
		prefs,
		refs: createReferenceService(app as any, DEFAULT_SETTINGS),
		validation: createValidationService(),
		session: createSessionStore(),
		roll: createRollService(prefs),
	};
}

async function renderInit(source: string): Promise<HTMLElement> {
	const host = makeHost();
	await new ElementPipeline(makeDeps()).run(initiativeElement, source, host);
	return host.containerEl.firstElementChild as HTMLElement;
}

/** A tracker with one group "River"; each creature line is a flow-mapping body, e.g. `name: "Flow", amount: 2, squad_role: minion`. */
const river = (...creatures: string[]): string =>
	['heroes: []', 'enemy_groups:', '  - name: "River"', '    is_squad: true', '    creatures:', ...creatures.map((c) => `      - {${c}, max_stamina: 4}`)].join('\n');
const flow = (amount = 2, name = 'Flow') => `name: ${JSON.stringify(name)}, amount: ${amount}, squad_role: minion`;
const boss = 'name: "Boss", amount: 1, squad_role: captain';

const titles = (): string[] => Array.from(document.querySelectorAll('.dse-modal__title-text')).map((e) => e.textContent ?? '');
const lastTitle = (): string | undefined => titles().pop();
const closeAll = (): void => document.querySelectorAll('.modal-container, .modal').forEach((m) => m.remove());
const cell = (root: HTMLElement, key: string) => root.querySelector(`.dse-init__cell[data-instance-key="${key}"]`) as HTMLElement;
const cellKeys = (root: HTMLElement): string[] => Array.from(root.querySelectorAll('.dse-init__cell')).map((c) => c.getAttribute('data-instance-key') ?? '');

/** Double-click the roster cell and return the modal title it opened (the modal is removed again). */
function titleFromCell(root: HTMLElement, key: string): string | undefined {
	cell(root, key).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
	const t = lastTitle();
	closeAll();
	return t;
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('SC-569 the pool modal title, through the real tracker', () => {
	test('[Flow, Boss(captain), Flow]: every cell of each squad opens that squad, the captain between them is not a squad', async () => {
		const root = await renderInit(river(flow(), boss, flow()));
		expect(cellKeys(root)).toEqual(['0-1', '0-2', '1-1', '2-1', '2-2']);
		expect(titleFromCell(root, '0-1')).toBe('River - Flow (squad 1) - Minion Stamina Pool');
		expect(titleFromCell(root, '0-2')).toBe('River - Flow (squad 1) - Minion Stamina Pool');
		expect(titleFromCell(root, '1-1')).toBe('Boss Stamina'); // the captain opens the creature stamina modal, not a pool
		expect(titleFromCell(root, '2-1')).toBe('River - Flow (squad 2) - Minion Stamina Pool');
		expect(titleFromCell(root, '2-2')).toBe('River - Flow (squad 2) - Minion Stamina Pool');
	});

	test('the detail row opens the SELECTED squad: select squad 2, then its stamina readout and its bar both say "(squad 2)"', async () => {
		const root = await renderInit(river(flow(), flow()));
		cell(root, '1-1').click(); // selects squad 2's first minion; the detail row now shows it
		(root.querySelector('.dse-init__detail .dse-init__stamina') as HTMLElement).click();
		expect(lastTitle()).toBe('River - Flow (squad 2) - Minion Stamina Pool');
		closeAll();
		const bar = root.querySelector('[data-dse-control="init.detail.bar"]') as HTMLElement;
		expect(bar).not.toBeNull();
		bar.click();
		expect(lastTitle()).toBe('River - Flow (squad 2) - Minion Stamina Pool');
	});

	test('a squad with amount 0 draws no cells and is not counted: the one squad on screen keeps the plain title', async () => {
		const root = await renderInit(river(flow(0), flow(2)));
		expect(cellKeys(root)).toEqual(['1-1', '1-2']); // nothing is drawn for the amount-0 squad
		expect(titleFromCell(root, '1-1')).toBe('River - Minion Stamina Pool');
	});

	test('a squad with amount 0 beside two others: the two on screen are numbered 1 and 2 (the empty one takes no number)', async () => {
		const root = await renderInit(river(flow(0), flow(2), flow(2)));
		expect(titleFromCell(root, '1-1')).toBe('River - Flow (squad 1) - Minion Stamina Pool');
		expect(titleFromCell(root, '2-1')).toBe('River - Flow (squad 2) - Minion Stamina Pool');
	});

	// A creature `name:` written as a bare YAML number parses as a NUMBER (the tracker only coerces its own top-level name),
	// so the comparison must not assume a string; the title reads the number as written.
	test('a creature named with a bare YAML number (name: 300) opens its pool modal: "River - 300 - Minion Stamina Pool"', async () => {
		const root = await renderInit(river('name: 300, amount: 2, squad_role: minion', flow()));
		expect(titleFromCell(root, '0-1')).toBe('River - 300 - Minion Stamina Pool');
		expect(titleFromCell(root, '1-1')).toBe('River - Flow - Minion Stamina Pool');
	});

	test('a numeric name and the same number quoted are the same creature: numbered (squad 1) and (squad 2)', async () => {
		const root = await renderInit(river('name: 300, amount: 2, squad_role: minion', flow(2, '300')));
		expect(titleFromCell(root, '0-1')).toBe('River - 300 (squad 1) - Minion Stamina Pool');
		expect(titleFromCell(root, '1-1')).toBe('River - 300 (squad 2) - Minion Stamina Pool');
	});
});
