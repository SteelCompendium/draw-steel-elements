// Plan 13 Task 4 (D4 §4) — the descriptor-driven settings tab, driven as a REAL
// class against the recording Setting mock. Live-apply is exercised end-to-end:
// control trigger → prefs.set → reflect re-stamps a mounted root, no re-render.
// Replaces test/dom/framework/review-commands.test.ts (the D3 temporary commands
// this tab supersedes).
import DrawSteelAdmonitionPlugin from 'main';
import { DseSettingTab } from '@views/SettingsTab';
import { App, Plugin, Setting, Component, flushAsync } from '../../mocks/obsidian';
import { SB_PRESETS } from '../../../src/prefs/catalog';

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

	test('renders the visible groups in order and NO hidden rows', async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.display();
		const headings = Setting.created.filter((s) => s.heading).map((s) => s.name);
		// D5 (Plan 14) un-hid the Rolling rows: Task 2 rollerEngine, Task 4 the
		// master switch + rollClickToRoll; only webLinkFallback (F2) stays hidden.
		expect(headings).toEqual(['Appearance', 'Statblock display', 'Element defaults', 'Rolling']);
		const names = Setting.created.map((s) => s.name);
		expect(names).toContain('Enable rolling');
		expect(names).toContain('Roller');
		expect(names).toContain('Click ability to roll');
		expect(names).not.toContain('Fall back to steelcompendium.io links');
		// operational carry-over intact:
		expect(names).toContain('Release Tag (Optional)');
		expect(names).toContain('Default Creature Image Path');
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
