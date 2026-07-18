// D8 Task 3 (spec §1's canonical use) — initiative-in-sidebar end-to-end. Proves the
// sidebar host is truly element-agnostic (D7's contract, §1.9) by driving the REAL,
// UNMODIFIED InitiativeView through sendToSidebar -> DseSidebarView -> SidebarPanel ->
// SidebarBlockHost -> ElementPipeline, exactly like test/dom/framework/dseSidebarView.test.ts
// does for ds-counter (Task 2). No initiative view-code edits were needed to make this
// pass — see main.ts's "send-initiative-to-sidebar" command and this file's own comments
// for the two small Task-3 host-side fixes that WERE needed (SidebarBlockHost's external-
// deletion degrade + SidebarPanel's in-place onUpdate refresh), neither of which touches
// src/elements/initiative/*.
//
// Harness note: this uses the SAME `test/mocks/obsidian.ts` App/Plugin/ItemView/WorkspaceLeaf
// harness as dseSidebarView.test.ts (real registerView/getRightLeaf/setViewState lifecycle),
// but that mock's `FakeVault.on()` is a deliberate no-op stub (see obsidian-core.ts's file
// header — "SccResolver's incremental index maintenance is exercised against
// fakeObsidian.ts's FakeVault instead"). Steps 4/5 below need REAL "modify" event delivery
// (an external note edit / deletion must actually reach SidebarBlockHost's vault listener),
// so `withRealModifyEvents()` locally monkey-patches this test's own `app.vault` instance
// (`.on`/`.process`) with real listener bookkeeping — scoped to this file only, no shared
// mock changed. `test/fakes/fakeObsidian.ts` was considered instead (it DOES have real
// event delivery) but its `makeFakeApp()` has no `workspace` at all, so it can't host
// DseSidebarView/WorkspaceLeaf — the monkey-patch is the smaller, more targeted fix.
import { App, Plugin, TFile, flushAsync, parseYaml } from '../../mocks/obsidian';
// Real ambient `obsidian` types (type-only, erased at runtime) — same convention
// registration.ts itself uses; the mock module has no MarkdownFileInfo/MarkdownView.
import type { Editor, MarkdownFileInfo, MarkdownView } from 'obsidian';
import DrawSteelAdmonitionPlugin, {
	initializeElementFrameworkV2,
	registerFrameworkElementDefinitions,
} from 'main';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { DseSidebarView, VIEW_TYPE_DSE_SIDEBAR } from '@/framework/sidebar/DseSidebarView';
import type { DseSidebarServices, SidebarPanelState } from '@/framework/sidebar/DseSidebarView';
import { sendToSidebar } from '@/framework/sidebar/registration';
import { PERSIST_DEBOUNCE_MS } from '@/framework/view';
import { InitiativeView } from '@/elements/initiative/view';
import initiativeExampleBody from '@/elements/initiative/example.yaml';

/** Builds a realistic Session.md: prose around a `ds-initiative` block whose body is
 *  copied verbatim from src/elements/initiative/example.yaml (imported, not retyped, so
 *  it can never drift from the real curated example). No `_dse_anchor` yet — sendToSidebar
 *  stamps one, exactly like a user invoking "Send initiative tracker to sidebar" for the
 *  first time. */
function sessionNote(): string {
	return [
		'# Session Notes',
		'',
		'Some prose before the block.',
		'',
		'```ds-initiative',
		...initiativeExampleBody.trim().split('\n'),
		'```',
		'',
		'Some prose after the block.',
	].join('\n');
}

/** Locates the fence/body/prefix/suffix of the (single) ds-initiative block in `content`,
 *  for asserting "every OTHER line of the note is byte-identical" without hardcoding line
 *  numbers (an anchor-stamp shifts everything after the fence-open by one line). */
