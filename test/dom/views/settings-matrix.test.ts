// SC-440 — the settings tab's combinatorial logic, in jsdom: every descriptor x each of its values (what lands in data.json, what an
// element on screen shows), the experimental gate off vs on, section resets, the statblock presets (`inPreset`), the Advanced
// disclosure, the size sliders at min / max / step, the free-text fields, and the Sync / Check busy states. The real-Obsidian suite
// (e2e/specs/settings/) drives one real input per control; the values x states live here.
//
// Every control is driven the way the tab's own rows are: a Fake component's `trigger()` -> getControlValue/setControlValue ->
// PreferenceStore.set -> reflect() + the debounced saveData. The element "on screen" is a real ds-statblock mounted through the real
// pipeline (the same mount the tab's live preview uses).
import { DSE_PREF_DESCRIPTORS, EXPERIMENTAL_PREF_KEYS, GROUP_ORDER, deriveSbPreset, prefUi } from '@/prefs/catalog';
import type { PrefDescriptor } from '@/framework/seams/prefs';
import { PREVIEW_FEATURE_YAML, PREVIEW_STATBLOCK_YAML } from '@views/SettingsPreview';
import { Notice, Setting, flushAsync } from '../../mocks/obsidian';
import { DseSettingTab } from '@views/SettingsTab';
import { allDefs, flushSaved, loadPlugin, openTab, owner, prefsOf, rowOf, type Loaded } from './_settingsHarness';
import { setExperimental } from '@/framework/experimental';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The preview's statblock without its per-block `sbSticky: off` override (which would pin that one attribute), i.e. a statblock in a note. */
const STATBLOCK = PREVIEW_STATBLOCK_YAML.replace('prefs:\n  sbSticky: "off"\n', '');

/** The descriptors the tab draws a row for (gate on): everything with a `ui` that is not hidden. */
const ROWS = DSE_PREF_DESCRIPTORS.filter((d) => prefUi(d) && !prefUi(d)!.hidden);
const key = (d: PrefDescriptor): string => String(d.key);

/** Mount a real element through the real pipeline (what the tab's own live preview does) and return its root. */
async function mount(loaded: Loaded, id: 'statblock' | 'feature', yaml: string, path: string): Promise<HTMLElement> {
	const fw = loaded.plugin.frameworkV2!;
	const stage = document.createElement('div');
	document.body.appendChild(stage);
	const o = owner();
	await fw.pipeline.run(fw.registry.get(id)!, yaml, {
		mode: 'reading',
		sourcePath: path,
		containerEl: stage,
		canPersist: true,
		addChild: (child: any) => {
			o.addChild(child);
			return child;
		},
		getBlockInfo: () => null,
		replaceSource: async () => false,
		blockKey: () => `${path}::${id}`,
	} as any);
	await flushAsync(2);
	return stage.querySelector<HTMLElement>(`[data-dse-element="${id}"]`)!;
}

/** The values a control can be driven to (the pref's own value, not the UI's): both states, every option, a slider's min / default / one step / max. */
function domain(d: PrefDescriptor): unknown[] {
	const ui = prefUi(d)!;
	switch (ui.control) {
		case 'toggle':
			return typeof d.default === 'string' ? ['on', 'off'] : [true, false];
		case 'select':
		case 'font':
			return (ui.options ?? []).map((o) => o.value);
		case 'slider':
			return [ui.min!, d.default, Math.round((ui.min! + ui.step!) * 100) / 100, ui.max!];
		default:
			return [];
	}
}

/** Drive the control of `d` to `value` through its rendered row. */
async function drive(tab: any, d: PrefDescriptor, value: unknown): Promise<void> {
	const ui = prefUi(d)!;
	const row = ui.control === 'font' ? rowOf(tab, { name: ui.label }) : rowOf(tab, { key: key(d) });
	if (ui.control === 'toggle') row.toggles[0].trigger(typeof d.default === 'string' ? value === 'on' : (value as boolean));
	else if (ui.control === 'slider') row.sliders[0].trigger(value as number);
	else row.dropdowns[0].trigger(value as string); // select, font (a curated entry)
	await flushAsync(2);
}

/** What a control on screen shows for the descriptor `d` right now, in the control's own terms (toggle: on/off, select/font: option value, slider: number). */
function shownOf(tab: any, d: PrefDescriptor): unknown {
	const ui = prefUi(d)!;
	if (ui.control === 'font') return rowOf(tab, { name: ui.label }).dropdowns[0].value;
	const row = rowOf(tab, { key: key(d) });
	if (ui.control === 'toggle') return row.toggles[0].value;
	if (ui.control === 'slider') return row.sliders[0].value;
	return row.dropdowns[0].value;
}
/** The value a control shows for a descriptor at its default (toggle: on/off). */
const shownDefault = (d: PrefDescriptor): unknown => (prefUi(d)!.control === 'toggle' ? (typeof d.default === 'string' ? d.default === 'on' : d.default) : d.default);

/** The inline custom property a css-bearing pref leaves on an element, written out here rather than recomputed with the descriptor's own toCss:
 *  a font slot holds the quoted family then its fallback tail, a scale holds the number (and nothing at 1, the inert default). */
function expectCss(root: HTMLElement, d: PrefDescriptor, value: unknown): void {
	const got = root.style.getPropertyValue(d.css!.varName);
	if (d.css!.varName.startsWith('--dse-font-')) {
		if (value === '') expect(got).toBe('');
		else {
			// A named family is quoted; the CSS generic keywords (system-ui, monospace, serif...) are not.
			const head = ['system-ui', 'ui-monospace', 'monospace', 'serif', 'sans-serif'].includes(String(value)) ? String(value) : `"${String(value)}"`;
			expect(got.startsWith(`${head}, `)).toBe(true);
		}
	} else {
		expect(got).toBe(value === 1 ? '' : String(value));
	}
}

