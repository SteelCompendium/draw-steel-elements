// Plan 13 Task 2 (D4 §2) — the preference catalog: defaults REPRODUCE TODAY'S
// LOOK (the compatibility bar), the attr vocabulary matches what D2 built, and
// consumer-gated rows are hidden. Pure unit tests — no DOM.
import {
	DSE_PREF_DESCRIPTORS, SB_PRESETS, deriveSbPreset, applySbPreset, prefUi, GROUP_ORDER,
} from '../../../src/prefs/catalog';
import { createPreferenceStore, BUILTIN_DESCRIPTORS } from '../../../src/framework/seams/prefs';
import type { PreferenceStore, PrefsStorage } from '../../../src/framework/seams/prefs';

function makeStore(): PreferenceStore {
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const store = createPreferenceStore(storage);
	store.describe(DSE_PREF_DESCRIPTORS);
	return store;
}

test('every catalog key is unique and none shadows a builtin', () => {
	const keys = [...BUILTIN_DESCRIPTORS, ...DSE_PREF_DESCRIPTORS].map((d) => d.key as string);
	expect(new Set(keys).size).toBe(keys.length);
});

test('defaults reproduce today\'s look (the legacy-fidelity bar)', () => {
	const store = makeStore();
	expect(store.get('theme')).toBe('steel');
	expect(store.get('reduceMotion')).toBe(false);
	expect(store.get('printPreview')).toBe('off');
	expect(store.get('portraits')).toBe('on');
	expect(store.get('sbFeatureStyle')).toBe('card');       // statblock/view.ts static value
	expect(store.get('sbDensity')).toBe('comfortable');     // statblock/view.ts static value
	expect(store.get('sbColumns')).toBe('single');
	expect(store.get('sbStats')).toBe('grid');
	expect(store.get('collapsibleDefault')).toBe(true);     // old ComponentWrapper ?? true
	expect(store.get('collapseDefault')).toBe(false);       // old ComponentWrapper ?? false
	expect(store.get('rollingEnabled')).toBe(false);        // D5 master switch — OFF is the fidelity bar
	expect(store.get('rollClickToRoll')).toBe(true);        // OD-5: gated by rollingEnabled, shipped default kept
});

test('presentation attrs pin the BUILT data-dse-* vocabulary; behavioral prefs have none', () => {
	const attrs = Object.fromEntries(
		DSE_PREF_DESCRIPTORS.map((d) => [d.key as string, d.attr ?? null]),
	);
	expect(attrs).toEqual({
		reduceMotion: 'reduce-motion',
		printPreview: 'print',        // theme-print.test.ts pins [data-dse-print="on"]
		portraits: 'portraits',       // initiative CSS pins [data-dse-portraits="off"]
		sbFeatureStyle: 'sb-featstyle',
		sbDensity: 'density',         // BUILT name (spec draft said sb-density; built wins)
		sbColumns: 'sb-columns',
		sbStats: 'sb-stats',
		collapsibleDefault: null,
		collapseDefault: null,
		rollingEnabled: null,
		rollerEngine: null,
		rollClickToRoll: null,
		webLinkFallback: null,
	});
});

test('every descriptor carries a PrefUi in a known group; unshipped-consumer rows are hidden', () => {
	for (const d of DSE_PREF_DESCRIPTORS) {
		const ui = prefUi(d);
		expect(ui).toBeDefined();
		expect(GROUP_ORDER).toContain(ui!.group);
	}
	// The Rolling rows all went live with the D5 feature integration (Plan 14
	// Task 4); webLinkFallback stays hidden until F2 ships.
	for (const key of ['webLinkFallback']) {
		const d = DSE_PREF_DESCRIPTORS.find((x) => (x.key as string) === key)!;
		expect(prefUi(d)!.hidden).toBe(true);
	}
});

test('preset derivation: defaults = steel; one divergence = custom; applySbPreset round-trips', async () => {
	const store = makeStore();
	expect(deriveSbPreset(store)).toBe('steel');
	await store.set('sbStats', 'ledger');
	expect(deriveSbPreset(store)).toBe('sourcebook');
	await store.set('sbDensity', 'compact');
	expect(deriveSbPreset(store)).toBe('custom');
	await applySbPreset(store, 'index');
	expect(deriveSbPreset(store)).toBe('index');
	expect(store.get('sbFeatureStyle')).toBe('flat');
	expect(store.get('sbColumns')).toBe('wide');
	await applySbPreset(store, 'steel');
	expect(deriveSbPreset(store)).toBe('steel');
	expect(SB_PRESETS.steel.sbDensity).toBe('comfortable');
});
