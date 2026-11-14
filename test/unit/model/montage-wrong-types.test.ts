// The montage reads hand-typed YAML whose TYPE is not what the schema says (`title: 2024`, `rounds: "3"`). The rules under test:
//  - a number or boolean title reads as its text; a map or list there is refused with a plain message naming `title`;
//  - a quoted number in one of the six number keys reads as that number, anything else that is not a number reads as the default the
//    parser gives an absent key, and every reader (tallies, outcome, round arithmetic) therefore sees a number;
//  - a value the montage did not change is written back as the user typed it (same value AND type); a value it changed is a number;
//  - none of this adds a property to the model (an own key would be written into the note, SC-625).
import { parseYaml } from '../../mocks/obsidian';
import {
	parse, serialize, montageTallies, montageOutcome, montageBandCopy, logMontageEntry, addMontageRound, endMontageRound,
	backMontageRound, montagePreviousRound, setMontageLimits, resetMontageProgress, addMontageHero, undoLastMontageEntry,
} from '../../../src/elements/montage/model';
import type { MontageModel } from '../../../src/elements/montage/model';

const parseLikePipeline = (source: string): MontageModel => parse(parseYaml(source), source);
const written = (model: MontageModel): Record<string, unknown> => parseYaml(serialize(model)) as Record<string, unknown>;

const NUMBER_KEYS = ['rounds', 'success_limit', 'failure_limit', 'successes', 'failures', 'current_round'] as const;
const DEFAULTS: Record<(typeof NUMBER_KEYS)[number], number> = {
	rounds: 2, success_limit: 0, failure_limit: 0, successes: 0, failures: 0, current_round: 1,
};

describe('a title that is not text', () => {
	test.each([
		['2024', '2024'],
		['true', 'true'],
		['false', 'false'],
		['3.5', '3.5'],
		['0', '0'],
	])('title: %s reads as the text "%s"', (typed, text) => {
		const model = parseLikePipeline(`title: ${typed}\nrounds: 3`);
		expect(model.title).toBe(text);
		expect(typeof model.title).toBe('string');
	});

	test('a quoted title stays the text it is', () => {
		expect(parseLikePipeline('title: "2024"').title).toBe('2024');
	});

	test('an absent title stays absent and an empty one stays empty (today)', () => {
		expect(parseLikePipeline('rounds: 3').title).toBeUndefined();
		expect(parseLikePipeline("title: ''").title).toBe('');
	});

	test.each([
		['a map', 'title:\n  a: 1'],
		['a list', 'title:\n  - a\n  - b'],
		['an empty list', 'title: []'],
		['an empty map', 'title: {}'],
	])('%s as the title is refused with a plain message that names the key', (_name, source) => {
		expect(() => parseLikePipeline(source)).toThrow("Invalid data: 'title' must be text.");
		let message = '';
		try {
			parseLikePipeline(source);
		} catch (e) {
			message = (e as Error).message;
		}
		expect(message).not.toMatch(/is not a function|Cannot read properties|_a\./);
	});

	test.each([
		['title: 2024', /^title: 2024$/m, /"2024"|'2024'/],
		['title: true', /^title: true$/m, /"true"|'true'/],
		['title: 3.5', /^title: 3\.5$/m, /"3\.5"|'3\.5'/],
	])('%s is written back as typed, never as a string', (head, expected, notExpected) => {
		const out = serialize(parseLikePipeline(`${head}\nrounds: 3\nsuccess_limit: 3\nfailure_limit: 2\nsuccesses: 0\nfailures: 0\ncurrent_round: 1`));
		expect(out).toMatch(expected);
		expect(out).not.toMatch(notExpected);
	});

	test('the typed title is still written back as typed after a write that changes the tallies', () => {
		const model = parseLikePipeline('title: 2024\nparticipants:\n  - name: Kira\n    skills_used: []');
		logMontageEntry(model, { hero: 'Kira', round: 1, result: 'success' });
		addMontageRound(model);
		expect(written(model).title).toBe(2024);
	});

	test('a quoted title is written back quoted-as-text (a string stays a string)', () => {
		expect(written(parseLikePipeline('title: "2024"')).title).toBe('2024');
	});
});