/** The three statblock presets, written out (catalog.ts SB_PRESETS, SC-123 / SC-146): nine members each. */
const PRESETS: Record<'steel' | 'sourcebook' | 'index', Record<string, string>> = {
	steel: { sbFeatureStyle: 'card', sbDensity: 'comfortable', sbColumns: 'single', sbStats: 'grid', kwUsage: 'crest', distTarget: 'grid', sbCharLine: 'two', sbCharBox: 'off', sbVillain: 'banded' },
	sourcebook: { sbFeatureStyle: 'flat', sbDensity: 'comfortable', sbColumns: 'single', sbStats: 'ledger', kwUsage: 'text', distTarget: 'text', sbCharLine: 'one', sbCharBox: 'on', sbVillain: 'inline' },
	index: { sbFeatureStyle: 'flat', sbDensity: 'compact', sbColumns: 'single', sbStats: 'gridc', kwUsage: 'grid', distTarget: 'grid', sbCharLine: 'two', sbCharBox: 'onword', sbVillain: 'banded' },
};

describe('SC-440 matrix: every descriptor x each of its values', () => {
	const cases = ROWS.flatMap((d) => domain(d).map((value) => [key(d), JSON.stringify(value), d, value] as const));
	// Not a single descriptor-count assertion: the catalog grows. A floor, so an empty table (a broken filter) cannot pass vacuously.
	test('the table is the catalog: 34+ rows, 100+ (descriptor, value) cases', () => {
		expect(ROWS.length).toBeGreaterThanOrEqual(34);
		expect(cases.length).toBeGreaterThanOrEqual(100);
	});

	describe.each(ROWS.map((d) => [key(d), d] as const))('%s', (_name, d) => {
		let loaded: Loaded;
		let tab: any;
		let root: HTMLElement;
		beforeAll(async () => {
			loaded = await loadPlugin({ experimental: true });
			tab = await openTab(loaded);
			root = await mount(loaded, 'statblock', STATBLOCK, 'Matrix.md');
		});
		afterAll(() => {
			document.body.innerHTML = '';
		});

		test.each(domain(d).map((v) => [JSON.stringify(v), v] as const))('value %s: lands in prefs, data.json (sparse) and on the rendered element, and moves nothing else', async (_label, value) => {
			const prefs = prefsOf(loaded);
			const before = new Map(prefs.descriptors().map((x) => [key(x), prefs.get(x.key as any)]));
			await drive(tab, d, value);
			expect(prefs.get(d.key as any)).toBe(value);
			// data.json: the SPARSE slice holds this key iff its value differs from the default, and nothing else.
			const saved = (await flushSaved(loaded)).prefs as Record<string, unknown>;
			expect(saved).toEqual(value === d.default ? {} : { [key(d)]: value });
			// The element on screen: the reflected attribute / inline custom property the setting controls (a behavioural pref has neither).
			if (d.attr) expect(root.getAttribute(`data-dse-${d.attr}`)).toBe(String(value));
			if (d.css) expectCss(root, d, value);
			// One setting moves one value.
			for (const x of prefs.descriptors()) if (key(x) !== key(d)) expect(prefs.get(x.key as any)).toBe(before.get(key(x)));
			await drive(tab, d, d.default); // back to the default for the next value
		});
	});
});

