// D7 Task 6 (spec §4.5, OD-3) — ds-tokens model: parse copies through only authored keys;
// serialize is a pure projection, byte-stable on round-trip. Mirrors
// surges-serialize.test.ts / resource-serialize.test.ts's structure (a flat, brand-new
// persisted element).
import { parseYaml } from '../../mocks/obsidian';
import { parse, serialize } from '../../../src/elements/tokens/model';
import type { TokenPoolModel } from '../../../src/elements/tokens/model';
import tokensExample from '../../../src/elements/tokens/example.yaml';

const parseLikePipeline = (source: string): TokenPoolModel => parse(parseYaml(source), source);

describe('D7 Task 6: tokens model parse (spec §4.5 schema)', () => {
	test('parses the shipped example.yaml', () => {
		const model = parseLikePipeline(tokensExample);
		expect(model.tokens).toEqual(expect.any(Number));
		expect(model.label).toEqual(expect.any(String));
	});

	test('tokens only: label is NOT materialized when absent', () => {
		const model = parseLikePipeline('tokens: 3');
		expect(model).toEqual({ tokens: 3 });
		expect(model.label).toBeUndefined();
	});

	test('an authored label is preserved as authored', () => {
		const model = parseLikePipeline('label: "Session 12 party pool"\ntokens: 3');
		expect(model).toEqual({ label: 'Session 12 party pool', tokens: 3 });
	});

	test('tokens may be 0 (the floor)', () => {
		const model = parseLikePipeline('tokens: 0');
		expect(model.tokens).toBe(0);
	});

	test('rejects a missing/non-numeric tokens', () => {
		expect(() => parseLikePipeline('label: "Party"')).toThrow(/tokens/i);
		expect(() => parseLikePipeline('tokens: "three"')).toThrow(/tokens/i);
	});

	test('rejects a non-object block', () => {
		expect(() => parseLikePipeline('4')).toThrow();
	});
});

describe('D7 Task 6: serialize is byte-stable (emits only authored keys)', () => {
	test('parse -> serialize on the shipped example.yaml reproduces it exactly', () => {
		expect(serialize(parseLikePipeline(tokensExample))).toBe(tokensExample.trim());
	});

	test('tokens: 3 round-trips without materializing label', () => {
		const source = 'tokens: 3';
		const model = parseLikePipeline(source);
		expect(serialize(model)).toBe(source);
	});

	test('field order is label, tokens — only authored keys appear', () => {
		const model = parseLikePipeline('label: "Session 12 party pool"\ntokens: 3');
		expect(serialize(model)).toBe('label: Session 12 party pool\ntokens: 3');
	});

	test('output is trimmed (no trailing/leading whitespace), matching every other persisted element', () => {
		const out = serialize(parseLikePipeline(tokensExample));
		expect(out).not.toMatch(/\n$/);
		expect(out).not.toMatch(/^\s/);
	});

	test('round-trip stability: parse(serialize(parse(x))) deep-equals parse(x); serialize is stable on pass 2', () => {
		const m1 = parseLikePipeline(tokensExample);
		const s1 = serialize(m1);
		const m2 = parseLikePipeline(s1);
		expect(m2).toEqual(m1);
		expect(serialize(m2)).toBe(s1);
	});
});
