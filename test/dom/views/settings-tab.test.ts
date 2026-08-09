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

// —— SC-131: the tab is DECLARATIVE now. It returns a definition tree from
// getSettingDefinitions() and obsidian renders it; there is no display(). These helpers
// are a faithful stand-in for that renderer — they walk the tree, create one Setting per
// definition, and wire `control` bindings through the tab's own
// getControlValue/setControlValue, which is exactly the path a native control takes. So
// the row-level assertions below still exercise the real save + live-apply chain. ——

/* eslint-disable @typescript-eslint/no-explicit-any */
type Def = any;

/** The top-level definitions: one page per section, plus the reset-all action. */
function definitions(tab: DseSettingTab): Def[] {
	return (tab as any).getSettingDefinitions() as Def[];
}

/** The top-level page definitions, in order. */
function pages(tab: DseSettingTab): Def[] {
	return definitions(tab).filter((d) => d?.type === 'page');
}

function pageNames(tab: DseSettingTab): string[] {
	return pages(tab).map((p) => p.name);
}

function pageNamed(tab: DseSettingTab, name: string): Def {
	const page = pages(tab).find((p) => p.name === name);
	if (!page) throw new Error(`no page named "${name}" (have: ${pageNames(tab).join(', ')})`);
	return page;
}

/** Every setting definition on a page, groups flattened and nested pages descended into
 *  (so an Advanced row is reachable by name the way search reaches it). */
function rowDefs(items: Def[] = []): Def[] {
	const out: Def[] = [];
	for (const item of items) {
		if (!item) continue;
		if (item.type === 'group' || item.type === 'page') out.push(...rowDefs(item.items ?? []));
		else out.push(item);
	}
	return out;
}

/** Binds one native control the way obsidian does, through the tab's value accessors. */
function bindControl(tab: DseSettingTab, setting: Setting, control: Def): void {
	const read = (): any => (tab as any).getControlValue(control.key);
	const write = (value: unknown): void => void (tab as any).setControlValue(control.key, value);
	switch (control.type) {
		case 'toggle':
			setting.addToggle((t) => t.setValue(read() === true).onChange(write));
			break;
		case 'dropdown':
			setting.addDropdown((d) => {
				for (const [value, label] of Object.entries(control.options ?? {})) d.addOption(value, label as string);
				d.setValue(String(read() ?? '')).onChange(write);
			});
			break;
		case 'text':
		case 'file':
		case 'folder':
			setting.addText((t) => {
				if (control.placeholder) t.setPlaceholder(control.placeholder);
				t.setValue(String(read() ?? '')).onChange(write);
			});
			break;
		case 'slider':
			setting.addSlider((sl) =>
				sl
					.setLimits(control.min, control.max, control.step)
					.setValue(Number(read() ?? control.min))
					.setDynamicTooltip()
					.onChange(write),
			);
			break;
		default:
			throw new Error(`unhandled control type "${control.type}"`);
	}
}

function renderDefs(tab: DseSettingTab, container: HTMLElement, items: Def[]): void {
	for (const def of items) {
		if (!def) continue;
		if (def.type === 'group' || def.type === 'page') {
			renderDefs(tab, container, def.items ?? []);
			continue;
		}
		const setting = new Setting(container);
		if (def.name) setting.setName(def.name);
		if (typeof def.desc === 'string') setting.setDesc(def.desc);
		if (def.control) bindControl(tab, setting, def.control);
		else if (def.render) def.render(setting);
		else if (def.action) setting.addButton((b) => b.setButtonText(def.name).onClick(() => def.action(setting.settingEl, 0)));
	}
}

/**
 * Renders every page's rows into the tab's container — the whole tab at once.
 *
 * Real obsidian shows one page at a time; flattening here keeps the row-level suites
 * (which are about a row's behaviour, not its address) direct. The PAGE STRUCTURE itself
 * is asserted separately in the SC-131 block at the bottom.
 */
