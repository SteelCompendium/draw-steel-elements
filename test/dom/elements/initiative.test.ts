// Plan 06 — the Initiative Tracker on Framework v2: InitiativeView + definition, driven
// through the REAL ElementPipeline (mirrors negotiation.test.ts; supersedes the deleted
// legacy T-10a initiative-render.test.ts harness). Task 5 registered the definition and
// retired the legacy InitiativeProcessor — the T-5 block below pins registered-exactly-
// once; the render tests still invoke the pipeline with the definition directly.
//
// BYTE-COMPAT oracle: the legacy writer (CodeBlocks.updateInitiativeTracker) did exactly
// `stringifyYaml(<the live materialized EncounterData>).trim()` — so expected bytes are
// always `serialize(parse(parseYaml(src)) + the same mutation)`, the same expression on
// the same object shape (pinned against legacy by initiative-serialize.test.ts).
// Every interaction must persist EXACTLY ONCE per user action (debounced write-behind).
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
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
	const theme = createThemeService();
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
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

describe('T-4: rendered through the REAL ElementPipeline (quick-start fixture)', () => {
	test('structure: root stamp, container, hero rows + names, enemy group, malice, detail row, instances grid', async () => {
		const { root } = await renderInit(quickStart);

		expect(root.getAttribute('data-dse-element')).toBe('initiative');
		expect(root.querySelector('.ds-init-container')).not.toBeNull();

		// Top action bar (writable host).
		expect(root.querySelector('.top-action-bar .reset-round-button')).not.toBeNull();
		expect(root.querySelector('.top-action-bar .reset-encounter-button')).not.toBeNull();

		// Heroes.
		expect(root.querySelectorAll('.hero-container')).toHaveLength(2);
		const names = [...root.querySelectorAll('.heroes-container .character-name')].map((n) => n.textContent);
		expect(names).toEqual(['Frodo Baggins', 'Samwise Gamgee']);
		const heroStamina = [...root.querySelectorAll('.heroes-container .character-stamina')].map(
			(n) => n.textContent,
		);
		expect(heroStamina).toEqual(['80/80', '90/90']);

		// Enemy group + malice.
		expect(root.querySelectorAll('.enemy-group-container')).toHaveLength(1);
		expect(root.querySelector('.group-header h4')!.textContent).toBe('Mordor Forces');
		expect(root.querySelector('.malice-text')!.textContent).toBe('Malice: 5');
		expect(root.querySelectorAll('.malice-modifier')).toHaveLength(2);

		// Detail row defaults to the first instance; grid renders 4 orcs + 1 troll.
		expect(root.querySelector('.creature-detail-row .character-name')!.textContent).toBe('Orc #1');
		expect(root.querySelector('.creature-detail-row .character-stamina')!.textContent).toBe('40/40');
		expect(root.querySelectorAll('.creature-instance-cell')).toHaveLength(5);
	});

	test('squad fixture: hero condition icons (with customization), squad pool display, minion + captain cells', async () => {
		const { root } = await renderInit(squad);

		// Aragorn: grabbed (hand) + bleeding (droplet, crimson) + the add affordance.
		const heroConditions = root.querySelectorAll('.heroes-container .condition-icon');
		expect(heroConditions).toHaveLength(2);
		expect(heroConditions[0].getAttribute('data-icon')).toBe('hand');
		expect((heroConditions[0] as HTMLElement).title).toBe('Grabbed');
		expect(heroConditions[1].getAttribute('data-icon')).toBe('droplet');
		expect((heroConditions[1] as HTMLElement).style.color).toBe('crimson');
		expect(root.querySelector('.heroes-container .add-condition-icon')).not.toBeNull();

		// Detail row defaults to Goblin #1 (minion): pool display "pool/max*amount (max)".
		expect(root.querySelector('.creature-detail-row .character-name')!.textContent).toBe('Goblin #1');
		expect(root.querySelector('.creature-detail-row .character-stamina')!.textContent).toBe('20/20 (4)');

		// Grid: 5 minions + 1 captain.
		const cells = root.querySelectorAll('.creature-instance-cell');
		expect(cells).toHaveLength(6);
		expect(cells[5].querySelector('.instance-stamina')!.textContent).toBe('40/40');
	});

	test('rendering performs ZERO writes (persist only ever runs on user mutation)', async () => {
		jest.useFakeTimers();
		const { host } = await renderInit(quickStart);
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});
});

