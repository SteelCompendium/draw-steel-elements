// Plan 09 Task 9 (D2 §3.11) — the Initiative Tracker redesigned onto the D2 kit: the
// a11y epicenter. Every legacy click-<div> is now a REAL labelled kit control
// (`.dse-init__turn` iconButton, kit malice stepper, `.dse-init__cell` buttons,
// `.dse-init__stamina` buttons, `.dse-cond` buttons), colors ride the --dse-* tokens
// ([data-taken]/[data-selected]/[data-state] — zero inline color), and the tests below
// pin CB-7 (stepper updates the value IN PLACE, chevron buttons survive) and CB-6
// (cells tagged data-instance-key so the targeted refresh hits the RIGHT cell).
// Driven through the REAL ElementPipeline (the Plan 06 harness, selectors migrated).
//
// BYTE-COMPAT oracle (UNCHANGED from Plan 06): the legacy writer
// (CodeBlocks.updateInitiativeTracker) did exactly
// `stringifyYaml(<the live materialized EncounterData>).trim()` — so expected bytes are
// always `serialize(parse(parseYaml(src)) + the same mutation)`, the same expression on
// the same object shape (pinned against legacy by initiative-serialize.test.ts).
// Every interaction must persist EXACTLY ONCE per user action (debounced write-behind).
import * as fs from 'fs';
import * as path from 'path';
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage, PrefDescriptor } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { createElementRegistry } from '../../../src/framework/registry';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, parseYaml, makeFakeContext } from '../../mocks/obsidian';
import { initiativeElement } from '../../../src/elements/initiative/definition';
import { InitiativeView } from '../../../src/elements/initiative/view';
import { parse, serialize, resetEncounter } from '../../../src/elements/initiative/model';
import type { Condition, EncounterData } from '../../../src/elements/initiative/model';
import { resolveInitiativeRefs } from '../../../src/elements/initiative/resolveRefs';
import DrawSteelAdmonitionPlugin, { registerFrameworkElementDefinitions } from 'main';
import { styleGuardFindings } from '../kit/styleGuard';
import quickStart from '../../fixtures/initiative/quick-start.yaml';
import squad from '../../fixtures/initiative/squad.yaml';
import statblockRefs from '../../fixtures/initiative/statblock-refs.yaml';

const IT_ALIASES = ['ds-it', 'ds-init', 'ds-initiative', 'ds-initiative-tracker'] as const;

/** The exact bytes the LEGACY writer would put back into the note for this (ref-free)
 *  source after `mutate` — the byte-compat oracle. */
function legacyBytes(source: string, mutate?: (m: EncounterData) => void): string {
	const model = parse(parseYaml(source), source);
	mutate?.(model);
	return serialize(model);
}

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Encounter.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-initiative', lineStart: 0, lineEnd: 30 }),
		replaceSource,
		blockKey: () => 'Encounter.md::ds-initiative::0',
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

/** Real service instances (negotiation.test.ts convention), plus the mock App exposed so
 *  tests can seed the vault (statblock notes, the default token image). */
function makeEnv(): { deps: ElementPipelineDeps; app: App } {
	const app = new App();
	// Seed the default token image so Images.resolveImageSourceOrDefault's fallback
	// resolves (avoids CB-14 unhandled rejections during render — same seeding as the
	// legacy initiative-render.test.ts).
	app.vault.setFile('Media/token_1.png', '');
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	const theme = createThemeService(prefs, plugin as any);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	const validation = createValidationService();
	const session = createSessionStore();
	return {
		deps: {
			app: app as any,
			plugin: plugin as any,
			settings: DEFAULT_SETTINGS,
			theme,
			prefs,
			refs,
			validation,
			session,
			roll: createRollService(prefs),
		},
		app,
	};
}

