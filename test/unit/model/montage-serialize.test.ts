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

describe('T-6: montageOutcome — the three derived bands (AGENT line 96)', () => {
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

	test('total failure: exhausted but the margin is under 2', () => {
		expect(montageOutcome({ ...base, successes: 3, failures: 3 })).toBe('failure');
	});

	test('total failure: not yet exhausted (mid-montage) never reads as partial even with a 2+ margin — the live "if it ended now" band', () => {
		expect(montageOutcome({ ...base, rounds: 3, successes: 3, failures: 1, current_round: 1 })).toBe('failure');
	});

	test('an unset (0-default) limit never reads as instantly reached', () => {
		expect(montageOutcome({ ...base, success_limit: 0, successes: 0 })).toBe('failure');
	});
});
