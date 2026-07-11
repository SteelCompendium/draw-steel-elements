// Plan 14 Task 1 (D5 §1/§2/§8) — the pure roll engine. Seeded DiceSource replays
// exact faces; every row of the spec §8 matrices is pinned. No DOM, no Obsidian.
import { resolveRoll } from '../../../src/framework/roll/engine';
import type { DiceSource, RollInput } from '../../../src/framework/roll/types';

/** Seeded dice: replays `faces` in order; throws if the engine over-draws. */
function seeded(faces: number[]): DiceSource {
	let i = 0;
	return {
		rollDie: (sides: number): number => {
			if (i >= faces.length) throw new Error('seeded DiceSource exhausted');
			const face = faces[i++];
			if (face < 1 || face > sides) throw new Error(`seeded face ${face} out of 1..${sides}`);
			return face;
		},
	};
}

const roll = (input: Partial<RollInput>, faces: number[]) =>
	resolveRoll({ mode: 'power-roll', ...input }, seeded(faces));

describe('D5 §8.1 — core tier bands (power-roll)', () => {
	// [dice, characteristic, isMainActionAbility, expect: {natural,total,tier,isNat,isCritical}]
	test.each([
		[[1, 1], 0, false, { natural: 2, total: 2, tier: 1, isNat: false, isCritical: false }],
		[[5, 6], 0, false, { natural: 11, total: 11, tier: 1, isNat: false, isCritical: false }],
		[[5, 6], 1, false, { natural: 11, total: 12, tier: 2, isNat: false, isCritical: false }],
		[[8, 8], 0, false, { natural: 16, total: 16, tier: 2, isNat: false, isCritical: false }],
		[[8, 9], 0, false, { natural: 17, total: 17, tier: 3, isNat: false, isCritical: false }],
		[[9, 10], 0, false, { natural: 19, total: 19, tier: 3, isNat: true, isCritical: false }],
		[[9, 10], 0, true, { natural: 19, total: 19, tier: 3, isNat: true, isCritical: true }],
		// THE key nat assertion: total 15 would be tier 2; nat 20 forces tier 3.
		[[10, 10], -5, true, { natural: 20, total: 15, tier: 3, isNat: true, isCritical: true }],
	])('dice %j char %i main:%s → %j', (dice, characteristic, isMainActionAbility, expected) => {
		const r = roll({ characteristic, isMainActionAbility }, dice);
		expect(r.natural).toBe(expected.natural);
		expect(r.total).toBe(expected.total);
		expect(r.tier).toBe(expected.tier);
		expect(r.isNat).toBe(expected.isNat);
		expect(r.isCritical).toBe(expected.isCritical);
		expect(r.dice).toEqual(dice);
	});
});

describe('D5 §8.2 — edges & banes (single = flat, double = shift, cancel, caps)', () => {
	// [edges, banes, dice, expect {net, edgeBaneFlat, total, tier}]
	test.each([
		[1, 0, [5, 6], { net: 1, edgeBaneFlat: 2, total: 13, tier: 2 }],   // single edge = +2
		[0, 1, [5, 6], { net: -1, edgeBaneFlat: -2, total: 9, tier: 1 }],  // single bane = −2
		[2, 0, [5, 6], { net: 2, edgeBaneFlat: 0, total: 11, tier: 2 }],   // double edge: band 1 → shift → 2
		[0, 2, [8, 8], { net: -2, edgeBaneFlat: 0, total: 16, tier: 1 }],  // double bane: band 2 → shift → 1
		[3, 1, [5, 6], { net: 2, edgeBaneFlat: 0, total: 11, tier: 2 }],   // 3e−1b = net +2 (cap)
		[2, 2, [5, 6], { net: 0, edgeBaneFlat: 0, total: 11, tier: 1 }],   // full cancel
		[1, 2, [8, 9], { net: -1, edgeBaneFlat: -2, total: 15, tier: 2 }], // net −1: flat, not shift
		[2, 0, [10, 9], { net: 2, edgeBaneFlat: 0, total: 19, tier: 3 }],  // double edge on nat19: clamp at 3
		[0, 2, [10, 10], { net: -2, edgeBaneFlat: 0, total: 20, tier: 3 }],// double bane on nat20: nat overrides → 3
	])('edges %i banes %i dice %j → %j', (edges, banes, dice, expected) => {
		const r = roll({ edges, banes }, dice);
		expect(r.net).toBe(expected.net);
		expect(r.edgeBaneFlat).toBe(expected.edgeBaneFlat);
		expect(r.total).toBe(expected.total);
		expect(r.tier).toBe(expected.tier);
	});

	test('tierShifted is tier − base (double bane on nat20: base 3, shift −1, nat forces 3 back ⇒ 0)', () => {
		expect(roll({ edges: 0, banes: 2 }, [10, 10]).tierShifted).toBe(0);
		expect(roll({ edges: 2, banes: 0 }, [5, 6]).tierShifted).toBe(1);
		expect(roll({ edges: 0, banes: 2 }, [8, 8]).tierShifted).toBe(-1);
		// nat override can exceed ±1 (OD-D5-11: the reason tierShifted is a number)
		expect(roll({ characteristic: -5, isMainActionAbility: true }, [10, 10]).tierShifted).toBe(1); // base 2 → 3
	});
});

