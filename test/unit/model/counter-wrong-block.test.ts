// A `ds-counter` block that does not hold a YAML map of keys. The rules under test:
//  - text, a number, a boolean or a list in the block is refused with the one plain message the montage and the negotiation use (a write
//    would replace the user's text, so there must be no counter to write from);
//  - an empty block (nothing, blank lines, only comments, a bare `null` or `~`, or `undefined`) is a fresh counter, exactly the one a `{}`
//    block is;
//  - a block that is a map is read as before, and a bad YAML text still says "Invalid YAML format".
import { Counter } from '@model/Counter';
import { parseYaml } from '../../mocks/obsidian';
import { parse as parseElement, serialize } from '../../../src/elements/counter/model';

const MESSAGE = 'Invalid data: the block must be a map of keys.';

describe('a counter block that is not a map of keys', () => {
	test.each([
		['text', 'hello'],
		['a quoted text', '"hello"'],
		['a number', '5'],
		['zero', '0'],
		['a boolean', 'true'],
		['false', 'false'],
		['a list', '- a\n- b'],
		['a flow list', '[1, 2]'],
		['a nested list', '- - a\n  - b'],
		['an empty-looking quoted string', "''"],
	])('%s is refused with a plain message, from the source text and from the parsed data', (_name, source) => {
		expect(() => Counter.parseYaml(source)).toThrow(MESSAGE);
		expect(() => Counter.parse(parseYaml(source))).toThrow(MESSAGE);
		expect(() => parseElement(parseYaml(source), source)).toThrow(MESSAGE);
	});

	test('the message is plain: no JavaScript internals reach it', () => {
		for (const source of ['hello', '5', 'true', '- a', '[]']) {
			let message = '';
			try {
				Counter.parseYaml(source);
			} catch (e) {
				message = (e as Error).message;
			}
			expect(message).toBe(MESSAGE);
			expect(message).not.toMatch(/Cannot read properties|is not a function|TypeError|undefined/);
		}
	});

	test('an array handed to parse() directly is refused too (it is an object, but not a map)', () => {
		expect(() => Counter.parse([])).toThrow(MESSAGE);
		expect(() => Counter.parse([{ current_value: 3 }])).toThrow(MESSAGE);
	});

	// An explicit YAML tag on the whole block turns the text into an object that is not a map (a Date, a Uint8Array, a Set, a Map); a counter
	// drawn from one would have its text replaced by `current_value: 1` on the first +.
	test.each([
		['!!timestamp', '!!timestamp 2024-01-01', '[object Date]'],
		['!!binary', '!!binary aGVsbG8=', '[object Uint8Array]'],
		['!!set', '!!set\n? a\n? b', '[object Set]'],
		['!!omap', '!!omap\n- a: 1', '[object Map]'],
	])('a block tagged %s is refused with the same plain message, from the source text and from the parsed data', (_name, source, shape) => {
		expect(Object.prototype.toString.call(parseYaml(source))).toBe(shape); // the real parse hands over the non-map object this test is about
		expect(() => Counter.parseYaml(source)).toThrow(MESSAGE);
		expect(() => Counter.parse(parseYaml(source))).toThrow(MESSAGE);
		expect(() => parseElement(parseYaml(source), source)).toThrow(MESSAGE);
	});

	test('a tagged map (`!!map {}`) and a plain `{}` are still maps: fresh counters', () => {
		expect(Counter.parseYaml('!!map {}')).toEqual(Counter.parse({}));
		expect(Counter.parseYaml('{}')).toEqual(Counter.parse({}));
		expect(Counter.parseYaml('!!map\nname: Torches\ncurrent_value: 2').name).toBe('Torches');
	});

	test('a Date, a Set, a Map and a typed array handed to parse() directly are refused too', () => {
		for (const data of [new Date(0), new Set(['a']), new Map([['a', 1]]), new Uint8Array([1])]) {
			expect(() => Counter.parse(data)).toThrow(MESSAGE);
		}
		expect(Counter.parse(Object.create(null)).current_value).toBe(0); // a map with no prototype is still a map
	});

	test('a YAML text that does not parse keeps its own message', () => {
		expect(() => Counter.parseYaml('a: [1')).toThrow(/^Invalid YAML format: /);
	});
});

describe('an empty counter block is a fresh counter, the one a `{}` block is', () => {
	const fresh = Counter.parse({});

	test('a `{}` block is no name, current 0, min 0, no max (the counter an empty block must match)', () => {
		expect(fresh.max_value).toBeUndefined();
		expect(fresh.current_value).toBe(0);
		expect(fresh.min_value).toBe(0);
		expect(fresh.name).toBeUndefined();
		expect(fresh.value_height).toBe(3);
		expect(fresh.name_height).toBe(1);
	});

	test.each([
		['nothing', ''],
		['blank lines', '\n  \n\n'],
		['only a comment', '# a note to self\n# another'],
		['a bare null', 'null'],
		['a bare tilde', '~'],
	])('%s: the same model as `{}`', (_name, source) => {
		expect(Counter.parseYaml(source)).toEqual(fresh);
		expect(Counter.parse(parseYaml(source))).toEqual(fresh);
	});

	test.each([
		['undefined', undefined],
		['null', null],
	])('%s handed to parse() directly: the same model as `{}`', (_name, data) => {
		expect(Counter.parse(data)).toEqual(fresh);
	});

	test('through the element, an empty source writes back as an empty body, and a `{}` source writes back as `{}`', () => {
		expect(serialize(parseElement(null, ''))).toBe('');
		expect(serialize(parseElement(undefined, ''))).toBe('');
		expect(serialize(parseElement({}, ''))).toBe('{}');
	});

	test('the first step on an empty block writes the one key that changed', () => {
		const model = parseElement(null, '');
		model.current_value += 1;
		expect(serialize(model)).toBe('current_value: 1');
	});
});

describe('a counter block that is a map is read as before', () => {
	test('every key is read; a missing one takes its default', () => {
		const model = Counter.parseYaml('name: Health\ncurrent_value: 4\nmax_value: 10\nmin_value: 1\nvalue_height: 2\nname_height: 1.5');
		expect([model.name, model.current_value, model.max_value, model.min_value, model.value_height, model.name_height]).toEqual(['Health', 4, 10, 1, 2, 1.5]);
		const partial = Counter.parseYaml('name: Torches');
		expect([partial.name, partial.current_value, partial.max_value, partial.min_value]).toEqual(['Torches', 0, undefined, 0]);
	});

	test('a map with only unknown keys is a map: it parses', () => {
		expect(Counter.parseYaml('table_notes: keep me').current_value).toBe(0);
	});
});
