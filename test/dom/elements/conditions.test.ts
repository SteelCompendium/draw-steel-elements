// D7 Task 2 (spec §4.4) — ds-conditions through the REAL ElementPipeline: chips with
// icon/name/duration badge, "+ add condition" opening the (widened) AddConditionsModal
// with a plain ConditionHolder (not a fabricated Hero/CreatureInstance), remove ✕
// persisting, and a save-ends chip's d10 save via a seeded RollService (never
// NATIVE_DICE/Math.random in tests).
import * as fs from 'fs';
import * as path from 'path';
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import { createRenderContext } from '../../../src/framework/context';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { createElementRegistry } from '../../../src/framework/registry';
import type { RollService } from '../../../src/framework/roll/service';
import { resolveRoll } from '../../../src/framework/roll/engine';
import type { DiceSource, RollInput } from '../../../src/framework/roll/types';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin } from '../../mocks/obsidian';
import { conditionsElement } from '../../../src/elements/conditions/definition';
import { ConditionsPanelContainer } from '../../../src/elements/conditions/view';
import { DseModal } from '@/framework/kit';
import { registerFrameworkElementDefinitions } from 'main';
import { styleGuardFindings } from '../kit/styleGuard';
import conditionsYaml from '../../../src/elements/conditions/example.yaml';

/** Seeded RollService stub: replays `faces` afresh on every resolve()/roll() call —
 *  NEVER NATIVE_DICE (Math.random) in a test (rollTestHelpers.ts's convention). */
function stubService(faces: number[]): RollService {
	const seeded = (): DiceSource => {
		let i = 0;
		return { rollDie: () => faces[i++] ?? 1 };
	};
	return {
		resolve: (input: RollInput, dice?: DiceSource) => resolveRoll(input, dice ?? seeded()),
		roll: async (input: RollInput) => resolveRoll(input, seeded()),
		dice: seeded(),
		delegate: 'native',
	};
}

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-conditions', lineStart: 0, lineEnd: 4 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-conditions::0',
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

function makeDeps(roll: RollService = stubService([1])): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	const theme = createThemeService(prefs, plugin as any);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	const validation = createValidationService();
	const session = createSessionStore();
	return {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme,
		prefs,
		refs,
		validation,
		session,
		roll,
	};
}

async function renderConditions(
	source: string = conditionsYaml,
	hostOverrides: Partial<BlockHost> = {},
	roll?: RollService,
) {
	const pipeline = new ElementPipeline(makeDeps(roll));
	const host = makeHost(hostOverrides);
	await pipeline.run(conditionsElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { host, root };
}

// -- kit-DOM accessors --
const chips = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('.dse-cond-chip'));
const chipByName = (root: HTMLElement, name: string) =>
	chips(root).find((el) => el.querySelector('.dse-cond-chip__name')?.textContent === name) as HTMLElement;
const durationOf = (chip: HTMLElement) => chip.querySelector('.dse-cond-chip__duration')?.textContent ?? null;
const removeBtn = (chip: HTMLElement) => chip.querySelector('.dse-cond-chip__remove') as HTMLButtonElement | null;
const saveBtn = (chip: HTMLElement) => chip.querySelector('.dse-cond-chip__save') as HTMLButtonElement | null;
const saveResult = (chip: HTMLElement) => chip.querySelector('.dse-cond-chip__save-result')?.textContent ?? '';
const addBtn = (root: HTMLElement) => root.querySelector('.dse-cond-strip__add') as HTMLButtonElement | null;