describe('a quoted number in a number key', () => {
	test.each(NUMBER_KEYS.flatMap((key) => [
		[key, '"3"', 3],
		[key, '" 3 "', 3],
		[key, '"0"', 0],
		[key, '"3.5"', 3.5],
		[key, '"-1"', -1],
	] as Array<[(typeof NUMBER_KEYS)[number], string, number]>))('%s: %s reads as the number %p', (key, typed, expected) => {
		const model = parseLikePipeline(`${key}: ${typed}`);
		expect(model[key]).toBe(expected);
		expect(typeof model[key]).toBe('number');
	});

	test.each(NUMBER_KEYS.flatMap((key) => [
		[key, 'banana'],
		[key, "''"],
		[key, '"  "'],
		[key, '"3 rounds"'],
		[key, '"0x10"'],
		[key, '"Infinity"'],
		[key, 'true'],
		[key, 'false'],
		[key, '{a: 1}'],
		[key, '[1, 2]'],
		[key, '[]'],
	] as Array<[(typeof NUMBER_KEYS)[number], string]>))('%s: %s reads as the parser default', (key, typed) => {
		const model = parseLikePipeline(`${key}: ${typed}`);
		expect(model[key]).toBe(DEFAULTS[key]);
	});

	test('an absent key and a null key read as the default (today)', () => {
		const absent = parseLikePipeline('title: x');
		const empty = parseLikePipeline('rounds:\nsuccess_limit:\nfailure_limit:\nsuccesses:\nfailures:\ncurrent_round:');
		for (const key of NUMBER_KEYS) {
			expect(absent[key]).toBe(DEFAULTS[key]);
			expect(empty[key]).toBe(DEFAULTS[key]);
		}
	});

	test('a native number is read as it was typed (no change)', () => {
		const model = parseLikePipeline('rounds: 4\nsuccess_limit: 5\nfailure_limit: 3\nsuccesses: 2\nfailures: 1\ncurrent_round: 3');
		expect([model.rounds, model.success_limit, model.failure_limit, model.successes, model.failures, model.current_round]).toEqual([4, 5, 3, 2, 1, 3]);
	});

	test('the readers see numbers: tallies, outcome, band copy, previous round', () => {
		const model = parseLikePipeline('rounds: "3"\nsuccess_limit: "3"\nfailure_limit: "2"\nsuccesses: "3"\nfailures: "1"\ncurrent_round: "2"');
		const t = montageTallies(model);
		expect(t).toMatchObject({ successes: 3, failures: 1, successLimit: 3, failureLimit: 2, toTotal: 0, failuresSpare: 1, complete: true });
		expect(montageOutcome(model)).toBe('total');
		expect(montageBandCopy(model).word).toBe('Total Success');
		expect(montagePreviousRound(parseLikePipeline('rounds: "3"\ncurrent_round: "2"'))).toBe(1);
	});

	test('a string "0" tally is nothing recorded (pending), not a truthy string', () => {
		expect(montageOutcome(parseLikePipeline('successes: "0"\nfailures: "0"'))).toBe('pending');
	});
});

describe('a write changes a quoted number into a number, never concatenates', () => {
	test('Add a round on rounds: "3" gives 4', () => {
		const model = parseLikePipeline('rounds: "3"');
		addMontageRound(model);
		expect(model.rounds).toBe(4);
		expect(written(model).rounds).toBe(4);
	});

	test('End round on current_round: "1" gives 2; Back to round gives 1 again', () => {
		const model = parseLikePipeline('rounds: 3\ncurrent_round: "1"');
		endMontageRound(model);
		expect(written(model).current_round).toBe(2);
		backMontageRound(model);
		expect(model.current_round).toBe(1);
	});

	test('logging a success on successes: "2" gives 3, a failure on failures: "1" gives 2', () => {
		const model = parseLikePipeline('successes: "2"\nfailures: "1"\nparticipants:\n  - name: Kira\n    skills_used: []');
		logMontageEntry(model, { hero: 'Kira', round: 1, result: 'success' });
		logMontageEntry(model, { hero: 'Kira', round: 1, result: 'failure' });
		expect(written(model)).toMatchObject({ successes: 3, failures: 2 });
	});

	test('Undo on a quoted tally clamps and subtracts as numbers', () => {
		const model = parseLikePipeline('successes: "1"\nparticipants:\n  - name: Kira\n    skills_used: []\nentries:\n  - hero: Kira\n    round: 1\n    result: success');
		undoLastMontageEntry(model);
		expect(written(model).successes).toBe(0);
	});

	test('Set limits writes both limits as numbers', () => {
		const model = parseLikePipeline('success_limit: "3"\nfailure_limit: banana');
		setMontageLimits(model, 5, 2);
		expect(written(model)).toMatchObject({ success_limit: 5, failure_limit: 2 });
	});

	test('Reset progress writes the three values it sets as numbers, even over a typed value that already read as 0 / 1', () => {
		const model = parseLikePipeline('successes: "2"\nfailures: "0"\ncurrent_round: banana\nrounds: "3"');
		resetMontageProgress(model);
		expect(written(model)).toMatchObject({ successes: 0, failures: 0, current_round: 1, rounds: '3' });
	});

	test('Set limits over a typed limit that read as the same number writes the number (failure_limit: banana, saved as 0)', () => {
		const model = parseLikePipeline('success_limit: "3"\nfailure_limit: banana');
		setMontageLimits(model, 3, 0);
		expect(written(model)).toMatchObject({ success_limit: 3, failure_limit: 0 });
	});

	test('Undo clamped at 0 over a typed tally writes the number 0', () => {
		const model = parseLikePipeline('successes: banana\nparticipants:\n  - name: Kira\nentries:\n  - hero: Kira\n    round: 1\n    result: success');
		undoLastMontageEntry(model);
		expect(written(model).successes).toBe(0);
	});
});

