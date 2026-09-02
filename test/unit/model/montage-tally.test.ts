// SC-191 impl spec §G (row 2) — montage-tally.test.ts (NEW): the tally invariant (§B.3
// "Tallies: stored, never recomputed") and the outcome band's at-a-glance phrasing (§D),
// both exercised through the two pure helpers slice 1 ships: montageTallies(m) and
// montageBandCopy(m). Neither is rendered anywhere yet — the board/outcome-band views
// that consume them land in slice 2 (impl spec §I). montageOutcome's known `pending`-band
// bug at 0/0 (a fourth band, not yet returned) is explicitly deferred to slice 2 by the
// spec and is NOT fixed by this file — the last test below documents today's behavior so
// slice 2 has a red-to-green marker when it lands the fix.
import { parse, serialize, montageTallies, montageBandCopy } from '../../../src/elements/montage/model';
import type { MontageModel } from '../../../src/elements/montage/model';
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

	test('no success limit authored: toTotal is trivially 0 (Math.max(0, 0 - successes)), the live (non-tensed) branch reads "Total Success reached"', () => {
		expect(montageBandCopy({ ...base, success_limit: 0, successes: 0 }).successTail).toBe('Total Success reached');
	});

	test('no failure limit authored: failuresSpare is trivially 0, the live (non-tensed) branch reads "the limit is reached"', () => {
		expect(montageBandCopy({ ...base, failure_limit: 0, failures: 0 }).failureTail).toBe('the limit is reached');
	});

	test('tensed complete form once the success limit is reached: "the success limit, reached" — not "1 more ends it", round 3\'s bug (mock6.js:944-948)', () => {
		expect(montageBandCopy({ ...base, successes: 6 }).successTail).toBe('the success limit, reached');
	});

	test('tensed complete form, failure track with 1 to spare once the montage is over: "1 under the failure limit"', () => {
		expect(montageBandCopy({ ...base, successes: 6, failures: 2 }).failureTail).toBe('1 under the failure limit');
	});

	test("today's behavior at 0/0 (nothing recorded, no limits set): band reads 'failure', not a fourth 'pending' band — the known bug, fixed in slice 2 (impl spec §I)", () => {
		expect(montageBandCopy({ ...base, success_limit: 0, failure_limit: 0, successes: 0, failures: 0 }).band).toBe('failure');
	});
});
