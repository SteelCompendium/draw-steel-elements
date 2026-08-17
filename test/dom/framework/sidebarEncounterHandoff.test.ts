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
import { PERSIST_DEBOUNCE_MS } from '@/framework/view';
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

	test('the first press creates; a later press BINDS to the same block and writes nothing', async () => {
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
		expect(afterSecond).toContain(`_dse_anchor: ${anchor}`);
		// SC-153 FIX ROUND 1: the note is BYTE-IDENTICAL across the second press. The
		// original fix spliced a freshly generated body in ("refresh in place"), which kept
		// the binding but discarded the tracker's live state; the next test pins the
		// consequence directly. Here the strongest available statement is the simplest one —
		// re-pressing does not write.
		expect(afterSecond).toBe(afterFirst);
		expect(Notice.notices.some((n) => /tracker block created/i.test(n))).toBe(true);
		// SC-153 FIX ROUND 2: THIS button does open the sidebar, so it is the one entitled to
		// say so — the "Create tracker block" case below gets the other wording.
		expect(
			Notice.notices.some((n) => /already has an initiative tracker block — opening it/i.test(n)),
		).toBe(true);
		expect(Notice.notices.some((n) => /was refreshed/i.test(n))).toBe(false);

		// Still one live panel, still bound (not degraded to the "not addressable" card).
		const leaf = app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0];
		const view = leaf.view as unknown as DseSidebarView;
		expect(view.contentEl.querySelectorAll('.dse-sidebar__panel')).toHaveLength(1);
		const panelEl = view.contentEl.querySelector('.dse-sidebar__panel') as HTMLElement;
		expect(panelEl.getAttribute('data-dse-sidebar-unavailable')).not.toBe('true');
		expect(panelEl.querySelector('[data-dse-element="initiative"]')).not.toBeNull();
		plugin.onunload();
	});

	test('SC-153 fix round 2: "Create tracker block" re-press does not claim to open anything', async () => {
		// Both buttons share writeTrackerBlock, but only "Open in sidebar" goes on to open a
		// leaf. Fix round 1 gave the shared reuse Notice sidebar-specific wording ("— opening
		// it."), so pressing "Create tracker block" twice announced a sidebar that never
		// appeared (re-review probe P-P: the Notice fired with zero sidebar leaves).
		const app = new App();
		const plugin = makePlugin(app);
		await plugin.onload();
		app.vault.setFile('Session.md', '# Session\n');

		const host = makeHost('Session.md');
		await plugin.frameworkV2!.pipeline.run(encounterElement, 'party: {}\nmonsters: []', host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		const createButton = root.querySelector<HTMLButtonElement>(
			'[aria-label="Create initiative tracker block"]',
		)!;

		createButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await flushAsync();
		Notice.notices.length = 0;
		createButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await flushAsync();

		// Nothing was opened, so nothing may say it was — and the Notice names the manual
		// regenerate instead, which is the one thing the user can actually do from here.
		expect(app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)).toHaveLength(0);
		expect(Notice.notices.some((n) => /opening it/i.test(n))).toBe(false);
		expect(Notice.notices.some((n) => /left unchanged\. Delete it to build a fresh one/i.test(n))).toBe(true);
		// Still idempotent on the note itself.
		expect(fenceCount(app.vault.getContent('Session.md')!)).toBe(1);

		// The first press minted this encounter's `_dse_anchor` and scheduled its 400ms
		// write-behind (ElementView.persist, PERSIST_DEBOUNCE_MS). `flushAsync` only pumps
		// setTimeout(0) macrotasks, so that timer would still be armed when the test ends —
		// and unlike every other case in this file, this one never opens a sidebar leaf, so
		// `plugin.onunload()` has no panel to tear down and nothing flushes it. Left as-is it
		// makes jest's worker teardown report "Active timers can also cause this". Drain it.
		await new Promise((resolve) => setTimeout(resolve, PERSIST_DEBOUNCE_MS + 50));
		plugin.onunload();
	});

	test('SC-153 fix round 1: re-pressing does NOT destroy live tracker state', async () => {
		// The regression this fix exists for. `ds-initiative` is the live combat document —
		// round counter, current HP, combatants added mid-fight. The original SC-153 fix
		// regenerated its body from the encounter definition on every press, so the ordinary
		// "open the sidebar again after playing for a while" gesture silently reset the
		// fight. Before SC-153 the state survived (a duplicate block was appended instead),
		// so the rewrite was a regression in kind, not just a rough edge.
		const app = new App();
		const plugin = makePlugin(app);
		await plugin.onload();
		app.vault.setFile('Session.md', '# Session\n');

		const button = await mountEncounter(plugin, 'Session.md', 'party: {}\nmonsters: []');
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await flushAsync();

		// Play the fight: edit the generated block by hand, the way the tracker's own
		// controls (and a GM with a keyboard) do.
		const created = app.vault.getContent('Session.md')!;
		const lines = created.split('\n');
		const open = lines.findIndex((l) => l.trim() === '```ds-initiative');
		let close = open + 1;
		while (close < lines.length && lines[close].trim() !== '```') close++;
		lines.splice(close, 0, 'round: 3', 'heroes:', '  - name: Improvised Ally', '    current_hp: 7');
		app.vault.setFile('Session.md', lines.join('\n'));

		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await flushAsync();

		const after = app.vault.getContent('Session.md')!;
		expect(after).toContain('round: 3');
		expect(after).toContain('Improvised Ally');
		expect(after).toContain('current_hp: 7');
		// …and it is still ONE tracker and ONE panel: state survival did not cost idempotency.
		expect(fenceCount(after)).toBe(1);
		const leaf = app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0];
		const view = leaf.view as unknown as DseSidebarView;
		expect(view.contentEl.querySelectorAll('.dse-sidebar__panel')).toHaveLength(1);
		plugin.onunload();
	});

	test('SC-153 fix round 1: deleting the tracker and pressing again leaves exactly ONE live panel', async () => {
		// The orphan case. The first panel is bound to the deleted block's anchor, so the
		// regenerated block's fresh anchor is legitimately a different target — identity
		// dedupe alone cannot catch it, and the user was left with two panels for one block
		// (one of them dead, or worse, stale DOM that still looked live).
		const app = new App();
		const plugin = makePlugin(app);
		await plugin.onload();
		app.vault.setFile('Session.md', '# Session\n');

		const button = await mountEncounter(plugin, 'Session.md', 'party: {}\nmonsters: []');
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await flushAsync();

		const leaf = app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0];
		const view = leaf.view as unknown as DseSidebarView;
		expect(view.contentEl.querySelectorAll('.dse-sidebar__panel')).toHaveLength(1);

		// The user deletes the whole generated fence.
		const withBlock = app.vault.getContent('Session.md')!;
		const lines = withBlock.split('\n');
		const open = lines.findIndex((l) => l.trim() === '```ds-initiative');
		let close = open + 1;
		while (close < lines.length && lines[close].trim() !== '```') close++;
		lines.splice(open, close - open + 1);
		app.vault.setFile('Session.md', lines.join('\n'));
		expect(fenceCount(app.vault.getContent('Session.md')!)).toBe(0);

		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await flushAsync();
		await flushAsync(); // the orphan sweep re-reads the note before evicting

		expect(fenceCount(app.vault.getContent('Session.md')!)).toBe(1);
		const panels = view.contentEl.querySelectorAll('.dse-sidebar__panel');
		expect(panels).toHaveLength(1);
		expect((panels[0] as HTMLElement).getAttribute('data-dse-sidebar-unavailable')).not.toBe('true');
		expect(panels[0].querySelector('[data-dse-element="initiative"]')).not.toBeNull();
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