describe('an untouched value is written back as the user typed it', () => {
	test.each(NUMBER_KEYS.flatMap((key) => [
		[key, '"3"', '3'],
		[key, '" 3 "', ' 3 '],
		[key, '"0"', '0'],
		[key, 'banana', 'banana'],
		[key, "''", ''],
		[key, 'true', true],
		[key, '{a: 1}', { a: 1 }],
		[key, '[1, 2]', [1, 2]],
	] as Array<[(typeof NUMBER_KEYS)[number], string, unknown]>))('%s: %s survives a write that leaves it alone', (key, typed, raw) => {
		const model = parseLikePipeline(`${key}: ${typed}\nparticipants:\n  - name: Kira\n    skills_used: []`);
		addMontageHero(model, 'Ash'); // touches only participants
		expect(written(model)[key]).toEqual(raw);
	});

	test('current_round: "1" stays "1" after Add a hero; rounds: "3" stays "3" after Set limits', () => {
		const a = parseLikePipeline('rounds: 3\ncurrent_round: "1"\nparticipants:\n  - name: Kira');
		addMontageHero(a, 'Ash');
		expect(written(a).current_round).toBe('1');
		const b = parseLikePipeline('rounds: "3"\nsuccess_limit: 2\nfailure_limit: 2');
		setMontageLimits(b, 4, 4);
		expect(written(b).rounds).toBe('3');
	});

	test('a typed non-number changed by the montage is written as the number it now is', () => {
		const model = parseLikePipeline('rounds: banana');
		addMontageRound(model);
		expect(written(model).rounds).toBe(3);
	});

	test('a key that was absent is still left out (SC-482) and a changed absent one is written', () => {
		const model = parseLikePipeline('title: 2024\nrounds: "3"');
		const out = written(model);
		expect(Object.keys(out)).toEqual(['title', 'rounds']);
		endMontageRound(model);
		expect(written(model)).toEqual({ title: 2024, rounds: '3', current_round: 2 });
	});

	test('key order stays the schema order and unknown keys are still carried after the known ones', () => {
		const out = serialize(parseLikePipeline('table_notes: keep\ncurrent_round: "1"\nrounds: "3"\ntitle: 2024'));
		expect(out.split('\n').map((l) => l.split(':')[0])).toEqual(['title', 'rounds', 'current_round', 'table_notes']);
		expect(out).toContain('rounds: "3"');
		expect(out).toContain('current_round: "1"');
	});

	test('two blocks do not share what they remember', () => {
		const a = parseLikePipeline('rounds: "3"');
		const b = parseLikePipeline('rounds: banana');
		addMontageRound(a);
		expect(written(a).rounds).toBe(4);
		expect(written(b).rounds).toBe('banana');
	});

	test('a re-parse of the written block builds a fresh record (the typed value is gone once the montage changed it)', () => {
		const model = parseLikePipeline('rounds: "3"');
		addMontageRound(model);
		const again = parseLikePipeline(serialize(model));
		expect(again.rounds).toBe(4);
		addMontageHero(again, 'Kira');
		expect(written(again).rounds).toBe(4);
	});
});

describe('the model carries no extra property for any of this', () => {
	test('a typed title and typed numbers add no own key to the model, in or out of the note', () => {
		const model = parseLikePipeline('title: 2024\nrounds: "3"\nsuccess_limit: banana\nfailure_limit: [1]\nsuccesses: true\nfailures: "2"\ncurrent_round: {a: 1}');
		expect(Object.keys(model)).toEqual(['title', 'rounds', 'success_limit', 'failure_limit', 'successes', 'failures', 'current_round']);
		expect(Object.getOwnPropertyNames(model).sort()).toEqual(Object.keys(model).sort());
		expect(Object.getOwnPropertySymbols(model)).toEqual([]);
		expect(Object.keys(parseYaml(serialize(model)) as object)).toEqual(Object.keys(model));
	});

	test('a hand-built model is written as today (nothing remembered, nothing restored)', () => {
		const model: MontageModel = { title: '2024', rounds: 3, success_limit: 0, failure_limit: 0, successes: 0, failures: 0, current_round: 1 };
		expect(written(model)).toEqual({ title: '2024', rounds: 3, success_limit: 0, failure_limit: 0, successes: 0, failures: 0, current_round: 1 });
	});
});

