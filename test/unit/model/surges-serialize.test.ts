// D7 Task 5 (spec §4.3) — ds-surges model: parse copies through only authored keys (no
// class-default-style materialization — there's nothing to default here); serialize is
// a pure projection, byte-stable on round-trip. Mirrors resource-serialize.test.ts's
// structure exactly (the closest sibling: a flat, brand-new persisted element).
import { parseYaml } from '../../mocks/obsidian';
import { parse, serialize } from '../../../src/elements/surges/model';
import type { SurgeModel } from '../../../src/elements/surges/model';
import surgesExample from '../../../src/elements/surges/example.yaml';

const parseLikePipeline = (source: string): SurgeModel => parse(parseYaml(source), source);

describe('D7 Task 5: surges model parse (spec §4.3 schema)', () => {
	test('parses the shipped example.yaml', () => {
		const model = parseLikePipeline(surgesExample);
		expect(model.surges).toEqual(expect.any(Number));
		expect(model.highest_characteristic).toEqual(expect.any(Number));
	});

	test('surges only: highest_characteristic is NOT materialized when absent', () => {
		const model = parseLikePipeline('surges: 2');
		expect(model).toEqual({ surges: 2 });
		expect(model.highest_characteristic).toBeUndefined();
	});

	test('an authored highest_characteristic is preserved as authored', () => {
		const model = parseLikePipeline('surges: 2\nhighest_characteristic: 3');
		expect(model).toEqual({ surges: 2, highest_characteristic: 3 });
	});

	test('surges may be 0 (the floor, spec §4.3: cleared at end of encounter)', () => {
		const model = parseLikePipeline('surges: 0');
		expect(model.surges).toBe(0);
	});

	test('rejects a missing/non-numeric surges', () => {
		expect(() => parseLikePipeline('highest_characteristic: 3')).toThrow(/surges/i);
		expect(() => parseLikePipeline('surges: "two"')).toThrow(/surges/i);
	});

	test('rejects a non-object block', () => {
		expect(() => parseLikePipeline('4')).toThrow();
	});
});

describe('D7 Task 5: serialize is byte-stable (emits only authored keys)', () => {
	test('parse -> serialize on the shipped example.yaml reproduces it exactly', () => {
		expect(serialize(parseLikePipeline(surgesExample))).toBe(surgesExample.trim());
	});

	test('surges: 2 round-trips without materializing highest_characteristic', () => {
		const source = 'surges: 2';
		const model = parseLikePipeline(source);
		expect(serialize(model)).toBe(source);
	});

	test('field order is surges, highest_characteristic — only authored keys appear', () => {
		const model = parseLikePipeline('surges: 2\nhighest_characteristic: 3');
		expect(serialize(model)).toBe('surges: 2\nhighest_characteristic: 3');
	});

	test('output is trimmed (no trailing/leading whitespace), matching every other persisted element', () => {
		const out = serialize(parseLikePipeline(surgesExample));
		expect(out).not.toMatch(/\n$/);
		expect(out).not.toMatch(/^\s/);
	});

	test('round-trip stability: parse(serialize(parse(x))) deep-equals parse(x); serialize is stable on pass 2', () => {
		const m1 = parseLikePipeline(surgesExample);
		const s1 = serialize(m1);
		const m2 = parseLikePipeline(s1);
		expect(m2).toEqual(m1);
		expect(serialize(m2)).toBe(s1);
	});
});
