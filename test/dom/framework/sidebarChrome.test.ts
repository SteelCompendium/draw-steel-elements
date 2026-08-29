// SC-184 fix round (HIGH-1) — behavioral coverage for the seven approved items that
// shipped with exactly ONE trivial test (`SidebarBlockHost.requestRemoval` delegates to its
// callback). Nothing else in the repo pinned: requestSaveLayout's call count semantics
// (item 4), the legacy `collapsed` migration (item 10), the empty-state lifecycle (item 9),
// the three degrade cards' "Remove panel" button (item 7), the header's label/note/title/
// openLinkText wiring (item 3), or the pin/unpin chrome gating including "click removes
// exactly that panel" (items 1/2). Six points, six describe blocks below, in the review's
// own order. Uses the same real-framework harness `dseSidebarView.test.ts` already
// established (initializeElementFrameworkV2 + registerFrameworkElementDefinitions), so every
// assertion here drives the REAL pipeline/registry, not a stand-in.
import { App, Plugin, flushAsync } from '../../mocks/obsidian';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { initializeElementFrameworkV2, registerFrameworkElementDefinitions } from 'main';
import { DseSidebarView, VIEW_TYPE_DSE_SIDEBAR } from '@/framework/sidebar/DseSidebarView';
import type { DseSidebarServices, SidebarPanelState } from '@/framework/sidebar/DseSidebarView';

const ANCHOR_A = 'aaa111';
const ANCHOR_B = 'bbb222';

function counterBlock(anchorId: string, value = 3): string {
	return ['```ds-counter', `current_value: ${value}`, `_dse_anchor: ${anchorId}`, '```'].join('\n');
}

function setup() {
	const app = new App();
	const plugin = new Plugin(app);
	// `as any`/`as unknown as`: same real-ambient-vs-mock structural mismatch every other
	// sidebar test file casts around — see dseSidebarView.test.ts's setup() for the full
	// rationale.
	const frameworkV2 = initializeElementFrameworkV2(app as any, plugin as any, DEFAULT_SETTINGS);
	registerFrameworkElementDefinitions(frameworkV2.registry);
	const services = {
		app,
		plugin,
		pipeline: frameworkV2.pipeline,
		registry: frameworkV2.registry,
	} as unknown as DseSidebarServices;
	plugin.registerView(VIEW_TYPE_DSE_SIDEBAR, ((leaf: any) => new DseSidebarView(leaf, services)) as any);
	return { app, plugin, services };
}

async function openView(app: App) {
	const leaf = app.workspace.getRightLeaf(false)!;
	await leaf.setViewState({ type: VIEW_TYPE_DSE_SIDEBAR, active: true });
	return { leaf, view: leaf.view as unknown as DseSidebarView };
}

const panelEls = (view: DseSidebarView) => [...view.contentEl.querySelectorAll<HTMLElement>('.dse-sidebar__panel')];
const chromeItemIds = (panelEl: HTMLElement): (string | null)[] =>
	Array.from(panelEl.querySelectorAll('.dse-chrome [data-dse-chrome-item]')).map((el) =>
		el.getAttribute('data-dse-chrome-item'),
	);

