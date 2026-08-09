// Plan 13 Task 6 (D4 §4.2) — the settings statblock preview is a REAL pipeline
// mount: reflected at first paint, live-reflowed by pref changes, torn down with
// the row that showed it.
//
// SC-131: the tab is declarative, so there is no display()/hide() pair any more. The
// preview is a `render` row, and its Component is released through obsidian's CLEANUP
// CONTRACT — whatever the render callback returns is stored as that row's cleanup and
// invoked when the row goes away (page navigation, settings close, re-render).
//
// That contract is the whole reason these tests drive `update()` + `renderTab()` +
// `closeTab()` rather than poking the tab directly: obsidian calls
// getSettingDefinitions() only from update() and re-renders from a CACHE, so a preview
// owned by the definitions build survives exactly one paint. See the reopen test below.
import DrawSteelAdmonitionPlugin from 'main';
import { DseSettingTab } from '@views/SettingsTab';
import { App, Setting, flushAsync } from '../../mocks/obsidian';

/* eslint-disable @typescript-eslint/no-explicit-any */

async function makeTab() {
	const app = new App();
	const plugin = new DrawSteelAdmonitionPlugin(app as never, { id: 'draw-steel-elements', version: 'test' } as never);
	await plugin.onload();
	const tab = new DseSettingTab(plugin.app as never, plugin);
	return { plugin, tab };
}

/** The preview's statblock root, or null when nothing is mounted. */
function previewRoot(tab: DseSettingTab): HTMLElement | null {
	return (tab.containerEl as HTMLElement).querySelector<HTMLElement>(
		'.dse-settings-preview [data-dse-element="statblock"]',
	);
}

/** Open the settings window: cache the definitions, then paint. */
async function open(tab: DseSettingTab): Promise<void> {
	(tab as any).update();
	(tab as any).renderTab();
	await flushAsync(3); // pipeline.run is async — let the mount land
}

/** Close it: obsidian invokes each rendered row's stored cleanup. */
function close(tab: DseSettingTab): void {
	(tab as any).closeTab();
}

beforeEach(() => {
	Setting.created.length = 0;
});

test('mounts a real statblock root (no error card, no read-only badge) with reflected defaults', async () => {
	const { tab } = await makeTab();
	await open(tab);
	const root = previewRoot(tab);
	expect(root).not.toBeNull();
	expect(root!.querySelector('.dse-sb')).not.toBeNull(); // fixture parsed & rendered
	expect(root!.hasAttribute('data-dse-error-stage')).toBe(false);
	expect((tab.containerEl as HTMLElement).querySelector('.dse-error-card')).toBeNull();
	expect(root!.hasAttribute('data-dse-readonly')).toBe(false);
	expect(root!.getAttribute('data-dse-density')).toBe('comfortable');
});

test('a pref change live-reflows the preview root in place (same node, new attr)', async () => {
	const { plugin, tab } = await makeTab();
	await open(tab);
	const root = previewRoot(tab);
	await plugin.frameworkV2!.services.prefs.set('sbDensity', 'compact');
	await flushAsync(1);
	expect(root!.getAttribute('data-dse-density')).toBe('compact');
});

test('closing the settings window unloads the preview owner: later pref changes no longer re-stamp the orphaned root', async () => {
	const { plugin, tab } = await makeTab();
	await open(tab);
	const root = previewRoot(tab);
	close(tab);
	await plugin.frameworkV2!.services.prefs.set('sbDensity', 'compact');
	await flushAsync(1);
	expect(root!.getAttribute('data-dse-density')).toBe('comfortable'); // dead subscription
});

// —— SC-131 C1 regression ——
// Obsidian calls getSettingDefinitions() ONLY from update(); re-opening the settings
// window replays the cached definitions. A preview whose Component was created during the
// definitions build (rather than per mount) is therefore alive for the first paint and
// dead for every one after — the preview silently vanishes for the rest of the session.
// This is the test that fails against that shape.
test('re-opening the settings window WITHOUT an update() still mounts the preview', async () => {
	const { tab } = await makeTab();
	await open(tab);
	expect(previewRoot(tab)).not.toBeNull();

	close(tab);
	// No update() here, deliberately: obsidian re-renders from its cache.
	(tab as any).renderTab();
	await flushAsync(3);
	expect(previewRoot(tab)).not.toBeNull();

	// And a third time, because "works twice" is the weaker claim.
	close(tab);
	(tab as any).renderTab();
	await flushAsync(3);
	expect(previewRoot(tab)).not.toBeNull();
});

test('each mount gets a live owner: a pref change after re-opening still reflows the NEW root', async () => {
	const { plugin, tab } = await makeTab();
	await open(tab);
	close(tab);
	(tab as any).renderTab();
	await flushAsync(3);
	const root = previewRoot(tab);
	expect(root).not.toBeNull();
	await plugin.frameworkV2!.services.prefs.set('sbDensity', 'compact');
	await flushAsync(1);
	expect(root!.getAttribute('data-dse-density')).toBe('compact');
});

test('preview subscriptions do not accumulate: the previous mount is released on re-render', async () => {
	const { plugin, tab } = await makeTab();
	await open(tab);
	const first = previewRoot(tab)!;
	close(tab);
	(tab as any).renderTab();
	await flushAsync(3);
	const second = previewRoot(tab)!;
	expect(second).not.toBe(first);
	await plugin.frameworkV2!.services.prefs.set('sbDensity', 'compact');
	await flushAsync(1);
	// Only the live mount re-stamps; the orphaned one stays frozen at its last value.
	expect(second.getAttribute('data-dse-density')).toBe('compact');
	expect(first.getAttribute('data-dse-density')).toBe('comfortable');
});