describe('T-4: persisted mutations — exactly ONE debounced write each, byte-compatible with the legacy writer', () => {
	test('hero turn indicator: in-place check toggle, then one write with has_taken_turn: true', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		const indicator = root.querySelector('.heroes-container .turn-indicator') as HTMLElement;
		indicator.click();

		// In-place targeted update, still inside the debounce window.
		expect(indicator.classList.contains('taken-turn')).toBe(true);
		expect(indicator.getAttribute('data-icon')).toBe('check');
		expect(host.replaceSource).not.toHaveBeenCalled();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(quickStart, (m) => {
				m.heroes[0].has_taken_turn = true;
			}),
		);
	});

	test('enemy-group turn indicator: one write with the group has_taken_turn: true', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		(root.querySelector('.enemy-group-container .turn-indicator') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(quickStart, (m) => {
				m.enemy_groups[0].has_taken_turn = true;
			}),
		);
	});

	test('malice +/−: in-place .malice-text update, chevrons SURVIVE (legacy setText wiped them), rapid clicks coalesce into one write', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		const [up, down] = [...root.querySelectorAll('.malice-modifier')] as HTMLElement[];
		up.click();
		up.click();
		down.click();

		expect(root.querySelector('.malice-text')!.textContent).toBe('Malice: 6');
		// The deliberate divergence pin: legacy's maliceContainer.setText destroyed the
		// chevron modifiers on first click (masked by the post-write re-render); the v2
		// port updates .malice-text in place so the controls stay usable.
		expect(root.querySelectorAll('.malice-modifier')).toHaveLength(2);

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

		const staminaEl = root.querySelector('.heroes-container .character-stamina') as HTMLElement;
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

	test('creature stamina modal (detail row): edit -> detail + grid cell refresh -> one write on the instance', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		const staminaEl = root.querySelector('.creature-detail-row .character-stamina') as HTMLElement;
		staminaEl.click();

		const modalEl = lastModal();
		commitStepperValue(modalEl, 10);
		modalApplyBtn(modalEl).click();

		expect(staminaEl.textContent).toBe('10/40');
		// Legacy grid-cell sync (nth-child(instance.id)) — Orc #1 is the first cell.
		expect(root.querySelector('.creature-instance-cell:nth-child(1) .instance-stamina')!.textContent).toBe(
			'10/40',
		);

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(quickStart, (m) => {
				m.enemy_groups[0].creatures[0].instances![0].current_stamina = 10;
			}),
		);
	});

	test('instance-cell select: detail row rebuilt for that instance, one write persisting selectedInstanceKey', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		const cells = [...root.querySelectorAll('.creature-instance-cell')] as HTMLElement[];
		cells[1].click(); // Orc #2

		expect(cells[1].classList.contains('selected')).toBe(true);
		expect(root.querySelector('.creature-detail-row .character-name')!.textContent).toBe('Orc #2');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(quickStart, (m) => {
				m.enemy_groups[0].selectedInstanceKey = '0-2';
			}),
		);
	});

	test('condition add (hero): AddConditionsModal -> icons rebuilt in place -> one write with the new condition', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		(root.querySelector('.heroes-container .add-condition-icon') as HTMLElement).click();
		const modalEl = lastModal();
		(modalEl.querySelector('.condition-item') as HTMLElement).click(); // Bleeding (first standard condition)
		const buttons = modalEl.querySelectorAll('.modal-buttons button');
		(buttons[1] as HTMLElement).click(); // "Add Conditions"

		const heroConditions = root.querySelectorAll('.heroes-container .hero-container .condition-icon');
		expect(heroConditions).toHaveLength(1);
		expect(heroConditions[0].getAttribute('data-icon')).toBe('droplet');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(quickStart, (m) => {
				(m.heroes[0].conditions as Condition[]).push({ key: 'bleeding' } as Condition);
			}),
		);
	});

	test('condition remove (hero, squad fixture): icon click -> container rebuilt -> one write without the removed condition', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(squad);

		(root.querySelector('.heroes-container .condition-icon') as HTMLElement).click(); // remove "grabbed"

		const remaining = root.querySelectorAll('.heroes-container .condition-icon');
		expect(remaining).toHaveLength(1);
		expect(remaining[0].getAttribute('data-icon')).toBe('droplet'); // bleeding stays

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			legacyBytes(squad, (m) => {
				m.heroes[0].conditions = (m.heroes[0].conditions as Condition[]).slice(1);
			}),
		);
	});
});

