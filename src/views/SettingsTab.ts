// src/views/SettingsTab.ts — D4 §4 (Plan 13): the composed settings tab.
//
// Two owners, one tab: the PREF SECTIONS are GENERATED from the descriptor list
// (adding a pref = adding a descriptor in src/prefs/catalog.ts — no hand-wiring),
// then the OPERATIONAL sections (Compendium downloader, Initiative tracker) are
// hand-written carry-overs, F2's territory (F2 §3.4 reworks them; verbatim here).
//
// Live apply: every control's onChange calls prefs.set(); set() notifies
// subscribers synchronously (Task 1), so prefs.reflect() re-stamps every mounted
// element root and CSS reflows behind the open settings dialog — no Apply button,
// no re-render. This replaces the D3 temporary commands (dse-cycle-theme,
// dse-toggle-print-preview), deleted from main.ts in this same task.
import { App, Component, PluginSettingTab, Setting } from 'obsidian';
import DrawSteelAdmonitionPlugin from 'main';
import { CompendiumDownloader } from '@utils/CompendiumDownloader';
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
			.setDesc('A bundle of the statblock options below. Adjusting any single option re-derives "Custom".')
			.addDropdown((dropdown) => {
				dropdown.addOption('steel', 'Steel Card');
				dropdown.addOption('sourcebook', 'Sourcebook');
				dropdown.addOption('index', 'Index Card');
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

	// —— Operational sections: verbatim carry-over of the pre-D4 tab (F2 reworks) ——
	private renderOperationalSections(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: 'Draw Steel Compendium Downloader' });
		containerEl.createEl('p', {
			text: 'Important: The Compendium will download to a specific directory in your vault and delete any files in that directory',
		});

		new Setting(containerEl)
			.setName('Release Tag (Optional)')
			.setDesc('Specific release tag to download. Leave empty to download the latest release.')
			.addText((text) =>
				text
					.setPlaceholder('v1.0.0')
					.setValue(this.plugin.settings.compendiumReleaseTag ?? '')
					.onChange(async (value) => {
						this.plugin.settings.compendiumReleaseTag = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Destination Directory')
			.setDesc('Directory within your vault to extract the Compendium contents to.  THIS DIRECTORY WILL BE WIPED CLEAN!')
			.addText((text) =>
				text
					.setPlaceholder('ImportedContent')
					.setValue(this.plugin.settings.compendiumDestinationDirectory)
					.onChange(async (value) => {
						this.plugin.settings.compendiumDestinationDirectory = value;
						await this.plugin.saveSettings();
					}),
			);

		const downloadButton = containerEl.createEl('button', {
			cls: 'settings-action-button',
			text: 'Download Compendium',
		});
		downloadButton.addEventListener('click', () => {
			return new CompendiumDownloader(
				this.app,
				this.plugin.githubOwner,
				this.plugin.githubRepo,
				undefined,
			).downloadAndExtractRelease(
				this.plugin.settings.compendiumReleaseTag,
				this.plugin.settings.compendiumDestinationDirectory,
			);
		});

		containerEl.createEl('h3', { text: 'Initiative Tracker' });

		new Setting(containerEl)
			.setName('Default Creature Image Path')
			.setDesc('Default image to use for creatures in the initiative tracker if not specified')
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
}
