// SC-671 — counter model: a key the counter does not read (`note_to_self:`, `extra: {a: 1}`) survives parse -> serialize. The block was
// rewritten from the `Counter` instance alone, so the first write deleted every key the parser did not copy. The unknown top-level keys are
// written back after ALL the known ones (`_dse_anchor` too), in their original relative order, with the value as it parsed; SC-482 (a
// write adds no default the source never declared) and the byte-for-byte shape of a block with no unknown keys are unchanged.
import { parseYaml } from '../../mocks/obsidian';
import { KNOWN_KEYS, parse, serialize } from '../../../src/elements/counter/model';
import { Counter } from '../../../src/model/Counter';

const parseLikePipeline = (source: string): Counter => parse(parseYaml(source), source);
const keysOf = (text: string): string[] => text.split('\n').filter((line) => /^\S/.test(line)).map((line) => line.split(':')[0]);
const roundTrip = (source: string): string => serialize(parseLikePipeline(source));

const OWN = [
	'name: Torches', 'note_to_self: keep me', 'max_value: 5', 'extra:', '  a: 1', '  deep:', '    - x', '    - y', 'current_value: 2',
	'tags: [a, b]', 'nothing:', 'min_value: 1', 'value_height: 2', 'name_height: 2', '_dse_anchor: abc123', 'zz_last: 9',
].join('\n');

