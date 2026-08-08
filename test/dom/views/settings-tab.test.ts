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

// SC-131: the tab is a navigation SHELL now — only the active section's rows are in the
// DOM. Every pre-SC-131 row assertion below therefore opens its section first, the way a
// user does (a real click on the real nav tab), rather than being retargeted at a
// non-shipping render mode.
function openSection(tab: DseSettingTab, label: string): void {
	const tabs = Array.from(
		(tab.containerEl as HTMLElement).querySelectorAll<HTMLElement>('.dse-settings-nav__tab'),
	);
	const button = tabs.find((candidate) => candidate.textContent === label);
	if (!button) {
		throw new Error(
			`no nav tab labelled "${label}" (have: ${tabs.map((t) => t.textContent).join(', ')})`,
		);
	}
	button.click();
}

function navLabels(tab: DseSettingTab): string[] {
	return Array.from(
		(tab.containerEl as HTMLElement).querySelectorAll<HTMLElement>('.dse-settings-nav__tab'),
	).map((t) => t.textContent ?? '');
}

function searchFor(tab: DseSettingTab, query: string): void {
	const input = (tab.containerEl as HTMLElement).querySelector<HTMLInputElement>(
		'.dse-settings-search__input',
	);
	if (!input) throw new Error('no search field — is the shell in a mode that has one?');
	input.value = query;
	input.dispatchEvent(new Event('input'));
}

/** Row names currently in the DOM (the shell renders a subset, so Setting.created —
 *  which is cumulative across re-renders — is the wrong question). */
function visibleRowNames(tab: DseSettingTab): string[] {
	return Array.from(
		(tab.containerEl as HTMLElement).querySelectorAll<HTMLElement>('[data-setting-name]'),
	).map((el) => el.getAttribute('data-setting-name') ?? '');
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
		// SC-131: the SHELL decides how many of these are on screen at once; the GROUP
		// SET and its order are what this test has always been about, so it asserts them
		// through the 'off' mode — the pre-SC-131 layout, kept verbatim as the decision
		// pack's contrast baseline. The shipped mode's structure is covered by the SC-131
		// describe block at the bottom of this file.
		tab.navMode = 'off';
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
		// Links, Initiative tracker) after the generated pref sections. SC-112
		// (Plan 23 Task 6) inserts Typography after Appearance; Task 8 renders its
		// 'font'/'slider' controls (covered by the SC-112 describe block below).
		expect(headings).toEqual([
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
		openSection(tab, 'Statblock display');
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
		openSection(tab, 'Statblock display');
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
		openSection(tab, 'Statblock display');
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
		openSection(tab, 'Statblock display');
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
		openSection(tab, 'Links');
		const toggle = rowByName('Fall back to steelcompendium.io links').toggles[0];
		expect(toggle.value).toBe(DEFAULT_SETTINGS.sccWebFallback);
		toggle.trigger(false);
		await flushAsync(1);
		expect(plugin.settings.sccWebFallback).toBe(false);
	});

	test('Initiative tracker: default creature image path field (sentence case)', async () => {
		const { tab, plugin } = makeFakePlugin();
		tab.display();
		openSection(tab, 'Initiative tracker');
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
		tab.display();
		openSection(tab, 'Typography');
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
		tab.display();
		openSection(tab, 'Typography');
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
		tab.display();
		openSection(tab, 'Typography');
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

	test('advanced font rows render inside a collapsed <details>; the group reset still covers them', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.display();
		openSection(tab, 'Typography');
		const details = tab.containerEl.querySelector('details.dse-settings-advanced') as HTMLDetailsElement;
		expect(details).not.toBeNull();
		expect(details.open).toBe(false); // collapsed by default
		expect(details.querySelector('summary')?.textContent).toBe('Advanced');
		// The three advanced slots live inside; the three primary slots do not.
		for (const name of ['Card body font', 'Label font', 'Monospace font']) {
			expect(details.querySelector(`[data-setting-name="${name}"]`)).not.toBeNull();
		}
		for (const name of ['Title font', 'Body font', 'Controls font', 'Text size', 'Card size']) {
			expect(details.querySelector(`[data-setting-name="${name}"]`)).toBeNull();
		}
		// Mono slot gets ITS curated list, not the text one.
		const mono = rowByName('Monospace font').dropdowns[0];
		expect(mono.options.map((o) => o.value)).toContain('JetBrains Mono');
		expect(mono.options.map((o) => o.value)).not.toContain('Georgia');
		// Group reset (heading extra-button) resets advanced members too.
		mono.trigger('Fira Code');
		await flushAsync(1);
		expect(prefs.get('fontMono')).toBe('Fira Code');
		const heading = Setting.created.find((s) => s.heading && s.name === 'Typography')!;
		heading.extraButtons[0].click();
		await flushAsync(2);
		expect(prefs.get('fontMono')).toBe('');
	});

	test('slider rows: site limits + dynamic tooltip; values snap before save; percent readout tracks', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		const owner: any = new Component();
		owner.load();
		const root = document.createElement('div');
		prefs.reflect(root, owner);
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.display();
		openSection(tab, 'Typography');
		const textRow = rowByName('Text size');
		const slider = textRow.sliders[0];
		expect(slider.limits).toEqual({ min: 0.6, max: 1.4, step: 0.05 });
		expect(slider.dynamicTooltip).toBe(true);
		expect(slider.value).toBe(1);
		expect(textRow.controlEl!.querySelector('.dse-slider-value')!.textContent).toBe('100%');
		slider.trigger(0.837); // off-step → snaps to 0.85
		await flushAsync(1);
		expect(prefs.get('textScale')).toBe(0.85);
		expect(textRow.controlEl!.querySelector('.dse-slider-value')!.textContent).toBe('85%');
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
		tab.display();
		openSection(tab, 'Typography');
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
		tab.display();
		openSection(tab, 'Typography');
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
		tab.display();
		openSection(tab, 'Typography');
		expect(rowByName('Title font').extraButtons).toHaveLength(0);
		expect(rowByName('Title font').dropdowns).toHaveLength(1); // picker still renders
	});
});

