// src/views/SettingsTab.ts — D4 §4 (Plan 13): the composed settings tab.
//
// Two owners, one tab: the PREF SECTIONS are GENERATED from the descriptor list
// (adding a pref = adding a descriptor in src/prefs/catalog.ts — no hand-wiring),
// then the OPERATIONAL sections (Compendium sync, Links, Initiative tracker) are
// hand-written — F2's territory (F2 §3.4 Task 11 reworked the old Compendium
// downloader section wholesale: sentence-case labels, a manifest-driven sync status
// line, Sync/Check-for-updates buttons, and the new Links section for sccWebFallback).
//
// Live apply: every control's onChange calls prefs.set(); set() notifies
// subscribers synchronously (Task 1), so prefs.reflect() re-stamps every mounted
// element root and CSS reflows behind the open settings dialog — no Apply button,
// no re-render. This replaces the D3 temporary commands (dse-cycle-theme,
// dse-toggle-print-preview), deleted from main.ts in this same task.
import { App, Component, Notice, PluginSettingTab, Setting, type TextComponent } from 'obsidian';
import DrawSteelAdmonitionPlugin from 'main';
import type { PreferenceStore, PrefDescriptor, DsePrefs } from '@/framework/seams/prefs';
import {
	GROUP_ORDER,
	applySbPreset,
	deriveSbPreset,
	prefUi,
	type PrefUi,
	type SbPresetId,
} from '@/prefs/catalog';
import { snap, type ScaleRange } from '@/prefs/scale';
import { mountSettingsPreview } from '@views/SettingsPreview';
import {
	MULTI_SECTION_MODES,
	SETTINGS_NAV_MODE,
	renderSettingsShell,
	type NavRow,
	type NavSection,
	type SettingsNavMode,
} from '@views/settingsShell';
import {
	toSettingDefinitions,
	type DeclarativeControl,
	type DeclarativeItem,
} from '@views/settingsDeclarative';

// Local Font Access API (SC-112 Task 1 spike, Outcome A): queryLocalFonts() works
// unconditionally in Obsidian's Electron — no permission prompt — but it still
// requires a user-activation gesture, hence the explicit "List installed fonts"
// click affordance on the font rows (never called at render time). Not yet in
// lib.dom, so declared here; optional for feature detection.
declare global {
	interface Window {
		queryLocalFonts?: () => Promise<{ family: string }[]>;
	}
}

/** Dropdown value reserved for the free-text "Custom…" entry of a 'font' row —
 *  never persisted (the text input's raw value is what saves). */
const CUSTOM_FONT = '__custom__';

/** The Preset row's description — hoisted so it is BOTH the rendered desc and the
 *  row's search key (SC-131), never two copies that can drift. */
const PRESET_HELP =
	'A bundle of the statblock options below. Adjusting any single option re-derives "custom".';

