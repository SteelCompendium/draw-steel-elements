// D8 Task 6 (spec §4.2) — montage model: parse + byte-stable serialize + the three
// derived outcome bands (AGENT 96). ds-montage has NO legacy predecessor (unlike
// negotiation/counter), so there is no external byte-compat oracle to transcribe
// against — the contract is self-referential, the same convention D8 Task 4's
// encounter-serialize.test.ts established: parse only fills defaults, never reorders a
// present key, so serialize(parse(x)) reproduces x's own bytes whenever x already
// carries the full field set in schema order.
import { parseYaml, stringifyYaml } from '../../mocks/obsidian';
import { parse, serialize, montageOutcome } from '../../../src/elements/montage/model';
import type { MontageModel } from '../../../src/elements/montage/model';
import montageExample from '../../../src/elements/montage/example.yaml';

const parseLikePipeline = (source: string): MontageModel => parse(parseYaml(source), source);

describe('T-6: montage model parse (spec §4.2 schema)', () => {
	test('parses the shipped example.yaml into the full schema', () => {
		const model = parseLikePipeline(montageExample);
		expect(model.title).toBe('Cross the Ashfall Wastes');
		expect(model.rounds).toBe(2);
		expect(model.success_limit).toBe(5);
		expect(model.failure_limit).toBe(3);
		expect(model.successes).toBe(0);
		expect(model.failures).toBe(0);
		expect(model.participants).toEqual([{ name: 'Kira', skills_used: ['Nature', 'Endurance'] }]);
		expect(model.current_round).toBe(1);
		expect(model._dse_anchor).toBe('4c19ff');
	});

	test('a minimal block materializes defaults ONLY for rounds(2)/successes(0)/failures(0)/current_round(1) — title/participants/_dse_anchor stay OMITTED, never invented', () => {
		const model = parseLikePipeline('success_limit: 5\nfailure_limit: 2');
		expect(model.title).toBeUndefined();
		expect(model.participants).toBeUndefined();
		expect(model._dse_anchor).toBeUndefined();
		expect(model.rounds).toBe(2);
		expect(model.successes).toBe(0);
		expect(model.failures).toBe(0);
		expect(model.current_round).toBe(1);
		expect(model.success_limit).toBe(5);
		expect(model.failure_limit).toBe(2);

		const out = serialize(model);
		expect(out).not.toContain('title:');
		expect(out).not.toContain('participants:');
		expect(out).not.toContain('_dse_anchor:');
	});

	test('a present value is never overridden by a default (rounds: 3 stays 3, not re-defaulted to 2)', () => {
		const model = parseLikePipeline('rounds: 3\nsuccesses: 4\nfailures: 1\ncurrent_round: 2');
		expect(model.rounds).toBe(3);
		expect(model.successes).toBe(4);
		expect(model.failures).toBe(1);
		expect(model.current_round).toBe(2);
	});
});

describe('T-6: serialize is byte-stable', () => {
	test('parse -> serialize on the shipped example.yaml matches a fresh stringifyYaml of the same parsed data', () => {
		const model = parseLikePipeline(montageExample);
		expect(serialize(model)).toBe(stringifyYaml(parseYaml(montageExample)).trim());
	});

	test('top-level key order is the schema order (title, rounds, success_limit, failure_limit, successes, failures, participants, current_round, _dse_anchor)', () => {
		const out = serialize(parseLikePipeline(montageExample));
		const topLevelKeys = out
			.split('\n')
			.filter((line) => /^\S/.test(line))
			.map((line) => line.split(':')[0]);
		expect(topLevelKeys).toEqual([
			'title',
			'rounds',
			'success_limit',
			'failure_limit',
			'successes',
			'failures',
			'participants',
			'current_round',
			'_dse_anchor',
		]);
	});

	test('_dse_anchor round-trips', () => {
		const model = parseLikePipeline(montageExample);
		expect(model._dse_anchor).toBe('4c19ff');
		expect(serialize(model)).toContain('_dse_anchor: 4c19ff');
	});

	test('output is trimmed (no trailing/leading whitespace), matching every other persisted element', () => {
		const out = serialize(parseLikePipeline(montageExample));
		expect(out).not.toMatch(/\n$/);
		expect(out).not.toMatch(/^\s/);
	});

	test('round-trip stability: parse(serialize(parse(x))) deep-equals parse(x); serialize is stable on pass 2', () => {
		const m1 = parseLikePipeline(montageExample);
		const s1 = serialize(m1);
		const m2 = parseLikePipeline(s1);
		expect(m2).toEqual(m1);
		expect(serialize(m2)).toBe(s1);
	});
});