describe('SC-440 matrix: the font pickers\' free-text field and the "Custom…" entry', () => {
	test.each(['fontTitle', 'fontBody', 'fontControls', 'fontCardBody', 'fontLabel', 'fontMono'])('%s: a typed family saves raw and reaches the element sanitised; blank resets; picking Custom… saves nothing', async (fontKey) => {
		const loaded = await loadPlugin({ experimental: true });
		const tab = await openTab(loaded);
		const root = await mount(loaded, 'statblock', STATBLOCK, 'Fonts.md');
		const d = ROWS.find((x) => key(x) === fontKey)!;
		const row = rowOf(tab, { name: prefUi(d)!.label });
		const [dropdown, text] = [row.dropdowns[0], row.texts[0]];
		// Custom… reveals the free-text field and writes nothing by itself (the sentinel is never persisted).
		dropdown.trigger('__custom__');
		await flushAsync(1);
		expect(text.inputEl.classList.contains('dse-hidden')).toBe(false);
		expect(prefsOf(loaded).get(d.key as any)).toBe('');
		expect((await flushSaved(loaded)).prefs ?? {}).toEqual({});
		// A typed family is saved as typed; the element gets the sanitised stack.
		text.trigger('My Family');
		await flushAsync(2);
		expect(prefsOf(loaded).get(d.key as any)).toBe('My Family');
		expect((await flushSaved(loaded)).prefs).toEqual({ [fontKey]: 'My Family' });
		expect(root.style.getPropertyValue(d.css!.varName)).toMatch(/^"My Family", /);
		// Characters that could break out of the declaration are stripped before they reach the element.
		text.trigger('Evil";}body{display:none');
		await flushAsync(2);
		expect(root.style.getPropertyValue(d.css!.varName)).not.toMatch(/[;{}]/);
		// Blank (or only spaces) is the "Default" sentinel: nothing stored, no override on the element.
		text.trigger('   ');
		await flushAsync(2);
		expect(prefsOf(loaded).get(d.key as any)).toBe('');
		expect((await flushSaved(loaded)).prefs).toEqual({});
		expect(root.style.getPropertyValue(d.css!.varName)).toBe('');
		// Choosing a curated entry afterwards hides the field again and writes that entry.
		dropdown.trigger(prefUi(d)!.options![1].value);
		await flushAsync(1);
		expect(text.inputEl.classList.contains('dse-hidden')).toBe(true);
		expect(prefsOf(loaded).get(d.key as any)).toBe(prefUi(d)!.options![1].value);
		document.body.innerHTML = '';
	});

	test('"List installed fonts": the families are appended after the curated ones (deduped, sorted), the button is gone afterwards, a failure keeps the curated list', async () => {
		const loaded = await loadPlugin({ experimental: true });
		(window as any).queryLocalFonts = async () => [{ family: 'Zed Sans' }, { family: 'Alpha Mono' }, { family: 'Zed Sans' }, { family: 'Georgia' }];
		try {
			const tab = await openTab(loaded);
			let row = rowOf(tab, { name: 'Title font' });
			expect(row.extraButtons).toHaveLength(1);
			expect(row.dropdowns[0].options.map((o) => o.value).filter((v) => ['Zed Sans', 'Alpha Mono'].includes(v))).toEqual([]);
			row.extraButtons[0].click();
			await flushAsync(4);
			row = rowOf(tab, { name: 'Title font' });
			const values = row.dropdowns[0].options.map((o) => o.value);
			expect(values.slice(-3)).toEqual(['Alpha Mono', 'Zed Sans', '__custom__']);
			expect(values.filter((v) => v === 'Georgia')).toHaveLength(1); // already curated: not repeated
			expect(row.extraButtons).toHaveLength(0);
			// A rejected lookup (denied / unavailable) falls back to the curated list without an error.
			const failing = await loadPlugin({ experimental: true });
			(window as any).queryLocalFonts = async () => {
				throw new Error('denied');
			};
			const tab2 = await openTab(failing);
			rowOf(tab2, { name: 'Title font' }).extraButtons[0].click();
			await flushAsync(4);
			const after = rowOf(tab2, { name: 'Title font' }).dropdowns[0].options.map((o) => o.value);
			expect(after[after.length - 1]).toBe('__custom__');
			expect(after).toHaveLength(prefUi(ROWS.find((x) => key(x) === 'fontTitle')!)!.options!.length + 1);
		} finally {
			delete (window as any).queryLocalFonts;
		}
	});
});

describe('SC-440 matrix: the size sliders at min, max and step', () => {
	const SLIDERS = ROWS.filter((d) => prefUi(d)!.control === 'slider');
	test('five sliders, each with the limits the descriptor declares', async () => {
		expect(SLIDERS.map(key)).toEqual(['textScale', 'cardScale', 'smallTextScale', 'largeTextScale', 'controlTextScale']);
		const tab = await openTab(await loadPlugin({ experimental: true }));
		for (const d of SLIDERS) {
			const ui = prefUi(d)!;
			expect({ key: key(d), limits: rowOf(tab, { key: key(d) }).sliders[0].limits }).toEqual({ key: key(d), limits: { min: ui.min, max: ui.max, step: ui.step } });
			expect(rowOf(tab, { key: key(d) }).sliders[0].value).toBe(d.default);
		}
	});

	test.each(SLIDERS.map((d) => [key(d), d] as const))('%s: below min / above max / off-step / non-finite values snap, and what is stored is the snapped value', async (_k, d) => {
		const ui = prefUi(d)!;
		const loaded = await loadPlugin({ experimental: true });
		const tab = await openTab(loaded);
		const slider = rowOf(tab, { key: key(d) }).sliders[0];
		const cases: Array<[number, number]> = [
			[ui.min! - 5, ui.min!], // clamped up
			[ui.max! + 5, ui.max!], // clamped down
			[ui.min! + ui.step! * 0.4, ui.min!], // rounds to the nearest step (down)
			[ui.min! + ui.step! * 0.6, Math.round((ui.min! + ui.step!) * 100) / 100], // (up)
			[NaN, d.default as number], // non-finite -> the default
			[ui.min!, ui.min!],
			[ui.max!, ui.max!],
		];
		for (const [typed, snapped] of cases) {
			slider.trigger(typed);
			await flushAsync(2);
			expect({ typed, stored: prefsOf(loaded).get(d.key as any) }).toEqual({ typed, stored: snapped });
		}
		// The default is "no stored value": the inert, unset state.
		slider.trigger(d.default as number);
		await flushAsync(2);
		expect((await flushSaved(loaded)).prefs).toEqual({});
	});

	test('one step is exactly 0.05 on every slider: 17 positions on Text size (60-140%) and 9 on the other four (80-120%)', () => {
		const positions = (d: PrefDescriptor): number => Math.round((prefUi(d)!.max! - prefUi(d)!.min!) / prefUi(d)!.step!) + 1;
		expect(SLIDERS.map(positions)).toEqual([17, 9, 9, 9, 9]);
	});
});

