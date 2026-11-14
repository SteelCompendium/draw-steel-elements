// SC-440 — data.json integrity around the settings tab. The tab writes `data.json` (the PreferenceStore's sparse `prefs` slice plus
// the operational fields), so what it must NOT do matters as much as what it does: lose keys it does not know, rewrite a hand-edited
// value the UI cannot offer, move one setting when another changes, forget a second open note, or write the hidden `experimental` gate.
import { DSE_PREF_DESCRIPTORS, prefUi } from '@/prefs/catalog';
import { PREVIEW_FEATURE_YAML, PREVIEW_STATBLOCK_YAML } from '@views/SettingsPreview';
import { flushAsync } from '../../mocks/obsidian';
import { flushSaved, loadPlugin, openTab, owner, prefsOf, rowOf, type Loaded } from './_settingsHarness';

/* eslint-disable @typescript-eslint/no-explicit-any */

const STATBLOCK = PREVIEW_STATBLOCK_YAML.replace('prefs:\n  sbSticky: "off"\n', '');

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

afterEach(() => {
	document.body.innerHTML = '';
});

describe('SC-440 integrity: keys the tab does not own survive its writes', () => {
	const FOREIGN = { experimental: true, viewAdoption: false, someOtherPluginField: { nested: [1, 2, 3] }, settingsVersion: 3 };

	test('top-level keys in data.json (experimental, viewAdoption, anything unknown) are carried through a preference change, a preset, a reset and an operational change', async () => {
		const loaded = await loadPlugin({ ...FOREIGN, compendiumDestinationDirectory: 'Mine' });
		const tab = await openTab(loaded);
		rowOf(tab, { key: 'reduceMotion' }).toggles[0].trigger(true);
		rowOf(tab, { name: 'Preset' }).dropdowns[0].trigger('index');
		await flushAsync(3);
		let saved = await flushSaved(loaded);
		expect(saved).toMatchObject(FOREIGN);
		rowOf(tab, { key: 'compendiumReleaseTag' }).texts[0].trigger('v9');
		await flushAsync(2);
		saved = loaded.saves[loaded.saves.length - 1];
		expect(saved).toMatchObject({ ...FOREIGN, compendiumDestinationDirectory: 'Mine', compendiumReleaseTag: 'v9' });
		tab.settingItems.find((i: any) => i.name === 'Reset all preferences').action(null, 0);
		await flushAsync(4);
		saved = await flushSaved(loaded);
		expect(saved).toMatchObject({ ...FOREIGN, compendiumDestinationDirectory: 'Mine', compendiumReleaseTag: 'v9' });
		expect(saved.prefs).toEqual({});
	});

	test('a key inside `prefs` that no descriptor owns is dropped by the next preferences save (a retired / stale key: pinned, SC-406), the described ones are kept', async () => {
		const loaded = await loadPlugin({ experimental: true, prefs: { retiredKey: 'x', textScale: 1.2 } });
		const tab = await openTab(loaded);
		rowOf(tab, { key: 'reduceMotion' }).toggles[0].trigger(true);
		await flushAsync(2);
		expect((await flushSaved(loaded)).prefs).toEqual({ textScale: 1.2, reduceMotion: true });
	});

	test('operational changes (Destination folder, Release, Locale, Links, image path) never touch the preferences slice, and a preference change never touches them', async () => {
		const loaded = await loadPlugin({ experimental: true, settingsVersion: 3, prefs: { textScale: 1.2 }, compendiumDestinationDirectory: 'Keep', defaultImagePath: 'Media/a.png' });
		const tab = await openTab(loaded);
		rowOf(tab, { key: 'compendiumReleaseTag' }).texts[0].trigger('v1');
		rowOf(tab, { key: 'sccWebFallback' }).toggles[0].trigger(false);
		await flushAsync(2);
		expect(loaded.saves[loaded.saves.length - 1]).toMatchObject({ prefs: { textScale: 1.2 }, compendiumDestinationDirectory: 'Keep', defaultImagePath: 'Media/a.png' });
		rowOf(tab, { key: 'reduceMotion' }).toggles[0].trigger(true);
		await flushAsync(2);
		const saved = await flushSaved(loaded);
		expect(saved).toMatchObject({ compendiumReleaseTag: 'v1', sccWebFallback: false, compendiumDestinationDirectory: 'Keep', defaultImagePath: 'Media/a.png' });
		expect(saved.prefs).toEqual({ textScale: 1.2, reduceMotion: true });
	});

	test('the tab never writes `experimental`: absent stays absent through every kind of control and every reset; present stays exactly as it was', async () => {
		for (const gate of [{}, { experimental: true }] as Array<Record<string, unknown>>) {
			const loaded = await loadPlugin(gate);
			const tab = await openTab(loaded);
			const d = (k: string) => DSE_PREF_DESCRIPTORS.find((x) => String(x.key) === k)!;
			rowOf(tab, { key: 'reduceMotion' }).toggles[0].trigger(true); // toggle
			rowOf(tab, { key: 'sbDensity' }).dropdowns[0].trigger('compact'); // select
			rowOf(tab, { key: 'textScale' }).sliders[0].trigger(1.3); // slider
			rowOf(tab, { name: prefUi(d('fontTitle'))!.label }).dropdowns[0].trigger('Georgia'); // font
			rowOf(tab, { name: 'Preset' }).dropdowns[0].trigger('sourcebook'); // preset
			rowOf(tab, { key: 'compendiumReleaseTag' }).texts[0].trigger('v2'); // operational
			await flushAsync(3);
			let saved = await flushSaved(loaded);
			expect(Object.prototype.hasOwnProperty.call(saved, 'experimental')).toBe(gate.experimental === true);
			tab.settingItems.find((i: any) => i.name === 'Reset all preferences').action(null, 0);
			await flushAsync(4);
			saved = await flushSaved(loaded);
			expect(Object.prototype.hasOwnProperty.call(saved, 'experimental')).toBe(gate.experimental === true);
			if (gate.experimental) expect(saved.experimental).toBe(true);
		}
	});
});