describe('D7 Task 2: conditions ElementDefinition (spec §4.4)', () => {
	test('id/name/aliases/shape match the brief; persisted with serialize + schema', () => {
		expect(conditionsElement.id).toBe('conditions');
		expect(conditionsElement.aliases).toEqual(['ds-conditions', 'ds-cond']);
		expect(conditionsElement.shape).toBe('persisted');
		expect(conditionsElement.schema).toBeDefined();
		expect(conditionsElement.serialize).toBeDefined();
		expect(conditionsElement.autoResolveRefs).toBe(false);
	});

	test('createView returns a ConditionsPanelContainer', () => {
		const deps = makeDeps();
		const host = makeHost();
		const cx = createRenderContext({
			app: deps.app,
			plugin: deps.plugin,
			settings: deps.settings,
			host,
			theme: deps.theme,
			prefs: deps.prefs,
			refs: deps.refs,
			session: deps.session,
			roll: deps.roll,
		});
		expect(conditionsElement.createView(cx)).toBeInstanceOf(ConditionsPanelContainer);
	});

	test('registered by the framework registry; both aliases resolve to it', () => {
		const registry = createElementRegistry();
		registerFrameworkElementDefinitions(registry);
		expect(registry.get('conditions')?.id).toBe('conditions');
		expect(registry.get('ds-conditions')?.id).toBe('conditions');
		expect(registry.get('ds-cond')?.id).toBe('conditions');
	});
});

describe('D7 Task 2: three chips render with correct duration badges (example.yaml)', () => {
	test('root carries data-dse-element="conditions"; three chips render', async () => {
		const { root } = await renderConditions();
		expect(root.getAttribute('data-dse-element')).toBe('conditions');
		expect(chips(root)).toHaveLength(3);
	});

	test('Bleeding shows the "Save Ends" duration badge + a save-roll affordance', async () => {
		const { root } = await renderConditions();
		const chip = chipByName(root, 'Bleeding');
		expect(durationOf(chip)).toBe('Save Ends');
		expect(saveBtn(chip)).not.toBeNull();
	});

	test('Slowed shows the "EoT" duration badge and no save-roll affordance', async () => {
		const { root } = await renderConditions();
		const chip = chipByName(root, 'Slowed');
		expect(durationOf(chip)).toBe('EoT');
		expect(saveBtn(chip)).toBeNull();
	});

	test('Restrained (bare-string, no duration) shows no badge and no save-roll affordance', async () => {
		const { root } = await renderConditions();
		const chip = chipByName(root, 'Restrained');
		expect(durationOf(chip)).toBeNull();
		expect(saveBtn(chip)).toBeNull();
	});
});

describe('D7 Task 2: "+ add condition" opens AddConditionsModal with a plain ConditionHolder', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	test('constructs the REAL modal with {conditions}, never a fabricated Hero/CreatureInstance', async () => {
		// Spy on DseModal.prototype.open (a plain method, not a constructor — class
		// constructors can't be jest.spyOn'd for `new` without extra ceremony) so we can
		// recover the actual AddConditionsModal INSTANCE `open()` was called on, then
		// reflect its private `character` field — same "cast at the boundary" convention
		// as initiative.test.ts's `(modal as any).containerEl`. The modal is otherwise
		// completely REAL: unmocked construction, unmocked render.
		const openSpy = jest.spyOn(DseModal.prototype, 'open');
		const { root } = await renderConditions();

		addBtn(root)!.click();

		expect(openSpy).toHaveBeenCalledTimes(1);
		const holder = (openSpy.mock.instances[0] as unknown as { character: Record<string, unknown> }).character;
		// A ConditionHolder is EXACTLY {conditions}: no isHero/max_stamina/id/statblock —
		// the encounter-only fields a real Hero/CreatureInstance would carry.
		expect(Object.keys(holder)).toEqual(['conditions']);
		expect(holder).not.toHaveProperty('isHero');
		expect(holder).not.toHaveProperty('max_stamina');
		expect(holder).not.toHaveProperty('id');
		expect(Array.isArray(holder.conditions)).toBe(true);
		expect((holder.conditions as unknown[]).length).toBe(3);

		document.querySelectorAll('.dse-modal').forEach((el) => el.remove());
	});

	test('source hygiene: panel.ts never references Hero/CreatureInstance/isHero as a TYPE (only the ConditionHolder superset)', () => {
		const src = fs.readFileSync(path.join(__dirname, '../../../src/elements/conditions/panel.ts'), 'utf8');
		expect(src).not.toMatch(/[:<]\s*(Hero|CreatureInstance)\b/);
		expect(src).toMatch(/ConditionHolder/);
	});

	test('completing the real add flow (select Frightened, Add Conditions) adds a chip and persists', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderConditions();

		addBtn(root)!.click();
		const modalEl = document.body.lastElementChild as HTMLElement;
		(modalEl.querySelector('button[aria-label="Frightened"]') as HTMLElement).click();
		(modalEl.querySelector('.dse-modal__footer button[aria-label="Add Conditions"]') as HTMLElement).click();

		const rebuiltRoot = host.containerEl.firstElementChild as HTMLElement;
		expect(chips(rebuiltRoot)).toHaveLength(4);
		expect(chipByName(rebuiltRoot, 'Frightened')).toBeDefined();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toContain('frightened');

		jest.useRealTimers();
	});
});