async function renderInit(source: string, hostOverrides: Partial<BlockHost> = {}) {
	const { deps, app } = makeEnv();
	const pipeline = new ElementPipeline(deps);
	const host = makeHost(hostOverrides);
	await pipeline.run(initiativeElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { pipeline, host, root, app, deps };
}

/** The most recently opened modal's container (the obsidian-mock Modal appends to body). */
const lastModal = (): HTMLElement => document.body.lastElementChild as HTMLElement;

/** MinionStaminaPoolModal helper: type damage×minions into the Apply row and click Apply.
 *  (Task-3 unified modal DOM: .dse-sedit__apply-input inputs + a kit iconButton.) */
function applyPoolDamage(modalEl: HTMLElement, damage: number, minions: number): void {
	const inputs = modalEl.querySelectorAll<HTMLInputElement>('.dse-sedit__apply-input');
	inputs[0].value = String(damage);
	inputs[1].value = String(minions);
	(modalEl.querySelector('button[aria-label="Apply Damage"]') as HTMLElement).click();
}

/** The unified stamina modal's footer apply button (kit accent iconButton). */
function modalApplyBtn(modalEl: HTMLElement): HTMLButtonElement {
	return modalEl.querySelector('.dse-modal__footer .dse-btn--accent') as HTMLButtonElement;
}

/** Commit a value into the unified modal's kit stepper input (commits on Enter/blur —
 *  the legacy modal committed on every input event). */
function commitStepperValue(modalEl: HTMLElement, value: number): void {
	const input = modalEl.querySelector('.dse-stepper__input') as HTMLInputElement;
	input.value = String(value);
	input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
}

/** The Lucide icon of a control: kit buttons carry it on the .dse-btn__icon child;
 *  read-only static glyph spans carry it on a .dse-init__turn-glyph child or on the
 *  element itself (mock setIcon stamps data-icon). */
function iconOf(el: Element): string | null {
	return el.getAttribute('data-icon') ?? el.querySelector('[data-icon]')?.getAttribute('data-icon') ?? null;
}

afterEach(() => {
	jest.useRealTimers();
	document.querySelectorAll('.modal-container').forEach((el) => el.remove());
});

describe('T-4: initiative ElementDefinition', () => {
	test('id/name/aliases/shape match the brief; persisted with serialize, NO schema, field-scoped resolveRefs', () => {
		expect(initiativeElement.id).toBe('initiative');
		expect(initiativeElement.name).toBe('Initiative tracker');
		expect(initiativeElement.aliases).toEqual([...IT_ALIASES]);
		expect(initiativeElement.shape).toBe('persisted');
		expect(initiativeElement.schema).toBeUndefined();
		expect(initiativeElement.autoResolveRefs).toBe(false);
		expect(initiativeElement.serialize).toBeDefined();
		expect(initiativeElement.resolveRefs).toBe(resolveInitiativeRefs);
	});

	test('createView returns an InitiativeView', () => {
		const { deps } = makeEnv();
		const host = makeHost();
		const cx = {
			app: deps.app,
			plugin: deps.plugin,
			settings: deps.settings,
			host,
			mode: host.mode,
			theme: deps.theme,
			prefs: deps.prefs,
			refs: deps.refs,
			session: deps.session,
		};
		expect(initiativeElement.createView(cx as any)).toBeInstanceOf(InitiativeView);
	});

});

describe('T-5: registered EXACTLY ONCE — framework registry owns ds-it*, RegisterElements.ts does not', () => {
	test('registerFrameworkElementDefinitions registers initiative; every alias resolves to it', () => {
		const registry = createElementRegistry();
		registerFrameworkElementDefinitions(registry);

		expect(registry.get('initiative')?.id).toBe('initiative');
		for (const alias of IT_ALIASES) {
			expect(registry.get(alias)?.id).toBe('initiative');
		}
	});

	test('through the REAL onload(): each ds-it* alias gets exactly one registerMarkdownCodeBlockProcessor call (no legacy double-registration)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		const registerSpy = jest.spyOn(plugin, 'registerMarkdownCodeBlockProcessor');

		await plugin.onload();

		for (const alias of IT_ALIASES) {
			const calls = registerSpy.mock.calls.filter(([language]) => language === alias);
			expect(calls).toHaveLength(1);
		}
		expect(plugin.frameworkV2!.registry.get('ds-it')?.id).toBe('initiative');

		registerSpy.mockRestore();
	});
});