describe('SC-440 matrix: the statblock presets (inPreset)', () => {
	const MEMBERS = Object.keys(PRESETS.steel).sort();
	test('the preset members are exactly the descriptors flagged inPreset, spread over the Statblock and Feature pages', () => {
		const flagged = ROWS.filter((d) => prefUi(d)!.inPreset);
		expect(flagged.map(key).sort()).toEqual(MEMBERS);
		expect([...new Set(flagged.map((d) => prefUi(d)!.group))].sort()).toEqual(['Feature display', 'Statblock display']);
	});

	test.each(['steel', 'sourcebook', 'index'] as const)('picking %s writes its nine members, leaves every other setting alone, and re-derives to itself', async (preset) => {
		const loaded = await loadPlugin({ experimental: true });
		const prefs = prefsOf(loaded);
		await prefs.set('reduceMotion', true);
		await prefs.set('textScale', 1.2);
		await prefs.set('rollingEnabled', true);
		await prefs.set('sbSticky', 'off');
		const tab = await openTab(loaded);
		const dropdown = rowOf(tab, { name: 'Preset' }).dropdowns[0];
		if (preset === 'steel') {
			// Steel is the shipped state, so picking it from there proves nothing: start from another preset.
			dropdown.trigger('index');
			await flushAsync(3);
			expect(deriveSbPreset(prefs)).toBe('index');
		}
		dropdown.trigger(preset);
		await flushAsync(3);
		for (const [member, value] of Object.entries(PRESETS[preset])) expect({ member, value: prefs.get(member as any) }).toEqual({ member, value });
		// Not preset members: untouched.
		expect([prefs.get('reduceMotion'), prefs.get('textScale'), prefs.get('rollingEnabled'), prefs.get('sbSticky')]).toEqual([true, 1.2, true, 'off']);
		expect(deriveSbPreset(prefs)).toBe(preset);
		expect(rowOf(tab, { name: 'Preset' }).dropdowns[0].value).toBe(preset);
		// data.json: the preset's non-default members plus the four unrelated settings, nothing else.
		const expected: Record<string, unknown> = { reduceMotion: true, textScale: 1.2, rollingEnabled: true, sbSticky: 'off' };
		for (const [member, value] of Object.entries(PRESETS[preset])) if (value !== PRESETS.steel[member]) expected[member] = value;
		expect((await flushSaved(loaded)).prefs).toEqual(expected);
	});

	test.each(MEMBERS)('changing the single member %s by hand makes the preset "Custom" (and picking "Custom" itself changes nothing)', async (member) => {
		const loaded = await loadPlugin({ experimental: true });
		const tab = await openTab(loaded);
		const d = ROWS.find((x) => key(x) === member)!;
		const other = domain(d).find((v) => v !== d.default)!;
		expect(rowOf(tab, { name: 'Preset' }).dropdowns[0].value).toBe('steel');
		await drive(tab, d, other);
		const preset = rowOf(tab, { name: 'Preset' }).dropdowns[0];
		expect(preset.value).toBe('custom');
		const before = (await flushSaved(loaded)).prefs;
		preset.trigger('custom');
		await flushAsync(2);
		expect((await flushSaved(loaded)).prefs).toEqual(before);
		expect(prefsOf(loaded).get(d.key as any)).toBe(other);
	});

	test('a preset applied while another is active replaces it wholesale (index -> sourcebook -> steel leaves the sparse slice empty)', async () => {
		const loaded = await loadPlugin({ experimental: true });
		const tab = await openTab(loaded);
		for (const preset of ['index', 'sourcebook', 'steel']) {
			rowOf(tab, { name: 'Preset' }).dropdowns[0].trigger(preset);
			await flushAsync(3);
		}
		expect(deriveSbPreset(prefsOf(loaded))).toBe('steel');
		expect((await flushSaved(loaded)).prefs).toEqual({});
	});
});

