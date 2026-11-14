// SC-440 e2e driver: the plugin settings tab, in real Obsidian.
//
// HOW THE TAB IS REACHED. Obsidian 1.14 opens the settings window as a POPOUT window of its own (a second window handle, its own
// document, no `app` global; `window.opener.app` is the main window's). So a spec that touches the tab has to move the driver there:
// `openSettings()` runs the `app:open-settings` command, selects this plugin's tab (`app.setting.openTabById`), switches wdio to the new
// window and waits for the index to be drawn. Everything the driver does afterwards (`dse.click(dse.control('settings.…'))`,
// `dse.press`, the census) works on that window's DOM, because every driver call talks to the CURRENT window. `closeSettings()` closes the
// window and puts wdio back on the main window; `ensureMainWindow()` is the safety net `closeEverything` runs, so one failing test cannot
// leave the next one talking to a window that is about to go away.
//
// This module imports only `@wdio/globals` and `./page`, never `./dse`: `dse` imports `./cleanup`, which calls `ensureMainWindow`.
import { $, browser } from '@wdio/globals';
import { ev, waitFor } from './page';

/** The plugin's app handle, from either window (the main window has `app`, the settings popout reaches it through `opener`). */
export const APP = `(window.app ?? window.opener.app)`;
const PLUGIN = `${APP}.plugins.plugins['draw-steel-elements']`;

/** The whole tab: Obsidian's `.vertical-tab-content-container` holds the active tab's index or the one page on screen. */
export const SETTINGS_SCOPE = '.vertical-tab-content-container *';
/** What the census leaves out of the scope: Obsidian's own page titlebar (the back button) and the live preview's stage (an element
 *  mounted through the pipeline, whose controls belong to that element's surface). */
export const SETTINGS_CENSUS_EXCLUDE = '.setting-page-titlebar, .dse-settings-preview__stage';

/** The plugin's data.json: the sparse `prefs` slice plus the operational fields. */
export interface PluginData {
	prefs: Record<string, unknown>;
	[field: string]: unknown;
}

let mainHandle: string | null = null;

/** The ids of every stamped control on the page on screen, in document order. */
export const idsOnPage = (): Promise<string[]> =>
	ev<string[]>(`Array.from(document.querySelectorAll('.vertical-tab-content-container [data-dse-control^="settings."]')).map((e) => e.getAttribute('data-dse-control'))`);

/** Open the settings window on this plugin's tab and move the driver onto it. */
export async function openSettings(): Promise<void> {
	mainHandle = await browser.getWindowHandle();
	// No settings scenario may reach the network: unless a test installed its own stub (`releaseStub.install()` marks the service), the sync
	// service's request function throws loudly. (A plugin reload gives a fresh service, so the guard goes in again on the next open.)
	await ev(`(() => { const s = ${PLUGIN}.syncService; if (s && !s.__e2eStubbed) s.requestUrlFn = () => { throw new Error('e2e: network disabled, install releaseStub before a Sync or Check'); }; return true; })()`);
	await ev(`(() => { app.commands.executeCommandById('app:open-settings'); app.setting.openTabById('draw-steel-elements'); return true; })()`);
	await browser.waitUntil(async () => (await browser.getWindowHandles()).length > 1, { timeout: 8000, interval: 40, timeoutMsg: 'the settings window never opened' });
	const popout = (await browser.getWindowHandles()).find((h) => h !== mainHandle)!;
	await browser.switchToWindow(popout);
	await waitFor(`!!document.querySelector('.vertical-tab-content-container [data-dse-control^="settings."]')`, 'the settings index to draw', 10000);
}

/** Close the settings window (from wherever the driver is) and return to the main window. */
export async function closeSettings(): Promise<void> {
	await ensureMainWindow();
}

/** Back on the main window, with no settings window left open. A no-op when settings was never opened. */
export async function ensureMainWindow(): Promise<void> {
	if (!mainHandle) return;
	const main = mainHandle;
	const handles = await browser.getWindowHandles();
	if (!handles.includes(main)) {
		mainHandle = null;
		return;
	}
	if ((await browser.getWindowHandle().catch(() => null)) !== main) await browser.switchToWindow(main);
	await ev(`(() => { if (app.setting && app.setting.isOpen) app.setting.close(); return true; })()`);
	await browser.waitUntil(async () => (await browser.getWindowHandles()).length === 1, { timeout: 8000, interval: 40, timeoutMsg: 'the settings window did not close' });
	mainHandle = null;
}

