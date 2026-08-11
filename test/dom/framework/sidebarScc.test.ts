// test/dom/framework/sidebarScc.test.ts — SC-158: "Send block to sidebar" must not break
// a `ds-scc` block.
//
// THE BUG. `sendToSidebar` gives a block a durable identity by stamping a
// `_dse_anchor: <id>` line INTO ITS BODY (anchor.ts's `ensureAnchor`), so the panel can
// re-find the fence after arbitrary line drift. That is invisible for a YAML-bodied
// element — the key rides along as an unknown property, and every persisted model grew an
// explicit passthrough field so it survives `serialize` (see SidebarBlockHost.ts's header).
// `ds-scc`'s body is not YAML: it is exactly one SCC code. Stamping a second line into it
// turns a working reference block into the plugin's own refusal card — permanently, since
// the stamp is written to the note and outlives the sidebar session.
//
// These tests are written against the REAL sendToSidebar + the REAL pipeline, so they fail
// on the shipped behavior (verified before the fix: the note gained an `_dse_anchor:` line
// and the rendered block was a notice card).
import { App, Plugin, TFile, flushAsync } from '../../mocks/obsidian';
import { initializeElementFrameworkV2, registerFrameworkElementDefinitions } from 'main';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { DseSidebarView, VIEW_TYPE_DSE_SIDEBAR } from '@/framework/sidebar/DseSidebarView';
import type { DseSidebarServices } from '@/framework/sidebar/DseSidebarView';
import { sendToSidebar } from '@/framework/sidebar/registration';
import { ANCHOR_KEY } from '@/framework/sidebar/anchor';

const CODE = 'mcdm.heroes.v1/kit/panther';
const NOTE = 'Session.md';

function sccNote(): string {
	return ['# Session Notes', '', 'Some prose before the block.', '', '```ds-scc', CODE, '```', '', 'After.'].join(
		'\n',
	);
}

/** The mock vault's `on`/`process` are deliberate stubs (obsidian-core.ts's header); the
 *  sidebar path needs `process` to actually mutate and `modify` to actually deliver.
 *  Same locally-scoped monkey-patch sidebarInitiative.test.ts uses, verbatim in spirit. */
function withRealModifyEvents(app: App): void {
	const listeners: ((...args: any[]) => any)[] = [];
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
}

interface Harness {
	app: App;
	registry: ReturnType<typeof initializeElementFrameworkV2>['registry'];
	pipeline: ReturnType<typeof initializeElementFrameworkV2>['pipeline'];
	services: DseSidebarServices;
	content(): string;
}

function setup(): Harness {
	const app = new App();
	const plugin = new Plugin(app);
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
	withRealModifyEvents(app);
	app.vault.setFile(NOTE, sccNote());
	return {
		app,
		registry: frameworkV2.registry,
		pipeline: frameworkV2.pipeline,
		services,
		content: () => app.vault.getContent(NOTE)!,
	};
}

/** Render the note's ds-scc block the way reading mode would, and hand back its root. */
async function renderBlockFromNote(h: Harness, content: string): Promise<HTMLElement> {
	const lines = content.split('\n');
	const open = lines.findIndex((l) => l.trim() === '```ds-scc');
	const close = lines.findIndex((l, i) => i > open && l.trim() === '```');
	const body = lines.slice(open + 1, close).join('\n');
	const def = h.registry.get('ds-scc')!;
	const containerEl = document.createElement('div');
	document.body.appendChild(containerEl);
	await h.pipeline.run(def, body, {
		mode: 'reading',
		sourcePath: NOTE,
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-scc', lineStart: open, lineEnd: close }),
		replaceSource: async () => true,
		blockKey: () => `${NOTE}::ds-scc::${open}`,
	} as never);
	return containerEl.firstElementChild as HTMLElement;
}

