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

test('defaults match the v2 site\'s own SB_DEFAULTS (site-parity bar)', () => {
	const store = makeStore();
	expect(store.get('theme')).toBe('steel');
	expect(store.get('reduceMotion')).toBe(false);
	expect(store.get('printPreview')).toBe('off');
	expect(store.get('portraits')).toBe('on');
	expect(store.get('sbFeatureStyle')).toBe('card');       // statblock/view.ts static value
	expect(store.get('sbDensity')).toBe('comfortable');     // statblock/view.ts static value
	expect(store.get('sbColumns')).toBe('single');
	expect(store.get('sbStats')).toBe('grid');
	// SC-123 + Scott's 2026-08-12 ruling. The bar used to be "reproduce TODAY'S plugin
	// rendering", which held charline/villain away from the site for byte-freeze reasons.
	// It is now plain site parity: every value below is the site's own SB_DEFAULTS
	// (settings-panel.js:31-33, 35-39), no exceptions left.
	expect(store.get('kwUsage')).toBe('crest');        // the SC-121 chip band
	expect(store.get('distTarget')).toBe('grid');      // the SC-117/121 boxed rail
	expect(store.get('sbCharLine')).toBe('two');       // value over label, like the site
	expect(store.get('sbCharBox')).toBe('off');        // …with no boxed letter (site too)
	expect(store.get('sbVillain')).toBe('banded');     // the collapsible Villain Actions band
	// SC-160: the site ships both sticky toggles ON (settings-panel.js's
	// `sb.augSticky !== false` default and SB_DEFAULTS.stickymeta = 'on').
	expect(store.get('sbSticky')).toBe('on');
	expect(store.get('sbStickyMeta')).toBe('on');
	expect(store.get('fbFeatureStyle')).toBe('card');
	expect(store.get('fbStats')).toBe('grid');         // was a hard-coded literal on the card
	expect(store.get('collapsibleDefault')).toBe(true);     // old ComponentWrapper ?? true
	expect(store.get('collapseDefault')).toBe(false);       // old ComponentWrapper ?? false
	expect(store.get('staminaRecoveryPopover')).toBe(false); // SC-132: Model M direct-set is the shipped interaction
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
	// I1: the three chained tails carry a nested var(--font-text) fallback so an
	// inline override survives on Legacy roots where the parent slot token is
	// IACVT-dead (fontStacks.ts has the full story + its own regression gate).
	['fontTitle', '--dse-font-title', 'var(--font-text)', false],
	['fontBody', '--dse-font-body', 'var(--font-text)', false],
	['fontControls', '--dse-font-controls', 'var(--dse-font-body, var(--font-text))', false],
	['fontCardBody', '--dse-font-card-body', 'var(--dse-font-body, var(--font-text))', true],
	['fontLabel', '--dse-font-label', 'var(--dse-font-title, var(--font-text))', true],
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
		expect(ui.help).toContain('applies everywhere, including print and export');
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
		// SC-123 — the site's own attribute names, minus its `sb-` prefix where the
		// plugin's reach is wider than the site's (kwusage/disttarget restyle EVERY
		// ability card here, not just a statblock's).
		kwUsage: 'kwusage',
		distTarget: 'disttarget',
		sbCharLine: 'sb-charline',
		sbCharBox: 'sb-charbox',
		sbVillain: 'sb-villain',
		// SC-160 — the site's own two, `sb-`-prefixed like every other statblock-scoped
		// attr here (the site spells them `body[data-aug-sticky]` / `data-sb-stickymeta`;
		// the plugin has no body-level augmentation channel, both reflect per element root).
		sbSticky: 'sb-sticky',
		sbStickyMeta: 'sb-stickymeta',
		fbFeatureStyle: 'fb-featstyle',
		fbStats: 'fb-stats',
		// SC-132: behavioral (the view reads cx.prefs.get) — no attr, like the two
		// collapse defaults above it.
		staminaRecoveryPopover: null,
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
	// SC-146 fix 4 flipped Sourcebook's Feature style to Flat and SC-123 widened the
	// bundle to nine members, so reaching Sourcebook now takes its whole member set
	// (before either change, `sbStats: ledger` alone was the only difference).
	await store.set('sbStats', 'ledger');
	expect(deriveSbPreset(store)).toBe('custom');
	await store.set('sbFeatureStyle', 'flat');
	expect(deriveSbPreset(store)).toBe('custom'); // still only 2 of the 9
	await applySbPreset(store, 'sourcebook');
	expect(deriveSbPreset(store)).toBe('sourcebook');
	await store.set('sbDensity', 'compact');
	expect(deriveSbPreset(store)).toBe('custom');
	await applySbPreset(store, 'index');
	expect(deriveSbPreset(store)).toBe('index');
	expect(store.get('sbFeatureStyle')).toBe('flat');
	// SC-146 fix 5: the site pins multi-column `wide` OFF in every preset — it
	// is a standalone toggle, never a preset member (settings-panel.js:711).
	expect(store.get('sbColumns')).toBe('single');
	// SC-146 FIX ROUND 1, I2: the site's Index bundle sets `meta: gridc`
	// (audit §4a), which fix round 1 restored — the pre-fix-round commit
	// left this at 'grid'.
	expect(store.get('sbStats')).toBe('gridc');
	await applySbPreset(store, 'steel');
	expect(deriveSbPreset(store)).toBe('steel');
	expect(SB_PRESETS.steel.sbDensity).toBe('comfortable');
});

