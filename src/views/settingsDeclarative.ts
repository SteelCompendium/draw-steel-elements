// src/views/settingsDeclarative.ts — SC-131: the settings tab as obsidian 1.13 definitions.
//
// The settings tab had grown into a single ~6850px scroll page (6 descriptor-driven pref
// groups + 3 hand-written operational sections), and SC-123's 18 display-parity settings
// would push it past 8000. Obsidian 1.13 solved the general form of this for us: a
// PluginSettingTab may return `getSettingDefinitions()` instead of painting DOM in
// `display()`, and obsidian then renders the rows, persists their values, and — the part
// no hand-built shell can replicate — indexes every row into the NATIVE settings search,
// so our settings are findable from the settings window's own field alongside core ones.
//
// SHAPE: "D-pages". Each section is a navigable `type: 'page'`, so the massive scroll page
// becomes a short index of nine entries and each page holds only its own rows. That is
// obsidian's own idiom (core settings is organised this way), so it costs us no custom
// navigation chrome, no CSS and no tab-bar wrapping behaviour at 12+ sections.
//
// This module is a PURE MAPPER over the nav model below. `SettingsTab` remains the single
// source of truth: it builds a `NavSection[]` from the pref descriptors plus the
// hand-written operational rows, and this turns that model into definitions. Adding a
// preference is still "add a descriptor" and nothing here changes.
import type {
	Setting,
	SettingControl,
	SettingDefinition,
	SettingDefinitionGroup,
	SettingDefinitionItem,
	SettingDefinitionPage,
	SettingGroupItem,
} from 'obsidian';

/** One settings row. `label` present ⇒ a real, searchable setting; absent ⇒ chrome. */
export interface NavRow {
	/** Display name AND primary search key. Omit for chrome. */
	label?: string;
	/** Description, shown under the name and also indexed for search. */
	help?: string;
	/** Extra search terms beyond label/help. The owning section's label is added
	 *  automatically, so "typography" finds every font row. */
	aliases?: string[];
	/** Secondary row: moves to the section's nested "Advanced" page. */
	advanced?: boolean;
	/**
	 * SC-160: this row is a SUB-TOGGLE of the row above it. The label is already
	 * indented by the builder (a leading `↳`); this flag is what carries the state half
	 * — a predicate obsidian re-evaluates on every render and on `refreshDomState()`,
	 * returning true while the parent is off. Applies to `control` rows only (obsidian's
	 * `disabled` lives on the control, not on the definition) — a `render` row owning its
	 * own body owns its own disabling too.
	 */
	disabled?: () => boolean;
	/**
	 * The row's NATIVE binding. Present ⇒ obsidian renders the control, reads it through
	 * the tab's `getControlValue` and writes it through `setControlValue` (which routes
	 * into the PreferenceStore, so live apply is unchanged). Absent ⇒ `render` below owns
	 * the row body.
	 */
	control?: SettingControl;
	/** Custom row body, for the rows no native control type can express (the font
	 *  pickers, the derived-value preset, the two-button sync row). Receives the Setting
	 *  obsidian already created and named. May return a teardown callback. */
	render?: (setting: Setting) => void | (() => void);
	/** A label-less block (an explanatory paragraph, the sync status line). Rendered into
	 *  its own full-width row and never a search hit — it has no name to match on.
	 *  May return a teardown for THIS mount, on the same contract as `render`/
	 *  `renderPreview` (SC-140: the sync-status line subscribes to manifest changes while
	 *  it is on screen, and must drop that subscription when the row goes away). */
	chrome?: (container: HTMLElement) => void | (() => void);
}

/** One settings page: a group of rows plus, optionally, a reset and a live preview. */
export interface NavSection {
	/** Stable id — the page's DOM hook and the preview's CSS target. */
	id: string;
	label: string;
	/** Resets the section's FULL member list, including rows on the nested Advanced page.
	 *  Rendered as a trailing action row. */
	onReset?: () => void;
	rows: readonly NavRow[];
	/** Mounts the live statblock preview for this page. Present only on sections whose
	 *  settings visibly change an element (see SettingsTab.sectionShowsPreview).
	 *  Returns the teardown for THIS mount — see `previewDefinition`. */
	renderPreview?: (container: HTMLElement) => void | (() => void);
}