describe('T-9: kit DOM through the REAL ElementPipeline (quick-start fixture)', () => {
	test('structure: root stamp, .dse-init grammar, hero rows + names, enemy group, malice stepper, detail row, cell grid', async () => {
		const { root } = await renderInit(quickStart);

		expect(root.getAttribute('data-dse-element')).toBe('initiative');
		expect(root.querySelector('.dse-init')).not.toBeNull();

		// Action bar (writable host): a kit buttonRow of REAL labelled buttons. D8 Task 9:
		// "Reset Round" was folded into the Malice panel's "Advance round" (spec §7.2 — a
		// strict superset), so the action bar now carries only the destructive whole-
		// encounter reset (see turnEconomy.test.ts for Advance round's own coverage).
		const actionbar = root.querySelector('.dse-init__actionbar') as HTMLElement;
		expect(actionbar).not.toBeNull();
		expect(actionbar.classList.contains('dse-btn-row')).toBe(true);
		expect(actionbar.querySelector('button[aria-label="Reset Round"]')).toBeNull();
		const resetEnc = actionbar.querySelector('button[aria-label="Reset Encounter State"]') as HTMLButtonElement;
		expect(resetEnc).not.toBeNull();
		expect(resetEnc.getAttribute('type')).toBe('button');
		expect(resetEnc.querySelector('.dse-btn__text')!.textContent).toBe('Reset Encounter State');

		// Heroes.
		expect(root.querySelectorAll('.dse-init__group--heroes .dse-init__entry')).toHaveLength(2);
		const names = [...root.querySelectorAll('.dse-init__group--heroes .dse-init__name')].map(
			(n) => n.textContent,
		);
		expect(names).toEqual(['Frodo Baggins', 'Samwise Gamgee']);
		const heroStamina = [...root.querySelectorAll('.dse-init__group--heroes .dse-init__stamina')].map(
			(n) => n.textContent,
		);
		expect(heroStamina).toEqual(['80/80', '90/90']);

		// Enemy group + malice (kit stepper — value formatted exactly as legacy).
		expect(root.querySelectorAll('.dse-init__group--enemies .dse-init__entry')).toHaveLength(1);
		expect(root.querySelector('.dse-init__grouphead h4')!.textContent).toBe('Mordor Forces');
		expect(root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 5');
		expect(root.querySelectorAll('.dse-init__malice .dse-stepper__btn')).toHaveLength(2);

		// Detail row defaults to the first instance; grid renders 4 orcs + 1 troll.
		expect(root.querySelector('.dse-init__detail .dse-init__name')!.textContent).toBe('Orc #1');
		expect(root.querySelector('.dse-init__detail .dse-init__stamina')!.textContent).toBe('40/40');
		expect(root.querySelectorAll('.dse-init__cell')).toHaveLength(5);
	});

	test('a11y: turn indicators are real toggle buttons; cells real aria-pressed buttons tagged data-instance-key (CB-6); stamina/malice/conditions labelled', async () => {
		const { root } = await renderInit(quickStart);

		// Turn indicators: REAL <button type=button aria-pressed> with an accessible
		// name and the kit tooltip — check/dot glyph, [data-taken] for CSS.
		const turns = [...root.querySelectorAll('.dse-init__turn')] as HTMLElement[];
		expect(turns).toHaveLength(3); // 2 heroes + 1 enemy group
		for (const turn of turns) {
			expect(turn.tagName).toBe('BUTTON');
			expect(turn.getAttribute('type')).toBe('button');
			expect(turn.getAttribute('aria-pressed')).toBe('false');
			expect(turn.hasAttribute('data-taken')).toBe(false);
			expect(iconOf(turn)).toBe('dot');
			expect(turn.getAttribute('data-tooltip')).toBe('Toggle to mark turn taken');
		}
		expect(turns[0].getAttribute('aria-label')).toBe('Toggle turn taken: Frodo Baggins');
		expect(turns[2].getAttribute('aria-label')).toBe('Toggle turn taken: Mordor Forces');

		// Malice: the kit stepper — role=group, labelled ± buttons, aria-live value.
		const malice = root.querySelector('.dse-init__malice .dse-stepper') as HTMLElement;
		expect(malice.getAttribute('role')).toBe('group');
		expect(malice.getAttribute('aria-label')).toBe('Malice');
		expect(malice.querySelector('button[aria-label="Increase Malice"]')).not.toBeNull();
		expect(malice.querySelector('button[aria-label="Decrease Malice"]')).not.toBeNull();
		expect(root.querySelector('.dse-init__malice-value')!.getAttribute('aria-live')).toBe('polite');

		// Grid cells: REAL toggle buttons carrying data-instance-key (CB-6).
		const cells = [...root.querySelectorAll('.dse-init__cell')] as HTMLElement[];
		expect(cells.map((c) => c.getAttribute('data-instance-key'))).toEqual([
			'0-1',
			'0-2',
			'0-3',
			'0-4',
			'1-1',
		]);
		for (const cell of cells) {
			expect(cell.tagName).toBe('BUTTON');
			expect(cell.getAttribute('aria-pressed')).toBe('false'); // nothing selected yet
			expect(cell.hasAttribute('data-selected')).toBe(false);
		}
		expect(cells[0].getAttribute('aria-label')).toBe('Select Orc #1');
		expect(cells[4].getAttribute('aria-label')).toBe('Select Troll #1');

		// Stamina numbers: real labelled buttons (open the edit modal), aria-live.
		const heroStamina = root.querySelector('.dse-init__group--heroes .dse-init__stamina') as HTMLElement;
		expect(heroStamina.tagName).toBe('BUTTON');
		expect(heroStamina.getAttribute('aria-label')).toBe('Edit stamina: Frodo Baggins');
		expect(heroStamina.getAttribute('aria-live')).toBe('polite');
		const detailStamina = root.querySelector('.dse-init__detail .dse-init__stamina') as HTMLElement;
		expect(detailStamina.tagName).toBe('BUTTON');
		expect(detailStamina.getAttribute('aria-label')).toBe('Edit stamina: Orc #1');

		// Add-condition affordance: a real labelled kit button.
		const add = root.querySelector('.dse-init__group--heroes .dse-cond--add') as HTMLElement;
		expect(add.tagName).toBe('BUTTON');
		expect(add.getAttribute('aria-label')).toBe('Add Condition');
	});

	test('squad fixture: condition icons are real buttons riding applyConditionColor (validated custom property, NEVER el.style.color)', async () => {
		const { root } = await renderInit(squad);

		// Aragorn: grabbed (hand) + bleeding (droplet, crimson) + the add affordance.
		const heroConditions = [
			...root.querySelectorAll('.dse-init__group--heroes .dse-cond'),
		] as HTMLElement[];
		expect(heroConditions).toHaveLength(2);
		expect(heroConditions[0].tagName).toBe('BUTTON');
		expect(iconOf(heroConditions[0])).toBe('hand');
		expect(heroConditions[0].getAttribute('aria-label')).toBe('Remove condition: Grabbed');
		expect(heroConditions[0].getAttribute('data-tooltip')).toBe('Grabbed');
		expect(iconOf(heroConditions[1])).toBe('droplet');
		// The user color arrives as the VALIDATED --dse-condition-color property (T8
		// helper) — never an inline color style.
		expect(heroConditions[1].style.getPropertyValue('--dse-condition-color')).toBe('crimson');
		expect(heroConditions[1].style.color).toBe('');
		expect(root.querySelector('.dse-init__group--heroes .dse-cond--add')).not.toBeNull();

		// Detail row defaults to Goblin #1 (minion): pool display "pool/max*amount (max)".
		expect(root.querySelector('.dse-init__detail .dse-init__name')!.textContent).toBe('Goblin #1');
		expect(root.querySelector('.dse-init__detail .dse-init__stamina')!.textContent).toBe('20/20 (4)');

		// Grid: 5 minions + 1 captain.
		const cells = root.querySelectorAll('.dse-init__cell');
		expect(cells).toHaveLength(6);
		expect(cells[5].querySelector('.dse-init__cell-stamina')!.textContent).toBe('40/40');
	});

	test('condition color is VALIDATED (invalid input cleared) and effect classes come from the known vocabulary only', async () => {
		const source = [
			'heroes:',
			'  - name: "Aragorn"',
			'    max_stamina: 100',
			'    conditions:',
			'      - key: bleeding',
			'        color: "not a color"',
			'        effect: glow',
			'      - key: grabbed',
			'        color: "#ff0000"',
			'        effect: whatever',
			'enemy_groups:',
			'  - name: "Squad"',
			'    creatures:',
			'      - name: "Goblin"',
			'        max_stamina: 4',
			'        amount: 1',
			'malice:',
			'  value: 0',
		].join('\n');
		const { root } = await renderInit(source);

		const conds = [...root.querySelectorAll('.dse-cond')] as HTMLElement[];
		expect(conds.length).toBeGreaterThanOrEqual(2);
		// Invalid color REJECTED (property cleared → CSS var() fallback), valid effect applied.
		expect(conds[0].style.getPropertyValue('--dse-condition-color')).toBe('');
		expect(conds[0].classList.contains('condition-effect-glow')).toBe(true);
		// Valid color applied as the property; unknown effect adds NO class.
		expect(conds[1].style.getPropertyValue('--dse-condition-color')).toBe('#ff0000');
		expect([...conds[1].classList].some((c) => c.startsWith('condition-effect-'))).toBe(false);
		// Never inline color.
		for (const cond of conds) expect(cond.style.color).toBe('');
	});

	test('stamina numbers carry [data-state] (healthy/dying) instead of inline red/green', async () => {
		const source = [
			'heroes:',
			'  - name: "Temp"',
			'    max_stamina: 100',
			'    current_stamina: 80',
			'    temp_stamina: 11',
			'  - name: "Down"',
			'    max_stamina: 50',
			'    current_stamina: -3',
			'  - name: "Fine"',
			'    max_stamina: 50',
			'enemy_groups:',
			'  - name: "Squad"',
			'    creatures:',
			'      - name: "Goblin"',
			'        max_stamina: 4',
			'        amount: 1',
			'malice:',
			'  value: 0',
		].join('\n');
		const { root } = await renderInit(source);

		const stamina = [
			...root.querySelectorAll('.dse-init__group--heroes .dse-init__stamina'),
		] as HTMLElement[];
		expect(stamina.map((s) => s.textContent)).toEqual(['80(+11)/100', '-3/50', '50/50']);
		expect(stamina[0].getAttribute('data-state')).toBe('healthy');
		expect(stamina[1].getAttribute('data-state')).toBe('dying');
		expect(stamina[2].hasAttribute('data-state')).toBe(false);
		// SC-5: state is the attribute + token, never an inline color.
		for (const s of stamina) {
			expect(s.style.color).toBe('');
			expect(s.getAttribute('style') ?? '').not.toMatch(/color/);
		}
	});

	test('portraits pref (D4-owned): reflected onto the root as data-dse-portraits and live-updated', async () => {
		const { deps } = makeEnv();
		// D4 owns the descriptor catalog; registering one here exercises the SAME
		// reflection path the pipeline already runs on every element root.
		deps.prefs.describe([
			{ key: 'portraits', default: 'on', attr: 'portraits' },
		] as unknown as readonly PrefDescriptor[]);
		const pipeline = new ElementPipeline(deps);
		const host = makeHost();
		await pipeline.run(initiativeElement, quickStart, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(root.getAttribute('data-dse-portraits')).toBe('on');
		await (deps.prefs.set as (k: string, v: unknown) => Promise<void>)('portraits', 'off');
		expect(root.getAttribute('data-dse-portraits')).toBe('off');
	});

	test('rendering performs ZERO writes (persist only ever runs on user mutation)', async () => {
		jest.useFakeTimers();
		const { host } = await renderInit(quickStart);
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});
});

describe('T-9: persisted mutations — exactly ONE debounced write each, byte-compatible with the legacy writer', () => {
	test('hero turn indicator: in-place aria-pressed/[data-taken]/check toggle, then one write with has_taken_turn: true', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		const indicator = root.querySelector('.dse-init__group--heroes .dse-init__turn') as HTMLElement;
		indicator.click();

		// In-place targeted update, still inside the debounce window.
		expect(indicator.getAttribute('aria-pressed')).toBe('true');
		expect(indicator.hasAttribute('data-taken')).toBe(true);
		expect(iconOf(indicator)).toBe('check');
		expect(host.replaceSource).not.toHaveBeenCalled();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(quickStart, (m) => {
				m.heroes[0].has_taken_turn = true;
			}),
		);

		// Toggling back is in-place too (dot glyph, pressed off).
		indicator.click();
		expect(indicator.getAttribute('aria-pressed')).toBe('false');
		expect(indicator.hasAttribute('data-taken')).toBe(false);
		expect(iconOf(indicator)).toBe('dot');
	});

	test('enemy-group turn indicator: one write with the group has_taken_turn: true', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		(root.querySelector('.dse-init__group--enemies .dse-init__turn') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(quickStart, (m) => {
				m.enemy_groups[0].has_taken_turn = true;
			}),
		);
	});

	test('malice kit stepper (CB-7): value updates IN PLACE, both ± buttons survive, rapid clicks coalesce into one write', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		const up = root.querySelector('.dse-init__malice button[aria-label="Increase Malice"]') as HTMLElement;
		const down = root.querySelector('.dse-init__malice button[aria-label="Decrease Malice"]') as HTMLElement;
		up.click();
		up.click();
		down.click();

		expect(root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 6');
		// CB-7: the legacy container.setText wiped the chevrons on first click; the kit
		// stepper updates ONLY its value node — the ± buttons stay alive and attached.
		expect(root.querySelectorAll('.dse-init__malice .dse-stepper__btn')).toHaveLength(2);
		expect(root.contains(up)).toBe(true);
		expect(root.contains(down)).toBe(true);

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(quickStart, (m) => {
				m.malice.value = 6;
			}),
		);
	});

	test('hero stamina modal: edit -> in-place display refresh -> one write with the edited stamina', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		const staminaEl = root.querySelector('.dse-init__group--heroes .dse-init__stamina') as HTMLElement;
		staminaEl.click();

		const modalEl = lastModal();
		expect(modalEl.classList.contains('modal-container')).toBe(true);
		expect(modalEl.querySelector('.dse-modal__title')!.textContent).toBe('Frodo Baggins Stamina');

		commitStepperValue(modalEl, 50);
		modalApplyBtn(modalEl).click();

		expect(staminaEl.textContent).toBe('50/80'); // targeted update, no rebuild
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(quickStart, (m) => {
				m.heroes[0].current_stamina = 50;
			}),
		);
	});

	test('creature stamina modal (detail row): edit -> detail + its own grid cell refresh -> one write on the instance', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		const staminaEl = root.querySelector('.dse-init__detail .dse-init__stamina') as HTMLElement;
		staminaEl.click();

		const modalEl = lastModal();
		commitStepperValue(modalEl, 10);
		modalApplyBtn(modalEl).click();

		expect(staminaEl.textContent).toBe('10/40');
		// CB-6: the grid-cell sync targets the instance's own cell by data-instance-key.
		expect(
			root.querySelector('.dse-init__cell[data-instance-key="0-1"] .dse-init__cell-stamina')!
				.textContent,
		).toBe('10/40');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(quickStart, (m) => {
				m.enemy_groups[0].creatures[0].instances![0].current_stamina = 10;
			}),
		);
	});

	test('CB-6: the targeted refresh hits the RIGHT cell — the troll (key 1-1), where legacy nth-child(instance.id) hit Orc #1', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		// Select the troll: instance.id = 1, so the legacy nth-child(1) lookup resolved
		// to the FIRST cell (Orc #1) — the CB-6 bug.
		const trollCell = root.querySelector('.dse-init__cell[data-instance-key="1-1"]') as HTMLElement;
		trollCell.click();
		expect(root.querySelector('.dse-init__detail .dse-init__name')!.textContent).toBe('Troll #1');
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);

		// Edit the troll's stamina from the detail row.
		(root.querySelector('.dse-init__detail .dse-init__stamina') as HTMLElement).click();
		const modalEl = lastModal();
		commitStepperValue(modalEl, 100);
		modalApplyBtn(modalEl).click();

		// The troll's OWN cell refreshed; Orc #1's (the nth-child victim) untouched.
		expect(trollCell.querySelector('.dse-init__cell-stamina')!.textContent).toBe('100/150');
		expect(
			root.querySelector('.dse-init__cell[data-instance-key="0-1"] .dse-init__cell-stamina')!
				.textContent,
		).toBe('40/40');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(2);
		expect(host.replaceSource.mock.calls[1][0]).toBe(
			legacyBytes(quickStart, (m) => {
				m.enemy_groups[0].selectedInstanceKey = '1-1';
				m.enemy_groups[0].creatures[1].instances![0].current_stamina = 100;
			}),
		);
	});

	test('instance-cell select: aria-pressed/[data-selected] repaint in place, detail row rebuilt, one write persisting selectedInstanceKey', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		const cells = [...root.querySelectorAll('.dse-init__cell')] as HTMLElement[];
		cells[1].click(); // Orc #2

		expect(cells[1].getAttribute('aria-pressed')).toBe('true');
		expect(cells[1].hasAttribute('data-selected')).toBe(true);
		// Every other cell reads unselected — attribute AND aria state.
		for (const other of [cells[0], cells[2], cells[3], cells[4]]) {
			expect(other.getAttribute('aria-pressed')).toBe('false');
			expect(other.hasAttribute('data-selected')).toBe(false);
		}
		expect(root.querySelector('.dse-init__detail .dse-init__name')!.textContent).toBe('Orc #2');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(quickStart, (m) => {
				m.enemy_groups[0].selectedInstanceKey = '0-2';
			}),
		);
	});

	test('cell dblclick (non-minion): stamina modal for THAT instance -> its cell refreshes -> one write', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		const cell = root.querySelector('.dse-init__cell[data-instance-key="0-2"]') as HTMLElement;
		cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

		const modalEl = lastModal();
		expect(modalEl.querySelector('.dse-modal__title')!.textContent).toBe('Orc Stamina');
		commitStepperValue(modalEl, 25);
		modalApplyBtn(modalEl).click();

		expect(cell.querySelector('.dse-init__cell-stamina')!.textContent).toBe('25/40');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(quickStart, (m) => {
				m.enemy_groups[0].creatures[0].instances![1].current_stamina = 25;
			}),
		);
	});

	test('condition add (hero): AddConditionsModal -> icons rebuilt in place -> one write with the new condition', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		(root.querySelector('.dse-init__group--heroes .dse-cond--add') as HTMLElement).click();
		// Task 8: the modal is a kit managedModal — rows/footer are labelled kit buttons.
		const modalEl = lastModal();
		(modalEl.querySelector('button[aria-label="Bleeding"]') as HTMLElement).click();
		(modalEl.querySelector('.dse-modal__footer button[aria-label="Add Conditions"]') as HTMLElement).click();

		const heroConditions = root.querySelectorAll('.dse-init__group--heroes .dse-cond');
		expect(heroConditions).toHaveLength(1);
		expect(iconOf(heroConditions[0])).toBe('droplet');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(quickStart, (m) => {
				(m.heroes[0].conditions as Condition[]).push({ key: 'bleeding' } as Condition);
			}),
		);
	});

	test('condition remove (hero, squad fixture): icon button click -> container rebuilt -> one write without the removed condition', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(squad);

		(root.querySelector('.dse-init__group--heroes .dse-cond') as HTMLElement).click(); // remove "grabbed"

		const remaining = root.querySelectorAll('.dse-init__group--heroes .dse-cond');
		expect(remaining).toHaveLength(1);
		expect(iconOf(remaining[0])).toBe('droplet'); // bleeding stays

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(squad, (m) => {
				m.heroes[0].conditions = (m.heroes[0].conditions as Condition[]).slice(1);
			}),
		);
	});
});