function noticeText(root: HTMLElement): string {
	return root.querySelector('.dse-ref-notice')?.textContent ?? '';
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('SC-158 — sending a ds-scc block to the sidebar', () => {
	test('the note is byte-identical afterwards: no anchor is stamped into a strict body', async () => {
		const h = setup();
		const before = h.content();

		await sendToSidebar(h.services, NOTE, 'ds-scc', 5);
		await flushAsync();

		expect(h.content()).toBe(before);
		expect(h.content()).not.toContain(ANCHOR_KEY);
	});

	test('the block still renders its card afterwards — not the strict-body refusal', async () => {
		const h = setup();
		await sendToSidebar(h.services, NOTE, 'ds-scc', 5);
		await flushAsync();

		const root = await renderBlockFromNote(h, h.content());
		// No compendium is wired in this harness, so the honest end state is the
		// "not installed" notice — NOT the strict-body refusal, which is the bug.
		expect(noticeText(root)).not.toContain('more than one line');
		expect(noticeText(root)).not.toContain('must be a single SCC code');
	});

	test('a YAML-bodied element is still stamped — the fix did not disable anchoring', async () => {
		const h = setup();
		h.app.vault.setFile(
			'Yaml.md',
			['# N', '', '```ds-counter', 'name: Torches', 'value: 3', '```'].join('\n'),
		);

		await sendToSidebar(h.services, 'Yaml.md', 'ds-counter', 3);
		await flushAsync();

		expect(h.app.vault.getContent('Yaml.md')!).toContain(`${ANCHOR_KEY}: `);
	});

	test('the sidebar gets a panel for the block, and it mounts (pin still works)', async () => {
		const h = setup();
		await sendToSidebar(h.services, NOTE, 'ds-scc', 5);
		await flushAsync();

		const leaf = h.app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0];
		expect(leaf).toBeDefined();
		const view = leaf.view as unknown as DseSidebarView;
		const panelEl = view.contentEl.querySelector('.dse-sidebar__panel') as HTMLElement;
		expect(panelEl).not.toBeNull();
		const root = panelEl.querySelector('[data-dse-element]') as HTMLElement;
		expect(root).not.toBeNull();
		expect(noticeText(root)).not.toContain('more than one line');
	});

	test('the panel state carries the body as identity, and no anchor id', async () => {
		const h = setup();
		await sendToSidebar(h.services, NOTE, 'ds-scc', 5);
		await flushAsync();

		const view = h.app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0].view as unknown as DseSidebarView;
		// getState() is what Obsidian persists across restarts — the identity has to be in
		// THERE, or a pinned ds-scc block would come back unbound.
		const [state] = (view.getState() as { panels: { anchorId: string | null; body?: string }[] }).panels;
		expect(state.anchorId).toBeNull();
		expect(state.body).toBe(CODE);
	});

	test('the binding survives line drift above the block — the property the anchor bought', async () => {
		const h = setup();
		await sendToSidebar(h.services, NOTE, 'ds-scc', 5);
		await flushAsync();
		const view = h.app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0].view as unknown as DseSidebarView;
		const host = (view as unknown as { panels: { host: { refresh(): Promise<void>; getBlockInfo(): unknown } }[] })
			.panels[0].host;

		expect((host.getBlockInfo() as { lineStart: number }).lineStart).toBe(4);

		// Someone types prose above the block.
		h.app.vault.setFile(NOTE, ['Lorem', '', 'Ipsum', '', h.content()].join('\n'));
		await host.refresh();

		const info = host.getBlockInfo() as { lineStart: number } | null;
		expect(info).not.toBeNull();
		expect(info!.lineStart).toBe(8); // shifted down by the inserted lines, still found
	});

	test('editing the code in a single-block note re-binds instead of unbinding', async () => {
		const h = setup();
		await sendToSidebar(h.services, NOTE, 'ds-scc', 5);
		await flushAsync();
		const view = h.app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0].view as unknown as DseSidebarView;
		const host = (view as unknown as { panels: { host: { refresh(): Promise<void>; currentBody(): string | null } }[] })
			.panels[0].host;

		h.app.vault.setFile(NOTE, h.content().replace(CODE, 'mcdm.heroes.v1/condition/bleeding'));
		await host.refresh();

		expect(host.currentBody()).toBe('mcdm.heroes.v1/condition/bleeding');
	});

	test('with two ds-scc blocks, the cursor picks which one is bound', async () => {
		const h = setup();
		const second = 'mcdm.heroes.v1/condition/bleeding';
		h.app.vault.setFile(
			NOTE,
			['# N', '', '```ds-scc', CODE, '```', '', '```ds-scc', second, '```'].join('\n'),
		);

		await sendToSidebar(h.services, NOTE, 'ds-scc', 7); // cursor inside the SECOND block
		await flushAsync();

		const view = h.app.workspace.getLeavesOfType(VIEW_TYPE_DSE_SIDEBAR)[0].view as unknown as DseSidebarView;
		const [state] = (view.getState() as { panels: { body?: string }[] }).panels;
		expect(state.body).toBe(second);
		expect(h.content()).not.toContain(ANCHOR_KEY);
	});
});
