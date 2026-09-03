// SC-191 impl spec §G (row 2) — montage-tally.test.ts: the tally invariant (§B.3 "Tallies:
// stored, never recomputed") and the outcome band's at-a-glance phrasing (§D), exercised
// through the pure helpers montageTallies(m)/montageBandCopy(m) (slice 1) and
// montageOutcome's fourth `pending` band (slice 2 fix — see the two tests near the bottom
// of the second describe block, updated red-to-green from slice 1's documented-bug marker).
// The board/outcome-band VIEWS that consume these land in slice 2 (impl spec §I) and are
// covered by test/dom/elements/montage.test.ts instead.
import {
	parse,
	serialize,
	montageTallies,
	montageBandCopy,
	montageOutcome,
	logMontageEntry,
	correctMontageEntry,
	removeMontageEntry,
	wouldReuseSkill,
	nextHeroToAct,
	addMontageRound,
	addMontageHero,
	setMontageLimits,
	resetMontageProgress,
	endMontageRound,
	undoLastMontageEntry,
	montageReopenable,
} from '../../../src/elements/montage/model';
import type { MontageModel, MontageEntry } from '../../../src/elements/montage/model';
import { parseYaml } from '../../mocks/obsidian';

const parseLikePipeline = (source: string): MontageModel => parse(parseYaml(source), source);

const base: MontageModel = {
	rounds: 2,
	success_limit: 6,
	failure_limit: 3,
	successes: 0,
	failures: 0,
	current_round: 1,
};

describe('SC-191 §B.3: montageTallies — stored, never recomputed', () => {
	test('reads successes/failures straight off the model scalars, never from entries.length', () => {
		const model: MontageModel = { ...base, successes: 4, failures: 2, entries: [] };
		expect(montageTallies(model)).toMatchObject({ successes: 4, failures: 2 });
	});

	test('a block whose entries disagree with its scalars renders the scalars truthfully, not a recount', () => {
		// One entry on the board, but the stored total already says 4 — the honest reading
		// of "4 successes, provenance unknown" (§B.3). montageTallies must never substitute
		// entries.length (1) for the stored successes (4).
		const model: MontageModel = {
			...base,
			successes: 4,
			failures: 2,
			entries: [{ hero: 'Kira', round: 1, result: 'success' }],
		};
		expect(montageTallies(model).successes).toBe(4);
		expect(montageTallies(model).successes).not.toBe(model.entries!.length);
	});

	test('delta-only write, replicating §C integrity probe 5: an old-shape block (successes: 4, no entries) logs one action and reads successes: 5 with a one-item entries list — not successes: 1', () => {
		const before = parseLikePipeline('rounds: 2\nsuccess_limit: 6\nfailure_limit: 3\nsuccesses: 4\nfailures: 2\ncurrent_round: 2');
		expect(before.entries).toBeUndefined();

		// The write a future board click handler performs (§B.3): `entries.push(e);
		// successes += 1` — a delta on top of the stored total, never `successes =
		// entries.length`.
		const logged: MontageModel = {
			...before,
			entries: [...(before.entries ?? []), { hero: 'Kira', round: 2, result: 'success' }],
			successes: before.successes + 1,
		};
		expect(montageTallies(logged).successes).toBe(5);
		expect(logged.entries).toHaveLength(1);
		expect(montageTallies(logged).successes).not.toBe(logged.entries!.length);

		const reparsed = parseLikePipeline(serialize(logged));
		expect(reparsed.successes).toBe(5);
		expect(reparsed.entries).toHaveLength(1);
	});

	test('correcting an entry (success -> failure) is a paired delta on both totals, never a recompute', () => {
		const logged: MontageModel = { ...base, successes: 1, failures: 0, entries: [{ hero: 'Kira', round: 1, result: 'success' }] };
		const corrected: MontageModel = {
			...logged,
			entries: [{ ...logged.entries![0], result: 'failure' }],
			successes: logged.successes - 1,
			failures: logged.failures + 1,
		};
		expect(montageTallies(corrected)).toMatchObject({ successes: 0, failures: 1 });
	});

	test('removing an entry is `-= 1`, never a recount to entries.length', () => {
		const logged: MontageModel = {
			...base,
			successes: 2,
			failures: 0,
			entries: [
				{ hero: 'Kira', round: 1, result: 'success' },
				{ hero: 'Bo', round: 1, result: 'success' },
			],
		};
		const removed: MontageModel = { ...logged, entries: logged.entries!.slice(1), successes: logged.successes - 1 };
		expect(montageTallies(removed).successes).toBe(1);
		expect(removed.entries).toHaveLength(1);
	});
});