// —— SC-123: the widened bundles ——

// Scott's 2026-08-12 ruling flipped sbCharLine/sbVillain to the site's values, which made
// the `steel` bundle and the descriptor defaults identical. That equality is now an
// INVARIANT, not a coincidence, and it is the kind that breaks silently: the preset label
// is derived rather than stored, so if a future edit moves a default without moving the
// bundle (or the reverse), a fresh install opens its dropdown reading "Custom" — a state
// nobody chose — and nothing else fails. Pinned in both directions.
test('the steel bundle IS the descriptor defaults, member for member (a fresh install derives "Steel card")', () => {
	const defaults = new Map(
		DSE_PREF_DESCRIPTORS.filter((d) => prefUi(d)?.inPreset).map((d) => [d.key as string, d.default]),
	);
	// Same key set, so neither side can carry a member the other lacks.
	expect(new Set(Object.keys(SB_PRESETS.steel))).toEqual(new Set(defaults.keys()));
	// …and the same value for every one of them.
	for (const [key, value] of defaults) {
		expect(SB_PRESETS.steel[key as keyof typeof SB_PRESETS.steel]).toBe(value);
	}
	// The consequence, asserted directly rather than inferred: an untouched store derives
	// the named preset, never 'custom'.
	expect(deriveSbPreset(makeStore())).toBe('steel');
});


test('every preset writes the SAME member set, and that set is exactly the inPreset rows', async () => {
	const members = new Set(
		DSE_PREF_DESCRIPTORS.filter((d) => prefUi(d)?.inPreset).map((d) => d.key as string),
	);
	for (const bundle of Object.values(SB_PRESETS)) {
		expect(new Set(Object.keys(bundle))).toEqual(members);
	}
	// Nine members now: the D4 four plus SC-123's five statblock rows. The two
	// featureblock rows are NOT members — the site's bundles have no fb member either.
	expect(members.size).toBe(9);
	expect(members.has('fbFeatureStyle')).toBe(false);
	expect(members.has('fbStats')).toBe(false);
	// SC-160: nor are the two sticky toggles, for the site's own reason — "preset bundles
	// never touch stickymeta / augs" (settings-panel.js:711). Picking "Sourcebook" must not
	// silently turn a scroll behaviour on or off.
	expect(members.has('sbSticky')).toBe(false);
	expect(members.has('sbStickyMeta')).toBe(false);
});

test('the `steel` bundle IS the default state — a fresh install derives "Steel card", never "Custom"', () => {
	const byKey = new Map(DSE_PREF_DESCRIPTORS.map((d) => [d.key as string, d]));
	for (const [key, value] of Object.entries(SB_PRESETS.steel)) {
		expect(byKey.get(key)!.default).toBe(value);
	}
});

test('the non-default bundles carry the SITE\'s values for every new member (settings-panel.js:35-39)', () => {
	// Sourcebook — the book look: comma-joined keywords, an inline distance/target line,
	// a boxed characteristic letter, no villain band.
	expect(SB_PRESETS.sourcebook.kwUsage).toBe('text');
	expect(SB_PRESETS.sourcebook.distTarget).toBe('text');
	expect(SB_PRESETS.sourcebook.sbCharLine).toBe('one');
	expect(SB_PRESETS.sourcebook.sbCharBox).toBe('on');
	expect(SB_PRESETS.sourcebook.sbVillain).toBe('inline');
	// Index card — everything in framed cells, value over label, villain actions banded.
	expect(SB_PRESETS.index.kwUsage).toBe('grid');
	expect(SB_PRESETS.index.distTarget).toBe('grid');
	expect(SB_PRESETS.index.sbCharLine).toBe('two');
	expect(SB_PRESETS.index.sbCharBox).toBe('onword');
	expect(SB_PRESETS.index.sbVillain).toBe('banded');
});

