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
