// Plan 13 Task 4 (D4 §4) — the descriptor-driven settings tab, driven as a REAL
// class against the recording Setting mock. Live-apply is exercised end-to-end:
// control trigger → prefs.set → reflect re-stamps a mounted root, no re-render.
// Replaces test/dom/framework/review-commands.test.ts (the D3 temporary commands
// this tab supersedes).
import DrawSteelAdmonitionPlugin from 'main';
import { DseSettingTab } from '@views/SettingsTab';
import { App, Plugin, Setting, Component, Notice, flushAsync } from '../../mocks/obsidian';
import { SB_PRESETS } from '../../../src/prefs/catalog';
import { DEFAULT_SETTINGS } from '@model/Settings';
import type { CompendiumManifest } from '@/data/manifest';

function rowByName(name: string): Setting {
	const row = Setting.created.find((s) => s.name === name);
	if (!row) throw new Error(`no Setting row named "${name}" (have: ${Setting.created.map((s) => s.name).join(', ')})`);
	return row;
}

async function makeLoadedPlugin(): Promise<DrawSteelAdmonitionPlugin> {
	const app = new App();
	const plugin = new DrawSteelAdmonitionPlugin(app as never, { id: 'draw-steel-elements', version: 'test' } as never);
	await plugin.onload();
	return plugin;
}

describe('D4 §4 — DseSettingTab', () => {
	beforeEach(() => {
		Setting.created.length = 0;
	});

	test('renders the visible groups in order and NO hidden PREF rows', async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.display();
		const headings = Setting.created.filter((s) => s.heading).map((s) => s.name);
		// D5 (Plan 14) un-hid the Rolling rows: Task 2 rollerEngine, Task 4 the
		// master switch + rollClickToRoll. F2 Task 11 shipped the SCC web-fallback
		// control as an OPERATIONAL setting (below) instead of the dead prefs-catalog
		// 'References' group scaffolding, which the F2 final-review fix wave deleted
		// outright (webLinkFallback descriptor + the now-empty group) — so no
		// 'References' heading ever appears here. D9 (Plan 15 Task 5) adds the
		// Authoring group (authoringControls, default OFF — row is NOT hidden, so it
		// renders a heading). F2 Task 11 appends the operational headings (Compendium,
		// Links, Initiative tracker) after the generated pref sections.
		expect(headings).toEqual([
			'Appearance', 'Statblock display', 'Element defaults', 'Rolling', 'Authoring',
			'Compendium', 'Links', 'Initiative tracker',
		]);
		const names = Setting.created.map((s) => s.name);
		expect(names).toContain('Enable rolling');
		expect(names).toContain('Roller');
		expect(names).toContain('Click ability to roll');
		// F2 Task 11: this label appears exactly once — the OPERATIONAL sccWebFallback
		// row (the prefs-catalog webLinkFallback descriptor it used to also live behind
		// is gone entirely as of the F2 final-review fix wave).
		expect(names.filter((n) => n === 'Fall back to steelcompendium.io links')).toHaveLength(1);
		// operational carry-over intact (F2 Task 11 renamed to sentence case):
		expect(names).toContain('Release');
		expect(names).toContain('Default creature image path');
	});

	test('theme row: the builtin descriptor renders with OD-5 labels and live-applies to a mounted root', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		// mock Component vs. real obsidian's Component (private fields) don't
		// structurally unify at tsc; `any` here matches the established pattern
		// (fakeOwner()/`owner: any` in seams.test.ts, pref-reflection.test.ts).
		const owner: any = new Component();
		owner.load();
		const root = document.createElement('div');
		plugin.frameworkV2!.services.theme.apply(root, owner);
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.display();
		const dd = rowByName('Theme').dropdowns[0];
		expect(dd.options).toEqual([
			{ value: 'legacy', label: 'Match Obsidian (Legacy)' },
			{ value: 'steel', label: 'Steel' },
		]);
		dd.trigger('legacy');
		await flushAsync(1);
		expect(prefs.get('theme')).toBe('legacy');
		expect(root.getAttribute('data-dse-theme')).toBe('legacy');
	});

	test('an on/off toggle row (print preview) maps checked ⇔ "on"', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.display();
		const toggle = rowByName('Print preview').toggles[0];
		expect(toggle.value).toBe(false); // default 'off'
		toggle.trigger(true);
		await flushAsync(1);
		expect(prefs.get('printPreview')).toBe('on');
	});

	test('a select row (Density) live-applies: a REFLECTED root re-stamps behind the tab', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		const owner: any = new Component();
		owner.load();
		const root = document.createElement('div');
		prefs.reflect(root, owner);
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.display();
		rowByName('Density').dropdowns[0].trigger('compact');
		await flushAsync(1);
		expect(prefs.get('sbDensity')).toBe('compact');
		expect(root.getAttribute('data-dse-density')).toBe('compact');
	});

	test('preset dropdown: defaults derive "steel"; picking "index" writes the whole bundle', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.display();
		const preset = rowByName('Preset').dropdowns[0];
		expect(preset.value).toBe('steel');
		preset.trigger('index');
		await flushAsync(2);
		for (const [key, value] of Object.entries(SB_PRESETS.index)) {
			expect(prefs.get(key as never)).toBe(value);
		}
	});

	test('twiddling one preset member re-derives "custom" on the preset dropdown', async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.display();
		const preset = rowByName('Preset').dropdowns[0];
		rowByName('Secondary stats').dropdowns[0].trigger('ledger');
		await flushAsync(1);
		expect(preset.value).toBe('sourcebook'); // ledger alone = the sourcebook bundle
		rowByName('Density').dropdowns[0].trigger('compact');
		await flushAsync(1);
		expect(preset.value).toBe('custom');
	});

	test('per-group reset (heading extra-button) restores that group; sparse store empties', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.display();
		rowByName('Density').dropdowns[0].trigger('compact');
		await flushAsync(1);
		const heading = Setting.created.find((s) => s.heading && s.name === 'Statblock display')!;
		heading.extraButtons[0].click();
		await flushAsync(2);
		expect(prefs.get('sbDensity')).toBe('comfortable');
		expect(plugin.settings.prefs).toEqual({}); // OD-D4-4: default ⇒ deleted from disk shape
	});

	test('"Reset all preferences" returns every pref (incl. theme) to its default', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.display();
		rowByName('Theme').dropdowns[0].trigger('legacy');
		rowByName('Reduce motion').toggles[0].trigger(true);
		await flushAsync(1);
		const resetAll = Setting.created.find((s) => s.buttons.some((b) => b.text === 'Reset all preferences'))!;
		resetAll.buttons[0].click();
		await flushAsync(2);
		expect(prefs.get('theme')).toBe('steel');
		expect(prefs.get('reduceMotion')).toBe(false);
	});

	test('the D3 temporary commands are gone from onload', async () => {
		const plugin = await makeLoadedPlugin();
		const addCommand = jest.spyOn(plugin, 'addCommand' as never);
		// onload already ran in makeLoadedPlugin; re-run registration on a fresh plugin
		const app2 = new App();
		const plugin2 = new DrawSteelAdmonitionPlugin(app2 as never, { id: 'draw-steel-elements', version: 'test' } as never);
		const ids: string[] = [];
		jest.spyOn(plugin2, 'addCommand' as never).mockImplementation(((cmd: { id: string }) => {
			ids.push(cmd.id);
		}) as never);
		await plugin2.onload();
		expect(ids).toContain('download-data-md-dse');
		expect(ids).not.toContain('dse-cycle-theme');
		expect(ids).not.toContain('dse-toggle-print-preview');
		addCommand.mockRestore();
	});
});

