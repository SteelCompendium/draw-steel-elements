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
import { App, Component, Notice, PluginSettingTab, Setting } from 'obsidian';
import DrawSteelAdmonitionPlugin from 'main';
import type { PreferenceStore, PrefDescriptor, DsePrefs } from '@/framework/seams/prefs';
import {
	GROUP_ORDER,
	applySbPreset,
	deriveSbPreset,
	prefUi,
	type SbPresetId,
} from '@/prefs/catalog';
import { mountSettingsPreview } from '@views/SettingsPreview';

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

	constructor(app: App, plugin: DrawSteelAdmonitionPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.presetDropdown = null;
		this.recycleOwner(true);
		const prefs = this.plugin.frameworkV2?.services.prefs;
		if (prefs) this.renderPrefSections(containerEl, prefs);
		this.renderOperationalSections(containerEl);
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

	// —— D4 §4.1: one loop drives the whole pref UI ——
	private renderPrefSections(containerEl: HTMLElement, prefs: PreferenceStore): void {
		const groups = new Map<string, PrefDescriptor[]>();
		for (const descriptor of prefs.descriptors()) {
			const ui = prefUi(descriptor);
			if (!ui || ui.hidden) continue; // hidden = consumer (D5/F2) not shipped
			let members = groups.get(ui.group);
			if (!members) groups.set(ui.group, (members = []));
			members.push(descriptor);
		}
		for (const groupName of GROUP_ORDER) {
			const members = groups.get(groupName);
			if (!members?.length) continue;
			new Setting(containerEl)
				.setName(groupName)
				.setHeading()
				.addExtraButton((button) =>
					button
						.setIcon('rotate-ccw')
						.setTooltip('Reset this section to defaults')
						.onClick(() => void this.resetDescriptors(prefs, members)),
				);
			if (groupName === 'Statblock display') this.renderPresetControl(containerEl, prefs);
			for (const descriptor of members) this.renderRow(containerEl, prefs, descriptor);
			if (groupName === 'Statblock display' && this.displayOwner) {
				mountSettingsPreview(containerEl, this.plugin, this.displayOwner);
			}
		}
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
			.setDesc('A bundle of the statblock options below. Adjusting any single option re-derives "custom".')
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
							save((onOff ? (value ? 'on' : 'off') : value) as DsePrefs[keyof DsePrefs]),
						),
				);
				break;
			}
			case 'select': {
				setting.addDropdown((dropdown) => {
					for (const option of ui.options ?? []) dropdown.addOption(option.value, option.label);
					dropdown
						.setValue(String(prefs.get(descriptor.key)))
						.onChange((value) => save(value as DsePrefs[keyof DsePrefs]));
				});
				break;
			}
			case 'text': {
				setting.addText((text) =>
					text
						.setValue(String(prefs.get(descriptor.key)))
						.onChange((value) => save(value as DsePrefs[keyof DsePrefs])),
				);
				break;
			}
		}
	}

	// —— Operational sections: F2 §3.4 rework (Task 11) — sentence case throughout,
	// setHeading() sections instead of raw h3s, a manifest-driven sync status line,
	// and Sync/Check-for-updates buttons wired to the Task 9/10 sync engine. ——
	private renderOperationalSections(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Compendium').setHeading();
		containerEl.createEl('p', {
			// F2 Task 10: the sync engine (CompendiumSyncService.applySync) is
			// non-destructive by construction — it never deletes or overwrites content
			// it didn't install itself. This replaces the old "WIPED CLEAN"-style
			// warning, which was actively false/scary as of that change.
			text: 'The compendium syncs into a folder in your vault. Only files installed by the plugin are updated or removed — your own notes in that folder are never touched.',
		});

		new Setting(containerEl)
			.setName('Destination folder')
			.setDesc('Vault folder the compendium is synced into.')
			.addText((text) =>
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
			);

		new Setting(containerEl)
			.setName('Release')
			.setDesc('Specific data-unified release tag to sync. Leave empty for the latest release.')
			.addText((text) =>
				text
					.setPlaceholder('Latest')
					.setValue(this.plugin.settings.compendiumReleaseTag ?? '')
					.onChange(async (value) => {
						this.plugin.settings.compendiumReleaseTag = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Locale')
			// "English" is a language proper noun; lowercasing it would be a grammar
			// error, not a fix.
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setDesc('Compendium language. Only English is published today.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('en', 'English')
					.setValue(this.plugin.settings.compendiumLocale)
					.onChange(async (value) => {
						this.plugin.settings.compendiumLocale = value;
						await this.plugin.saveSettings();
					}),
			);

		const statusEl = containerEl.createEl('p', {
			cls: 'ds-compendium-status',
			text: 'Loading sync status…',
		});
		void this.renderCompendiumStatus(statusEl);

		new Setting(containerEl)
			.setName('Sync compendium')
			.setDesc('Download the selected release and update the files the plugin manages.')
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
			);

		new Setting(containerEl).setName('Links').setHeading();

		new Setting(containerEl)
			.setName('Fall back to steelcompendium.io links')
			.setDesc('When an SCC link is not found in your vault, link to its steelcompendium.io page instead. Navigation happens only on click.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.sccWebFallback).onChange(async (value) => {
					this.plugin.settings.sccWebFallback = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName('Initiative tracker').setHeading();

		new Setting(containerEl)
			.setName('Default creature image path')
			.setDesc('Default image to use for creatures in the initiative tracker if not specified.')
			.addText((text) =>
				text
					.setPlaceholder('path/to/image.png')
					.setValue(this.plugin.settings.defaultImagePath)
					.onChange(async (value) => {
						this.plugin.settings.defaultImagePath = value;
						await this.plugin.saveSettings();
					}),
			);
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
