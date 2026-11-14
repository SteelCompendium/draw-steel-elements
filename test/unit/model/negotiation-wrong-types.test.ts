// SC-638 — values typed by hand that are not the type the negotiation expects. A number or boolean where text is expected is read as text
// and written back as typed; a wrong-shaped structure is refused with a plain `Invalid data: …` message (the pipeline draws it as the error
// card, which has no control to write the block); and the ending reads each standing the way the seal draws it.
import { parseYaml, stringifyYaml } from '../../mocks/obsidian';
import { CurrentArgument, Motivation, NegotiationData, parseNegotiationData, Pitfall } from '@model/NegotiationData';
import { parse, serialize } from '../../../src/elements/negotiation/model';

/** Runs the model exactly the way the pipeline does: def.parse(parseYaml(source), source). */
const parseLikePipeline = (source: string): NegotiationData => parse(parseYaml(source), source);
const OFFERS = 'i5: five\ni4: four\ni3: three\ni2: two\ni1: one\ni0: zero';
const RAW_JS = /is not a function|Cannot read properties|undefined|_[a-z]\./;

const TYPED = [
	'name: 2024',
	'initial_interest: 3',
	'initial_patience: 3',
	'motivations:',
	'  - name: 5',
	'    reason: 42',
	'    hasBeenAppealedTo: true',
	'  - name: true',
	'    reason: 1.5',
	'pitfalls:',
	'  - name: 7',
	'    reason: false',
	'currentArgument:',
	'  motivationsUsed: [5]',
	'  pitfallsUsed: [7]',
	'i5: 55',
	'i4: four',
	'i3: 33',
	'i2: two',
	'i1: one',
	'i0: false',
].join('\n');

describe('SC-638 R1: a number or boolean where text is expected is read as its text', () => {
	test('name, the motivation and pitfall fields, i0..i5 and the used lists are all text', () => {
		const m = parseLikePipeline(TYPED);
		expect(m.name).toBe('2024');
		expect(m.motivations.map((x) => [x.name, x.reason])).toEqual([['5', '42'], ['true', '1.5']]);
		expect(m.pitfalls.map((x) => [x.name, x.reason])).toEqual([['7', 'false']]);
		expect(m.currentArgument.motivationsUsed).toEqual(['5']);
		expect(m.currentArgument.pitfallsUsed).toEqual(['7']);
		expect([m.i5, m.i3, m.i0]).toEqual(['55', '33', 'false']);
	});

	test('the legacy entry point parseNegotiationData reads it the same way', () => {
		expect(parseNegotiationData(TYPED).name).toBe('2024');
	});

	test('null and absent keep their old meaning (a default, not an error and not the text "null")', () => {
		const m = parseLikePipeline(`name:\nmotivations:\npitfalls:\ncurrentArgument:\ni3:\n${OFFERS.replace('i3: three\n', '')}`);
		expect(m.motivations).toEqual([]);
		expect(m.pitfalls).toEqual([]);
		expect(m.currentArgument.motivationsUsed).toEqual([]);
		expect(m.i3).toBe('Interest 3 result');
		const item = parseLikePipeline('name: n\nmotivations:\n  - name:\n    reason:\n  - {}\ncurrentArgument:\n  motivationsUsed:\n  pitfallsUsed:');
		expect(item.motivations.map((x) => [x.name, x.reason])).toEqual([['', ''], ['', '']]);
		expect(item.currentArgument.pitfallsUsed).toEqual([]);
	});
});

