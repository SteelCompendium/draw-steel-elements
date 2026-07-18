// D7 Task 8 (spec §1.1) — deriveHeroStats: pure derived-stat math over an already-resolved
// hero definition. Fury/Mountain field values below are copied verbatim from the real
// compendium fixtures this task also seeded (test/fixtures/md-dse/class/fury.md,
// test/fixtures/md-dse/kit/mountain.md — themselves copies of data-unified/en/unified/
// md-dse/{class,kit}/{fury,mountain}.md) so the "48 max stamina" expectation below is the
// SAME number spec §3.2's own ASCII mockup and hero/example.yaml's `max_stamina: 48`
// comment cite for a level-3 Fury with a Mountain kit — not a number invented for this test.
import { Class, Kit } from 'steel-compendium-sdk';
import { deriveHeroStats } from '../../../src/elements/hero/deriveHeroStats';
import type { HeroDefn } from '../../../src/elements/hero/model';
import type { ResolvedHeroDefinition } from '../../../src/elements/hero/resolve';

function baseDefn(overrides: Partial<HeroDefn> = {}): HeroDefn {
	return {
		name: 'Torin Stonefist',
		level: 3,
		characteristics: { might: 2, agility: 2, reason: -1, intuition: 0, presence: 1 },
		...overrides,
	};
}

/** Fury: data-unified/en/unified/md-dse/class/fury.md frontmatter, verbatim. */
const FURY = new Class({
	name: 'Fury',
	starting_stamina: 21,
	stamina_per_level: 9,
	recoveries: 10,
});

/** Mountain: data-unified/en/unified/md-dse/kit/mountain.md frontmatter, verbatim
 *  (including the embedded markdown link the real file authors around "echelon"). */
const MOUNTAIN = new Kit({
	name: 'Mountain',
	stability_bonus: '+2',
	stamina_bonus: '+9 per [echelon](scc.v1:mcdm.heroes.v1/rule.general/echelon)',
});

function resolved(over: Partial<ResolvedHeroDefinition> = {}): ResolvedHeroDefinition {
	return { kits: [], issues: [], ...over };
}

