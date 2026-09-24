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
import { registerDseSidebar } from '@/framework/sidebar/registration';
import { PERSIST_DEBOUNCE_MS } from '@/framework/view';

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

/** SC-282 r2 (MEDIUM-2) — a note with prose around the block, so a write-back test can
 *  assert the prose survived untouched, not just the block's own value. */
function note(anchorId: string, value = 3): string {
	return ['# Heading', '', 'Prose before.', '', counterBlock(anchorId, value), '', 'Prose after.'].join('\n');
}

/** SC-282 r2 (MEDIUM-2, P1/P2/P3/P4) — asserts a write landed at `path` with the counter
 *  at `v`, the surrounding prose from `note()` intact, and the anchor preserved. */
function expectWritten(app: App, path: string, v: number, anchorId: string): void {
	const content = app.vault.getContent(path);
	expect(content).toBeDefined();
	const c = content!;
	expect(c.startsWith('# Heading\n\nProse before.\n\n```ds-counter\n')).toBe(true);
	expect(c.endsWith('```\n\nProse after.')).toBe(true);
	expect(c).toContain(`current_value: ${v}`);
	expect(c).toContain(`_dse_anchor: ${anchorId}`);
}

/** Local monkey-patch of THIS test's `app.vault` — real "rename"/"delete"/"modify"
 *  listener bookkeeping (the shared mock's `.on()` is an inert stub) plus counters/fire
 *  helpers. SC-282 r2 adds "modify" (P1 needs it for the post-rename external-edit
 *  assertion) alongside the r1 "rename"/"delete" pair, generalized to one small map
 *  instead of three near-identical branches. */
