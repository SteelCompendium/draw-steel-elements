// D7 Task 3 (spec §4.1/§1.2) — RESOURCE_BY_CLASS: the static 9-class heroic-resource
// table (spec §1.2 verbatim: type/min/gainHint per class, cited RR §4 / AR). Not the
// compendium (spec §4.1: "not the compendium — D6 only enriches the gain rule when
// present" is future scope, not this task) — a plain, hard-coded map.
import { RESOURCE_BY_CLASS, resolveResource } from '../../../src/elements/resource/resourceByClass';

describe('D7 Task 3: RESOURCE_BY_CLASS (spec §1.2, the 9-class table)', () => {
	test('has exactly the 9 classes from spec §1.2, each with a positive-length gainHint', () => {
		const expectedClasses = [
			'censor',
			'conduit',
			'elementalist',
			'fury',
			'null',
			'shadow',
			'tactician',
			'talent',
			'troubadour',
		];
		expect(Object.keys(RESOURCE_BY_CLASS).sort()).toEqual(expectedClasses.sort());
		for (const key of expectedClasses) {
			const entry = RESOURCE_BY_CLASS[key];
			expect(entry.type.length).toBeGreaterThan(0);
			expect(entry.gainHint.length).toBeGreaterThan(0);
			expect(typeof entry.min).toBe('number');
		}
	});

	test('every class except Talent has min: 0 (spec §1.2: "default 0; Talent lifts the floor" — inverted for Talent, which alone drops below)', () => {
		for (const [key, entry] of Object.entries(RESOURCE_BY_CLASS)) {
			if (key === 'talent') continue;
			expect(entry.min).toBe(0);
		}
	});
});

describe('D7 Task 3: resolveResource(class?, overrides?) (spec §4.1)', () => {
	test('resolveResource("fury") -> {type: "Ferocity", min: 0, ...}', () => {
		const resolved = resolveResource('fury');
		expect(resolved.type).toBe('Ferocity');
		expect(resolved.min).toBe(0);
		expect(resolved.gainHint.length).toBeGreaterThan(0);
	});

	test('resolveResource("talent") -> Clarity, min below 0 (strained floor, AR: "-(1+Reason)")', () => {
		const resolved = resolveResource('talent');
		expect(resolved.type).toBe('Clarity');
		expect(resolved.min).toBeLessThan(0);
	});

	test('class lookup is case-insensitive (authored "Fury" matches the lowercase table key)', () => {
		expect(resolveResource('Fury').type).toBe('Ferocity');
		expect(resolveResource('TALENT').type).toBe('Clarity');
	});

	test('an unknown/absent class falls back to a generic label with min: 0', () => {
		const unknown = resolveResource('not-a-real-class');
		expect(unknown.type).toBe('Resource');
		expect(unknown.min).toBe(0);

		const absent = resolveResource(undefined);
		expect(absent.type).toBe('Resource');
		expect(absent.min).toBe(0);
	});

	test('explicit overrides win over class defaults for type/min (§4.1: "merges class defaults with explicit type/min")', () => {
		const resolved = resolveResource('fury', { type: 'Custom Fury Name', min: -3 });
		expect(resolved.type).toBe('Custom Fury Name');
		expect(resolved.min).toBe(-3);
		// gainHint still comes from the class table even when type/min are overridden.
		expect(resolved.gainHint).toBe(RESOURCE_BY_CLASS.fury.gainHint);
	});

	test('an override with an unknown/absent class still applies on top of the generic fallback', () => {
		const resolved = resolveResource(undefined, { type: 'Homebrew Points', min: -1 });
		expect(resolved.type).toBe('Homebrew Points');
		expect(resolved.min).toBe(-1);
	});
});
