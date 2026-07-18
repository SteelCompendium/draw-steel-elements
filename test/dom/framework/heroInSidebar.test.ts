// D7 Task 10 (spec §5) — ds-hero in the D8 sidebar: the ACCEPTANCE PROOF that the
// unmodified `HeroSheetView` mounts under `SidebarBlockHost` with ZERO sheet view-code
// changes (spec §5: "HeroSheetView is instantiated identically ... only cx.host differs.
// Zero view-code change"). Mirrors test/dom/framework/sidebarInitiative.test.ts (D8 Task
// 3's canonical use) almost line for line — same harness (`test/mocks/obsidian.ts`'s
// App/Plugin/ItemView/WorkspaceLeaf, `initializeElementFrameworkV2` +
// `registerFrameworkElementDefinitions`, a local `withRealModifyEvents` for genuine vault
// "modify" delivery — `test/fakes/fakeObsidian.ts` DOES deliver real events but its
// `makeFakeApp()` has no `workspace`, so it can't host DseSidebarView either, same
// rationale as sidebarInitiative.test.ts's own header) — proving the sidebar host is
// truly element-agnostic for D7's flagship the same way Task 3 proved it for initiative.
//
// No compendium wired (`initializeElementFrameworkV2`'s optional `compendium` param is
// omitted, same as sidebarInitiative.test.ts): the hero's own `example.yaml` authors
// explicit `max_stamina`/`recoveries_max`/`resource` overrides (spec §3.5's "sheet still
// fully works from inline YAML" degrade path), so every derived stat/interaction below
// works without a resolved class/kit/ancestry — the unresolved `scc:` refs just render
// "Compendium not installed" issue notices, which none of these tests assert against.
//
// FOUND BUG (fixed alongside this test, framework/pipeline.ts — NOT src/elements/hero/*):
// `ds-hero` is the FIRST schema'd, `additionalProperties: false` persisted element ever
// sent to the sidebar (resource/tokens/roll/surges/conditions share the same schema shape
// but none is sidebar-mounted yet; initiative/encounter/montage/project/party — the
// elements already proven in the sidebar — have NO schema at all, so they never hit this).
// `sendToSidebar` stamps a `_dse_anchor: <id>` line directly into the block's raw YAML
// body (anchor.ts), entirely independent of any element's schema — with
// `additionalProperties: false` at the document root, AJV rejects that unrecognized key
// outright, so the very FIRST mount through the sidebar renders a schema error card
// instead of the hero sheet. This is a framework-level gap (any future schema'd element
// hits it identically the day it's first sidebar-mounted), not a hero-specific one, so the
// fix lives in `prepareModel` (pipeline.ts): `_dse_anchor` is excluded from what SCHEMA
// VALIDATION sees (a shallow clone, never mutating `rawData` itself) — `def.parse` still
// receives the unmodified `rawData` AND the untouched raw `source` text, so an element
// whose `parse()` passes `_dse_anchor` through as an ordinary field (e.g. initiative's
// passthrough parse) keeps working exactly as before, and `ds-hero`'s own raw-TEXT
// `defnRaw` splice (model.ts) never looks at the parsed `data` object for the anchor at
// all — only the schema gate was too narrow.
import { App, Plugin, TFile, flushAsync, parseYaml } from '../../mocks/obsidian';
import DrawSteelAdmonitionPlugin, {
	initializeElementFrameworkV2,
	registerFrameworkElementDefinitions,
} from 'main';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { DseSidebarView, VIEW_TYPE_DSE_SIDEBAR } from '@/framework/sidebar/DseSidebarView';
import type { DseSidebarServices } from '@/framework/sidebar/DseSidebarView';
import { sendToSidebar } from '@/framework/sidebar/registration';
import { PERSIST_DEBOUNCE_MS } from '@/framework/view';
import { HeroSheetView } from '@/elements/hero/view';
import heroExampleBody from '@/elements/hero/example.yaml';

/** Builds a realistic Session.md: prose around a `ds-hero` block whose body is copied
 *  verbatim from src/elements/hero/example.yaml (imported, not retyped, so it can never
 *  drift from the real curated example — sidebarInitiative.test.ts's own convention). No
 *  `_dse_anchor` yet — sendToSidebar stamps one, exactly like a user invoking "Send block
 *  to sidebar" for the first time. */
function sessionNote(): string {
	return [
		'# Session Notes',
		'',
		'Some prose before the block.',
		'',
		'```ds-hero',
		...heroExampleBody.trim().split('\n'),
		'```',
		'',
		'Some prose after the block.',
	].join('\n');
}

/** Locates the fence/body/prefix/suffix of the (single) ds-hero block in `content`, for
 *  asserting "every OTHER line of the note is byte-identical" without hardcoding line
 *  numbers (mirrors sidebarInitiative.test.ts's own splitOnBlock). */
function splitOnBlock(content: string): { prefix: string[]; body: string; suffix: string[] } {
	const lines = content.split('\n');
	const openIdx = lines.indexOf('```ds-hero');
	const closeIdx = lines.indexOf('```', openIdx + 1);
	return {
		prefix: lines.slice(0, openIdx),
		body: lines.slice(openIdx + 1, closeIdx).join('\n'),
		suffix: lines.slice(closeIdx + 1),
	};
}

