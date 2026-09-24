// SC-340 (spec §6.2): a rebuild caused by the view's OWN write adopts the live view.
// Simulates Obsidian's order (r1 E1, B1): write -> NEW section's processor (same docId,
// detached el) -> OLD render child unloads.
import { registerFrameworkElements } from '../../../src/framework/registerFrameworkElements';
import { ElementPipeline } from '../../../src/framework/pipeline';
import { createElementRegistry, type ElementDefinition } from '../../../src/framework/registry';
import { counterElement } from '../../../src/elements/counter/definition';
import { initiativeElement } from '../../../src/elements/initiative/definition';
import { ViewRegistry, CLAIM_WINDOW_MS } from '../../../src/framework/host/viewRegistry';
import { captureFocus, restoreFocusWhenConnected } from '../../../src/framework/host/adoptView';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { makeFakeContext } from '../../mocks/obsidian';
import { makeEnv } from './_adoptionEnv';
import quickStart from '../../fixtures/initiative/quick-start.yaml';

function bodyOf(text: string, index = 0): string {
	const blocks = [...text.matchAll(/^```(ds-[\w-]+)\n([\s\S]*?)\n```$/gm)];
	return blocks[index][2];
}

async function setup(
	note: string,
	defs: ElementDefinition[] = [counterElement, initiativeElement],
	enabled = true,
	authoring = false,
) {
	const { deps, app, plugin } = makeEnv();
	if (authoring) await deps.prefs.set('authoringControls', true); // the Edit pencil (Task 6)
	app.vault.setFile('Note.md', note);
	plugin.load();
	const elements = createElementRegistry();
	for (const d of defs) elements.register(d);
	const registry = registerFrameworkElements(plugin as any, { registry: elements, pipeline: new ElementPipeline(deps) }, { viewAdoption: enabled });
	/** Render the i-th block of Note.md as a fresh section (optionally under another docId). */
	async function render(alias: string, index = 0, docId?: string) {
		const ctx = makeFakeContext(app, 'Note.md', index);
		if (docId) (ctx as any).docId = docId;
		await plugin.registeredProcessors.get(alias)!(bodyOf(app.vault.getContent('Note.md')!, index), ctx.el, ctx as any);
		ctx.addedChildren.forEach((c) => c.load());
		return ctx;
	}
	return { app, plugin, registry, render };
}

const COUNTER_NOTE = '# N\n\n```ds-counter\nname: Health\ncurrent_value: 10\nmax_value: 20\nmin_value: 0\n```\n';