describe('T-9: minion stamina pool — the Task-3 decoupled modal through the view', () => {
	test('grid dblclick (kill flow): pool damage + death -> whole-view update() rebuild -> exactly one write', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(squad);

		const cell = root.querySelector('.dse-init__cell') as HTMLElement;
		cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

		const modalEl = lastModal();
		expect(modalEl.querySelector('.dse-sedit__minions')).not.toBeNull(); // the pool modal's minion section

		applyPoolDamage(modalEl, 4, 1); // exactly one minion's worth: pool 20 -> 16, 1 kill
		const checkbox = modalEl.querySelector('.dse-minion__check') as HTMLInputElement;
		checkbox.checked = true;
		checkbox.dispatchEvent(new Event('change'));
		modalApplyBtn(modalEl).click();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		// The persist callback rebuilt the whole view from the mutated model:
		// Goblin #1 is dead (DEAD in its cell AND in the default-selected detail row,
		// on the [data-state="dead"] token — not inline crimson), the surviving
		// minions' cells show the reduced pool over the display max
		// (creature.max_stamina × creature.amount — amount deliberately stays 5, the
		// legacy behavior), and the grid lost nothing structurally.
		const rebuiltCells = root.querySelectorAll('.dse-init__cell');
		expect(rebuiltCells).toHaveLength(6);
		const deadCellStamina = rebuiltCells[0].querySelector('.dse-init__cell-stamina') as HTMLElement;
		expect(deadCellStamina.textContent).toBe('DEAD');
		expect(deadCellStamina.getAttribute('data-state')).toBe('dead');
		expect(deadCellStamina.style.color).toBe('');
		expect(rebuiltCells[1].querySelector('.dse-init__cell-stamina')!.textContent).toBe('16/20 (4)');
		const detailStamina = root.querySelector('.dse-init__detail .dse-init__stamina') as HTMLElement;
		expect(detailStamina.textContent).toBe('DEAD');
		expect(detailStamina.getAttribute('data-state')).toBe('dead');

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(squad, (m) => {
				m.enemy_groups[0].minion_stamina_pool = 16;
				m.enemy_groups[0].creatures[0].instances![0].isDead = true;
			}),
		);
	});

	test('detail-row click (damage only): pool damage -> detail row refreshed in place -> exactly one write', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(squad);

		(root.querySelector('.dse-init__detail .dse-init__stamina') as HTMLElement).click();

		const modalEl = lastModal();
		expect(modalEl.querySelector('.dse-sedit__minions')).not.toBeNull(); // the pool modal's minion section
		applyPoolDamage(modalEl, 3, 1); // 3 damage, 0 kills — no checkbox needed
		modalApplyBtn(modalEl).click();

		// The injected persist callback refreshed the detail row (legacy behavior) …
		expect(root.querySelector('.dse-init__detail .dse-init__stamina')!.textContent).toBe('17/20 (4)');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		// … and saved exactly once.
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(squad, (m) => {
				m.enemy_groups[0].minion_stamina_pool = 17;
			}),
		);
	});
});

