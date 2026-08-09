// Plan 13 Task 6 (D4 §4.2) — the settings statblock preview is a REAL pipeline
// mount: reflected at first paint, live-reflowed by pref changes, torn down with
// the tab (owner unload stops the re-stamping).
import DrawSteelAdmonitionPlugin from 'main';
import { DseSettingTab } from '@views/SettingsTab';
import { App, Setting, flushAsync } from '../../mocks/obsidian';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Renders every preview row in the definition tree into the tab's container. */
function mountPreviewRows(tab: DseSettingTab): void {
	const container = tab.containerEl as HTMLElement;
	const walk = (items: any[]): void => {
		for (const item of items ?? []) {
			if (!item) continue;
			if (item.type === 'group' || item.type === 'page') {
				walk(item.items ?? []);
			} else if (item.name === '' && item.render) {
				item.render(new Setting(container));
			}
		}
	};
	walk((tab as any).getSettingDefinitions());
}

async function makeTabWithPreview() {
	const app = new App();
	const plugin = new DrawSteelAdmonitionPlugin(app as never, { id: 'draw-steel-elements', version: 'test' } as never);
	await plugin.onload();
	const tab = new DseSettingTab(plugin.app as never, plugin);
	// SC-131: there is no display() — obsidian renders the definition tree returned by
	// getSettingDefinitions(). The preview is a nameless `render` row on each page whose
	// settings reflect onto an element, so mount it the way obsidian does: hand its
	// callback a real Setting sitting in the tab's container.
	mountPreviewRows(tab);
	await flushAsync(3); // pipeline.run is async — let the mount land
	const root = (tab.containerEl as HTMLElement).querySelector<HTMLElement>(
		'.dse-settings-preview [data-dse-element="statblock"]',
	);
	return { plugin, tab, root };
}

beforeEach(() => {
	Setting.created.length = 0;
});

test('display() mounts a real statblock root (no error card, no read-only badge) with reflected defaults', async () => {
	const { root, tab } = await makeTabWithPreview();
	expect(root).not.toBeNull();
	expect(root!.querySelector('.dse-sb')).not.toBeNull(); // fixture parsed & rendered
	expect(root!.hasAttribute('data-dse-error-stage')).toBe(false);
	expect((tab.containerEl as HTMLElement).querySelector('.dse-error-card')).toBeNull();
	expect(root!.hasAttribute('data-dse-readonly')).toBe(false);
	expect(root!.getAttribute('data-dse-density')).toBe('comfortable');
});

test('a pref change live-reflows the preview root in place (same node, new attr)', async () => {
	const { plugin, root } = await makeTabWithPreview();
	await plugin.frameworkV2!.services.prefs.set('sbDensity', 'compact');
	await flushAsync(1);
	expect(root!.getAttribute('data-dse-density')).toBe('compact');
});

test('hide() unloads the preview owner: later pref changes no longer re-stamp the orphaned root', async () => {
	const { plugin, tab, root } = await makeTabWithPreview();
	tab.hide();
	await plugin.frameworkV2!.services.prefs.set('sbDensity', 'compact');
	await flushAsync(1);
	expect(root!.getAttribute('data-dse-density')).toBe('comfortable'); // dead subscription
});