describe('SC-638 R2: what the negotiation did not change is written back as typed', () => {
	const out = (m: NegotiationData): any => parseYaml(serialize(m));

	test('every typed value keeps its value and its type on a write that touches something else', () => {
		const m = parseLikePipeline(TYPED);
		m.current_patience = 1; // the one change
		const w = out(m);
		expect(w.name).toBe(2024);
		expect(w.motivations[0]).toMatchObject({ name: 5, reason: 42 });
		expect(w.motivations[1]).toMatchObject({ name: true, reason: 1.5 });
		expect(w.pitfalls[0]).toMatchObject({ name: 7, reason: false });
		expect(w.currentArgument.motivationsUsed).toEqual([5]);
		expect(w.currentArgument.pitfallsUsed).toEqual([7]);
		expect([w.i5, w.i3, w.i0]).toEqual([55, 33, false]);
		expect(w.current_patience).toBe(1);
		expect(serialize(m)).toMatch(/^name: 2024$/m); // bytes, not just parsed values: never `name: "2024"`
	});

	test('a value the user typed as text stays text, next to typed numbers in the same list', () => {
		const m = parseLikePipeline('name: "2024"\nmotivations:\n  - name: "5"\n    reason: x\n  - name: 6\n    reason: y\ncurrentArgument:\n  motivationsUsed: ["5", 6]');
		const w = out(m);
		expect(w.name).toBe('2024');
		expect(w.motivations.map((x: any) => x.name)).toEqual(['5', 6]);
		expect(w.currentArgument.motivationsUsed).toEqual(['5', 6]);
	});

	test('a value the negotiation changed is written as what it now is, not as the old typed one', () => {
		const m = parseLikePipeline(TYPED);
		m.name = 'Renamed';
		m.currentArgument.motivationsUsed = ['5', 'Peace'];
		const w = out(m);
		expect(w.name).toBe('Renamed');
		expect(w.currentArgument.motivationsUsed).toEqual([5, 'Peace']); // 5 is still the entry the user typed; Peace is new text
	});

	test('the argument that ends takes its typed entries with it: a chip pressed afterwards is plain text', () => {
		const m = parseLikePipeline(TYPED);
		m.currentArgument.resetData();
		m.currentArgument.motivationsUsed.push('5');
		expect(out(m).currentArgument.motivationsUsed).toEqual(['5']);
	});

	test('the typed values are kept beside the instances: no own key on the model, a motivation, a pitfall or the argument', () => {
		const m = parseLikePipeline(TYPED);
		const plain = parseLikePipeline(TYPED.replace('name: 2024', 'name: x'));
		expect(Object.keys(m)).toEqual(Object.keys(plain));
		expect(Object.keys(m.motivations[0])).toEqual(['name', 'reason', 'hasBeenAppealedTo']);
		expect(Object.keys(m.pitfalls[0])).toEqual(['name', 'reason']);
		expect(Object.keys(m.currentArgument)).toEqual(['motivationsUsed', 'pitfallsUsed', 'lieUsed', 'sameArgumentUsed', 'reusedMotivation']);
		expect(stringifyYaml(m)).not.toMatch(/typed|2024.*2024/i);
	});

	test('a second pass is byte-identical (the write does not drift)', () => {
		const m = parseLikePipeline(TYPED);
		expect(serialize(m)).toBe(serialize(m));
	});
});

describe('SC-638 R2: matching by name compares the text', () => {
	test('`motivationsUsed: [5]` matches a motivation named 5: reuse is detected and the spent flag follows', () => {
		const m = parseLikePipeline('name: n\ninitial_interest: 3\nmotivations:\n  - name: 5\n    reason: r\n    hasBeenAppealedTo: true\n  - name: 6\n    reason: s\ncurrentArgument:\n  motivationsUsed: [5]');
		expect(m.argumentReusesMotivation()).toBe(true);
		m.setMotivationUsed('5', false);
		expect(m.motivations[0].hasBeenAppealedTo).toBe(false);
		expect(m.currentArgument.reusedMotivation).toBe(false);
		m.setMotivationUsed('5', true);
		expect(m.currentArgument.reusedMotivation).toBe(true);
	});
});