describe('T-9: reset flows — model mutation -> framework update() rebuild -> persist', () => {
	// D8 Task 9: the standalone "Reset Round" button (clear-has_taken_turn-only) was folded
	// into the Malice panel's "Advance round" (spec §7.2 — a strict superset: round++,
	// has_taken_turn clear, actions clear, Malice gain). Its former coverage here
	// (has_taken_turn clears via the coarse rebuild -> persist path) now lives on Advance
	// round instead — see malicePanel.test.ts's "round counter + Advance round" describe
	// block and turnEconomy.test.ts's own Advance-round coverage.

	test('Reset Encounter: confirm modal -> resetEncounter -> rebuild -> one write with the RESET bytes (not re-materialized)', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		(root.querySelector('button[aria-label="Reset Encounter State"]') as HTMLElement).click();
		const modalEl = lastModal();
		expect(modalEl.textContent).toContain('Confirm Encounter Reset');
		// Task 8: the confirm is a kit managedModal — a labelled danger footer button.
		(modalEl.querySelector('button[aria-label="Yes, Reset"]') as HTMLElement).click();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		// Rebuilt from the reset model: malice back to 0, hero rows still present.
		expect(root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 0');
		expect(root.querySelectorAll('.dse-init__group--heroes .dse-init__entry')).toHaveLength(2);

		// The write is the reset model's bytes — exactly what legacy wrote (legacy
		// serialized the reset data directly; re-materialization only ever happened on
		// the next parse).
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(legacyBytes(quickStart, resetEncounter));
	});

	test('canceling the Reset Encounter modal changes nothing and writes nothing', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		(root.querySelector('button[aria-label="Reset Encounter State"]') as HTMLElement).click();
		const modalEl = lastModal();
		// Task 8: the confirm is a kit managedModal — a labelled Cancel footer button.
		(modalEl.querySelector('button[aria-label="Cancel"]') as HTMLElement).click();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 5');
		expect(host.replaceSource).not.toHaveBeenCalled();
	});
});