/** Class on the group wrapping a page's rows — the preview layout hooks it. */
export const PAGE_CLS = 'dse-settings-page';
/** Class on the preview row: CSS turns it from a name/control pair into a full-width
 *  panel. (Before SC-187 it also docked the row to the bottom of the scroll viewport;
 *  see `previewDefinition` for why that is gone.) */
export const PREVIEW_CLS = 'dse-settings-preview-row';
/** Class on a chrome row (no name/control), so CSS can let its text span the full width. */
export const CHROME_CLS = 'dse-settings-chrome-row';

/*
 * ── SC-160 fix round 1: WHY A DEPENDENT ROW IS NOT VISUALLY INDENTED ────────────────────
 *
 * The obvious ask for a sub-toggle is a real `margin-left` on the row. It is not available,
 * and the reason is worth writing down so the next person does not re-derive it:
 *
 *  1. Obsidian 1.13's `SettingDefinitionBase` (`name` / `desc` / `aliases` / `searchable` /
 *     `visible`) carries no class or id field, and the rendered element has no
 *     distinguishing attribute (measured in a real 1.13 Settings popout: the dependent
 *     row's element is exactly `class="setting-item mod-toggle"`, and both it and its
 *     parent sit at the same `getBoundingClientRect().left`). A per-row class hook DOES
 *     exist — `render` receives the live `Setting`, and `toDefinition`/`previewDefinition`
 *     below use exactly that (`setting.settingEl.addClass(CHROME_CLS / PREVIEW_CLS)`) — but
 *     `render` and `control` are MUTUALLY EXCLUSIVE (`SettingDefinitionControl` declares
 *     `render?: never`). Reaching the hook therefore means hand-building the toggle and
 *     giving up the native `control` binding (`getControlValue`/`setControlValue`) AND the
 *     native `disabled` predicate that `refreshDomState()` drives — which is the one half
 *     of the dependent-row feature that is measured working. Worse trade than no indent.
 *  2. A GROUP does take `cls`, and a group may not nest inside a group (only settings and
 *     pages may) — but a PAGE's `items` accept `SettingDefinitionItem`, which includes
 *     groups, so SIBLING one-row groups at page level ARE expressible. The blocker is the
 *     layout, not the schema: `toPage()` below deliberately puts everything in ONE
 *     `PAGE_CLS` group because that single container is what the bottom-docked preview CSS
 *     lays out against (see its comment). Splitting it to indent one row would cost that.
 *  3. `desc` accepts a DocumentFragment, which looks like the escape hatch: plant an empty
 *     marker span and indent the row with `:has()`. It is a TRAP. Obsidian calls
 *     `getSettingDefinitions()` only from `update()` and re-renders from the cached
 *     `settingItems` (verified against the shipped 1.13.4 bundle — see the
 *     `PluginSettingTab` mock's header). Appending a DocumentFragment MOVES its children
 *     out, so the fragment is emptied by the first render and every render after it — every
 *     re-open of the settings window, every page navigation — draws the row with NO
 *     DESCRIPTION. Trading a working description for an indent is a bad trade, so the
 *     indent is declined.
 *
 * What carries the relationship instead: the `↳` prefix on the label (`DEPENDENT_PREFIX`
 * in SettingsTab.ts), the row's position directly beneath its parent, and — because a
 * settings-search hit arrives with neither of those — the parent's own name inside the
 * label. The state half (`disabled`) is real and verified; only the indent is absent.
 */

