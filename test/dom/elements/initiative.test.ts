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
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage, PrefDescriptor } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { createElementRegistry } from '../../../src/framework/registry';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, parseYaml, makeFakeContext } from '../../mocks/obsidian';
import * as obsidian from '../../mocks/obsidian';
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
import { buttonsOutsideChrome } from '../_chromeTestUtils';

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
	// SC-154: carry the real pref catalog, the way main.ts does — DsePreferenceStore.get
	// THROWS on a key no descriptor was registered for, so a render-through-the-pipeline
	// env should never be one cx.prefs.get away from a throw a real vault can't have.
	// Registering it changes nothing else here: every default is the shipped one.
	prefs.describe(DSE_PREF_DESCRIPTORS);
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
	jest.restoreAllMocks();
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
		// "Reset Round" lives in the Malice panel's round row (alongside "Advance round"),
		// not this action bar, which carries only the destructive whole-encounter reset
		// (see turnEconomy.test.ts / the "reset flows" describe block below for Reset
		// Round's and Advance round's own coverage).
		const actionbar = root.querySelector('.dse-init__actionbar') as HTMLElement;
		expect(actionbar).not.toBeNull();
		expect(actionbar.classList.contains('dse-btn-row')).toBe(true);
		expect(actionbar.querySelector('button[aria-label="Reset Round"]')).toBeNull();
		const resetEnc = actionbar.querySelector('button[aria-label="Reset Encounter State"]') as HTMLButtonElement;
		expect(resetEnc).not.toBeNull();
		expect(resetEnc.getAttribute('type')).toBe('button');
		expect(resetEnc.querySelector('.dse-btn__text')!.textContent).toBe('Reset Encounter State');

		// Round row (Malice panel): both round-state controls are present and distinct.
		const resetRoundBtn = root.querySelector(
			'button[aria-label="Reset turns (this round)"]',
		) as HTMLButtonElement;
		const advanceRoundBtn = root.querySelector('button[aria-label="Advance round"]') as HTMLButtonElement;
		expect(resetRoundBtn).not.toBeNull();
		expect(advanceRoundBtn).not.toBeNull();
		expect(resetRoundBtn).not.toBe(advanceRoundBtn);

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

	// SC-154 round 2. The turn indicator used to be built as a SIBLING of the row /
	// group body, so it rendered as a detached box floating outside the card those
	// share ("the hero turn tracker checkbox is separated from the hero's container"
	// — Scott, 2026-08-16). The fix is structural, and only structure can guard it:
	// no CSS assertion is available in jsdom, and every visible symptom follows from
	// which parent the box is created in.
	test('SC-154: the turn indicator is built INSIDE the card it belongs to, not beside it', async () => {
		const { root } = await renderInit(quickStart);

		const heroRow = root.querySelector('.dse-init__group--heroes .dse-init__row')!;
		const heroTurnbox = heroRow.querySelector(':scope > .dse-init__turnbox');
		expect(heroTurnbox).not.toBeNull();
		// First child, so it reads as the row's leading control rather than trailing it.
		expect(heroRow.firstElementChild).toBe(heroTurnbox);
		// And nothing is left dangling next to the row inside the entry wrapper.
		const heroEntry = root.querySelector('.dse-init__group--heroes .dse-init__entry')!;
		expect(heroEntry.querySelector(':scope > .dse-init__turnbox')).toBeNull();

		// Same move for an enemy group: inside the group's own header, not outside its body.
		const groupHead = root.querySelector('.dse-init__grouphead')!;
		expect(groupHead.firstElementChild).toBe(groupHead.querySelector(':scope > .dse-init__turnbox'));
		const enemyEntry = root.querySelector('.dse-init__group--enemies .dse-init__entry')!;
		expect(enemyEntry.querySelector(':scope > .dse-init__turnbox')).toBeNull();
	});

	// SC-154 round 2. The enemy detail row used to hang its stamina control directly
	// off the row, where the hero row wraps it in `.dse-init__right` — the one
	// structural difference between two rows that are otherwise the same shape, and
	// the reason every narrow-width rule keyed on `.dse-init__right` skipped enemies.
	test('SC-154: hero rows and enemy detail rows share the same right-hand column markup', async () => {
		const { root } = await renderInit(quickStart);

		for (const sel of ['.dse-init__group--heroes .dse-init__row', '.dse-init__detail']) {
			const row = root.querySelector(sel)!;
			const right = row.querySelector(':scope > .dse-init__right');
			expect(right).not.toBeNull();
			expect(right!.querySelector(':scope > .dse-init__health > .dse-init__stamina')).not.toBeNull();
			// The health block is never a direct child of the row itself any more.
			expect(row.querySelector(':scope > .dse-init__health')).toBeNull();
		}
	});

	test('a11y: turn indicators are real toggle buttons; cells real aria-pressed buttons tagged data-instance-key (CB-6); stamina/malice/conditions labelled', async () => {
		const tooltipSpy = jest.spyOn(obsidian, 'setTooltip');
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
			// The native hover tooltip is the generic instruction...
			expect(tooltipSpy).toHaveBeenCalledWith(turn, 'Toggle to mark turn taken', undefined);
		}
		// ...but per iconButton (FOLLOWUPS #27-fix-round finding 1: native setTooltip
		// stamps aria-label as a side effect), the REQUIRED per-instance accessible name
		// always wins as the final aria-label, even though it differs from the tooltip.
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
		const tooltipSpy = jest.spyOn(obsidian, 'setTooltip');
		const { root } = await renderInit(squad);

		// Aragorn: grabbed (hand) + bleeding (droplet, crimson) + the add affordance.
		const heroConditions = [
			...root.querySelectorAll('.dse-init__group--heroes .dse-cond'),
		] as HTMLElement[];
		expect(heroConditions).toHaveLength(2);
		expect(heroConditions[0].tagName).toBe('BUTTON');
		expect(iconOf(heroConditions[0])).toBe('hand');
		expect(heroConditions[0].getAttribute('aria-label')).toBe('Remove condition: Grabbed');
		// The native hover tooltip is the bare condition name; per iconButton
		// (FOLLOWUPS #27-fix-round finding 1) it never clobbers the aria-label above.
		expect(tooltipSpy).toHaveBeenCalledWith(heroConditions[0], 'Grabbed', undefined);
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

	test('condition add (hero): ConditionsModal -> icons rebuilt in place -> one write with the new condition', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		(root.querySelector('.dse-init__group--heroes .dse-cond--add') as HTMLElement).click();
		// SC-186: the modal is the Option D manager — "+ Add condition" swaps in a real
		// combobox; type + Enter picks the top match, Done closes.
		const modalEl = lastModal();
		(modalEl.querySelector('button[aria-label="Add condition"]') as HTMLElement).click();
		const input = modalEl.querySelector('.dse-condal__input') as HTMLInputElement;
		input.value = 'Bleeding';
		input.dispatchEvent(new Event('input'));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		(modalEl.querySelector('.dse-modal__footer button[aria-label="Done"]') as HTMLElement).click();

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

	test('SC-186 fix-round INFO-2: two STALE remove clicks (captured before either fires) both land, neither resurrects the other', async () => {
		// The bug this guards: the row's onRemove closure used to filter the `conditions`
		// ARRAY SNAPSHOT captured when the row was built, not `character.conditions` at
		// WRITE time. Capture two remove buttons from the SAME render generation, then
		// fire them in sequence (the second is now "stale" — its row was already
		// rebuilt by the first click's container.empty()+rebuild, but the DETACHED
		// button's listener still fires on `.click()`, as SC-186's own live-apply modal
		// callbacks already relied on happening for the initiative row itself). With the
		// OLD code, the second click's closure filtered ITS OWN captured snapshot (both
		// conditions still present) instead of `character.conditions` as it actually
		// stood after the first removal — silently RESURRECTING the first click's
		// removal. Reading `character.conditions` fresh at write time (not a snapshot)
		// closes that gap for any consumer whose entries keep stable object identity
		// across renders (this element's own icon rebuild never clones entries — unlike
		// ConditionsModal's own internal representation, where identity across an
		// add/delete round-trip is a separate, larger concern noted in the SC-186
		// fix-round report, not fixed by this one-line change).
		jest.useFakeTimers();
		const { root, host } = await renderInit(squad);

		const icons = root.querySelectorAll('.dse-init__group--heroes .dse-cond');
		const [staleRemoveGrabbed, staleRemoveBleeding] = [icons[0], icons[1]] as HTMLElement[];

		staleRemoveGrabbed.click(); // removes "grabbed"; rebuilds the row (fresh closures)
		staleRemoveBleeding.click(); // STALE — captured before either click, same generation

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		const written = host.replaceSource.mock.calls[0][0] as string;
		expect(written).not.toContain('grabbed');
		expect(written).not.toContain('bleeding');
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
	// D8 Task 9 (task-9-review.md HIGH finding): "Reset Round" (clear-has_taken_turn +
	// materialized-actions-only) is restored here as its own control, distinct from
	// "Advance round" — it now lives in the Malice panel's round row (not this action
	// bar), labelled "Reset turns (this round)". See turnEconomy.test.ts's dedicated
	// "Reset turns" describe block for the fuller per-actor `actions` coverage and the
	// Reset-vs-Advance distinguishing test; this test pins the has_taken_turn/byte-compat
	// path the way the original pre-D8 "Reset Round" test did.
	test('Reset Round: clears every has_taken_turn, rebuilds, persists the cleared state — round/malice untouched', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		// Take a turn first so the reset is observable (write #1).
		(root.querySelector('.dse-init__group--heroes .dse-init__turn') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);

		(root.querySelector('button[aria-label="Reset turns (this round)"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		// Rebuilt DOM: no indicator marked anymore.
		expect(root.querySelectorAll('.dse-init__turn[data-taken]')).toHaveLength(0);
		expect(root.querySelectorAll('.dse-init__turn[aria-pressed="true"]')).toHaveLength(0);
		// Round / Malice are untouched — the defining difference from Advance round.
		expect(root.querySelector('.dse-init__round-value')!.textContent).toBe('Round 1');
		expect(root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 5');
		// Write #2 = every has_taken_turn false — byte-identical to a fresh parse.
		expect(host.replaceSource).toHaveBeenCalledTimes(2);
		expect(host.replaceSource.mock.calls[1][0]).toBe(legacyBytes(quickStart));
	});

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

		// … but EVERY write affordance is gone: (almost) not one <button> in the whole
		// tracker (turn indicators, cells, stamina render as static state displays).
		//
		// SC-169 round 3 — `ds-initiative` now carries the framework chrome panel, and it
		// carries it HERE TOO, deliberately: collapse/expand is a reading convenience, not a
		// write. It moves no data, persists only to the SessionStore, and never touches the
		// note — so a read-only render (sidebar, canvas, an un-editable embed) is exactly the
		// context where folding a big tracker down to one line is most useful. The edit item is
		// the write affordance in that panel, and it is separately gated on `host.canPersist`,
		// so it is absent here; the assertion below pins that.
		//
		// SC-154 — the Malice log's disclosure header is the SAME class of control as the
		// chrome collapse (a kit collapsible: reads state, session-only persistence, never
		// touches the note), so it is the ONE button allowed to survive read-only. The
		// exact-list assertion keeps this a closed set — any new button is still a failure.
		expect(buttonsOutsideChrome(root)).toEqual([
			'dse-collapse__header dse-init__malice-log-heading',
		]);
		expect(root.querySelectorAll('.dse-chrome [data-dse-chrome-item="edit"]')).toHaveLength(0);
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
		// SC-154: the real catalog, same reason as makeEnv above.
		prefs.describe(DSE_PREF_DESCRIPTORS);
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

describe('SC-183: the tracker adopts the real stamina instruments (kit bar + cell minis)', () => {
	// The squad fixture with a wounded pool and one DEAD minion — the two states the
	// shared squad.yaml (full pool, nobody dead) cannot express.
	const SQUAD_FIGHT = `heroes:
  - name: "Aragorn"
    max_stamina: 120
enemy_groups:
  - name: "Goblin Squad"
    is_squad: true
    minion_stamina_pool: 9
    creatures:
      - name: "Goblin"
        max_stamina: 4
        amount: 5
        squad_role: minion
        instances:
          - id: 1
          - id: 2
            isDead: true
          - id: 3
          - id: 4
          - id: 5
malice:
  value: 0
`;

	test('every hero row mounts the REAL kit bar as its last child: cluster + hero gauge (dying reserve), numerals off the model, clickable', async () => {
		const { root } = await renderInit(quickStart);
		const rows = root.querySelectorAll('.dse-init__group--heroes .dse-init__row');
		expect(rows.length).toBe(2);
		rows.forEach((row) => {
			const bar = row.lastElementChild as HTMLElement;
			expect(bar.hasClass('dse-stamina')).toBe(true);
			expect(bar.hasClass('dse-init__bar')).toBe(true);
			// The write affordance: the bar is clickable exactly when the host can persist.
			expect(bar.hasClass('dse-stamina--clickable')).toBe(true);
			// The SC-132 cluster, with the HERO coordinate model (dying reserve present).
			const gauge = bar.querySelector('.dse-stamina__cluster > .dse-stamina__gauge') as HTMLElement;
			expect(gauge).not.toBeNull();
			expect(gauge.getAttribute('data-zone')).toBeNull();
		});
		const frodoBar = rows[0].lastElementChild as HTMLElement;
		expect(frodoBar.querySelector('.dse-stamina__ccur')!.textContent).toBe('80');
		expect(frodoBar.querySelector('.dse-stamina__cmax')!.textContent).toBe('80');
	});

	test('clicking the hero bar opens the SAME stamina modal; apply refreshes numeric readout AND bar in place, one write', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		const bar = root.querySelector('.dse-init__group--heroes .dse-init__row > .dse-init__bar') as HTMLElement;
		const gauge = bar.querySelector('.dse-stamina__gauge') as HTMLElement;
		const pourBefore = gauge.style.getPropertyValue('--dse-pour-w');
		bar.click();

		const modalEl = lastModal();
		expect(modalEl.classList.contains('modal-container')).toBe(true);
		expect(modalEl.querySelector('.dse-modal__title')!.textContent).toBe('Frodo Baggins Stamina');

		commitStepperValue(modalEl, 30);
		modalApplyBtn(modalEl).click();

		// Both readouts repaint, no rebuild: the numeric text AND the bar's own numbers.
		expect(
			root.querySelector('.dse-init__group--heroes .dse-init__stamina')!.textContent,
		).toBe('30/80');
		expect(bar.querySelector('.dse-stamina__ccur')!.textContent).toBe('30');
		expect(gauge.getAttribute('data-state')).toBe('winded');
		expect(gauge.style.getPropertyValue('--dse-pour-w')).not.toBe(pourBefore);

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(quickStart, (m) => {
				m.heroes[0].current_stamina = 30;
			}),
		);
	});

	test('enemy detail row bar rides the CREATURE coordinate model (data-zone="off", no dying reserve)', async () => {
		const { root } = await renderInit(quickStart);
		const bar = root.querySelector('.dse-init__detail.dse-init__row > .dse-init__bar') as HTMLElement;
		expect(bar).not.toBeNull();
		const gauge = bar.querySelector('.dse-stamina__cluster > .dse-stamina__gauge') as HTMLElement;
		expect(gauge.getAttribute('data-zone')).toBe('off');
		expect(bar.querySelector('.dse-stamina__ccur')!.textContent).toBe('40');
	});

	test('creature modal apply syncs the detail bar AND the right cell mini (CB-6 keyed), not its neighbours', async () => {
		jest.useFakeTimers();
		const { root } = await renderInit(quickStart);

		const detailBar = root.querySelector('.dse-init__detail.dse-init__row > .dse-init__bar') as HTMLElement;
		(root.querySelector('.dse-init__detail .dse-init__stamina') as HTMLElement).click();
		commitStepperValue(lastModal(), 10);
		modalApplyBtn(lastModal()).click();

		// Detail bar repainted in place (10/40 => winded on the creature model).
		expect(detailBar.querySelector('.dse-stamina__ccur')!.textContent).toBe('10');
		// The instance's OWN cell mini went winded; a neighbour cell did not.
		const editedMini = root.querySelector(
			'.dse-init__cell[data-instance-key="0-1"] .dse-init__cell-gauge',
		) as HTMLElement;
		const otherMini = root.querySelector(
			'.dse-init__cell[data-instance-key="0-2"] .dse-init__cell-gauge',
		) as HTMLElement;
		expect(editedMini.getAttribute('data-state')).toBe('winded');
		expect(otherMini.getAttribute('data-state')).toBe('healthy');
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
	});

	test('every grid cell carries a mini gauge (bare kit gauge in a cluster-classed wrapper); numeric cell text is untouched', async () => {
		const { root } = await renderInit(quickStart);
		const cells = root.querySelectorAll('.dse-init__cell');
		expect(cells.length).toBe(5); // 4 orcs + 1 troll
		cells.forEach((cell) => {
			const mini = cell.querySelector(':scope > .dse-init__cell-gauge') as HTMLElement;
			expect(mini).not.toBeNull();
			// Rides the SAME base-hide + --dse-st ladder the full cluster rides.
			expect(mini.classList.contains('dse-stamina__cluster')).toBe(true);
			expect(mini.getAttribute('data-state')).toBe('healthy');
			expect(mini.querySelector('.dse-stamina__gauge')!.getAttribute('data-zone')).toBe('off');
		});
	});

	test('squad: pool bar with per-minion death ticks; the DEAD instance builds NO instruments and keeps its DEAD readout', async () => {
		const { root } = await renderInit(SQUAD_FIGHT);

		// Detail row bar = the SHARED pool (9 of 4x5=20), winded on the pool scale,
		// with amount-1 = 4 death graduations.
		const bar = root.querySelector('.dse-init__detail.dse-init__row > .dse-init__bar') as HTMLElement;
		expect(bar.querySelector('.dse-stamina__ccur')!.textContent).toBe('9');
		expect(bar.querySelector('.dse-stamina__cmax')!.textContent).toBe('20');
		expect(bar.querySelectorAll('.dse-stamina__gidx--tick').length).toBe(4);

		// Cells: living minions carry the pool mini; the dead one carries none and
		// still says DEAD.
		const deadCell = root.querySelector('.dse-init__cell[data-instance-key="0-2"]') as HTMLElement;
		expect(deadCell.querySelector('.dse-init__cell-gauge')).toBeNull();
		expect(deadCell.querySelector('.dse-init__cell-stamina')!.textContent).toBe('DEAD');
		const livingCell = root.querySelector('.dse-init__cell[data-instance-key="0-1"]') as HTMLElement;
		const livingMini = livingCell.querySelector('.dse-init__cell-gauge') as HTMLElement;
		expect(livingMini).not.toBeNull();
		expect(livingMini.querySelectorAll('.dse-stamina__gidx--tick').length).toBe(4);
	});

	test('read-only: bars render inert (no clickable modifier, no buttons added), minis still present', async () => {
		const { root } = await renderInit(quickStart, { canPersist: false });
		const bar = root.querySelector('.dse-init__group--heroes .dse-init__row > .dse-init__bar') as HTMLElement;
		expect(bar).not.toBeNull();
		expect(bar.hasClass('dse-stamina--clickable')).toBe(false);
		expect(bar.querySelector('button')).toBeNull();
		expect(root.querySelector('.dse-init__cell .dse-init__cell-gauge')).not.toBeNull();
	});

	test('initStamina pref (hidden A/B switch): reflected as data-dse-init-stamina, default plate, live reflow to rail', async () => {
		const { root, deps } = await renderInit(quickStart);
		expect(root.getAttribute('data-dse-init-stamina')).toBe('plate');
		await deps.prefs.set('initStamina', 'rail');
		expect(root.getAttribute('data-dse-init-stamina')).toBe('rail');
		// A reflow, not a rebuild: the same bar element is still mounted.
		expect(root.querySelector('.dse-init__row > .dse-init__bar')).not.toBeNull();
	});

	test('CSS contract: the instruments are base-hidden inside the .dse-init block, and every reveal rule carries the Steel screen guard', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

		// The base hide (what keeps base + BOTH print classes byte-identical): inside the
		// [data-dse-element="initiative"] .dse-init block, the two instrument nodes are
		// display:none with NO theme scope.
		const block = sheet.match(/\[data-dse-element="initiative"\]\s+\.dse-init\s*\{[\s\S]*?\n\}/)![0];
		expect(block).toMatch(/\.dse-init__bar,\s*\n\s*\.dse-init__cell-gauge\s*\{\s*\n\s*display:\s*none;/);

		// Every OTHER selector mentioning the two instrument classes must carry the full
		// Steel screen guard — a reveal rule without :not([data-dse-print="on"]) would
		// paint the bar into the frozen print pairs.
		const noComments = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
		const selectorLines = noComments
			.split('\n')
			// (?![\w-]) so SC-154's `.dse-init__bar-grid` — a different node, the command
			// bar's grid — is not swept into this contract.
			.filter((l) => /\.dse-init__(bar(?![\w-])|cell-gauge)/.test(l))
			.filter((l) => /[{,]\s*$/.test(l.trim()) || l.includes('{'));
		expect(selectorLines.length).toBeGreaterThan(0);
		for (const line of selectorLines) {
			const trimmed = line.trim();
			if (trimmed === '.dse-init__bar,' || trimmed.startsWith('.dse-init__cell-gauge {')) continue; // the base hide
			expect(trimmed).toContain(`[data-dse-theme='steel']:not([data-dse-print="on"])`);
		}
	});
});