describe('T-4: minion stamina pool — the Task-3 decoupled modal through the view', () => {
	test('grid dblclick (kill flow): pool damage + death -> whole-view update() rebuild -> exactly one write', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(squad);

		const cell = root.querySelector('.creature-instance-cell') as HTMLElement;
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
		// Goblin #1 is dead (DEAD in its cell AND in the default-selected detail row),
		// the surviving minions' cells show the reduced pool over the display max
		// (creature.max_stamina × creature.amount — amount deliberately stays 5, the
		// legacy behavior), and the grid lost nothing structurally.
		const rebuiltCells = root.querySelectorAll('.creature-instance-cell');
		expect(rebuiltCells).toHaveLength(6);
		expect(rebuiltCells[0].querySelector('.instance-stamina')!.textContent).toBe('DEAD');
		expect(rebuiltCells[1].querySelector('.instance-stamina')!.textContent).toBe('16/20 (4)');
		expect(root.querySelector('.creature-detail-row .character-stamina')!.textContent).toBe('DEAD');

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

		(root.querySelector('.creature-detail-row .character-stamina') as HTMLElement).click();

		const modalEl = lastModal();
		expect(modalEl.querySelector('.dse-sedit__minions')).not.toBeNull(); // the pool modal's minion section
		applyPoolDamage(modalEl, 3, 1); // 3 damage, 0 kills — no checkbox needed
		modalApplyBtn(modalEl).click();

		// The injected persist callback refreshed the detail row (legacy behavior) …
		expect(root.querySelector('.creature-detail-row .character-stamina')!.textContent).toBe('17/20 (4)');

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

describe('T-4: reset flows — model mutation -> framework update() rebuild -> persist', () => {
	test('Reset Round: clears every has_taken_turn, rebuilds, persists the cleared state', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		// Take a turn first so the reset is observable (write #1).
		(root.querySelector('.heroes-container .turn-indicator') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);

		(root.querySelector('.reset-round-button') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		// Rebuilt DOM: no indicator marked anymore.
		expect(root.querySelectorAll('.turn-indicator.taken-turn')).toHaveLength(0);
		// Write #2 = every has_taken_turn false — byte-identical to a fresh parse.
		expect(host.replaceSource).toHaveBeenCalledTimes(2);
		expect(host.replaceSource.mock.calls[1][0]).toBe(legacyBytes(quickStart));
	});

	test('Reset Encounter: confirm modal -> resetEncounter -> rebuild -> one write with the RESET bytes (not re-materialized)', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		(root.querySelector('.reset-encounter-button') as HTMLElement).click();
		const modalEl = lastModal();
		expect(modalEl.textContent).toContain('Confirm Encounter Reset');
		(modalEl.querySelector('.mod-warning') as HTMLElement).click(); // "Yes, Reset"

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		// Rebuilt from the reset model: malice back to 0, hero rows still present.
		expect(root.querySelector('.malice-text')!.textContent).toBe('Malice: 0');
		expect(root.querySelectorAll('.hero-container')).toHaveLength(2);

		// The write is the reset model's bytes — exactly what legacy wrote (legacy
		// serialized the reset data directly; re-materialization only ever happened on
		// the next parse).
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(legacyBytes(quickStart, resetEncounter));
	});

	test('canceling the Reset Encounter modal changes nothing and writes nothing', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart);

		(root.querySelector('.reset-encounter-button') as HTMLElement).click();
		const modalEl = lastModal();
		const buttons = modalEl.querySelectorAll('.modal-button-container button');
		(buttons[1] as HTMLElement).click(); // "Cancel"

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(root.querySelector('.malice-text')!.textContent).toBe('Malice: 5');
		expect(host.replaceSource).not.toHaveBeenCalled();
	});
});

describe('T-4: modal lifecycle (F1 §4.5)', () => {
	test('a modal opened by the view is closed on view unload', async () => {
		const { deps } = makeEnv();
		const pipeline = new ElementPipeline(deps);
		const addChild = jest.fn((child: unknown) => child);
		const host = makeHost({ addChild } as unknown as Partial<BlockHost>);

		await pipeline.run(initiativeElement, quickStart, host);
		const view = addChild.mock.calls[0][0] as InitiativeView;

		const root = host.containerEl.firstElementChild as HTMLElement;
		(root.querySelector('.heroes-container .character-stamina') as HTMLElement).click();
		const modalEl = lastModal();
		expect(document.body.contains(modalEl)).toBe(true);

		view.unload();

		expect(document.body.contains(modalEl)).toBe(false);
	});
});

