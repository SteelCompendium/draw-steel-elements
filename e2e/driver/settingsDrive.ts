// SC-440 e2e driver: the settings tab's scenario helpers. Builds on ./settings (the popout window) and ./dse (real input, coverage).
// A scenario opens a note, opens the settings window on a page, drives a control with real input in that window, then reads the
// effect on the MAIN window (`onMain`): the open note's element, which must change with no reload and no re-open.
import { $, browser } from '@wdio/globals';
import type { ChainablePromiseElement } from 'webdriverio';
import { closeEverything } from './cleanup';
import { dse } from './dse';
import { ev, waitFor } from './page';
import { APP, closeSettings, diskData, ensureMainWindow, onMain, openSettings, rawData, showPage } from './settings';
import { state } from './state';

export { closeSettings, diskData, onMain, openSettings, rawData, showPage };
export { back, idsOnPage, pageSettled, readSettings } from './settings';

type El = ChainablePromiseElement;
const PLUGIN = `${APP}.plugins.plugins['draw-steel-elements']`;

/** A settings control by its id (page-wide, on whichever window the driver is on: the settings window). */
export const ctl = (id: string): El => dse.control(id);

/** Open the settings window, then walk down the page links (`settings.page.typography`, then `settings.advanced.typography`). */
export async function openAt(...links: string[]): Promise<void> {
	await openSettings();
	for (const link of links) await showPage(link);
}

/** Real keys on a control: take focus by script (a native select / range / checkbox label has no click that only focuses), then press. */
export async function pressOn(id: string, key: string): Promise<void> {
	const el = ctl(id);
	await dse.focusByScript(el);
	await dse.press(key, el);
}

/** Type a value (replacing the field's text) and click away, the way a user commits a text field. */
export async function typeThenBlur(id: string, text: string): Promise<void> {
	const el = ctl(id);
	await dse.type(el, text, { replace: true });
	await dse.blur(el, $('.setting-page-title'));
}

/** The plugin's data.json `prefs` slice from disk. */
export const diskPrefs = async (): Promise<Record<string, unknown>> => (await diskData()).prefs;

/** A preference's stored value (sparse: a default is absent) as the setting reads it: the stored value, or `def`. */
export async function prefValue(key: string, def: unknown): Promise<unknown> {
	return (await diskPrefs())[key] ?? def;
}

/** Page-side attribute of the first matching element in the active Reading view of the main window (null when none). */
export const mainAttr = (selector: string, name: string): Promise<string | null> =>
	onMain(() => dse.page<string | null>(`document.querySelector('.markdown-reading-view ${selector}')?.getAttribute(${JSON.stringify(name)}) ?? null`));

/** Page-side inline custom property of the first matching element (empty string when unset). */
export const mainVar = (selector: string, name: string): Promise<string> =>
	onMain(() => dse.page<string>(`document.querySelector('.markdown-reading-view ${selector}')?.style.getPropertyValue(${JSON.stringify(name)}) ?? 'NO-ELEMENT'`));

/** How many nodes match in the active Reading view of the main window. */
export const mainCount = (selector: string): Promise<number> =>
	onMain(() => dse.page<number>(`document.querySelectorAll('.markdown-reading-view ${selector}').length`));

/**
 * Reload the plugin the way a user does (disable + enable) WITHOUT touching data.json: save first, close the open notes (the harness
 * rule: nothing open across a reload), then wait until the new instance's preferences have loaded what is on disk. The settings window
 * must be closed by the caller (or is closed here).
 */
export async function reloadPlugin(): Promise<void> {
	await reload(null);
}

/**
 * Put `data` in force as the WHOLE data.json (operational fields included, which `dse.setPrefs` cannot write) and reload the plugin on it:
 * a scenario that needs a state seeds it here instead of leaning on the test before it, so every test runs alone under `--only`.
 */
export async function seedData(data: Record<string, unknown>): Promise<void> {
	await reload(data);
}

async function reload(data: Record<string, unknown> | null): Promise<void> {
	await ensureMainWindow();
	await closeEverything();
	await ev(`(async () => {
		const id = 'draw-steel-elements';
		const p = app.plugins.plugins[id];
		await ${data === null ? 'p.saveSettings()' : `p.saveData(${JSON.stringify(data)})`};
		await app.plugins.disablePlugin(id);
		await app.plugins.enablePlugin(id);
		while (!(app.plugins.plugins[id] && app.plugins.plugins[id].viewRegistry)) await new Promise((r) => setTimeout(r, 25));
		return true;
	})()`);
	await waitFor(
		`(() => { const p = ${PLUGIN}; const prefs = p.frameworkV2?.services.prefs; if (!prefs) return false; return Object.entries(p.settings.prefs).every(([k, v]) => { try { return prefs.get(k) === v; } catch { return true; } }); })()`,
		'the reloaded plugin to load its stored preferences',
		10000,
	);
}