describe('T-6: montageOutcome — the four derived bands (AGENT line 96 + SC-191 impl spec §I `pending`)', () => {
	const base: MontageModel = {
		rounds: 2,
		success_limit: 5,
		failure_limit: 3,
		successes: 0,
		failures: 0,
		current_round: 1,
	};

	test('total success: successes reach success_limit', () => {
		expect(montageOutcome({ ...base, successes: 5 })).toBe('total');
	});

	test('total success wins even with a round still to go', () => {
		expect(montageOutcome({ ...base, successes: 5, current_round: 1 })).toBe('total');
	});

	test('partial success: failures at the limit (time/failures exhausted) but successes exceed failures by 2+', () => {
		// success_limit 6 keeps this off the total branch; failures === failure_limit.
		expect(
			montageOutcome({ ...base, success_limit: 6, failure_limit: 3, successes: 5, failures: 3 }),
		).toBe('partial');
	});

	test('partial success: rounds exhausted (current_round > rounds) with a 2+ margin', () => {
		expect(
			montageOutcome({ ...base, success_limit: 6, failure_limit: 4, successes: 4, failures: 2, current_round: 3 }),
		).toBe('partial');
	});

	// Fix-round-1 H-1: `montageOutcome` used to additionally require `exhausted` (failures at
	// the limit, or past the last round) for `partial`, which made the band UNREACHABLE
	// while the montage was still live — review-1's finding, reproduced live on
	// fixture-mid.yaml (5/2, margin +3, round 3 of 3, not yet exhausted): the band printed
	// "Total Failure" directly over its own rule line "…lead failures by 2 — currently +3",
	// contradicting itself. The rule is the book's own margin rule (also the outcome band's
	// rule-line text) and does not care whether the montage has actually ended — `exhausted`
	// is now dropped entirely from this branch (impl spec's own `isExhausted` helper is
	// unaffected — `montageTallies.complete` still uses it for the SEPARATE "has the montage
	// ended" question). Boundary probe (review-1's own table, `sl 6 / fl 9 / rounds 3`):
	test.each([
		// [successes, failures, current_round, rounds, expected, description]
		[3, 3, 2, 3, 'failure', 'margin 0 (successes == failures), live'],
		[4, 3, 2, 3, 'failure', 'margin +1 (not enough), live'],
		[5, 3, 2, 3, 'partial', 'margin +2, live, mid-montage (round 2 of 3) — the exact H-1 regression case'],
		[5, 3, 3, 3, 'partial', 'margin +2, live, FINAL round with actions left (current_round === rounds)'],
		[5, 3, 4, 3, 'partial', 'margin +2, rounds exhausted (current_round > rounds)'],
		[4, 3, 4, 3, 'failure', 'margin +1, rounds exhausted — still short of the +2 threshold'],
		[3, 3, 4, 3, 'failure', 'margin 0, rounds exhausted'],
	])('successes=%i failures=%i current_round=%i rounds=%i -> %s (%s)', (successes, failures, current_round, rounds, expected) => {
		expect(
			montageOutcome({ ...base, success_limit: 6, failure_limit: 9, successes, failures, current_round, rounds }),
		).toBe(expected);
	});

	test('total failure: exhausted but the margin is under 2', () => {
		expect(montageOutcome({ ...base, successes: 3, failures: 3 })).toBe('failure');
	});

	test('can-fail invariant: the band word and the outcome band\'s own rule line never disagree — a `partial` band always has a margin >= 2, a `failure` band never does', () => {
		// This is the exact contradiction H-1 fixed: a band claiming Total Failure while its
		// own rule line ("Partial Success needs successes to lead failures by 2 — currently
		// +N") states a satisfied margin. Swept across every (successes, failures) pair
		// 0..6 (skipping 0/0, which is `pending` and prints no margin rule).
		for (let s = 0; s <= 6; s++) {
			for (let f = 0; f <= 6; f++) {
				if (s === 0 && f === 0) continue;
				const band = montageOutcome({ ...base, success_limit: 100, successes: s, failures: f });
				if (band === 'total' || band === 'pending') continue; // no margin rule printed
				const margin = s - f;
				if (band === 'partial') expect(margin).toBeGreaterThanOrEqual(2);
				else expect(margin).toBeLessThan(2);
			}
		}
	});

	test('an unset (0-default) limit never reads as instantly reached — nothing recorded either, so this is the `pending` band (SC-191 slice 2), not `failure`', () => {
		expect(montageOutcome({ ...base, success_limit: 0, successes: 0 })).toBe('pending');
	});

	test('SC-191 slice 2: `pending` at 0/0 regardless of whether limits are set — nothing recorded yet is not a verdict', () => {
		expect(montageOutcome({ ...base })).toBe('pending');
	});
});

