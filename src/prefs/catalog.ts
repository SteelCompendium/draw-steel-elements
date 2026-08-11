// src/prefs/catalog.ts — D4 §2: THE Draw Steel Elements preference catalog.
//
// One module owns: the DsePrefs augmentation (F1 §3.6 reserves it for D4), the
// PrefDescriptor list registered into every PreferenceStore, the finalized `ui`
// shape (PrefUi — F1 left it `unknown`), and the statblock preset bundles (§3.2).
// Adding a pref = adding a descriptor here; the settings tab renders from it.
//
// RECONCILIATION (spec → built, Plan 13): attr names/values follow what D2 BUILT,
// not the spec draft — `density`/`comfortable|compact` (statblock/view.ts shipped
// them statically; Task 3 moves them onto reflection), `sb-featstyle`/`card|flat`,
// `portraits`/`on|off` (initiative CSS), `print`/`on|off` (the print-preview twin,
// pinned by theme-print.test.ts — the reason these two stay 'on'|'off' strings
// instead of value-mode booleans, OD-D4-5). Defaults REPRODUCE TODAY'S LOOK —
// that is the compatibility bar, guarded by catalog.test.ts.
//
// theme is NOT here: it is the builtin descriptor in seams/prefs.ts (attr-omitted
// — ThemeService.apply is the single writer of data-dse-theme; D3 §7.1).
//
// Invariant: every default below MUST be a primitive (boolean/string/number),
// never an object/array — DsePreferenceStore.persist() sparse-checks via strict
// equality (`value === descriptor.default`), which is only correct for primitives.
import type { PreferenceStore, PrefDescriptor, DsePrefs } from '../framework/seams/prefs';
import { declaredCollapsePrefs } from '@model/ComponentWrapper';
import { CURATED_FONTS, DEFAULT_FONT_OPTION, fontCss } from './fontStacks';
import { CARD_SCALE, TEXT_SCALE, snap } from './scale';

declare module '../framework/seams/prefs' {
	interface DsePrefs {
		// —— Appearance (presentation) ——
		reduceMotion: boolean;
		printPreview: 'on' | 'off';
		portraits: 'on' | 'off';
		// —— Typography (SC-112 — css-reflected, no attr; '' is the "Default
		// (Obsidian vault fonts)" sentinel → toCss null → no inline override) ——
		fontTitle: string;
		fontBody: string;
		fontControls: string;
		fontCardBody: string;
		fontLabel: string;
		fontMono: string;
		// —— Typography size scales (SC-112 Task 7 — css-reflected multipliers;
		// snap()-normalized, 1 is the inert default → toCss null → no inline var) ——
		textScale: number;
		cardScale: number;
		// —— Statblock display (presentation; OD-D4-6 curated four) ——
		sbFeatureStyle: 'card' | 'flat';
		sbDensity: 'comfortable' | 'compact';
		sbColumns: 'single' | 'wide';
		sbStats: 'grid' | 'gridc' | 'ledger';
		// —— SC-123 second wave: the site's remaining layout/structure settings.
		// kwUsage/distTarget restyle the SHARED ability-card meta bands
		// (renderFeature.ts's .dse-feature__meta-chips / -rail), so they reach every
		// card — statblock, featureblock and standalone — where the site's
		// data-sb-kwusage/-disttarget only reach its statblock feature block.
		// sbCharLine/sbCharBox/sbVillain are statblock-only, like the site's.
		//
		// TWO DEFAULTS DIVERGE FROM THE SITE'S BY DESIGN: the site ships charline=two
		// and villain=banded, and the plugin defaults to the single merged "Might +2"
		// line and un-banded villain actions instead. That was chosen to hold the then-
		// frozen legacy shots byte-identical; SC-144 retired those shots, so the reason
		// is now history and "should the site-faithful shape be the default?" is a live
		// design question — its own ticket, deliberately not answered by SC-144. Everything else matches the site's own
		// SB_DEFAULTS verbatim, INCLUDING disttarget=grid (settings-panel.js:31-33;
		// an earlier revision of this comment, and the SC-146 audit row S8 it came
		// from, misread that default as `text` — corrected in the SC-123 fix round,
		// review M-4). See the SB_PRESETS comment for what the two cost the
		// "Steel card" bundle.
		kwUsage: 'crest' | 'text' | 'grid' | 'ledger';
		distTarget: 'grid' | 'text' | 'ledger';
		sbCharLine: 'one' | 'two';
		sbCharBox: 'off' | 'on' | 'onword';
		sbVillain: 'inline' | 'banded';
		// —— Featureblock display (SC-123 — the site's data-fb-featstyle / data-fb-stats) ——
		fbFeatureStyle: 'card' | 'flat';
		fbStats: 'grid' | 'ledger';
		// —— Element defaults (behavioral — no attr; views read cx.prefs.get) ——
		collapsibleDefault: boolean;
		collapseDefault: boolean;
		staminaRecoveryPopover: boolean;
		// —— Rolling (behavioral; D5) ——
		rollingEnabled: boolean;
		rollerEngine: 'native' | 'dice-roller';
		rollClickToRoll: boolean;
		// —— Authoring (behavioral; D9 — gates the reading-mode form pencil) ——
		authoringControls: boolean;
	}
}