describe('D7 Task 8: deriveHeroStats (spec §1.1)', () => {
	test('Fury L3 + Mountain kit: max stamina / recovery value / winded / death match the cited formulas', () => {
		const defn = baseDefn();
		const stats = deriveHeroStats(
			defn,
			resolved({
				class: { code: 'mcdm.heroes.v1/class/fury', name: 'Fury', model: FURY },
				kits: [{ code: 'mcdm.heroes.v1/kit/mountain', name: 'Mountain', model: MOUNTAIN }],
			}),
		);

		// 21 (starting) + 9/level * (3-1) + 9/echelon * echelon(1) = 21 + 18 + 9 = 48
		// (spec §3.2's mockup and hero/example.yaml's `max_stamina: 48` comment both cite
		// this exact number for this exact build).
		expect(stats.maxStamina).toEqual({ value: 48, source: 'derived' });
		// RR §8: recovery value = floor(max / 3) = floor(48/3) = 16.
		expect(stats.recoveryValue).toEqual({ value: 16, source: 'derived' });
		// RR §8: winded threshold = floor(max / 2) = floor(48/2) = 24.
		expect(stats.windedThreshold).toEqual({ value: 24, source: 'derived' });
		// spec §1.1: death threshold = -winded = -24.
		expect(stats.deathThreshold).toEqual({ value: -24, source: 'derived' });
		// AR: Fury recoveries = 10 (Class.recoveries, class-derived).
		expect(stats.recoveriesMax).toEqual({ value: 10, source: 'derived' });
		// spec §1.2: Fury's resource is Ferocity (via the shared RESOURCE_BY_CLASS table).
		expect(stats.resource.source).toBe('derived');
		expect(stats.resource.value.type).toBe('Ferocity');
	});

	test('a second kit\'s stamina bonus stacks (Tactician Field Arsenal — two kits equipped)', () => {
		const secondKit = new Kit({ name: 'Panther', stamina_bonus: '+6 per echelon' });
		const stats = deriveHeroStats(
			baseDefn({ level: 1 }),
			resolved({
				class: { code: 'x', name: 'Fury', model: FURY },
				kits: [
					{ code: 'mcdm.heroes.v1/kit/mountain', name: 'Mountain', model: MOUNTAIN },
					{ code: 'mcdm.heroes.v1/kit/panther', name: 'Panther', model: secondKit },
				],
			}),
		);
		// 21 + 9*(1-1) + (9+6)*echelon(1) = 21 + 0 + 15 = 36.
		expect(stats.maxStamina).toEqual({ value: 36, source: 'derived' });
	});

	test('explicit max_stamina override wins over the class/kit derivation and is flagged "authored"', () => {
		const defn = baseDefn({ max_stamina: 999 });
		const stats = deriveHeroStats(
			defn,
			resolved({
				class: { code: 'mcdm.heroes.v1/class/fury', name: 'Fury', model: FURY },
				kits: [{ code: 'mcdm.heroes.v1/kit/mountain', name: 'Mountain', model: MOUNTAIN }],
			}),
		);
		expect(stats.maxStamina).toEqual({ value: 999, source: 'authored' });
		// Recovery/winded/death still derive FROM the (now authored) max — 999 isn't itself
		// an authorable field, so these stay "derived", computed off the override.
		expect(stats.recoveryValue).toEqual({ value: 333, source: 'derived' });
		expect(stats.windedThreshold).toEqual({ value: 499, source: 'derived' });
		expect(stats.deathThreshold).toEqual({ value: -499, source: 'derived' });
	});

	test('explicit recoveries_max/resource overrides win independently of class resolution', () => {
		const defn = baseDefn({
			max_stamina: 40,
			recoveries_max: 7,
			resource: { type: 'Custom Points', min: -2 },
		});
		const stats = deriveHeroStats(defn, resolved());
		expect(stats.recoveriesMax).toEqual({ value: 7, source: 'authored' });
		expect(stats.resource).toEqual({ value: { type: 'Custom Points', min: -2, gainHint: '' }, source: 'authored' });
	});

	test('missing class + no override -> every class-dependent stat is null/"unavailable"', () => {
		const defn = baseDefn();
		const withIssue = resolved({
			issues: [{ field: 'class', code: 'mcdm.heroes.v1/class/fury', reason: '"fury" not found in compendium — sync compendium?' }],
		});

		const stats = deriveHeroStats(defn, withIssue);

		expect(stats.maxStamina).toEqual({ value: null, source: 'unavailable' });
		expect(stats.recoveryValue).toEqual({ value: null, source: 'unavailable' });
		expect(stats.windedThreshold).toEqual({ value: null, source: 'unavailable' });
		expect(stats.deathThreshold).toEqual({ value: null, source: 'unavailable' });
		expect(stats.recoveriesMax).toEqual({ value: null, source: 'unavailable' });
		expect(stats.resource).toEqual({ value: { type: 'Resource', min: 0, gainHint: '' }, source: 'unavailable' });
		// The issue explaining WHY class-dependent stats are unavailable travels alongside
		// (resolve.ts's job to produce it — deriveHeroStats itself is issue-agnostic, but
		// this pins the end-to-end contract the sheet (Task 9) relies on).
		expect(withIssue.issues).toHaveLength(1);
		expect(withIssue.issues[0].field).toBe('class');
	});

	test('an unresolved kit ref degrades that kit\'s bonus only — class-only stamina still computes', () => {
		// One kit slot authored, zero resolved (simulating an unresolvable kit ref) — the
		// resolve layer omits the slot rather than producing a hole (spec §3.5 "still fully
		// functional"); deriveHeroStats just sums whatever DID resolve.
		const stats = deriveHeroStats(
			baseDefn({ kits: ['scc.v1:mcdm.heroes.v1/kit/nonesuch'] }),
			resolved({ class: { code: 'mcdm.heroes.v1/class/fury', name: 'Fury', model: FURY }, kits: [] }),
		);
		// 21 + 9*2 + 0 (no kit bonus resolved) = 39.
		expect(stats.maxStamina).toEqual({ value: 39, source: 'derived' });
	});

	test('a kit with no stamina_bonus field contributes nothing (defensive parse, not a throw)', () => {
		const bareKit = new Kit({ name: 'Sniper', speed_bonus: '+1' });
		const stats = deriveHeroStats(
			baseDefn({ level: 1 }),
			resolved({ class: { code: 'x', name: 'Fury', model: FURY }, kits: [{ code: 'x', name: 'Sniper', model: bareKit }] }),
		);
		expect(stats.maxStamina).toEqual({ value: 21, source: 'derived' });
	});
});