function renderAll(tab: DseSettingTab): void {
	const container = tab.containerEl as HTMLElement;
	// `update()` is how the tab asks for a repaint (resets, preset apply, font fetch).
	(tab as any).update = () => renderAll(tab);
	container.empty?.();
	container.innerHTML = '';
	renderDefs(tab, container, definitions(tab));
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

	test('renders the visible sections in order and NO hidden PREF rows', async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		renderAll(tab);
		// SC-131: sections are navigable PAGES now, not setHeading() rows, so the section
		// set and its order (which is what this test has always been about) is read off
		// the definition tree. D5 (Plan 14) un-hid the Rolling rows: Task 2 rollerEngine,
		// Task 4 the master switch + rollClickToRoll. F2 Task 11 shipped the SCC
		// web-fallback control as an OPERATIONAL setting (below) instead of the dead
		// prefs-catalog 'References' group scaffolding, which the F2 final-review fix wave
		// deleted outright (webLinkFallback descriptor + the now-empty group) — so no
		// 'References' page ever appears here. D9 (Plan 15 Task 5) adds the Authoring
		// group. F2 Task 11 appends the operational sections (Compendium, Links,
		// Initiative tracker) after the generated pref ones. SC-112 (Plan 23 Task 6)
		// inserts Typography after Appearance.
		expect(pageNames(tab)).toEqual([
			'Appearance', 'Typography', 'Statblock display', 'Element defaults', 'Rolling', 'Authoring',
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
		renderAll(tab);
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
		renderAll(tab);
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
		renderAll(tab);
		rowByName('Density').dropdowns[0].trigger('compact');
		await flushAsync(1);
		expect(prefs.get('sbDensity')).toBe('compact');
		expect(root.getAttribute('data-dse-density')).toBe('compact');
	});

	test('preset dropdown: defaults derive "steel"; picking "index" writes the whole bundle', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		const tab = new DseSettingTab(plugin.app as never, plugin);
		renderAll(tab);
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
		renderAll(tab);
		const preset = rowByName('Preset').dropdowns[0];
		rowByName('Secondary stats').dropdowns[0].trigger('ledger');
		await flushAsync(1);
		expect(preset.value).toBe('sourcebook'); // ledger alone = the sourcebook bundle
		rowByName('Density').dropdowns[0].trigger('compact');
		await flushAsync(1);
		expect(preset.value).toBe('custom');
	});

	test('per-section reset (the page\'s reset row) restores that section; sparse store empties', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		const tab = new DseSettingTab(plugin.app as never, plugin);
		renderAll(tab);
		rowByName('Density').dropdowns[0].trigger('compact');
		await flushAsync(1);
		// SC-131: the section reset moved from a heading extra-button to a named row on
		// the section's own page — same handler, same full-member semantics.
		const reset = rowDefs(pageNamed(tab, 'Statblock display').items).find((d) => d.name === 'Reset this section')!;
		reset.action(null, 0);
		await flushAsync(2);
		expect(prefs.get('sbDensity')).toBe('comfortable');
		expect(plugin.settings.prefs).toEqual({}); // OD-D4-4: default ⇒ deleted from disk shape
	});

	test('"Reset all preferences" returns every pref (incl. theme) to its default', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		const tab = new DseSettingTab(plugin.app as never, plugin);
		renderAll(tab);
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
		renderAll(tab);
		const text = tab.containerEl.textContent ?? '';
		expect(text).not.toMatch(/wiped clean/i);
		expect(text).toContain('Only files installed by the plugin are updated or removed');
		expect(text).toContain('your own notes in that folder are never touched');
	});

	test('no-manifest status line reads "No compendium synced yet."', async () => {
		const { tab } = makeFakePlugin();
		renderAll(tab);
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
		renderAll(tab);
		await flushAsync(2);
		const text = tab.containerEl.textContent ?? '';
		expect(text).toContain('v4.20260716T000000');
		expect(text).toContain('3 files');
		expect(text).toContain('2026-07-15');
	});

	test('Destination folder / Release / Locale fields write settings and save', async () => {
		const { tab, plugin } = makeFakePlugin();
		renderAll(tab);
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
		renderAll(tab);
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
		renderAll(tab);
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
		renderAll(tab);
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
		renderAll(tab);
		rowByName('Sync compendium').buttons[1].click();
		await flushAsync(2);
		expect(Notice.notices.some((n) => n.includes('rate limited'))).toBe(true);
	});

	test('Links section: the fallback toggle is operational (sccWebFallback), not a hidden pref', async () => {
		const { tab, plugin } = makeFakePlugin();
		renderAll(tab);
		const toggle = rowByName('Fall back to steelcompendium.io links').toggles[0];
		expect(toggle.value).toBe(DEFAULT_SETTINGS.sccWebFallback);
		toggle.trigger(false);
		await flushAsync(1);
		expect(plugin.settings.sccWebFallback).toBe(false);
	});

	test('Initiative tracker: default creature image path field (sentence case)', async () => {
		const { tab, plugin } = makeFakePlugin();
		renderAll(tab);
		rowByName('Default creature image path').texts[0].trigger('token.png');
		await flushAsync(1);
		expect(plugin.settings.defaultImagePath).toBe('token.png');
	});
});