// SC-191 impl spec §B — the schema grows two optional keys, `description` and `entries`
// (+ `MontageEntry`), purely additively (§B.2: "Nothing is renamed, retyped, removed or
// reordered"). §B.4 is the hard requirement under test in the first describe block below:
// an existing (pre-SC-191) block must parse, keep its tallies, and serialize back without
// losing or reordering anything the user wrote.
describe('SC-191 §B.4: backward compatibility — an old-shape block loses nothing', () => {
	const oldShapeYaml = [
		'title: Cross the Ashfall Wastes',
		'rounds: 2',
		'success_limit: 5',
		'failure_limit: 3',
		'successes: 3',
		'failures: 1',
		'participants:',
		'  - name: Kira',
		'    skills_used:',
		'      - Nature',
		'      - Endurance',
		'current_round: 2',
		'_dse_anchor: 4c19ff',
	].join('\n');

	test('parses into the same pre-SC-191 model, description/entries left undefined, tallies kept', () => {
		const model = parseLikePipeline(oldShapeYaml);
		expect(model.description).toBeUndefined();
		expect(model.entries).toBeUndefined();
		expect(model.successes).toBe(3);
		expect(model.failures).toBe(1);
		expect(model.participants).toEqual([{ name: 'Kira', skills_used: ['Nature', 'Endurance'] }]);
	});

	test('serializes back byte-identical — the compatibility proof (old-shape YAML in, same semantic YAML out)', () => {
		const model = parseLikePipeline(oldShapeYaml);
		expect(serialize(model)).toBe(stringifyYaml(parseYaml(oldShapeYaml)).trim());
		expect(serialize(model)).not.toContain('description:');
		expect(serialize(model)).not.toContain('entries:');
	});
});