describe('SC-440 matrix: the Advanced disclosure and the reset rows', () => {
	const SECTIONS = GROUP_ORDER.filter((g) => ROWS.some((d) => prefUi(d)!.group === g));

	test('each section\'s Advanced page holds exactly its `advanced` descriptors, and only Typography, Statblock display and Element defaults have one', async () => {
		const tab = await openTab(await loadPlugin({ experimental: true }));
		const withAdvanced: Record<string, string[]> = {};
		for (const page of tab.settingItems.filter((i: any) => i.type === 'page')) {
			const group = page.items[0];
			const adv = group.items.find((i: any) => i.type === 'page' && i.name === 'Advanced');
			const primary = group.items.filter((i: any) => i.type !== 'page' && i.control).map((i: any) => i.control.key);
			const primaryRender = group.items.filter((i: any) => i.render && i.name).map((i: any) => i.name);
			const section = ROWS.filter((d) => prefUi(d)!.group === page.name);
			if (adv) withAdvanced[page.name] = allDefs(adv.items).map((i: any) => i.control?.key ?? ROWS.find((d) => prefUi(d)!.label === i.name)!.key);
			// No primary row is an `advanced` descriptor.
			const advancedKeys = section.filter((d) => prefUi(d)!.advanced).map(key);
			for (const k of primary) expect(advancedKeys).not.toContain(k);
			for (const name of primaryRender) expect(section.filter((d) => prefUi(d)!.advanced).map((d) => prefUi(d)!.label)).not.toContain(name);
			if (page.name in withAdvanced) expect(withAdvanced[page.name].sort()).toEqual(advancedKeys.sort());
			else expect(advancedKeys).toEqual([]);
		}
		expect(Object.keys(withAdvanced)).toEqual(['Typography', 'Statblock display', 'Element defaults']);
		expect(withAdvanced).toEqual({
			Typography: expect.arrayContaining(['fontCardBody', 'fontLabel', 'fontMono']),
			'Statblock display': expect.arrayContaining(['sbCharLine', 'sbCharBox', 'sbVillain']),
			'Element defaults': ['staminaRecoveryPopover'],
		});
	});

	test.each(SECTIONS)('"Reset %s" restores every setting of the section (the Advanced ones too), leaves every other section\'s values, and empties the section from data.json', async (section) => {
		const loaded = await loadPlugin({ experimental: true });
		const prefs = prefsOf(loaded);
		const tab = await openTab(loaded);
		const mine = ROWS.filter((d) => prefUi(d)!.group === section);
		const others = ROWS.filter((d) => prefUi(d)!.group !== section);
		// Every setting of every section off its default.
		const nonDefault = new Map<string, unknown>();
		for (const d of ROWS) {
			const v = domain(d).find((x) => x !== d.default)!;
			await drive(tab, d, v);
			nonDefault.set(key(d), v);
		}
		const reset = allDefs(tab.settingItems).find((d) => d.name === `Reset ${section.toLowerCase()}`);
		expect(reset).toBeDefined();
		reset.action(null, 0);
		await flushAsync(3);
		for (const d of mine) expect({ key: key(d), value: prefs.get(d.key as any) }).toEqual({ key: key(d), value: d.default });
		for (const d of others) expect({ key: key(d), value: prefs.get(d.key as any) }).toEqual({ key: key(d), value: nonDefault.get(key(d)) });
		// The page is redrawn (SettingsTab.resetDescriptors -> update()): the controls ON SCREEN show the defaults, not what was typed in before the reset.
		for (const d of mine) expect({ key: key(d), shown: shownOf(tab, d) }).toEqual({ key: key(d), shown: shownDefault(d) });
		// (the Preset still reads Custom: the two Feature display members, on another page, are off their defaults)
		if (section === 'Statblock display') expect(rowOf(tab, { name: 'Preset' }).dropdowns[0].value).toBe('custom');
		const saved = (await flushSaved(loaded)).prefs as Record<string, unknown>;
		for (const d of mine) expect(Object.keys(saved)).not.toContain(key(d));
		for (const d of others) expect({ key: key(d), value: saved[key(d)] }).toEqual({ key: key(d), value: nonDefault.get(key(d)) });
	});

	test('"Reset all preferences" restores every setting in every section, sparse slice and all', async () => {
		const loaded = await loadPlugin({ experimental: true });
		const tab = await openTab(loaded);
		for (const d of ROWS) await drive(tab, d, domain(d).find((x) => x !== d.default));
		expect(Object.keys((await flushSaved(loaded)).prefs).length).toBeGreaterThanOrEqual(30);
		const all = tab.settingItems.find((i: any) => i.name === 'Reset all preferences');
		all.action(null, 0);
		await flushAsync(4);
		for (const d of ROWS) expect({ key: key(d), value: prefsOf(loaded).get(d.key as any) }).toEqual({ key: key(d), value: d.default });
		for (const d of ROWS) expect({ key: key(d), shown: shownOf(tab, d) }).toEqual({ key: key(d), shown: shownDefault(d) }); // and the page was redrawn
		expect(rowOf(tab, { name: 'Preset' }).dropdowns[0].value).toBe('steel');
		expect((await flushSaved(loaded)).prefs).toEqual({});
	});
});

describe('SC-440 matrix: the experimental gate, off vs on', () => {
	const GATED_LABELS = ['Print preview', 'Show edit button on rendered blocks'];
	const pageNames = (tab: any): string[] => tab.settingItems.filter((i: any) => i.type === 'page').map((p: any) => p.name);
	const rowNames = (tab: any): string[] => allDefs(tab.settingItems).map((d) => d.name).filter(Boolean);

	test('off (the shipped tab): no Authoring page, no Print preview row, and the two gated descriptors do not exist', async () => {
		const loaded = await loadPlugin({});
		const tab = await openTab(loaded);
		expect(pageNames(tab)).toEqual(['Appearance', 'Typography', 'Statblock display', 'Featureblock display', 'Feature display', 'Element defaults', 'Rolling', 'Compendium', 'Links', 'Initiative tracker']);
		for (const label of GATED_LABELS) expect(rowNames(tab)).not.toContain(label);
		expect(prefsOf(loaded).descriptors().map(key)).not.toEqual(expect.arrayContaining(EXPERIMENTAL_PREF_KEYS as string[]));
		for (const k of EXPERIMENTAL_PREF_KEYS) expect(prefsOf(loaded).descriptors().map(key)).not.toContain(k);
		expect(allDefs(tab.settingItems).some((d) => d.name === 'Reset authoring')).toBe(false);
	});

	test('on: the Authoring page (one toggle and its reset) and the Print preview row appear, everything else is the same', async () => {
		const off = await openTab(await loadPlugin({}));
		const onLoaded = await loadPlugin({ experimental: true });
		const on = await openTab(onLoaded);
		expect(pageNames(on)).toEqual(['Appearance', 'Typography', 'Statblock display', 'Featureblock display', 'Feature display', 'Element defaults', 'Rolling', 'Authoring', 'Compendium', 'Links', 'Initiative tracker']);
		for (const label of GATED_LABELS) expect(rowNames(on)).toContain(label);
		expect(rowNames(on).filter((n) => !rowNames(off).includes(n)).sort()).toEqual(['Print preview', 'Reset authoring', 'Show edit button on rendered blocks']);
		expect(rowNames(off).filter((n) => !rowNames(on).includes(n))).toEqual([]);
		// The gated toggles work like any other: print preview is the 'on'|'off' string pref, authoring a boolean.
		rowOf(on, { name: 'Print preview' }).toggles[0].trigger(true);
		rowOf(on, { name: 'Show edit button on rendered blocks' }).toggles[0].trigger(true);
		await flushAsync(2);
		expect(prefsOf(onLoaded).get('printPreview')).toBe('on');
		expect(prefsOf(onLoaded).get('authoringControls')).toBe(true);
		expect((await flushSaved(onLoaded)).prefs).toEqual({ printPreview: 'on', authoringControls: true });
	});

	test('switching the gate off with values stored: the rows vanish, the stored values stay in data.json through an unrelated change, and come back with the gate on', async () => {
		const stored = { printPreview: 'on', authoringControls: true };
		const offLoaded = await loadPlugin({ prefs: stored });
		const offTab = await openTab(offLoaded);
		rowOf(offTab, { name: 'Reduce motion' }).toggles[0].trigger(true);
		await flushAsync(2);
		expect((await flushSaved(offLoaded)).prefs).toEqual({ ...stored, reduceMotion: true });
		setExperimental(true);
		const onLoaded = await loadPlugin({ experimental: true, prefs: (await flushSaved(offLoaded)).prefs });
		const onTab = await openTab(onLoaded);
		expect(rowOf(onTab, { name: 'Print preview' }).toggles[0].value).toBe(true);
		expect(rowOf(onTab, { name: 'Show edit button on rendered blocks' }).toggles[0].value).toBe(true);
	});
});