describe('SC-184 fix round (HIGH-1): behavioral coverage for the seven approved items', () => {
	// ---------------------------------------------------------------- 1. requestSaveLayout
	describe('1. requestSaveLayoutCalls — the exact semantics the impl report claimed', () => {
		test('2 after two addPanels, 3 after a removePanel', async () => {
			const { app } = setup();
			app.vault.setFile('NoteA.md', counterBlock(ANCHOR_A));
			app.vault.setFile('NoteB.md', counterBlock(ANCHOR_B));
			const { view } = await openView(app);
			expect(app.workspace.requestSaveLayoutCalls).toBe(0);

			const a = view.addPanel({ filePath: 'NoteA.md', alias: 'ds-counter', anchorId: ANCHOR_A });
			await flushAsync();
			expect(app.workspace.requestSaveLayoutCalls).toBe(1);

			view.addPanel({ filePath: 'NoteB.md', alias: 'ds-counter', anchorId: ANCHOR_B });
			await flushAsync();
			expect(app.workspace.requestSaveLayoutCalls).toBe(2);

			view.removePanel(a);
			expect(app.workspace.requestSaveLayoutCalls).toBe(3);
		});

		test('0 across a two-panel setState restore', async () => {
			const { app } = setup();
			app.vault.setFile('NoteA.md', counterBlock(ANCHOR_A));
			app.vault.setFile('NoteB.md', counterBlock(ANCHOR_B));
			const { view } = await openView(app);
			view.addPanel({ filePath: 'NoteA.md', alias: 'ds-counter', anchorId: ANCHOR_A });
			view.addPanel({ filePath: 'NoteB.md', alias: 'ds-counter', anchorId: ANCHOR_B });
			await flushAsync();
			const saved = view.getState();

			const { view: freshView } = await openView(app);
			const before = app.workspace.requestSaveLayoutCalls;
			await freshView.setState(saved);
			await flushAsync();

			expect(app.workspace.requestSaveLayoutCalls).toBe(before);
			expect(panelEls(freshView)).toHaveLength(2);
		});

		test('0 on a dedupe-hit re-pin (the block is already pinned)', async () => {
			const { app } = setup();
			app.vault.setFile('Note.md', counterBlock(ANCHOR_A));
			const { view } = await openView(app);
			view.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
			await flushAsync();
			const before = app.workspace.requestSaveLayoutCalls;

			view.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A }); // same block again
			await flushAsync();

			expect(app.workspace.requestSaveLayoutCalls).toBe(before);
		});

		test('double-remove fires 0 extra saves (LOW-3\'s guard, kept consistent here)', async () => {
			const { app } = setup();
			app.vault.setFile('Note.md', counterBlock(ANCHOR_A));
			const { view } = await openView(app);
			const panel = view.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
			await flushAsync();

			view.removePanel(panel);
			const afterFirstRemove = app.workspace.requestSaveLayoutCalls;
			view.removePanel(panel); // already gone — must not fire a second save

			expect(app.workspace.requestSaveLayoutCalls).toBe(afterFirstRemove);
		});
	});

	// ---------------------------------------------------------------- 2. collapsed migration
	describe('2. legacy `collapsed` migration (item 10)', () => {
		test('setState with a legacy {…, collapsed:true} panel mounts, and getState() carries no collapsed key', async () => {
			const { app } = setup();
			app.vault.setFile('Note.md', counterBlock(ANCHOR_A));
			const { view } = await openView(app);

			const legacyState = {
				filePath: 'Note.md',
				alias: 'ds-counter',
				anchorId: ANCHOR_A,
				collapsed: true,
			} as unknown as SidebarPanelState;
			await view.setState({ panels: [legacyState] });
			await flushAsync();

			expect(panelEls(view)).toHaveLength(1);
			expect(view.contentEl.querySelector('[data-dse-element="counter"] .dse-counter')).not.toBeNull();
			const restored = view.getState() as { panels: SidebarPanelState[] };
			expect(restored.panels).toHaveLength(1);
			expect(restored.panels[0]).not.toHaveProperty('collapsed');
			expect(restored.panels[0]).toEqual({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
		});

		// Restores the pre-normalizePanelState-era coverage HIGH-1 flagged as deleted with
		// no replacement: two panel states differing only in an extra/legacy field are the
		// SAME panel by identity — samePanelTarget only ever compares filePath/alias/
		// anchorId/body, so an addPanel dedupe must not be fooled by a stray extra key
		// (whatever future field that might be; `collapsed` here as the concrete historical
		// example, cast past the current type since the field no longer exists on it).
		test("panel identity ignores extra fields — a re-pin carrying a stray field is still the SAME panel", async () => {
			const { app } = setup();
			app.vault.setFile('Note.md', counterBlock(ANCHOR_A));
			const { view } = await openView(app);

			const first = view.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
			await flushAsync();
			const withExtraField = {
				filePath: 'Note.md',
				alias: 'ds-counter',
				anchorId: ANCHOR_A,
				collapsed: true,
			} as unknown as SidebarPanelState;
			const second = view.addPanel(withExtraField);
			await flushAsync();

			expect(second).toBe(first);
			expect(panelEls(view)).toHaveLength(1);
		});
	});

	// ---------------------------------------------------------------- 3. empty state
	describe('3. empty-state lifecycle (item 9)', () => {
		test('present on onOpen, gone after addPanel, back after removing the last, present after setState([]), never duplicated', async () => {
			const { app } = setup();
			app.vault.setFile('Note.md', counterBlock(ANCHOR_A));
			const { view } = await openView(app);

			expect(view.contentEl.querySelectorAll('.dse-sidebar__empty')).toHaveLength(1);
			expect(view.contentEl.querySelector('.dse-sidebar__empty-title')?.textContent).toBe('No pinned blocks');

			const panel = view.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
			await flushAsync();
			expect(view.contentEl.querySelectorAll('.dse-sidebar__empty')).toHaveLength(0);

			view.removePanel(panel);
			expect(view.contentEl.querySelectorAll('.dse-sidebar__empty')).toHaveLength(1);

			// Re-adding and removing again must not accumulate a second empty-state div.
			const again = view.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
			await flushAsync();
			view.removePanel(again);
			expect(view.contentEl.querySelectorAll('.dse-sidebar__empty')).toHaveLength(1);

			await view.setState({ panels: [] });
			await flushAsync();
			expect(view.contentEl.querySelectorAll('.dse-sidebar__empty')).toHaveLength(1);
		});
	});

	// ---------------------------------------------------------------- 4. degrade-card dismiss
	describe('4. each degrade card offers a working "Remove panel" button (item 7)', () => {
		test.each<[string, SidebarPanelState]>([
			['unknown element', { filePath: 'Note.md', alias: 'ds-does-not-exist', anchorId: 'x' }],
			['note not found', { filePath: 'Missing.md', alias: 'ds-counter', anchorId: 'x' }],
			['backing block gone', { filePath: 'Note.md', alias: 'ds-counter', anchorId: 'nonexistent-anchor' }],
		])('%s: aria-label="Remove panel" click removes the panel', async (_label, state) => {
			const { app } = setup();
			app.vault.setFile('Note.md', 'no such block in this note');
			const { view } = await openView(app);

			view.addPanel(state);
			await flushAsync();

			expect(panelEls(view)).toHaveLength(1);
			const panelEl = panelEls(view)[0];
			expect(panelEl.getAttribute('data-dse-sidebar-unavailable')).toBe('true');
			const dismiss = panelEl.querySelector<HTMLButtonElement>('[aria-label="Remove panel"]');
			expect(dismiss).not.toBeNull();

			dismiss!.click();

			expect(panelEls(view)).toHaveLength(0);
			expect(view.contentEl.querySelectorAll('.dse-sidebar__empty')).toHaveLength(1);
		});
	});

	// ---------------------------------------------------------------- 5. header
	describe('5. header: label/note/title/openLinkText (item 3)', () => {
		test('label is the registry def.name, note is the basename, title is the full path, click calls openLinkText once', async () => {
			const { app } = setup();
			app.vault.setFile('Session Notes.md', counterBlock(ANCHOR_A));
			const { view } = await openView(app);

			view.addPanel({ filePath: 'Session Notes.md', alias: 'ds-counter', anchorId: ANCHOR_A });
			await flushAsync();

			const panelEl = panelEls(view)[0];
			const label = panelEl.querySelector('.dse-sidebar__panel-label');
			const note = panelEl.querySelector<HTMLAnchorElement>('.dse-sidebar__panel-note');
			expect(label?.textContent).toBe('Counter');
			expect(note?.textContent).toBe('Session Notes');
			expect(note?.getAttribute('title')).toBe('Session Notes.md');

			note!.click();
			await flushAsync();

			expect(app.workspace.openLinkTextCalls).toHaveLength(1);
			expect(app.workspace.openLinkTextCalls[0]).toEqual({
				linktext: 'Session Notes.md',
				sourcePath: '',
				newLeaf: false,
			});
		});

		test('after removePanel, clicking the (now detached) note link no longer calls openLinkText', async () => {
			const { app } = setup();
			app.vault.setFile('Note.md', counterBlock(ANCHOR_A));
			const { view } = await openView(app);
			const panel = view.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
			await flushAsync();
			const note = panelEls(view)[0].querySelector<HTMLAnchorElement>('.dse-sidebar__panel-note')!;

			view.removePanel(panel);
			note.click();
			await flushAsync();

			expect(app.workspace.openLinkTextCalls).toHaveLength(0);
		});
	});

	// ---------------------------------------------------------------- 6. chrome gating
	describe('6. pin/unpin chrome gating (items 1/2)', () => {
		test('a real sidebar-mounted panel offers "unpin" (mode: sidebar + requestRemoval), never "pin"', async () => {
			const { app } = setup();
			app.vault.setFile('Note.md', counterBlock(ANCHOR_A));
			const { view } = await openView(app);
			view.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
			await flushAsync();

			const panelEl = panelEls(view)[0];
			expect(chromeItemIds(panelEl)).toContain('unpin');
			expect(chromeItemIds(panelEl)).not.toContain('pin');
		});

		test('clicking unpin on panel A removes EXACTLY panel A — panel B and its header survive untouched', async () => {
			const { app } = setup();
			app.vault.setFile('NoteA.md', counterBlock(ANCHOR_A, 1));
			app.vault.setFile('NoteB.md', counterBlock(ANCHOR_B, 2));
			const { view } = await openView(app);
			view.addPanel({ filePath: 'NoteA.md', alias: 'ds-counter', anchorId: ANCHOR_A });
			view.addPanel({ filePath: 'NoteB.md', alias: 'ds-counter', anchorId: ANCHOR_B });
			await flushAsync();
			expect(panelEls(view)).toHaveLength(2);

			const [panelA, panelB] = panelEls(view);
			const unpinA = panelA.querySelector<HTMLButtonElement>('[data-dse-chrome-item="unpin"]');
			expect(unpinA).not.toBeNull();

			unpinA!.click();

			const remaining = panelEls(view);
			expect(remaining).toHaveLength(1);
			expect(remaining[0]).toBe(panelB);
			expect(remaining[0].querySelector('.dse-sidebar__panel-note')?.textContent).toBe('NoteB');
			expect((view.getState() as { panels: SidebarPanelState[] }).panels).toEqual([
				{ filePath: 'NoteB.md', alias: 'ds-counter', anchorId: ANCHOR_B },
			]);
		});

		// The other half of the gate (already exercised by chrome.test.ts's "a host that
		// cannot persist gets no edit item" test, which asserts itemIds === ['collapse'] —
		// i.e. no 'pin' — for a canPersist:false reading host): repeated here so this one
		// file is a self-contained record of the full item-1/item-2 gating contract.
		test('a reading-mode host with canPersist:false never offers "pin" (cross-reference: chrome.test.ts)', async () => {
			const { ElementPipeline } = await import('@/framework/pipeline');
			const { counterElement } = await import('@/elements/counter/definition');
			const { makeCompendiumDeps } = await import('../elements/_refHarness');
			const { deps } = makeCompendiumDeps();
			const containerEl = document.createElement('div');
			const host = {
				mode: 'reading' as const,
				sourcePath: 'Note.md',
				containerEl,
				canPersist: false,
				addChild: (child: unknown) => child,
				getBlockInfo: () => ({ language: 'ds-counter', lineStart: 0, lineEnd: 1 }),
				replaceSource: async () => true,
				blockKey: () => 'Note.md::ds-counter::0',
			};
			await new ElementPipeline(deps).run(counterElement, 'current_value: 1\n', host as any);

			expect(containerEl.querySelector('[data-dse-chrome-item="pin"]')).toBeNull();
		});
	});
});
