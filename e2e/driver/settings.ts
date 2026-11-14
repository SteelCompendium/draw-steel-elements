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

let mainHandle: string | null = null;

/** The ids of every stamped control on the page on screen, in document order. */
export const idsOnPage = (): Promise<string[]> =>
	ev<string[]>(`Array.from(document.querySelectorAll('.vertical-tab-content-container [data-dse-control^="settings."]')).map((e) => e.getAttribute('data-dse-control'))`);

/** Open the settings window on this plugin's tab and move the driver onto it. */
export async function openSettings(): Promise<void> {
	mainHandle = await browser.getWindowHandle();
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

/** Go one page deeper by a page-link id (`settings.page.typography`, `settings.advanced.typography`). A plain click: it credits no
 *  driven pair, so a census or a setup step never stands in for the scenario that drives the link. */
export async function showPage(linkId: string): Promise<void> {
	await $(`[data-dse-control="${linkId}"]`).click();
	await waitFor(`!document.querySelector('[data-dse-control="${linkId}"]')`, `the page ${linkId} to open`, 8000);
}

/** One level back (Obsidian's own back button; not a DSE control). Waits for the page on screen to change. */
export async function back(levels = 1): Promise<void> {
	const title = `(document.querySelector('.setting-page-title')?.textContent ?? 'index')`;
	for (let i = 0; i < levels; i++) {
		const was = await ev<string>(title);
		await $('.setting-page-back-button').click();
		await waitFor(`${title} !== ${JSON.stringify(was)}`, 'the previous settings page to show', 5000);
	}
}

/** The plugin's `data.json` object as the plugin holds it right now (readable from either window). */
export const readSettings = (): Promise<Record<string, unknown>> =>
	ev<Record<string, unknown>>(`JSON.parse(JSON.stringify(${PLUGIN}.settings))`);

/** The plugin's sparse `prefs` slice of `data.json`. */
export const readPrefs = (): Promise<Record<string, unknown>> => ev<Record<string, unknown>>(`JSON.parse(JSON.stringify(${PLUGIN}.settings.prefs))`);