describe('SC-191 §D: montageBandCopy — at-a-glance phrasing (quoted from mock6.js `outcome()`)', () => {
	test('live countdown: "N from Total Success"', () => {
		expect(montageBandCopy({ ...base, successes: 4 }).successTail).toBe('2 from Total Success');
	});

	test('live countdown at 1: "1 from Total Success" (singular)', () => {
		expect(montageBandCopy({ ...base, successes: 5 }).successTail).toBe('1 from Total Success');
	});

	test('live failure countdown: "1 more ends it"', () => {
		expect(montageBandCopy({ ...base, failures: 2 }).failureTail).toBe('1 more ends it');
	});

	// Fix-round-1 L-1: an unset (0-default) limit used to fall into the trivial
	// `toTotal === 0` / `failuresSpare === 0` branch and print the LIVE "reached" copy
	// under a band that cannot possibly mean that (e.g. "Not started", since a vacuous
	// limit and 0/0 nothing-recorded always coincide) — review-1's probe: `sl 0 / fl 0 / 0
	// successes / 0 failures` rendered zero track slots beside "Total Success reached" /
	// "the limit is reached" under the word "Not started". Both tails now name the vacuous
	// case explicitly instead.
	test('no success limit authored: the tail reads "no success limit set", never the live "Total Success reached" (fix-round-1 L-1)', () => {
		expect(montageBandCopy({ ...base, success_limit: 0, successes: 0 }).successTail).toBe('no success limit set');
	});

	test('no failure limit authored: the tail reads "no failure limit set", never the live "the limit is reached" (fix-round-1 L-1)', () => {
		expect(montageBandCopy({ ...base, failure_limit: 0, failures: 0 }).failureTail).toBe('no failure limit set');
	});

	test('an unset limit reads "no limit set" even on an otherwise COMPLETE montage (the other limit reached) — vacuous is checked before complete', () => {
		// success_limit 6 reached (complete=true via montageTallies), failure_limit left at 0.
		expect(montageBandCopy({ ...base, failure_limit: 0, successes: 6, failures: 0 }).failureTail).toBe(
			'no failure limit set',
		);
	});

	test('tensed complete form once the success limit is reached: "the success limit, reached" — not "1 more ends it", round 3\'s bug (mock6.js:944-948)', () => {
		expect(montageBandCopy({ ...base, successes: 6 }).successTail).toBe('the success limit, reached');
	});

	test('tensed complete form, failure track with 1 to spare once the montage is over: "1 under the failure limit"', () => {
		expect(montageBandCopy({ ...base, successes: 6, failures: 2 }).failureTail).toBe('1 under the failure limit');
	});

	test('SC-191 slice 2 fix: at 0/0 (nothing recorded) band reads the fourth `pending` band, not `failure` — the bug round 1 flagged (mock6.js `derive()`)', () => {
		expect(montageBandCopy({ ...base, success_limit: 0, failure_limit: 0, successes: 0, failures: 0 }).band).toBe('pending');
		expect(montageBandCopy({ ...base, success_limit: 0, failure_limit: 0, successes: 0, failures: 0 }).word).toBe('Not started');
	});

	test('pending is keyed off "nothing recorded" (successes === 0 && failures === 0), not off the limits or the round — a montage with limits set but no results yet is still pending', () => {
		expect(montageOutcome({ ...base, successes: 0, failures: 0 })).toBe('pending');
	});

	test('one recorded result is enough to leave pending — a single failure with nothing else reads the live `failure` band, never `pending`', () => {
		expect(montageOutcome({ ...base, successes: 0, failures: 1 })).toBe('failure');
	});
});