describe('SC-340 Task 4: claim and adopt', () => {
	afterEach(() => jest.useRealTimers());

	test('own write -> new section adopts the SAME root and view; old render child unload is a no-op', async () => {
		jest.useFakeTimers();
		const { app, registry, render } = await setup(COUNTER_NOTE);
		const ctx1 = await render('ds-counter');
		const root = ctx1.el.firstElementChild as HTMLElement;
		(root.querySelector('button[aria-label^="Increase"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(app.vault.getContent('Note.md')).toContain('current_value: 11');

		const ctx2 = await render('ds-counter'); // Obsidian's rebuild of the changed section
		expect(ctx2.el.firstElementChild).toBe(root); // adopted: same DOM node
		expect(registry.stats.claims).toBe(1);
		ctx1.addedChildren[0].unload(); // old section removed after the new mount
		expect(registry.size).toBe(1);
		const [entry] = registry.liveEntries();
		expect((entry.view as any)._loaded).toBe(true);
		expect(entry.host.containerEl).toBe(ctx2.el);
	});

	test('another instance of the note (different docId) gets a FRESH view; the writer keeps its own', async () => {
		jest.useFakeTimers();
		const { registry, render } = await setup(COUNTER_NOTE);
		const pane = await render('ds-counter', 0, 'doc-pane');
		const embed = await render('ds-counter', 0, 'doc-embed');
		const embedRoot = embed.el.firstElementChild as HTMLElement;
		const paneRoot = pane.el.firstElementChild as HTMLElement;
		(pane.el.querySelector('button[aria-label^="Increase"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

		const embed2 = await render('ds-counter', 0, 'doc-embed'); // non-writer rebuilds FIRST (r1 E4)
		expect(embed2.el.firstElementChild).not.toBe(embedRoot);
		const pane2 = await render('ds-counter', 0, 'doc-pane');
		expect(pane2.el.firstElementChild).toBe(paneRoot); // the writer's own instance adopted
		expect(registry.stats.claims).toBe(1);
		expect(registry.stats.misses).toBeGreaterThanOrEqual(1);
	});

	test('a rebuild whose body we did not write (external edit) misses and builds a fresh view', async () => {
		const { app, registry, render } = await setup(COUNTER_NOTE);
		const ctx1 = await render('ds-counter');
		app.vault.setFile('Note.md', COUNTER_NOTE.replace('current_value: 10', 'current_value: 15'));
		const ctx2 = await render('ds-counter');
		expect(ctx2.el.firstElementChild).not.toBe(ctx1.el.firstElementChild);
		expect(registry.stats.claims).toBe(0);
	});

	test('a ticket older than CLAIM_WINDOW_MS no longer claims', async () => {
		jest.useFakeTimers();
		const { registry, render } = await setup(COUNTER_NOTE);
		const ctx1 = await render('ds-counter');
		(ctx1.el.querySelector('button[aria-label^="Increase"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		jest.setSystemTime(Date.now() + CLAIM_WINDOW_MS + 1);
		const ctx2 = await render('ds-counter');
		expect(ctx2.el.firstElementChild).not.toBe(ctx1.el.firstElementChild);
		expect(registry.stats.claims).toBe(0);
	});

	test('with adoption disabled (kill switch) every rebuild is fresh', async () => {
		jest.useFakeTimers();
		const { registry, render } = await setup(COUNTER_NOTE, [counterElement, initiativeElement], false);
		const ctx1 = await render('ds-counter');
		(ctx1.el.querySelector('button[aria-label^="Increase"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		const ctx2 = await render('ds-counter');
		expect(ctx2.el.firstElementChild).not.toBe(ctx1.el.firstElementChild);
		expect(registry.stats.claims).toBe(0);
	});

	test('SC-331 pin: the tracker ConditionsModal stays open across its own live write, and each change writes', async () => {
		jest.useFakeTimers();
		const note = '# E\n\n```ds-initiative\n' + quickStart.trimEnd() + '\n```\n';
		const { app, render } = await setup(note);
		const ctx1 = await render('ds-initiative');
		const root = ctx1.el.firstElementChild as HTMLElement;
		(root.querySelector('.dse-init__group--heroes .dse-cond--add') as HTMLElement).click();
		const modalEl = document.body.lastElementChild as HTMLElement;
		(modalEl.querySelector('button[aria-label="Add condition"]') as HTMLElement).click();
		const input = modalEl.querySelector('.dse-condal__input') as HTMLInputElement;
		input.value = 'Bleeding';
		input.dispatchEvent(new Event('input'));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(app.vault.modifyCalls).toHaveLength(1);
		expect(app.vault.getContent('Note.md')).toContain('bleeding');

		const ctx2 = await render('ds-initiative');
		ctx1.addedChildren[0].unload();
		expect(ctx2.el.firstElementChild).toBe(root);
		expect(document.body.contains(modalEl)).toBe(true); // the dialog survived its own save
	});

	test('focus: a focused input moved by the adoption is refocused with its caret once the section is inserted', async () => {
		const outer = document.body.createDiv();
		const root = outer.createDiv();
		const input = root.createEl('input', { type: 'text' });
		input.value = 'Feytouched';
		input.focus();
		input.setSelectionRange(4, 4);
		const state = captureFocus(root)!;
		expect(state.el).toBe(input);

		const el = document.createElement('div'); // detached, like the processor's el
		el.appendChild(root);
		input.blur(); // Chromium blurs a focused node that leaves the document
		restoreFocusWhenConnected(el, state);
		document.body.appendChild(el);
		await Promise.resolve(); // MutationObserver delivery
		await Promise.resolve();
		expect(document.activeElement).toBe(input);
		expect(input.selectionStart).toBe(4);
		el.remove();
		outer.remove();
	});
});
