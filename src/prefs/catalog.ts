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
import { CARD_SCALE, TEXT_SCALE, TYPE_SCALE, snap } from './scale';

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
		// —— Type-role sizes (SC-185 — css-reflected multipliers over the
		// --dse-fs-* role scale; snap()-normalized, 1 is the inert default →
		// toCss null → no inline var). These retune the RATIO between a role and
		// the element's body text; textScale above zooms the whole element. ——
		smallTextScale: number;
		largeTextScale: number;
		controlTextScale: number;
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
		// **SC-193 moved those two onto their own "Feature display" page** for exactly
		// that reason; they remain statblock PRESET members (see SB_PRESET_MEMBERS).
		// sbCharLine/sbCharBox/sbVillain are statblock-only, like the site's.
		//
		// EVERY DEFAULT HERE NOW MATCHES THE SITE'S OWN SB_DEFAULTS verbatim, including
		// disttarget=grid (settings-panel.js:31-33; an earlier revision of this comment,
		// and the SC-146 audit row S8 it came from, misread that default as `text` —
		// corrected in the SC-123 fix round, review M-4).
		//
		// charline and villain were the last two holdouts. They defaulted to the single
		// merged "Might +2" line and un-banded villain actions, chosen only to hold the
		// then-frozen legacy shots byte-identical. SC-144 retired those shots, which left
		// the divergence with no reason behind it, and Scott ruled on 2026-08-12: "nobody
		// has this code yet. We dont have to worry about breaking anyone. Lets do the
		// correct thing." So they ship the site's values — charline=two, villain=banded —
		// and the frozen statblock print shots were rebaselined against that ruling.
		kwUsage: 'crest' | 'text' | 'grid' | 'ledger';
		distTarget: 'grid' | 'text' | 'ledger';
		sbCharLine: 'one' | 'two';
		sbCharBox: 'off' | 'on' | 'onword';
		sbVillain: 'inline' | 'banded';
		// —— SC-160: the site's sticky mini-header pair (`body[data-aug-sticky]` +
		// `data-sb-stickymeta`, steel-statblock.css:524/577). Both default ON, site parity.
		//
		// NOT preset members, deliberately — the site's own presets never touch them
		// either ("preset bundles never touch stickymeta / augs", settings-panel.js:711):
		// they are an AUGMENTATION (does the reading surface do this at all?), not a
		// layout decision, so bundling them into "Sourcebook" or "Index card" would make
		// picking a look silently turn a scroll behaviour on or off.
		//
		// Both are PURE CSS REFLOWS over DOM the view always builds, which is what keeps
		// them per-block overridable — unlike sbCharLine/sbCharBox/sbVillain above, whose
		// value the view reads at BUILD time. The IntersectionObserver that reveals the bar
		// is wired regardless of either value (statblock/view.ts), so a block-level
		// `prefs: { sbSticky: off }` really does render a statblock with no pinned bar,
		// and `sbStickyMeta: off` really does drop its second row.
		sbSticky: 'on' | 'off';
		sbStickyMeta: 'on' | 'off';
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
	| 'Feature display'
	| 'Element defaults'
	| 'Rolling'
	| 'Authoring';

/** Section order in the settings tab.
 *
 *  The three display groups run widest-container-first — Statblock, Featureblock,
 *  Feature — which is also the order a reader meets them: a statblock CONTAINS
 *  featureblock-shaped stat headers and ability cards, a featureblock contains ability
 *  cards, and an ability card is the atom. */
