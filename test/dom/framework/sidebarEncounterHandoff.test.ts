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

// —— SC-153: pressing the button twice must not build a second tracker ——
//
// The reported bug: "Even if an initiative codeblock exists in the sidebar, the 'open in
// sidebar' button in an encounter block adds an additional initiative block." It
// duplicated at BOTH layers, independently — `writeTrackerBlock` appended a fresh fence on
// every press, and `DseSidebarView.addPanel` mounted a fresh panel on every call without
// ever checking whether that block was already pinned. Measured before the fix: three
// presses gave three fences and three panels, while the sidebar kept showing the FIRST
// block (sendToSidebar binds `fences[0]`) — so the panel went stale the moment the note
// grew a second tracker.
describe('SC-153: "Open in sidebar" is idempotent', () => {
	async function mountEncounter(
		plugin: DrawSteelAdmonitionPlugin,
		notePath: string,
		body: string,
	): Promise<HTMLButtonElement> {
		const host = makeHost(notePath);
		await plugin.frameworkV2!.pipeline.run(encounterElement, body, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		return root.querySelector<HTMLButtonElement>(
			'[aria-label="Open initiative tracker in sidebar"]',
		)!;
	}

	const fenceCount = (content: string): number =>
		(content.match(/```ds-initiative/g) ?? []).length;

	function sidebarPanels(app: App): number {
		const leaf = app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0];
		if (!leaf) return 0;
		const view = leaf.view as unknown as DseSidebarView;
		return view.contentEl.querySelectorAll('.dse-sidebar__panel').length;
	}

	test('three presses leave exactly ONE tracker block and ONE sidebar panel', async () => {
		const app = new App();
		const plugin = makePlugin(app);
		await plugin.onload();
		app.vault.setFile('Session.md', '# Session\n\nSome prose.\n');

		const button = await mountEncounter(plugin, 'Session.md', 'party: {}\nmonsters: []');

		for (let i = 0; i < 3; i++) {
			button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await flushAsync();
		}

		const content = app.vault.getContent('Session.md')!;
		expect(fenceCount(content)).toBe(1);
		expect(sidebarPanels(app)).toBe(1);
		// One tracker means the ambiguity Notice sendToSidebar fires for a note with
		// several same-alias fences must never have been reached.
		expect(Notice.notices.some((n) => /multiple "ds-initiative" blocks/i.test(n))).toBe(false);
		plugin.onunload();
	});

	test('the first press creates, every later press REFRESHES the same block — keeping its sidebar anchor', async () => {
		const app = new App();
		const plugin = makePlugin(app);
		await plugin.onload();
		app.vault.setFile('Session.md', '# Session\n');

		const button = await mountEncounter(plugin, 'Session.md', 'party: {}\nmonsters: []');
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await flushAsync();
		const afterFirst = app.vault.getContent('Session.md')!;
		// sendToSidebar stamped the generated block with its durable anchor.
		const anchor = /_dse_anchor:\s*([A-Za-z0-9_-]+)/.exec(afterFirst)?.[1];
		expect(anchor).toBeDefined();

		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await flushAsync();
		const afterSecond = app.vault.getContent('Session.md')!;

		expect(fenceCount(afterSecond)).toBe(1);
		// The refresh spliced the BODY and preserved the anchor line — without that, the
		// live panel's binding would break on every press and the panel would degrade to
		// its "backing block not found" card.
		expect(afterSecond).toContain(`_dse_anchor: ${anchor}`);
		expect(Notice.notices.some((n) => /tracker block created/i.test(n))).toBe(true);
		expect(Notice.notices.some((n) => /was refreshed/i.test(n))).toBe(true);
		plugin.onunload();
	});

	test('a DIFFERENT encounter in the same note still gets its own tracker and its own panel', async () => {
		const app = new App();
		const plugin = makePlugin(app);
		await plugin.onload();
		app.vault.setFile('Session.md', '# Session\n');

		const first = await mountEncounter(plugin, 'Session.md', 'party: {}\nmonsters: []');
		const second = await mountEncounter(plugin, 'Session.md', "label: Ambush\nparty: {}\nmonsters: []");

		// Press each twice: two distinct encounters, each idempotent on its own tracker.
		for (const button of [first, second, first, second]) {
			button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await flushAsync();
		}

		expect(fenceCount(app.vault.getContent('Session.md')!)).toBe(2);
		expect(sidebarPanels(app)).toBe(2);
		plugin.onunload();
	});

	test('the tracker block records WHICH encounter generated it, and that id is STABLE across presses', async () => {
		const app = new App();
		const plugin = makePlugin(app);
		await plugin.onload();
		app.vault.setFile('Session.md', '# Session\n');

		const button = await mountEncounter(plugin, 'Session.md', 'party: {}\nmonsters: []');
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await flushAsync();
		const from1 = /_dse_from:\s*([A-Za-z0-9_-]+)/.exec(app.vault.getContent('Session.md')!)?.[1];
		expect(from1).toBeDefined();

		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await flushAsync();
		const content = app.vault.getContent('Session.md')!;
		const from2 = /_dse_from:\s*([A-Za-z0-9_-]+)/.exec(content)?.[1];

		// Stability is the identity claim: a regenerated id every press would append a new
		// block every press, which is exactly the reported bug.
		expect(from2).toBe(from1);
		// It is the ENCOUNTER's id, not the tracker's own sidebar anchor — the two are
		// different keys on different blocks and must not be conflated.
		const ownAnchor = /_dse_anchor:\s*([A-Za-z0-9_-]+)/.exec(content)?.[1];
		expect(ownAnchor).toBeDefined();
		expect(ownAnchor).not.toBe(from1);
		plugin.onunload();
	});

	// The other half of the identity mechanism: the encounter block must keep the id it
	// minted, or press #2 mints a different one and appends again. In this harness the
	// encounter block is rendered from a source string rather than read out of the note,
	// so the durable write is observed where it actually happens — the host's write path.
	test('the encounter block persists the id it minted (durable across a reload)', async () => {
		const app = new App();
		const plugin = makePlugin(app);
		await plugin.onload();
		app.vault.setFile('Session.md', '# Session\n');

		const writes: string[] = [];
		const containerEl = document.createElement('div');
		const host: BlockHost & { containerEl: HTMLElement } = {
			mode: 'reading' as RenderMode,
			sourcePath: 'Session.md',
			containerEl,
			canPersist: true,
			addChild: (child) => child,
			getBlockInfo: () => ({ language: 'ds-encounter', lineStart: 0, lineEnd: 1 }),
			replaceSource: async (body: string) => {
				writes.push(body);
				return true;
			},
			blockKey: () => 'Session.md::ds-encounter::0',
		};
		await plugin.frameworkV2!.pipeline.run(encounterElement, 'party: {}\nmonsters: []', host);
		const button = (containerEl.firstElementChild as HTMLElement).querySelector<HTMLButtonElement>(
			'[aria-label="Open initiative tracker in sidebar"]',
		)!;

		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await flushAsync();
		// persist() is debounced, so let its timer run.
		await new Promise((resolve) => setTimeout(resolve, 400));

		const from = /_dse_from:\s*([A-Za-z0-9_-]+)/.exec(app.vault.getContent('Session.md')!)?.[1];
		expect(from).toBeDefined();
		expect(writes.some((w) => w.includes(`_dse_anchor: ${from}`))).toBe(true);
		plugin.onunload();
	});
});