describe('D5 §8.3 — modes', () => {
	test('test mode: same bands, isNat on 19–20, NEVER critical (even main-action)', () => {
		const r = roll({ mode: 'test', isMainActionAbility: true }, [9, 10]);
		expect(r.tier).toBe(3);
		expect(r.isNat).toBe(true);
		expect(r.isCritical).toBe(false);
	});

	test('opposed: no tier; single edge/bane ±2', () => {
		const r = roll({ mode: 'opposed', edges: 1 }, [5, 6]);
		expect(r.tier).toBeUndefined();
		expect(r.edgeBaneFlat).toBe(2);
		expect(r.total).toBe(13);
	});

	test('opposed: DOUBLE edge/bane become flat ±4 (no shift)', () => {
		expect(roll({ mode: 'opposed', edges: 2 }, [5, 6]).edgeBaneFlat).toBe(4);
		expect(roll({ mode: 'opposed', banes: 3 }, [5, 6]).edgeBaneFlat).toBe(-4);
		expect(roll({ mode: 'opposed', edges: 2 }, [5, 6]).total).toBe(15);
	});

	test('flat: sums faces + bonus; no tier/crit; seeded [4] on 1d6+2 ⇒ 6', () => {
		const r = roll({ mode: 'flat', flat: { count: 1, sides: 6, bonus: 2 } }, [4]);
		expect(r.natural).toBe(4);
		expect(r.total).toBe(6);
		expect(r.tier).toBeUndefined();
		expect(r.isNat).toBe(false);
		expect(r.isCritical).toBe(false);
	});

	test('flat: edges/banes are IGNORED (edgeBaneFlat 0)', () => {
		const r = roll({ mode: 'flat', edges: 2, banes: 1, flat: { count: 2, sides: 6 } }, [3, 5]);
		expect(r.edgeBaneFlat).toBe(0);
		expect(r.total).toBe(8);
	});

	test('flat: multi-die expressions draw count faces of the right sides', () => {
		const r = roll({ mode: 'flat', flat: { count: 3, sides: 4, bonus: 1 } }, [1, 4, 2]);
		expect(r.dice).toEqual([1, 4, 2]);
		expect(r.total).toBe(8);
	});
});

describe('D5 §2.2 — totality / clamping (no throws for junk input)', () => {
	test('negative edge/bane counts clamp to 0 (never invert)', () => {
		const r = roll({ edges: -3, banes: -1 }, [5, 6]);
		expect(r.net).toBe(0);
		expect(r.edgeBaneFlat).toBe(0);
	});

	test('flat with a zero/absent dice spec still resolves (defaults 1d10, bonus 0)', () => {
		const r = roll({ mode: 'flat' }, [7]);
		expect(r.total).toBe(7);
	});
});

describe('D5 §8.5 — property/fuzz (seeded PRNG, deterministic)', () => {
	test('for all faces/char/edges/banes: tier ∈ {1,2,3}, nat19–20 ⇒ tier 3, never throws', () => {
		// Tiny LCG so the sweep is deterministic across runs.
		let s = 42;
		const rnd = (n: number) => ((s = (s * 1103515245 + 12345) % 2147483648), s % n);
		for (let i = 0; i < 2000; i++) {
			const d1 = 1 + rnd(10), d2 = 1 + rnd(10);
			const input: RollInput = {
				mode: 'power-roll',
				characteristic: rnd(11) - 5,
				edges: rnd(4),
				banes: rnd(4),
				isMainActionAbility: rnd(2) === 1,
			};
			const r = resolveRoll(input, seeded([d1, d2]));
			expect([1, 2, 3]).toContain(r.tier);
			if (d1 + d2 >= 19) expect(r.tier).toBe(3);
			expect(r.natural).toBe(d1 + d2);
		}
	});
});

describe('D5 §3.5 — breakdown string (every number traceable)', () => {
	test('power-roll breakdown names faces, modifiers, and total', () => {
		const r = roll({ characteristic: 2, skillBonus: 2, edges: 1 }, [8, 9]);
		expect(r.breakdown).toBe('2d10 [8, 9] = 17, +2 characteristic, +2 skill, +2 edge → 23');
	});

	test('double-edge breakdown says the shift, not a flat bonus', () => {
		const r = roll({ edges: 2 }, [5, 6]);
		expect(r.breakdown).toBe('2d10 [5, 6] = 11, double edge → tier +1 → 11');
	});
});
