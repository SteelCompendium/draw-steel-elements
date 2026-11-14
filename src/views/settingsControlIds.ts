// SC-440 — stable control ids for the plugin settings tab (the SC-408 `data-dse-control` scheme, see
// src/framework/kit/controlId.ts). Attribute names only; nothing here renders or behaves.
//
// WHY A STAMPER AND NOT THE KIT FACTORIES' `control` OPTION. Obsidian 1.13+ renders every native
// `control` row, every `action` row and every page link ITSELF (toggle, dropdown, slider, text, the reset
// rows, the navigable page rows): the definition schema carries no class, id or attribute hook, so a
// definition cannot say "stamp this". What it does offer is a `visible` predicate that obsidian evaluates
// right after it has rendered the row, plus the tab's `getElementForDefinition(def)` (see SettingsTab's
// `stampDefinition`). The rows our own `render` callbacks build (the preset, the six font pickers, the Sync
// and Check buttons) are stamped inline where they are made.
//
// Naming: `settings.<what>[.<part>]`, kebab-case. A descriptor's id comes from its KEY, so adding a pref to
// the catalog needs no id edit: `reduceMotion` -> `settings.reduce-motion`, `sbFeatureStyle` ->
// `settings.sb-feature-style`. The e2e manifest (e2e/manifest/settings-tab.ts) is the registry of valid ids.

/** The id prefix every settings-tab control carries. */
export const SETTINGS_ID_PREFIX = 'settings.';

/** `reduceMotion` -> `reduce-motion`. */
function kebab(key: string): string {
	return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/** The control id of a descriptor-driven row (toggle, dropdown, slider, or a font picker's dropdown). */
export function prefControlId(key: string): string {
	return `${SETTINGS_ID_PREFIX}${kebab(key)}`;
}

/** A font picker's two extra nodes: its free-text field (shown by "Custom…") and its "List installed fonts" button. */
export function fontCustomId(key: string): string {
	return `${prefControlId(key)}.custom`;
}
export function fontListId(key: string): string {
	return `${prefControlId(key)}.list`;
}

/** The Statblock display page's Preset dropdown (derived, not a descriptor). */
export const PRESET_ID = `${SETTINGS_ID_PREFIX}sb-preset`;

/** The index row that opens a section's page (`section.id` is the slug: `statblock-display`). */
export function pageLinkId(sectionId: string): string {
	return `${SETTINGS_ID_PREFIX}page.${sectionId}`;
}
/** The page's nested "Advanced" page link. */
export function advancedLinkId(sectionId: string): string {
	return `${SETTINGS_ID_PREFIX}advanced.${sectionId}`;
}
/** The page's "Reset <section>" action row. */
export function resetId(sectionId: string): string {
	return `${SETTINGS_ID_PREFIX}reset.${sectionId}`;
}
/** The index's trailing "Reset all preferences" action row. */
export const RESET_ALL_ID = `${SETTINGS_ID_PREFIX}reset-all`;

/** The hand-written operational rows (data.json fields, not descriptors). */
export const OPERATIONAL_IDS = {
	destination: `${SETTINGS_ID_PREFIX}compendium.destination`,
	release: `${SETTINGS_ID_PREFIX}compendium.release`,
	locale: `${SETTINGS_ID_PREFIX}compendium.locale`,
	sync: `${SETTINGS_ID_PREFIX}compendium.sync`,
	check: `${SETTINGS_ID_PREFIX}compendium.check`,
	sccWebFallback: `${SETTINGS_ID_PREFIX}links.scc-web-fallback`,
	defaultImage: `${SETTINGS_ID_PREFIX}initiative.default-image`,
} as const;

/** Which part of a rendered row carries a control's id. `row` = the row element itself (page links, action rows). */
export type StampTarget = 'row' | 'toggle' | 'dropdown' | 'text' | 'slider' | 'file' | 'file-clear';

/** How to find each target inside obsidian's rendered `.setting-item` (1.13 / 1.14 DOM, measured in 1.14.4). A dropdown renders
 *  a second, aria-hidden `select.is-measuring` beside the real one: never that. */
export const STAMP_SELECTORS: Readonly<Record<Exclude<StampTarget, 'row'>, string>> = {
	toggle: '.checkbox-container',
	dropdown: 'select.dropdown:not(.is-measuring)',
	text: 'input[type="text"]',
	slider: 'input[type="range"]',
	// A `file` control is a combobox button in 1.14.4 (click opens the file suggester; `mod-clearable` adds a clear X). An older
	// build that renders a plain text field instead is still stamped.
	file: '.combobox-button, input[type="text"]',
	'file-clear': '.combobox-clear-button',
};

/** The node(s) a native `control` type is stamped on, as [id, target] pairs. Every control type has a main node; a `file` control
 *  adds its clear button (`<id>.clear`, shown only while a path is set). */
export function stampTargetsOf(controlType: string, id: string): Array<[string, StampTarget]> {
	switch (controlType) {
		case 'toggle':
			return [[id, 'toggle']];
		case 'dropdown':
			return [[id, 'dropdown']];
		case 'slider':
			return [[id, 'slider']];
		case 'file':
			return [[id, 'file'], [`${id}.clear`, 'file-clear']];
		default:
			return [[id, 'text']]; // text and folder render an <input type="text">
	}
}