describe('SC-191 §B.5: new-shape schema — key order, round-trip identity, omit-when-default', () => {
	const newShapeYaml = [
		'title: Cross the Ashfall Wastes',
		'description: Forty miles of volcanic waste, no water anywhere.',
		'rounds: 3',
		'success_limit: 6',
		'failure_limit: 3',
		'successes: 4',
		'failures: 2',
		'participants:',
		'  - name: Kira',
		'    skills_used:',
		'      - Nature',
		'      - Alertness',
		'entries:',
		'  - hero: Kira',
		'    round: 1',
		'    result: success',
		'    skill: Nature',
		'    note: Turned an ankle',
		'current_round: 3',
		'_dse_anchor: 4c19ff',
	].join('\n');

	test('round-trip identity: serialize(parse(x)) matches a fresh stringifyYaml of the same parsed data', () => {
		const model = parseLikePipeline(newShapeYaml);
		expect(serialize(model)).toBe(stringifyYaml(parseYaml(newShapeYaml)).trim());
	});

	test('parse(serialize(parse(x))) deep-equals parse(x); serialize is stable on pass 2', () => {
		const m1 = parseLikePipeline(newShapeYaml);
		const s1 = serialize(m1);
		const m2 = parseLikePipeline(s1);
		expect(m2).toEqual(m1);
		expect(serialize(m2)).toBe(s1);
	});

	test('top-level key order incl. entries: title, description, rounds, success_limit, failure_limit, successes, failures, participants, entries, current_round, _dse_anchor', () => {
		const out = serialize(parseLikePipeline(newShapeYaml));
		const topLevelKeys = out
			.split('\n')
			.filter((line) => /^\S/.test(line))
			.map((line) => line.split(':')[0]);
		expect(topLevelKeys).toEqual([
			'title',
			'description',
			'rounds',
			'success_limit',
			'failure_limit',
			'successes',
			'failures',
			'participants',
			'entries',
			'current_round',
			'_dse_anchor',
		]);
	});

	test('entry key order: hero, round, result, skill, note', () => {
		const out = serialize(parseLikePipeline(newShapeYaml));
		const entriesSection = out.split(/^entries:$/m)[1].split(/^current_round:/m)[0];
		const entryKeys = entriesSection
			.split('\n')
			.filter((line) => /^\s*-?\s*\w+:/.test(line))
			.map((line) => line.replace(/^\s*-\s*/, '').split(':')[0].trim());
		expect(entryKeys).toEqual(['hero', 'round', 'result', 'skill', 'note']);
	});

	test('description is omitted when absent, and when authored as an empty string', () => {
		const withoutDesc = parseLikePipeline('rounds: 2');
		expect(withoutDesc.description).toBeUndefined();
		expect(serialize(withoutDesc)).not.toContain('description:');

		const emptyDesc = parseLikePipeline('description: ""\nrounds: 2');
		expect(emptyDesc.description).toBeUndefined();
		expect(serialize(emptyDesc)).not.toContain('description:');
	});

	test('entries is omitted when absent, and when authored as an empty array', () => {
		const withoutEntries = parseLikePipeline('rounds: 2');
		expect(withoutEntries.entries).toBeUndefined();
		expect(serialize(withoutEntries)).not.toContain('entries:');

		const emptyEntries = parseLikePipeline('entries: []\nrounds: 2');
		expect(emptyEntries.entries).toBeUndefined();
		expect(serialize(emptyEntries)).not.toContain('entries:');
	});

	// Fix-round-1 L-3 (folded into slice 3 per the owner ruling, sc191-decisions.md
	// 2026-09-02): the fix itself (`parse`'s `d.participants.length > 0` guard, ~model.ts:155)
	// landed in fix round 1; this test is the dedicated pin the follow-up flagged as missing —
	// same pattern as `entries`' own omit-when-empty test just above, mirrored for
	// `participants` specifically rather than left to coincide with an `entries` assertion.
	test('participants is omitted when absent, and when authored as an empty array (fix-round-1 L-3)', () => {
		const withoutParticipants = parseLikePipeline('rounds: 2');
		expect(withoutParticipants.participants).toBeUndefined();
		expect(serialize(withoutParticipants)).not.toContain('participants:');

		const emptyParticipants = parseLikePipeline('participants: []\nrounds: 2');
		expect(emptyParticipants.participants).toBeUndefined();
		expect(serialize(emptyParticipants)).not.toContain('participants:');
	});

	test('skill/note are omitted per entry when empty — never serialized as null or an empty string', () => {
		const model = parseLikePipeline(
			['entries:', '  - hero: Kira', '    round: 1', '    result: success', '    skill: ""', '    note: ""', 'rounds: 2'].join('\n'),
		);
		expect(model.entries).toEqual([{ hero: 'Kira', round: 1, result: 'success' }]);
		const out = serialize(model);
		expect(out).not.toContain('skill:');
		expect(out).not.toContain('note:');
	});

	test('a null/wrong-type entry field is dropped, never crashes; an unrecognised (but well-typed) result is PRESERVED, not dropped (fix-round-1 L-2)', () => {
		const model = parseLikePipeline(
			[
				'entries:',
				'  - hero: Kira', // valid entry, but with a null skill and a wrong-type note
				'    round: 1',
				'    result: success',
				'    skill: null',
				'    note: 42',
				'  - hero: 7', // wrong-type hero -> whole entry dropped
				'    round: 1',
				'    result: success',
				'  - hero: Bo', // unrecognised (but STRING) result -> a Director typo, preserved verbatim
				'    round: 1',
				'    result: heroics',
				'rounds: 2',
			].join('\n'),
		);
		expect(model.entries).toEqual([
			{ hero: 'Kira', round: 1, result: 'success' },
			{ hero: 'Bo', round: 1, result: 'heroics' },
		]);
	});

	test('an entry with a wrong-TYPE result (not a string at all) still drops the whole entry — only a STRING typo is preservable (fix-round-1 L-2)', () => {
		const model = parseLikePipeline(
			['entries:', '  - hero: Kira', '    round: 1', '    result: 42', 'rounds: 2'].join('\n'),
		);
		expect(model.entries).toBeUndefined();
	});

	test("fix-round-1 L-2: an entry's note round-trips byte-for-byte even when its result is a typo — parse(serialize(parse(x))) === parse(x)", () => {
		const x = ['entries:', '  - hero: Osric', '    round: 1', '    result: sucess', '    note: Turned an ankle.', 'rounds: 2'].join('\n');
		const once = parseLikePipeline(x);
		expect(once.entries).toEqual([{ hero: 'Osric', round: 1, result: 'sucess', note: 'Turned an ankle.' }]);
		const twice = parseLikePipeline(serialize(once));
		expect(twice).toEqual(once);
	});

	describe('fix-round-1 L-2: a dropped or unrecognised entry is never SILENT — console.warn fires', () => {
		let warn: jest.SpyInstance;
		beforeEach(() => {
			warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
		});
		afterEach(() => {
			warn.mockRestore();
		});

		test('a whole-entry drop (wrong-type hero) warns once, naming the raw item', () => {
			parseLikePipeline(['entries:', '  - hero: 7', '    round: 1', '    result: success', 'rounds: 2'].join('\n'));
			expect(warn).toHaveBeenCalledTimes(1);
			expect(String(warn.mock.calls[0][0])).toContain('dropped a malformed entries[] item');
		});

		test('a preserved-but-unrecognised result warns once, naming the hero/round/value — distinct wording from a drop', () => {
			parseLikePipeline(
				['entries:', '  - hero: Osric', '    round: 3', '    result: sucess', 'rounds: 3'].join('\n'),
			);
			expect(warn).toHaveBeenCalledTimes(1);
			const message = String(warn.mock.calls[0][0]);
			expect(message).toContain('Osric');
			expect(message).toContain('round 3');
			expect(message).toContain('sucess');
			expect(message).not.toContain('dropped a malformed entries[] item');
		});

		test('a well-formed entry warns zero times', () => {
			parseLikePipeline(['entries:', '  - hero: Kira', '    round: 1', '    result: success', 'rounds: 2'].join('\n'));
			expect(warn).not.toHaveBeenCalled();
		});
	});
});