// —— F2 Task 11: the Compendium operational-section rework (F2 §3.4) ——
// Driven against a lightweight fake plugin (not the real onload() path above):
// the operational section only touches plugin.settings/saveSettings/syncCompendium/
// syncService/manifestStore, none of which need a real frameworkV2 or a real
// vault adapter. `frameworkV2` stays undefined, matching display()'s own guard
// (`if (prefs) this.renderPrefSections(...)`), so only the operational section
// under test is rendered — the pref-section behavior is covered above.
describe('F2 Task 11 — Compendium operational section', () => {
	function makeFakePlugin(overrides: Record<string, unknown> = {}) {
		const app = new App();
		const plugin: any = {
			app,
			settings: { ...DEFAULT_SETTINGS },
			frameworkV2: undefined,
			saveSettings: jest.fn(async () => {}),
			syncCompendium: jest.fn(async () => {}),
			syncService: {
				checkForUpdates: jest.fn(async () => (
					{ installedTag: null, latestTag: 'v4.x', upToDate: false }
				)),
			},
			manifestStore: { load: jest.fn(async () => null) },
			...overrides,
		};
		const tab = new DseSettingTab(app as never, plugin);
		return { tab, plugin, app };
	}

	beforeEach(() => {
		Setting.created.length = 0;
		Notice.notices.length = 0;
	});

	test('the safety sentence replaces any WIPED-CLEAN-style warning', () => {
		const { tab } = makeFakePlugin();
		tab.display();
		const text = tab.containerEl.textContent ?? '';
		expect(text).not.toMatch(/wiped clean/i);
		expect(text).toContain('Only files installed by the plugin are updated or removed');
		expect(text).toContain('your own notes in that folder are never touched');
	});

	test('no-manifest status line reads "No compendium synced yet."', async () => {
		const { tab } = makeFakePlugin();
		tab.display();
		await flushAsync(2);
		expect(tab.containerEl.textContent).toContain('No compendium synced yet.');
	});

	test('manifest-driven status line: tag, file count, sync date', async () => {
		const manifest: CompendiumManifest = {
			schemaVersion: 1,
			source: 'SteelCompendium/data-unified',
			releaseTag: 'v4.20260716T000000',
			locale: 'en',
			format: 'md-dse',
			root: 'DS Compendium',
			syncedAt: '2026-07-15T10:00:00.000Z',
			files: { a: 'x', b: 'y', c: 'z' },
		};
		const { tab } = makeFakePlugin({ manifestStore: { load: jest.fn(async () => manifest) } });
		tab.display();
		await flushAsync(2);
		const text = tab.containerEl.textContent ?? '';
		expect(text).toContain('v4.20260716T000000');
		expect(text).toContain('3 files');
		expect(text).toContain('2026-07-15');
	});

	test('Destination folder / Release / Locale fields write settings and save', async () => {
		const { tab, plugin } = makeFakePlugin();
		tab.display();
		rowByName('Destination folder').texts[0].trigger('My Compendium');
		await flushAsync(1);
		expect(plugin.settings.compendiumDestinationDirectory).toBe('My Compendium');

		rowByName('Release').texts[0].trigger('v4.1.0');
		await flushAsync(1);
		expect(plugin.settings.compendiumReleaseTag).toBe('v4.1.0');

		const localeDropdown = rowByName('Locale').dropdowns[0];
		expect(localeDropdown.options).toEqual([{ value: 'en', label: 'English' }]);
		localeDropdown.trigger('en');
		await flushAsync(1);
		expect(plugin.settings.compendiumLocale).toBe('en');

		expect(plugin.saveSettings).toHaveBeenCalledTimes(3);
	});

	test('Sync button invokes plugin.syncCompendium', () => {
		const { tab, plugin } = makeFakePlugin();
		tab.display();
		rowByName('Sync compendium').buttons[0].click();
		expect(plugin.syncCompendium).toHaveBeenCalledTimes(1);
	});

	test('Check for updates button reports up-to-date via Notice', async () => {
		const { tab, plugin } = makeFakePlugin({
			syncService: {
				checkForUpdates: jest.fn(async () => (
					{ installedTag: 'v4.1', latestTag: 'v4.1', upToDate: true }
				)),
			},
		});
		tab.display();
		rowByName('Sync compendium').buttons[1].click();
		await flushAsync(2);
		expect(plugin.syncService.checkForUpdates).toHaveBeenCalledTimes(1);
		expect(Notice.notices.some((n) => /up to date/i.test(n))).toBe(true);
	});

	test('Check for updates button reports an available update via Notice', async () => {
		const { tab } = makeFakePlugin({
			syncService: {
				checkForUpdates: jest.fn(async () => (
					{ installedTag: 'v4.0', latestTag: 'v4.1', upToDate: false }
				)),
			},
		});
		tab.display();
		rowByName('Sync compendium').buttons[1].click();
		await flushAsync(2);
		expect(Notice.notices.some((n) => n.includes('v4.1') && n.includes('v4.0'))).toBe(true);
	});

	test('Check for updates failure surfaces the error via Notice, not a thrown rejection', async () => {
		const { tab } = makeFakePlugin({
			syncService: {
				checkForUpdates: jest.fn(async () => { throw new Error('rate limited'); }),
			},
		});
		tab.display();
		rowByName('Sync compendium').buttons[1].click();
		await flushAsync(2);
		expect(Notice.notices.some((n) => n.includes('rate limited'))).toBe(true);
	});

	test('Links section: the fallback toggle is operational (sccWebFallback), not a hidden pref', async () => {
		const { tab, plugin } = makeFakePlugin();
		tab.display();
		const toggle = rowByName('Fall back to steelcompendium.io links').toggles[0];
		expect(toggle.value).toBe(DEFAULT_SETTINGS.sccWebFallback);
		toggle.trigger(false);
		await flushAsync(1);
		expect(plugin.settings.sccWebFallback).toBe(false);
	});

	test('Initiative tracker: default creature image path field (sentence case)', async () => {
		const { tab, plugin } = makeFakePlugin();
		tab.display();
		rowByName('Default creature image path').texts[0].trigger('token.png');
		await flushAsync(1);
		expect(plugin.settings.defaultImagePath).toBe('token.png');
	});
});