/** Everything before the top-level `state:` key, trailing whitespace trimmed — the
 *  state-scoped splice's own byte-stability contract (spec §3.4; mirrors
 *  test/dom/elements/heroSheet.test.ts's own helper of the same name, applied here to just
 *  the block BODY rather than the whole source). */
function defnPortion(body: string): string {
	const idx = body.search(/^state:/m);
	return (idx === -1 ? body : body.slice(0, idx)).replace(/\s+$/u, '');
}

/** Monkey-patches THIS test's `app.vault` with real `on('modify', …)` delivery (verbatim
 *  from sidebarInitiative.test.ts — see that file's header for why this, not
 *  fakeObsidian.ts, is the smaller targeted fix). */
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
	// `as any`: same real-ambient-vs-mock structural cast sidebarInitiative.test.ts uses.
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

function staminaMinusBtn(view: DseSidebarView): HTMLButtonElement {
	return panelElOf(view).querySelector<HTMLButtonElement>(
		'[data-dse-hero-region="stamina"] button[aria-label="Decrease Stamina"]',
	)!;
}

/** Reaches into DseSidebarView's private `panels` — matches the level of internal access
 *  sidebarInitiative.test.ts already uses for host-level assertions (canPersist /
 *  replaceSource) the DOM alone can't observe. */
function firstPanel(view: DseSidebarView): any {
	return (view as any).panels[0];
}