describe('SC-440 matrix: the dependent row (Sticky mini-header: include secondary stats)', () => {
	test('disabled while its parent is off, live-enabled when the parent comes back on, and its own value is kept either way', async () => {
		const loaded = await loadPlugin({ experimental: true });
		const tab = await openTab(loaded);
		const parent = rowOf(tab, { key: 'sbSticky' });
		const child = rowOf(tab, { key: 'sbStickyMeta' });
		expect(child.toggles[0].disabled).toBe(false);
		child.toggles[0].trigger(false);
		await flushAsync(2);
		parent.toggles[0].trigger(false);
		await flushAsync(2);
		expect(child.toggles[0].disabled).toBe(true);
		expect(prefsOf(loaded).get('sbStickyMeta')).toBe('off'); // the child keeps its own value
		parent.toggles[0].trigger(true);
		await flushAsync(2);
		expect(child.toggles[0].disabled).toBe(false);
		expect(prefsOf(loaded).get('sbStickyMeta')).toBe('off');
	});
});

describe('SC-440 matrix: the Compendium, Links and Initiative tracker fields (data.json fields, not preferences)', () => {
	test('Destination folder, Release, Locale and Default creature image path persist what is entered, and a cleared Release means "latest"', async () => {
		const loaded = await loadPlugin({ experimental: true });
		const tab = await openTab(loaded);
		rowOf(tab, { key: 'compendiumDestinationDirectory' }).texts[0].trigger('Rules/Draw Steel');
		rowOf(tab, { key: 'compendiumReleaseTag' }).texts[0].trigger('v4.20260716T000000');
		rowOf(tab, { key: 'defaultImagePath' }).texts[0].trigger('Media/boss.png');
		rowOf(tab, { key: 'compendiumLocale' }).dropdowns[0].trigger('en');
		await flushAsync(3);
		const saved = loaded.saves[loaded.saves.length - 1];
		expect(saved).toMatchObject({
			compendiumDestinationDirectory: 'Rules/Draw Steel',
			compendiumReleaseTag: 'v4.20260716T000000',
			defaultImagePath: 'Media/boss.png',
			compendiumLocale: 'en',
		});
		expect(loaded.plugin.syncOptions()).toEqual({ root: 'Rules/Draw Steel', releaseTag: 'v4.20260716T000000', locale: 'en' });
		rowOf(tab, { key: 'compendiumReleaseTag' }).texts[0].trigger('');
		await flushAsync(2);
		expect(loaded.plugin.syncOptions().releaseTag).toBeUndefined();
	});

	test('the Locale dropdown offers English only, and the SCC link fallback toggle writes sccWebFallback (default on)', async () => {
		const loaded = await loadPlugin({ experimental: true });
		const tab = await openTab(loaded);
		expect(rowOf(tab, { key: 'compendiumLocale' }).dropdowns[0].options).toEqual([{ value: 'en', label: 'English' }]);
		const toggle = rowOf(tab, { key: 'sccWebFallback' }).toggles[0];
		expect(toggle.value).toBe(true);
		toggle.trigger(false);
		await flushAsync(2);
		expect(loaded.plugin.settings.sccWebFallback).toBe(false);
		expect(loaded.saves[loaded.saves.length - 1].sccWebFallback).toBe(false);
	});
});

