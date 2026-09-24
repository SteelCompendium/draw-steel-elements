// D8 Task 9 (spec §7.2/§7.3) — the per-actor turn/round action economy: a keyboard-
// accessible [Main][Maneuver][Move][Triggered] checklist on every hero row AND every
// enemy creature instance's detail row, plus TWO distinct round-state controls
// (task-9-review.md HIGH finding — the brief requires both to stay, non-interchangeably):
// "Advance round" (round-boundary transition: round++, turn/checklist clear, Malice
// round_gain) and "Reset turns (this round)" (mid-round correction: turn/checklist clear
// ONLY, no round/Malice side effects). Driven through the REAL ElementPipeline, same
// harness convention as malicePanel.test.ts (file-local per the brief's file list).
//
// HARD INVARIANT: `round` / `Hero.actions` / `CreatureInstance.actions` /
// `malice.round_gain` / `malice.log` are ADDITIVE-OPTIONAL EncounterData fields —
// `test/unit/model/initiative-serialize.test.ts` stays green UNMODIFIED. This file's own
// byte-stability assertions use the model's `parse`/`serialize` directly as the oracle
// (there is no legacy oracle for fields that never existed in the legacy processor) — see
// also `test/unit/model/economy-serialize.test.ts` for the model-level freeze proof.
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin, parseYaml } from '../../mocks/obsidian';
import { initiativeElement } from '../../../src/elements/initiative/definition';
import { parse, serialize } from '../../../src/elements/initiative/model';
import type { EncounterData } from '../../../src/elements/initiative/model';

/** Two heroes + one enemy group of two Orc instances — enough to prove the checklist is
 *  scoped to a single actor (hero-to-hero and instance-to-instance). No `round_gain`
 *  (manual-only, OD-3). */
const baseSource = [
	'heroes:',
	'  - name: "Frodo Baggins"',
	'    max_stamina: 80',
	'  - name: "Samwise Gamgee"',
	'    max_stamina: 90',
	'enemy_groups:',
	'  - name: "Mordor Forces"',
	'    creatures:',
	'      - name: "Orc"',
	'        max_stamina: 40',
	'        amount: 2',
	'malice:',
	'  value: 5',
].join('\n');

/** Same shape, with a configured `round_gain` (Advance round should bump + log it). */
const withGainSource = [
	'heroes:',
	'  - name: "Frodo Baggins"',
	'    max_stamina: 80',
	'enemy_groups:',
	'  - name: "Mordor Forces"',
	'    creatures:',
	'      - name: "Orc"',
	'        max_stamina: 40',
	'        amount: 1',
	'malice:',
	'  value: 5',
	'  round_gain: 3',
].join('\n');

