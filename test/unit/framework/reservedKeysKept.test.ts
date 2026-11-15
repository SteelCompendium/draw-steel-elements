// SC-652 -- what the framework removes from a block's data on read comes back on write, by value.
// The reserved `prefs:` map and the three collapse keys are popped before the schema and the model see
// them; the serializer wrapper puts them back. Until SC-652 the wrapper only knew the applied overrides, the
// SC-406 gated keys and a boolean collapse key, so a `prefs:` map of keys the plugin does not use, a `prefs:`
// that is not a map, and `collapsed: yes` were deleted by the first write. Reading is unchanged: each of those
// still warns and is still not applied. This file pins the extract / wrap functions; the element, form and
// sidebar write paths are in test/dom/elements/wrapperKeysKept.test.ts.
import { emptyPrefPassthrough, extractPrefOverrides, withPrefOverrides } from '@/framework/prefOverrides';
import {
	extractCollapseKeys,
	peelLeadingCollapseKeys,
	resolveCollapseState,
	withCollapseKeys,
	withReservedKeys,
} from '@/framework/chrome/collapsedKey';
import { DSE_PREF_DESCRIPTORS } from '@/prefs/catalog';
import { parseYaml, stringifyYaml } from '../../mocks/obsidian';

const store = { descriptors: () => DSE_PREF_DESCRIPTORS } as never;
const read = (prefsValue: unknown) => {
	const data: Record<string, unknown> = { prefs: prefsValue, name: 'x' };
	const passthrough = emptyPrefPassthrough();
	const overrides = extractPrefOverrides(data, store, passthrough);
	return { data, passthrough, overrides };
};