export type PrefGroup =
	| 'Appearance'
	| 'Typography'
	| 'Statblock display'
	| 'Featureblock display'
	| 'Element defaults'
	| 'Rolling'
	| 'Authoring';

/** Section order in the settings tab. */
export const GROUP_ORDER: readonly PrefGroup[] = [
	'Appearance',
	'Typography',
	'Statblock display',
	'Featureblock display',
	'Element defaults',
	'Rolling',
	'Authoring',
];

/** D4 §4.1 — the finalized shape of PrefDescriptor.ui (F1 typed it `unknown`). */
export interface PrefUi {
	group: PrefGroup;
	label: string;
	help?: string;
	/** 'toggle' over a string-typed pref means the 'on'|'off' mapping (checked ⇔ 'on').
	 *  'font' (SC-112) is the curated-list-plus-custom-entry font picker; 'slider'
	 *  (SC-112 Task 7) is the numeric range slider over min/max/step below — both
	 *  rendered by SettingsTab.renderRow (Task 8). */
	control: 'toggle' | 'select' | 'text' | 'font' | 'slider';
	options?: readonly { value: string; label: string }[];
	/** 'slider' only (SC-112 Task 7): the range Task 8 renders. Mirrors the
	 *  descriptor's snap() range (src/prefs/scale.ts) — kept on the ui shape so
	 *  the settings tab needs no per-key knowledge. */
	min?: number;
	max?: number;
	step?: number;
	/** Statblock preset-bundle member (§3.2). */
	inPreset?: boolean;
	/** Row not rendered (consumer not shipped: D5 rolling, F2 references). */
	hidden?: boolean;
	/** SC-112: secondary row — Task 8 renders these behind an "Advanced" disclosure. */
	advanced?: boolean;
}

/** Typed accessor for the `unknown`-typed ui at the F1 seam. */
export function prefUi(descriptor: PrefDescriptor): PrefUi | undefined {
	return descriptor.ui as PrefUi | undefined;
}

/** Correlates key/default per entry (PrefDescriptor's K) while building a plain array. */
function d<K extends keyof DsePrefs>(
	descriptor: PrefDescriptor<K> & { ui: PrefUi },
): PrefDescriptor {
	return descriptor;
}

// —— SC-112 Typography dropdown choices: the uniform "Default (Obsidian vault
// fonts)" sentinel first (Scott's 2026-08-02 ruling), then the curated list.
// Values are BARE family names ('' = sentinel); fontCss builds the stack. ——
const TEXT_FONT_OPTIONS = [DEFAULT_FONT_OPTION, ...CURATED_FONTS.text] as const;
const MONO_FONT_OPTIONS = [DEFAULT_FONT_OPTION, ...CURATED_FONTS.mono] as const;