describe('SC-638 R3: a wrong-shaped structure is a plain error naming the key', () => {
	const cases: Array<[string, string, string]> = [
		['motivations is text', 'motivations: foo', "Invalid data: 'motivations' field must be a list."],
		['motivations is a number', 'motivations: 5', "Invalid data: 'motivations' field must be a list."],
		['motivations is a map', 'motivations: {a: 1}', "Invalid data: 'motivations' field must be a list."],
		['pitfalls is text', 'pitfalls: foo', "Invalid data: 'pitfalls' field must be a list."],
		['pitfalls is a map', 'pitfalls: {a: 1}', "Invalid data: 'pitfalls' field must be a list."],
		['a motivation is a blank item', 'motivations:\n  -', "Invalid data: 'motivations' item 1 must be an object."],
		['a motivation is text (`- Legacy`)', 'motivations:\n  - Legacy', "Invalid data: 'motivations' item 1 must be an object."],
		['the second motivation is a number', 'motivations:\n  - name: A\n  - 3', "Invalid data: 'motivations' item 2 must be an object."],
		['a motivation is a list', 'motivations:\n  - [a, b]', "Invalid data: 'motivations' item 1 must be an object."],
		['the third pitfall is text', 'pitfalls:\n  - name: A\n  - name: B\n  - Pride', "Invalid data: 'pitfalls' item 3 must be an object."],
		['a pitfall is a blank item', 'pitfalls:\n  -', "Invalid data: 'pitfalls' item 1 must be an object."],
		['currentArgument is text', 'currentArgument: hello', "Invalid data: 'currentArgument' field must be an object."],
		['currentArgument is a number', 'currentArgument: 5', "Invalid data: 'currentArgument' field must be an object."],
		['currentArgument is a list', 'currentArgument: [a]', "Invalid data: 'currentArgument' field must be an object."],
		['currentArgument is false', 'currentArgument: false', "Invalid data: 'currentArgument' field must be an object."],
		['motivationsUsed is text', 'currentArgument:\n  motivationsUsed: Peace', "Invalid data: 'currentArgument.motivationsUsed' field must be a list."],
		['pitfallsUsed is a map', 'currentArgument:\n  pitfallsUsed: {a: 1}', "Invalid data: 'currentArgument.pitfallsUsed' field must be a list."],
		['an entry of motivationsUsed is a map', 'currentArgument:\n  motivationsUsed: [{a: 1}]', "Invalid data: 'currentArgument.motivationsUsed' item 1 must be text."],
		['an entry of pitfallsUsed is a list', 'currentArgument:\n  pitfallsUsed: [x, [y]]', "Invalid data: 'currentArgument.pitfallsUsed' item 2 must be text."],
		['name is a map', 'name: {a: 1}', "Invalid data: 'name' must be text."],
		['name is a list', 'name: [a]', "Invalid data: 'name' must be text."],
		['i3 is a map', 'i3: {a: 1}', "Invalid data: 'i3' must be text."],
		['a motivation name is a map', 'motivations:\n  - name: {a: 1}', "Invalid data: 'motivations' item 1 'name' must be text."],
		['a motivation reason is a list', 'motivations:\n  - name: A\n  - name: B\n    reason: [x]', "Invalid data: 'motivations' item 2 'reason' must be text."],
		['a pitfall reason is a map', 'pitfalls:\n  - name: A\n    reason: {x: 1}', "Invalid data: 'pitfalls' item 1 'reason' must be text."],
	];

	test.each(cases)('%s', (_label, body, message) => {
		let thrown: unknown;
		try {
			parseLikePipeline(body);
		} catch (error) {
			thrown = error;
		}
		expect((thrown as Error).message).toBe(message);
		expect((thrown as Error).message).not.toMatch(RAW_JS);
	});

	test.each([
		['text (`hello`)', 'hello'],
		['a list', '- a\n- b'],
		['a number', '42'],
		['true', 'true'],
	])('a block that is %s is not a map of keys', (_label, body) => {
		expect(() => parseLikePipeline(body)).toThrow('Invalid data: the block must be a map of keys.');
		expect(() => parseNegotiationData(body)).toThrow('Invalid data: the block must be a map of keys.');
	});

	test('an empty block (nothing, whitespace, or only a comment) is not reported as a block of the wrong shape: it is refused as before (SC-493)', () => {
		for (const body of ['', '  \n  ', '# only a note to self']) {
			expect(() => parse(parseYaml(body), body)).toThrow();
			expect(() => parse(parseYaml(body), body)).not.toThrow('Invalid data: the block must be a map of keys.');
		}
	});

	test('the legacy entry point parseNegotiationData refuses them the same way, and a YAML syntax error is still its own message', () => {
		expect(() => parseNegotiationData('motivations:\n  - Legacy')).toThrow("Invalid data: 'motivations' item 1 must be an object.");
		expect(() => parseNegotiationData('name: [unclosed')).toThrow(/^Invalid YAML format: /);
	});

	test('built by hand, an instance still passes (the check is about shape, not about the class)', () => {
		const built = new NegotiationData({ name: 'Built', motivations: [new Motivation({ name: 'A' })], pitfalls: [new Pitfall({ name: 'B' })], currentArgument: new CurrentArgument({ motivationsUsed: ['A'] }) });
		expect(built.motivations[0].name).toBe('A');
		expect(built.currentArgument.motivationsUsed).toEqual(['A']);
	});
});

describe('SC-638 R4: one reading of a standing for the seal and for the ending', () => {
	const ending = (interest: unknown, patience: unknown): string | null =>
		parseLikePipeline(`name: n\ninitial_interest: 3\ncurrent_interest: ${interest}\ncurrent_patience: ${patience}`).ending();

	test('standingOf is the whole number 0..5 the seal draws: clamp, round, junk is 0', () => {
		const table: Array<[unknown, number]> = [[0.4, 0], [0.5, 1], [1.49, 1], [4.4, 4], [4.5, 5], [-3, 0], [9, 5], ['3', 3], ['banana', 0], [null, 0], [undefined, 0], [Infinity, 5], [-Infinity, 0], [NaN, 0]];
		for (const [input, seal] of table) expect([input, NegotiationData.standingOf(input)]).toEqual([input, seal]);
	});

	test.each([
		['0.4', 3, 'hostile'],
		['0.5', 3, null],
		['4.4', 3, null],
		['4.5', 3, 'deal'],
		['-2', 3, 'hostile'],
		['7', 3, 'deal'],
		['banana', 3, 'hostile'],
		['"5"', 3, 'deal'],
		[3, 'banana', 'final'],
		[3, '0.4', 'final'],
		[3, '0.5', null],
		[3, '"0"', 'final'],
		[3, 2, null],
	])('Interest %p, Patience %p ends as %p', (interest, patience, expected) => {
		expect(ending(interest, patience)).toBe(expected);
	});

	test('Interest wins over Patience as before: a deal at spent Patience is a deal, hostile at spent Patience is hostile', () => {
		expect(ending(4.5, 0)).toBe('deal');
		expect(ending(0.4, 0)).toBe('hostile');
	});

	test('the outcome offered for an Interest is the one of the seal that Interest is drawn on', () => {
		const m = parseLikePipeline(`name: n\n${OFFERS}`);
		expect([m.offerFor(0.4), m.offerFor(4.5), m.offerFor(2.5)]).toEqual(['zero', 'five', 'three']);
	});

	test('advanceStanding on a non-number is not changed: the junk stays as authored', () => {
		expect(NegotiationData.advanceStanding('banana', 1)).toBe('banana');
	});
});
