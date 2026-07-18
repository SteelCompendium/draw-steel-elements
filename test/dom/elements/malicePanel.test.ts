// D8 Task 5 (spec §3) — the Malice panel: first-class initiative sub-view. Replaces the
// bare ± widget (`initiative/view.ts:185-208` pre-Task-5) with a panel showing the pool
// (kit stepper, unchanged CB-7 contract), a round counter + the shared "Advance round"
// control (spec §7.2, OD-3), a spend/gain log (`malice.log`), and a labeled quick-add for
// manual trigger-based gains (spec §3.3). Driven through the REAL ElementPipeline, same
// harness convention as `initiative.test.ts` (kept file-local per the brief's own file
// list — this file does not modify that suite).
//
// HARD INVARIANT: `round` / `malice.round_gain` / `malice.log` are ADDITIVE optional
// EncounterData fields — `test/unit/model/initiative-serialize.test.ts` stays green
// UNMODIFIED. This file's own byte-stability assertions use the model's `parse`/
// `serialize` directly as the oracle (there is no legacy oracle for fields that never
// existed in the legacy processor).
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

/** Same fixture-free base as `initiative.test.ts`'s quick-start, minus the second hero
 *  and the troll (irrelevant here) — malice.value: 5, no round_gain (OD-3: manual-only). */
const baseSource = [
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
].join('\n');

/** Same shape, with a configured `round_gain` (OD-3: auto-applied on Advance round). */
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

/** Pre-seeded with an existing log + round (proves both fields round-trip). */
const withLogSource = [
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
	'  value: 8',
	'  log:',
	'    - {round: 1, amount: 3, label: Feytouched}',
	'    - {round: 2, amount: 5, label: "Goblin Ambush"}',
	'round: 2',
].join('\n');

/** The exact bytes our OWN model would write back for `source` after `mutate` — the
 *  byte-compat oracle for these NEW additive fields (no legacy equivalent exists). */
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

afterEach(() => {
	jest.useRealTimers();
});

describe('D8 T-5: Malice panel — pool stepper (Deliverable 1)', () => {
	test('pool renders as a keyboard-accessible kit stepper: role=group, labelled ± buttons, live value', async () => {
		const { root } = await renderInit(baseSource);

		const panel = root.querySelector('.dse-init__malice-panel');
		expect(panel).not.toBeNull();

		const stepperEl = panel!.querySelector('.dse-init__malice .dse-stepper') as HTMLElement;
		expect(stepperEl.getAttribute('role')).toBe('group');
		expect(stepperEl.getAttribute('aria-label')).toBe('Malice');
		expect(stepperEl.querySelector('button[aria-label="Increase Malice"]')).not.toBeNull();
		expect(stepperEl.querySelector('button[aria-label="Decrease Malice"]')).not.toBeNull();
		expect(panel!.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 5');
	});

	test('a stepper change flushes to the block exactly once (debounced) with byte-stable malice.value', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(baseSource);

		(root.querySelector('.dse-init__malice button[aria-label="Increase Malice"]') as HTMLElement).click();
		expect(root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 6');
		expect(host.replaceSource).not.toHaveBeenCalled();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			bytesAfter(baseSource, (m) => {
				m.malice.value = 6;
			}),
		);
	});
});

