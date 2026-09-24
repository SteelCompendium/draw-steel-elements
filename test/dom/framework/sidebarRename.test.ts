// SC-282 — the sidebar had no vault rename/delete listeners: renaming a note behind a
// pinned panel left the panel pointed at a path that no longer existed (permanent "Note
// not found" after restart), and deleting one left permanent debris. This file proves
// DseSidebarView's new "rename"/"delete" vault listeners (D1/D2 — see the SC-282 ledger)
// against the REAL ElementPipeline/ElementRegistry, mirroring dseSidebarView.test.ts's own
// harness style (ds-counter — the simplest persisted element, no schema).
//
// Harness note: same rationale as sidebarInitiative.test.ts's withRealModifyEvents — the
// shared mock's `FakeVault.on()` is a deliberate no-op stub (see obsidian-core.ts's file
// header), so this file locally monkey-patches THIS test's own `app.vault.on` for real
// "rename"/"delete" delivery, scoped to this file only (jest isolates modules per test
// file — no shared mock changed). It ALSO patches `Component.prototype.registerEvent`
// (also a no-op in the shared mock) to sugar over the mock's own already-working
// `register()` cleanup-on-unload mechanism — exactly what `registerDomEvent` already does
// in that same file — so the "listener torn down on close" test below can prove something
// real instead of trivially passing.
import { App, Component, Plugin, TAbstractFile, TFile, TFolder, flushAsync } from '../../mocks/obsidian';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { initializeElementFrameworkV2, registerFrameworkElementDefinitions } from 'main';
import { DseSidebarView, VIEW_TYPE_DSE_SIDEBAR } from '@/framework/sidebar/DseSidebarView';
import type { DseSidebarServices, SidebarPanelState } from '@/framework/sidebar/DseSidebarView';

// See the file header: sugar registerEvent over the mock's own register()-based teardown,
// scoped to this file's own module registry only.
Component.prototype.registerEvent = function (this: Component, ref: { unsubscribe?: () => void }): void {
	this.register(() => ref.unsubscribe?.());
};

const ANCHOR_A = 'aaa111';
const ANCHOR_B = 'bbb222';

function counterBlock(anchorId: string, value = 3): string {
	return ['```ds-counter', `current_value: ${value}`, `_dse_anchor: ${anchorId}`, '```'].join('\n');
}

/** Local monkey-patch of THIS test's `app.vault` — real "rename"/"delete" listener
 *  bookkeeping (the shared mock's `.on()` is an inert stub) plus counters/fire helpers. */
function withRealVaultEvents(app: App): {
	fireRename: (file: TAbstractFile, oldPath: string) => void;
	fireDelete: (file: TAbstractFile) => void;
	renameListenerCount: () => number;
	deleteListenerCount: () => number;
} {
	const renameListeners: Array<{ cb: (...args: any[]) => any; unsubscribe: () => void }> = [];
	const deleteListeners: Array<{ cb: (...args: any[]) => any; unsubscribe: () => void }> = [];
	const vault = app.vault as unknown as { on: (name: string, cb: (...args: any[]) => any) => any };
	vault.on = (name: string, cb: (...args: any[]) => any) => {
		if (name === 'rename') {
			const entry = { cb, unsubscribe: () => {} };
			entry.unsubscribe = () => {
				const i = renameListeners.indexOf(entry);
				if (i >= 0) renameListeners.splice(i, 1);
			};
			renameListeners.push(entry);
			return entry;
		}
		if (name === 'delete') {
			const entry = { cb, unsubscribe: () => {} };
			entry.unsubscribe = () => {
				const i = deleteListeners.indexOf(entry);
				if (i >= 0) deleteListeners.splice(i, 1);
			};
			deleteListeners.push(entry);
			return entry;
		}
		return { unsubscribe: () => {} };
	};
	return {
		fireRename: (file, oldPath) => {
			for (const { cb } of renameListeners.slice()) cb(file, oldPath);
		},
		fireDelete: (file) => {
			for (const { cb } of deleteListeners.slice()) cb(file);
		},
		renameListenerCount: () => renameListeners.length,
		deleteListenerCount: () => deleteListeners.length,
	};
}

