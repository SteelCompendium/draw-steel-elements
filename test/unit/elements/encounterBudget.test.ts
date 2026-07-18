// D8 Task 4 (spec §2.2, OD-2) — pure math tests for the Encounter Builder's budget.ts:
// no DOM, no compendium, no async — exactly the interfaces the brief pins.
import { bandTable, budgetTable, computeEncounter, parseEv, spentEv, victoryPayout } from '@/elements/encounter/budget';

describe('D8 Task 4: parseEv (defensive — ev is a STRING on the SDK model, recon delta 5)', () => {
	test('parses a plain numeric string', () => {
		expect(parseEv('40')).toBe(40);
	});

	test('parses the first integer out of a decorated string', () => {
		expect(parseEv('~120 (minion)')).toBe(120);
	});

	test('undefined parses to 0', () => {
		expect(parseEv(undefined)).toBe(0);
	});

	test('a non-numeric string parses to 0 rather than throwing', () => {
		expect(parseEv('unknown')).toBe(0);
	});

	test('a number passes through as-is', () => {
		expect(parseEv(7)).toBe(7);
	});
});

describe('D8 Task 4: spentEv — Σ count × parseEv(ev), every term from real data', () => {
	test('sums per-row count × ev', () => {
		expect(
			spentEv([
				{ count: 6, ev: '4' },
				{ count: 1, ev: '20' },
			]),
		).toBe(44);
	});

	test('empty rows spend 0', () => {
		expect(spentEv([])).toBe(0);
	});
});

describe('D8 Task 4: victoryPayout — REF §13 / AGENT Part 12 (citable, not parameterized)', () => {
	test('hard awards 2', () => {
		expect(victoryPayout('hard')).toBe(2);
	});

	test('extreme awards 2', () => {
		expect(victoryPayout('extreme')).toBe(2);
	});

	test('standard awards 1', () => {
		expect(victoryPayout('standard')).toBe(1);
	});

	test('null (no band — budget unset) awards 1', () => {
		expect(victoryPayout(null)).toBe(1);
	});
});

describe('D8 Task 4: budgetTable — OD-2 parameterized default (configured vs unconfigured cell)', () => {
	test('a known cell (within the shipped 1-10 level / 1-6 party-size range) returns a number', () => {
		const budget = budgetTable(4, 3);
		expect(typeof budget).toBe('number');
		expect(budget).toBeGreaterThan(0);
	});

	test('an unconfigured cell (outside the shipped range) returns null, not a guess', () => {
		expect(budgetTable(4, 99)).toBeNull();
		expect(budgetTable(0, 3)).toBeNull();
	});
});

describe('D8 Task 4: bandTable — ratio -> band (default thresholds, spec §2.5 worked example)', () => {
	test('ratio 1.1 (spec §2.5\'s own worked example: spent 44 / budget 40) reads "hard"', () => {
		expect(bandTable(1.1)).toBe('hard');
	});

	test('a low ratio reads "trivial"', () => {
		expect(bandTable(0.1)).toBe('trivial');
	});

	test('a ratio well past the last threshold reads "extreme"', () => {
		expect(bandTable(3)).toBe('extreme');
	});
});

describe('D8 Task 4: computeEncounter — assembles the whole EncounterComputed', () => {
	test('a configured budget: spent/budget/ratio/band/victories all populated', () => {
		const computed = computeEncounter(
			[
				{ count: 6, ev: '3' },
				{ count: 1, ev: '96' },
			],
			{ hero_count: 4, hero_level: 3 },
		);
		expect(computed.spent_ev).toBe(114);
		expect(computed.budget).toBe(budgetTable(4, 3));
		expect(computed.ratio).toBeCloseTo(114 / (computed.budget as number));
		expect(computed.band).toBe(bandTable(computed.ratio as number));
		expect(computed.victories).toBe(victoryPayout(computed.band));
	});

	test('an unconfigured budget: spent EV still populated, budget/ratio/band all null, victories defaults to 1', () => {
		const computed = computeEncounter([{ count: 6, ev: '3' }], { hero_count: 4, hero_level: 99 });
		expect(computed.spent_ev).toBe(18);
		expect(computed.budget).toBeNull();
		expect(computed.ratio).toBeNull();
		expect(computed.band).toBeNull();
		expect(computed.victories).toBe(1);
	});

	test('an injected table overrides the shipped default (settings seam)', () => {
		const computed = computeEncounter([{ count: 1, ev: '10' }], { hero_count: 1, hero_level: 1 }, {
			budgetTable: () => 5,
			bandTable: () => 'extreme',
		});
		expect(computed.budget).toBe(5);
		expect(computed.ratio).toBe(2);
		expect(computed.band).toBe('extreme');
		expect(computed.victories).toBe(2);
	});
});