/** Wait until Obsidian's page transition is over: while a page slides in or out, the old and the new page are both in the container for
 *  ~300 ms, and a click on the new page's Back button in that window is swallowed. */
export const pageSettled = (): Promise<void> =>
	waitFor(`document.querySelector('.vertical-tab-content-container')?.children.length === 1`, 'the settings page transition to finish', 5000);

/** Go one page deeper by a page-link id (`settings.page.typography`, `settings.advanced.typography`). A plain click: it credits no
 *  driven pair, so a census or a setup step never stands in for the scenario that drives the link. */
export async function showPage(linkId: string): Promise<void> {
	await $(`[data-dse-control="${linkId}"]`).click();
	await waitFor(`!document.querySelector('[data-dse-control="${linkId}"]')`, `the page ${linkId} to open`, 8000);
	await pageSettled();
}

/** One level back (Obsidian's own back button; not a DSE control), once the page has settled; waits for the page on screen to change. */
export async function back(levels = 1): Promise<void> {
	const title = `(document.querySelector('.setting-page-title')?.textContent ?? 'index')`;
	for (let i = 0; i < levels; i++) {
		await pageSettled();
		const was = await ev<string>(title);
		await $('.setting-page-back-button').click();
		await waitFor(`${title} !== ${JSON.stringify(was)}`, `the page before ${was} to show`, 8000);
		await pageSettled();
	}
}

/** The plugin's `data.json` object as the plugin holds it right now (readable from either window). */
export const readSettings = (): Promise<Record<string, unknown>> =>
	ev<Record<string, unknown>>(`JSON.parse(JSON.stringify(${PLUGIN}.settings))`);

/** The plugin's sparse `prefs` slice of `data.json`. */
export const readPrefs = (): Promise<Record<string, unknown>> => ev<Record<string, unknown>>(`JSON.parse(JSON.stringify(${PLUGIN}.settings.prefs))`);

/** Run `fn` on the MAIN window (the notes, the plugin's open blocks) and come back to wherever the driver was (the settings window). */
export async function onMain<T>(fn: () => Promise<T>): Promise<T> {
	if (!mainHandle) return fn();
	const here = await browser.getWindowHandle();
	if (here === mainHandle) return fn();
	await browser.switchToWindow(mainHandle);
	try {
		return await fn();
	} finally {
		await browser.switchToWindow(here);
	}
}

/** The raw text of data.json on disk right now (no waiting; null when the file does not exist). */
export const rawData = (): Promise<string | null> =>
	ev<string | null>(`(async () => { const p = ${PLUGIN}; const f = p.manifest.dir + '/data.json'; return (await ${APP}.vault.adapter.exists(f)) ? await ${APP}.vault.adapter.read(f) : null; })()`);

/**
 * `data.json` as it is ON DISK (not the plugin's in-memory settings). Flushes the preferences' debounced save, then waits until the file
 * the plugin wrote equals what it holds in memory, so a read never lands between a change and its write. Before the session's first write
 * the file is still the shipped seed (`{}`, or absent): after a short grace, `diskData` answers with what the disk says (`{ prefs: {} }`)
 * instead of timing out, so a test can ask "was anything written?" first.
 */
export async function diskData(): Promise<PluginData> {
	await ev(`(() => { ${PLUGIN}.prefsStorage?.flush?.(); return true; })()`);
	const started = Date.now();
	let answer: PluginData | undefined;
	await browser.waitUntil(
		async () => {
			const raw = await rawData();
			const memory = await ev<string>(`JSON.stringify(${PLUGIN}.settings)`);
			const parsed = raw === null ? null : (JSON.parse(raw) as PluginData);
			if (parsed !== null && JSON.stringify(parsed) === memory) {
				answer = parsed;
				return true;
			}
			// The plugin always writes its WHOLE settings object, so a file that lacks a key the plugin holds was never written by it (the shipped seed
			// `{}`, or a data.json a scenario seeded): after a grace period for a write in flight, answer with what the disk says.
			const neverWritten = parsed === null || Object.keys(JSON.parse(memory) as object).some((k) => !(k in parsed));
			if (neverWritten && Date.now() - started > 800) {
				answer = { prefs: {}, ...(parsed ?? {}) };
				return true;
			}
			return false;
		},
		{ timeout: 8000, interval: 50, timeoutMsg: 'data.json on disk never caught up with the plugin\'s settings' },
	);
	return answer!;
}