// SC-191 SLICE 4 — the write path (spec §C/§D): the actual delta-write helpers the sheet
// and the ⋯ chrome items call, exercised directly (unit-level) rather than only through
// hand-built before/after model literals (the tests above, slice 1/2's own coverage).
describe('SC-191 slice 4: logMontageEntry/correctMontageEntry/removeMontageEntry — delta writes, never a recount', () => {
	function withRoster(): MontageModel {
		return {
			...base,
			participants: [
				{ name: 'Kira', skills_used: ['Nature'] },
				{ name: 'Bram', skills_used: [] },
			],
		};
	}

	test('logMontageEntry appends the entry, deltas the matching tally, and appends the skill occurrence', () => {
		const m = withRoster();
		logMontageEntry(m, { hero: 'Bram', round: 1, result: 'success', skill: 'Endurance' });
		expect(m.entries).toEqual([{ hero: 'Bram', round: 1, result: 'success', skill: 'Endurance' }]);
		expect(m.successes).toBe(1);
		expect(m.failures).toBe(0);
		expect(m.participants![1].skills_used).toEqual(['Endurance']);
	});

	test('logMontageEntry on an OLD-SHAPE model (successes: 4, no entries) — §C integrity probe 5: reads successes: 5 with a one-item entries list, never successes: 1', () => {
		const before = parse(parseYaml('rounds: 2\nsuccess_limit: 6\nfailure_limit: 3\nsuccesses: 4\nfailures: 2\ncurrent_round: 2'), '');
		expect(before.entries).toBeUndefined();
		logMontageEntry(before, { hero: 'Kira', round: 2, result: 'success' });
		expect(before.successes).toBe(5);
		expect(before.entries).toHaveLength(1);
	});

	test('logMontageEntry never touches the tally for an `assist` result', () => {
		const m = withRoster();
		logMontageEntry(m, { hero: 'Bram', round: 1, result: 'assist' });
		expect(m.successes).toBe(0);
		expect(m.failures).toBe(0);
	});

	test('correctMontageEntry (success -> failure): undoes the old tally/skill, applies the new — Scott\'s ticket case ("that 13 was really a 17")', () => {
		const m = withRoster();
		const entry: MontageEntry = { hero: 'Kira', round: 1, result: 'failure', skill: 'Climb' };
		m.entries = [entry];
		m.successes = 0;
		m.failures = 1;
		m.participants![0].skills_used = ['Nature', 'Climb'];
		correctMontageEntry(m, entry, { hero: 'Kira', round: 1, result: 'success', skill: 'Climb' });
		expect(m.successes).toBe(1);
		expect(m.failures).toBe(0);
		// The skill is UNCHANGED across the correction — removed once, re-added once, net
		// one occurrence, not two and not zero.
		expect(m.participants![0].skills_used).toEqual(['Nature', 'Climb']);
		expect(m.entries).toEqual([{ hero: 'Kira', round: 1, result: 'success', skill: 'Climb' }]);
	});

	test('correctMontageEntry can move an entry to a different hero/round, deltaing both heroes\' skill lists', () => {
		const m = withRoster();
		const entry: MontageEntry = { hero: 'Kira', round: 1, result: 'success', skill: 'Nature' };
		m.entries = [entry];
		m.successes = 1;
		correctMontageEntry(m, entry, { hero: 'Bram', round: 1, result: 'success', skill: 'Endurance' });
		expect(m.successes).toBe(1); // success -> success, no tally change
		expect(m.participants![0].skills_used).toEqual([]); // Nature removed from Kira
		expect(m.participants![1].skills_used).toEqual(['Endurance']); // added to Bram
		expect(m.entries).toEqual([{ hero: 'Bram', round: 1, result: 'success', skill: 'Endurance' }]);
	});

	test('removeMontageEntry undoes the tally/skill contribution and splices the entry out, restoring `undefined` once empty', () => {
		const m = withRoster();
		const entry: MontageEntry = { hero: 'Kira', round: 1, result: 'failure', skill: 'Nature' };
		m.entries = [entry];
		m.failures = 1;
		removeMontageEntry(m, entry);
		expect(m.failures).toBe(0);
		expect(m.entries).toBeUndefined();
		expect(m.participants![0].skills_used).toEqual([]);
	});

	test('a tally never goes negative when undoing a stale/hand-edited scalar', () => {
		const m = withRoster();
		m.successes = 0;
		const entry: MontageEntry = { hero: 'Kira', round: 1, result: 'success' };
		removeMontageEntry(m, entry);
		expect(m.successes).toBe(0);
	});
});

