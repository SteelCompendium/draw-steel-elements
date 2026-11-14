// SC-440 — shared harness for the settings-tab matrix and integrity suites: load the REAL plugin (onload), open the REAL
// DseSettingTab against the obsidian mock's declarative host, drive a control the way the tab's own rows do (the Fake components'
// `trigger()` -> getControlValue/setControlValue -> PreferenceStore -> debounced saveData), and read what landed in `data.json`.
//
// The jest default experimental switch is ON (test/setup/experimental-on.ts); a test of the shipped (OFF) state passes data with no
// `experimental` key and calls `setExperimental(false)` first, exactly as test/dom/framework/experimentalGate.test.ts does.
import DrawSteelAdmonitionPlugin from 'main';
import { DseSettingTab } from '@views/SettingsTab';
import { setExperimental } from '@/framework/experimental';
import { Component, Setting, App, flushAsync } from '../../mocks/obsidian';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Loaded {
	app: any;
	plugin: DrawSteelAdmonitionPlugin;
	/** Every `saveData` payload, deep-copied, in order. */
	saves: Record<string, any>[];
}

/** Load the real plugin with `data` as its data.json (`experimental: true` in it turns the gate on; absent = shipped state). */
export async function loadPlugin(data: Record<string, unknown> = { experimental: true }): Promise<Loaded> {
	setExperimental(data.experimental === true);
	const app = new App();
	const plugin = new DrawSteelAdmonitionPlugin(app as never, { id: 'draw-steel-elements', version: 'test' } as never);
	plugin.loadData = async () => JSON.parse(JSON.stringify(data));
	const saves: Record<string, any>[] = [];
	plugin.saveData = async (d: never) => {
		saves.push(JSON.parse(JSON.stringify(d)));
	};
	await plugin.onload();
	await flushAsync(2); // the store's own async load of the stored prefs slice
	return { app, plugin, saves };
}

/** Write the debounced prefs save now and return the last `data.json` payload ({} when nothing was saved). */
export async function flushSaved(loaded: Loaded): Promise<Record<string, any>> {
	(loaded.plugin as any).prefsStorage.flush();
	await flushAsync(2);
	return loaded.saves[loaded.saves.length - 1] ?? {};
}

export const prefsOf = (loaded: Loaded) => loaded.plugin.frameworkV2!.services.prefs;

/** Open the tab: cache the definitions, paint every page flattened (obsidian shows one at a time; the rows are what matter here). */
export async function openTab(loaded: Loaded): Promise<any> {
	Setting.created.length = 0;
	const tab: any = new DseSettingTab(loaded.plugin.app as never, loaded.plugin);
	tab.update();
	tab.renderTab();
	await flushAsync(3); // the live previews mount through the async pipeline
	return tab;
}

/** Every definition in the tree (groups and nested pages descended into). */
export function allDefs(items: any[]): any[] {
	const out: any[] = [];
	for (const item of items ?? []) {
		if (!item) continue;
		if (item.type === 'group' || item.type === 'list' || item.type === 'page') out.push(...allDefs(item.items ?? []));
		else out.push(item);
	}
	return out;
}

/** The rendered row of the definition `match` selects (a native control by its key, or any row by its name). */
export function rowOf(tab: any, match: { key?: string; name?: string }): Setting {
	const def = allDefs(tab.settingItems).find((d) => (match.key !== undefined ? d.control?.key === match.key : d.name === match.name));
	if (!def) throw new Error(`no definition for ${JSON.stringify(match)}`);
	const el = tab.getElementForDefinition(def);
	const row = Setting.created.find((s) => s.settingEl === el);
	if (!row) throw new Error(`definition ${JSON.stringify(match)} is not rendered`);
	return row;
}

/** A fresh Component, loaded (the owner a reflected root's subscriptions hang off). */
export function owner(): any {
	const c: any = new Component();
	c.load();
	return c;
}