function splitOnBlock(content: string): { prefix: string[]; body: string; suffix: string[] } {
	const lines = content.split('\n');
	const openIdx = lines.indexOf('```ds-initiative');
	const closeIdx = lines.indexOf('```', openIdx + 1);
	return {
		prefix: lines.slice(0, openIdx),
		body: lines.slice(openIdx + 1, closeIdx).join('\n'),
		suffix: lines.slice(closeIdx + 1),
	};
}

/** Monkey-patches THIS test's `app.vault` with real `on('modify', …)` delivery: `.on`
 *  records listeners instead of the shared mock's no-op stub, `.process` (the only write
 *  path SidebarBlockHost uses) fires them after writing — matching real Obsidian firing
 *  "modify" after any successful vault write, including our own (self-echo is then the
 *  host's job to filter, exactly as production does). `fireModify` lets a test simulate a
 *  write that didn't go through `.process` (e.g. `vault.setFile`, used to seed/overwrite
 *  content directly, the same test-only helper dseSidebarView.test.ts uses). */
function withRealModifyEvents(app: App): { fireModify: (file: TFile) => void } {
	const listeners: Array<(file: TFile) => void> = [];
	const vault = app.vault as unknown as {
		on: (name: string, cb: (...args: any[]) => any) => any;
		process: (file: TFile, fn: (data: string) => string) => Promise<string>;
	};
	vault.on = (name: string, cb: (...args: any[]) => any) => {
		if (name === 'modify') listeners.push(cb);
		return { unsubscribe: () => {} };
	};
	const originalProcess = vault.process.bind(vault);
	vault.process = async (file: TFile, fn: (data: string) => string) => {
		const result = await originalProcess(file, fn);
		for (const cb of listeners.slice()) cb(file);
		return result;
	};
	return { fireModify: (file: TFile) => { for (const cb of listeners.slice()) cb(file); } };
}

function setup() {
	const app = new App();
	const plugin = new Plugin(app);
	// `as any`: same real-ambient-vs-mock structural cast dseSidebarView.test.ts uses.
	const frameworkV2 = initializeElementFrameworkV2(app as any, plugin as any, DEFAULT_SETTINGS);
	registerFrameworkElementDefinitions(frameworkV2.registry);
	const services = {
		app,
		plugin,
		pipeline: frameworkV2.pipeline,
		registry: frameworkV2.registry,
		refs: frameworkV2.services.refs,
		validation: frameworkV2.services.validation,
		prefs: frameworkV2.services.prefs,
	} as unknown as DseSidebarServices;
	plugin.registerView(VIEW_TYPE_DSE_SIDEBAR, ((leaf: any) => new DseSidebarView(leaf, services)) as any);
	const { fireModify } = withRealModifyEvents(app);
	return { app, plugin, services, fireModify };
}

async function openSidebarLeaf(app: App) {
	const leaf = app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0];
	const view = leaf.view as unknown as DseSidebarView;
	return { leaf, view };
}

function panelElOf(view: DseSidebarView): HTMLElement {
	return view.contentEl.querySelector('.dse-sidebar__panel') as HTMLElement;
}

function malicePlusBtn(view: DseSidebarView): HTMLButtonElement {
	return panelElOf(view).querySelector<HTMLButtonElement>(
		'.dse-init__malice .dse-stepper__btn[aria-label="Increase Malice"]',
	)!;
}

/** Reaches into DseSidebarView's private `panels` — matches the level of internal access
 *  test/dom/framework/sidebarBlockHost.test.ts already uses for host-level assertions
 *  (canPersist / replaceSource) the DOM alone can't observe. */
function firstPanel(view: DseSidebarView): any {
	return (view as any).panels[0];
}

