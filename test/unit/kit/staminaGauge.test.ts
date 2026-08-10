// SC-132 / SC-133 — the stamina gauge's coordinate model.
//
// This is the module three surfaces share (the element/hero cluster and both modal
// previews), and the reason SC-133 exists: when each surface computed its own geometry
// they disagreed about where temp stamina lives, so a temp-only edit was invisible in
// the modal. The properties pinned here are the ones that disagreement violated.
import { staminaGaugeGeometry, staminaState } from '@/framework/kit';

const HERO = { dyingZone: true } as const;

describe('SC-132: staminaState (RR §8 "Stamina and Death")', () => {
	test('winded is AT half max or below — inclusive, so the bar and the badge agree at the boundary', () => {
		// FOLLOWUPS #27a: this was a strict `<` once, and the two indicators disagreed at
		// exactly half stamina.
		expect(staminaState({ current: 16, temp: 0, max: 30 })).toBe('healthy');
		expect(staminaState({ current: 15, temp: 0, max: 30 })).toBe('winded');
	});

	test('dying is at 0 or below and takes priority over winded', () => {
		expect(staminaState({ current: 1, temp: 0, max: 30 })).toBe('winded');
		expect(staminaState({ current: 0, temp: 0, max: 30 })).toBe('dying');
		expect(staminaState({ current: -7, temp: 0, max: 30 })).toBe('dying');
	});
});

describe('SC-132: the zero-bulkhead coordinate model', () => {
	test('the bulkhead sits at max/2 of the whole [-max/2 … +max] space, and the pour starts THERE', () => {
		const g = staminaGaugeGeometry({ current: 30, temp: 0, max: 30 }, HERO);
		// 15 of 45 = 33.33% of the channel is the dying reserve.
		expect(g.zone).toBeCloseTo(100 / 3, 6);
		// A full hero fills the whole positive region and no more.
		expect(g.pourW).toBeCloseTo(200 / 3, 6);
		expect(g.zone + g.pourW).toBeCloseTo(100, 6);
	});

	test('green and red never share a pixel: the wound is zero until stamina is actually negative', () => {
		expect(staminaGaugeGeometry({ current: 1, temp: 0, max: 30 }, HERO).woundW).toBe(0);
		expect(staminaGaugeGeometry({ current: 0, temp: 0, max: 30 }, HERO).woundW).toBe(0);
		const hurt = staminaGaugeGeometry({ current: -5, temp: 0, max: 30 }, HERO);
		// 5 of the 15-deep reserve = a third of the zone.
		expect(hurt.woundW).toBeCloseTo(hurt.zone / 3, 6);
		// …and the pour is empty, because there is no stamina to pour.
		expect(hurt.pourW).toBe(0);
	});

	test('the wound cannot exceed the reserve even past the death threshold', () => {
		const g = staminaGaugeGeometry({ current: -99, temp: 0, max: 30 }, HERO);
		expect(g.woundW).toBeCloseTo(g.zone, 6);
	});

	test('the winded graduation sits at half max, measured on the same scale as the pour', () => {
		const g = staminaGaugeGeometry({ current: 30, temp: 0, max: 30 }, HERO);
		const halfway = staminaGaugeGeometry({ current: 15, temp: 0, max: 30 }, HERO);
		expect(g.windedX).toBeCloseTo(g.zone + halfway.pourW, 6);
	});
});

describe('SC-133: temp stamina shares the pour\'s origin and scale', () => {
	test('the temp plate starts exactly where the pour ends', () => {
		const g = staminaGaugeGeometry({ current: 11, temp: 4, max: 30 }, HERO);
		expect(g.capX).toBeCloseTo(g.zone + g.pourW, 6);
		expect(g.capW).toBeGreaterThan(0);
	});

	test('the positive region rescales to max + temp, so a FULL hero with temp still has room to draw it', () => {
		// The bug this prevents: on a fixed max-scale, current == max leaves zero room and
		// the temp plate vanishes exactly when it matters most.
		const g = staminaGaugeGeometry({ current: 30, temp: 6, max: 30 }, HERO);
		expect(g.capW).toBeGreaterThan(0);
		expect(g.capX + g.capW).toBeCloseTo(100, 6);
	});

	test('temp GREATER than max cannot overflow the channel', () => {
		const g = staminaGaugeGeometry({ current: 30, temp: 90, max: 30 }, HERO);
		expect(g.capX + g.capW).toBeCloseTo(100, 6);
		expect(g.capW).toBeLessThanOrEqual(100);
	});

	test('the base ceiling keeps its own mark once temp has widened the scale', () => {
		const g = staminaGaugeGeometry({ current: 10, temp: 10, max: 30 }, HERO);
		// max sits at 30/40 of the positive region, NOT at its right edge.
		expect(g.maxX).toBeCloseTo(g.zone + (100 - g.zone) * 0.75, 6);
		expect(g.maxX).toBeLessThan(100);
	});

	test('with no temp the base mark IS the channel edge (which is why the view hides it there)', () => {
		expect(staminaGaugeGeometry({ current: 10, temp: 0, max: 30 }, HERO).maxX).toBeCloseTo(100, 6);
	});

	test('a temp-only change moves geometry even though `current` did not — the SC-133 regression', () => {
		const before = staminaGaugeGeometry({ current: 11, temp: 4, max: 30 }, HERO);
		const after = staminaGaugeGeometry({ current: 11, temp: 0, max: 30 }, HERO);
		expect(after.capW).toBe(0);
		expect(before.capW).toBeGreaterThan(0);
		// …and the pour itself widens, because the denominator shrank back to max.
		expect(after.pourW).toBeGreaterThan(before.pourW);
	});
});

describe('SC-132: surfaces with no negative range', () => {
	test('dyingZone: false collapses the bulkhead onto the left edge (creature / minion pool)', () => {
		const g = staminaGaugeGeometry({ current: 12, temp: 0, max: 24 }, { dyingZone: false });
		expect(g.zone).toBe(0);
		expect(g.pourW).toBeCloseTo(50, 6);
		expect(g.woundW).toBe(0);
	});
});

describe('SC-132: degenerate inputs stay defined (FOLLOWUPS #28)', () => {
	test('max 0 yields defined zeros rather than NaN% (CSS silently drops NaN)', () => {
		const g = staminaGaugeGeometry({ current: 0, temp: 0, max: 0 }, HERO);
		for (const v of Object.values(g)) expect(Number.isFinite(v)).toBe(true);
		expect(g.pourW).toBe(0);
	});

	test('a negative temp is treated as none rather than as a plate growing leftwards', () => {
		expect(staminaGaugeGeometry({ current: 10, temp: -5, max: 30 }, HERO).capW).toBe(0);
	});
});
