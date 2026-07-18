// D7 Task 3 (spec §4.1) — ds-resource model: parse + byte-stable serialize. Unlike
// ds-conditions, parse does NOT materialize class-derived fields (type/min) onto the
// model — class defaulting happens "at render" (view/panel.ts, via resolveResource),
// keeping the authored YAML honest: a `class: fury` block that never authored `type`/
// `min` round-trips WITHOUT those keys ever appearing in the persisted source.
import { parseYaml } from '../../mocks/obsidian';
import { parse, serialize } from '../../../src/elements/resource/model';
import type { ResourceModel } from '../../../src/elements/resource/model';
import resourceExample from '../../../src/elements/resource/example.yaml';

const parseLikePipeline = (source: string): ResourceModel => parse(parseYaml(source), source);

describe('D7 Task 3: resource model parse (spec §4.1 schema)', () => {
	test('parses the shipped example.yaml', () => {
		const model = parseLikePipeline(resourceExample);
		expect(model.current).toEqual(expect.any(Number));
		expect(model.class).toBeDefined();
	});

	test('class + current only: type/min are NOT materialized onto the model', () => {
		const model = parseLikePipeline('class: fury\ncurrent: 4');
		expect(model).toEqual({ class: 'fury', current: 4 });
		expect(model.type).toBeUndefined();
		expect(model.min).toBeUndefined();
	});

	test('explicit type/min/max are preserved as authored (an override, not defaulted)', () => {
		const model = parseLikePipeline('class: talent\ntype: Custom Clarity\ncurrent: -2\nmin: -6\nmax: 20');
		expect(model).toEqual({ class: 'talent', type: 'Custom Clarity', current: -2, min: -6, max: 20 });
	});

	test('a block with no class at all is valid (generic resource, no class-aware defaulting)', () => {
		const model = parseLikePipeline('current: 3');
		expect(model).toEqual({ current: 3 });
	});

	test('current may be negative (Talent Clarity, spec §1.2 "can go negative")', () => {
		const model = parseLikePipeline('class: talent\ncurrent: -3');
		expect(model.current).toBe(-3);
	});

	test('rejects a missing/non-numeric current', () => {
		expect(() => parseLikePipeline('class: fury')).toThrow(/current/i);
		expect(() => parseLikePipeline('class: fury\ncurrent: "four"')).toThrow(/current/i);
	});

	test('rejects a non-object block', () => {
		expect(() => parseLikePipeline('4')).toThrow();
	});
});

describe('D7 Task 3: serialize is byte-stable (emits only authored keys)', () => {
	test('parse -> serialize on the shipped example.yaml reproduces it exactly', () => {
		expect(serialize(parseLikePipeline(resourceExample))).toBe(resourceExample.trim());
	});

	test('class: fury + current: 4 round-trips without materializing type/min', () => {
		const source = 'class: fury\ncurrent: 4';
		const model = parseLikePipeline(source);
		expect(serialize(model)).toBe(source);
	});

	test('field order is class, type, current, min, max — only authored keys appear', () => {
		const model = parseLikePipeline('class: talent\ntype: Custom Clarity\ncurrent: -2\nmin: -6\nmax: 20');
		expect(serialize(model)).toBe('class: talent\ntype: Custom Clarity\ncurrent: -2\nmin: -6\nmax: 20');
	});

	test('a bare current-only block serializes with no other keys', () => {
		expect(serialize({ current: 3 })).toBe('current: 3');
	});

	test('output is trimmed (no trailing/leading whitespace), matching every other persisted element', () => {
		const out = serialize(parseLikePipeline(resourceExample));
		expect(out).not.toMatch(/\n$/);
		expect(out).not.toMatch(/^\s/);
	});

	test('round-trip stability: parse(serialize(parse(x))) deep-equals parse(x); serialize is stable on pass 2', () => {
		const m1 = parseLikePipeline(resourceExample);
		const s1 = serialize(m1);
		const m2 = parseLikePipeline(s1);
		expect(m2).toEqual(m1);
		expect(serialize(m2)).toBe(s1);
	});
});