describe('SC-440 integrity: a hand-edited value the UI does not offer renders sanely and is not rewritten by an unrelated change', () => {
	test('a slider value outside the range (textScale 5) reaches the element clamped, the slider is handed the stored value, and an unrelated change leaves it in data.json', async () => {
		const loaded = await loadPlugin({ experimental: true, prefs: { textScale: 5, cardScale: 0.1 } });
		const root = await mount(loaded, 'statblock', STATBLOCK, 'A.md');
		const tab = await openTab(loaded);
		expect(root.style.getPropertyValue('--dse-text-scale')).toBe('1.4'); // clamped by snap(), not 5
		expect(root.style.getPropertyValue('--dse-card-scale')).toBe('0.8');
		expect(rowOf(tab, { key: 'textScale' }).sliders[0].value).toBe(5); // the native range input clamps what it draws
		rowOf(tab, { key: 'reduceMotion' }).toggles[0].trigger(true);
		await flushAsync(2);
		expect((await flushSaved(loaded)).prefs).toEqual({ textScale: 5, cardScale: 0.1, reduceMotion: true });
		// Moving the slider itself stores the snapped value.
		rowOf(tab, { key: 'textScale' }).sliders[0].trigger(1.35);
		await flushAsync(2);
		expect((await flushSaved(loaded)).prefs).toMatchObject({ textScale: 1.35 });
	});

	test('a non-numeric slider value ("abc") and a numeric string ("1.2") are survivable: the element falls back to / reads the number, data.json keeps what was typed', async () => {
		const loaded = await loadPlugin({ experimental: true, prefs: { textScale: 'abc', cardScale: '1.2' } });
		const root = await mount(loaded, 'statblock', STATBLOCK, 'A.md');
		expect(root.style.getPropertyValue('--dse-text-scale')).toBe(''); // the inert default
		expect(root.style.getPropertyValue('--dse-card-scale')).toBe('1.2');
		const tab = await openTab(loaded);
		rowOf(tab, { key: 'reduceMotion' }).toggles[0].trigger(true);
		await flushAsync(2);
		expect((await flushSaved(loaded)).prefs).toEqual({ textScale: 'abc', cardScale: '1.2', reduceMotion: true });
	});

	test('an option value the dropdown does not list (sbDensity "dense") leaves the statblock on its stylesheet default and the preset on "Custom", and survives an unrelated change', async () => {
		const loaded = await loadPlugin({ experimental: true, prefs: { sbDensity: 'dense' } });
		const tab = await openTab(loaded);
		expect(rowOf(tab, { name: 'Preset' }).dropdowns[0].value).toBe('custom');
		rowOf(tab, { key: 'reduceMotion' }).toggles[0].trigger(true);
		await flushAsync(2);
		expect((await flushSaved(loaded)).prefs).toEqual({ sbDensity: 'dense', reduceMotion: true });
	});

	test('a stored value of the wrong type on a toggle (reduceMotion "yes", sbSticky true) neither throws nor is rewritten', async () => {
		const loaded = await loadPlugin({ experimental: true, prefs: { reduceMotion: 'yes', sbSticky: true } });
		const tab = await openTab(loaded);
		rowOf(tab, { key: 'portraits' }).toggles[0].trigger(false);
		await flushAsync(2);
		expect((await flushSaved(loaded)).prefs).toEqual({ reduceMotion: 'yes', sbSticky: true, portraits: 'off' });
	});
});