// —— SC-131: the settings navigation shell. ONE mechanism (a NavSection model over the
// pref groups + the operational sections), four render modes. These tests drive the
// SHIPPED mode ('search' — candidate C) except where a mode is named, and they pin the
// constraints the shell was not allowed to break: full-member group resets, Advanced
// disclosures staying inside their own section, and the live preview keeping a home. ——
describe('SC-131 — settings navigation shell', () => {
	beforeEach(() => {
		Setting.created.length = 0;
	});

	test('the nav lists every section in order; only the active one is rendered', async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.display();
		expect(navLabels(tab)).toEqual([
			'Appearance', 'Typography', 'Statblock display', 'Element defaults', 'Rolling', 'Authoring',
			'Compendium', 'Links', 'Initiative tracker',
		]);
		// First section is active by default and is the ONLY one on screen.
		const active = (tab.containerEl as HTMLElement).querySelectorAll('.dse-settings-nav__tab.is-active');
		expect(active).toHaveLength(1);
		expect(active[0].textContent).toBe('Appearance');
		expect(visibleRowNames(tab)).toEqual([
			'Appearance', 'Theme', 'Reduce motion', 'Print preview', 'Initiative portraits',
		]);
		expect(visibleRowNames(tab)).not.toContain('Title font');
	});

	test('clicking a tab renders that section and drops the previous one', async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.display();
		openSection(tab, 'Rolling');
		expect(visibleRowNames(tab)).toEqual(['Rolling', 'Enable rolling', 'Roller', 'Click ability to roll']);
		expect(visibleRowNames(tab)).not.toContain('Theme');
		openSection(tab, 'Initiative tracker');
		expect(visibleRowNames(tab)).toEqual(['Initiative tracker', 'Default creature image path']);
		expect(visibleRowNames(tab)).not.toContain('Enable rolling');
	});

	test('the active tab survives the display() re-render a group reset triggers', async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.display();
		openSection(tab, 'Typography');
		const heading = Setting.created.filter((s) => s.heading && s.name === 'Typography').pop()!;
		heading.extraButtons[0].click();
		await flushAsync(2); // resetDescriptors → display()
		const active = (tab.containerEl as HTMLElement).querySelector('.dse-settings-nav__tab.is-active');
		expect(active?.textContent).toBe('Typography');
		expect(visibleRowNames(tab)).toContain('Title font');
	});

	test('search filters rows across ALL sections, by label and by help text', async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.display();
		const nav = (tab.containerEl as HTMLElement).querySelector('.dse-settings-nav')!;
		expect(nav.classList.contains('dse-hidden')).toBe(false); // empty query = plain tabs

		searchFor(tab, 'font');
		expect(nav.classList.contains('dse-hidden')).toBe(true);
		const names = visibleRowNames(tab);
		// Every Typography slot, from a section that was NOT the active tab…
		expect(names).toEqual(expect.arrayContaining([
			'Typography', 'Title font', 'Body font', 'Controls font',
			'Card body font', 'Label font', 'Monospace font',
		]));
		// …and nothing from the sections that do not match.
		expect(names).not.toContain('Enable rolling');
		expect(names).not.toContain('Default creature image path');

		// Chrome (the Compendium safety paragraph) is not a row and never a hit.
		searchFor(tab, 'never touched');
		expect(visibleRowNames(tab)).toEqual([]);
		// Help-text-only hits, in a generated section and a hand-written one alike.
		searchFor(tab, 'vault folder'); // Destination folder's help text
		expect(visibleRowNames(tab)).toEqual(['Compendium', 'Destination folder']);
		searchFor(tab, 'system reduced-motion'); // Reduce motion's help text
		expect(visibleRowNames(tab)).toEqual(['Appearance', 'Reduce motion']);
	});

	test('search: an ADVANCED row is surfaced inline, not left behind its disclosure', async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.display();
		searchFor(tab, 'monospace');
		expect(visibleRowNames(tab)).toEqual(['Typography', 'Monospace font']);
		expect((tab.containerEl as HTMLElement).querySelector('details.dse-settings-advanced')).toBeNull();
	});

	test('search: no match shows the empty state; clearing the query restores the tabs', async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.display();
		searchFor(tab, 'zzzznope');
		expect(visibleRowNames(tab)).toEqual([]);
		const empty = (tab.containerEl as HTMLElement).querySelector('.dse-settings-empty');
		expect(empty?.textContent).toContain('zzzznope');
		searchFor(tab, '');
		expect((tab.containerEl as HTMLElement).querySelector('.dse-settings-empty')).toBeNull();
		expect((tab.containerEl as HTMLElement).querySelector('.dse-settings-nav')!.classList.contains('dse-hidden')).toBe(false);
		expect(visibleRowNames(tab)).toContain('Theme');
	});

	test('a group reset from a FILTERED view still resets the full member list', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.display();
		openSection(tab, 'Statblock display');
		rowByName('Density').dropdowns[0].trigger('compact');
		rowByName('Secondary stats').dropdowns[0].trigger('ledger');
		await flushAsync(1);
		expect(prefs.get('sbDensity')).toBe('compact');
		expect(prefs.get('sbStats')).toBe('ledger');
		// Filter down to ONE of the two changed rows, then reset from that partial view.
		searchFor(tab, 'density');
		expect(visibleRowNames(tab)).toEqual(['Statblock display', 'Density']);
		const heading = Setting.created.filter((s) => s.heading && s.name === 'Statblock display').pop()!;
		heading.extraButtons[0].click();
		await flushAsync(2);
		expect(prefs.get('sbDensity')).toBe('comfortable');
		expect(prefs.get('sbStats')).toBe('grid'); // the row the view was HIDING
		expect(plugin.settings.prefs).toEqual({}); // OD-D4-4: back to the empty disk shape
	});

	test("'sections' mode (candidate B): every section collapsed, bodies rendered lazily on expand", async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.navMode = 'sections';
		tab.display();
		const container = tab.containerEl as HTMLElement;
		const details = Array.from(container.querySelectorAll<HTMLDetailsElement>('details.dse-settings-section'));
		expect(details).toHaveLength(9);
		expect(details.every((d) => !d.open)).toBe(true);
		expect(visibleRowNames(tab)).toEqual([]); // nothing rendered yet
		// The sticky mini-nav expands AND fills its target.
		const jump = Array.from(container.querySelectorAll<HTMLElement>('.dse-settings-mininav__item'))
			.find((item) => item.textContent === 'Element defaults')!;
		jump.click();
		const target = container.querySelector<HTMLDetailsElement>('details[data-section-id="element-defaults"]')!;
		expect(target.open).toBe(true);
		expect(visibleRowNames(tab)).toEqual(['Element defaults', 'Collapsible by default', 'Start collapsed']);
	});

	test("'off' mode (the pre-SC-131 contrast baseline) mounts exactly ONE preview, under Statblock display", async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.navMode = 'off';
		tab.display();
		const previews = (tab.containerEl as HTMLElement).querySelectorAll('.dse-settings-preview');
		expect(previews).toHaveLength(1);
		// It still sits inside the Statblock display block: the next heading after it is
		// the following group's.
		const names = Setting.created.filter((s) => s.heading).map((s) => s.name);
		expect(names).toContain('Statblock display');
	});

	test('the preview follows the REFLECTED groups: a home on Appearance/Typography/Statblock, none on the behavioral ones', async () => {
		const plugin = await makeLoadedPlugin();
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.display();
		const hasPreview = (): boolean =>
			(tab.containerEl as HTMLElement).querySelectorAll('.dse-settings-preview').length === 1;
		expect(hasPreview()).toBe(true); // Appearance (attr-bearing)
		openSection(tab, 'Typography');
		expect(hasPreview()).toBe(true); // css-bearing
		openSection(tab, 'Statblock display');
		expect(hasPreview()).toBe(true);
		for (const behavioral of ['Element defaults', 'Rolling', 'Authoring', 'Compendium']) {
			openSection(tab, behavioral);
			expect((tab.containerEl as HTMLElement).querySelectorAll('.dse-settings-preview')).toHaveLength(0);
		}
		// A filtered view has no preview either — it is not a section view.
		openSection(tab, 'Appearance');
		searchFor(tab, 'theme');
		expect((tab.containerEl as HTMLElement).querySelectorAll('.dse-settings-preview')).toHaveLength(0);
	});

	test('"Reset all preferences" lives in the shell footer and is reachable from every tab', async () => {
		const plugin = await makeLoadedPlugin();
		const prefs = plugin.frameworkV2!.services.prefs;
		const tab = new DseSettingTab(plugin.app as never, plugin);
		tab.display();
		rowByName('Reduce motion').toggles[0].trigger(true);
		await flushAsync(1);
		openSection(tab, 'Compendium'); // an operational tab, far from the pref groups
		const resetAll = Setting.created.filter((s) => s.buttons.some((b) => b.text === 'Reset all preferences')).pop()!;
		resetAll.buttons[0].click();
		await flushAsync(2);
		expect(prefs.get('reduceMotion')).toBe(false);
	});
});