describe('T-9: modal lifecycle (F1 §4.5)', () => {
	test('a modal opened by the view is closed on view unload', async () => {
		const { deps } = makeEnv();
		const pipeline = new ElementPipeline(deps);
		const addChild = jest.fn((child: unknown) => child);
		const host = makeHost({ addChild } as unknown as Partial<BlockHost>);

		await pipeline.run(initiativeElement, quickStart, host);
		const view = addChild.mock.calls[0][0] as InitiativeView;

		const root = host.containerEl.firstElementChild as HTMLElement;
		(root.querySelector('.dse-init__group--heroes .dse-init__stamina') as HTMLElement).click();
		const modalEl = lastModal();
		expect(document.body.contains(modalEl)).toBe(true);

		view.unload();

		expect(document.body.contains(modalEl)).toBe(false);
	});
});

describe('T-9: canPersist=false — inert tracker, zero writes (F1 §4.4)', () => {
	test('renders read-only: data-dse-readonly stamped, NO buttons at all, state still displayed, interactions do nothing', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart, { canPersist: false });

		// The pipeline stamps the read-only attribute (CSS badge hangs off it).
		expect(root.getAttribute('data-dse-readonly')).toBe('true');

		// The tracker still renders (visible, not an error card) …
		expect(root.querySelector('.dse-init')).not.toBeNull();
		expect(root.querySelectorAll('.dse-init__group--heroes .dse-init__entry')).toHaveLength(2);
		expect(root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 5');
		expect(root.querySelectorAll('.dse-init__cell')).toHaveLength(5);

		// … but EVERY write affordance is gone: not one <button> in the whole tracker
		// (turn indicators, cells, stamina render as static state displays).
		expect(root.querySelectorAll('button')).toHaveLength(0);
		expect(root.querySelector('.dse-init__actionbar')).toBeNull();
		expect(root.querySelectorAll('.dse-init__malice .dse-stepper__btn')).toHaveLength(0);
		expect(root.querySelectorAll('.dse-cond--add')).toHaveLength(0);

		// Turn indicator: a static glyph (dot), inert on click.
		const indicator = root.querySelector('.dse-init__group--heroes .dse-init__turn') as HTMLElement;
		expect(indicator.tagName).not.toBe('BUTTON');
		expect(iconOf(indicator)).toBe('dot');
		indicator.click();
		expect(indicator.hasAttribute('data-taken')).toBe(false);

		// Stamina: no modal opens.
		const bodyChildrenBefore = document.body.children.length;
		(root.querySelector('.dse-init__group--heroes .dse-init__stamina') as HTMLElement).click();
		(root.querySelector('.dse-init__detail .dse-init__stamina') as HTMLElement).click();
		expect(document.body.children.length).toBe(bodyChildrenBefore);

		// Instance cells: selection is a persisted write — inert too.
		const cells = [...root.querySelectorAll('.dse-init__cell')] as HTMLElement[];
		cells[1].click();
		expect(root.querySelectorAll('.dse-init__cell[data-selected]')).toHaveLength(0);
		expect(root.querySelector('.dse-init__detail .dse-init__name')!.textContent).toBe('Orc #1');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});
});

