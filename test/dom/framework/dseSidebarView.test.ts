// D8 Task 2 — DseSidebarView: the ItemView shell owning N SidebarPanel children. Uses the
// Task 1 mocks (test/mocks/obsidian-core.ts's App/Plugin/ItemView/WorkspaceLeaf — the ones
// with real registerView/getRightLeaf/setViewState/detachLeavesOfType lifecycle), and
// drives ds-counter (the simplest persisted element, no schema) through the REAL
// ElementPipeline/ElementRegistry — mirrors test/dom/elements/counter.test.ts's harness
// style, proving the sidebar mounts an unmodified F1 element (mode-blind views, F1 §2.1).
import { App, Plugin, flushAsync } from '../../mocks/obsidian';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { initializeElementFrameworkV2, registerFrameworkElementDefinitions } from 'main';
import { DseSidebarView, VIEW_TYPE_DSE_SIDEBAR } from '@/framework/sidebar/DseSidebarView';
import type { DseSidebarServices, SidebarPanelState } from '@/framework/sidebar/DseSidebarView';
import { PERSIST_DEBOUNCE_MS } from '@/framework/view';

const ANCHOR_A = 'aaa111';
const ANCHOR_B = 'bbb222';

function counterBlock(anchorId: string, value = 3): string {
	return ['```ds-counter', `current_value: ${value}`, `_dse_anchor: ${anchorId}`, '```'].join('\n');
}

function setup() {
	const app = new App();
	const plugin = new Plugin(app);
	// `as any`: initializeElementFrameworkV2's `app`/`plugin` params type-check against
	// the REAL ambient obsidian types (main.ts imports 'obsidian' bare); the mock
	// instances don't structurally satisfy those in full — same cast plugin-wiring.test.ts
	// already uses for this exact call.
	const frameworkV2 = initializeElementFrameworkV2(app as any, plugin as any, DEFAULT_SETTINGS);
	registerFrameworkElementDefinitions(frameworkV2.registry);
	// `as unknown as DseSidebarServices` / `leaf as any`: same real-ambient-vs-mock
	// structural mismatch as above — DseSidebarView.ts (production code) types its
	// constructor against the REAL obsidian.d.ts App/Plugin/WorkspaceLeaf; nothing here
	// calls back into leaf/app/plugin members DseSidebarView doesn't itself use, so the
	// runtime behavior is unaffected by the cast.
	const services = { app, plugin, pipeline: frameworkV2.pipeline, registry: frameworkV2.registry } as unknown as DseSidebarServices;
	plugin.registerView(VIEW_TYPE_DSE_SIDEBAR, ((leaf: any) => new DseSidebarView(leaf, services)) as any);
	return { app, plugin, services };
}

async function openView(app: App) {
	const leaf = app.workspace.getRightLeaf(false)!;
	await leaf.setViewState({ type: VIEW_TYPE_DSE_SIDEBAR, active: true });
	return { leaf, view: leaf.view as unknown as DseSidebarView };
}