describe('SC-191 slice 4: wouldReuseSkill / nextHeroToAct — the sheet\'s live-read helpers', () => {
	test('wouldReuseSkill: true once the hero has already used the skill', () => {
		const m = withRosterFixture();
		expect(wouldReuseSkill(m, 'Kira', 'Nature')).toBe(true);
		expect(wouldReuseSkill(m, 'Kira', 'Endurance')).toBe(false);
	});

	test('wouldReuseSkill excludes the entry being edited — correcting an entry back onto its OWN unchanged skill never warns against itself', () => {
		const m = withRosterFixture();
		const entry: MontageEntry = { hero: 'Kira', round: 1, result: 'success', skill: 'Nature' };
		m.entries = [entry];
		expect(wouldReuseSkill(m, 'Kira', 'Nature', entry)).toBe(false);
		// A DIFFERENT hero picking the same skill text still warns normally — exclusion is
		// keyed to entry.hero, not to the skill string alone.
		expect(wouldReuseSkill(m, 'Bram', 'Nature', entry)).toBe(false); // Bram never used it
	});

	test('nextHeroToAct: the first roster-order hero with no entry in the CURRENT round', () => {
		const m = withRosterFixture();
		m.current_round = 1;
		m.entries = [{ hero: 'Kira', round: 1, result: 'success' }];
		expect(nextHeroToAct(m)).toBe('Bram');
	});

	test('nextHeroToAct: undefined once every roster hero has acted this round', () => {
		const m = withRosterFixture();
		m.current_round = 1;
		m.entries = [
			{ hero: 'Kira', round: 1, result: 'success' },
			{ hero: 'Bram', round: 1, result: 'failure' },
		];
		expect(nextHeroToAct(m)).toBeUndefined();
	});

	function withRosterFixture(): MontageModel {
		return {
			...base,
			participants: [
				{ name: 'Kira', skills_used: ['Nature'] },
				{ name: 'Bram', skills_used: [] },
			],
		};
	}
});

describe('SC-191 slice 4: the ⋯ chrome item config helpers', () => {
	test('addMontageRound extends `rounds` by one', () => {
		const m = { ...base, rounds: 3 };
		addMontageRound(m);
		expect(m.rounds).toBe(4);
	});

	test('addMontageHero appends a new roster entry with no skill history', () => {
		const m: MontageModel = { ...base };
		addMontageHero(m, 'Osric');
		expect(m.participants).toEqual([{ name: 'Osric', skills_used: [] }]);
		addMontageHero(m, 'Yenna');
		expect(m.participants!.map((p) => p.name)).toEqual(['Osric', 'Yenna']);
	});

	test('setMontageLimits sets both limits, clamping a negative input to 0', () => {
		const m = { ...base };
		setMontageLimits(m, 8, -3);
		expect(m.success_limit).toBe(8);
		expect(m.failure_limit).toBe(0);
	});

	test('resetMontageProgress zeroes successes/failures/current_round/entries and every participant\'s skills_used, keeping the roster/config', () => {
		const m: MontageModel = {
			...base,
			title: 'Cross the Gap',
			successes: 4,
			failures: 2,
			current_round: 3,
			participants: [{ name: 'Kira', skills_used: ['Nature', 'Climb'] }],
			entries: [{ hero: 'Kira', round: 1, result: 'success', skill: 'Nature' }],
		};
		resetMontageProgress(m);
		expect(m.successes).toBe(0);
		expect(m.failures).toBe(0);
		expect(m.current_round).toBe(1);
		expect(m.entries).toBeUndefined();
		expect(m.participants).toEqual([{ name: 'Kira', skills_used: [] }]);
		// Config survives.
		expect(m.title).toBe('Cross the Gap');
		expect(m.success_limit).toBe(base.success_limit);
	});
});

