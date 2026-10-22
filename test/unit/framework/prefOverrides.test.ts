// SC-482 — withPrefOverrides re-emits the author's `prefs:` map ahead of the element body. A body of
// exactly `{}` ("nothing left to write") cannot follow top-level keys (`prefs:\n  x: y\n{}` is invalid
// YAML), so it is dropped. Both branches are pinned: the plain one, and the SC-406 passthrough one that
// a gated pref such as `authoringControls` takes in the shipped product.
import { withPrefOverrides } from '@/framework/prefOverrides';

describe('SC-482: withPrefOverrides drops a body of exactly {}', () => {
	test('plain branch: the prefs lines only, no `{}`', () => {
		const out = withPrefOverrides(() => '{}', { sbDensity: 'compact' } as never)(undefined);
		expect(out).toBe('prefs:\n  sbDensity: compact');
	});

	test('passthrough branch (a gated pref kept alongside): the prefs lines only, no `{}`', () => {
		const out = withPrefOverrides(() => '{}', {}, { order: ['authoringControls'], values: { authoringControls: true } })(undefined);
		expect(out).toBe('prefs:\n  authoringControls: true');
	});

	test('any other body is concatenated byte-for-byte after the prefs lines (both branches)', () => {
		expect(withPrefOverrides(() => 'name: x', { sbDensity: 'compact' } as never)(undefined)).toBe('prefs:\n  sbDensity: compact\nname: x');
		expect(
			withPrefOverrides(() => 'name: x', {}, { order: ['authoringControls'], values: { authoringControls: true } })(undefined),
		).toBe('prefs:\n  authoringControls: true\nname: x');
	});
});