/** Turns a row into a definition. Returns null for a row that renders nothing. */
function toDefinition(row: NavRow, section: NavSection): SettingDefinition | null {
	if (row.chrome) {
		const chrome = row.chrome;
		return {
			name: '',
			searchable: false,
			render: (setting) => {
				setting.settingEl.addClass(CHROME_CLS);
				setting.infoEl.empty();
				// Same per-MOUNT cleanup contract as `render`/`renderPreview`: whatever the
				// chrome hands back is what obsidian calls when this row is torn down.
				return asCleanup(chrome(setting.infoEl));
			},
		};
	}
	if (!row.label) return null;
	const base = {
		name: row.label,
		...(row.help ? { desc: row.help } : {}),
		aliases: [section.label, ...(row.aliases ?? [])],
	};
	// control/render are mutually exclusive in the schema — TypeScript enforces it, so
	// these are two separate returns rather than one object with both keys optional.
	// SC-160: `disabled` is merged INTO the control (obsidian puts it there, not on the
	// definition), and only when the row declares one — an always-present `() => false`
	// would be a behaviour change for every existing row.
	if (row.control) {
		const control = row.disabled ? { ...row.control, disabled: row.disabled } : row.control;
		return { ...base, control };
	}
	const render = row.render;
	// A label-only row (no control, no render) is still a legitimate definition: obsidian
	// renders name + desc as a static informational row. Dropping it would make it vanish
	// silently, which is how a typo in a row spec becomes an invisible bug.
	if (!render) return base;
	return { ...base, render: (setting) => asCleanup(render(setting)) };
}

/**
 * Normalises a render callback's return value into a cleanup function or `undefined`.
 *
 * Obsidian stores ANY truthy return as the row's cleanup and calls it on teardown
 * (`v && (e.cleanup = v)` … `t()` in the 1.13.4 bundle). `Setting`'s builder methods are
 * chainable, so a one-expression arrow like `(s) => s.addButton(...)` quietly returns the
 * Setting — truthy, not callable — and every teardown of that page throws a TypeError into
 * the console. Callers should use a block body; this makes it impossible to get wrong
 * either way.
 */
function asCleanup(value: void | (() => void)): (() => void) | undefined {
	return typeof value === 'function' ? value : undefined;
}

/**
 * The live preview, as a nameless unsearchable row CSS turns into a full-width panel.
 *
 * SC-187 — WHY IT IS NO LONGER DOCKED TO THE BOTTOM OF THE VIEWPORT.
 *
 * SC-131 made this row `position: sticky; bottom: 0`, so it rode the bottom edge of the
 * scroll viewport while the rows scrolled behind it. The dock is what forced the two
 * defects Scott filed SC-187 for, and they are the same defect twice:
 *
 *  1. A pane that floats over a scrolling page has to be BOUNDED, so the preview host
 *     carried `max-height: min(22rem, 40vh); overflow: auto` — a second scroller inside
 *     obsidian's `.vertical-tab-content`. Measured on the Statblock display page: a
 *     350 px porthole over 3646 px of statblock, with obsidian's own 938/1183 scroller
 *     around it. On the Featureblock page — which does not scroll at all — the ONLY
 *     scrollbar on screen belonged to the preview.
 *  2. Being opaque and floating, it COVERED the rows it was previewing. On Typography it
 *     sat across the middle of the "Card size" row's description and hid the three
 *     SC-185 sliders entirely, which is the "floating card in a hole" reading.
 *
 * In-flow at the end of the page answers both without a cap: it can never occlude a row
 * because it is never out of flow, and with no bound it sizes to its content, so
 * obsidian's scroller is the only scroller in the pane.
 *
 * FIRST vs. LAST was measured before it was decided. Leading the page reads well — the
 * sample answers "what does this page affect?" on arrival — but the abridged statblock is
 * still ~1600px, which pushes every row of the Statblock display page off the first
 * screen. A settings page's job is its settings; the preview is the confirmation you
 * glance at after moving one. So it stays last, where the rows are immediately usable and
 * the panel's head sits just under them (the Statblock page's rows total ~780px against a
 * ~940px viewport, so the sample starts on the first screen anyway) — which is the
 * position the dock was faking, minus the occlusion and minus the porthole.
 *
 * The cost, stated plainly: on a page taller than the viewport, changing a row near the
 * top no longer happens with the sample on screen. That is a real trade against a fake
 * one — the docked sample was cropped to its header and stat rail, so a Feature style /
 * Feature columns / Keyword display change was already happening entirely below its own
 * fold. A sample you can read beats a sample you can see a tenth of.
 */
