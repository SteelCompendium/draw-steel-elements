// SC-406 — the 7.0.0 release gate (`experimental` in data.json), the parts that need no
// plugin: the switch module, the registry's effective-hidden rule, the pref catalog filter,
// and the settings round-trip. The surfaces it gates (sidebar, placeholder card, commands,
// settings pages) are in test/dom/framework/experimentalGate.test.ts.
import { isExperimental, readExperimentalSetting, setExperimental } from '../../../src/framework/experimental';
import { isDefinitionHidden } from '../../../src/framework/registry';
import {
	DSE_PREF_DESCRIPTORS,
	EXPERIMENTAL_PREF_KEYS,
	activePrefDescriptors,
} from '../../../src/prefs/catalog';
import { DEFAULT_SETTINGS, migrateSettings } from '../../../src/model/Settings';

describe('SC-406 — the switch', () => {
	test('a freshly loaded module is OFF (build-time tooling with no data.json sees the shipped state)', () => {
		let fresh!: typeof import('../../../src/framework/experimental');
		jest.isolateModules(() => {
			fresh = require('../../../src/framework/experimental');
		});
		expect(fresh.isExperimental()).toBe(false);
		// ...while the suites' own setup (test/setup/experimental-on.ts) has this copy on.
		expect(isExperimental()).toBe(true);
	});

	test('setExperimental / isExperimental round-trip', () => {
		setExperimental(false);
		expect(isExperimental()).toBe(false);
		setExperimental(true);
		expect(isExperimental()).toBe(true);
	});

	test('data.json counts only a literal `true` — a string, a number or a typo never turns it on', () => {
		expect(readExperimentalSetting({ experimental: true })).toBe(true);
		for (const v of ['true', 'yes', 1, {}, [], null, undefined, false]) {
			expect(readExperimentalSetting({ experimental: v })).toBe(false);
		}
		expect(readExperimentalSetting({})).toBe(false);
		expect(readExperimentalSetting(undefined)).toBe(false);
	});
});

describe('SC-406 — effective `hidden`', () => {
	test('a deferred def is hidden while the switch is off, and not when it is on', () => {
		setExperimental(false);
		expect(isDefinitionHidden({ deferred: true })).toBe(true);
		setExperimental(true);
		expect(isDefinitionHidden({ deferred: true })).toBe(false);
	});

	test('`hidden: true` (ds-hero\'s SC-190 flag) stays hidden either way; an ordinary def never is', () => {
		for (const on of [false, true]) {
			setExperimental(on);
			expect(isDefinitionHidden({ hidden: true })).toBe(true);
			expect(isDefinitionHidden({})).toBe(false);
		}
	});
});

describe('SC-406 — pref catalog', () => {
	test('off: `authoringControls` and `printPreview` are not described, nothing else is dropped', () => {
		setExperimental(false);
		const keys = activePrefDescriptors().map((d) => d.key as string);
		expect(keys).not.toContain('authoringControls');
		expect(keys).not.toContain('printPreview');
		const dropped = DSE_PREF_DESCRIPTORS.map((d) => d.key as string).filter((k) => !keys.includes(k));
		expect(dropped.sort()).toEqual([...EXPERIMENTAL_PREF_KEYS].sort());
		// The three text-scale prefs are NOT gated (SC-372 is fixed for 7.0.0 instead).
		expect(keys).toEqual(expect.arrayContaining(['textScale', 'cardScale', 'smallTextScale']));
		// Rolling on ability cards ships.
		expect(keys).toEqual(expect.arrayContaining(['rollingEnabled', 'rollerEngine', 'rollClickToRoll']));
	});

	test('on: the whole catalog', () => {
		setExperimental(true);
		expect(activePrefDescriptors()).toBe(DSE_PREF_DESCRIPTORS);
	});
});

describe('SC-406 — data.json round-trip', () => {
	test('`experimental` is not in DEFAULT_SETTINGS (no migration, no UI default)', () => {
		expect(Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, 'experimental')).toBe(false);
	});

	test('migrateSettings carries a present key through untouched, and never adds an absent one', () => {
		expect(migrateSettings({ experimental: true, viewAdoption: false }).experimental).toBe(true);
		expect(Object.prototype.hasOwnProperty.call(migrateSettings({}), 'experimental')).toBe(false);
		expect(Object.prototype.hasOwnProperty.call(migrateSettings(undefined), 'experimental')).toBe(false);
	});
});
