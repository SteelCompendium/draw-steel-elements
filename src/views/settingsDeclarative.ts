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
	 *  its own full-width row and never a search hit — it has no name to match on. */
	chrome?: (container: HTMLElement) => void;
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
	 *  settings visibly change an element (see SettingsTab.sectionShowsPreview). */
	renderPreview?: (container: HTMLElement) => void;
}

/** Class on the group wrapping a page's rows — the two-column preview layout hooks it. */
export const PAGE_CLS = 'dse-settings-page';
/** Class on the preview row, so CSS can pull it into the sticky second column. */
export const PREVIEW_CLS = 'dse-settings-preview-row';
/** Class on a chrome row (no name/control), so CSS can let its text span the full width. */
export const CHROME_CLS = 'dse-settings-chrome-row';

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
				chrome(setting.infoEl);
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
	if (row.control) return { ...base, control: row.control };
	const render = row.render;
	if (!render) return null;
	return { ...base, render: (setting) => render(setting) };
}

/** The live preview, as a nameless unsearchable row CSS lifts into the sticky column. */
function previewDefinition(section: NavSection): SettingDefinition | null {
	const renderPreview = section.renderPreview;
	if (!renderPreview) return null;
	return {
		name: '',
		searchable: false,
		render: (setting) => {
			setting.settingEl.addClass(PREVIEW_CLS);
			setting.infoEl.remove();
			renderPreview(setting.controlEl);
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
		name: 'Reset this section',
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
	const preview = previewDefinition(section);
	if (preview) items.push(preview);
	if (!items.length) return null;
	// Everything on the page lives in one classed group, which is what gives the CSS a
	// single grid container holding both the rows and the preview — the two-column,
	// preview-always-visible layout. The group carries no heading: the page title is
	// already the section name.
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