test('SC-123 rows: statblock additions are SECONDARY (Scott\'s 3-primary-plus-advanced balance); the featureblock pair is its own section', () => {
	const byKey = new Map(DSE_PREF_DESCRIPTORS.map((d) => [d.key as string, d]));
	for (const key of ['kwUsage', 'distTarget', 'sbCharLine', 'sbCharBox', 'sbVillain']) {
		const ui = prefUi(byKey.get(key)!)!;
		expect(ui.group).toBe('Statblock display');
		expect(ui.advanced).toBe(true);
		expect(ui.control).toBe('select');
	}
	// The four pre-existing statblock rows stay on the primary page.
	for (const key of ['sbFeatureStyle', 'sbDensity', 'sbColumns', 'sbStats']) {
		expect(prefUi(byKey.get(key)!)!.advanced ?? false).toBe(false);
	}
	for (const key of ['fbFeatureStyle', 'fbStats']) {
		const ui = prefUi(byKey.get(key)!)!;
		expect(ui.group).toBe('Featureblock display');
		expect(ui.advanced ?? false).toBe(false);
	}
	expect(GROUP_ORDER.indexOf('Featureblock display')).toBe(
		GROUP_ORDER.indexOf('Statblock display') + 1,
	);
});

// —— SC-160: the sticky mini-header pair + the `dependsOn` affordance it introduced ——

test('SC-160 sticky rows: primary toggles at the END of Statblock display, per-block overridable', () => {
	const byKey = new Map(DSE_PREF_DESCRIPTORS.map((d) => [d.key as string, d]));
	for (const key of ['sbSticky', 'sbStickyMeta']) {
		const descriptor = byKey.get(key)!;
		const ui = prefUi(descriptor)!;
		expect(ui.group).toBe('Statblock display');
		expect(ui.control).toBe('toggle');
		// PRIMARY, not Advanced: the feature ships ON, so the row a reader goes looking
		// for is the one that turns it off — and the sub-toggle has to sit directly under
		// its parent, which it cannot do across the primary/Advanced page split.
		expect(ui.advanced ?? false).toBe(false);
		expect(ui.inPreset ?? false).toBe(false);
		// Unlike the conditional-DOM trio, both are pure CSS reflows over DOM the view
		// always builds — so `prefs:` per block works and must stay allowed.
		expect(descriptor.perBlock ?? true).toBe(true);
	}
	// Last in the group, after the four curated layout knobs and SC-123's five.
	const statblockKeys = DSE_PREF_DESCRIPTORS.filter(
		(d) => prefUi(d)?.group === 'Statblock display',
	).map((d) => d.key as string);
	expect(statblockKeys.slice(-2)).toEqual(['sbSticky', 'sbStickyMeta']);
});

test('SC-160 dependsOn: the sub-toggle names its parent, and the parent is an EARLIER row in the same group', () => {
	const byKey = new Map(DSE_PREF_DESCRIPTORS.map((d) => [d.key as string, d]));
	expect(prefUi(byKey.get('sbSticky')!)!.dependsOn).toBeUndefined();
	expect(prefUi(byKey.get('sbStickyMeta')!)!.dependsOn).toBe('sbSticky');

	// The affordance's structural contract, asserted for EVERY dependent row rather than
	// just this one: the settings tab renders descriptors in registration order and does
	// no sorting, so a parent declared later would render a sub-toggle above the thing it
	// is indented under. A parent on a different page (or behind Advanced while the child
	// is not) would break the indent's meaning entirely.
	const order = DSE_PREF_DESCRIPTORS.map((d) => d.key as string);
	for (const descriptor of DSE_PREF_DESCRIPTORS) {
		const ui = prefUi(descriptor);
		const parentKey = ui?.dependsOn;
		if (!parentKey) continue;
		const parent = byKey.get(parentKey as string);
		expect(parent).toBeDefined();
		const parentUi = prefUi(parent!)!;
		expect(parentUi.group).toBe(ui!.group);
		expect(parentUi.advanced ?? false).toBe(ui!.advanced ?? false);
		expect(order.indexOf(parentKey as string)).toBeLessThan(order.indexOf(descriptor.key as string));
		// Only a toggle-shaped parent has an on/off state to depend ON.
		expect(parentUi.control).toBe('toggle');
	}
});