describe('D7 Task 2: remove ✕ drops a chip and persists', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('removing Slowed leaves Bleeding + Restrained, rebuilds in place, and persists without it', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderConditions();

		removeBtn(chipByName(root, 'Slowed'))!.click();

		const rebuiltRoot = host.containerEl.firstElementChild as HTMLElement;
		expect(chips(rebuiltRoot)).toHaveLength(2);
		expect(chipByName(rebuiltRoot, 'Slowed')).toBeUndefined();
		expect(chipByName(rebuiltRoot, 'Bleeding')).toBeDefined();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).not.toContain('slowed');
		expect(host.replaceSource.mock.calls[0][0]).toContain('bleeding');
	});
});

describe('D7 Task 2: save-ends chip d10 save via a seeded RollService (never NATIVE_DICE)', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	test('rolling a 6+ shows the result AND ends the condition (removes + persists)', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderConditions(conditionsYaml, {}, stubService([6]));

		saveBtn(chipByName(root, 'Bleeding'))!.click();

		const rebuiltRoot = host.containerEl.firstElementChild as HTMLElement;
		expect(chips(rebuiltRoot)).toHaveLength(2);
		expect(chipByName(rebuiltRoot, 'Bleeding')).toBeUndefined();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).not.toContain('bleeding');
	});

	test('rolling below 6 shows the result and the condition STAYS (no write)', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderConditions(conditionsYaml, {}, stubService([3]));

		const chip = chipByName(root, 'Bleeding');
		saveBtn(chip)!.click();

		expect(saveResult(chip)).toContain('3');
		expect(chips(root)).toHaveLength(3);

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});
});

describe('D7 Task 2: canPersist=false — read-only renders WITHOUT write affordances (F1 §4.4)', () => {
	test('no add/remove buttons; rolls (view-only) still work; zero writes', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderConditions(conditionsYaml, { canPersist: false }, stubService([9]));

		expect(addBtn(root)).toBeNull();
		for (const chip of chips(root)) {
			expect(removeBtn(chip)).toBeNull();
		}
		const bleeding = chipByName(root, 'Bleeding');
		expect(saveBtn(bleeding)).not.toBeNull();

		saveBtn(bleeding)!.click();
		expect(saveResult(bleeding)).toContain('9');
		// A read-only save NEVER removes the condition, even on a 6+ roll (no write path).
		expect(chips(root)).toHaveLength(3);

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).not.toHaveBeenCalled();
		jest.useRealTimers();
	});
});

describe('D7 Task 2: source hygiene + CSS contract', () => {
	test('CSS contract: .dse-cond-panel scoped under [data-dse-element="conditions"], tokens only', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		const block = sheet.match(/\[data-dse-element="conditions"\]\s+\.dse-cond-panel\s*\{[\s\S]*?\n\}\n\n/);
		expect(block).not.toBeNull();
		expect(block![0]).toMatch(/var\(--dse-/);
	});

	test('source hygiene: panel.ts/view.ts pass the shared kit style guard (no inline color, no color literals)', () => {
		const panelSrc = fs.readFileSync(path.join(__dirname, '../../../src/elements/conditions/panel.ts'), 'utf8');
		const viewSrc = fs.readFileSync(path.join(__dirname, '../../../src/elements/conditions/view.ts'), 'utf8');
		expect(styleGuardFindings(panelSrc)).toEqual([]);
		expect(styleGuardFindings(viewSrc)).toEqual([]);
	});
});