function bytesAfter(source: string, mutate?: (m: EncounterData) => void): string {
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

function makeEnv(): { deps: ElementPipelineDeps; app: App } {
	const app = new App();
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

/** The first hero row's action checklist container. */
const heroActions = (root: HTMLElement): HTMLElement =>
	root.querySelector('.dse-init__group--heroes .dse-init__entry .dse-init__actions') as HTMLElement;

/** The (currently rendered) selected creature's detail-row action checklist container. */
const detailActions = (root: HTMLElement): HTMLElement =>
	root.querySelector('.dse-init__detail .dse-init__actions') as HTMLElement;

afterEach(() => {
	jest.useRealTimers();
});

describe('D8 T-9: per-turn action checklist — structure', () => {
	test('every hero row exposes four labelled, unpressed toggles: Main, Maneuver, Move, Triggered', async () => {
		const { root } = await renderInit(baseSource);

		const entries = root.querySelectorAll('.dse-init__group--heroes .dse-init__entry');
		expect(entries).toHaveLength(2);

		const toggles = heroActions(root).querySelectorAll('button.dse-init__action-toggle');
		expect(toggles).toHaveLength(4);
		const labels = [...toggles].map((b) => b.querySelector('.dse-btn__text')!.textContent);
		expect(labels).toEqual(['Main', 'Maneuver', 'Move', 'Triggered']);
		toggles.forEach((t) => {
			expect(t.getAttribute('aria-pressed')).toBe('false');
			expect(t.hasAttribute('data-pressed')).toBe(false);
		});
	});

	test('the enemy detail row exposes the same four toggles for the selected instance', async () => {
		const { root } = await renderInit(baseSource);

		const toggles = detailActions(root).querySelectorAll('button.dse-init__action-toggle');
		expect(toggles).toHaveLength(4);
		expect([...toggles].map((b) => b.querySelector('.dse-btn__text')!.textContent)).toEqual([
			'Main',
			'Maneuver',
			'Move',
			'Triggered',
		]);
		// Labels are per-instance (Orc #1), matching the turn-indicator/stamina naming
		// convention used elsewhere in this row.
		expect(toggles[0].getAttribute('aria-label')).toBe('Toggle Main action: Orc #1');
	});

	test('a fresh block persists with no `actions` key anywhere until a toggle is pressed', async () => {
		const s1 = bytesAfter(baseSource);
		expect(s1).not.toMatch(/actions:/);
	});
});

describe('D8 T-9: toggling a slot materializes `actions` on ONLY that actor and persists once', () => {
	test('hero: toggling Main flips just that hero, leaves the other hero untouched', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(baseSource);

		const mainBtn = heroActions(root).querySelector(
			'button[aria-label="Toggle Main action: Frodo Baggins"]',
		) as HTMLElement;
		mainBtn.click();

		expect(mainBtn.getAttribute('aria-pressed')).toBe('true');
		expect(host.replaceSource).not.toHaveBeenCalled(); // debounced

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		const written = host.replaceSource.mock.calls[0][0];
		expect(written).toBe(
			bytesAfter(baseSource, (m) => {
				m.heroes[0].actions = { main: true, maneuver: false, move: false, triggered: false };
			}),
		);

		// Re-reading the written block reproduces exactly this — the OTHER hero carries no
		// `actions` key at all (never fabricated).
		const reparsed = parse(parseYaml(written), written);
		expect(reparsed.heroes[0].actions).toEqual({
			main: true,
			maneuver: false,
			move: false,
			triggered: false,
		});
		expect(reparsed.heroes[1].actions).toBeUndefined();
	});

	test('toggling Main again flips it back off (second write, byte-stable)', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(baseSource);

		const mainBtn = heroActions(root).querySelector(
			'button[aria-label="Toggle Main action: Frodo Baggins"]',
		) as HTMLElement;
		mainBtn.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		mainBtn.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(mainBtn.getAttribute('aria-pressed')).toBe('false');
		expect(host.replaceSource).toHaveBeenCalledTimes(2);
		expect(host.replaceSource.mock.calls[1][0]).toBe(
			bytesAfter(baseSource, (m) => {
				m.heroes[0].actions = { main: false, maneuver: false, move: false, triggered: false };
			}),
		);
	});

	test('enemy creature: toggling Triggered on the SELECTED instance leaves the other instance untouched', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(baseSource);

		// Select the second Orc instance via the grid (default selection is instance #1).
		(root.querySelector('.dse-init__cell[data-instance-key="0-2"]') as HTMLElement).click();
		expect(root.querySelector('.dse-init__detail .dse-init__name')!.textContent).toBe('Orc #2');

		const triggeredBtn = detailActions(root).querySelector(
			'button[aria-label="Toggle Triggered action: Orc #2"]',
		) as HTMLElement;
		triggeredBtn.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		const written = host.replaceSource.mock.calls[host.replaceSource.mock.calls.length - 1][0];
		const reparsed = parse(parseYaml(written), written);
		const orc = reparsed.enemy_groups[0].creatures[0];
		expect(orc.instances![0].actions).toBeUndefined(); // instance #1: untouched
		expect(orc.instances![1].actions).toEqual({
			main: false,
			maneuver: false,
			move: false,
			triggered: true,
		});
	});
});

