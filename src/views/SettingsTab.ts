// src/views/SettingsTab.ts — D4 §4 (Plan 13): the composed settings tab, as a MODEL.
//
// Two owners, one tab: the PREF SECTIONS are GENERATED from the descriptor list
// (adding a pref = adding a descriptor in src/prefs/catalog.ts — no hand-wiring),
// then the OPERATIONAL sections (Compendium sync, Links, Initiative tracker) are
// hand-written — F2's territory (F2 §3.4 Task 11 reworked the old Compendium
// downloader section wholesale: sentence-case labels, a manifest-driven sync status
// line, Sync/Check-for-updates buttons, and the new Links section for sccWebFallback).
//
// SC-131: this class BUILDS A MODEL and does not paint. `buildPrefSections()` +
// `buildOperationalSections()` produce a `NavSection[]`; `settingsDeclarative.ts` maps
// that to the obsidian 1.13 definition tree returned by `getSettingDefinitions()`, and
// obsidian renders it — as navigable pages, with every row in the native settings search.
// There is no `display()` any more: the plugin requires 1.13.0 (manifest minAppVersion),
// which is the version that made the declarative API available.
//
// Live apply: native controls read/write through `getControlValue`/`setControlValue`
// below, which route into the PreferenceStore rather than `plugin.settings`. prefs.set()
// notifies subscribers synchronously (Task 1), so prefs.reflect() re-stamps every mounted
// element root and CSS reflows behind the open settings window — no Apply button, no
// re-render. Custom (`render`) rows call prefs.set() directly, same as before.
import { App, Component, Notice, PluginSettingTab, Setting, type TextComponent } from 'obsidian';
import type { SettingControl, SettingDefinitionItem } from 'obsidian';
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
	toSettingDefinitions,
	type NavRow,
	type NavSection,
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
	// name/desc are set by obsidian from the definition's `name`/`desc`; `build` only adds
	// the control. (Rows whose control IS expressible natively skip this helper entirely
	// and carry a `control` instead — see the operational sections below.)
	return { label, help, render: build };
}

/** Chrome (an explanatory paragraph, a status line): rendered as its own full-width row,
 *  never a search hit — it has no label to match on. */
function opChrome(chrome: (container: HTMLElement) => void): NavRow {
	return { chrome };
}

/** Structural slice of DropdownComponent the preset re-derivation needs. */
interface ValueControl {
	setValue(value: string): unknown;
}

export class DseSettingTab extends PluginSettingTab {
	plugin: DrawSteelAdmonitionPlugin;
	private presetDropdown: ValueControl | null = null;
	/** SC-112 Task 8: families fetched by "List installed fonts" (null = never
	 *  fetched — the affordance is still offered; [] = fetch failed/denied — the
	 *  curated list silently stands). Kept for the tab's lifetime: the installed
	 *  set doesn't change mid-session, and every font row shares one fetch. */
	private installedFonts: readonly string[] | null = null;