describe('SC-440 integrity: one change moves one setting', () => {
	test('every control, driven in turn from the defaults, changes exactly its own stored key', async () => {
		const rows = DSE_PREF_DESCRIPTORS.filter((d) => prefUi(d) && !prefUi(d)!.hidden && prefUi(d)!.control !== 'font');
		const loaded = await loadPlugin({ experimental: true });
		const tab = await openTab(loaded);
		for (const d of rows) {
			const ui = prefUi(d)!;
			const row = rowOf(tab, { key: String(d.key) });
			if (ui.control === 'toggle') row.toggles[0].trigger(typeof d.default === 'string' ? d.default !== 'on' : !(d.default as boolean));
			else if (ui.control === 'select') row.dropdowns[0].trigger(ui.options!.find((o) => o.value !== d.default)!.value);
			else if (ui.control === 'slider') row.sliders[0].trigger(ui.max!);
			await flushAsync(2);
			const keys = Object.keys((await flushSaved(loaded)).prefs);
			expect({ driven: String(d.key), stored: keys }).toEqual({ driven: String(d.key), stored: [String(d.key)] });
			// back to the default: the slice is empty again
			if (ui.control === 'toggle') row.toggles[0].trigger(typeof d.default === 'string' ? d.default === 'on' : (d.default as boolean));
			else if (ui.control === 'select') row.dropdowns[0].trigger(String(d.default));
			else row.sliders[0].trigger(d.default as number);
			await flushAsync(2);
			expect((await flushSaved(loaded)).prefs).toEqual({});
		}
	});
});

describe('SC-440 integrity: every open element re-renders, not just the first', () => {
	test('two elements in two open notes both pick up an attribute pref and a custom-property pref the moment the tab changes them', async () => {
		const loaded = await loadPlugin({ experimental: true });
		const tab = await openTab(loaded);
		const a = await mount(loaded, 'statblock', STATBLOCK, 'NoteA.md');
		const b = await mount(loaded, 'feature', PREVIEW_FEATURE_YAML, 'NoteB.md');
		for (const root of [a, b]) {
			expect(root.getAttribute('data-dse-reduce-motion')).toBe('false');
			expect(root.style.getPropertyValue('--dse-card-scale')).toBe('');
		}
		rowOf(tab, { key: 'reduceMotion' }).toggles[0].trigger(true);
		rowOf(tab, { key: 'cardScale' }).sliders[0].trigger(1.2);
		await flushAsync(2);
		for (const root of [a, b]) {
			expect(root.getAttribute('data-dse-reduce-motion')).toBe('true');
			expect(root.style.getPropertyValue('--dse-card-scale')).toBe('1.2');
		}
		// A reset reaches both too.
		tab.settingItems.find((i: any) => i.name === 'Reset all preferences').action(null, 0);
		await flushAsync(4);
		for (const root of [a, b]) {
			expect(root.getAttribute('data-dse-reduce-motion')).toBe('false');
			expect(root.style.getPropertyValue('--dse-card-scale')).toBe('');
		}
		expect(prefsOf(loaded).get('reduceMotion')).toBe(false);
	});

	test('an element mounted AFTER the change starts from the stored value (no stale default)', async () => {
		const loaded = await loadPlugin({ experimental: true });
		const tab = await openTab(loaded);
		rowOf(tab, { key: 'sbDensity' }).dropdowns[0].trigger('compact');
		await flushAsync(2);
		const root = await mount(loaded, 'statblock', STATBLOCK, 'Late.md');
		expect(root.getAttribute('data-dse-density')).toBe('compact');
	});
});