describe('D8 Task 2: DseSidebarView (spec §1.3)', () => {
	test('addPanel mounts a real F1 element (counter) unchanged, into a .dse-sidebar__panel', async () => {
		const { app } = setup();
		app.vault.setFile('Note.md', counterBlock(ANCHOR_A));
		const { view } = await openView(app);

		const state: SidebarPanelState = { filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A };
		view.addPanel(state);
		await flushAsync();

		const panelEl = view.contentEl.querySelector('.dse-sidebar__panel');
		expect(panelEl).not.toBeNull();
		const el = panelEl!.querySelector('[data-dse-element="counter"] .dse-counter');
		expect(el).not.toBeNull();
	});

	test('getState returns the panel list', async () => {
		const { app } = setup();
		app.vault.setFile('Note.md', counterBlock(ANCHOR_A));
		const { view } = await openView(app);

		const state: SidebarPanelState = { filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A };
		view.addPanel(state);
		await flushAsync();

		expect(view.getState()).toEqual({ panels: [state] });
	});

	test('a fresh view setState(saved) re-mounts the same panels (restart survival)', async () => {
		const { app } = setup();
		app.vault.setFile('Note.md', counterBlock(ANCHOR_A, 7));
		const { view } = await openView(app);
		view.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
		await flushAsync();
		const saved = view.getState();

		// A brand new leaf + view — onOpen alone starts with zero panels; setState is the
		// workspace-restore path that repopulates them.
		const { view: freshView } = await openView(app);
		expect(freshView.contentEl.querySelector('.dse-sidebar__panel')).toBeNull();

		await freshView.setState(saved);
		await flushAsync();

		const el = freshView.contentEl.querySelector('[data-dse-element="counter"] .dse-counter__value');
		expect(el).not.toBeNull();
	});

	test('removePanel tears the panel + host down (DOM removed, Component cascade unloads the mounted view)', async () => {
		const { app } = setup();
		app.vault.setFile('Note.md', counterBlock(ANCHOR_A));
		const { view } = await openView(app);
		const panel = view.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
		await flushAsync();
		expect(view.contentEl.querySelector('.dse-sidebar__panel')).not.toBeNull();

		view.removePanel(panel);

		expect(view.contentEl.querySelector('.dse-sidebar__panel')).toBeNull();
	});

	test('onClose cascades teardown of all panels', async () => {
		const { app } = setup();
		app.vault.setFile('NoteA.md', counterBlock(ANCHOR_A));
		app.vault.setFile('NoteB.md', counterBlock(ANCHOR_B));
		const { leaf, view } = await openView(app);
		view.addPanel({ filePath: 'NoteA.md', alias: 'ds-counter', anchorId: ANCHOR_A });
		view.addPanel({ filePath: 'NoteB.md', alias: 'ds-counter', anchorId: ANCHOR_B });
		await flushAsync();
		expect(view.contentEl.querySelectorAll('.dse-sidebar__panel')).toHaveLength(2);

		leaf.detach(); // real Obsidian: leaf close -> onClose -> Component cascade

		expect(view.contentEl.querySelectorAll('.dse-sidebar__panel')).toHaveLength(0);
	});

	test('an unresolvable panel (unknown alias) renders a read-only "unavailable" card instead of throwing', async () => {
		const { app } = setup();
		app.vault.setFile('Note.md', counterBlock(ANCHOR_A));
		const { view } = await openView(app);

		view.addPanel({ filePath: 'Note.md', alias: 'ds-does-not-exist', anchorId: ANCHOR_A });
		await flushAsync();

		const panelEl = view.contentEl.querySelector('.dse-sidebar__panel');
		expect(panelEl?.getAttribute('data-dse-sidebar-unavailable')).toBe('true');
	});

	// D8 Task 2 review fix round 1 (finding #1, HIGH) originally reproduced end-to-end here:
	// Counter.serialize() dropped `_dse_anchor` (the passthrough-field gap
	// SidebarBlockHost.ts's header used to document), so the FIRST real persist() through
	// the sidebar silently lost the anchor line and nothing told the user. FOLLOWUPS #26
	// fixed the root cause — Counter (and NegotiationData/StaminaBar) now carry an
	// `_dse_anchor` passthrough field, so a real persist through the sidebar keeps the
	// anchor and the panel stays live. (SidebarBlockHost.ts's own onAnchorLost safety net —
	// kept as defense in depth for any future persisted element that forgets the
	// passthrough — is unit-tested directly against a synthetic anchor-dropping write in
	// test/dom/framework/sidebarBlockHost.test.ts's "review fix round 1, finding #1" suite,
	// independent of any real element's serialize().)
	test('FOLLOWUPS #26 (fixed): a real persist through the sidebar preserves `_dse_anchor` — the panel stays mounted and interactive', async () => {
		const { app } = setup();
		app.vault.setFile('Note.md', counterBlock(ANCHOR_A, 3));
		const { view } = await openView(app);

		view.addPanel({ filePath: 'Note.md', alias: 'ds-counter', anchorId: ANCHOR_A });
		await flushAsync(); // real timers for the initial mount's vault.cachedRead

		// Fake timers only from here — replaceSource rides Vault.process (no macrotask
		// delay in the fake), so only the persist debounce itself needs advancing.
		jest.useFakeTimers();

		const panelEl = () => view.contentEl.querySelector('.dse-sidebar__panel') as HTMLElement;
		const plusBtn = () => panelEl().querySelector<HTMLButtonElement>('.dse-stepper__btn[aria-label^="Increase"]');
		expect(plusBtn()).not.toBeNull();
		expect(panelEl().getAttribute('data-dse-sidebar-unavailable')).not.toBe('true');

		plusBtn()!.click(); // mutates the model + schedules the debounced persist()
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS); // flush -> replaceSource

		// The panel is still live — no degrade card, no dropped anchor.
		expect(panelEl().getAttribute('data-dse-sidebar-unavailable')).not.toBe('true');
		expect(panelEl().querySelector('.dse-error-card-message')).toBeNull();
		expect(app.vault.getContent('Note.md')).toContain(`_dse_anchor: ${ANCHOR_A}`);

		// The panel remains interactive: a second edit still works (proves the anchor
		// survived the first persist and getBlockInfo can still locate the block).
		const valueEl = () => panelEl().querySelector<HTMLInputElement>('input.dse-counter__value')!;
		expect(valueEl().value).toBe('4');
		plusBtn()!.click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(panelEl().getAttribute('data-dse-sidebar-unavailable')).not.toBe('true');
		expect(valueEl().value).toBe('5');

		jest.useRealTimers();
	});
});