	constructor(app: App, plugin: DrawSteelAdmonitionPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// —— SC-131: the obsidian 1.13 entry point (see settingsDeclarative.ts) ——
	//
	// MUST BE SIDE-EFFECT FREE. The .d.ts says "called on every display()", but that is not
	// what 1.13.4 does: `update()` is the ONLY caller — it caches the result into
	// `settingItems`, and `renderTab()` then re-renders from that CACHE without asking us
	// again (verified against the shipped bundle, not the typings). So this runs at tab
	// REGISTRATION and on our own explicit `update()` calls, while the settings window may
	// be opened and closed any number of times in between, replaying the same definitions.
	//
	// Anything torn down here would therefore stay torn down for every later re-render —
	// which is exactly how an earlier revision of this file made the live preview vanish on
	// the second open. Per-render resources belong to the render callback's own cleanup
	// contract instead (see `renderPreview` below), never to this method.
	//
	// It must also stay cheap: no I/O, no network. Building the model is a walk over the
	// descriptor list plus a handful of closures, which qualifies; the one genuinely async
	// thing (the compendium sync status line) is fetched inside its own row's render.
	getSettingDefinitions(): SettingDefinitionItem[] {
		const prefs = this.plugin.frameworkV2?.services.prefs;
		return toSettingDefinitions(
			[...(prefs ? this.buildPrefSections(prefs) : []), ...this.buildOperationalSections()],
			prefs
				? () =>
					void this.resetDescriptors(
						prefs,
						prefs.descriptors().filter((descriptor) => prefUi(descriptor) !== undefined),
					)
				: undefined,
		);
	}

	/** Native control bindings read through here rather than off `this.plugin.settings`.
	 *  DSE keeps its prefs in the PreferenceStore, and this is also where the
	 *  representation mismatch is absorbed: an 'on'|'off' STRING pref presents to a native
	 *  toggle as a boolean. Unknown keys fall through to the base implementation, which is
	 *  what the operational rows (real `plugin.settings` fields) use. */
	getControlValue(key: string): unknown {
		const descriptor = this.prefDescriptor(key);
		const prefs = this.plugin.frameworkV2?.services.prefs;
		if (!descriptor || !prefs) return super.getControlValue(key);
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
		const descriptor = this.prefDescriptor(key);
		const prefs = this.plugin.frameworkV2?.services.prefs;
		if (!descriptor || !prefs) return super.setControlValue(key, value);
		const ui = prefUi(descriptor);
		let next = value;
		if (ui?.control === 'toggle' && typeof descriptor.default === 'string') {
			next = value ? 'on' : 'off';
		} else if (ui?.control === 'slider') {
			next = snap(value, this.scaleRange(descriptor, ui));
		}
		const saved = prefs.set(descriptor.key, next as DsePrefs[keyof DsePrefs]);
		// A statblock option changing re-derives the preset label above it.
		if (ui?.inPreset) this.presetDropdown?.setValue(deriveSbPreset(prefs));
		return saved;
	}

	/** The PrefDescriptor a control key names, or undefined when the key belongs to
	 *  `plugin.settings` instead (the operational rows). */
	private prefDescriptor(key: string): PrefDescriptor | undefined {
		const prefs = this.plugin.frameworkV2?.services.prefs;
		return prefs?.descriptors().find((candidate) => candidate.key === key);
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
	private nativeControl(descriptor: PrefDescriptor, ui: PrefUi): SettingControl | undefined {
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
			case 'font':
				// The one control type obsidian cannot express: a curated dropdown, a
				// revealed free-text field and a "list installed fonts" button in one row.
				return undefined;
			default: {
				// Adding a PrefUi control kind without deciding its native binding is a
				// compile error rather than a row that silently renders nothing.
				const exhaustive: never = ui.control;
				return exhaustive;
			}
		}
	}

	// —— D4 §4.1: one loop drives the whole pref UI. SC-131 turned the loop's OUTPUT
	// from "rows appended to containerEl" into a NavSection model, which
	// settingsDeclarative.ts maps to obsidian's definition tree — the descriptor list is
	// still the only input, and adding a pref is still adding a descriptor. ——
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
					aliases: ['statblock', 'bundle'],
					render: (setting) => this.renderPresetControl(setting, prefs),
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
					// SC-112 Task 8: secondary rows move to the section's nested "Advanced"
					// page. The section reset still covers them — it iterates `members`,
					// not the rows any one page happens to show.
					advanced: ui.advanced,
					// `control` present ⇒ obsidian renders and persists the row itself
					// (through getControlValue/setControlValue above); absent ⇒ the `render`
					// thunk owns the row body. Only the six font pickers need the latter.
					control: this.nativeControl(descriptor, ui),
					render: (setting) => this.renderRow(setting, prefs, descriptor),
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
				// listed, so a future reflected group inherits it for free. D-pages makes
				// this cheap: each page is its own view, so a preview mounts at most once.
				// Each MOUNT owns its Component and hands back the teardown. Obsidian stores a
				// render callback's return value as that row's `cleanup` and invokes it when
				// the row goes away (page navigation, settings close, re-render), so the
				// preview's pref subscriptions die with the DOM that showed them — and,
				// critically, a fresh owner is created on every mount rather than once per
				// definitions build. Definitions are cached and replayed; mounts are not.
				renderPreview: this.sectionShowsPreview(members)
					? (container) => {
						const owner = new Component();
						owner.load();
						mountSettingsPreview(container, this.plugin, owner);
						return () => owner.unload();
					}
					: undefined,
			});
		}
		return sections;
	}

	private sectionShowsPreview(members: readonly PrefDescriptor[]): boolean {
		return members.some((descriptor) => descriptor.attr !== undefined || descriptor.css !== undefined);
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
		// `update()` is the declarative twin of the old `display()` call: it re-reads
		// getSettingDefinitions() and repaints, which is what makes the reset visible in
		// controls obsidian owns (a native control does not observe the store itself).
		this.update();
	}

	// —— D4 §3.2: the preset bundle dropdown (derived label, never stored) ——
	//
	// Not a native `dropdown` control: its value is DERIVED from the four statblock
	// options rather than stored, and "custom" is a label the user cannot select into.
	// A control binding would have to persist that pseudo-value; a render row need not.
	private renderPresetControl(setting: Setting, prefs: PreferenceStore): void {
		setting.addDropdown((dropdown) => {
			dropdown.addOption('steel', 'Steel card');
			dropdown.addOption('sourcebook', 'Sourcebook');
			dropdown.addOption('index', 'Index card');
			dropdown.addOption('custom', 'Custom');
			dropdown.setValue(deriveSbPreset(prefs));
			dropdown.onChange((value) => {
				if (value === 'custom') return; // derived label, not a settable state
				applySbPreset(prefs, value as SbPresetId)
					.then(() => this.update())
					.catch((error) =>
						console.error('Draw Steel Elements: failed to apply statblock preset', error),
					);
			});
			this.presetDropdown = dropdown;
		});
	}

	/**
	 * The row body for a descriptor obsidian cannot render itself.
	 *
	 * After SC-131 that is exactly one control kind — 'font'. Every other kind (toggle,
	 * select, text, slider) is a native `control` binding produced by `nativeControl()`
	 * above, so it never reaches here; obsidian renders it and persists it through
	 * getControlValue/setControlValue.
	 */
	private renderRow(setting: Setting, prefs: PreferenceStore, descriptor: PrefDescriptor): void {
		const ui = prefUi(descriptor);
		if (!ui || ui.control !== 'font') return;
		const save = (value: DsePrefs[keyof DsePrefs]): void => {
			prefs
				.set(descriptor.key, value)
				.catch((error) =>
					console.error(
						`Draw Steel Elements: failed to save preference "${String(descriptor.key)}"`,
						error,
					),
				);
		};
		this.renderFontControl(setting, prefs, descriptor, ui, save);
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
		this.update();
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
				{
					label: 'Destination folder',
					help: 'Vault folder the compendium is synced into.',
					// A native 'folder' control, which is an upgrade on the bare text box
					// this used to be: obsidian supplies the folder suggester.
					// Literal default vault folder name
					// (DEFAULT_SETTINGS.compendiumDestinationDirectory), not prose;
					// lowercasing would misrepresent the actual folder created. (The
					// sentence-case rule inspects setName/setDesc calls, which a declarative
					// control has none of, so no disable directive is needed here.)
					control: { type: 'folder', key: 'compendiumDestinationDirectory', placeholder: 'DS Compendium' },
				},
				{
					label: 'Release',
					help: 'Specific data-unified release tag to sync. Leave empty for the latest release.',
					control: { type: 'text', key: 'compendiumReleaseTag', placeholder: 'Latest' },
				},
				// "English" is a language proper noun; lowercasing it would be a grammar
				// error, not a fix.
				{
					label: 'Locale',
					help: 'Compendium language. Only English is published today.',
					control: { type: 'dropdown', key: 'compendiumLocale', options: { en: 'English' } },
				},
				opChrome((container) => {
					const statusEl = container.createEl('p', {
						cls: 'ds-compendium-status',
						text: 'Loading sync status…',
					});
					void this.renderCompendiumStatus(statusEl);
				}),
				// BLOCK BODY, deliberately: obsidian keeps a render callback's return value
				// as the row's cleanup and CALLS it on teardown, and `Setting`'s builders
				// are chainable — a one-expression arrow here would hand back the Setting,
				// which is truthy but not callable, throwing a TypeError on every teardown
				// of this page. (settingsDeclarative's asCleanup also guards this; both
				// ends are fixed so neither alone is load-bearing.)
				opRow(
					'Sync compendium',
					'Download the selected release and update the files the plugin manages.',
					(setting) => {
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
								button.setButtonText('Check for updates').onClick(() => {
									void this.checkForCompendiumUpdates();
								}),
							);
					},
				),
			],
		};

		const links: NavSection = {
			id: 'links',
			label: 'Links',
			rows: [
				{
					label: 'Fall back to steelcompendium.io links',
					help: 'When an SCC link is not found in your vault, link to its steelcompendium.io page instead. Navigation happens only on click.',
					control: { type: 'toggle', key: 'sccWebFallback' },
				},
			],
		};

		const initiative: NavSection = {
			id: 'initiative-tracker',
			label: 'Initiative tracker',
			rows: [
				{
					label: 'Default creature image path',
					help: 'Default image to use for creatures in the initiative tracker if not specified.',
					// Native 'file' control — obsidian supplies the file suggester, which
					// the old free-text box did not.
					control: { type: 'file', key: 'defaultImagePath', placeholder: 'path/to/image.png' },
				},
			],
		};

		return [compendium, links, initiative];
	}

	/** The "Check for updates" handler. Split out of the button so `onClick` receives a
	 *  SYNC callback — an async one returns a promise obsidian never awaits, which is both
	 *  an eslint no-misused-promises error and a silent unhandled rejection on failure. */
	private async checkForCompendiumUpdates(): Promise<void> {
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
