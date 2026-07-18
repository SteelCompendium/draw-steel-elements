// D8 Task 4 (spec §2.2, OD-2) — pure math tests for the Encounter Builder's budget.ts:
// no DOM, no compendium, no async — exactly the interfaces the brief pins.
import {
	bandTable,
	budgetTable,
	computeEncounter,
	parseEv,
	parseEvInfo,
	rowEv,
	spentEv,
	victoryAdjustment,
	victoryPayout,
} from '@/elements/encounter/budget';

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

describe('Task 4 review round 1, Finding 1 (CRITICAL): parseEvInfo/rowEv — "N for four minions" prices a SQUAD of four', () => {
	test('parseEvInfo flags the real corpus minion convention as perFour (skitterling.md: "3 for four minions")', () => {
		expect(parseEvInfo('3 for four minions')).toEqual({ value: 3, perFour: true });
	});

	test('parseEvInfo does NOT flag a plain numeric ev string as perFour (goblin-stinker.md: "3")', () => {
		expect(parseEvInfo('3')).toEqual({ value: 3, perFour: false });
	});

	test('parseEvInfo on undefined/non-numeric stays 0, never perFour', () => {
		expect(parseEvInfo(undefined)).toEqual({ value: 0, perFour: false });
		expect(parseEvInfo('unknown')).toEqual({ value: 0, perFour: false });
	});

	test('reviewer repro: 8 Skitterlings @ "3 for four minions" spend 6, not 24 (the pre-fix 4x overcount)', () => {
		expect(rowEv(8, '3 for four minions')).toBe(6);
	});

	test('rowEv rounds UP to the next full squad of four (Math.ceil), mirroring sc-encounter-core.js pickCost', () => {
		expect(rowEv(1, '3 for four minions')).toBe(3); // 1 minion still buys a squad of 4
		expect(rowEv(4, '3 for four minions')).toBe(3);
		expect(rowEv(5, '3 for four minions')).toBe(6); // rounds up to 2 squads
		expect(rowEv(0, '3 for four minions')).toBe(0);
	});

	test('non-minion control: a plain "3" ev (Horde organization, goblin-stinker.md) still prices per-individual', () => {
		expect(rowEv(6, '3')).toBe(18); // unaffected by the minion fix — count × ev
	});

	test('parseEv (bare magnitude) is unaffected by perFour — still returns the raw number', () => {
		expect(parseEv('3 for four minions')).toBe(3);
	});
});

describe('D8 Task 4: spentEv — Σ rowEv(row.count, row.ev), every term from real data', () => {
	test('sums per-row count × ev for plain (non-minion) rows', () => {
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

	test('a mixed roster: a minion squad (perFour) + a solo monster (plain), each priced by its own rule', () => {
		expect(
			spentEv([
				{ count: 8, ev: '3 for four minions' }, // 2 squads of 4 -> 6
				{ count: 1, ev: '96' }, // solo -> 96
			]),
		).toBe(102);
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

describe('Task 4 review round 1, Finding 3 (LOW): victoryAdjustment — sc-encounter-core.js partyES victory term', () => {
	test('0 or 1 victories add nothing (need 2 to add "one hero")', () => {
		expect(victoryAdjustment(3, 0)).toBe(0);
		expect(victoryAdjustment(3, 1)).toBe(0);
	});

	test('2 victories add one heroEncounterStrength(level) worth of budget', () => {
		// heroEncounterStrength(3) = 4 + 2*3 = 10
		expect(victoryAdjustment(3, 2)).toBe(10);
	});

	test('5 victories floor to 2 extra "heroes" (floor(5/2) = 2)', () => {
		expect(victoryAdjustment(3, 5)).toBe(20);
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

	test('an injected table with no victoryAdjustment (pre-Finding-3 shape) still type-checks and applies no adjustment', () => {
		const computed = computeEncounter([{ count: 1, ev: '10' }], { hero_count: 1, hero_level: 1, victories: 4 }, {
			budgetTable: () => 5,
			bandTable: () => 'extreme',
		});
		expect(computed.budget).toBe(5); // no victoryAdjustment injected -> +0, not a crash
	});

	test('Finding 3: party.victories shifts the budget via victoryAdjustment (site core partyES formula)', () => {
		// heroEncounterStrength(3) = 10; 2 victories -> +10 budget over the unadjusted table cell.
		const withoutVictories = computeEncounter([{ count: 6, ev: '3' }], { hero_count: 4, hero_level: 3 });
		const withVictories = computeEncounter([{ count: 6, ev: '3' }], { hero_count: 4, hero_level: 3, victories: 2 });
		expect(withVictories.budget).toBe((withoutVictories.budget as number) + 10);
	});

	test("Finding 3: victories never applies to an unset budget — stays null, doesn't fabricate a number", () => {
		const computed = computeEncounter([{ count: 6, ev: '3' }], { hero_count: 4, hero_level: 99, victories: 10 });
		expect(computed.budget).toBeNull();
	});
});