let warn: jest.SpyInstance;
beforeEach(() => {
	warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('SC-652: extractPrefOverrides keeps the whole `prefs:` value', () => {
	// One key of every kind the read rejects or applies, in an order that is not the catalog's.
	const MAP = {
		boardDensity: 'compact', // unknown / typo
		reduceMotion: true, // applied
		collapseDefault: true, // attr-less, behavioural
		textScale: 1.2, // attr-less, css-bearing
		sbCharLine: 'one', // perBlock: false
		printPreview: 'on', // SC-406 gated
		authoringControls: true, // SC-406 gated
		portraits: 'off', // applied
	};

	test('every key survives in the author\'s order, whatever the read did with it', () => {
		const { passthrough } = read(MAP);
		expect(passthrough.present).toBe(true);
		expect(passthrough.value).toEqual(MAP);
		expect(Object.keys(passthrough.value as object)).toEqual(Object.keys(MAP));
	});

	test('what is applied does not change: unknown, attr-less, css-bearing and per-block-false keys are still rejected, each with its warning', () => {
		const { overrides } = read(MAP);
		const applied = Object.keys(overrides ?? {});
		expect(applied).toEqual(expect.arrayContaining(['portraits', 'reduceMotion']));
		for (const key of ['boardDensity', 'collapseDefault', 'textScale', 'sbCharLine', 'authoringControls']) expect(applied).not.toContain(key);
		const said = warn.mock.calls.map((c) => String(c[0]));
		expect(said.some((m) => m.includes('unknown per-block pref "boardDensity"'))).toBe(true);
		expect(said.some((m) => m.includes('"collapseDefault" is not a presentation preference'))).toBe(true);
		expect(said.some((m) => m.includes('"textScale" is not a presentation preference'))).toBe(true);
		expect(said.some((m) => m.includes('"sbCharLine" cannot be set per block'))).toBe(true);
	});

	test.each([['a scalar', 'compact'], ['a list', ['a', 'b']], ['nothing', null], ['an empty map', {}]])(
		'a `prefs:` value that is %s is kept as it is (and a non-map still warns)',
		(_label, value) => {
			const { passthrough, data } = read(value);
			expect(passthrough).toEqual({ present: true, value });
			expect('prefs' in data).toBe(false);
			const nonMap = !value || typeof value !== 'object' || Array.isArray(value);
			expect(warn.mock.calls.some((c) => String(c[0]).includes('must be a map'))).toBe(nonMap);
		},
	);

	test('a block without a `prefs:` key leaves the passthrough empty, so no wrapper is installed', () => {
		const passthrough = emptyPrefPassthrough();
		expect(extractPrefOverrides({ name: 'x' }, store, passthrough)).toBeUndefined();
		expect(passthrough.present).toBe(false);
		expect(withReservedKeys(() => 'name: x', { collapsePopped: {} })(undefined)).toBe('name: x');
	});
});

describe('SC-652: withPrefOverrides writes the kept value back', () => {
	test('a map, in its own key order, ahead of the body', () => {
		const out = withPrefOverrides(() => 'name: x', undefined, { present: true, value: { b: 1, a: 2, boardDensity: 'compact' } })(undefined);
		expect(out).toBe('prefs:\n  b: 1\n  a: 2\n  boardDensity: compact\nname: x');
	});

	test.each([['compact'], [['a', 'b']], [null]])('a non-map value %j is re-emitted by value and parses back equal', (value) => {
		const out = withPrefOverrides(() => 'name: x', undefined, { present: true, value })(undefined);
		expect(parseYaml(out)).toEqual({ prefs: value, name: 'x' });
	});

	test('a body that already declares `prefs:` (ds-hero splices its raw text) is not given a second one', () => {
		const body = 'prefs:\n  boardDensity: compact\nname: x';
		const out = withPrefOverrides(() => body, undefined, { present: true, value: { boardDensity: 'compact' } })(undefined);
		expect(out).toBe(body);
	});
});

describe('SC-652: extractCollapseKeys keeps a collapse key it cannot read', () => {
	test.each([['yes', 'yes'], ['a number', 1], ['a quoted word', 'true'], ['nothing', null]])(
		'collapsed: %s is removed from the data, warned about, not applied, and put in `popped` by value',
		(_label, value) => {
			const data: Record<string, unknown> = { collapsed: value, name: 'x' };
			const keys = extractCollapseKeys(data);
			expect('collapsed' in data).toBe(false);
			expect(keys.collapsed).toBeUndefined();
			expect(keys.popped).toEqual({ collapsed: value });
			expect(warn.mock.calls.some((c) => String(c[0]).includes('"collapsed:" key must be true or false'))).toBe(true);
		},
	);

	test('collapsible: / collapse_default: are kept the same way when the framework claims them, and left in the data when it does not', () => {
		const claimed: Record<string, unknown> = { collapsible: 'no', collapse_default: 0 };
		expect(extractCollapseKeys(claimed, true).popped).toEqual({ collapsible: 'no', collapse_default: 0 });
		expect(claimed).toEqual({});
		const owned: Record<string, unknown> = { collapsible: 'no', collapse_default: 0 };
		expect(extractCollapseKeys(owned, false).popped).toEqual({});
		expect(owned).toEqual({ collapsible: 'no', collapse_default: 0 });
	});

	test('the collapse state is unchanged: an unreadable key means "not set", so the global default decides', () => {
		const prefs = { collapsibleDefault: true, collapseDefault: true };
		const bad = extractCollapseKeys({ collapsed: 'yes', collapsible: 'no', collapse_default: 'off' }, true);
		expect(resolveCollapseState(bad, prefs)).toEqual(resolveCollapseState(extractCollapseKeys({}), prefs));
		expect(resolveCollapseState(bad, prefs)).toEqual({ collapsible: true, collapsedDefault: true });
	});

	test('withCollapseKeys writes each kept value back, in the order the keys are popped', () => {
		const keys = extractCollapseKeys({ collapse_default: 1, collapsed: 'yes', collapsible: 'false' }, true);
		const out = withCollapseKeys(() => 'name: x', keys.popped)(undefined);
		expect(parseYaml(out)).toEqual({ collapsed: 'yes', collapsible: 'false', collapse_default: 1, name: 'x' });
		expect(out.split('\n').filter((l) => /^collaps/.test(l)).map((l) => l.split(':')[0])).toEqual(['collapsed', 'collapsible', 'collapse_default']);
		expect(out).toBe(`${stringifyYaml({ collapsed: 'yes', collapsible: 'false', collapse_default: 1 })}name: x`);
	});
});

describe('SC-652: the non-mapping-body rescue cannot drop a collapse key', () => {
	test.each(['collapsed', 'collapsible', 'collapse_default'])(
		'a non-boolean `%s:` line is never peeled off the source, so it stays in the body (nothing to put back)',
		(key) => {
			const source = `${key}: yes\nSome prose.`;
			expect(peelLeadingCollapseKeys(source)).toEqual({ source, peeled: {} });
		},
	);

	test('a boolean line is peeled and the unreadable one after it stays in the body', () => {
		expect(peelLeadingCollapseKeys('collapsed: true\ncollapsible: yes\nprose')).toEqual({
			source: 'collapsible: yes\nprose',
			peeled: { collapsed: true },
		});
	});
});

describe('SC-652: the reserved keys keep today\'s order and a block with none is untouched', () => {
	test('`prefs:` first, then the collapse keys, then the body', () => {
		const keys = extractCollapseKeys({ collapsed: 'yes' });
		const out = withReservedKeys(() => 'name: x', {
			collapsePopped: keys.popped,
			prefPassthrough: { present: true, value: { boardDensity: 'compact' } },
		})(undefined);
		expect(out).toBe('prefs:\n  boardDensity: compact\ncollapsed: yes\nname: x');
	});

	test('an empty body after kept keys is dropped, not written as `{}` (SC-482)', () => {
		const out = withReservedKeys(() => '{}', {
			collapsePopped: { collapsed: 'yes' },
			prefPassthrough: { present: true, value: { boardDensity: 'compact' } },
		})(undefined);
		expect(out).toBe('prefs:\n  boardDensity: compact\ncollapsed: yes');
	});
});