export const DSE_PREF_DESCRIPTORS: readonly PrefDescriptor[] = [
	// —— Appearance ——
	d({
		key: 'reduceMotion', default: false, attr: 'reduce-motion',
		ui: {
			group: 'Appearance', label: 'Reduce motion', control: 'toggle',
			help: 'Disable transitions and animations inside Draw Steel elements. The system reduced-motion preference is honored regardless.',
		},
	}),
	d({
		key: 'printPreview', default: 'off', attr: 'print',
		ui: {
			group: 'Appearance', label: 'Print preview', control: 'toggle',
			help: 'Show every element in its print/export layout on screen.',
		},
	}),
	d({
		key: 'portraits', default: 'on', attr: 'portraits',
		ui: {
			group: 'Appearance', label: 'Initiative portraits', control: 'toggle',
			help: 'Show creature portraits in the initiative tracker.',
		},
	}),

	// —— Typography (SC-112 — css-bearing: no attr, reflected as an inline
	// --dse-font-<slot> custom property per element root; '' → toCss null →
	// removeProperty, so DEFAULTS ARE INERT (the freeze bar). Global-only:
	// per-block `prefs:` rejects attr-less keys (prefOverrides.ts). ——
	d({
		key: 'fontTitle', default: '',
		css: { varName: '--dse-font-title', toCss: (v) => (v === '' ? null : fontCss('title', v)) },
		ui: {
			group: 'Typography', label: 'Title font', control: 'font', options: TEXT_FONT_OPTIONS,
			help: 'Font for titles and headings in Draw Steel elements. "Default (Obsidian vault fonts)" keeps today\'s look: your vault text font (the Steel theme layers its bundled serif on top). A chosen font applies everywhere, including print and export.',
		},
	}),
	d({
		key: 'fontBody', default: '',
		css: { varName: '--dse-font-body', toCss: (v) => (v === '' ? null : fontCss('body', v)) },
		ui: {
			group: 'Typography', label: 'Body font', control: 'font', options: TEXT_FONT_OPTIONS,
			help: 'Font for body text in Draw Steel elements. "Default (Obsidian vault fonts)" keeps today\'s look: your vault text font (the Steel theme layers its bundled serif on top). A chosen font applies everywhere, including print and export.',
		},
	}),
	d({
		key: 'fontControls', default: '',
		css: { varName: '--dse-font-controls', toCss: (v) => (v === '' ? null : fontCss('controls', v)) },
		ui: {
			group: 'Typography', label: 'Controls font', control: 'font', options: TEXT_FONT_OPTIONS,
			help: 'Font for interactive controls (buttons, steppers, inputs) in Draw Steel elements. "Default (Obsidian vault fonts)" keeps today\'s look: same as the Body font. A chosen font applies everywhere, including print and export.',
		},
	}),
	d({
		key: 'fontCardBody', default: '',
		css: { varName: '--dse-font-card-body', toCss: (v) => (v === '' ? null : fontCss('cardBody', v)) },
		ui: {
			group: 'Typography', label: 'Card body font', control: 'font', options: TEXT_FONT_OPTIONS, advanced: true,
			help: 'Font for text inside ability and feature cards. "Default (Obsidian vault fonts)" keeps today\'s look: same as the Body font. A chosen font applies everywhere, including print and export.',
		},
	}),
	d({
		key: 'fontLabel', default: '',
		css: { varName: '--dse-font-label', toCss: (v) => (v === '' ? null : fontCss('label', v)) },
		ui: {
			group: 'Typography', label: 'Label font', control: 'font', options: TEXT_FONT_OPTIONS, advanced: true,
			help: 'Font for small labels, captions, and chips in Draw Steel elements. "Default (Obsidian vault fonts)" keeps today\'s look: same as the Title font. A chosen font applies everywhere, including print and export.',
		},
	}),
	d({
		key: 'fontMono', default: '',
		css: { varName: '--dse-font-mono', toCss: (v) => (v === '' ? null : fontCss('mono', v)) },
		ui: {
			group: 'Typography', label: 'Monospace font', control: 'font', options: MONO_FONT_OPTIONS, advanced: true,
			help: 'Font for monospaced text in Draw Steel elements. "Default (Obsidian vault fonts)" keeps today\'s look: your vault monospace font. A chosen font applies everywhere, including print and export.',
		},
	}),

	// —— Typography size scales (SC-112 Task 7 — css-bearing like the font slots
	// above; snap() normalizes to the site's ranges/step, and the snapped default
	// 1 maps to toCss null → removeProperty (site remove-on-default semantics,
	// settings-panel.js:92-103) so DEFAULTS ARE INERT (the freeze bar). ——
	d({
		key: 'textScale', default: 1,
		css: {
			varName: '--dse-text-scale',
			toCss: (v) => { const n = snap(v, TEXT_SCALE); return n === TEXT_SCALE.default ? null : String(n); },
		},
		ui: {
			group: 'Typography', label: 'Text size', control: 'slider',
			min: TEXT_SCALE.min, max: TEXT_SCALE.max, step: TEXT_SCALE.step,
			help: 'Scale the text inside Draw Steel elements (60%–140%). Applies to every Draw Steel element; print and export always use 100%.',
		},
	}),
	d({
		key: 'cardScale', default: 1,
		css: {
			varName: '--dse-card-scale',
			toCss: (v) => { const n = snap(v, CARD_SCALE); return n === CARD_SCALE.default ? null : String(n); },
		},
		ui: {
			group: 'Typography', label: 'Card size', control: 'slider',
			min: CARD_SCALE.min, max: CARD_SCALE.max, step: CARD_SCALE.step,
			help: 'Scale whole statblock and ability cards (80%–120%). Applies to every Draw Steel element; print and export always use 100%.',
		},
	}),

	// —— Statblock display (§3 — the priority group) ——
	d({
		key: 'sbFeatureStyle', default: 'card', attr: 'sb-featstyle',
		ui: {
			group: 'Statblock display', inPreset: true, label: 'Feature style', control: 'select',
			options: [{ value: 'card', label: 'Cards' }, { value: 'flat', label: 'Flat list' }],
		},
	}),
	d({
		key: 'sbDensity', default: 'comfortable', attr: 'density',
		ui: {
			group: 'Statblock display', inPreset: true, label: 'Density', control: 'select',
			options: [{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }],
		},
	}),
	d({
		key: 'sbColumns', default: 'single', attr: 'sb-columns',
		ui: {
			group: 'Statblock display', inPreset: true, label: 'Feature columns', control: 'select',
			options: [{ value: 'single', label: 'Single column' }, { value: 'wide', label: 'Side-by-side (wide)' }],
		},
	}),
	// SC-146 fix 1: re-pointed to the ACTUAL secondary stats block (Immunity /
	// Weakness / Movement / With Captain, .dse-sb__grid > .dse-sb__kv) — this
	// descriptor's CSS previously targeted .dse-sb__items/.dse-sb__item, the
	// PRIMARY Size/Speed/Stamina/Stability/Free Strike row, the exact inverse of
	// the site's data-sb-meta (audit sc146-audit-report.md §1). No primary-stats
	// layout setting is added — the site has none, and this pref follows it
	// (audit judgment call C1, Scott-approved: "yes, lose it").
	d({
		key: 'sbStats', default: 'grid', attr: 'sb-stats',
		ui: {
			group: 'Statblock display', inPreset: true, label: 'Secondary stats', control: 'select',
			options: [
				{ value: 'grid', label: 'Grid' },
				{ value: 'gridc', label: 'Grid (centered)' },
				{ value: 'ledger', label: 'Ledger' },
			],
		},
	}),

	// —— SC-123: the site's remaining statblock layout settings. All five are
	// SECONDARY rows (ui.advanced) — Scott's "3 primary + advanced" balance from
	// SC-112: the primary page keeps the preset plus the four curated knobs, and the
	// long tail lives one page deeper rather than flat. Each is still a preset member
	// (SB_PRESET_MEMBERS), so the bundles write them regardless of which page shows
	// them, and the section reset covers them (SettingsTab iterates members, not rows). ——
	d({
		key: 'kwUsage', default: 'crest', attr: 'kwusage',
		ui: {
			group: 'Statblock display', inPreset: true, advanced: true,
			label: 'Keyword display', control: 'select',
			options: [
				{ value: 'crest', label: 'Chips' },
				{ value: 'text', label: 'Inline text' },
				{ value: 'grid', label: 'Grid' },
				{ value: 'ledger', label: 'Ledger' },
			],
			help: 'Layout of the keyword + action-type band on ability cards. "Chips" — the default — keeps today\'s look: boxed keyword chips with the action type at the far right. Applies to every ability card (statblock, featureblock and standalone) under the Steel theme.',
		},
	}),
	d({
		key: 'distTarget', default: 'grid', attr: 'disttarget',
		ui: {
			group: 'Statblock display', inPreset: true, advanced: true,
			label: 'Distance + target', control: 'select',
			options: [
				{ value: 'grid', label: 'Grid' },
				{ value: 'text', label: 'Inline text' },
				{ value: 'ledger', label: 'Ledger' },
			],
			help: 'Layout of the Distance/Target rail on ability cards. "Grid" — the default — keeps today\'s two boxed cells. Applies to every ability card (statblock, featureblock and standalone) under the Steel theme.',
		},
	}),
	// —— The three CONDITIONAL-DOM keys (perBlock: false). statblock/view.ts reads them
	// at BUILD time — charsAreSplit() picks the merged "Might +2" text node vs the
	// three-part split, renderFeatures() picks inline vs one collapsible band — so they
	// are the only presentation prefs on this element that re-render instead of
	// reflowing. prefOverrides.ts runs after the mount and re-stamps the ATTRIBUTE only,
	// which would dress the global shape in local attributes (measured: "+2Might"), so
	// a per-block `prefs:` map warns and ignores them. Global-only, deliberately. ——
	d({
		key: 'sbCharLine', default: 'one', attr: 'sb-charline', perBlock: false,
		ui: {
			group: 'Statblock display', inPreset: true, advanced: true,
			label: 'Characteristics', control: 'select',
			options: [
				{ value: 'one', label: 'One line' },
				{ value: 'two', label: 'Value over label' },
			],
			help: 'How each characteristic reads in the Might/Agility/Reason/Intuition/Presence rail. "One line" — the default — keeps today\'s single "Might +2" line; "Value over label" stacks the number above the word, like the website.',
		},
	}),
	d({
		key: 'sbCharBox', default: 'off', attr: 'sb-charbox', perBlock: false,
		ui: {
			group: 'Statblock display', inPreset: true, advanced: true,
			label: 'Boxed first letter', control: 'select',
			options: [
				{ value: 'off', label: 'Off' },
				{ value: 'on', label: 'Letter only' },
				{ value: 'onword', label: 'Letter and word' },
			],
			help: 'Adds a small framed M / A / R / I / P box to each characteristic. "Letter only" drops the spelled-out word on one-line characteristics; "Letter and word" keeps both. With Characteristics set to "Value over label" the two settings render alike — the website behaves the same way.',
		},
	}),
	d({
		key: 'sbVillain', default: 'inline', attr: 'sb-villain', perBlock: false,
		ui: {
			group: 'Statblock display', inPreset: true, advanced: true,
			label: 'Villain actions', control: 'select',
			options: [
				{ value: 'inline', label: 'Inline with other features' },
				{ value: 'banded', label: 'Grouped in a collapsible band' },
			],
			help: 'Where a statblock\'s villain actions render. "Inline" — the default — lists them among the other features in source order. "Grouped" collects them into one collapsible "Villain Actions" band below the rest, like the website. Print and export always show the band open.',
		},
	}),

	// —— Featureblock display (SC-123 — the site's Featureblocks group,
	// settings-panel.js: data-fb-featstyle / data-fb-stats). Its own section rather
	// than more rows under Statblock display: these govern a different element, and
	// the site groups them separately too. ——
	d({
		key: 'fbFeatureStyle', default: 'card', attr: 'fb-featstyle',
		ui: {
			group: 'Featureblock display', label: 'Feature style', control: 'select',
			options: [{ value: 'card', label: 'Cards' }, { value: 'flat', label: 'Flat list' }],
			help: 'How a featureblock\'s options are presented. "Cards" — the default — frames each one; "Flat list" runs them as a dense frameless list, the same vocabulary the statblock\'s own Feature style offers.',
		},
	}),
	d({
		key: 'fbStats', default: 'grid', attr: 'fb-stats',
		ui: {
			group: 'Featureblock display', label: 'Stat line', control: 'select',
			options: [{ value: 'grid', label: 'Grid' }, { value: 'ledger', label: 'Ledger' }],
			help: 'Layout of a featureblock\'s loose stat header (Stamina / Size / EV …). "Grid" — the default — is today\'s two-per-row pairing; "Ledger" gives each stat its own full-width row with the value right-aligned.',
		},
	}),

	// —— Element defaults (behavioral) ——
	d({
		key: 'collapsibleDefault', default: true,
		ui: {
			group: 'Element defaults', label: 'Collapsible by default', control: 'toggle',
			help: 'Blocks are collapsible unless the block sets collapsible: itself.',
		},
	}),
	d({
		key: 'collapseDefault', default: false,
		ui: {
			group: 'Element defaults', label: 'Start collapsed', control: 'toggle',
			help: 'Collapsible blocks start collapsed unless the block sets collapse_default: itself.',
		},
	}),
	// SC-132: the ALT recovery editor. Default OFF — the shipped interaction is Model M
	// (a marker click sets the count, with an Undo in the notice that follows). Scott
	// asked for this as an option, not as the default: "can we allow for the ALT stepper
	// popover as an optional setting. I think it looks really good and some players may
	// want it."
	d({
		key: 'staminaRecoveryPopover', default: false,
		ui: {
			group: 'Element defaults', label: 'Edit Recoveries with a popover', control: 'toggle',
			advanced: true,
			help: 'Clicking the recovery markers opens a small − / + popover instead of setting the count directly. Off — the default — sets the count on click, and every change offers an Undo.',
		},
	}),

	// —— Rolling (D5, Plan 14: OD-D4-1a's hidden rows go live + the master switch) ——
	d({
		key: 'rollingEnabled', default: false,
		ui: {
			group: 'Rolling', label: 'Enable rolling', control: 'toggle',
			help: 'Add a dice roller to rendered ability cards (feature, featureblock, statblock). Off — the default — renders cards exactly as before. The ds-roll element always rolls; authoring one is its own opt-in.',
		},
	}),
	d({
		key: 'rollerEngine', default: 'native',
		ui: {
			group: 'Rolling', label: 'Roller', control: 'select',
			help: 'Which engine rolls the dice. "Dice Roller plugin" delegates the raw dice to the community Dice Roller plugin when it is installed and enabled (Draw Steel tier/edge/bane math always stays native); it falls back to the built-in roller automatically.',
			options: [{ value: 'native', label: 'Draw Steel native' }, { value: 'dice-roller', label: 'Dice Roller plugin' }],
		},
	}),
	// rollClickToRoll's BUILT default (true) is deliberately kept (OD-5): it only
	// takes effect once rollingEnabled is on, so fresh-default fidelity is preserved
	// by the master switch, and flipping a shipped default would be a gratuitous
	// divergence from what D4 persisted.
	d({
		key: 'rollClickToRoll', default: true,
		ui: {
			group: 'Rolling', label: 'Click ability to roll', control: 'toggle',
			help: 'When rolling is enabled, clicking a power-roll tier row rolls it. The Roll button always works regardless.',
		},
	}),

	// —— Authoring (D9 — the reading-mode form pencil) ——
	d({
		key: 'authoringControls', default: false,
		ui: {
			group: 'Authoring', label: 'Show edit button on rendered blocks', control: 'toggle',
			help: 'Adds a pencil to each rendered Draw Steel block that opens a form editor (writes back through the normal save path). Off — the default — renders blocks exactly as before; the Insert commands and /ds autocomplete work regardless of this setting.',
		},
	}),
];