describe('D8 T-5: Malice panel — round counter + "Advance round" (spec §7.2/§3.1, OD-3)', () => {
	test('round counter defaults to "Round 1" when `round` is absent', async () => {
		const { root } = await renderInit(baseSource);
		expect(root.querySelector('.dse-init__round-value')!.textContent).toBe('Round 1');
	});

	test('Advance round: increments round, clears has_taken_turn, and (absent round_gain) leaves the pool untouched — manual-only per OD-3', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(baseSource);

		// Take a turn first so the has_taken_turn clear is observable.
		(root.querySelector('.dse-init__group--heroes .dse-init__turn') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);

		(root.querySelector('button[aria-label="Advance round"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(root.querySelector('.dse-init__round-value')!.textContent).toBe('Round 2');
		expect(root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 5'); // unchanged
		expect(root.querySelectorAll('.dse-init__turn[data-taken]')).toHaveLength(0);

		expect(host.replaceSource).toHaveBeenCalledTimes(2);
		expect(host.replaceSource.mock.calls[1][0]).toBe(
			bytesAfter(baseSource, (m) => {
				m.heroes[0].has_taken_turn = true; // materialized by parse(), then cleared
				m.heroes[0].has_taken_turn = false;
				m.round = 2;
			}),
		);
	});

	test('Advance round applies malice.round_gain to the pool when configured (OD-3 — never a fabricated default)', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(withGainSource);

		(root.querySelector('button[aria-label="Advance round"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(root.querySelector('.dse-init__round-value')!.textContent).toBe('Round 2');
		expect(root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 8'); // 5 + round_gain 3

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			bytesAfter(withGainSource, (m) => {
				m.round = 2;
				m.malice.value = 8;
			}),
		);
	});

	test('a second Advance round press continues incrementing from the persisted round', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(withGainSource);

		const advance = () => (root.querySelector('button[aria-label="Advance round"]') as HTMLElement).click();
		advance();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		advance();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(root.querySelector('.dse-init__round-value')!.textContent).toBe('Round 3');
		expect(root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 11'); // 5 + 3 + 3
		expect(host.replaceSource).toHaveBeenCalledTimes(2);
		expect(host.replaceSource.mock.calls[1][0]).toBe(
			bytesAfter(withGainSource, (m) => {
				m.round = 3;
				m.malice.value = 11;
			}),
		);
	});
});

describe('D8 T-5: Malice panel — spend/gain log (spec §3.1)', () => {
	test('empty state: "No Malice spent or gained yet." when malice.log is absent', async () => {
		const { root } = await renderInit(baseSource);
		expect(root.querySelector('.dse-init__malice-log-empty')!.textContent).toBe(
			'No Malice spent or gained yet.',
		);
		expect(root.querySelector('.dse-init__malice-log-list')).toBeNull();
	});

	test('renders existing malice.log entries {round, amount, label}, oldest-first', async () => {
		const { root } = await renderInit(withLogSource);

		const entries = [...root.querySelectorAll('.dse-init__malice-log-entry')].map((e) => e.textContent);
		expect(entries).toEqual(['R1: +3 — Feytouched', 'R2: +5 — Goblin Ambush']);
		expect(root.querySelector('.dse-init__malice-log-empty')).toBeNull();
		expect(root.querySelector('.dse-init__round-value')!.textContent).toBe('Round 2');
		expect(root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 8');
	});
});

describe('D8 T-5: Malice panel — quick-add (spec §3.3)', () => {
	function fillQuickAdd(root: HTMLElement, amount: string, label: string): void {
		const amountInput = root.querySelector('.dse-init__malice-quickadd-amount') as HTMLInputElement;
		const labelInput = root.querySelector('.dse-init__malice-quickadd-label') as HTMLInputElement;
		amountInput.value = amount;
		amountInput.dispatchEvent(new Event('input'));
		labelInput.value = label;
		labelInput.dispatchEvent(new Event('input'));
	}

	test('a labeled quick-add gain appends {round, amount, label} to the log and adds to the pool', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(baseSource);

		fillQuickAdd(root, '3', 'Feytouched');
		(root.querySelector('button[aria-label="Add Malice log entry"]') as HTMLElement).click();

		expect(root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 8');
		expect(
			[...root.querySelectorAll('.dse-init__malice-log-entry')].map((e) => e.textContent),
		).toEqual(['R1: +3 — Feytouched']);

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		expect(host.replaceSource.mock.calls[0][0]).toBe(
			bytesAfter(baseSource, (m) => {
				m.malice.value = 8;
				m.malice.log = [{ round: 1, amount: 3, label: 'Feytouched' }];
			}),
		);
	});

	test('quick-add with a zero amount or an empty label is a no-op (nothing persisted)', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(baseSource);

		fillQuickAdd(root, '0', 'Nothing');
		(root.querySelector('button[aria-label="Add Malice log entry"]') as HTMLElement).click();
		fillQuickAdd(root, '4', '');
		(root.querySelector('button[aria-label="Add Malice log entry"]') as HTMLElement).click();

		expect(root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 5');
		expect(root.querySelector('.dse-init__malice-log-empty')).not.toBeNull();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});
});

describe('D8 T-5: Malice panel — read-only (canPersist=false, F1 §4.4)', () => {
	test('every control is inert: static pool value, no stepper buttons, no Advance-round button, no quick-add inputs — round/log still displayed', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(withLogSource, { canPersist: false });

		// Pool: static value, no stepper buttons.
		expect(root.querySelector('.dse-init__malice-value')!.textContent).toBe('Malice: 8');
		expect(root.querySelectorAll('.dse-init__malice .dse-stepper__btn')).toHaveLength(0);
		expect(root.querySelector('.dse-init__malice .dse-stepper')).toBeNull();

		// Round: state display survives; the write control does not.
		expect(root.querySelector('.dse-init__round-value')!.textContent).toBe('Round 2');
		expect(root.querySelector('button[aria-label="Advance round"]')).toBeNull();

		// Log: still a read display (it always was).
		expect(
			[...root.querySelectorAll('.dse-init__malice-log-entry')].map((e) => e.textContent),
		).toEqual(['R1: +3 — Feytouched', 'R2: +5 — Goblin Ambush']);

		// Quick-add: entirely absent (no dead-end write affordance, F1 §4.4).
		expect(root.querySelector('.dse-init__malice-quickadd')).toBeNull();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).not.toHaveBeenCalled();
	});
});

describe('D8 T-5: byte-stable round-trip — round/log survive parse -> serialize -> parse', () => {
	test('a fresh block with no round/log round-trips with neither key present', () => {
		const m1 = parse(parseYaml(baseSource), baseSource);
		const s1 = serialize(m1);
		expect(s1).not.toContain('round:');
		expect(s1).not.toMatch(/log:/);
		const m2 = parse(parseYaml(s1), s1);
		expect(m2).toEqual(m1);
		expect(serialize(m2)).toBe(s1);
	});

	test('round + malice.log survive an end-to-end round-trip through the real pipeline write path', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderInit(baseSource);

		fillAndAdvance(root);
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		const written = host.replaceSource.mock.calls[0][0];
		expect(written).toContain('round: 2');
		expect(written).toMatch(/log:\s*\n\s*- round: 1\s*\n\s*amount: 3\s*\n\s*label: Feytouched/);

		// Round-trip: re-parsing the written bytes reproduces the exact same model.
		const reparsed = parse(parseYaml(written), written);
		expect(reparsed.round).toBe(2);
		expect(reparsed.malice.log).toEqual([{ round: 1, amount: 3, label: 'Feytouched' }]);
		expect(serialize(reparsed)).toBe(written);

		function fillAndAdvance(r: HTMLElement): void {
			const amountInput = r.querySelector('.dse-init__malice-quickadd-amount') as HTMLInputElement;
			const labelInput = r.querySelector('.dse-init__malice-quickadd-label') as HTMLInputElement;
			amountInput.value = '3';
			amountInput.dispatchEvent(new Event('input'));
			labelInput.value = 'Feytouched';
			labelInput.dispatchEvent(new Event('input'));
			(r.querySelector('button[aria-label="Add Malice log entry"]') as HTMLElement).click();
			(r.querySelector('button[aria-label="Advance round"]') as HTMLElement).click();
		}
	});
});