describe('T-4: canPersist=false — inert tracker, zero writes (F1 §4.4)', () => {
	test('renders read-only: data-dse-readonly stamped, write affordances absent, interactions do nothing', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(quickStart, { canPersist: false });

		// The pipeline stamps the read-only attribute (CSS badge hangs off it).
		expect(root.getAttribute('data-dse-readonly')).toBe('true');

		// The tracker still renders (visible, not an error card) …
		expect(root.querySelector('.ds-init-container')).not.toBeNull();
		expect(root.querySelectorAll('.hero-container')).toHaveLength(2);
		expect(root.querySelector('.malice-text')!.textContent).toBe('Malice: 5');
		expect(root.querySelectorAll('.creature-instance-cell')).toHaveLength(5);

		// … but every write affordance is gone.
		expect(root.querySelector('.top-action-bar')).toBeNull();
		expect(root.querySelectorAll('.malice-modifier')).toHaveLength(0);
		expect(root.querySelectorAll('.add-condition-icon')).toHaveLength(0);

		// Turn indicator: inert (no toggle, no write).
		const indicator = root.querySelector('.heroes-container .turn-indicator') as HTMLElement;
		indicator.click();
		expect(indicator.classList.contains('taken-turn')).toBe(false);

		// Stamina: no modal opens.
		const bodyChildrenBefore = document.body.children.length;
		(root.querySelector('.heroes-container .character-stamina') as HTMLElement).click();
		(root.querySelector('.creature-detail-row .character-stamina') as HTMLElement).click();
		expect(document.body.children.length).toBe(bodyChildrenBefore);

		// Instance cells: selection is a persisted write — inert too.
		const cells = [...root.querySelectorAll('.creature-instance-cell')] as HTMLElement[];
		cells[1].click();
		expect(root.querySelectorAll('.creature-instance-cell.selected')).toHaveLength(0);
		expect(root.querySelector('.creature-detail-row .character-name')!.textContent).toBe('Orc #1');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});
});

describe('T-4: statblock refs end-to-end through the pipeline reference stage (Task 2 wiring)', () => {
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
		const names = [...root.querySelectorAll('.heroes-container .character-name')].map((n) => n.textContent);
		expect(names).toEqual(['Frodo Baggins', 'Sam']);
		const heroStamina = [...root.querySelectorAll('.heroes-container .character-stamina')].map(
			(n) => n.textContent,
		);
		expect(heroStamina).toEqual(['80/80', '90/90']);

		// Merged creature: Mordor Forces' detail row is the resolved Orc Warrior.
		expect(root.querySelector('.creature-detail-row .character-name')!.textContent).toBe('Orc Warrior #1');
		// Squad from refs: pool materialized post-merge = 4 × 5.
		const squadDetail = root.querySelectorAll('.enemy-group-container')[1];
		expect(squadDetail.querySelector('.creature-detail-row .character-stamina')!.textContent).toBe(
			'20/20 (4)',
		);
		expect(root.querySelector('.malice-text')!.textContent).toBe('Malice: 2');

		// A mutation persists the resolved model's bytes — statblock strings preserved,
		// merged fields serialized (the Task-2-pinned first-write materialization).
		jest.useFakeTimers();
		(root.querySelector('.heroes-container .turn-indicator') as HTMLElement).click();
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

describe('T-4: persisted write path through a REAL ReadingModeBlockHost + FakeVault (F1 §3.4/§4.2)', () => {
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

		const theme = createThemeService();
		const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
		const deps: ElementPipelineDeps = {
			app: app as any,
			plugin: plugin as any,
			settings: DEFAULT_SETTINGS,
			theme,
			prefs: createPreferenceStore(storage),
			refs: createReferenceService(app as any, DEFAULT_SETTINGS),
			validation: createValidationService(),
			session: createSessionStore(),
		};
		const pipeline = new ElementPipeline(deps);

		await pipeline.run(initiativeElement, quickStart, host);

		const root = host.containerEl.firstElementChild as HTMLElement;
		(root.querySelector('.heroes-container .turn-indicator') as HTMLElement).click();
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