// —— §3.2 statblock presets: NOT a stored pref — the label is DERIVED from the
// members, re-deriving 'custom' when any single member diverges (site parity).
//
// SC-146 fixes 4/5 (audit §4a "Preset bundle divergence") corrected the four ORIGINAL
// members of both non-default bundles, which had diverged from the site's presets of
// the same name:
//   - sourcebook: the site's book layout is a FLAT feature list
//     (settings-panel.js:37, featstyle 'flat'); this bundle kept 'card'.
//   - index: the site pins multi-column `wide: "off"` in EVERY preset — it is
//     a standalone toggle, never a preset member (settings-panel.js:711) — but
//     this bundle turned sbColumns 'wide' on.
// `density: 'compact'` stays in the index bundle: the site has NO density
// preset member at all (density has no site twin, full stop — it's the
// plugin's own PLUGIN-ONLY divergence, matrix row P3/S21), so keeping it here
// is a deliberate choice, not a leftover of the sbColumns bug above (audit
// judgment call C3, Scott-approved: "keep it... but write it down as a
// deliberate divergence, not an accident").
// SC-146 FIX ROUND 1, I2 — the site's own Index bundle sets `meta: gridc`
// (audit §4a table, settings-panel.js:39). Fixes 4/5 above touched this
// exact object but left `sbStats: 'grid'`: the plugin had no `gridc` value
// to give it at the time (fix 3 added the mode in the SAME commit), so the
// mismatch slipped through unflagged. Now that C1 makes gridc render
// correctly under Steel, there is no remaining reason to diverge.
//
// SC-123 then widened every bundle with the five NEW members, so a preset writes the
// same SET of decisions the site's does (settings-panel.js:35-39). SC-146's corrected
// values for the four original members are carried through unchanged — the two tickets
// touch disjoint members of the same three objects. Two deliberate divergences remain,
// both inherited from the byte-freeze era rather than chosen (see the note above the
// SB_DEFAULTS block: SC-144 retired the legacy shots, so these are now open questions):
//
//  1. **`steel` mirrors the plugin's DEFAULTS, not the site's Steel Card bundle.**
//     The site's bundle sets `charline: two` and `villain: banded`; the plugin's
//     defaults for those reproduce the pre-SC-123 rendering (one merged characteristic
//     line, un-banded villain actions). Writing the
//     site's values here would make a fresh install derive 'custom' instead of 'Steel
//     card', i.e. the dropdown would open on a state the user never chose. So `steel`
//     stays "the plugin's home look" and the site-faithful values live in the other two
//     bundles. Flipping the defaults themselves is a separate, sanctioned-rebaseline
//     decision for Scott (SC-123 report).
//  2. `sourcebook`/`index` DO carry the site's values for every new member
//     (kwUsage/distTarget/sbCharLine/sbCharBox/sbVillain), because neither is the
//     default state and neither has a fidelity bar to clear. ——
export const SB_PRESETS = {
	steel: {
		sbFeatureStyle: 'card', sbDensity: 'comfortable', sbColumns: 'single', sbStats: 'grid',
		kwUsage: 'crest', distTarget: 'grid', sbCharLine: 'one', sbCharBox: 'off', sbVillain: 'inline',
	},
	sourcebook: {
		sbFeatureStyle: 'flat', sbDensity: 'comfortable', sbColumns: 'single', sbStats: 'ledger',
		kwUsage: 'text', distTarget: 'text', sbCharLine: 'one', sbCharBox: 'on', sbVillain: 'inline',
	},
	index: {
		sbFeatureStyle: 'flat', sbDensity: 'compact', sbColumns: 'single', sbStats: 'gridc',
		kwUsage: 'grid', distTarget: 'grid', sbCharLine: 'two', sbCharBox: 'onword', sbVillain: 'banded',
	},
} as const;
export type SbPresetId = keyof typeof SB_PRESETS;

