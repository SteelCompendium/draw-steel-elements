// SC-482 — the shared "a write adds no default keys the user never wrote" helper
// (src/elements/shared/undeclaredDefaults.ts), exercised on a small stand-in parser that fills
// the same shapes the real ones do: scalars, a deep array/object default, and a derived default.
import { stringifyYaml } from 'obsidian';
import { omitUntouchedDefaults, recordAbsentDefaults, recordingDefaults, stringifyOmittingUntouched } from '@/elements/shared/undeclaredDefaults';

interface Model {
	name?: string;
	initial: number;
	current: number;
	min: number;
	rolls: number[];
	party: { tokens?: number };
	flag: boolean;
	anchor?: string;
}

/** Fills defaults like the real parsers: scalars, `[]` / `{}`, and `current` derived from `initial`. */
function parseModel(data: unknown, _raw: string): Model {
	const d = (typeof data === 'object' && data !== null ? data : {}) as Partial<Model>;
	const model = {} as Model;
	if (d.name !== undefined) model.name = d.name;
	model.initial = d.initial ?? 5;
	model.current = d.current ?? d.initial ?? 5;
	model.min = d.min ?? 0;
	model.rolls = d.rolls ?? [];
	model.party = d.party ?? {};
	model.flag = d.flag ?? false;
	if (d.anchor !== undefined) model.anchor = d.anchor;
	return model;
}

const KEYS = ['initial', 'current', 'min', 'rolls', 'party', 'flag'] as const;
const parse = recordingDefaults(parseModel, KEYS);
const yaml = (v: object): string => stringifyYaml(v).trim();

describe('SC-482 helper: recordingDefaults + omitUntouchedDefaults', () => {
	test('a key absent from the source and still equal to its default is omitted', () => {
		const model = parse({ name: 'x', initial: 7 }, '');
		expect(yaml(omitUntouchedDefaults(model))).toBe('name: x\ninitial: 7');
	});

	test('a key absent from the source whose value changed is written', () => {
		const model = parse({ name: 'x' }, '');
		model.min = 2;
		expect(yaml(omitUntouchedDefaults(model))).toBe('name: x\nmin: 2');
	});

	test('a key present in the source is written even when it equals its default', () => {
		const model = parse({ name: 'x', min: 0, flag: false, rolls: [] }, '');
		expect(yaml(omitUntouchedDefaults(model))).toBe('name: x\nmin: 0\nrolls: []\nflag: false');
	});

	test('a key present with the value undefined counts as absent (SC-466 r2)', () => {
		const model = parse({ name: 'x', min: undefined, flag: undefined }, '');
		expect(yaml(omitUntouchedDefaults(model))).toBe('name: x');
	});

	test('a null or blank body declares nothing: every defaulted key is omitted until it changes', () => {
		for (const body of [null, undefined, '', 'text']) {
			const model = parse(body, '');
			expect(yaml(omitUntouchedDefaults(model))).toBe('{}');
		}
		const model = parse(null, '');
		model.flag = true;
		expect(yaml(omitUntouchedDefaults(model))).toBe('flag: true');
	});

	test('a deep default mutated in place (rolls.push / party.tokens = 2) is written', () => {
		const model = parse({ name: 'x' }, '');
		model.rolls.push(14);
		model.party.tokens = 2;
		expect(yaml(omitUntouchedDefaults(model))).toBe('name: x\nrolls:\n  - 14\nparty:\n  tokens: 2');
	});

	test('a deep default mutated and then put back is omitted again (compared by value)', () => {
		const model = parse({ name: 'x' }, '');
		model.rolls.push(14);
		model.rolls.pop();
		expect(yaml(omitUntouchedDefaults(model))).toBe('name: x');
	});

	test('a derived default (current = initial) is omitted while unchanged, written once it moves', () => {
		const model = parse({ name: 'x', initial: 3 }, '');
		expect(model.current).toBe(3);
		expect(yaml(omitUntouchedDefaults(model))).toBe('name: x\ninitial: 3');
		model.current = 2;
		expect(yaml(omitUntouchedDefaults(model))).toBe('name: x\ninitial: 3\ncurrent: 2');
	});

	test('key order is the model order', () => {
		const model = parse({ flag: true, name: 'x', initial: 1, anchor: 'a1' }, '');
		model.min = 4;
		expect(Object.keys(omitUntouchedDefaults(model))).toEqual(['name', 'initial', 'min', 'flag', 'anchor']);
	});

	test('presence is read BEFORE the inner parse: a parse that fills the incoming data in place still records the key absent', () => {
		const inPlace = recordingDefaults((data: unknown) => {
			const d = data as { members?: string[] };
			d.members = d.members ?? [];
			return d as { members: string[] };
		}, ['members']);
		const model = inPlace({}, '');
		expect(yaml(omitUntouchedDefaults(model))).toBe('{}');
		model.members.push('Doran');
		expect(yaml(omitUntouchedDefaults(model))).toBe('members:\n  - Doran');
	});

	test('two instances never share a record', () => {
		const minimal = parse({ name: 'a' }, '');
		const full = parse({ name: 'b', min: 0, rolls: [] }, '');
		minimal.flag = true;
		expect(yaml(omitUntouchedDefaults(minimal))).toBe('name: a\nflag: true');
		expect(yaml(omitUntouchedDefaults(full))).toBe('name: b\nmin: 0\nrolls: []');
	});

	test('an instance with no record (built by the plugin) is returned unchanged, whole', () => {
		const built = parseModel({ name: 'x' }, '');
		expect(omitUntouchedDefaults(built)).toBe(built);
		expect(yaml(omitUntouchedDefaults(built))).toBe(
			'name: x\ninitial: 5\ncurrent: 5\nmin: 0\nrolls: []\nparty: {}\nflag: false',
		);
	});

	test('the record never reaches stringifyYaml: not an own key of the model, not in the output', () => {
		const model = parse({ name: 'x' }, '');
		expect(Object.keys(model)).toEqual(['name', 'initial', 'current', 'min', 'rolls', 'party', 'flag']);
		expect(Object.getOwnPropertySymbols(model)).toEqual([]);
		expect(stringifyYaml(model)).not.toMatch(/record|filled|absent|snapshot/i);
		expect(stringifyYaml(omitUntouchedDefaults(model))).toBe('name: x\n');
	});

	test('a DTO built from the model is filtered by the owner record, not by its own values', () => {
		const model = parse({ name: 'x' }, '');
		model.rolls.push(1);
		const dto = { name: model.name, rolls: model.rolls.map((r) => r * 10), min: model.min, flag: model.flag };
		// rolls changed on the owner (kept, with the DTO's mapped value); min / flag are untouched defaults.
		expect(omitUntouchedDefaults(model, dto)).toEqual({ name: 'x', rolls: [10] });
	});
});