describe('D8 Task 3: initiative-in-sidebar end-to-end (spec §1 canonical use)', () => {
	test('sendToSidebar mounts the SAME, unmodified InitiativeView in a sidebar leaf', async () => {
		const { app, services } = setup();
		app.vault.setFile('Session.md', sessionNote());

		await sendToSidebar(services, 'Session.md', 'ds-initiative');
		await flushAsync();

		const { view } = await openSidebarLeaf(app);
		const panelEl = panelElOf(view);
		const root = panelEl.querySelector('[data-dse-element="initiative"]');
		expect(root).not.toBeNull();
		expect(root!.querySelector('.dse-init')).not.toBeNull();
		expect(panelEl.querySelector('.dse-init__entry .dse-init__name')?.textContent).toBe('Frodo Baggins');
		expect(malicePlusBtn(view)).not.toBeNull();

		// The mounted Component really is the production InitiativeView, not a stand-in.
		const host = firstPanel(view).host;
		expect(host.lastMountedChild).toBeInstanceOf(InitiativeView);
	});

	test('a malice stepper mutation in the sidebar persists to the note; every other line is byte-identical', async () => {
		const { app, services } = setup();
		const original = sessionNote();
		app.vault.setFile('Session.md', original);
		await sendToSidebar(services, 'Session.md', 'ds-initiative');
		await flushAsync();
		const { view } = await openSidebarLeaf(app);

		jest.useFakeTimers();
		malicePlusBtn(view).click(); // mutates the model + schedules the debounced persist()
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		jest.useRealTimers();

		const updated = app.vault.getContent('Session.md')!;
		const before = splitOnBlock(original);
		const after = splitOnBlock(updated);

		// Everything OUTSIDE the fence is untouched (fence + alias preserved too).
		expect(after.prefix).toEqual(before.prefix);
		expect(after.suffix).toEqual(before.suffix);

		// Inside the block, malice.value incremented (5 -> 6); parsed rather than
		// string-matched, since serialize() reformats the whole block (expected — every
		// persisted write rewrites the block from the model, per F1 §4.2).
		const parsed = parseYaml(after.body);
		expect(parsed.malice.value).toBe(6);
		// Anchor round-tripped (its generated id is hex digits, so a value like "145902"
		// legitimately parses back as a YAML number rather than a string — the anchor.ts
		// regex reader doesn't care about that, only findAnchoredBlock's raw-text match
		// does; asserting definedness, not a type, is the correct check here).
		expect(parsed._dse_anchor).toBeDefined();
	});

	test('note navigation does not unmount the sidebar leaf; a second stepper change still persists (path-addressed, not ctx-addressed)', async () => {
		const { app, services } = setup();
		app.vault.setFile('Session.md', sessionNote());
		app.vault.setFile('OtherNote.md', '# Somewhere else entirely');
		await sendToSidebar(services, 'Session.md', 'ds-initiative');
		await flushAsync();
		const { leaf: sidebarLeaf, view } = await openSidebarLeaf(app);

		// Simulate the active MARKDOWN leaf switching to a different note. The sidebar
		// leaf is a separate, independent leaf — SidebarBlockHost addresses Session.md by
		// path, never via any "currently active" context.
		const otherLeaf = app.workspace.getRightLeaf(false)!;
		app.workspace._activeLeaf = otherLeaf;

		// The sidebar leaf/panel are still there, untouched by the navigation.
		expect(app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)).toContain(sidebarLeaf);
		expect(panelElOf(view).querySelector('[data-dse-element="initiative"]')).not.toBeNull();

		jest.useFakeTimers();
		malicePlusBtn(view).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		jest.useRealTimers();

		const parsed = parseYaml(splitOnBlock(app.vault.getContent('Session.md')!).body);
		expect(parsed.malice.value).toBe(6); // incremented once, in THIS test
	});

	test('deleting the anchored block degrades the panel to the read-only "not found" notice; further writes no-op', async () => {
		const { app, services, fireModify } = setup();
		app.vault.setFile('Session.md', sessionNote());
		await sendToSidebar(services, 'Session.md', 'ds-initiative');
		await flushAsync();
		const { view } = await openSidebarLeaf(app);
		expect(panelElOf(view).querySelector('[data-dse-element="initiative"]')).not.toBeNull();

		// External deletion of the whole block (e.g. the user removed it in the note).
		app.vault.setFile('Session.md', 'the block is gone; only prose remains');
		fireModify(app.vault.getAbstractFileByPath('Session.md') as TFile);
		await flushAsync();

		const panelEl = panelElOf(view);
		expect(panelEl.getAttribute('data-dse-sidebar-unavailable')).toBe('true');
		expect(panelEl.querySelector('.dse-error-card-message')?.textContent).toBe(
			'Backing block not found — re-link this panel from the note.',
		);
		// Visibly read-only: no stepper survives into the degrade card.
		expect(panelEl.querySelector('.dse-stepper')).toBeNull();
		expect(panelEl.querySelector('input')).toBeNull();

		// And the underlying contract: canPersist is false, replaceSource resolves false
		// (never throws), matching SidebarBlockHost's own unit-level guarantee.
		const host = firstPanel(view).host;
		expect(host.canPersist).toBe(false);
		await expect(host.replaceSource('malice:\n  value: 99')).resolves.toBe(false);
		expect(app.vault.getContent('Session.md')).toBe('the block is gone; only prose remains'); // untouched
	});

	test('an external edit to a hero\'s stamina refreshes the mounted view in place via onUpdate — no remount', async () => {
		const { app, services, fireModify } = setup();
		app.vault.setFile('Session.md', sessionNote());
		await sendToSidebar(services, 'Session.md', 'ds-initiative');
		await flushAsync();
		const { view } = await openSidebarLeaf(app);

		const panelEl = panelElOf(view);
		const rootBefore = panelEl.querySelector('[data-dse-element="initiative"]');
		expect(rootBefore).not.toBeNull();
		const staminaBefore = panelEl.querySelector('.dse-init__entry .dse-init__stamina')?.textContent;
		expect(staminaBefore).toBe('80/80'); // Frodo: max_stamina 80, current_stamina defaults to max

		// Externally edit Frodo's stamina (as if the block were also open side-by-side).
		const current = app.vault.getContent('Session.md')!;
		const edited = current.replace(
			'    max_stamina: 80',
			'    max_stamina: 80\n    current_stamina: 50',
		);
		expect(edited).not.toBe(current); // sanity: the replace actually matched
		app.vault.setFile('Session.md', edited);
		fireModify(app.vault.getAbstractFileByPath('Session.md') as TFile);
		await flushAsync();

		// Root element identity is STABLE (same DOM node) — proof this went through
		// ElementView.update() in place, not a pipeline remount that would have created
		// a fresh `[data-dse-element="initiative"]` div.
		const rootAfter = panelElOf(view).querySelector('[data-dse-element="initiative"]');
		expect(rootAfter).toBe(rootBefore);
		const staminaAfter = panelElOf(view).querySelector('.dse-init__entry .dse-init__stamina')?.textContent;
		expect(staminaAfter).toBe('50/80');
	});

	// Review round 1 (Task 3 finding #1, MEDIUM): SidebarPanel's in-place refresh used to
	// hand-copy pipeline.ts's parse/validate/resolveRefs slice and silently drop
	// extractPrefOverrides — so a `prefs:` key introduced by an external edit would ride
	// into initiative's model as a stray own property (its parse() is a passthrough,
	// `const data = input as EncounterData; ...; return data;`) and get serialized back
	// out on the model's NEXT persist, via the ORIGINAL serializer captured at mount
	// (which never learned about the new override). Fixed by round 1's structural
	// refactor: handleExternalChange now calls the SAME prepareModel() pipeline.run()
	// calls, which pops `prefs:` off the raw data before def.parse ever sees it — so the
	// refreshed model can never carry a stray `prefs` field, and the next persist can't
	// leak it either.
	test('an externally-injected prefs: key does not leak into the model on the next persist (finding #1)', async () => {
		const { app, services, fireModify } = setup();
		app.vault.setFile('Session.md', sessionNote());
		await sendToSidebar(services, 'Session.md', 'ds-initiative');
		await flushAsync();
		const { view } = await openSidebarLeaf(app);

		const panelEl = panelElOf(view);
		const rootBefore = panelEl.querySelector('[data-dse-element="initiative"]');
		expect(rootBefore).not.toBeNull();

		// Externally edit the block to add a reserved `prefs:` override map (as if the
		// block were also open side-by-side and a user added it by hand).
		const current = app.vault.getContent('Session.md')!;
		const { body: bodyBefore } = splitOnBlock(current);
		const editedBody = `prefs:\n  portraits: off\n${bodyBefore}`;
		const edited = current.replace(bodyBefore, editedBody);
		expect(edited).not.toBe(current); // sanity: the replace actually matched
		app.vault.setFile('Session.md', edited);
		fireModify(app.vault.getAbstractFileByPath('Session.md') as TFile);
		await flushAsync();

		// Same root node — proves the in-place refresh path (prepareModel + update())
		// engaged rather than falling back to a full remount.
		const rootAfter = panelElOf(view).querySelector('[data-dse-element="initiative"]');
		expect(rootAfter).toBe(rootBefore);

		// A self-write (malice stepper) forces persist() -> serialize(this.model) against
		// the REFRESHED model. Byte-stable contract: the model must never have picked up
		// the injected `prefs` key, so it cannot appear in what gets written back out.
		jest.useFakeTimers();
		malicePlusBtn(view).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		jest.useRealTimers();

		const persisted = app.vault.getContent('Session.md')!;
		const parsed = parseYaml(splitOnBlock(persisted).body);
		expect(parsed.malice.value).toBe(6); // the stepper mutation still landed
		expect(Object.prototype.hasOwnProperty.call(parsed, 'prefs')).toBe(false);
	});

	// D8 Task 3 — "Send initiative tracker to sidebar": the thin main.ts wire proving
	// sendToSidebar(services, path, "ds-initiative") end to end through PRODUCTION onload
	// (not just the lighter initializeElementFrameworkV2 harness the tests above use).
	// Drives the real DrawSteelAdmonitionPlugin exactly like plugin-wiring.test.ts does.
	test('the "Send initiative tracker to sidebar" command binds the active note\'s block without requiring the cursor inside it', async () => {
		const app = new App();
		const plugin = new DrawSteelAdmonitionPlugin(app as any, { id: 'draw-steel-elements', version: 'test' } as any);
		app.vault.setFile('Session.md', sessionNote());

		await plugin.onload();

		// `as any`: DrawSteelAdmonitionPlugin extends the REAL ambient obsidian Plugin
		// (no `commands` field there) — `commands` is the mock's own record-what-you're-
		// asked-to-do bookkeeping (test/mocks/obsidian-core.ts), same cast convention
		// plugin-wiring.test.ts uses throughout for mock-only members.
		const command = (plugin as any).commands.find((c: any) => c.id === 'send-initiative-to-sidebar');
		expect(command).toBeDefined();
		expect(typeof command.editorCheckCallback).toBe('function');

		const fakeEditor = { getCursor: () => ({ line: 0, ch: 0 }) } as unknown as Editor;
		const fakeCtx = { file: app.vault.getAbstractFileByPath('Session.md') } as unknown as MarkdownView | MarkdownFileInfo;

		// checking pass: reports available without side effects.
		expect(command.editorCheckCallback(true, fakeEditor, fakeCtx)).toBe(true);
		expect(app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)).toHaveLength(0);

		// execute pass: actually binds + opens the sidebar.
		command.editorCheckCallback(false, fakeEditor, fakeCtx);
		await flushAsync();

		const { view } = await openSidebarLeaf(app);
		expect(panelElOf(view).querySelector('[data-dse-element="initiative"]')).not.toBeNull();
	});
});