describe('SC-440 matrix: Sync and Check for updates, busy state x label x disabled x Notice', () => {
	const buttonsOf = (tab: any): { sync: any; check: any } => {
		const row = rowOf(tab, { name: 'Sync compendium' });
		return { sync: row.buttons[0], check: row.buttons[1] };
	};

	test.each([
		[null, 'Sync', 'Check for updates', false],
		['sync', 'Syncing…', 'Check for updates', true],
		['check', 'Sync', 'Checking…', true],
	] as const)('while %s is in flight: Sync reads "%s", Check reads "%s", disabled = %s on both, and the state clears when it ends', async (kind, syncText, checkText, disabled) => {
		const loaded = await loadPlugin({ experimental: true });
		const tab = await openTab(loaded);
		const token = kind ? loaded.plugin.syncService.beginOperation(kind) : null;
		const { sync, check } = buttonsOf(tab);
		expect([sync.text, check.text, sync.disabled, check.disabled]).toEqual([syncText, checkText, disabled, disabled]);
		if (token) {
			loaded.plugin.syncService.endOperation(token);
			expect([sync.text, check.text, sync.disabled, check.disabled]).toEqual(['Sync', 'Check for updates', false, false]);
		}
	});

	test('a tab opened while a sync is already running renders both buttons disabled at once', async () => {
		const loaded = await loadPlugin({ experimental: true });
		const token = loaded.plugin.syncService.beginOperation('sync')!;
		const { sync, check } = buttonsOf(await openTab(loaded));
		expect([sync.disabled, check.disabled, sync.text]).toEqual([true, true, 'Syncing…']);
		loaded.plugin.syncService.endOperation(token);
	});

	test('a click on a disabled button does nothing; an enabled Sync runs the plugin\'s sync once', async () => {
		const loaded = await loadPlugin({ experimental: true });
		const sync = jest.spyOn(loaded.plugin, 'syncCompendium').mockResolvedValue(undefined);
		const check = jest.spyOn(loaded.plugin.syncService, 'checkForUpdates');
		const tab = await openTab(loaded);
		const token = loaded.plugin.syncService.beginOperation('check')!;
		buttonsOf(tab).sync.click();
		buttonsOf(tab).check.click();
		expect(sync).not.toHaveBeenCalled();
		expect(check).not.toHaveBeenCalled();
		loaded.plugin.syncService.endOperation(token);
		buttonsOf(tab).sync.click();
		expect(sync).toHaveBeenCalledTimes(1);
	});

	test.each([
		['up to date', { installedTag: 'v1', latestTag: 'v1', upToDate: true }, 'Compendium is up to date (v1).'],
		['an update', { installedTag: 'v1', latestTag: 'v2', upToDate: false }, 'Update available: v2 (installed: v1).'],
		['an update, nothing installed', { installedTag: null, latestTag: 'v2', upToDate: false }, 'Update available: v2 (installed: none).'],
	])('Check for updates, %s: the Notice says so', async (_label, result, message) => {
		const loaded = await loadPlugin({ experimental: true });
		jest.spyOn(loaded.plugin.syncService, 'checkForUpdates').mockResolvedValue(result);
		const tab = await openTab(loaded);
		Notice.notices.length = 0;
		buttonsOf(tab).check.click();
		await flushAsync(3);
		expect(Notice.notices).toEqual([message]);
	});

	test('Check for updates: a failure is reported as "Update check failed — <message>", and a refused check (the service already showed its own Notice) adds none', async () => {
		const loaded = await loadPlugin({ experimental: true });
		const spy = jest.spyOn(loaded.plugin.syncService, 'checkForUpdates').mockRejectedValue(new Error('GitHub release lookup failed (HTTP 403)'));
		const tab = await openTab(loaded);
		Notice.notices.length = 0;
		buttonsOf(tab).check.click();
		await flushAsync(3);
		expect(Notice.notices).toEqual(['Update check failed — GitHub release lookup failed (HTTP 403)']);
		spy.mockResolvedValue(null);
		Notice.notices.length = 0;
		buttonsOf(tab).check.click();
		await flushAsync(3);
		expect(Notice.notices).toEqual([]);
	});
});

describe('SC-440 matrix: a live element re-renders, and the behavioural rolling prefs reach an open ability card', () => {
	test('the Roll controls of an open ds-feature appear when "Enable rolling" is switched on and go when it is switched off, with no re-mount by the test', async () => {
		const loaded = await loadPlugin({ experimental: true });
		const tab = await openTab(loaded);
		const card = await mount(loaded, 'feature', PREVIEW_FEATURE_YAML, 'Feature.md');
		const roll = (): number => card.querySelectorAll('[data-dse-control="roll.launch"]').length;
		expect(roll()).toBe(0);
		rowOf(tab, { key: 'rollingEnabled' }).toggles[0].trigger(true);
		await flushAsync(4);
		expect(roll()).toBeGreaterThan(0);
		rowOf(tab, { key: 'rollingEnabled' }).toggles[0].trigger(false);
		await flushAsync(4);
		expect(roll()).toBe(0);
		document.body.innerHTML = '';
	});
});