function setup() {
	const app = new App();
	const plugin = new Plugin(app);
	const frameworkV2 = initializeElementFrameworkV2(app as any, plugin as any, DEFAULT_SETTINGS);
	registerFrameworkElementDefinitions(frameworkV2.registry);
	const services = { app, plugin, pipeline: frameworkV2.pipeline, registry: frameworkV2.registry } as unknown as DseSidebarServices;
	plugin.registerView(VIEW_TYPE_DSE_SIDEBAR, ((leaf: any) => new DseSidebarView(leaf, services)) as any);
	const vaultEvents = withRealVaultEvents(app);
	return { app, plugin, services, ...vaultEvents };
}

async function openView(app: App) {
	const leaf = app.workspace.getRightLeaf(false)!;
	await leaf.setViewState({ type: VIEW_TYPE_DSE_SIDEBAR, active: true });
	return { leaf, view: leaf.view as unknown as DseSidebarView };
}

describe('SC-282: sidebar vault rename/delete listeners', () => {
	test('renaming a pinned note updates the panel’s filePath, header note link, and requests a layout save — without disturbing the mounted element', async () => {
		const { app, fireRename } = setup();
		app.vault.setFile('Note.md', counterBlock(ANCHOR_A));
		const { view } = await openView(app);
		view.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
		await flushAsync();

		const panelEl = view.contentEl.querySelector('.dse-sidebar__panel') as HTMLElement;
		const rootBefore = panelEl.querySelector('[data-dse-element="counter"]');
		expect(rootBefore).not.toBeNull();
		const savesBefore = app.workspace.requestSaveLayoutCalls;

		const renamed = app.vault.rename('Note.md', 'Renamed.md');
		fireRename(renamed, 'Note.md');
		await flushAsync();

		// Persisted state follows the rename.
		expect(view.getState()).toEqual({ panels: [{ filePath: 'Renamed.md', alias: 'ds-counter', anchorId: ANCHOR_A }] });
		// Header note link reflects the new path.
		const link = panelEl.querySelector('.dse-sidebar__panel-note') as HTMLAnchorElement;
		expect(link.textContent).toBe('Renamed');
		expect(link.getAttribute('title')).toBe('Renamed.md');
		expect(link.getAttribute('aria-label')).toBe('Open Renamed.md');
		// A layout save was requested.
		expect(app.workspace.requestSaveLayoutCalls).toBeGreaterThan(savesBefore);
		// The mounted element was NOT torn down and rebuilt — same DOM node, still live.
		const rootAfter = panelEl.querySelector('[data-dse-element="counter"]');
		expect(rootAfter).toBe(rootBefore);
		expect(panelEl.getAttribute('data-dse-sidebar-unavailable')).not.toBe('true');
	});

	test('renaming a parent folder updates every panel under it; a sibling with a shared string prefix is untouched', async () => {
		const { app, fireRename } = setup();
		app.vault.setFile('Folder/Note.md', counterBlock(ANCHOR_A));
		app.vault.setFile('FolderExtra.md', counterBlock(ANCHOR_B));
		const { view } = await openView(app);
		view.addPanel({ filePath: 'Folder/Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
		view.addPanel({ filePath: 'FolderExtra.md', alias: 'ds-counter', anchorId: ANCHOR_B });
		await flushAsync();

		app.vault.rename('Folder/Note.md', 'Moved/Note.md');
		const folder = new TFolder('Moved');
		fireRename(folder, 'Folder');
		await flushAsync();

		const paths = view.getState() as { panels: SidebarPanelState[] };
		const byAnchor = (id: string) => paths.panels.find((p) => p.anchorId === id)!;
		expect(byAnchor(ANCHOR_A).filePath).toBe('Moved/Note.md');
		// "FolderExtra.md" merely shares the string prefix "Folder" — must be untouched.
		expect(byAnchor(ANCHOR_B).filePath).toBe('FolderExtra.md');
	});

	test('deleting a pinned note removes its panel and requests a layout save', async () => {
		const { app, fireDelete } = setup();
		app.vault.setFile('Note.md', counterBlock(ANCHOR_A));
		const { view } = await openView(app);
		const panel = view.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
		await flushAsync();
		expect(view.contentEl.querySelector('.dse-sidebar__panel')).not.toBeNull();
		const savesBefore = app.workspace.requestSaveLayoutCalls;

		const file = app.vault.getAbstractFileByPath('Note.md') as TFile;
		fireDelete(file);
		await flushAsync();

		expect(view.contentEl.querySelector('.dse-sidebar__panel')).toBeNull();
		expect(view.getState()).toEqual({ panels: [] });
		expect(app.workspace.requestSaveLayoutCalls).toBeGreaterThan(savesBefore);
		void panel; // referenced only for readability above
	});

	test('deleting a parent folder removes every panel under it; an unrelated sibling panel survives', async () => {
		const { app, fireDelete } = setup();
		app.vault.setFile('Folder/Note.md', counterBlock(ANCHOR_A));
		app.vault.setFile('Other.md', counterBlock(ANCHOR_B));
		const { view } = await openView(app);
		view.addPanel({ filePath: 'Folder/Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
		view.addPanel({ filePath: 'Other.md', alias: 'ds-counter', anchorId: ANCHOR_B });
		await flushAsync();
		expect(view.contentEl.querySelectorAll('.dse-sidebar__panel')).toHaveLength(2);

		fireDelete(new TFolder('Folder'));
		await flushAsync();

		expect(view.contentEl.querySelectorAll('.dse-sidebar__panel')).toHaveLength(1);
		const remaining = (view.getState() as { panels: SidebarPanelState[] }).panels;
		expect(remaining).toEqual([{ filePath: 'Other.md', alias: 'ds-counter', anchorId: ANCHOR_B }]);
	});

	test('two panels pinned to the SAME note both follow it on rename', async () => {
		const { app, fireRename } = setup();
		app.vault.setFile(
			'Note.md',
			[counterBlock(ANCHOR_A), '', counterBlock(ANCHOR_B, 9)].join('\n'),
		);
		const { view } = await openView(app);
		view.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
		view.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_B });
		await flushAsync();

		const renamed = app.vault.rename('Note.md', 'Renamed.md');
		fireRename(renamed, 'Note.md');
		await flushAsync();

		const panels = (view.getState() as { panels: SidebarPanelState[] }).panels;
		expect(panels).toHaveLength(2);
		expect(panels.every((p) => p.filePath === 'Renamed.md')).toBe(true);

		// A subsequent pin of the SAME (now-renamed) block still dedupes onto the existing
		// panel instead of creating a duplicate — proves the rewritten filePath keeps
		// samePanelTarget's identity check working after a rename.
		const before = view.contentEl.querySelectorAll('.dse-sidebar__panel').length;
		view.addPanel({ filePath: 'Renamed.md', alias: 'ds-counter', anchorId: ANCHOR_A });
		await flushAsync();
		expect(view.contentEl.querySelectorAll('.dse-sidebar__panel')).toHaveLength(before);
	});

	test('two OPEN sidebar leaves each pinning the same note both follow a rename — each leaf’s own listener updates its own panel', async () => {
		const { app, fireRename } = setup();
		app.vault.setFile('Note.md', counterBlock(ANCHOR_A));
		const { view: viewA } = await openView(app);
		viewA.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
		const { view: viewB } = await openView(app);
		viewB.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
		await flushAsync();

		const renamed = app.vault.rename('Note.md', 'Renamed.md');
		fireRename(renamed, 'Note.md');
		await flushAsync();

		expect((viewA.getState() as { panels: SidebarPanelState[] }).panels[0].filePath).toBe('Renamed.md');
		expect((viewB.getState() as { panels: SidebarPanelState[] }).panels[0].filePath).toBe('Renamed.md');
	});

	test('the rename/delete listeners are torn down when the leaf closes — a later rename/delete touches nothing', async () => {
		const { app, fireRename, fireDelete, renameListenerCount, deleteListenerCount } = setup();
		app.vault.setFile('Note.md', counterBlock(ANCHOR_A));
		const { leaf, view } = await openView(app);
		view.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
		await flushAsync();
		expect(renameListenerCount()).toBe(1);
		expect(deleteListenerCount()).toBe(1);

		leaf.detach(); // real Obsidian: leaf close -> onClose -> Component cascade unload

		expect(renameListenerCount()).toBe(0);
		expect(deleteListenerCount()).toBe(0);

		// Firing after close must not throw, and there is nothing left to update.
		const renamed = app.vault.rename('Note.md', 'Renamed.md');
		expect(() => fireRename(renamed, 'Note.md')).not.toThrow();
		expect(() => fireDelete(renamed)).not.toThrow();
		expect(view.contentEl.querySelectorAll('.dse-sidebar__panel')).toHaveLength(0);
	});
});