function withRealVaultEvents(app: App): {
	fireRename: (file: TAbstractFile, oldPath: string) => void;
	fireDelete: (file: TAbstractFile) => void;
	fireModify: (file: TAbstractFile) => void;
	renameListenerCount: () => number;
	deleteListenerCount: () => number;
} {
	const listeners: Record<'rename' | 'delete' | 'modify', Array<(...args: any[]) => any>> = {
		rename: [],
		delete: [],
		modify: [],
	};
	const vault = app.vault as unknown as { on: (name: string, cb: (...args: any[]) => any) => any };
	vault.on = (name: string, cb: (...args: any[]) => any) => {
		const list = (listeners as Record<string, Array<(...args: any[]) => any>>)[name];
		if (!list) return { unsubscribe: () => {} };
		list.push(cb);
		return {
			unsubscribe: () => {
				const i = list.indexOf(cb);
				if (i >= 0) list.splice(i, 1);
			},
		};
	};
	return {
		fireRename: (file, oldPath) => {
			for (const cb of listeners.rename.slice()) cb(file, oldPath);
		},
		fireDelete: (file) => {
			for (const cb of listeners.delete.slice()) cb(file);
		},
		fireModify: (file) => {
			for (const cb of listeners.modify.slice()) cb(file);
		},
		renameListenerCount: () => listeners.rename.length,
		deleteListenerCount: () => listeners.delete.length,
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

/** SC-282 r2 (MEDIUM-2) — the rendered counter's "Increase" button / current value,
 *  matching dseSidebarView.test.ts's FOLLOWUPS #26 persist test's own style. */
const increaseButton = (panelEl: HTMLElement) =>
	panelEl.querySelector<HTMLButtonElement>('.dse-stepper__btn[aria-label^="Increase"]')!;
const counterValue = (panelEl: HTMLElement) => panelEl.querySelector<HTMLInputElement>('input.dse-counter__value')!.value;

afterEach(() => {
	jest.useRealTimers();
});

describe('SC-282: sidebar vault rename/delete listeners', () => {
	test('renaming a pinned note updates the panel’s filePath, header note link, and requests a layout save — without disturbing the mounted element', async () => {
		const { app, fireRename } = setup();
		app.vault.setFile('Note.md', counterBlock(ANCHOR_A));
		const { view } = await openView(app);
		const panel = view.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
		await flushAsync();

		const panelEl = view.contentEl.querySelector('.dse-sidebar__panel') as HTMLElement;
		const rootBefore = panelEl.querySelector('[data-dse-element="counter"]');
		expect(rootBefore).not.toBeNull();
		const savesBefore = app.workspace.requestSaveLayoutCalls;
		// SC-282 r3 (LOW-C) — the host's session key, captured once at construction (r2's
		// stable-key fix), so session-only state keyed by it (chrome collapse, tab
		// selection, montage/negotiation/hero/initiative persist objects) doesn't split
		// across a rename.
		const keyBefore = (panel as any).host.blockKey();

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
		// LOW-C: the session key is UNCHANGED across the rename (not rebuilt from the live,
		// now-rebound backingFile.path).
		expect((panel as any).host.blockKey()).toBe(keyBefore);
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

	// —— SC-282 r2 (MEDIUM-2 fold): write-back after rename, real folder-event order,
	// folder-delete sibling prefix, and a non-identity rename that pins rebindPath ——

	test('P1: after a rename, a write lands in the renamed note (prose intact, old path gone), and a further external edit is still tracked', async () => {
		const { app, fireRename, fireModify } = setup();
		app.vault.setFile('Note.md', note(ANCHOR_A));
		const { view } = await openView(app);
		view.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
		await flushAsync();

		const renamed = app.vault.rename('Note.md', 'Sub/Renamed.md');
		fireRename(renamed, 'Note.md');
		await flushAsync();

		jest.useFakeTimers();
		const panelEl = view.contentEl.querySelector('.dse-sidebar__panel') as HTMLElement;
		increaseButton(panelEl).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		jest.useRealTimers();

		expectWritten(app, 'Sub/Renamed.md', 4, ANCHOR_A);
		expect(app.vault.getContent('Note.md')).toBeUndefined(); // no ghost at the old path
		expect(app.vault.modifyCalls.map((c) => c.path)).toEqual(['Sub/Renamed.md']);

		// A further external edit to the RENAMED note is still tracked by the panel — the
		// host's rebound backingFile, not a stale reference to the old path.
		app.vault.setFile('Sub/Renamed.md', note(ANCHOR_A, 42));
		fireModify(renamed);
		await flushAsync();
		expect(counterValue(panelEl)).toBe('42');
	});

	test('P2: a rename where the vault hands back a NEW TFile object (non-identity-preserving) still writes to the new path (pins rebindPath)', async () => {
		const { app, fireRename } = setup();
		app.vault.setFile('Note.md', note(ANCHOR_A));
		const { view } = await openView(app);
		view.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
		await flushAsync();

		// Simulate a vault that does NOT preserve TFile identity across a rename: delete the
		// old file outright and create a brand new TFile at the new path with the same
		// content, rather than using FakeVault.rename's identity-preserving mutation.
		const oldFile = app.vault.getAbstractFileByPath('Note.md') as TFile;
		const oldContent = app.vault.getContent('Note.md')!;
		await app.vault.delete(oldFile);
		const fresh = app.vault.setFile('Renamed.md', oldContent);
		expect(fresh).not.toBe(oldFile); // genuinely a different TFile instance
		fireRename(fresh, 'Note.md');
		await flushAsync();

		jest.useFakeTimers();
		increaseButton(view.contentEl.querySelector('.dse-sidebar__panel') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		jest.useRealTimers();

		expectWritten(app, 'Renamed.md', 4, ANCHOR_A);
		expect(app.vault.getContent('Note.md')).toBeUndefined();
	});

	test('P4: real Obsidian folder-rename event order (the folder event fires BEFORE the child is re-keyed), then a write still lands correctly', async () => {
		const { app, fireRename } = setup();
		app.vault.setFile('Foo/Bar/Note.md', note(ANCHOR_A));
		app.vault.setFile('Foo/BarBaz.md', note(ANCHOR_B));
		const { view } = await openView(app);
		view.addPanel({ filePath: 'Foo/Bar/Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
		view.addPanel({ filePath: 'Foo/BarBaz.md', alias: 'ds-counter', anchorId: ANCHOR_B });
		await flushAsync();

		// The FOLDER event fires first — at this instant the child TFile is STILL at its old
		// path (real Obsidian: the adapter renames the folder, then walks its descendants).
		fireRename(new TFolder('Foo/Qux'), 'Foo/Bar');
		const stateAfterFolderEvent = (view.getState() as { panels: SidebarPanelState[] }).panels;
		expect(stateAfterFolderEvent.map((p) => p.filePath)).toEqual(['Foo/Qux/Note.md', 'Foo/BarBaz.md']);

		// THEN the child's own rename event fires.
		const child = app.vault.rename('Foo/Bar/Note.md', 'Foo/Qux/Note.md');
		fireRename(child, 'Foo/Bar/Note.md');
		await flushAsync();

		const panels = (view.getState() as { panels: SidebarPanelState[] }).panels;
		expect(panels.map((p) => p.filePath)).toEqual(['Foo/Qux/Note.md', 'Foo/BarBaz.md']);

		jest.useFakeTimers();
		increaseButton(view.contentEl.querySelectorAll<HTMLElement>('.dse-sidebar__panel')[0]).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		jest.useRealTimers();
		expectWritten(app, 'Foo/Qux/Note.md', 4, ANCHOR_A);
		expect(app.vault.getContent('Foo/BarBaz.md')).toBe(note(ANCHOR_B)); // sibling untouched
	});

	test('P6: an unrelated delete touches nothing (no save); a folder delete spares a string-prefix sibling and is idempotent across both event orders', async () => {
		const { app, fireDelete } = setup();
		app.vault.setFile('Foo/Bar/Note.md', note(ANCHOR_A));
		app.vault.setFile('Foo/BarBaz.md', note(ANCHOR_B));
		app.vault.setFile('Unrelated.md', 'x');
		const { view } = await openView(app);
		view.addPanel({ filePath: 'Foo/Bar/Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
		view.addPanel({ filePath: 'Foo/BarBaz.md', alias: 'ds-counter', anchorId: ANCHOR_B });
		await flushAsync();
		const savesBefore = app.workspace.requestSaveLayoutCalls;

		fireDelete(app.vault.getAbstractFileByPath('Unrelated.md')!);
		expect((view.getState() as { panels: SidebarPanelState[] }).panels).toHaveLength(2);
		expect(app.workspace.requestSaveLayoutCalls).toBe(savesBefore); // no save for a no-op

		// Real Obsidian: both a per-child delete AND the folder's own delete can fire for the
		// same removal — either order must end up with exactly one panel gone and one save.
		fireDelete(app.vault.getAbstractFileByPath('Foo/Bar/Note.md')!);
		fireDelete(new TFolder('Foo/Bar'));
		const panels = (view.getState() as { panels: SidebarPanelState[] }).panels;
		expect(panels.map((p) => p.filePath)).toEqual(['Foo/BarBaz.md']);
		expect(app.workspace.requestSaveLayoutCalls).toBe(savesBefore + 1);
	});

	// —— SC-282 r2 (MEDIUM-1 fold): a DEFERRED sidebar leaf (no loaded DseSidebarView) is
	// patched by the PLUGIN-scoped listener pair `registerDseSidebar` now also registers.
	// The stand-in below mirrors real Obsidian's DeferredView (verified in the r1 review's
	// real-Obsidian probe RN-4): `getViewType` returns the real type so `getLeavesOfType`
	// finds it, `getState`/`setState` only store a plain object — no view ever loads. ——

	test('MEDIUM-1: a deferred sidebar leaf follows a rename via the plugin-level listener, without loading', async () => {
		const { app, plugin, services, fireRename } = setup();
		app.vault.setFile('Dfr/x.md', note(ANCHOR_A));
		registerDseSidebar(plugin as any, services);

		let stored: { panels: SidebarPanelState[] } = {
			panels: [{ filePath: 'Dfr/x.md', alias: 'ds-counter', anchorId: ANCHOR_A }],
		};
		let loaded = false;
		const deferredView = {
			getViewType: () => VIEW_TYPE_DSE_SIDEBAR,
			getState: () => stored,
			setState: async (s: { panels: SidebarPanelState[] }) => {
				stored = s;
			},
		};
		const leaf = app.workspace.getRightLeaf(false)! as any;
		leaf.state = { type: VIEW_TYPE_DSE_SIDEBAR, active: true }; // matches getLeavesOfType's own filter
		leaf.view = deferredView;
		void loaded; // the view is never a DseSidebarView, and load()/onOpen() never runs

		const savesBefore = app.workspace.requestSaveLayoutCalls;
		const renamed = app.vault.rename('Dfr/x.md', 'Dfr/y.md');
		fireRename(renamed, 'Dfr/x.md');
		await flushAsync();

		expect(stored.panels[0].filePath).toBe('Dfr/y.md');
		expect(leaf.view).toBe(deferredView); // still the stand-in — never loaded a real view
		expect(app.workspace.requestSaveLayoutCalls).toBeGreaterThan(savesBefore);
	});

	test('MEDIUM-1: a deferred sidebar leaf drops its panel on a delete via the plugin-level listener, without loading', async () => {
		const { app, plugin, services, fireDelete } = setup();
		app.vault.setFile('Dfr/x.md', note(ANCHOR_A));
		registerDseSidebar(plugin as any, services);

		let stored: { panels: SidebarPanelState[] } = {
			panels: [{ filePath: 'Dfr/x.md', alias: 'ds-counter', anchorId: ANCHOR_A }],
		};
		const deferredView = {
			getViewType: () => VIEW_TYPE_DSE_SIDEBAR,
			getState: () => stored,
			setState: async (s: { panels: SidebarPanelState[] }) => {
				stored = s;
			},
		};
		const leaf = app.workspace.getRightLeaf(false)! as any;
		leaf.state = { type: VIEW_TYPE_DSE_SIDEBAR, active: true };
		leaf.view = deferredView;

		const savesBefore = app.workspace.requestSaveLayoutCalls;
		fireDelete(app.vault.getAbstractFileByPath('Dfr/x.md')!);
		await flushAsync();

		expect(stored.panels).toEqual([]);
		expect(app.workspace.requestSaveLayoutCalls).toBeGreaterThan(savesBefore);
	});

	// SC-282 r3 re-review (LOW-A) — `patchDeferredSidebarLeaves`'s `if (leaf.view instanceof
	// DseSidebarView) continue;` guard (registration.ts) has to skip a LOADED leaf: the
	// plugin-level listener registers at plugin load, so it runs BEFORE the view's own
	// `registerVaultListeners` listener has necessarily been reached in registration order
	// for any given rename. Without the guard, the plugin listener would call
	// `DseSidebarView.setState` on an already-loaded view — which tears down and remounts
	// EVERY panel — right alongside the view's own in-place update, destroying exactly the
	// live element state (an in-progress encounter, a pending debounce) the whole in-place
	// design exists to protect. No committed test exercised `registerDseSidebar` together
	// with a LOADED view until now — every other test in this file calls
	// `plugin.registerView` directly, which never registers the plugin-level listeners.
	test('LOW-A: a LOADED sidebar leaf (registered via registerDseSidebar) is skipped by the plugin-level listener — one save, root kept, no double-apply', async () => {
		const { app, plugin, services, fireRename } = setup();
		app.vault.setFile('Note.md', note(ANCHOR_A));
		registerDseSidebar(plugin as any, services);
		const { view } = await openView(app);
		view.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
		await flushAsync();

		const root = view.contentEl.querySelector('[data-dse-element="counter"]');
		const savesBefore = app.workspace.requestSaveLayoutCalls;
		const renamed = app.vault.rename('Note.md', 'R.md');
		fireRename(renamed, 'Note.md');
		await flushAsync();

		expect((view.getState() as { panels: SidebarPanelState[] }).panels[0].filePath).toBe('R.md');
		// Exactly one panel, exactly one save — the plugin listener did NOT also patch (and
		// thereby duplicate work against) this already-loaded view's own panel.
		expect(view.contentEl.querySelectorAll('.dse-sidebar__panel')).toHaveLength(1);
		expect(app.workspace.requestSaveLayoutCalls - savesBefore).toBe(1);
		// The mounted root is UNCHANGED — no double-apply re-render from a second (plugin-
		// level) setState racing the view's own in-place update.
		expect(view.contentEl.querySelector('[data-dse-element="counter"]')).toBe(root);
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