export const GROUP_ORDER: readonly PrefGroup[] = [
	'Appearance',
	'Typography',
	'Statblock display',
	'Featureblock display',
	'Feature display',
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
	/**
	 * SC-160 — DEPENDENT ROW. Names the pref this one is a sub-toggle of: the settings
	 * tab renders the row indented under its parent (a leading `↳`, the site's own
	 * spelling) and DISABLES its control while the parent is off.
	 *
	 * Disabled rather than hidden, deliberately. A row that vanishes takes its value
	 * with it — the reader cannot see what "include secondary stats" is currently set
	 * to, cannot find it in the settings search, and gets a settings page whose height
	 * changes as they toggle things. A greyed row states both facts at once: the setting
	 * exists, and it is not doing anything right now because of the row above it.
	 *
	 * The parent must be a row EARLIER in the same group (the tab renders descriptors in
	 * registration order and does no sorting), and "on" means `true` or the string
	 * `'on'` — the same two spellings the toggle control already maps.
	 */
	dependsOn?: keyof DsePrefs;
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

	// —— SC-185 type-role sizes: the three knobs over the --dse-fs-* role scale
	// (styles-source.css :root, "THE TYPE-SIZE ROLE SCALE"). Same css-bearing,
	// inert-at-default shape as the two scales above — snap()-normalized, 1 →
	// toCss null → removeProperty — so a vault that never opens Settings renders
	// byte-identically to one that has never heard of them.
	//
	// WHY THREE AND NOT ONE. Text size above already zooms an element as a whole;
	// what it cannot do is change the RELATIONSHIP between sizes, which is the
	// actual complaint SC-185 was filed for ("the malice log font is super tiny,
	// the reset button font is too large"). Those two symptoms point in OPPOSITE
	// directions, so one knob can never fix both. The split follows the scale's own
	// three bands: below body (small), above body (large), and interactive controls
	// — which get their own knob because a control's text answers to how much UI
	// chrome a reader tolerates, not to their reading size.
	//
	// PRIMARY rows, not Advanced: these are the rows a reader goes looking for
	// after noticing something is the wrong size, and burying the answer to a
	// legibility problem one page deeper is the wrong way round.
	//
	// Unlike textScale/cardScale, these apply IN PRINT AND EXPORT too — the same
	// contract the six font-family pickers carry. A whole-element zoom on paper
	// breaks page fitting; a ±20% nudge to the caption/label ratio does not, and a
	// reader who needs bigger small text needs it on the printout as well.
	d({
		key: 'smallTextScale', default: 1,
		css: {
			varName: '--dse-fs-small-scale',
			toCss: (v) => { const n = snap(v, TYPE_SCALE); return n === TYPE_SCALE.default ? null : String(n); },
		},
		ui: {
			group: 'Typography', label: 'Small text size', control: 'slider',
			min: TYPE_SCALE.min, max: TYPE_SCALE.max, step: TYPE_SCALE.step,
			help: 'Size of text below the body size — labels, captions, hints, chips, log lines and tallies — relative to the element\'s body text (80%–120%). 100% keeps today\'s look. Applies everywhere, including print and export.',
		},
	}),
	d({
		key: 'largeTextScale', default: 1,
		css: {
			varName: '--dse-fs-large-scale',
			toCss: (v) => { const n = snap(v, TYPE_SCALE); return n === TYPE_SCALE.default ? null : String(n); },
		},
		ui: {
			group: 'Typography', label: 'Large text size', control: 'slider',
			min: TYPE_SCALE.min, max: TYPE_SCALE.max, step: TYPE_SCALE.step,
			help: 'Size of text above the body size — card names, band titles and display stat numbers — relative to the element\'s body text (80%–120%). 100% keeps today\'s look. Applies everywhere, including print and export.',
		},
	}),
	d({
		key: 'controlTextScale', default: 1,
		css: {
			varName: '--dse-fs-control-scale',
			toCss: (v) => { const n = snap(v, TYPE_SCALE); return n === TYPE_SCALE.default ? null : String(n); },
		},
		ui: {
			group: 'Typography', label: 'Control text size', control: 'slider',
			min: TYPE_SCALE.min, max: TYPE_SCALE.max, step: TYPE_SCALE.step,
			help: 'Size of text on buttons, steppers, tabs and collapse headers, relative to the element\'s body text (80%–120%). 100% keeps today\'s look. Controls are screen-only chrome, so this never affects print or export.',
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

	// —— SC-123: the site's remaining statblock layout settings. All three are
	// SECONDARY rows (ui.advanced) — Scott's "3 primary + advanced" balance from
	// SC-112: the primary page keeps the preset plus the four curated knobs, and the
	// long tail lives one page deeper rather than flat. Each is still a preset member
	// (SB_PRESET_MEMBERS), so the bundles write them regardless of which page shows
	// them, and the section reset covers them (SettingsTab iterates members, not rows).
	//
	// SC-123's other two — kwUsage / distTarget — moved to the "Feature display" group
	// below (SC-193): they are ability-card settings, not statblock settings. ——
	// —— The three CONDITIONAL-DOM keys (perBlock: false). statblock/view.ts reads them
	// at BUILD time — charsAreSplit() picks the merged "Might +2" text node vs the
	// three-part split, renderFeatures() picks inline vs one collapsible band — so they
	// are the only presentation prefs on this element that re-render instead of
	// reflowing. prefOverrides.ts runs after the mount and re-stamps the ATTRIBUTE only,
	// which would dress the global shape in local attributes (measured: "+2Might"), so
	// a per-block `prefs:` map warns and ignores them. Global-only, deliberately. ——
	d({
		key: 'sbCharLine', default: 'two', attr: 'sb-charline', perBlock: false,
		ui: {
			group: 'Statblock display', inPreset: true, advanced: true,
			label: 'Characteristics', control: 'select',
			options: [
				{ value: 'one', label: 'One line' },
				{ value: 'two', label: 'Value over label' },
			],
			help: 'How each characteristic reads in the Might/Agility/Reason/Intuition/Presence rail. "Value over label" — the default, matching the website — stacks the number above the word; "One line" puts them on a single "Might +2" line instead.',
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
		key: 'sbVillain', default: 'banded', attr: 'sb-villain', perBlock: false,
		ui: {
			group: 'Statblock display', inPreset: true, advanced: true,
			label: 'Villain actions', control: 'select',
			options: [
				{ value: 'inline', label: 'Inline with other features' },
				{ value: 'banded', label: 'Grouped in a collapsible band' },
			],
			help: 'Where a statblock\'s villain actions render. "Grouped" — the default, matching the website — collects them into one collapsible "Villain Actions" band below the rest. "Inline" lists them among the other features in source order instead. Print and export always show the band open.',
		},
	}),

	// —— SC-160: the sticky mini-header pair. PRIMARY rows (not behind Advanced), for two
	// reasons: the feature ships ON, so the row a reader looks for is the one that turns it
	// OFF — burying the off-switch a page deeper is the wrong way round; and the sub-toggle
	// has to sit directly beneath its parent for the indent to mean anything, so the pair
	// cannot be split across the primary and Advanced pages. They go LAST in the group so
	// the four curated layout knobs still lead (Scott's SC-112 balance), and they are not
	// preset members (see the DsePrefs comment above). ——
	d({
		key: 'sbSticky', default: 'on', attr: 'sb-sticky',
		ui: {
			group: 'Statblock display', label: 'Sticky mini-header', control: 'toggle',
			help: 'While a statblock\'s header has scrolled out of view, pin a compact bar with its name, role and key stats to the top of the pane. On by default, matching the website. Screen only — print, export and canvas cards never show it.',
		},
	}),
	d({
		key: 'sbStickyMeta', default: 'on', attr: 'sb-stickymeta',
		ui: {
			// SC-160 fix round 1: named after its PARENT, not after what it adds. The bare
			// "Include secondary stats" sat two rows below the pre-existing "Secondary
			// stats" (the grid/ledger select for the card's own meta block) and was
			// indistinguishable from it in the native settings search, where rows arrive
			// without the indent or the row above them to explain the relationship.
			group: 'Statblock display', label: 'Sticky mini-header: include secondary stats',
			control: 'toggle', dependsOn: 'sbSticky',
			help: 'Add a second line to the pinned mini-header with Movement, With Captain, Immunity and Weakness. On by default, matching the website. In a narrow pane (a sidebar leaf) the second line is dropped whatever this says — there is no room for it.',
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

	// —— Feature display (SC-193 — "There are settings for Featureblocks and statblocks,
	// but not Features").
	//
	// THE ROOT CAUSE, and why this section is a MOVE rather than two new preferences.
	// The plugin renders three ability-card hosts — a statblock's feature list, a
	// featureblock's option list, and a standalone `ds-feature` block — and exactly two
	// preferences govern the card itself: `kwUsage` (the keyword + action-type band) and
	// `distTarget` (the Distance/Target rail). Both reflect onto EVERY element root and
	// their CSS is element-agnostic (`[data-dse-kwusage=…] .dse-feature__meta-*`, no
	// `[data-dse-element]` qualifier), so both have always applied to a standalone
	// feature — they were merely FILED under "Statblock display → Advanced", where a
	// reader looking for feature settings would never find them and where their own help
	// text had to end with "applies to every ability card" to undo the filing. There is
	// no missing preview registration and no element-definition gap: `sectionShowsPreview`
	// derives a page's preview from its reflected descriptors, so this section gets one
	// for free (SettingsPreview gained the `feature` subject to go with it).
	//
	// PRIMARY rows, not Advanced: a two-row page whose only rows hide behind a nested
	// "Advanced" page would be an empty page. Featureblock display sets the precedent —
	// two primary rows, no Advanced, no preset.
	//
	// STILL STATBLOCK PRESET MEMBERS (`inPreset: true`, SB_PRESET_MEMBERS unchanged):
	// the site bundles them into its Statblock presets and the plugin follows. So the
	// Statblock display page's Preset row writes these two rows on this page, and moving
	// either one re-derives that preset to "Custom" — which is why both help strings say
	// so out loud, since the cause and the effect are now on different pages. ——
	d({
		key: 'kwUsage', default: 'crest', attr: 'kwusage',
		ui: {
			group: 'Feature display', inPreset: true,
			label: 'Keyword display', control: 'select',
			options: [
				{ value: 'crest', label: 'Chips' },
				{ value: 'text', label: 'Inline text' },
				{ value: 'grid', label: 'Grid' },
				{ value: 'ledger', label: 'Ledger' },
			],
			help: 'Layout of the keyword + action-type band on ability cards. "Chips" — the default — keeps today\'s look: boxed keyword chips with the action type at the far right. Applies to every ability card — standalone, and inside statblocks and featureblocks. Part of the statblock preset, so changing it re-derives that preset to "Custom".',
		},
	}),
	d({
		key: 'distTarget', default: 'grid', attr: 'disttarget',
		ui: {
			group: 'Feature display', inPreset: true,
			label: 'Distance + target', control: 'select',
			options: [
				{ value: 'grid', label: 'Grid' },
				{ value: 'text', label: 'Inline text' },
				{ value: 'ledger', label: 'Ledger' },
			],
			help: 'Layout of the Distance/Target rail on ability cards. "Grid" — the default — keeps today\'s two boxed cells. Applies to every ability card — standalone, and inside statblocks and featureblocks. Part of the statblock preset, so changing it re-derives that preset to "Custom".',
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

	// SC-183 round 3's `initPortrait` (seal / shutter / sheathe / laurel) is deleted here
	// — Scott picked `seal` (2026-08-23: "Seal option looks good. I like that."), which is
	// now the tracker's unconditional portrait turn-mark; the key, the three losing CSS
	// branches and their shots are deleted (the SC-154 `5360fe9` promotion shape, run four
	// times now).

	// SC-189 round 2's `chromeSeat` (current / hush / crown / ledge / drop, + round 4's
	// `tuck`) is deleted here too, the sixth run of the same shape — but with a different
	// verdict. Four of the five candidates were compensating for a defect that turned out
	// not to be a design question at all: rounds 3-5 found three real bugs (Obsidian's
	// `--input-shadow` and `height` reaching a chrome `.dse-btn`, then the head band's own
	// corner radius painting over the card's hairline), and once those were fixed the seam
	// the candidates were fighting was gone. Scott ruled on 2026-08-26 to delete the whole
	// A/B, and on 2026-08-27 to keep `tuck` — which is now two unconditional declarations on
	// the base panel (styles-source.css → "Element chrome"), not a pref. Hidden rows: back
	// to zero, six for six.

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
// touch disjoint members of the same three objects.
//
// **`steel` now equals the site's Steel Card bundle, and equals the plugin's defaults.**
// It used to be neither: it mirrored the plugin's own defaults, which held `charline:
// one` / `villain: inline` for byte-freeze reasons rather than design ones. Scott's
// 2026-08-12 ruling flipped those defaults to the site's values, which collapses the
// two into one — the bundle and the defaults now agree because they are both simply
// "what the site does".
//
// The invariant that constrains this object is worth stating plainly, because it is the
// thing a future edit can break silently: **`steel` MUST equal the descriptor defaults,
// member for member.** The preset label is derived, never stored (deriveSbPreset), so a
// fresh install that does not match any bundle opens its dropdown reading "Custom" — a
// state the user never chose. Changing a default without changing this bundle (or the
// reverse) produces exactly that. A test pins the equality in both directions. ——
export const SB_PRESETS = {
	steel: {
		sbFeatureStyle: 'card', sbDensity: 'comfortable', sbColumns: 'single', sbStats: 'grid',
		kwUsage: 'crest', distTarget: 'grid', sbCharLine: 'two', sbCharBox: 'off', sbVillain: 'banded',
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
