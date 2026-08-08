// src/views/settingsDeclarative.ts — SC-131 SPIKE (ships nothing; gated off).
//
// Obsidian 1.13.0 added a DECLARATIVE settings API: a PluginSettingTab may override
// `getSettingDefinitions()` and return a tree of definitions instead of painting DOM in
// `display()`. Obsidian then renders the rows, persists the values, and — the reason this
// spike exists — INDEXES them into the native settings search, so a plugin's settings are
// findable from the settings window's own search field alongside core settings.
//
// The question this file answers is not "can we rewrite the settings tab declaratively"
// but "is the SC-131 nav model already the right input for it". The shell (settingsShell.ts)
// renders a `NavSection[]` model; this is a THIRD RENDERER over that exact same model —
// no second source of truth, no parallel row list. `toSettingDefinitions(sections)` walks
// the same array `renderSettingsShell` walks:
//
//   NavSection  → { type: 'group', heading, extraButtons: [reset], items }
//   NavRow      → { name, desc, aliases, control }   when the row carries a native binding
//               → { name, desc, aliases, render }    otherwise (the row's own thunk)
//
// Both row shapes extend the same searchable base, so a `render` row is indexed by its
// name/desc/aliases exactly like a `control` row — the custom widget inside it is opaque
// to search, the row is not. That is what makes the render fraction cheap.
//
// The plugin builds against obsidian 1.8.7 typings, which predate all of this, so the
// definition shapes below are a hand-written structural subset of the 1.13.1 `.d.ts`
// (SettingDefinitionBase / SettingDefinitionControl / SettingDefinitionRender /
// SettingDefinitionGroup). A real migration replaces this block with a typings bump.
import type { ExtraButtonComponent, Setting } from 'obsidian';
import type { NavRow, NavSection } from '@views/settingsShell';

/** Subset of obsidian 1.13's `SettingControl` union that the DSE catalog needs. */
export type DeclarativeControl =
	| { type: 'toggle'; key: string }
	| { type: 'dropdown'; key: string; options: Record<string, string> }
	| {
		type: 'slider';
		key: string;
		min: number;
		max: number;
		step: number;
		/** 1.13.1: the inline readout beside the thumb — the native home of the
		 *  hand-rolled `.dse-slider-value` span the imperative slider row creates. */
		displayFormat?: (value: number) => string;
	}
	| { type: 'text'; key: string; placeholder?: string };

/** Subset of `SettingDefinitionBase` + the control/render variants. */
export interface DeclarativeSetting {
	name: string;
	desc?: string;
	/** Extra search terms. The shell's search matches a row's owning section label, so
	 *  the section label rides along here to keep parity ("typography" finds the fonts). */
	aliases?: string[];
	searchable?: boolean;
	control?: DeclarativeControl;
	render?: (setting: Setting) => void;
}

/** Subset of `SettingDefinitionGroup`. */
export interface DeclarativeGroup {
	type: 'group';
	heading: string;
	extraButtons?: ((component: ExtraButtonComponent) => unknown)[];
	items: DeclarativeSetting[];
}

export type DeclarativeItem = DeclarativeGroup | DeclarativeSetting;

/**
 * Bridges a NavRow's container thunk into a declarative `render` callback.
 *
 * SPIKE SHAPE, deliberately. `NavRow.render` takes a CONTAINER and constructs its own
 * `Setting` inside it; the declarative API instead hands the callback a Setting that
 * Obsidian owns (and which is NOT yet in the document when `render` runs, so reaching for
 * `parentElement` gets you null). So: let the thunk build its row inside a detached host,
 * then transplant the controls it produced into the row we were given — whose name and
 * desc Obsidian has already populated from the definition's `name`/`desc`.
 *
 * The real migration deletes this function by retyping `NavRow.render` as
 * `(setting: Setting) => void`. That is mechanical rather than invasive: every existing
 * thunk's first statement is already `new Setting(container)`, so each loses one line and
 * Obsidian keeps ownership of the row element — which it wants, for search highlighting
 * and scroll-into-view.
 */
function renderAdapter(row: NavRow): (setting: Setting) => void {
	return (setting) => {
		const host = createDiv();
		row.render(host);
		const control = host.querySelector('.setting-item-control');
		while (control?.firstChild) setting.controlEl.appendChild(control.firstChild);
	};
}

function toDefinition(row: NavRow, section: NavSection): DeclarativeSetting | null {
	// Chrome (the Compendium safety sentence, the sync status line) has no label, so it
	// has nothing to index and no name to render. The shell already treats it as
	// unsearchable; declaratively it is simply omitted.
	if (!row.label) return null;
	const definition: DeclarativeSetting = {
		name: row.label,
		...(row.help ? { desc: row.help } : {}),
		aliases: [section.label, ...(row.aliases ?? [])],
	};
	if (row.control) definition.control = row.control;
	else definition.render = renderAdapter(row);
	return definition;
}

/**
 * The third renderer: the SC-131 nav model as an obsidian 1.13 definition tree.
 *
 * Section headings become native group headings, and the section reset keeps its exact
 * affordance — `SettingDefinitionGroup.extraButtons` is the declarative twin of the
 * `rotate-ccw` extra button `renderSettingsShell` puts on its own headings, and it still
 * calls the same `section.onReset`, which still resets the section's FULL member list.
 */
export function toSettingDefinitions(sections: readonly NavSection[]): DeclarativeItem[] {
	const items: DeclarativeItem[] = [];
	for (const section of sections) {
		const rows = section.rows
			.map((row) => toDefinition(row, section))
			.filter((definition): definition is DeclarativeSetting => definition !== null);
		if (!rows.length) continue;
		const group: DeclarativeGroup = { type: 'group', heading: section.label, items: rows };
		const onReset = section.onReset;
		if (onReset) {
			group.extraButtons = [
				(button: ExtraButtonComponent) =>
					button.setIcon('rotate-ccw').setTooltip('Reset this section to defaults').onClick(onReset),
			];
		}
		items.push(group);
	}
	return items;
}