// —— SC-112 Task 8: the Typography section — 'font' pickers (3 primary + 3 behind
// the Advanced disclosure) and the two 'slider' size scales. Same real-class,
// recording-Setting-mock harness as the D4 suite above. ——
describe('SC-112 Task 8 — Typography controls', () => {
	beforeEach(() => {
		Setting.created.length = 0;
	});
	afterEach(() => {
		delete (window as { queryLocalFonts?: unknown }).queryLocalFonts;
	});

	test('font row: default-sentinel-first dropdown + trailing Custom…; change persists and reflects; \'\' round-trips', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		const owner: any = new Component();
		owner.load();
		const root = document.createElement('div');
		prefs.reflect(root, owner);
		const tab = new DseSettingTab(plugin.app as never, plugin);
		renderAll(tab);
		const dd = rowByName('Title font').dropdowns[0];
		// Order: the uniform default sentinel, the curated entries, Custom… last.
		expect(dd.options[0]).toEqual({ value: '', label: 'Default (Obsidian vault fonts)' });
		expect(dd.options.map((o) => o.value)).toContain('Georgia');
		expect(dd.options[dd.options.length - 1]).toEqual({ value: '__custom__', label: 'Custom…' });
		expect(dd.value).toBe(''); // default selected
		// Help text comes from the descriptor (Task 6 SHIP clause), not renderer copy.
		expect(rowByName('Title font').desc).toContain('Steel and Legacy');
		dd.trigger('Georgia');
		await flushAsync(1);
		expect(prefs.get('fontTitle')).toBe('Georgia');
		// Live-apply: the reflected root re-stamps the slot property synchronously.
		expect(root.style.getPropertyValue('--dse-font-title')).toBe('"Georgia", var(--font-text)');
		dd.trigger('');
		await flushAsync(1);
		expect(prefs.get('fontTitle')).toBe('');
		expect(root.style.getPropertyValue('--dse-font-title')).toBe(''); // removed — default is inert
	});

	test('custom font value: dropdown lands on Custom…, text input revealed with the raw value; edits save; empty rejects to default', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		await prefs.set('fontBody', 'Comic Sans MS'); // not in the curated list
		const tab = new DseSettingTab(plugin.app as never, plugin);
		renderAll(tab);
		const row = rowByName('Body font');
		expect(row.dropdowns[0].value).toBe('__custom__');
		const text = row.texts[0];
		expect(text.value).toBe('Comic Sans MS');
		expect(text.inputEl.classList.contains('dse-hidden')).toBe(false); // revealed
		// A listed-value row keeps its custom input hidden.
		expect(rowByName('Title font').texts[0].inputEl.classList.contains('dse-hidden')).toBe(true);
		text.trigger('Papyrus');
		await flushAsync(1);
		expect(prefs.get('fontBody')).toBe('Papyrus');
		text.trigger('   '); // obviously empty → reject to default
		await flushAsync(1);
		expect(prefs.get('fontBody')).toBe('');
	});

	test('picking Custom… only reveals the input (no save); picking a listed value saves and hides it', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		const tab = new DseSettingTab(plugin.app as never, plugin);
		renderAll(tab);
		const row = rowByName('Title font');
		row.dropdowns[0].trigger('__custom__');
		await flushAsync(1);
		expect(prefs.get('fontTitle')).toBe(''); // untouched
		expect(row.texts[0].inputEl.classList.contains('dse-hidden')).toBe(false);
		row.dropdowns[0].trigger('Inter');
		await flushAsync(1);
		expect(prefs.get('fontTitle')).toBe('Inter');
		expect(row.texts[0].inputEl.classList.contains('dse-hidden')).toBe(true);
	});

	test('advanced font rows live on the section\'s nested Advanced page; the section reset still covers them', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		const tab = new DseSettingTab(plugin.app as never, plugin);
		renderAll(tab);
		// SC-131: obsidian has no declarative <details>, so the SC-112 disclosure became a
		// nested native page inside Typography — still inside its own section, and now
		// individually searchable rather than hidden behind a summary.
		const group = pageNamed(tab, 'Typography').items[0];
		const advanced = (group.items as Def[]).find((d) => d?.type === 'page');
		expect(advanced.name).toBe('Advanced');
		expect(rowDefs(advanced.items).map((d) => d.name)).toEqual([
			'Card body font', 'Label font', 'Monospace font',
		]);
		const primary = (group.items as Def[]).filter((d) => d?.name && d.type !== 'page').map((d) => d.name);
		for (const name of ['Title font', 'Body font', 'Controls font', 'Text size', 'Card size']) {
			expect(primary).toContain(name);
		}
		// Mono slot gets ITS curated list, not the text one.
		const mono = rowByName('Monospace font').dropdowns[0];
		expect(mono.options.map((o) => o.value)).toContain('JetBrains Mono');
		expect(mono.options.map((o) => o.value)).not.toContain('Georgia');
		// Section reset resets advanced members too.
		mono.trigger('Fira Code');
		await flushAsync(1);
		expect(prefs.get('fontMono')).toBe('Fira Code');
		const reset = rowDefs(pageNamed(tab, 'Typography').items).find((d) => d.name === 'Reset this section')!;
		reset.action(null, 0);
		await flushAsync(2);
		expect(prefs.get('fontMono')).toBe('');
	});

	test('slider rows: site limits + dynamic tooltip; values snap before save; percent readout is native', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		const owner: any = new Component();
		owner.load();
		const root = document.createElement('div');
		prefs.reflect(root, owner);
		const tab = new DseSettingTab(plugin.app as never, plugin);
		renderAll(tab);
		const slider = rowByName('Text size').sliders[0];
		expect(slider.limits).toEqual({ min: 0.6, max: 1.4, step: 0.05 });
		expect(slider.dynamicTooltip).toBe(true);
		expect(slider.value).toBe(1);
		// SC-131: the readout is obsidian's own inline slider value (control.displayFormat,
		// 1.13.1) rather than the hand-built `.dse-slider-value` span it replaced.
		const control = rowDefs(pageNamed(tab, 'Typography').items).find((d) => d.name === 'Text size')!.control;
		expect(control.displayFormat(1)).toBe('100%');
		expect(control.displayFormat(0.85)).toBe('85%');
		slider.trigger(0.837); // off-step → snaps to 0.85
		await flushAsync(1);
		expect(prefs.get('textScale')).toBe(0.85);
		expect(root.style.getPropertyValue('--dse-text-scale')).toBe('0.85'); // live-apply
		expect(rowByName('Card size').sliders[0].limits).toEqual({ min: 0.8, max: 1.2, step: 0.05 });
	});

	test('List installed fonts: user-activation fetch populates every font dropdown (deduped, before Custom…), then the affordance retires', async () => {
		(window as any).queryLocalFonts = jest.fn(async () => [
			{ family: 'Zilla Slab' },
			{ family: 'Aptos' },
			{ family: 'Aptos' }, // style-variant duplicate — must dedupe
			{ family: 'Georgia' }, // curated overlap — must dedupe
		]);
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		renderAll(tab);
		const before = rowByName('Title font');
		expect(before.dropdowns[0].options.map((o) => o.value)).not.toContain('Aptos'); // never called at render time
		expect(before.extraButtons).toHaveLength(1);
		Setting.created.length = 0; // the click re-renders; read the fresh rows
		before.extraButtons[0].click();
		await flushAsync(2);
		expect((window as any).queryLocalFonts).toHaveBeenCalledTimes(1);
		const values = rowByName('Title font').dropdowns[0].options.map((o) => o.value);
		expect(values.filter((v) => v === 'Aptos')).toHaveLength(1);
		expect(values.filter((v) => v === 'Zilla Slab')).toHaveLength(1);
		expect(values.filter((v) => v === 'Georgia')).toHaveLength(1); // curated copy only
		expect(values[values.length - 1]).toBe('__custom__'); // Custom… stays last
		// Mono row shares the fetch.
		expect(rowByName('Monospace font').dropdowns[0].options.map((o) => o.value)).toContain('Aptos');
		// One fetch per tab lifetime — the affordance is gone after population.
		expect(rowByName('Title font').extraButtons).toHaveLength(0);
	});

	test('queryLocalFonts failure falls back to the curated list silently', async () => {
		(window as any).queryLocalFonts = jest.fn(async () => {
			throw new Error('denied');
		});
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		renderAll(tab);
		const before = rowByName('Title font');
		Setting.created.length = 0;
		before.extraButtons[0].click();
		await flushAsync(2);
		const dd = rowByName('Title font').dropdowns[0];
		// default sentinel + 7 curated + Custom… — nothing else, no thrown rejection.
		expect(dd.options).toHaveLength(9);
		expect(rowByName('Title font').extraButtons).toHaveLength(0); // no retry loop
	});

	test('no queryLocalFonts (feature-detect miss): font rows render without the affordance', async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		renderAll(tab);
		expect(rowByName('Title font').extraButtons).toHaveLength(0);
		expect(rowByName('Title font').dropdowns).toHaveLength(1); // picker still renders
	});
});