function previewDefinition(section: NavSection): SettingDefinition | null {
	const renderPreview = section.renderPreview;
	if (!renderPreview) return null;
	return {
		name: '',
		searchable: false,
		// The teardown rides obsidian's cleanup contract: whatever the mount returns is
		// what obsidian calls when this row goes away, so the preview's Component (and its
		// pref subscriptions) is released per MOUNT rather than per definitions build.
		// Definitions are built once and replayed across every open/close of the settings
		// window, so anything released at build time would never come back.
		render: (setting) => {
			setting.settingEl.addClass(PREVIEW_CLS);
			setting.infoEl.remove();
			return asCleanup(renderPreview(setting.controlEl));
		},
	};
}

/** The section's reset, as a trailing action row.
 *
 *  Deliberately a row and not a group-header `extraButtons` icon: with D-pages the page
 *  TITLE already states the section, so a group heading repeating it would be redundant
 *  chrome — and a named row states what the button resets, which a bare icon does not. */
function resetDefinition(section: NavSection): SettingDefinition | null {
	const onReset = section.onReset;
	if (!onReset) return null;
	return {
		// Named after the section rather than "Reset this section": these rows are in the
		// global settings search, where nine identical "Reset this section" hits would be
		// indistinguishable.
		name: `Reset ${section.label.toLowerCase()}`,
		desc: `Restore every ${section.label.toLowerCase()} setting to its default.`,
		aliases: [section.label, 'reset', 'defaults'],
		action: () => onReset(),
	};
}

/**
 * The nested "Advanced" page holding a section's secondary rows.
 *
 * Obsidian has no declarative `<details>`, so the SC-112 disclosure needed a new shape.
 * A nested page beats a `visible` predicate: it is native chrome consistent with the rest
 * of D-pages, it needs no invented "show advanced options" pseudo-setting to drive the
 * predicate, and its rows stay individually indexed — so searching "monospace" still finds
 * the row even though it now lives one level down.
 */
function advancedPage(rows: readonly SettingDefinition[]): SettingDefinitionPage | null {
	if (!rows.length) return null;
	return { type: 'page', name: 'Advanced', items: [...rows] };
}

/** One section → one navigable page. */
function toPage(section: NavSection): SettingDefinitionPage | null {
	const primary: SettingDefinition[] = [];
	const advanced: SettingDefinition[] = [];
	for (const row of section.rows) {
		const definition = toDefinition(row, section);
		if (definition) (row.advanced ? advanced : primary).push(definition);
	}
	// SettingGroupItem, not SettingDefinitionItem: a group may hold settings and pages
	// (the nested Advanced page) but not further groups.
	const items: SettingGroupItem[] = [...primary];
	const nested = advancedPage(advanced);
	if (nested) items.push(nested);
	const reset = resetDefinition(section);
	if (reset) items.push(reset);
	// SC-187 keeps the preview LAST — a settings page's job is its settings, and a
	// ~1600px sample above them would push every row off the first screen. What changed
	// is that it is now IN FLOW there instead of floating over the rows; see
	// previewDefinition.
	const preview = previewDefinition(section);
	if (preview) items.push(preview);
	if (!items.length) return null;
	// Everything on the page lives in one classed group, so the preview panel and the rows
	// share one container and one background — the panel reads as the top of the settings
	// card rather than as something dropped on top of it. The group carries no heading:
	// the page title is already the section name.
	const group: SettingDefinitionGroup = {
		type: 'group',
		cls: `${PAGE_CLS} ${PAGE_CLS}--${section.id}`,
		items,
	};
	return { type: 'page', name: section.label, items: [group] };
}

/**
 * The whole settings tab: a page per section, plus the global reset.
 *
 * @param sections the model built by SettingsTab
 * @param onResetAll footer action; omitted when there are no preferences to reset
 */
export function toSettingDefinitions(
	sections: readonly NavSection[],
	onResetAll?: () => void,
): SettingDefinitionItem[] {
	const items: SettingDefinitionItem[] = [];
	for (const section of sections) {
		const page = toPage(section);
		if (page) items.push(page);
	}
	if (onResetAll) {
		items.push({
			name: 'Reset all preferences',
			desc: 'Restore every Draw Steel Elements preference to its default.',
			aliases: ['reset', 'defaults'],
			action: () => onResetAll(),
		});
	}
	return items;
}