describe('T-9: SC-5 hygiene + CSS contract (D2 §5/§6)', () => {
	test('source hygiene: the view passes the shared kit style guard (no .style access, no color literals)', () => {
		const src = fs.readFileSync(
			path.join(__dirname, '../../../src/elements/initiative/view.ts'),
			'utf8',
		);
		expect(styleGuardFindings(src)).toEqual([]);
	});

	test('CSS contract: .dse-init scoped under [data-dse-element="initiative"] on the §3.11 tokens — and the legacy class block is GONE', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

		const block = sheet.match(/\[data-dse-element="initiative"\]\s+\.dse-init\s*\{[\s\S]*?\n\}/);
		expect(block).not.toBeNull();
		expect(block![0]).toMatch(/var\(--dse-turn-done\)/); // taken-turn fill (Legacy limegreen)
		expect(block![0]).toMatch(/var\(--dse-select\)/); // selected cell ring (Legacy #D50000)
		expect(block![0]).toMatch(/var\(--dse-malice\)/); // malice text (Legacy red)
		expect(block![0]).toMatch(/var\(--dse-stamina-healthy\)/); // temp-stamina numbers
		expect(block![0]).toMatch(/var\(--dse-stamina-dying\)/); // negative-stamina numbers
		expect(block![0]).toMatch(/var\(--dse-danger\)/); // DEAD (Legacy crimson)
		expect(block![0]).toMatch(/var\(--dse-condition-color/); // validated per-condition color
		expect(block![0]).toMatch(/var\(--dse-surface\)/); // row/turn surface
		expect(block![0]).toMatch(/var\(--dse-hairline-fade\)/); // the row border-fade ornament

		// Portraits pref (D4): CSS hides the images when data-dse-portraits="off".
		expect(sheet).toMatch(/\[data-dse-element="initiative"\]\[data-dse-portraits="off"\]/);

		// Reduced motion (§4.9): the condition-effect animations are disabled.
		const reduced = sheet.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/);
		expect(reduced).not.toBeNull();
		expect(reduced![0]).toMatch(/condition-effect/);
		expect(reduced![0]).toMatch(/animation: none/);

		// The whole legacy class block is evicted (comments may still cite the old names).
		// .condition-icon deliberately SURVIVES — it's shared with MinionStaminaPoolModal.
		const noComments = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
		for (const legacyClass of [
			'.ds-init-container',
			'.top-action-bar',
			'.malice-',
			'.turn-indicator',
			'.creature-instance',
			'.creature-detail-row',
			'.creature-group',
			'.creature-instances-grid',
			'.heroes-container',
			'.enemies-header',
			'.enemy-group',
			'.hero-container',
			'.character-',
			'.instance-image',
			'.instance-stamina',
			'.add-condition-icon',
			'.reset-round-button',
			'.reset-encounter-button',
		]) {
			expect(noComments).not.toContain(legacyClass);
		}
	});
});