// SC-191 FIX ROUND 2 (ledger 2026-09-03) — the bottom action bar's three model helpers.
describe('SC-191 fix round 2: endMontageRound / undoLastMontageEntry / montageReopenable', () => {
	test('endMontageRound advances `current_round` by one — confirmed the ONLY other writers are parse() and resetMontageProgress()', () => {
		const m = { ...base, current_round: 2 };
		endMontageRound(m);
		expect(m.current_round).toBe(3);
	});

	test('ending the last round exhausts the montage (isExhausted via current_round > rounds) — montageTallies.complete flips live, no separate write', () => {
		const m = { ...base, rounds: 3, current_round: 3, success_limit: 0, failure_limit: 0 };
		expect(montageTallies(m).complete).toBe(false);
		endMontageRound(m);
		expect(m.current_round).toBe(4);
		expect(montageTallies(m).complete).toBe(true);
	});

	test('undoLastMontageEntry removes the LAST entry (log order, never a round/hero sort) and restores its tally/skill contribution', () => {
		const m: MontageModel = {
			...base,
			participants: [{ name: 'Kira', skills_used: ['Nature'] }],
			entries: [
				{ hero: 'Kira', round: 2, result: 'success', skill: 'Nature' }, // logged first despite round 2
				{ hero: 'Kira', round: 1, result: 'failure' }, // logged SECOND, despite round 1 — out-of-order log
			],
			successes: 1,
			failures: 1,
		};
		undoLastMontageEntry(m);
		// The round-1 failure (last PUSHED) is undone, not the round-2 success — proves the
		// tie-break is array/log order, not a round-number sort.
		expect(m.entries).toEqual([{ hero: 'Kira', round: 2, result: 'success', skill: 'Nature' }]);
		expect(m.failures).toBe(0);
		expect(m.successes).toBe(1); // unaffected
	});

	test('undoLastMontageEntry is a no-op with no entries (nothing to undo)', () => {
		const m: MontageModel = { ...base };
		expect(() => undoLastMontageEntry(m)).not.toThrow();
		expect(m.entries).toBeUndefined();
	});

	test('montageReopenable: true when complete by ROUNDS ALONE (no limit reached)', () => {
		const m = { ...base, rounds: 2, current_round: 3, success_limit: 6, failure_limit: 3, successes: 4, failures: 1 };
		expect(montageTallies(m).complete).toBe(true);
		expect(montageReopenable(m)).toBe(true);
	});

	test('montageReopenable: false once the SUCCESS limit is reached — a limit is final', () => {
		const m = { ...base, success_limit: 6, successes: 6, failures: 1 };
		expect(montageTallies(m).complete).toBe(true);
		expect(montageReopenable(m)).toBe(false);
	});

	test('montageReopenable: false once the FAILURE limit is reached — a limit is final', () => {
		const m = { ...base, failure_limit: 3, failures: 3, successes: 1 };
		expect(montageTallies(m).complete).toBe(true);
		expect(montageReopenable(m)).toBe(false);
	});

	test('montageReopenable: false on a live (not complete) montage', () => {
		const m = { ...base, successes: 1, failures: 0 };
		expect(montageTallies(m).complete).toBe(false);
		expect(montageReopenable(m)).toBe(false);
	});
});