// —— SC-131: the settings tab as obsidian 1.13 DEFINITIONS ("D-pages").
//
// These assert the definition TREE — the thing obsidian renders and indexes — rather
// than any DOM the plugin paints, because the plugin no longer paints any. They also pin
// the constraints the redesign was not allowed to break: a section reset still covers its
// FULL member list (including rows that moved to the nested Advanced page), Advanced rows
// stay inside their own section, and live apply still runs through prefs.set(). ——
describe('SC-131 — declarative settings definitions', () => {
	beforeEach(() => {
		Setting.created.length = 0;
	});

	test('every section is a navigable page, in order, and display() is gone', async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		expect(pageNames(tab)).toEqual([
			'Appearance', 'Typography', 'Statblock display', 'Element defaults', 'Rolling', 'Authoring',
			'Compendium', 'Links', 'Initiative tracker',
		]);
		// Path A: the imperative renderer is deleted outright, not left as a fallback.
		// (PluginSettingTab still declares display(), so this asserts we add nothing.)
		expect(Object.prototype.hasOwnProperty.call(DseSettingTab.prototype, 'display')).toBe(false);
	});

	test('a page holds only its own rows, wrapped in one classed group', async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		const rolling = pageNamed(tab, 'Rolling');
		// One group per page — the grid container the sticky preview layout hooks.
		expect(rolling.items).toHaveLength(1);
		expect(rolling.items[0].type).toBe('group');
		expect(rolling.items[0].cls).toContain('dse-settings-page');
		const names = rowDefs(rolling.items).map((d) => d.name);
		expect(names).toEqual(['Enable rolling', 'Roller', 'Click ability to roll', 'Reset this section']);
		expect(names).not.toContain('Theme');
	});

	test('control-expressible rows bind natively; only the font pickers keep a render callback', async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		const byName = new Map(
			pages(tab).flatMap((page) => rowDefs(page.items).map((d) => [d.name, d] as const)),
		);
		// A representative binding of each native control type actually used.
		expect(byName.get('Reduce motion')!.control).toEqual({ type: 'toggle', key: 'reduceMotion' });
		expect(byName.get('Density')!.control).toMatchObject({ type: 'dropdown', key: 'sbDensity' });
		expect(byName.get('Text size')!.control).toMatchObject({ type: 'slider', key: 'textScale', min: 0.6, max: 1.4, step: 0.05 });
		// The suggester upgrades: these were bare text boxes before SC-131.
		expect(byName.get('Destination folder')!.control).toMatchObject({ type: 'folder', key: 'compendiumDestinationDirectory' });
		expect(byName.get('Default creature image path')!.control).toMatchObject({ type: 'file', key: 'defaultImagePath' });
		// The six font pickers are the render fraction — no native control expresses a
		// curated dropdown + revealed free-text + "list installed fonts" in one row.
		for (const font of ['Title font', 'Body font', 'Controls font', 'Card body font', 'Label font', 'Monospace font']) {
			expect(byName.get(font)!.control).toBeUndefined();
			expect(typeof byName.get(font)!.render).toBe('function');
		}
		// The derived-value preset and the two-button sync row likewise.
		expect(typeof byName.get('Preset')!.render).toBe('function');
		expect(typeof byName.get('Sync compendium')!.render).toBe('function');
	});

	test('the slider percent readout is native displayFormat, not a hand-built span', async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		const textSize = rowDefs(pageNamed(tab, 'Typography').items).find((d) => d.name === 'Text size')!;
		expect(textSize.control.displayFormat(1)).toBe('100%');
		expect(textSize.control.displayFormat(0.85)).toBe('85%');
	});

	test('every row carries its section as a search alias, and chrome is unsearchable', async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		const typography = rowDefs(pageNamed(tab, 'Typography').items);
		for (const row of typography.filter((d) => d.name)) {
			expect(row.aliases).toContain('Typography');
		}
		// The compendium safety sentence and sync status line have no name to match on.
		const chrome = rowDefs(pageNamed(tab, 'Compendium').items).filter((d) => d.name === '');
		expect(chrome.length).toBeGreaterThan(0);
		for (const row of chrome) expect(row.searchable).toBe(false);
	});

	test('advanced rows move to a nested Advanced page inside their own section', async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		const group = pageNamed(tab, 'Typography').items[0];
		const nested = (group.items as Def[]).filter((d) => d?.type === 'page');
		expect(nested.map((p) => p.name)).toEqual(['Advanced']);
		expect(rowDefs(nested[0].items).map((d) => d.name)).toEqual([
			'Card body font', 'Label font', 'Monospace font',
		]);
		// The primary slots stay on the section page itself.
		const primary = (group.items as Def[]).filter((d) => d?.name && d.type !== 'page').map((d) => d.name);
		expect(primary).toContain('Title font');
		expect(primary).not.toContain('Monospace font');
		// Advanced rows are still individually indexed — searching finds them one level down.
		expect(rowDefs(nested[0].items)[2].aliases).toContain('Typography');
	});

	test('a section reset covers its FULL member list, including the Advanced page', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		const tab = new DseSettingTab(plugin.app as never, plugin);
		renderAll(tab);
		// Change one primary and one advanced member.
		rowByName('Title font').dropdowns[0].trigger('Georgia');
		rowByName('Monospace font').dropdowns[0].trigger('Fira Code');
		await flushAsync(1);
		expect(prefs.get('fontTitle')).toBe('Georgia');
		expect(prefs.get('fontMono')).toBe('Fira Code');
		// The Typography page's reset row resets both.
		const reset = rowDefs(pageNamed(tab, 'Typography').items).find((d) => d.name === 'Reset this section')!;
		reset.action(null, 0);
		await flushAsync(2);
		expect(prefs.get('fontTitle')).toBe('');
		expect(prefs.get('fontMono')).toBe('');
	});

	test('the preview mounts on exactly the sections whose settings reflect onto an element', async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		// The preview row is identified by what it RENDERS (the sticky-column class), not
		// by being nameless — the compendium chrome rows are nameless too.
		const hasPreview = (page: Def): boolean =>
			rowDefs(page.items).some((d) => {
				if (d.name !== '' || !d.render) return false;
				const setting = new Setting(document.createElement('div'));
				d.render(setting);
				return setting.settingEl!.classList.contains('dse-settings-preview-row');
			});
		// Derived from the descriptors that actually reflect onto an element root, so a
		// future reflected group inherits a preview without being listed anywhere.
		expect(pages(tab).filter(hasPreview).map((p) => p.name)).toEqual([
			'Appearance', 'Typography', 'Statblock display',
		]);
	});

	test('a native control write still live-applies to a mounted root (prefs.set path)', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		const owner: any = new Component();
		owner.load();
		const root = document.createElement('div');
		prefs.reflect(root, owner);
		const tab = new DseSettingTab(plugin.app as never, plugin);
		// Exactly what obsidian does when the user drags the native slider / flips the
		// native toggle — no plugin-rendered control in the path at all.
		await (tab as any).setControlValue('sbDensity', 'compact');
		expect(prefs.get('sbDensity')).toBe('compact');
		expect(root.getAttribute('data-dse-density')).toBe('compact');
		// The 'on'|'off' string mapping is absorbed by the accessors, both directions.
		await (tab as any).setControlValue('printPreview', true);
		expect(prefs.get('printPreview')).toBe('on');
		expect((tab as any).getControlValue('printPreview')).toBe(true);
		expect(root.getAttribute('data-dse-print')).toBe('on');
	});

	test('slider writes snap before they persist', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		const tab = new DseSettingTab(plugin.app as never, plugin);
		await (tab as any).setControlValue('textScale', 0.837);
		expect(prefs.get('textScale')).toBe(0.85);
	});

	test('an unknown control key falls through to plugin.settings (the operational rows)', async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		await (tab as any).setControlValue('sccWebFallback', false);
		expect(plugin.settings.sccWebFallback).toBe(false);
		expect((tab as any).getControlValue('sccWebFallback')).toBe(false);
	});

	test('reset-all is a top-level action below the pages', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		const tab = new DseSettingTab(plugin.app as never, plugin);
		const defs = definitions(tab);
		const last = defs[defs.length - 1];
		expect(last.name).toBe('Reset all preferences');
		await (tab as any).setControlValue('reduceMotion', true);
		await (tab as any).setControlValue('theme', 'legacy');
		last.action(null, 0);
		await flushAsync(2);
		expect(prefs.get('reduceMotion')).toBe(false);
		expect(prefs.get('theme')).toBe('steel');
	});
});
