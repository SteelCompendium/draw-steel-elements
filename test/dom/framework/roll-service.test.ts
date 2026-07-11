// Plan 14 Task 2 (D5 §2.3/§6) — RollService: native RNG, pref-gated Dice Roller
// delegation (capability-detected, never a dependency, always falls back), and
// the cx.roll seam. The dom project supplies the obsidian mock.
import { createRollService, NATIVE_DICE } from '../../../src/framework/roll/service';
import { detectDiceRoller } from '../../../src/framework/roll/diceBridge';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage, PreferenceStore } from '../../../src/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { prefUi } from '../../../src/prefs/catalog';
import type { DiceSource } from '../../../src/framework/roll/types';
import type { App } from 'obsidian';

function makeStore(): PreferenceStore {
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const store = createPreferenceStore(storage);
	store.describe(DSE_PREF_DESCRIPTORS);
	return store;
}

/** Fake app.plugins shape (Obsidian's is untyped/private — the bridge reads it dynamically). */
function makeApp(api: unknown, enabled = true): App {
	return {
		plugins: {
			enabledPlugins: new Set(enabled ? ['obsidian-dice-roller'] : []),
			plugins: { 'obsidian-dice-roller': api === undefined ? undefined : { api } },
		},
	} as unknown as App;
}

const seeded = (faces: number[]): DiceSource => {
	let i = 0;
	return { rollDie: () => faces[i++] };
};

describe('D5 §2.3 — native service', () => {
	test('NATIVE_DICE stays in 1..sides across a sweep', () => {
		for (let i = 0; i < 500; i++) {
			const face = NATIVE_DICE.rollDie(10);
			expect(face).toBeGreaterThanOrEqual(1);
			expect(face).toBeLessThanOrEqual(10);
			expect(Number.isInteger(face)).toBe(true);
		}
	});

	test('resolve() uses caller-supplied dice (pure path re-exposed)', () => {
		const service = createRollService(makeStore());
		const r = service.resolve({ mode: 'power-roll' }, seeded([9, 10]));
		expect(r.natural).toBe(19);
		expect(r.isNat).toBe(true);
	});

	test('roll() resolves asynchronously with the native source by default', async () => {
		const service = createRollService(makeStore());
		expect(service.delegate).toBe('native');
		const r = await service.roll({ mode: 'power-roll' });
		expect(r.dice).toHaveLength(2);
		expect(r.natural).toBeGreaterThanOrEqual(2);
		expect(r.natural).toBeLessThanOrEqual(20);
	});
});

describe('D5 §6.1 — detectDiceRoller (capability-based, null on any failure)', () => {
	test('plugin not enabled → null', () => {
		expect(detectDiceRoller(makeApp({ roll: async () => 4 }, false))).toBeNull();
	});

	test('api missing or without a roll function → null', () => {
		expect(detectDiceRoller(makeApp(undefined))).toBeNull();
		expect(detectDiceRoller(makeApp({ roll: 'not-a-function' }))).toBeNull();
	});

	test('throwing plugins accessor → null (never propagates)', () => {
		const app = {
			get plugins(): never {
				throw new Error('boom');
			},
		} as unknown as App;
		expect(detectDiceRoller(app)).toBeNull();
	});

	test('capable api → a bridge that returns per-die faces', async () => {
		const rolls: string[] = [];
		const bridge = detectDiceRoller(
			makeApp({ roll: async (formula: string) => (rolls.push(formula), 7) }),
		);
		expect(bridge).not.toBeNull();
		await expect(bridge!.rollDice(2, 10)).resolves.toEqual([7, 7]);
		expect(rolls).toEqual(['1d10', '1d10']); // per-die so natural/nat-19–20 stay exact (§6.2)
	});

	test('a { result: n } payload is unwrapped; junk payloads throw inside the bridge', async () => {
		const bridge = detectDiceRoller(makeApp({ roll: async () => ({ result: 3 }) }));
		await expect(bridge!.rollDice(1, 10)).resolves.toEqual([3]);
		const bad = detectDiceRoller(makeApp({ roll: async () => 'NaN-city' }));
		await expect(bad!.rollDice(1, 10)).rejects.toThrow();
	});
});

describe('D5 §6.3 — delegation is pref-gated and always falls back', () => {
	test('pref native → native even when the plugin is detected', async () => {
		const service = createRollService(makeStore(), makeApp({ roll: async () => 5 }));
		expect(service.delegate).toBe('native');
	});

	test('pref dice-roller + detected → delegate reported, faces come from the bridge', async () => {
		const store = makeStore();
		await store.set('rollerEngine', 'dice-roller');
		const service = createRollService(store, makeApp({ roll: async () => 5 }));
		expect(service.delegate).toBe('dice-roller');
		const r = await service.roll({ mode: 'power-roll' });
		expect(r.dice).toEqual([5, 5]);
		expect(r.natural).toBe(10);
	});

	test('pref dice-roller but NOT detected → transparent native fallback', async () => {
		const store = makeStore();
		await store.set('rollerEngine', 'dice-roller');
		const service = createRollService(store, makeApp(undefined));
		expect(service.delegate).toBe('native');
		const r = await service.roll({ mode: 'power-roll' });
		expect(r.dice).toHaveLength(2);
	});

	test('a bridge that starts THROWING mid-session → next roll() falls back to native', async () => {
		const store = makeStore();
		await store.set('rollerEngine', 'dice-roller');
		const service = createRollService(
			store,
			makeApp({ roll: async () => { throw new Error('bridge broke'); } }),
		);
		const r = await service.roll({ mode: 'power-roll' }); // must not reject (§6: can never break rolling)
		expect(r.dice).toHaveLength(2);
	});

	test('flat mode draws flat.count dice of flat.sides through the bridge', async () => {
		const store = makeStore();
		await store.set('rollerEngine', 'dice-roller');
		const formulas: string[] = [];
		const service = createRollService(
			store,
			makeApp({ roll: async (f: string) => (formulas.push(f), 2) }),
		);
		const r = await service.roll({ mode: 'flat', flat: { count: 3, sides: 6, bonus: 1 } });
		expect(formulas).toEqual(['1d6', '1d6', '1d6']);
		expect(r.total).toBe(7);
	});
});

describe('catalog: rollerEngine row is now visible (D5 shipped its consumer)', () => {
	test('rollerEngine ui.hidden is gone', () => {
		const d = DSE_PREF_DESCRIPTORS.find((x) => (x.key as string) === 'rollerEngine')!;
		expect(prefUi(d)!.hidden).toBeUndefined();
	});
});
