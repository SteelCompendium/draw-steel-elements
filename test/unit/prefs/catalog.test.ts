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
	// SC-112: all six font slots default to the '' sentinel — toCss('') is null,
	// so reflect() stamps NO inline override (the theme-block chains govern; the
	// visual-freeze bar depends on this inertness).
	expect(store.get('fontTitle')).toBe('');
	expect(store.get('fontBody')).toBe('');
	expect(store.get('fontControls')).toBe('');
	expect(store.get('fontCardBody')).toBe('');
	expect(store.get('fontLabel')).toBe('');
	expect(store.get('fontMono')).toBe('');
	// SC-112 Task 7: both size scales default to the inert 1 (toCss(1) is null →
	// no inline custom property; the :root token default of 1 governs).
	expect(store.get('textScale')).toBe(1);
	expect(store.get('cardScale')).toBe(1);
});

// —— SC-112 (Plan 23 Task 6): the six css-bearing font-slot descriptors ——

const FONT_SLOT_CASES = [
	// [key, varName, fallback tail, advanced?]
	['fontTitle', '--dse-font-title', 'var(--font-text)', false],
	['fontBody', '--dse-font-body', 'var(--font-text)', false],
	['fontControls', '--dse-font-controls', 'var(--dse-font-body)', false],
	['fontCardBody', '--dse-font-card-body', 'var(--dse-font-body)', true],
	['fontLabel', '--dse-font-label', 'var(--dse-font-title)', true],
	['fontMono', '--dse-font-mono', 'var(--font-monospace)', true],
] as const;

test('font slots: css-bearing (right varName), attr-less, sentinel default → null, slot-correct fallback tail', () => {
	const byKey = new Map(DSE_PREF_DESCRIPTORS.map((d) => [d.key as string, d]));
	for (const [key, varName, tail] of FONT_SLOT_CASES) {
		const descriptor = byKey.get(key)!;
		expect(descriptor).toBeDefined();
		expect(descriptor.default).toBe('');            // primitive — persist()'s sparse check holds
		expect(descriptor.attr).toBeUndefined();        // never data-dse-* reflected; global-only
		expect(descriptor.css!.varName).toBe(varName);
		expect(descriptor.css!.toCss('' as never)).toBeNull(); // default = remove-the-override
		expect(descriptor.css!.toCss('Georgia' as never)).toBe(`"Georgia", ${tail}`);
	}
});

test('font slots: Typography rows with the font control, the uniform default option FIRST, advanced flags on the three secondary slots', () => {
	const byKey = new Map(DSE_PREF_DESCRIPTORS.map((d) => [d.key as string, d]));
	for (const [key, , , advanced] of FONT_SLOT_CASES) {
		const ui = prefUi(byKey.get(key)!)!;
		expect(ui.group).toBe('Typography');
		expect(ui.control).toBe('font');
		// Scott's 2026-08-02 ruling: every dropdown's first/default option is
		// uniformly '' / "Default (Obsidian vault fonts)".
		expect(ui.options![0]).toEqual({ value: '', label: 'Default (Obsidian vault fonts)' });
		expect(ui.advanced ?? false).toBe(advanced);
		// SHIP verdict (Task 5): the help names the cross-theme reach explicitly.
		expect(ui.help).toContain('applies under both the Steel and Legacy themes');
	}
	// Mono gets the mono curated list; the five text slots share the text list.
	expect(prefUi(byKey.get('fontMono')!)!.options!.some((o) => o.value === 'JetBrains Mono')).toBe(true);
	expect(prefUi(byKey.get('fontTitle')!)!.options!.some((o) => o.value === 'Source Serif 4')).toBe(true);
});

// —— SC-112 (Plan 23 Task 7): the two css-bearing size-scale descriptors ——

const SCALE_CASES = [
	// [key, varName, min, max, an out-of-range sample and its clamp]
	['textScale', '--dse-text-scale', 0.6, 1.4, 2, 1.4],
	['cardScale', '--dse-card-scale', 0.8, 1.2, 0.5, 0.8],
] as const;

