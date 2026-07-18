// D7 Task 2 (spec §4.4) — ds-conditions model: parse normalizes every entry to a
// `Condition` (bare strings -> {key}); serialize down-converts a key-only Condition back
// to a bare string. "Byte-stable round-trip" here means DETERMINISTIC, not
// format-preserving (model.ts's file header): a key-only condition ALWAYS serializes as
// a bare string, so "restrained" (no color/effect) round-trips as authored not because
// the original text is remembered, but because that is the only form a key-only
// Condition ever produces.
import { parseYaml } from '../../mocks/obsidian';
import { parse, serialize } from '../../../src/elements/conditions/model';
import type { ConditionsModel } from '../../../src/elements/conditions/model';
import conditionsExample from '../../../src/elements/conditions/example.yaml';

const parseLikePipeline = (source: string): ConditionsModel => parse(parseYaml(source), source);

describe('D7 Task 2: conditions model parse (spec §4.4 schema)', () => {
	test('parses the shipped example.yaml into three normalized conditions', () => {
		const model = parseLikePipeline(conditionsExample);
		expect(model.conditions).toEqual([
			{ key: 'bleeding', effect: 'save ends' },
			{ key: 'slowed', effect: 'EoT' },
			{ key: 'restrained' },
		]);
	});

	test('a bare string entry normalizes to {key} — no effect/color materialized', () => {
		const model = parseLikePipeline('conditions:\n  - restrained');
		expect(model.conditions).toEqual([{ key: 'restrained' }]);
	});

	test('an object entry keeps only the fields it was given (color OR effect alone)', () => {
		const model = parseLikePipeline('conditions:\n  - key: bleeding\n    color: "#ff0000"');
		expect(model.conditions).toEqual([{ key: 'bleeding', color: '#ff0000' }]);
	});

	test('a blank block materializes an empty conditions[] default rather than throwing', () => {
		expect(parseLikePipeline('').conditions).toEqual([]);
	});

	test('rejects a non-list conditions field', () => {
		expect(() => parseLikePipeline('conditions: not-a-list')).toThrow(/conditions/i);
	});

	test('rejects a blank bare-string entry', () => {
		expect(() => parseLikePipeline('conditions:\n  - "   "')).toThrow();
	});

	test('rejects an entry that is neither a string nor an object with a key', () => {
		expect(() => parseLikePipeline('conditions:\n  - 5')).toThrow();
		expect(() => parseLikePipeline('conditions:\n  - color: red')).toThrow();
	});
});

describe('D7 Task 2: serialize is byte-stable (deterministic key-only -> bare string)', () => {
	test('parse -> serialize on the shipped example.yaml reproduces it exactly', () => {
		expect(serialize(parseLikePipeline(conditionsExample))).toBe(conditionsExample.trim());
	});

	test('a fully key-only condition list serializes as bare strings, never {key: ...} maps', () => {
		const model = parseLikePipeline('conditions:\n  - restrained\n  - slowed');
		const out = serialize(model);
		expect(out).toBe('conditions:\n  - restrained\n  - slowed');
		expect(out).not.toContain('key:');
	});

	test('a condition with only an effect serializes as the full object, not a bare string', () => {
		const model = parseLikePipeline('conditions:\n  - key: bleeding\n    effect: save ends');
		expect(serialize(model)).toBe('conditions:\n  - key: bleeding\n    effect: save ends');
	});

	test('clearing a condition\'s last customization drops it back to a bare string on the next persist', () => {
		const model = parseLikePipeline('conditions:\n  - key: bleeding\n    effect: save ends');
		model.conditions[0] = { key: 'bleeding' };
		expect(serialize(model)).toBe('conditions:\n  - bleeding');
	});

	test('an empty conditions[] serializes as an empty list, not an omitted key', () => {
		expect(serialize({ conditions: [] })).toBe('conditions: []');
	});

	test('output is trimmed (no trailing/leading whitespace), matching every other persisted element', () => {
		const out = serialize(parseLikePipeline(conditionsExample));
		expect(out).not.toMatch(/\n$/);
		expect(out).not.toMatch(/^\s/);
	});

	test('round-trip stability: parse(serialize(parse(x))) deep-equals parse(x); serialize is stable on pass 2', () => {
		const m1 = parseLikePipeline(conditionsExample);
		const s1 = serialize(m1);
		const m2 = parseLikePipeline(s1);
		expect(m2).toEqual(m1);
		expect(serialize(m2)).toBe(s1);
	});
});