describe('SC-440 matrix: a plugin reload (data.json read back) shows every control as it was left', () => {
	test('every preference and every operational field, set off its default, is the control\'s shown value after a reload, and the element agrees', async () => {
		const first = await loadPlugin({ experimental: true });
		const tab = await openTab(first);
		const expected = new Map<string, unknown>();
		for (const d of ROWS) {
			const ui = prefUi(d)!;
			const v = ui.control === 'slider' ? ui.max! : domain(d).find((x) => x !== d.default)!;
			await drive(tab, d, v);
			expected.set(key(d), v);
		}
		rowOf(tab, { key: 'compendiumDestinationDirectory' }).texts[0].trigger('Rules');
		rowOf(tab, { key: 'compendiumReleaseTag' }).texts[0].trigger('v1');
		rowOf(tab, { key: 'defaultImagePath' }).texts[0].trigger('Media/b.png');
		rowOf(tab, { key: 'sccWebFallback' }).toggles[0].trigger(false);
		await flushAsync(3);
		const saved = await flushSaved(first);
		expect(Object.keys(saved.prefs)).toHaveLength(ROWS.length); // every control is off its default: all stored

		const second = await loadPlugin(saved);
		const tab2 = await openTab(second);
		const root = await mount(second, 'statblock', STATBLOCK, 'Reload.md');
		for (const d of ROWS) {
			const ui = prefUi(d)!;
			const v = expected.get(key(d));
			expect({ key: key(d), pref: prefsOf(second).get(d.key as any) }).toEqual({ key: key(d), pref: v });
			if (ui.control === 'toggle') expect({ key: key(d), shown: rowOf(tab2, { key: key(d) }).toggles[0].value }).toEqual({ key: key(d), shown: typeof d.default === 'string' ? v === 'on' : v });
			else if (ui.control === 'slider') expect({ key: key(d), shown: rowOf(tab2, { key: key(d) }).sliders[0].value }).toEqual({ key: key(d), shown: v });
			else if (ui.control === 'select') expect({ key: key(d), shown: rowOf(tab2, { key: key(d) }).dropdowns[0].value }).toEqual({ key: key(d), shown: v });
			else expect({ key: key(d), shown: rowOf(tab2, { name: ui.label }).dropdowns[0].value }).toEqual({ key: key(d), shown: v });
			if (d.attr) expect(root.getAttribute(`data-dse-${d.attr}`)).toBe(String(v));
			if (d.css) expectCss(root, d, v);
		}
		expect(rowOf(tab2, { key: 'compendiumDestinationDirectory' }).texts[0].value).toBe('Rules');
		expect(rowOf(tab2, { key: 'compendiumReleaseTag' }).texts[0].value).toBe('v1');
		expect(rowOf(tab2, { key: 'defaultImagePath' }).texts[0].value).toBe('Media/b.png');
		expect(rowOf(tab2, { key: 'sccWebFallback' }).toggles[0].value).toBe(false);
		// A reloaded preset still derives: nine members off their defaults at once is "Custom".
		expect(rowOf(tab2, { name: 'Preset' }).dropdowns[0].value).toBe('custom');
	});

	test('a font stored as a curated entry reopens on that entry with the free-text field hidden; one stored as something else reopens on "Custom…" with the field showing it', async () => {
		const loaded = await loadPlugin({ experimental: true, prefs: { fontTitle: 'Georgia', fontBody: 'My Family', fontMono: 'Fira Code' } });
		const tab = await openTab(loaded);
		const title = rowOf(tab, { name: 'Title font' });
		expect([title.dropdowns[0].value, title.texts[0].inputEl.classList.contains('dse-hidden')]).toEqual(['Georgia', true]);
		const body = rowOf(tab, { name: 'Body font' });
		expect([body.dropdowns[0].value, body.texts[0].value, body.texts[0].inputEl.classList.contains('dse-hidden')]).toEqual(['__custom__', 'My Family', false]);
		const mono = rowOf(tab, { name: 'Monospace font' });
		expect([mono.dropdowns[0].value, mono.texts[0].inputEl.classList.contains('dse-hidden')]).toEqual(['Fira Code', true]);
		const controls = rowOf(tab, { name: 'Controls font' });
		expect([controls.dropdowns[0].value, controls.texts[0].inputEl.classList.contains('dse-hidden')]).toEqual(['', true]);
	});
});

describe('SC-440 matrix: id stamping is best effort (the plugin supports obsidian 1.13, whose typings have no getElementForDefinition)', () => {
	const names = (): string[] => Setting.created.map((s) => s.name).filter(Boolean);

	test.each([
		['absent', undefined],
		['throwing', () => { throw new Error('no such element'); }],
	] as Array<[string, unknown]>)('a tab whose getElementForDefinition is %s still renders every row of every page, and every visible predicate answers true', async (_mode, impl) => {
		const loaded = await loadPlugin({ experimental: true });
		await openTab(loaded);
		const expected = names();
		expect(expected.length).toBeGreaterThanOrEqual(50);
		Setting.created.length = 0;
		const tab: any = new DseSettingTab(loaded.plugin.app as never, loaded.plugin);
		tab.getElementForDefinition = impl; // shadows the mock's, as on a build without it
		tab.update();
		expect(() => tab.renderTab()).not.toThrow();
		await flushAsync(3);
		expect(names()).toEqual(expected);
		const predicates = allDefs(tab.settingItems).map((d) => d.visible).filter((v) => typeof v === 'function');
		expect(predicates.length).toBeGreaterThan(40);
		for (const visible of predicates) expect(visible()).toBe(true);
		// The nested pages and the index rows carry the predicate too.
		for (const page of tab.settingItems.filter((i: any) => i.type === 'page')) expect(page.visible()).toBe(true);
		// Nothing was stamped on the native rows; the rows the tab's own render callbacks build still carry their ids.
		expect(tab.containerEl.querySelector('[data-dse-control="settings.reduce-motion"]')).toBeNull();
		expect(tab.containerEl.querySelector('[data-dse-control="settings.sb-preset"]')).not.toBeNull();
	});
});

describe('SC-440 matrix: the SCC link fallback is read live where a link is CLICKED', () => {
	test('the resolver the click handler asks answers a steelcompendium.io link with the toggle on and "unresolved" with it off, the moment the tab flips it', async () => {
		const loaded = await loadPlugin({ experimental: true });
		const tab = await openTab(loaded);
		const resolve = (): string => (loaded.plugin as any).sccResolver.resolve('scc.v1:mcdm.heroes.v1/feature.ability.fury.level-1/gouge').kind;
		expect(resolve()).toBe('web');
		rowOf(tab, { key: 'sccWebFallback' }).toggles[0].trigger(false);
		await flushAsync(2);
		expect(resolve()).toBe('unresolved');
		rowOf(tab, { key: 'sccWebFallback' }).toggles[0].trigger(true);
		await flushAsync(2);
		expect(resolve()).toBe('web');
	});
});