describe('a description that is not text', () => {
	test.each([
		['5', '5'],
		['true', 'true'],
		['false', 'false'],
		['3.5', '3.5'],
		['0', '0'],
	])('description: %s reads as the text "%s"', (typed, text) => {
		const model = parseLikePipeline(`description: ${typed}\nrounds: 3`);
		expect(model.description).toBe(text);
		expect(typeof model.description).toBe('string');
	});

	test('a text description, a quoted number, an empty one and an absent one are as before', () => {
		expect(parseLikePipeline('description: Forty miles of waste').description).toBe('Forty miles of waste');
		expect(parseLikePipeline('description: "5"').description).toBe('5');
		expect(parseLikePipeline("description: ''").description).toBeUndefined();
		expect(parseLikePipeline('description:').description).toBeUndefined();
		expect(parseLikePipeline('rounds: 3').description).toBeUndefined();
	});

	test.each([
		['a map', 'description:\n  a: 1'],
		['a list', 'description:\n  - a\n  - b'],
		['an empty list', 'description: []'],
		['an empty map', 'description: {}'],
	])('%s as the description is refused with a plain message that names the key', (_name, source) => {
		expect(() => parseLikePipeline(source)).toThrow("Invalid data: 'description' must be text.");
		let message = '';
		try {
			parseLikePipeline(source);
		} catch (e) {
			message = (e as Error).message;
		}
		expect(message).not.toMatch(/is not a function|Cannot read properties|_a\./);
	});

	test.each([
		['description: 5', 5],
		['description: true', true],
		['description: 3.5', 3.5],
	])('%s is written back as typed, in its schema place, never as a string', (head, raw) => {
		const model = parseLikePipeline(`title: T\n${head}\nrounds: 3\nsuccess_limit: 3\nfailure_limit: 2\nsuccesses: 0\nfailures: 0\ncurrent_round: 1`);
		const out = serialize(model);
		expect(out.split('\n')[1]).toBe(head);
		expect(written(model).description).toBe(raw);
	});

	test('the typed description survives writes that change other things; a quoted one stays a string', () => {
		const model = parseLikePipeline('description: 5\nparticipants:\n  - name: Kira\n    skills_used: []');
		logMontageEntry(model, { hero: 'Kira', round: 1, result: 'success' });
		addMontageRound(model);
		expect(written(model).description).toBe(5);
		expect(written(parseLikePipeline('description: "5"')).description).toBe('5');
	});

	test('a typed description adds no own key to the model', () => {
		const model = parseLikePipeline('title: 2024\ndescription: 5\nrounds: 3');
		expect(Object.keys(model)).toEqual(['title', 'description', 'rounds', 'success_limit', 'failure_limit', 'successes', 'failures', 'current_round']);
		expect(Object.keys(parseYaml(serialize(model)) as object)).toEqual(['title', 'description', 'rounds']); // the absent defaults stay out (SC-482)
	});
});

describe('a block that is not a map of keys', () => {
	test.each([
		['text', 'hello'],
		['a quoted text', '"hello"'],
		['a number', '5'],
		['a boolean', 'true'],
		['a list', '- a\n- b'],
		['a flow list', '[1, 2]'],
		['an empty-looking quoted string', "''"],
	])('%s is refused with a plain message', (_name, source) => {
		expect(() => parseLikePipeline(source)).toThrow('Invalid data: the block must be a map of keys.');
	});

	test.each([
		['nothing', ''],
		['blank lines', '\n  \n\n'],
		['only a comment', '# a note to self\n# another'],
		['a bare null', 'null'],
		['a bare tilde', '~'],
	])('an empty block (%s) is still a fresh default montage', (_name, source) => {
		const model = parseLikePipeline(source);
		expect([model.rounds, model.success_limit, model.failure_limit, model.successes, model.failures, model.current_round]).toEqual([2, 0, 0, 0, 0, 1]);
		expect(model.title).toBeUndefined();
		expect(serialize(model)).toBe('');
		addMontageRound(model);
		expect(written(model)).toEqual({ rounds: 3 });
	});

	test('a map with only unknown keys is a map: it parses and keeps its keys', () => {
		const model = parseLikePipeline('table_notes: keep me');
		expect(written(model)).toEqual({ table_notes: 'keep me' });
	});
});