describe('T-9: statblock refs end-to-end through the pipeline reference stage (Task 2 wiring)', () => {
	/** Target notes for statblock-refs.yaml (same seeding as initiative-resolve-refs.test.ts). */
	function seedStatblockNotes(app: App): void {
		const dsNote = (lines: string[]): string => ['```ds-statblock', ...lines, '```'].join('\n');
		app.vault.setFile(
			'Frodo Baggins.md',
			dsNote(['name: Frodo Baggins', 'stamina: "80"', 'image: images/frodo.png']),
		);
		app.vault.setFile(
			'DS Compendium/Samwise Gamgee.md',
			dsNote(['name: Samwise Gamgee', 'stamina: 90', 'image: images/sam.png']),
		);
		app.vault.setFile('Bestiary/Orc Warrior.md', dsNote(['name: Orc Warrior', 'stamina: "40"']));
		app.vault.setFile('Goblin.md', dsNote(['name: Goblin', 'stamina: "4"']));
		app.vault.setFile(
			'Goblin Captain.md',
			dsNote(['name: Goblin Captain', 'stamina: "40"', 'image: images/captain.png']),
		);
	}

	test('renders with merged name/stamina and persists ref-model bytes (statblock strings preserved)', async () => {
		// Render under REAL timers: resolveBarePath goes through FakeVault.read, whose
		// deliberate macrotask yield would deadlock a fake-timer-wrapped pipeline.run.
		const { deps, app } = makeEnv();
		seedStatblockNotes(app);
		const pipeline = new ElementPipeline(deps);
		const host = makeHost();

		await pipeline.run(initiativeElement, statblockRefs, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		// Merged hero names/stamina (explicit local name "Sam" wins over the ref).
		const names = [...root.querySelectorAll('.dse-init__group--heroes .dse-init__name')].map(
			(n) => n.textContent,
		);
		expect(names).toEqual(['Frodo Baggins', 'Sam']);
		const heroStamina = [...root.querySelectorAll('.dse-init__group--heroes .dse-init__stamina')].map(
			(n) => n.textContent,
		);
		expect(heroStamina).toEqual(['80/80', '90/90']);

		// Merged creature: Mordor Forces' detail row is the resolved Orc Warrior.
		expect(root.querySelector('.dse-init__detail .dse-init__name')!.textContent).toBe('Orc Warrior #1');
		// Squad from refs: pool materialized post-merge = 4 × 5.
		const squadDetail = root.querySelectorAll('.dse-init__group--enemies .dse-init__entry')[1];
		expect(squadDetail.querySelector('.dse-init__detail .dse-init__stamina')!.textContent).toBe(
			'20/20 (4)',
		);
		expect(root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 2');

		// A mutation persists the resolved model's bytes — statblock strings preserved,
		// merged fields serialized (the Task-2-pinned first-write materialization).
		jest.useFakeTimers();
		(root.querySelector('.dse-init__group--heroes .dse-init__turn') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		jest.useRealTimers();

		const oracle = await resolveInitiativeRefs(parse(parseYaml(statblockRefs), statblockRefs), deps.refs);
		oracle.heroes[0].has_taken_turn = true;
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(serialize(oracle));
		expect(host.replaceSource.mock.calls[0][0]).toContain('statblock: Frodo Baggins');
	});

	test('a dangling ref surfaces as the pipeline reference-stage error card with the legacy hint', async () => {
		const { deps } = makeEnv(); // nothing seeded — every ref dangles
		const pipeline = new ElementPipeline(deps);
		const host = makeHost();

		await pipeline.run(initiativeElement, statblockRefs, host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(root.getAttribute('data-dse-error-stage')).toBe('reference');
		const card = root.querySelector('.dse-error-card') as HTMLElement;
		expect(card).not.toBeNull();
		expect(card.textContent).toContain('Initiative tracker: failed to render (reference)');
		expect(card.textContent).toContain('Failed to resolve hero statblock reference at index 0 (Frodo Baggins):');
		expect(card.textContent).toContain('If so, please specify the full path.');
	});
});

describe('T-9: persisted write path through a REAL ReadingModeBlockHost + FakeVault (F1 §3.4/§4.2)', () => {
	test('turn toggle inside a ```ds-it block -> exactly one Vault write; alias + surrounding note intact; body = legacy writer bytes', async () => {
		jest.useFakeTimers();
		const app = new App();
		app.vault.setFile('Media/token_1.png', '');
		const note = [
			'# Session prep',
			'',
			'Before text.',
			'',
			'```ds-it',
			quickStart.trimEnd(),
			'```',
			'',
			'After text.',
		].join('\n');
		app.vault.setFile('Encounter.md', note);
		const plugin = new Plugin(app);
		const ctx = makeFakeContext(app, 'Encounter.md');
		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-it');

		const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
		const prefs = createPreferenceStore(storage);
		const theme = createThemeService(prefs, plugin as any);
		const deps: ElementPipelineDeps = {
			app: app as any,
			plugin: plugin as any,
			settings: DEFAULT_SETTINGS,
			theme,
			prefs,
			refs: createReferenceService(app as any, DEFAULT_SETTINGS),
			validation: createValidationService(),
			session: createSessionStore(),
			roll: createRollService(prefs),
		};
		const pipeline = new ElementPipeline(deps);

		await pipeline.run(initiativeElement, quickStart, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		(root.querySelector('.dse-init__group--heroes .dse-init__turn') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(app.vault.modifyCalls).toHaveLength(1);
		const updated = app.vault.getContent('Encounter.md')!;
		// Alias NOT rewritten to the canonical language; surrounding note untouched.
		expect(updated.startsWith('# Session prep\n\nBefore text.\n\n```ds-it\n')).toBe(true);
		expect(updated.endsWith('\n```\n\nAfter text.')).toBe(true);
		const body = updated.match(/```ds-it\n([\s\S]*?)\n```/)?.[1];
		expect(body).toBe(
			legacyBytes(quickStart, (m) => {
				m.heroes[0].has_taken_turn = true;
			}),
		);
	});
});