test('size scales: css-bearing (right varName), attr-less, snapped default 1 → null (remove-at-default)', () => {
	const byKey = new Map(DSE_PREF_DESCRIPTORS.map((d) => [d.key as string, d]));
	for (const [key, varName, , , outOfRange, clamped] of SCALE_CASES) {
		const descriptor = byKey.get(key)!;
		expect(descriptor).toBeDefined();
		expect(descriptor.default).toBe(1);             // primitive — persist()'s sparse check holds
		expect(descriptor.attr).toBeUndefined();        // never data-dse-* reflected; global-only
		expect(descriptor.css!.varName).toBe(varName);
		expect(descriptor.css!.toCss(1 as never)).toBeNull();      // default = remove-the-override
		expect(descriptor.css!.toCss(1.1 as never)).toBe('1.1');
		// toCss SNAPS before emitting: out-of-range clamps, off-step rounds,
		// junk falls back to the default (null — i.e. remove).
		expect(descriptor.css!.toCss(outOfRange as never)).toBe(String(clamped));
		expect(descriptor.css!.toCss(1.001 as never)).toBeNull();  // snaps back to 1
		expect(descriptor.css!.toCss(NaN as never)).toBeNull();    // default → remove
	}
});

test('size scales: Typography slider rows carrying the site ranges on the ui shape', () => {
	const byKey = new Map(DSE_PREF_DESCRIPTORS.map((d) => [d.key as string, d]));
	for (const [key, , min, max] of SCALE_CASES) {
		const ui = prefUi(byKey.get(key)!)!;
		expect(ui.group).toBe('Typography');
		expect(ui.control).toBe('slider');
		// Task 8 renders straight from these — no per-key knowledge needed.
		expect(ui.min).toBe(min);
		expect(ui.max).toBe(max);
		expect(ui.step).toBe(0.05);
		// The consumer rules are print-excluded; the help says so.
		expect(ui.help).toContain('print and export always use 100%');
	}
	expect(prefUi(byKey.get('textScale')!)!.label).toBe('Text size');
	expect(prefUi(byKey.get('cardScale')!)!.label).toBe('Card size');
});

test('presentation attrs pin the BUILT data-dse-* vocabulary; behavioral prefs have none', () => {
	const attrs = Object.fromEntries(
		DSE_PREF_DESCRIPTORS.map((d) => [d.key as string, d.attr ?? null]),
	);
	expect(attrs).toEqual({
		reduceMotion: 'reduce-motion',
		printPreview: 'print',        // theme-print.test.ts pins [data-dse-print="on"]
		portraits: 'portraits',       // initiative CSS pins [data-dse-portraits="off"]
		// SC-112 font slots: css-bearing, never attr-reflected (global-only)
		fontTitle: null,
		fontBody: null,
		fontControls: null,
		fontCardBody: null,
		fontLabel: null,
		fontMono: null,
		// SC-112 Task 7 size scales: css-bearing, never attr-reflected (global-only)
		textScale: null,
		cardScale: null,
		sbFeatureStyle: 'sb-featstyle',
		sbDensity: 'density',         // BUILT name (spec draft said sb-density; built wins)
		sbColumns: 'sb-columns',
		sbStats: 'sb-stats',
		collapsibleDefault: null,
		collapseDefault: null,
		rollingEnabled: null,
		rollerEngine: null,
		rollClickToRoll: null,
		authoringControls: null,
	});
});

test('every descriptor carries a PrefUi in a known group; no hidden rows remain (F2 fix wave removed the dead webLinkFallback scaffolding — sccWebFallback is the real, operational setting)', () => {
	for (const d of DSE_PREF_DESCRIPTORS) {
		const ui = prefUi(d);
		expect(ui).toBeDefined();
		expect(GROUP_ORDER).toContain(ui!.group);
		expect(ui!.hidden).toBeFalsy();
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