describe('D7 Task 10: ds-hero in sidebar e2e (spec §5)', () => {
	test('sendToSidebar mounts the SAME, unmodified HeroSheetView in a sidebar leaf', async () => {
		const { app, services } = setup();
		app.vault.setFile('Session.md', sessionNote());

		await sendToSidebar(services, 'Session.md', 'ds-hero');
		await flushAsync();

		const { view } = await openSidebarLeaf(app);
		const panelEl = panelElOf(view);
		const root = panelEl.querySelector('[data-dse-element="hero"]');
		expect(root).not.toBeNull();
		expect(root!.querySelector('.dse-hero')).not.toBeNull();
		expect(panelEl.querySelector('.dse-hero__name')?.textContent).toBe('Torin Stonefist');
		expect(staminaMinusBtn(view)).not.toBeNull();

		// The mounted Component really is the production HeroSheetView, not a stand-in.
		const host = firstPanel(view).host;
		expect(host.lastMountedChild).toBeInstanceOf(HeroSheetView);
	});

	test('a stamina stepper change in the sidebar persists to the note; the authored definition is byte-identical', async () => {
		const { app, services } = setup();
		const original = sessionNote();
		app.vault.setFile('Session.md', original);
		await sendToSidebar(services, 'Session.md', 'ds-hero');
		await flushAsync();
		const { view } = await openSidebarLeaf(app);

		jest.useFakeTimers();
		staminaMinusBtn(view).click(); // mutates the model + schedules the debounced persist()
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		jest.useRealTimers();

		const updated = app.vault.getContent('Session.md')!;
		const before = splitOnBlock(original);
		const after = splitOnBlock(updated);

		// Everything OUTSIDE the fence is untouched (fence + alias preserved too).
		expect(after.prefix).toEqual(before.prefix);
		expect(after.suffix).toEqual(before.suffix);

		// Inside the block: every authored DEFINITION line survives untouched, in order
		// (spec §3.4's state-scoped splice contract) — the ONLY addition is the
		// `_dse_anchor:` line sendToSidebar stamped in (model.ts's raw-text `defnRaw`
		// splice relocates it ahead of the SPLICED-OUT `state:` span, same documented
		// normalization as "state: always serializes last" — it's appended after the
		// original state's own span in the raw note, sendToSidebar's own doc — not a
		// corruption of the authored text itself).
		const originalDefnLines = defnPortion(heroExampleBody).split('\n');
		const afterDefnLines = defnPortion(after.body).split('\n');
		expect(afterDefnLines.slice(0, originalDefnLines.length)).toEqual(originalDefnLines);
		expect(afterDefnLines.slice(originalDefnLines.length)).toEqual([expect.stringMatching(/^_dse_anchor:\s*\S+$/)]);

		// state.stamina.current decremented (31 -> 30); parsed rather than string-matched,
		// since serialize() reformats the `state:` block on every write (expected).
		const parsedState = parseYaml(after.body.slice(after.body.search(/^state:/m)));
		expect(parsedState.state.stamina.current).toBe(30);
	});

	test('note navigation does not unmount the sidebar leaf; a second stamina change still persists (path-addressed, not ctx-addressed)', async () => {
		const { app, services } = setup();
		app.vault.setFile('Session.md', sessionNote());
		app.vault.setFile('OtherNote.md', '# Somewhere else entirely');
		await sendToSidebar(services, 'Session.md', 'ds-hero');
		await flushAsync();
		const { leaf: sidebarLeaf, view } = await openSidebarLeaf(app);

		// Simulate the active MARKDOWN leaf switching to a different note. The sidebar
		// leaf is a separate, independent leaf — SidebarBlockHost addresses Session.md by
		// path, never via any "currently active" context.
		const otherLeaf = app.workspace.getRightLeaf(false)!;
		app.workspace._activeLeaf = otherLeaf;

		// The sidebar leaf/panel are still there, untouched by the navigation.
		expect(app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)).toContain(sidebarLeaf);
		expect(panelElOf(view).querySelector('[data-dse-element="hero"]')).not.toBeNull();

		jest.useFakeTimers();
		staminaMinusBtn(view).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		jest.useRealTimers();

		const body = splitOnBlock(app.vault.getContent('Session.md')!).body;
		const parsedState = parseYaml(body.slice(body.search(/^state:/m)));
		expect(parsedState.state.stamina.current).toBe(30); // decremented once, in THIS test
	});

	test('deleting the anchored block degrades the panel to the read-only "not found" notice; further writes no-op', async () => {
		const { app, services, fireModify } = setup();
		app.vault.setFile('Session.md', sessionNote());
		await sendToSidebar(services, 'Session.md', 'ds-hero');
		await flushAsync();
		const { view } = await openSidebarLeaf(app);
		expect(panelElOf(view).querySelector('[data-dse-element="hero"]')).not.toBeNull();

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
		await expect(host.replaceSource('state:\n  stamina: { current: 1, temp: 0 }')).resolves.toBe(false);
		expect(app.vault.getContent('Session.md')).toBe('the block is gone; only prose remains'); // untouched
	});

	test('an external edit to the hero\'s stamina refreshes the mounted view in place via onUpdate — no remount', async () => {
		const { app, services, fireModify } = setup();
		app.vault.setFile('Session.md', sessionNote());
		await sendToSidebar(services, 'Session.md', 'ds-hero');
		await flushAsync();
		const { view } = await openSidebarLeaf(app);

		const panelEl = panelElOf(view);
		const rootBefore = panelEl.querySelector('[data-dse-element="hero"]');
		expect(rootBefore).not.toBeNull();
		const staminaBefore = panelEl.querySelector('.dse-stamina__num')?.textContent;
		expect(staminaBefore).toContain('31/48'); // example.yaml: current 31, authored max_stamina 48

		// Externally edit the hero's stamina (as if the block were also open side-by-side).
		const current = app.vault.getContent('Session.md')!;
		const edited = current.replace('current: 31, temp: 0', 'current: 20, temp: 0');
		expect(edited).not.toBe(current); // sanity: the replace actually matched
		app.vault.setFile('Session.md', edited);
		fireModify(app.vault.getAbstractFileByPath('Session.md') as TFile);
		await flushAsync();

		// Root element identity is STABLE (same DOM node) — proof this went through
		// ElementView.update() in place (F1 §3.3's default "empty rootEl, re-onMount onto
		// the SAME rootEl" path — HeroSheetView defines no onUpdate override of its own),
		// not a pipeline remount that would have created a fresh
		// `[data-dse-element="hero"]` div.
		const rootAfter = panelElOf(view).querySelector('[data-dse-element="hero"]');
		expect(rootAfter).toBe(rootBefore);
		const staminaAfter = panelElOf(view).querySelector('.dse-stamina__num')?.textContent;
		expect(staminaAfter).toContain('20/48');
	});

	// D7 Task 10 (spec §5) — the same production-wiring proof sidebarInitiative.test.ts's
	// final test gives initiative: the GENERIC "Send block to sidebar" command
	// (registerDseSidebar, no hero-specific plumbing whatsoever — spec §5's "universal
	// opt-in") binds a ds-hero block through the REAL plugin onload(), not just the
	// lighter initializeElementFrameworkV2 harness the tests above use.
	test('the generic "Send block to sidebar" command mounts ds-hero through production onload()', async () => {
		const app = new App();
		const plugin = new DrawSteelAdmonitionPlugin(app as any, { id: 'draw-steel-elements', version: 'test' } as any);
		app.vault.setFile('Session.md', sessionNote());

		await plugin.onload();

		const command = (plugin as any).commands.find((c: any) => c.id === 'send-block-to-sidebar');
		expect(command).toBeDefined();

		// Cursor placed inside the ds-hero fence (line 4 = the fence-open line itself —
		// aliasAtLine's scan is exclusive of the cursor's own line, so this must be a line
		// STRICTLY inside the block; line 6, "level: 3", sits well within it).
		const fakeEditor = { getCursor: () => ({ line: 6, ch: 0 }), getLine: (n: number) => sessionNote().split('\n')[n] } as any;
		const fakeCtx = { file: app.vault.getAbstractFileByPath('Session.md') };

		expect(command.editorCheckCallback(true, fakeEditor, fakeCtx)).toBe(true);
		command.editorCheckCallback(false, fakeEditor, fakeCtx);
		await flushAsync();

		const { view } = await openSidebarLeaf(app);
		expect(panelElOf(view).querySelector('[data-dse-element="hero"]')).not.toBeNull();
	});
});
