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
// Invariant: every default below MUST be a primitive (boolean/string), never an
// object/array — DsePreferenceStore.persist() sparse-checks via strict equality
// (`value === descriptor.default`), which is only correct for primitives.
import type { PreferenceStore, PrefDescriptor, DsePrefs } from '../framework/seams/prefs';
import { declaredCollapsePrefs } from '@model/ComponentWrapper';

declare module '../framework/seams/prefs' {
	interface DsePrefs {
		// —— Appearance (presentation) ——
		reduceMotion: boolean;
		printPreview: 'on' | 'off';
		portraits: 'on' | 'off';
		// —— Statblock display (presentation; OD-D4-6 curated four) ——
		sbFeatureStyle: 'card' | 'flat';
		sbDensity: 'comfortable' | 'compact';
		sbColumns: 'single' | 'wide';
		sbStats: 'grid' | 'ledger';
		// —— Element defaults (behavioral — no attr; views read cx.prefs.get) ——
		collapsibleDefault: boolean;
		collapseDefault: boolean;
		// —— Rolling (behavioral; D5 consumes — rows hidden until it ships) ——
		rollerEngine: 'native' | 'dice-roller';
		rollClickToRoll: boolean;
		// —— References (behavioral; F2 consumes — row hidden until it ships) ——
		webLinkFallback: boolean;
	}
}

export type PrefGroup =
	| 'Appearance'
	| 'Statblock display'
	| 'Element defaults'
	| 'Rolling'
	| 'References';

/** Section order in the settings tab. */
export const GROUP_ORDER: readonly PrefGroup[] = [
	'Appearance',
	'Statblock display',
	'Element defaults',
	'Rolling',
	'References',
];

/** D4 §4.1 — the finalized shape of PrefDescriptor.ui (F1 typed it `unknown`). */
export interface PrefUi {
	group: PrefGroup;
	label: string;
	help?: string;
	/** 'toggle' over a string-typed pref means the 'on'|'off' mapping (checked ⇔ 'on'). */
	control: 'toggle' | 'select' | 'text';
	options?: readonly { value: string; label: string }[];
	/** Statblock preset-bundle member (§3.2). */
	inPreset?: boolean;
	/** Row not rendered (consumer not shipped: D5 rolling, F2 references). */
	hidden?: boolean;
}

/** Typed accessor for the `unknown`-typed ui at the F1 seam. */
export function prefUi(descriptor: PrefDescriptor): PrefUi | undefined {
	return descriptor.ui as PrefUi | undefined;
}

/** Correlates key/default per entry (PrefDescriptor's K) while building a plain array. */
function d<K extends keyof DsePrefs>(
	descriptor: PrefDescriptor<K> & { ui: PrefUi },
): PrefDescriptor {
	return descriptor as PrefDescriptor;
}

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
	d({
		key: 'sbStats', default: 'grid', attr: 'sb-stats',
		ui: {
			group: 'Statblock display', inPreset: true, label: 'Secondary stats', control: 'select',
			options: [{ value: 'grid', label: 'Grid' }, { value: 'ledger', label: 'Ledger' }],
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

	// —— Rolling (OD-D4-1a: cataloged now, hidden until D5 ships and flips hidden) ——
	d({
		key: 'rollerEngine', default: 'native',
		ui: {
			group: 'Rolling', hidden: true, label: 'Roller', control: 'select',
			options: [{ value: 'native', label: 'Draw Steel native' }, { value: 'dice-roller', label: 'Dice Roller plugin' }],
		},
	}),
	d({
		key: 'rollClickToRoll', default: true,
		ui: { group: 'Rolling', hidden: true, label: 'Click ability to roll', control: 'toggle' },
	}),

	// —— References (hidden until F2 ships) ——
	d({
		key: 'webLinkFallback', default: true,
		ui: {
			group: 'References', hidden: true, label: 'Fall back to steelcompendium.io links', control: 'toggle',
			help: "When an SCC link isn't found in your vault, open it on the website (on click only).",
		},
	}),
];

// —— §3.2 statblock presets: NOT a stored pref — the label is DERIVED from the
// members, re-deriving 'custom' when any single member diverges (site parity). ——
export const SB_PRESETS = {
	steel:      { sbFeatureStyle: 'card', sbDensity: 'comfortable', sbColumns: 'single', sbStats: 'grid' },
	sourcebook: { sbFeatureStyle: 'card', sbDensity: 'comfortable', sbColumns: 'single', sbStats: 'ledger' },
	index:      { sbFeatureStyle: 'flat', sbDensity: 'compact', sbColumns: 'wide', sbStats: 'grid' },
} as const;
export type SbPresetId = keyof typeof SB_PRESETS;

const SB_PRESET_MEMBERS = ['sbFeatureStyle', 'sbDensity', 'sbColumns', 'sbStats'] as const;

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
	const declared = declaredCollapsePrefs(model as object);
	const collapsibleDeclared = declared?.collapsible ?? true;
	const collapseDefaultDeclared = declared?.collapseDefault ?? true;
	return {
		collapsible: collapsibleDeclared ? (model.collapsible ?? true) : prefs.get('collapsibleDefault'),
		collapseDefault: collapseDefaultDeclared ? (model.collapse_default ?? false) : prefs.get('collapseDefault'),
	};
}