/** Section label → stable nav id. */
function slugify(label: string): string {
	return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** A hand-written (non-descriptor) settings row. The label/help are BOTH the rendered
 *  name/desc and the row's search keys — one source, so they cannot drift apart the way
 *  a parallel search index would. Sentence-case lint can't inspect a variable passed to
 *  setName/setDesc; the literals live at the call sites below, where it can. */
function opRow(label: string, help: string, build: (setting: Setting) => void): NavRow {
	return {
		label,
		help,
		render: (container) => build(new Setting(container).setName(label).setDesc(help)),
	};
}

/** Chrome (an explanatory paragraph, a status line): rendered in the unfiltered views,
 *  never a search hit — it has no label to match on. */
function opChrome(render: (container: HTMLElement) => void): NavRow {
	return { render };
}

/** Structural slice of DropdownComponent the preset re-derivation needs. */
interface ValueControl {
	setValue(value: string): unknown;
}

export class DseSettingTab extends PluginSettingTab {
	plugin: DrawSteelAdmonitionPlugin;
	/** Owns per-display() mounted children (the Task 6 statblock preview);
	 *  recycled on every display(), unloaded on hide(). */
	private displayOwner: Component | null = null;
	private presetDropdown: ValueControl | null = null;
	/** SC-112 Task 8: families fetched by "List installed fonts" (null = never
	 *  fetched — the affordance is still offered; [] = fetch failed/denied — the
	 *  curated list silently stands). Kept for the tab's lifetime: the installed
	 *  set doesn't change mid-session, and every font row shares one fetch. */
	private installedFonts: readonly string[] | null = null;
	/** SC-131: which candidate shell renders. Defaults to the shipped mode; writable so
	 *  the renderer tests and the evidence capture can drive all four against identical
	 *  content without a user-facing setting. */
	navMode: SettingsNavMode = SETTINGS_NAV_MODE;
	/** SC-131 session memory (tab instance lifetime — deliberately NOT persisted to
	 *  data.json): survives the display() re-renders that a reset, a preset pick or the
	 *  installed-fonts fetch trigger. */
	private activeSectionId: string | null = null;
	private searchQuery = '';
	/** SC-131 declarative SPIKE — OFF, so this ships nothing. `getSettingDefinitions()`
	 *  returning an empty array is exactly what obsidian ≤1.12 does implicitly, and on
	 *  1.13+ an empty array is the documented signal to fall through to `display()`. The
	 *  evidence harness flips it at runtime (like `navMode`) and calls `update()`. */
	declarativeSpike = false;

	constructor(app: App, plugin: DrawSteelAdmonitionPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// —— SC-131 declarative SPIKE (obsidian 1.13+; see settingsDeclarative.ts) ——
	//
	// The 1.13 entry point. Obsidian calls it on every `update()` AND once when the tab
	// is registered — that registration call is what puts our rows in the native settings
	// search index, before the user has ever opened our tab. Non-empty ⇒ obsidian renders
	// from the definitions and SKIPS display(); empty ⇒ display() runs as it always has,
	// which is both the ≤1.12 behaviour and this spike's default.
	//
	// Not declared as an override: the 1.8.7 typings the plugin builds against predate
	// PluginSettingTab.getSettingDefinitions, so to the compiler this is a new method.
	getSettingDefinitions(): DeclarativeItem[] {
		if (!this.declarativeSpike) return [];
		const prefs = this.plugin.frameworkV2?.services.prefs;
		return toSettingDefinitions([
			...(prefs ? this.buildPrefSections(prefs) : []),
			...this.buildOperationalSections(),
		]);
	}

	/** Declarative control bindings read through here rather than off
	 *  `this.plugin.settings[key]`. DSE keeps its prefs in the PreferenceStore, and this
	 *  is also where the two representation mismatches are absorbed: a 'on'|'off' string
	 *  pref presents to a native toggle as a boolean. */
	getControlValue(key: string): unknown {
		const prefs = this.plugin.frameworkV2?.services.prefs;
		if (!prefs) return undefined;
		const descriptor = prefs.descriptors().find((candidate) => candidate.key === key);
		if (!descriptor) return undefined;
		const value = prefs.get(descriptor.key);
		if (prefUi(descriptor)?.control === 'toggle' && typeof descriptor.default === 'string') {
			return value === 'on';
		}
		return value;
	}

	/** The write half. Crucially this routes through `prefs.set()`, which notifies
	 *  subscribers synchronously — so LIVE APPLY survives the move to native controls
	 *  unchanged, and obsidian's automatic persistence rides on top of it. */
	setControlValue(key: string, value: unknown): void | Promise<void> {
		const prefs = this.plugin.frameworkV2?.services.prefs;
		if (!prefs) return;
		const descriptor = prefs.descriptors().find((candidate) => candidate.key === key);
		if (!descriptor) return;
		const ui = prefUi(descriptor);
		let next = value;
		if (ui?.control === 'toggle' && typeof descriptor.default === 'string') {
			next = value ? 'on' : 'off';
		} else if (ui?.control === 'slider') {
			next = snap(value, this.scaleRange(descriptor, ui));
		}
		return prefs.set(descriptor.key, next as DsePrefs[keyof DsePrefs]);
	}

	/** The slider's numeric contract, shared by the imperative row and the native one. */
	private scaleRange(descriptor: PrefDescriptor, ui: PrefUi): ScaleRange {
		const fallback = typeof descriptor.default === 'number' ? descriptor.default : 1;
		return {
			min: ui.min ?? fallback,
			max: ui.max ?? fallback,
			step: ui.step ?? 1,
			default: fallback,
		};
	}

	/** The descriptor's NATIVE binding, or undefined when obsidian has no control type
	 *  that can express the row (the six font pickers: a curated dropdown, a revealed
	 *  free-text field and a "list installed fonts" button in one row). */
	private nativeControl(descriptor: PrefDescriptor, ui: PrefUi): DeclarativeControl | undefined {
		const key = String(descriptor.key);
		switch (ui.control) {
			case 'toggle':
				return { type: 'toggle', key };
			case 'select':
				return {
					type: 'dropdown',
					key,
					options: Object.fromEntries((ui.options ?? []).map((o) => [o.value, o.label])),
				};
			case 'text':
				return { type: 'text', key };
			case 'slider': {
				const range = this.scaleRange(descriptor, ui);
				// 1.13.1's displayFormat is the native home of the `.dse-slider-value`
				// percent span the imperative row hand-builds — same readout, no CSS.
				return {
					type: 'slider',
					key,
					min: range.min,
					max: range.max,
					step: range.step,
					displayFormat: (value: number) => `${Math.round(value * 100)}%`,
				};
			}
			default:
				return undefined; // 'font'
		}
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.presetDropdown = null;
		this.recycleOwner(true);
		const prefs = this.plugin.frameworkV2?.services.prefs;
		const sections = [
			...(prefs ? this.buildPrefSections(prefs) : []),
			...this.buildOperationalSections(),
		];
		renderSettingsShell(containerEl, {
			mode: this.navMode,
			sections,
			activeId: this.activeSectionId,
			query: this.searchQuery,
			onActiveChange: (id) => {
				this.activeSectionId = id;
			},
			onQueryChange: (query) => {
				this.searchQuery = query;
			},
			// Every body (re)render drops the previous render's mounted children — the
			// live preview and its pref subscriptions — and opens a fresh owner. The
			// preset dropdown reference goes with it: a tab switch can un-render the
			// Statblock section, and a stale handle must not be written to.
			recycle: () => {
				this.presetDropdown = null;
				this.recycleOwner(true);
			},
			renderFooter: prefs ? (container) => this.renderResetAll(container, prefs) : undefined,
		});
	}

	hide(): void {
		this.recycleOwner(false);
	}

	private recycleOwner(recreate: boolean): void {
		this.displayOwner?.unload();
		this.displayOwner = null;
		if (recreate) {
			this.displayOwner = new Component();
			this.displayOwner.load();
		}
	}

	// —— D4 §4.1: one loop drives the whole pref UI. SC-131 turned the loop's OUTPUT
	// from "rows appended to containerEl" into a NavSection model the shell renders in
	// whichever mode is active — the descriptor list is still the only input. ——
	private buildPrefSections(prefs: PreferenceStore): NavSection[] {
		const groups = new Map<string, PrefDescriptor[]>();
		for (const descriptor of prefs.descriptors()) {
			const ui = prefUi(descriptor);
			if (!ui || ui.hidden) continue; // hidden = consumer (D5/F2) not shipped
			let members = groups.get(ui.group);
			if (!members) groups.set(ui.group, (members = []));
			members.push(descriptor);
		}
		const sections: NavSection[] = [];
		for (const groupName of GROUP_ORDER) {
			const members = groups.get(groupName);
			if (!members?.length) continue;
			const rows: NavRow[] = [];
			if (groupName === 'Statblock display') {
				rows.push({
					label: 'Preset',
					help: PRESET_HELP,
					render: (container) => this.renderPresetControl(container, prefs),
				});
			}
			for (const descriptor of members) {
				const ui = prefUi(descriptor);
				if (!ui) continue;
				rows.push({
					label: ui.label,
					help: ui.help,
					// SC-112 Task 8: secondary rows collapse behind the section's
					// "Advanced" disclosure. The section reset below still covers them —
					// it iterates `members`, not the rows the view happens to show.
					advanced: ui.advanced,
					// SC-131 declarative SPIKE: additive metadata the imperative shell
					// ignores. `control` present ⇒ obsidian 1.13 renders and persists the
					// row itself; absent ⇒ it falls back to the same `render` thunk below.
					control: this.nativeControl(descriptor, ui),
					render: (container) => this.renderRow(container, prefs, descriptor),
				});
			}
			sections.push({
				id: slugify(groupName),
				label: groupName,
				onReset: () => void this.resetDescriptors(prefs, members),
				rows,
				// The live statblock preview belongs wherever the settings on screen can
				// visibly change it — i.e. any group holding a REFLECTED descriptor (an
				// `attr` in the data-dse-* vocabulary or a `css` custom property). That is
				// Appearance, Typography and Statblock display today, derived rather than
				// listed, so a future reflected group inherits it for free. In the modes
				// that put every section on screen at once it would mount three times, so
				// there it stays where it has always been: under Statblock display.
				renderPreview: this.sectionShowsPreview(groupName, members)
					? (container) => {
						if (this.displayOwner) mountSettingsPreview(container, this.plugin, this.displayOwner);
					}
					: undefined,
			});
		}
		return sections;
	}

	private sectionShowsPreview(groupName: string, members: readonly PrefDescriptor[]): boolean {
		if (MULTI_SECTION_MODES.includes(this.navMode)) return groupName === 'Statblock display';
		return members.some((descriptor) => descriptor.attr !== undefined || descriptor.css !== undefined);
	}

	private renderResetAll(containerEl: HTMLElement, prefs: PreferenceStore): void {
		new Setting(containerEl).addButton((button) =>
			button
				.setButtonText('Reset all preferences')
				.onClick(() =>
					void this.resetDescriptors(
						prefs,
						prefs.descriptors().filter((descriptor) => prefUi(descriptor) !== undefined),
					),
				),
		);
	}

	private async resetDescriptors(
		prefs: PreferenceStore,
		descriptors: readonly PrefDescriptor[],
	): Promise<void> {
		try {
			for (const descriptor of descriptors) {
				await prefs.set(descriptor.key, descriptor.default);
			}
		} catch (error) {
			console.error('Draw Steel Elements: failed to reset preferences', error);
		}
		this.display();
	}

	// —— D4 §3.2: the preset bundle dropdown (derived label, never stored) ——
	private renderPresetControl(containerEl: HTMLElement, prefs: PreferenceStore): void {
		new Setting(containerEl)
			.setName('Preset')
			.setDesc(PRESET_HELP)
			.addDropdown((dropdown) => {
				dropdown.addOption('steel', 'Steel card');
				dropdown.addOption('sourcebook', 'Sourcebook');
				dropdown.addOption('index', 'Index card');
				dropdown.addOption('custom', 'Custom');
				dropdown.setValue(deriveSbPreset(prefs));
				dropdown.onChange((value) => {
					if (value === 'custom') return; // derived label, not a settable state
					applySbPreset(prefs, value as SbPresetId)
						.then(() => this.display())
						.catch((error) =>
							console.error('Draw Steel Elements: failed to apply statblock preset', error),
						);
				});
				this.presetDropdown = dropdown;
			});
	}

	private renderRow(
		containerEl: HTMLElement,
		prefs: PreferenceStore,
		descriptor: PrefDescriptor,
	): void {
		const ui = prefUi(descriptor);
		if (!ui) return;
		const setting = new Setting(containerEl).setName(ui.label);
		if (ui.help) setting.setDesc(ui.help);
		const save = (value: DsePrefs[keyof DsePrefs]): void => {
			prefs
				.set(descriptor.key, value)
				.catch((error) =>
					console.error(
						`Draw Steel Elements: failed to save preference "${String(descriptor.key)}"`,
						error,
					),
				);
			if (ui.inPreset) this.presetDropdown?.setValue(deriveSbPreset(prefs));
		};
		switch (ui.control) {
			case 'toggle': {
				// A toggle over a string-typed pref is the 'on'|'off' mapping (PrefUi
				// doc): checked ⇔ 'on'. Boolean prefs map directly.
				const onOff = typeof descriptor.default === 'string';
				setting.addToggle((toggle) =>
					toggle
						.setValue(onOff ? prefs.get(descriptor.key) === 'on' : prefs.get(descriptor.key) === true)
						.onChange((value) =>
							save(onOff ? (value ? 'on' : 'off') : value),
						),
				);
				break;
			}
			case 'select': {
				setting.addDropdown((dropdown) => {
					for (const option of ui.options ?? []) dropdown.addOption(option.value, option.label);
					dropdown
						.setValue(String(prefs.get(descriptor.key)))
						.onChange((value) => save(value));
				});
				break;
			}
			case 'text': {
				setting.addText((text) =>
					text
						.setValue(String(prefs.get(descriptor.key)))
						.onChange((value) => save(value)),
				);
				break;
			}
			case 'font': {
				this.renderFontControl(setting, prefs, descriptor, ui, save);
				break;
			}
			case 'slider': {
				// The range rides the descriptor's ui (Task 7 mirrored snap()'s
				// min/max/step there) + the descriptor's own numeric default — no
				// per-key knowledge here. Values pass through snap() before save().
				const range = this.scaleRange(descriptor, ui);
				const current = snap(prefs.get(descriptor.key), range);
				const pct = (value: number): string => `${Math.round(value * 100)}%`;
				// The site's set-scale-val percent readout (settings-panel.js:531-541),
				// created before the slider so it sits to its left in the control cell.
				const valueEl = setting.controlEl.createSpan({
					cls: 'dse-slider-value',
					text: pct(current),
				});
				setting.addSlider((slider) =>
					slider
						.setLimits(range.min, range.max, range.step)
						.setValue(current)
						.setDynamicTooltip()
						.onChange((value) => {
							const snapped = snap(value, range);
							valueEl.setText(pct(snapped));
							save(snapped);
						}),
				);
				break;
			}
		}
	}

	// —— SC-112 Task 8: the 'font' control — curated dropdown + Custom… free text
	// + the user-activation "List installed fonts" affordance (Task 1 Outcome A) ——
	private renderFontControl(
		setting: Setting,
		prefs: PreferenceStore,
		descriptor: PrefDescriptor,
		ui: PrefUi,
		save: (value: DsePrefs[keyof DsePrefs]) => void,
	): void {
		// ui.options already leads with the uniform "Default (Obsidian vault fonts)"
		// sentinel ('') followed by the slot's curated entries (catalog.ts); installed
		// families (once listed) append after those, deduped; Custom… is always last.
		const options = [...(ui.options ?? [])];
		const known = new Set(options.map((option) => option.value));
		for (const family of this.installedFonts ?? []) {
			if (known.has(family)) continue;
			known.add(family);
			options.push({ value: family, label: family });
		}
		const current = String(prefs.get(descriptor.key));
		const isListed = known.has(current);
		let customText: TextComponent | null = null;
		const showCustom = (show: boolean): void =>
			customText?.inputEl.toggleClass('dse-hidden', !show);
		setting.addDropdown((dropdown) => {
			for (const option of options) dropdown.addOption(option.value, option.label);
			dropdown.addOption(CUSTOM_FONT, 'Custom…');
			dropdown.setValue(isListed ? current : CUSTOM_FONT);
			dropdown.onChange((value) => {
				if (value === CUSTOM_FONT) {
					// Nothing saves yet — the revealed text input's edits do.
					showCustom(true);
					return;
				}
				showCustom(false);
				customText?.setValue(value);
				save(value);
			});
		});
		setting.addText((text) => {
			customText = text;
			text.setPlaceholder('Font family');
			text.setValue(current);
			text.inputEl.toggleClass('dse-hidden', isListed);
			// Raw value saves through the normal path — sanitization happens in
			// toCss (fontStacks.sanitizeFamily); obviously-empty input rejects to
			// the '' default.
			text.onChange((value) => save(value.trim() === '' ? '' : value));
		});
		if (this.installedFonts === null && 'queryLocalFonts' in window) {
			setting.addExtraButton((button) =>
				button
					.setIcon('type')
					.setTooltip('List installed fonts')
					.onClick(() => void this.listInstalledFonts()),
			);
		}
	}

	/** Fetches the local font families (inside the click's user activation) and
	 *  re-renders so every font row's dropdown includes them. Failure or denial
	 *  falls back to the curated list silently (installedFonts = []). */
	private async listInstalledFonts(): Promise<void> {
		try {
			const fonts = (await window.queryLocalFonts?.()) ?? [];
			this.installedFonts = [...new Set(fonts.map((font) => font.family))].sort((a, b) =>
				a.localeCompare(b),
			);
		} catch {
			this.installedFonts = [];
		}
		this.display();
	}

	// —— Operational sections: F2 §3.4 rework (Task 11) — sentence case throughout,
	// setHeading() sections instead of raw h3s, a manifest-driven sync status line,
	// and Sync/Check-for-updates buttons wired to the Task 9/10 sync engine.
	// SC-131 lifted each row into the same NavSection model the generated pref groups
	// use, so the shell navigates and SEARCHES the whole tab rather than only its
	// descriptor-driven half. Rows with no `label` are chrome (the safety sentence, the
	// sync status line): rendered in the unfiltered views, never a search hit. ——
	private buildOperationalSections(): NavSection[] {
		const compendium: NavSection = {
			id: 'compendium',
			label: 'Compendium',
			rows: [
				opChrome((container) => {
					container.createEl('p', {
						// F2 Task 10: the sync engine (CompendiumSyncService.applySync) is
						// non-destructive by construction — it never deletes or overwrites
						// content it didn't install itself. This replaces the old
						// "WIPED CLEAN"-style warning, which was actively false/scary as
						// of that change.
						text: 'The compendium syncs into a folder in your vault. Only files installed by the plugin are updated or removed — your own notes in that folder are never touched.',
					});
				}),
				opRow('Destination folder', 'Vault folder the compendium is synced into.', (setting) =>
					setting.addText((text) =>
						text
							// Literal default vault folder name
							// (DEFAULT_SETTINGS.compendiumDestinationDirectory), not prose;
							// lowercasing would misrepresent the actual folder created.
							// eslint-disable-next-line obsidianmd/ui/sentence-case
							.setPlaceholder('DS Compendium')
							.setValue(this.plugin.settings.compendiumDestinationDirectory)
							.onChange(async (value) => {
								this.plugin.settings.compendiumDestinationDirectory = value;
								await this.plugin.saveSettings();
							}),
					),
				),
				opRow(
					'Release',
					'Specific data-unified release tag to sync. Leave empty for the latest release.',
					(setting) =>
						setting.addText((text) =>
							text
								.setPlaceholder('Latest')
								.setValue(this.plugin.settings.compendiumReleaseTag ?? '')
								.onChange(async (value) => {
									this.plugin.settings.compendiumReleaseTag = value;
									await this.plugin.saveSettings();
								}),
						),
				),
				// "English" is a language proper noun; lowercasing it would be a grammar
				// error, not a fix.
				opRow('Locale', 'Compendium language. Only English is published today.', (setting) =>
					setting.addDropdown((dropdown) =>
						dropdown
							.addOption('en', 'English')
							.setValue(this.plugin.settings.compendiumLocale)
							.onChange(async (value) => {
								this.plugin.settings.compendiumLocale = value;
								await this.plugin.saveSettings();
							}),
					),
				),
				opChrome((container) => {
					const statusEl = container.createEl('p', {
						cls: 'ds-compendium-status',
						text: 'Loading sync status…',
					});
					void this.renderCompendiumStatus(statusEl);
				}),
				opRow(
					'Sync compendium',
					'Download the selected release and update the files the plugin manages.',
					(setting) =>
						setting
							.addButton((button) =>
								button
									.setButtonText('Sync')
									.setCta()
									.onClick(() => {
										void this.plugin.syncCompendium();
									}),
							)
							.addButton((button) =>
								button.setButtonText('Check for updates').onClick(async () => {
									try {
										const result = await this.plugin.syncService.checkForUpdates();
										new Notice(
											result.upToDate
												? `Compendium is up to date (${result.latestTag}).`
												: `Update available: ${result.latestTag} (installed: ${result.installedTag ?? 'none'}).`,
										);
									} catch (error) {
										const message = error instanceof Error ? error.message : String(error);
										new Notice(`Update check failed — ${message}`);
									}
								}),
							),
				),
			],
		};

		const links: NavSection = {
			id: 'links',
			label: 'Links',
			rows: [
				opRow(
					'Fall back to steelcompendium.io links',
					'When an SCC link is not found in your vault, link to its steelcompendium.io page instead. Navigation happens only on click.',
					(setting) =>
						setting.addToggle((toggle) =>
							toggle.setValue(this.plugin.settings.sccWebFallback).onChange(async (value) => {
								this.plugin.settings.sccWebFallback = value;
								await this.plugin.saveSettings();
							}),
						),
				),
			],
		};

		const initiative: NavSection = {
			id: 'initiative-tracker',
			label: 'Initiative tracker',
			rows: [
				opRow(
					'Default creature image path',
					'Default image to use for creatures in the initiative tracker if not specified.',
					(setting) =>
						setting.addText((text) =>
							text
								.setPlaceholder('path/to/image.png')
								.setValue(this.plugin.settings.defaultImagePath)
								.onChange(async (value) => {
									this.plugin.settings.defaultImagePath = value;
									await this.plugin.saveSettings();
								}),
						),
				),
			],
		};

		return [compendium, links, initiative];
	}

	/** F2 Task 11: renders the manifest-driven "last synced" line. Async because
	 *  ManifestStore.load() reads the vault adapter; the placeholder text set by
	 *  the caller covers the gap until this resolves. */
	private async renderCompendiumStatus(el: HTMLElement): Promise<void> {
		const manifest = await this.plugin.manifestStore.load();
		el.setText(
			manifest
				? `${manifest.releaseTag} · ${Object.keys(manifest.files).length} files · synced ${manifest.syncedAt.slice(0, 10)}`
				: 'No compendium synced yet.',
		);
	}
}