describe('SC-671: counter unknown keys', () => {
	test('scalar, nested map, list and null unknown keys come back with the same values after a mutation', () => {
		const m = parseLikePipeline(OWN);
		m.current_value = 3;
		const back = parseYaml(serialize(m));
		expect(back.note_to_self).toBe('keep me');
		expect(back.extra).toEqual({ a: 1, deep: ['x', 'y'] });
		expect(back.tags).toEqual(['a', 'b']);
		expect(back.nothing).toBeNull();
		expect(back.zz_last).toBe(9);
		expect(back.current_value).toBe(3);
	});

	test('order: the known keys in their fixed order, then `_dse_anchor`, then the unknown keys in their original relative order', () => {
		expect(keysOf(roundTrip(OWN))).toEqual([
			'max_value', 'current_value', 'min_value', 'name', 'value_height', 'name_height', '_dse_anchor',
			'note_to_self', 'extra', 'tags', 'nothing', 'zz_last',
		]);
	});

	test('the ticket repro: `note_to_self` and `extra: {a: 1}` next to a name and a value are still there after a +', () => {
		const m = parseLikePipeline('name: Torches\ncurrent_value: 1\nmax_value: 5\nnote_to_self: keep me\nextra: {a: 1}');
		m.current_value += 1;
		expect(serialize(m)).toBe('max_value: 5\ncurrent_value: 2\nname: Torches\nnote_to_self: keep me\nextra:\n  a: 1');
	});

	test('SC-482 still holds with unknown keys present: no `min_value`, `value_height`, `name_height` or `current_value` the source never declared', () => {
		const m = parseLikePipeline('name: Torches\nmax_value: 5\nnote_to_self: keep me');
		expect(serialize(m)).toBe('max_value: 5\nname: Torches\nnote_to_self: keep me');
		m.current_value = 1; // an absent key whose value changed is written
		expect(serialize(m)).toBe('max_value: 5\ncurrent_value: 1\nname: Torches\nnote_to_self: keep me');
	});

	test('a block with no unknown keys serializes exactly as the whole instance did (byte for byte)', () => {
		const text = 'max_value: 20\ncurrent_value: 7\nmin_value: 0\nname: Health\nvalue_height: 3\nname_height: 1\n_dse_anchor: abc123';
		expect(roundTrip(text)).toBe(text);
		expect(roundTrip('name: Health\nmax_value: 20')).toBe('max_value: 20\nname: Health');
	});

	test('`value_height` and `name_height` are known keys: written once in their place, never carried as unknown', () => {
		const out = roundTrip('name: Health\nvalue_height: 4\nname_height: 2\nnote: x');
		expect(out).toBe('name: Health\nvalue_height: 4\nname_height: 2\nnote: x');
		expect(out.match(/value_height/g)).toHaveLength(1);
		expect(out.match(/name_height/g)).toHaveLength(1);
	});

	test('a wrong-typed or falsy known value keeps today\'s behaviour and is not carried as an unknown key', () => {
		// `value_height: 0` reads as the default 3 and is written as 3; `max_value: ""` is written as typed; none is duplicated
		const out = roundTrip('name: Health\nvalue_height: 0\nmax_value: ""\nnote: x');
		expect(out).toBe('max_value: ""\nname: Health\nvalue_height: 3\nnote: x');
	});

	test('keys that only look like the counter\'s own (`Name`, `maxValue`, `Max_Value`) are unknown keys, written back beside the real ones', () => {
		const out = roundTrip('name: Health\nName: Other\nmaxValue: 9\nMax_Value: 8\ncurrent_value: 1');
		const back = parseYaml(out);
		expect(back).toEqual({ current_value: 1, name: 'Health', Name: 'Other', maxValue: 9, Max_Value: 8 });
		expect(keysOf(out)).toEqual(['current_value', 'name', 'Name', 'maxValue', 'Max_Value']);
	});

	test('`__proto__`, `constructor`, `toString`, `hasOwnProperty` and `toJSON` keys pollute nothing, do not crash and come back as plain keys', () => {
		const text = 'name: Health\nmax_value: 5\n__proto__:\n  polluted: yes\nconstructor: c\ntoString: s\nhasOwnProperty: h\ntoJSON: j\ncurrent_value: 1';
		const m = parseLikePipeline(text);
		m.current_value = 2;
		const out = serialize(m);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
		expect(Object.getPrototypeOf(m)).toBe(Counter.prototype);
		expect(m.name).toBe('Health');
		expect(out).toContain('polluted');
		const back = parseYaml(out);
		expect(back.current_value).toBe(2);
		expect([back.constructor, back.toString, back.hasOwnProperty, back.toJSON]).toEqual(['c', 's', 'h', 'j']);
		expect(Object.keys(back).slice(-5)).toEqual(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'toJSON']);
		expect(serialize(parseLikePipeline(out))).toBe(out); // stable on the next pass
	});

	test('no own property is added to the instance: the model has exactly the seven fields', () => {
		const m = parseLikePipeline(OWN);
		expect(Object.keys(m)).toEqual(['max_value', 'current_value', 'min_value', 'name', 'value_height', 'name_height', '_dse_anchor']);
	});

	test('KNOWN_KEYS is exactly the keys of a parsed Counter: a field added to `Counter.parse` and not to the list fails here', () => {
		expect([...KNOWN_KEYS].sort()).toEqual(Object.keys(Counter.parse({})).sort());
	});

	test('an extra whose key the model owns is never written over the model\'s value (a field missing from KNOWN_KEYS cannot make a press a no-op)', () => {
		// reach the case no real source can: a model with a field `step` that KNOWN_KEYS does not list, so the source's `step: 5` is carried as an unknown pair
		let isolated: typeof import('../../../src/elements/counter/model') | undefined;
		jest.isolateModules(() => {
			jest.doMock('@model/Counter', () => {
				const actual = jest.requireActual('@model/Counter');
				const Real = actual.Counter;
				class WithStep extends Real {
					step = 1;
					static parse(data: any): any {
						const c = Real.parse(data);
						c.step = data?.step ?? 1;
						return c;
					}
				}
				return { ...actual, Counter: WithStep };
			});
			isolated = require('../../../src/elements/counter/model');
		});
		jest.dontMock('@model/Counter');
		const source = 'name: Torches\ncurrent_value: 1\nstep: 5\nnote: keep';
		const m: any = isolated!.parse(parseYaml(source), source);
		m.step = 6;
		m.current_value = 2;
		const back = parseYaml(isolated!.serialize(m));
		expect(back.step).toBe(6);
		expect(back.current_value).toBe(2);
		expect(back.note).toBe('keep');
		expect(isolated!.serialize(m).match(/^step:/gm)).toHaveLength(1);
	});

	test('a second and a third pass (re-parse of the plugin\'s own output) keep every key and stop changing', () => {
		const first = roundTrip(OWN);
		const second = roundTrip(first);
		const third = roundTrip(second);
		expect(second).toBe(first);
		expect(third).toBe(first);
		expect(parseYaml(third).extra).toEqual({ a: 1, deep: ['x', 'y'] });
	});

	test('two counters keep each their own unknown keys', () => {
		const a = parseLikePipeline('name: A\nnote: from a');
		const b = parseLikePipeline('name: B\nother: from b');
		expect(serialize(a)).toBe('name: A\nnote: from a');
		expect(serialize(b)).toBe('name: B\nother: from b');
	});

	test('a re-parse of an edited source carries that source\'s keys, not the earlier set (an outside edit adds one and removes one)', () => {
		const before = parseLikePipeline('name: A\nkeep: 1\ngone: 2');
		const after = parseLikePipeline('name: A\nkeep: 1\nadded: 3');
		expect(serialize(before)).toBe('name: A\nkeep: 1\ngone: 2');
		expect(serialize(after)).toBe('name: A\nkeep: 1\nadded: 3');
	});

	test('a key that looks like an integer is written FIRST, quoted (JavaScript key order, pinned so nobody "fixes" it by accident)', () => {
		const out = roundTrip('name: Health\nmax_value: 5\nnote: a\n2024: year');
		expect(out.split('\n')[0]).toBe('"2024": year');
		expect(out.split('\n')[1]).toBe('max_value: 5');
		expect(parseYaml(out).note).toBe('a');
		expect(roundTrip(out)).toBe(out); // and it is stable on the next pass
	});

	test('a non-map body keeps today\'s behaviour: nothing is carried, nothing crashes differently', () => {
		// what the develop build wrote for them (SC-672 owns whether that is right): a scalar body comes back empty, a list as `{}`
		expect(roundTrip('hello')).toBe('');
		expect(roundTrip('- a\n- b')).toBe('{}');
		expect(() => parse(null, '')).toThrow(TypeError); // the empty block (SC-672) is still the raw TypeError it was
	});
});