/** This test expects a page error matching `re` (e.g. a failed Sync's own console.error): the post-test invariants ignore it. */
export function allowPageErrors(re: RegExp): void {
	state.allowedErrors.push(re);
}

/**
 * Stub the compendium release lookup (no network): the sync service's request function answers with a promise the test settles with
 * `releaseStub.answer(status, json)`; until then Sync / Check stay in flight (their busy state is on screen). The stub lives until the
 * plugin reloads.
 */
export const releaseStub = {
	async install(): Promise<void> {
		await onMain(() =>
			ev(`(() => {
				const service = app.plugins.plugins['draw-steel-elements'].syncService;
				service.__e2eStubbed = true; // the network guard (driver/settings.ts openSettings) leaves a stubbed service alone
				window.__stubCalls = [];
				service.requestUrlFn = (req) => new Promise((resolve) => {
					window.__stubCalls.push(req.url);
					window.__stubAnswer = (status, json) => resolve({ status, json: json ?? {}, text: '', arrayBuffer: new ArrayBuffer(0), headers: {} });
				});
				return true;
			})()`),
		);
	},
	/** The URLs the service asked for (all answered by the stub; none left the machine). */
	calls: (): Promise<string[]> => onMain(() => ev<string[]>(`window.__stubCalls`)),
	async answer(status: number, json: unknown = {}): Promise<void> {
		await onMain(() => ev(`window.__stubAnswer(${status}, ${JSON.stringify(json)})`));
	},
};

/** The text and disabled state of the two compendium buttons, as the settings window shows them. */
export const compendiumButtons = (): Promise<{ sync: [string, boolean]; check: [string, boolean] }> =>
	ev(`(() => { const b = (id) => { const e = document.querySelector('[data-dse-control="' + id + '"]'); return [e.textContent, e.disabled]; }; return { sync: b('settings.compendium.sync'), check: b('settings.compendium.check') }; })()`);

/** Notices on the window the driver is on (the settings window draws its own). */
export const noticesHere = (): Promise<string[]> => ev(`Array.from(document.querySelectorAll('.notice')).map((n) => n.textContent)`);


/** The shown state of a toggle (obsidian marks an ON checkbox label `is-enabled`). */
export const toggleIsOn = (id: string): Promise<boolean> => dse.page<boolean>(`document.querySelector('[data-dse-control="${id}"]').classList.contains('is-enabled')`);
/** The shown value of a dropdown, slider or text field. */
export const shownValue = (id: string): Promise<string> => dse.page<string>(`document.querySelector('[data-dse-control="${id}"]').value`);
/** Is a dependent toggle greyed out (obsidian puts `is-disabled` on the label)? */
export const toggleIsDisabled = (id: string): Promise<boolean> => dse.page<boolean>(`document.querySelector('[data-dse-control="${id}"]').classList.contains('is-disabled')`);

/** Wait until data.json's `prefs` on disk equals `expected` (a multi-write change, like a reset, lands over several writes). Returns the slice. */
export async function waitDiskPrefs(expected: Record<string, unknown>): Promise<Record<string, unknown>> {
	const same = (a: Record<string, unknown>): boolean => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(expected).sort());
	let last: Record<string, unknown> = {};
	try {
		await browser.waitUntil(async () => same((last = await diskPrefs())), { timeout: 8000, interval: 100 });
	} catch {
		/* the caller's own expect names the difference */
	}
	return last;
}

const sorted = (o: unknown): string => JSON.stringify(o, (_k, v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));

/**
 * A reload test's starting point. When data.json on disk already holds `expected` (the scenarios before it wrote it, as in a full run) the plugin
 * is simply reloaded ON THAT FILE, so the reload asserts what the drives wrote; only when it does not (this test run alone under `--only`) is the
 * state seeded, as a version-3 data.json (a real user's file; no v0 migration). Returns whether it had to seed.
 */
export async function ensureState(expected: { prefs: Record<string, unknown>; [field: string]: unknown }): Promise<boolean> {
	const disk = await diskData();
	const same = Object.entries(expected).every(([k, v]) => sorted(disk[k]) === sorted(v));
	if (same) {
		await reloadPlugin();
		return false;
	}
	await seedData({ settingsVersion: 3, ...expected });
	return true;
}

/**
 * Put `patch` onto the preferences on disk (a value of undefined removes the key) and reload on the result, leaving every other stored value
 * alone; does nothing when the disk already agrees. For a scenario that needs one setting in a given state without wiping the others the
 * scenarios before it set (so the file-final reload still loads what the drives wrote).
 */
export async function withPrefs(patch: Record<string, unknown>): Promise<void> {
	const disk = await diskData();
	const prefs = { ...disk.prefs };
	for (const [k, v] of Object.entries(patch)) {
		if (v === undefined) delete prefs[k];
		else prefs[k] = v;
	}
	if (sorted(prefs) === sorted(disk.prefs)) return;
	await seedData({ settingsVersion: 3, ...disk, prefs });
}