describe('SC-482 helper: recordAbsentDefaults on a nested instance', () => {
	class Nested {
		name: string;
		used: boolean;
		constructor(d: { name?: string; used?: boolean }) {
			this.name = d.name ?? '';
			this.used = d.used ?? false;
		}
	}

	test('each nested instance records its own absent keys from its own raw object', () => {
		const raw = [{ name: 'Power' }, { name: 'Greed', used: false }];
		const items = raw.map((r) => {
			const n = new Nested(r);
			recordAbsentDefaults(n, ['name', 'used'].filter((k) => (r as Record<string, unknown>)[k] === undefined));
			return n;
		});
		expect(yaml(omitUntouchedDefaults(items[0]))).toBe('name: Power');
		expect(yaml(omitUntouchedDefaults(items[1]))).toBe('name: Greed\nused: false');
		items[0].used = true;
		expect(yaml(omitUntouchedDefaults(items[0]))).toBe('name: Power\nused: true');
	});
});

describe('SC-482 helper: stringifyOmittingUntouched', () => {
	test('writes the filtered keys trimmed', () => {
		const model = parse({}, '');
		model.min = 2;
		expect(stringifyOmittingUntouched(model)).toBe('min: 2');
	});

	test('nothing left from a mapping source is `{}` (every element can re-parse it); from a null / blank source it is an empty body', () => {
		expect(stringifyOmittingUntouched(parse({}, ''))).toBe('{}');
		expect(stringifyOmittingUntouched(parse({ name: 'x' }, ''))).toBe('name: x');
		for (const blank of [null, undefined]) expect(stringifyOmittingUntouched(parse(blank, ''))).toBe('');
	});

	test('keys holding undefined are not content: only-undefined from a blank source is an empty body', () => {
		const model = parse(null, '');
		expect(stringifyOmittingUntouched(model, { ...omitUntouchedDefaults(model), name: undefined })).toBe('');
	});

	test('a model with no record keeps the whole output, even when it is `{}`', () => {
		expect(stringifyOmittingUntouched({})).toBe('{}');
		expect(stringifyOmittingUntouched(parseModel({}, ''))).toContain('initial: 5');
	});
});
