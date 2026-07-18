// D8 Task 10 (spec §2.4/OD-5) — proves the PRODUCTION onload() wiring for the encounter
// builder's "Open in sidebar" hand-off: encounter/view.ts's module-level
// `setEncounterSidebarHandoff` seam (left null by Task 4 — see its own doc comment, "never
// a silent no-op before Task 10 lands") is bound in main.ts's onload() to the SAME
// sendToSidebar/dseSidebarServices bundle every other sidebar entry point uses (the
// initiative "send to sidebar" command, the generic "Send block to sidebar" command) — one
// production wiring, not a second bespoke path — and onunload() clears it back to null so a
// stale plugin instance (reload/disable) can never fire against a torn-down bundle.
//
// Unlike test/dom/elements/encounter.test.ts (which drives the seam directly with a stub
// via setEncounterSidebarHandoff, proving the VIEW's try/catch/Notice behavior), this file
// drives the REAL plugin.onload()/onunload() lifecycle — the thing Task 10 actually adds.
import { App, Notice, flushAsync } from '../../mocks/obsidian';
import DrawSteelAdmonitionPlugin from 'main';
import { ElementPipeline } from '@/framework/pipeline';
import type { BlockHost, RenderMode } from '@/framework/host/BlockHost';
import { encounterElement } from '@/elements/encounter/definition';
import { setEncounterSidebarHandoff } from '@/elements/encounter/view';
import { VIEW_TYPE_DSE_SIDEBAR, DseSidebarView } from '@/framework/sidebar/DseSidebarView';
import { makeCompendiumDeps } from '../elements/_refHarness';

function makeHost(sourcePath: string): BlockHost & { containerEl: HTMLElement } {
	const containerEl = document.createElement('div');
	return {
		mode: 'reading' as RenderMode,
		sourcePath,
		containerEl,
		canPersist: true,
		addChild: (child) => child,
		getBlockInfo: () => ({ language: 'ds-encounter', lineStart: 0, lineEnd: 1 }),
		replaceSource: async () => true,
		blockKey: () => `${sourcePath}::ds-encounter::0`,
	};
}

function makePlugin(app: App): DrawSteelAdmonitionPlugin {
	return new DrawSteelAdmonitionPlugin(app as any, { id: 'draw-steel-elements', version: 'test' } as any);
}

describe('D8 Task 10: encounter "Open in sidebar" wired through the REAL onload()', () => {
	afterEach(() => {
		// Belt-and-suspenders: every test either calls onunload() itself (which clears
		// this) or must not leak a stub into a later test file sharing the module.
		setEncounterSidebarHandoff(null);
		Notice.notices.length = 0;
	});

	test('clicking "Open in sidebar" opens the sidebar leaf and mounts the SAME handed-off tracker, through production onload()', async () => {
		const app = new App();
		const plugin = makePlugin(app);
		await plugin.onload();

		app.vault.setFile('Session.md', '# Session\n\nSome prose.\n');

		const host = makeHost('Session.md');
		await plugin.frameworkV2!.pipeline.run(encounterElement, 'party: {}\nmonsters: []', host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		const button = root.querySelector<HTMLButtonElement>('[aria-label="Open initiative tracker in sidebar"]');
		expect(button).not.toBeNull();
		button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await flushAsync();

		// The tracker block was written to the note (writeTrackerBlock, unchanged from
		// Task 4) AND the hand-off opened/mounted it in a real sidebar leaf — proving
		// setEncounterSidebarHandoff was wired to a live sendToSidebar, not left null.
		const updated = app.vault.getContent('Session.md')!;
		expect(updated).toContain('```ds-initiative');

		const leaf = app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0];
		expect(leaf).toBeDefined();
		const view = leaf.view as unknown as DseSidebarView;
		const panelEl = view.contentEl.querySelector('.dse-sidebar__panel') as HTMLElement;
		expect(panelEl).not.toBeNull();
		expect(panelEl.querySelector('[data-dse-element="initiative"]')).not.toBeNull();

		// No "not wired in this build" degrade Notice fired — the real hand-off ran.
		expect(Notice.notices.some((n) => /not wired in this build/i.test(n))).toBe(false);

		plugin.onunload();
	});

	test('onunload() clears the hand-off: a plugin instance that has since unloaded degrades to the pre-Task-10 Notice, never a stale write', async () => {
		const app = new App();
		const plugin = makePlugin(app);
		await plugin.onload();
		plugin.onunload();

		// A separate, still-live pipeline (mirroring encounter.test.ts's own harness) —
		// its "Open in sidebar" button must degrade exactly like Task 4 built it to,
		// because the unloaded plugin's hand-off closure must no longer be registered.
		const { deps, vault } = makeCompendiumDeps();
		vault.setFile('Note.md', '# Note\n');
		const host = makeHost('Note.md');
		await new ElementPipeline(deps).run(encounterElement, 'party: {}\nmonsters: []', host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		const button = root.querySelector<HTMLButtonElement>('[aria-label="Open initiative tracker in sidebar"]')!;
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await flushAsync();

		expect(
			Notice.notices.some((n) => /sidebar hand-off not wired in this build/i.test(n)),
		).toBe(true);
	});
});