const SB_PRESET_MEMBERS = [
	'sbFeatureStyle', 'sbDensity', 'sbColumns', 'sbStats',
	'kwUsage', 'distTarget', 'sbCharLine', 'sbCharBox', 'sbVillain',
] as const;

/** The preset whose bundle equals the current member values, else 'custom'. */
export function deriveSbPreset(prefs: PreferenceStore): SbPresetId | 'custom' {
	for (const id of Object.keys(SB_PRESETS) as SbPresetId[]) {
		if (SB_PRESET_MEMBERS.every((k) => prefs.get(k) === SB_PRESETS[id][k])) return id;
	}
	return 'custom';
}

/** Writes every member of `preset` (sequential prefs.set; the debounced storage
 *  adapter collapses the batch into one disk write). */
export async function applySbPreset(prefs: PreferenceStore, preset: SbPresetId): Promise<void> {
	for (const k of SB_PRESET_MEMBERS) {
		await prefs.set(k, SB_PRESETS[preset][k]);
	}
}

/**
 * D4 §1.3 behavioral precedence for the ComponentWrapper contract (AMENDED —
 * task-5-report-d4.md "Continuation"): block key (`collapsible:` / `collapse_default:`)
 * > global pref > built-in default. `ComponentWrapper`'s constructor keeps materializing
 * concrete `true`/`false` on the model (byte-compat, unchanged) — this helper instead
 * consults the side channel (`declaredCollapsePrefs`) recorded at construction time to
 * tell "the block said so" apart from "the constructor's own `?? true`/`?? false`
 * default filled it in". The block keys ARE the per-block override for these two
 * prefs — no `prefs:` map entry exists for behavioral keys (extractPrefOverrides warns
 * on them).
 */
export function resolveCollapsePrefs(
	model: { collapsible?: boolean; collapse_default?: boolean },
	prefs: PreferenceStore,
): { collapsible: boolean; collapseDefault: boolean } {
	// No side-channel entry (shouldn't happen for a real element model — see the
	// declaredCollapsePrefs doc comment) is treated as "declared", falling back to the
	// model's own already-concrete field rather than guessing.
	const declared = declaredCollapsePrefs(model);
	const collapsibleDeclared = declared?.collapsible ?? true;
	const collapseDefaultDeclared = declared?.collapseDefault ?? true;
	return {
		collapsible: collapsibleDeclared ? (model.collapsible ?? true) : prefs.get('collapsibleDefault'),
		collapseDefault: collapseDefaultDeclared ? (model.collapse_default ?? false) : prefs.get('collapseDefault'),
	};
}