describe('D8 T-9: "Advance round" resets the checklist (spec §7.2 — Triggered is per-round)', () => {
	test('increments the round display and clears every materialized `actions` back to all-false', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(baseSource);

		// Touch Main + Triggered on Frodo so the reset is observable.
		(heroActions(root).querySelector(
			'button[aria-label="Toggle Main action: Frodo Baggins"]',
		) as HTMLElement).click();
		(heroActions(root).querySelector(
			'button[aria-label="Toggle Triggered action: Frodo Baggins"]',
		) as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);

		(root.querySelector('button[aria-label="Advance round"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(root.querySelector('.dse-init__round-value')!.textContent).toBe('Round 2');
		// Rebuilt DOM: every toggle unpressed again, including the just-set ones.
		const rebuiltToggles = heroActions(root).querySelectorAll('button.dse-init__action-toggle');
		rebuiltToggles.forEach((t) => expect(t.getAttribute('aria-pressed')).toBe('false'));

		expect(host.replaceSource).toHaveBeenCalledTimes(2);
		expect(host.replaceSource.mock.calls[1][0]).toBe(
			bytesAfter(baseSource, (m) => {
				m.heroes[0].actions = { main: false, maneuver: false, move: false, triggered: false };
				m.round = 2;
			}),
		);
	});

	test('an actor never toggled stays untouched by Advance round (no fabricated `actions`)', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(baseSource);

		(root.querySelector('button[aria-label="Advance round"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		const written = host.replaceSource.mock.calls[0][0];
		expect(written).not.toMatch(/actions:/);
		const reparsed = parse(parseYaml(written), written);
		expect(reparsed.heroes[0].actions).toBeUndefined();
		expect(reparsed.heroes[1].actions).toBeUndefined();
	});

	test('bumps Malice by round_gain and logs it, alongside the checklist/turn reset', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(withGainSource);

		(heroActions(root).querySelector(
			'button[aria-label="Toggle Move action: Frodo Baggins"]',
		) as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		(root.querySelector('button[aria-label="Advance round"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(root.querySelector('.dse-init__round-value')!.textContent).toBe('Round 2');
		expect(root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 8'); // 5 + 3
		expect(
			[...root.querySelectorAll('.dse-init__malice-log-entry')].map((e) => e.textContent),
		).toEqual(['R2: +3 — Round gain']);

		expect(host.replaceSource).toHaveBeenCalledTimes(2);
		expect(host.replaceSource.mock.calls[1][0]).toBe(
			bytesAfter(withGainSource, (m) => {
				m.heroes[0].actions = { main: false, maneuver: false, move: false, triggered: false };
				m.round = 2;
				m.malice.value = 8;
				m.malice.log = [{ round: 2, amount: 3, label: 'Round gain' }];
			}),
		);
	});
});

describe('D8 T-9: "Reset turns (this round)" — turn-only correction, distinct from Advance round (task-9-review.md HIGH finding)', () => {
	test('clears has_taken_turn and materialized actions WITHOUT bumping round or re-granting malice.round_gain', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(withGainSource);

		// Take a turn and touch a checklist slot so the reset is observable.
		(root.querySelector('.dse-init__group--heroes .dse-init__turn') as HTMLElement).click();
		(heroActions(root).querySelector(
			'button[aria-label="Toggle Main action: Frodo Baggins"]',
		) as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);

		(root.querySelector('button[aria-label="Reset turns (this round)"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		// Turn indicator + checklist cleared …
		expect(root.querySelectorAll('.dse-init__turn[data-taken]')).toHaveLength(0);
		heroActions(root)
			.querySelectorAll('button.dse-init__action-toggle')
			.forEach((t) => expect(t.getAttribute('aria-pressed')).toBe('false'));
		// … but round and Malice are untouched — the whole point of this control.
		expect(root.querySelector('.dse-init__round-value')!.textContent).toBe('Round 1');
		expect(root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 5');
		expect(root.querySelectorAll('.dse-init__malice-log-entry')).toHaveLength(0);

		expect(host.replaceSource).toHaveBeenCalledTimes(2);
		expect(host.replaceSource.mock.calls[1][0]).toBe(
			bytesAfter(withGainSource, (m) => {
				m.heroes[0].actions = { main: false, maneuver: false, move: false, triggered: false };
			}),
		);
	});

	test('an actor never toggled stays untouched by Reset turns (no fabricated `actions`)', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(baseSource);

		(root.querySelector('button[aria-label="Reset turns (this round)"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		const written = host.replaceSource.mock.calls[0][0];
		expect(written).not.toMatch(/actions:/);
		const reparsed = parse(parseYaml(written), written);
		expect(reparsed.heroes[0].actions).toBeUndefined();
		expect(reparsed.heroes[1].actions).toBeUndefined();
	});

	test('Reset turns vs Advance round from identical starting states: only Advance round bumps round/malice', async () => {
		jest.useFakeTimers();

		// Two independent renders of the same source; one drives Reset, the other Advance.
		const resetRun = await renderInit(withGainSource);
		const advanceRun = await renderInit(withGainSource);

		(heroActions(resetRun.root).querySelector(
			'button[aria-label="Toggle Triggered action: Frodo Baggins"]',
		) as HTMLElement).click();
		(heroActions(advanceRun.root).querySelector(
			'button[aria-label="Toggle Triggered action: Frodo Baggins"]',
		) as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		(resetRun.root.querySelector('button[aria-label="Reset turns (this round)"]') as HTMLElement).click();
		(advanceRun.root.querySelector('button[aria-label="Advance round"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		// Both clear the checklist identically …
		[resetRun.root, advanceRun.root].forEach((root) => {
			heroActions(root)
				.querySelectorAll('button.dse-init__action-toggle')
				.forEach((t) => expect(t.getAttribute('aria-pressed')).toBe('false'));
		});
		// … but only Advance round moved the round counter and granted round_gain Malice.
		expect(resetRun.root.querySelector('.dse-init__round-value')!.textContent).toBe('Round 1');
		expect(resetRun.root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 5');
		expect(advanceRun.root.querySelector('.dse-init__round-value')!.textContent).toBe('Round 2');
		expect(advanceRun.root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 8');
	});
});

// SC-278 — minions in a squad act together and have a narrower economy than everyone
// else (Draw Steel Monsters, "Acting Together"): "each minion can take only a move action
// and a main action, a move action and a maneuver, or two move actions" — never main AND
// maneuver — while a captain "isn't limited in their action options as minions are". So
// a minion SQUAD (one `minion` creature entry — a group can hold several, GH #67) shows
// ONE shared checklist, [Move] [Main | Maneuver | Second move] [Triggered], with the
// middle three mutually exclusive, bound to `creature.actions` rather than to any
// instance; captain/attached rows keep the ordinary four toggles.
describe('SC-278: a minion squad shares ONE rule-shaped checklist', () => {
	const squadSource = [
		'heroes:',
		'  - name: "Frodo Baggins"',
		'    max_stamina: 80',
		'enemy_groups:',
		'  - name: "W1 Group 3"',
		'    is_squad: true',
		'    creatures:',
		'      - {name: Flow, max_stamina: 6, amount: 4, squad_role: minion}',
		'      - {name: Downpour, max_stamina: 6, amount: 4, squad_role: minion}',
		'      - {name: Essence, max_stamina: 90, amount: 1, squad_role: captain, captain_of: Flow}',
		'      - {name: Wierd, max_stamina: 45, amount: 1, squad_role: attached}',
		'malice:',
		'  value: 5',
	].join('\n');
	const SQUAD_LABELS = ['Move', 'Main', 'Maneuver', 'Second move', 'Triggered'];
	const selectCell = (root: HTMLElement, key: string): void =>
		(root.querySelector(`.dse-init__cell[data-instance-key="${key}"]`) as HTMLElement).click();
	const squadToggle = (root: HTMLElement, label: string, squad: string): HTMLElement =>
		detailActions(root).querySelector(
			`button[aria-label="Toggle ${label} action: ${squad} squad"]`,
		) as HTMLElement;
	const lastWritten = (host: { replaceSource: jest.Mock }): EncounterData => {
		const written = host.replaceSource.mock.calls[host.replaceSource.mock.calls.length - 1][0];
		return parse(parseYaml(written), written);
	};

	test('a minion instance detail row shows the SQUAD checklist: five toggles, squad-named, [data-squad]', async () => {
		const { root } = await renderInit(squadSource);
		expect(root.querySelector('.dse-init__detail .dse-init__name')!.textContent).toBe('Flow #1');

		const actions = detailActions(root);
		expect(actions.hasAttribute('data-squad')).toBe(true);
		const toggles = actions.querySelectorAll('button.dse-init__action-toggle');
		expect([...toggles].map((b) => b.querySelector('.dse-btn__text')!.textContent)).toEqual(SQUAD_LABELS);
		expect(toggles[0].getAttribute('aria-label')).toBe('Toggle Move action: Flow squad');
		expect([...toggles].map((b) => b.getAttribute('data-slot'))).toEqual([
			'move',
			'main',
			'maneuver',
			'second_move',
			'triggered',
		]);
		toggles.forEach((t) => expect(t.getAttribute('aria-pressed')).toBe('false'));
	});

	test('the captain and an attached creature keep the ordinary four per-instance toggles', async () => {
		const { root } = await renderInit(squadSource);
		for (const [key, name] of [
			['2-1', 'Essence #1'],
			['3-1', 'Wierd #1'],
		]) {
			selectCell(root, key);
			// `toContain`: the captain's name line also carries its "Captain" badge text.
			expect(root.querySelector('.dse-init__detail .dse-init__name')!.textContent).toContain(name);
			const actions = detailActions(root);
			expect(actions.hasAttribute('data-squad')).toBe(false);
			const toggles = actions.querySelectorAll('button.dse-init__action-toggle');
			expect([...toggles].map((b) => b.querySelector('.dse-btn__text')!.textContent)).toEqual([
				'Main',
				'Maneuver',
				'Move',
				'Triggered',
			]);
			expect(toggles[0].getAttribute('aria-label')).toBe(`Toggle Main action: ${name}`);
		}
	});

	test('every minion of the squad shows the SAME checklist; each squad in the group has its OWN', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(squadSource);

		squadToggle(root, 'Move', 'Flow').click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		// Flow #3 reads the same squad state — pressed already.
		selectCell(root, '0-3');
		expect(root.querySelector('.dse-init__detail .dse-init__name')!.textContent).toBe('Flow #3');
		expect(squadToggle(root, 'Move', 'Flow').getAttribute('aria-pressed')).toBe('true');

		// Downpour is a different squad: its own checklist, untouched.
		selectCell(root, '1-1');
		expect(root.querySelector('.dse-init__detail .dse-init__name')!.textContent).toBe('Downpour #1');
		expect(squadToggle(root, 'Move', 'Downpour').getAttribute('aria-pressed')).toBe('false');

		const model = lastWritten(host);
		const [flow, downpour] = model.enemy_groups[0].creatures;
		expect(flow.actions).toEqual({
			move: true,
			main: false,
			maneuver: false,
			second_move: false,
			triggered: false,
		});
		flow.instances!.forEach((i) => expect(i.actions).toBeUndefined());
		expect(downpour.actions).toBeUndefined();
	});

	test('Main, Maneuver and Second move are mutually exclusive; Move and Triggered are independent', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(squadSource);
		const pressedSet = (): string[] =>
			[...detailActions(root).querySelectorAll('button[aria-pressed="true"]')].map(
				(b) => b.getAttribute('data-slot')!,
			);

		squadToggle(root, 'Move', 'Flow').click();
		squadToggle(root, 'Triggered', 'Flow').click();
		squadToggle(root, 'Main', 'Flow').click();
		expect(pressedSet()).toEqual(['move', 'main', 'triggered']);

		squadToggle(root, 'Maneuver', 'Flow').click(); // releases Main
		expect(pressedSet()).toEqual(['move', 'maneuver', 'triggered']);

		squadToggle(root, 'Second move', 'Flow').click(); // releases Maneuver
		expect(pressedSet()).toEqual(['move', 'second_move', 'triggered']);

		squadToggle(root, 'Second move', 'Flow').click(); // plain toggle-off
		expect(pressedSet()).toEqual(['move', 'triggered']);

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(lastWritten(host).enemy_groups[0].creatures[0].actions).toEqual({
			move: true,
			main: false,
			maneuver: false,
			second_move: false,
			triggered: true,
		});
	});

	test('Advance round resets a materialized squad checklist to all-false, never fabricates one', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(squadSource);
		squadToggle(root, 'Main', 'Flow').click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		(root.querySelector('button[aria-label="Advance round"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(squadToggle(root, 'Main', 'Flow').getAttribute('aria-pressed')).toBe('false');
		expect(host.replaceSource.mock.calls[1][0]).toBe(
			bytesAfter(squadSource, (m) => {
				m.enemy_groups[0].creatures[0].actions = {
					move: false,
					main: false,
					maneuver: false,
					second_move: false,
					triggered: false,
				};
				m.round = 2;
			}),
		);
	});

	test('read-only: the squad checklist renders as five inert spans carrying pressed state', async () => {
		const seeded = squadSource.replace(
			'squad_role: minion}\n',
			'squad_role: minion, actions: {move: true, main: false, maneuver: true, second_move: false, triggered: false}}\n',
		);
		const { root } = await renderInit(seeded, { canPersist: false });
		const actions = detailActions(root);
		expect(actions.hasAttribute('data-squad')).toBe(true);
		expect(actions.querySelectorAll('button')).toHaveLength(0);
		const spans = actions.querySelectorAll('span.dse-init__action-toggle');
		expect([...spans].map((s) => s.textContent)).toEqual(SQUAD_LABELS);
		expect([...spans].map((s) => s.hasAttribute('data-pressed'))).toEqual([true, false, true, false, false]);
	});
});

describe('D8 T-9: read-only (canPersist=false, F1 §4.4)', () => {
	test('the checklist renders as inert static state — labels + pressed state, no buttons', async () => {
		const seededSource = [
			'heroes:',
			'  - name: "Frodo Baggins"',
			'    max_stamina: 80',
			'    actions: {main: true, maneuver: false, move: false, triggered: true}',
			'enemy_groups: []',
			'malice:',
			'  value: 5',
		].join('\n');
		const { root, host } = await renderInit(seededSource, { canPersist: false });

		expect(heroActions(root).querySelectorAll('button.dse-init__action-toggle')).toHaveLength(0);
		const spans = heroActions(root).querySelectorAll('span.dse-init__action-toggle');
		expect(spans).toHaveLength(4);
		expect([...spans].map((s) => s.textContent)).toEqual(['Main', 'Maneuver', 'Move', 'Triggered']);
		expect(spans[0].hasAttribute('data-pressed')).toBe(true); // main: true
		expect(spans[1].hasAttribute('data-pressed')).toBe(false); // maneuver: false
		expect(spans[3].hasAttribute('data-pressed')).toBe(true); // triggered: true

		// No Advance-round / Reset-turns affordance either (no dead-end write control).
		expect(root.querySelector('button[aria-label="Advance round"]')).toBeNull();
		expect(root.querySelector('button[aria-label="Reset turns (this round)"]')).toBeNull();
		expect(host.replaceSource).not.toHaveBeenCalled();
	});
});
