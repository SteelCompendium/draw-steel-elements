// SC-340 (spec §6.2): a rebuild caused by the view's OWN write adopts the live view.
// Simulates Obsidian's order (r1 E1, B1): write -> NEW section's processor (same docId,
// detached el) -> OLD render child unloads.
import { registerFrameworkElements } from '../../../src/framework/registerFrameworkElements';
import { ElementPipeline } from '../../../src/framework/pipeline';
import { createElementRegistry, type ElementDefinition } from '../../../src/framework/registry';
import { counterElement } from '../../../src/elements/counter/definition';
import { initiativeElement } from '../../../src/elements/initiative/definition';
import { ViewRegistry, CLAIM_WINDOW_MS } from '../../../src/framework/host/viewRegistry';
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { captureFocus, restoreFocusWhenConnected } from '../../../src/framework/host/adoptView';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import * as FormModal from '../../../src/authoring/FormModal';
import { makeFakeContext } from '../../mocks/obsidian';
import { makeEnv } from './_adoptionEnv';
import quickStart from '../../fixtures/initiative/quick-start.yaml';
import { migrateSettings } from '@model/Settings';

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
		const { app, registry, render } = await setup(COUNTER_NOTE);
		const pane = await render('ds-counter', 0, 'doc-pane');
		const embed = await render('ds-counter', 0, 'doc-embed');
		const embedRoot = embed.el.firstElementChild as HTMLElement;
		const paneRoot = pane.el.firstElementChild as HTMLElement;
		(pane.el.querySelector('button[aria-label^="Increase"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(app.vault.modifyCalls).toHaveLength(1); // one write, from the one click

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

	// Fix round 1 (M-3): the §8 fallback ("never leave the block blank") had no jest pin.
	test('§8 fallback: host.rebind throwing releases the claimed entry adopt-failed and renders a fresh view', async () => {
		jest.useFakeTimers();
		const { registry, render } = await setup(COUNTER_NOTE);
		const ctx1 = await render('ds-counter');
		const oldRoot = ctx1.el.firstElementChild as HTMLElement;
		(ctx1.el.querySelector('button[aria-label^="Increase"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		const [oldEntry] = registry.liveEntries();

		const rebindSpy = jest.spyOn(ReadingModeBlockHost.prototype, 'rebind').mockImplementationOnce(() => {
			throw new Error('rebind boom');
		});
		const ctx2 = await render('ds-counter');
		rebindSpy.mockRestore();

		expect(ctx2.el.children).toHaveLength(1); // never left blank
		expect(ctx2.el.firstElementChild).not.toBe(oldRoot); // a FRESH view, not the claimed one
		expect(oldEntry.releasedBy).toBe('adopt-failed');
		expect(oldEntry.claiming).toBe(false);

		ctx1.addedChildren[0].unload();
		ctx2.addedChildren[0].unload();
		expect(registry.size).toBe(0);
	});

	test('§8 fallback: el.appendChild throwing releases the claimed entry adopt-failed and renders a fresh view', async () => {
		jest.useFakeTimers();
		const { app, plugin, registry, render } = await setup(COUNTER_NOTE);
		const ctx1 = await render('ds-counter');
		const oldRoot = ctx1.el.firstElementChild as HTMLElement;
		(ctx1.el.querySelector('button[aria-label^="Increase"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		const [oldEntry] = registry.liveEntries();

		const ctx2 = makeFakeContext(app, 'Note.md');
		const originalAppendChild = ctx2.el.appendChild.bind(ctx2.el);
		let calls = 0;
		jest.spyOn(ctx2.el, 'appendChild').mockImplementation(((node: Node) => {
			calls++;
			if (calls === 1) throw new Error('appendChild boom'); // the ONE call adoptView makes
			return originalAppendChild(node);
		}) as typeof ctx2.el.appendChild);
		await plugin.registeredProcessors.get('ds-counter')!(
			bodyOf(app.vault.getContent('Note.md')!, 0),
			ctx2.el,
			ctx2 as any,
		);
		ctx2.addedChildren.forEach((c) => c.load());

		expect(ctx2.el.children).toHaveLength(1); // never left blank
		expect(ctx2.el.firstElementChild).not.toBe(oldRoot); // a FRESH view, not the claimed one
		expect(oldEntry.releasedBy).toBe('adopt-failed');
		expect(oldEntry.claiming).toBe(false);

		ctx1.addedChildren[0].unload();
		// rebind() ran (unlike the mocked-rebind test above) before appendChild threw, so it
		// already added its own (now-orphaned, stale) render child to ctx2 — the FRESH host's
		// render child is the one added AFTER it.
		expect(ctx2.addedChildren).toHaveLength(2);
		ctx2.addedChildren.forEach((c) => c.unload());
		expect(registry.size).toBe(0);
	});

	test('SC-331 pin: the tracker ConditionsModal stays open across its own live write, and each change writes', async () => {
		jest.useFakeTimers();
		const note = '# E\n\n```ds-initiative\n' + quickStart.trimEnd() + '\n```\n';
		const { app, registry, render } = await setup(note);
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
		expect(registry.stats.claims).toBe(1);
		expect(document.body.contains(modalEl)).toBe(true); // the dialog survived its own save

		// Fix round 1 (M-1): the title and spec §10.1 say EACH change writes — a single write
		// was only half the pin. The combobox stays open (cleared + refocused) after a pick,
		// so a second add needs no re-click of "Add condition".
		input.value = 'Prone';
		input.dispatchEvent(new Event('input'));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(app.vault.modifyCalls).toHaveLength(2);
		expect(app.vault.getContent('Note.md')).toContain('prone');

		const ctx3 = await render('ds-initiative'); // the SECOND rebuild adopts again
		ctx2.addedChildren[0].unload();
		expect(ctx3.el.firstElementChild).toBe(root);
		expect(registry.stats.claims).toBe(2);
		expect(document.body.contains(modalEl)).toBe(true); // still open across both writes

		modalEl.remove(); // M-1: don't leak the modal into document.body for later tests
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

	// Fix round 1 (M-5): a real move measured ~41 ms between blur and reinsertion — long
	// enough for the user to click something else. Adoption must not fight them for focus:
	// only refocus when nothing else has claimed it (activeElement is body or null).
	test('focus: if the user focuses something else before the section reconnects, adoption does not steal it back', async () => {
		const outer = document.body.createDiv();
		const root = outer.createDiv();
		const input = root.createEl('input', { type: 'text' });
		input.value = 'Feytouched';
		input.focus();
		input.setSelectionRange(4, 4);
		const state = captureFocus(root)!;

		const el = document.createElement('div'); // detached, like the processor's el
		el.appendChild(root);
		input.blur(); // Chromium blurs a focused node that leaves the document
		restoreFocusWhenConnected(el, state);

		const other = document.body.createEl('input', { type: 'text' });
		other.focus(); // the user clicks elsewhere during the reinsertion gap

		document.body.appendChild(el);
		await Promise.resolve(); // MutationObserver delivery
		await Promise.resolve();
		expect(document.activeElement).toBe(other); // not stolen back
		el.remove();
		outer.remove();
		other.remove();
	});
});

describe('SC-340 fix round 1 (I-1): the adoption blur fires DURING the move (real Chromium order)', () => {
	afterEach(() => jest.useRealTimers());

	// A real-Chromium probe (headless 149) showed blur/change/focusout fire SYNCHRONOUSLY
	// inside appendChild, while the moved node is STILL CONNECTED — jsdom does not
	// replicate this on its own, so this test drives it directly: the mocked appendChild
	// dispatches the blur itself, at the point adoptView's data-dse-moving marker is set.
	test('a stepper half-typed draft is not committed by the in-move blur; a later real blur (after the section reconnects) commits it', async () => {
		jest.useFakeTimers();
		const { app, plugin, render } = await setup(COUNTER_NOTE);
		const ctx1 = await render('ds-counter');
		document.body.appendChild(ctx1.el); // a normally-connected reading-mode section
		const root = ctx1.el.firstElementChild as HTMLElement;
		(root.querySelector('button[aria-label^="Increase"]') as HTMLElement).click(); // an earlier write
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(app.vault.modifyCalls).toHaveLength(1);

		// The user starts a NEW half-typed draft before the echo (adoption) arrives.
		const input = root.querySelector('input.dse-stepper__input') as HTMLInputElement;
		input.value = '15';

		const ctx2 = makeFakeContext(app, 'Note.md');
		const originalAppendChild = ctx2.el.appendChild.bind(ctx2.el);
		jest.spyOn(ctx2.el, 'appendChild').mockImplementation(((node: Node) => {
			// I-1: fire the blur exactly where Chromium does — DURING the move, while
			// `root` (still in its OLD parent) already carries adoptView's marker.
			input.dispatchEvent(new FocusEvent('blur'));
			return originalAppendChild(node);
		}) as typeof ctx2.el.appendChild);

		await plugin.registeredProcessors.get('ds-counter')!(
			bodyOf(app.vault.getContent('Note.md')!, 0),
			ctx2.el,
			ctx2 as any,
		);
		ctx2.addedChildren.forEach((c) => c.load());
		document.body.appendChild(ctx2.el); // Obsidian eventually inserts the new section
		ctx1.addedChildren[0].unload();

		expect(ctx2.el.firstElementChild).toBe(root); // adopted
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(app.vault.modifyCalls).toHaveLength(1); // the draft was NOT committed by the in-move blur

		// A later REAL blur — the marker is gone, the section is connected — commits it.
		input.dispatchEvent(new FocusEvent('blur'));
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(app.vault.modifyCalls).toHaveLength(2);
		expect(app.vault.getContent('Note.md')).toContain('current_value: 15');

		ctx1.el.remove();
		ctx2.el.remove();
	});
});

describe('SC-340 Task 5: docId collision guard', () => {
	afterEach(() => jest.useRealTimers());

	test('the same block rendered twice under ONE docId refuses to claim (fresh view instead)', async () => {
		jest.useFakeTimers();
		const { registry, render } = await setup(COUNTER_NOTE);
		const a = await render('ds-counter', 0, 'doc-same');
		const b = await render('ds-counter', 0, 'doc-same'); // collision: same docId, same block
		(a.el.querySelector('button[aria-label^="Increase"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		const c = await render('ds-counter', 0, 'doc-same');
		expect(c.el.firstElementChild).not.toBe(a.el.firstElementChild);
		expect(c.el.firstElementChild).not.toBe(b.el.firstElementChild);
		expect(registry.stats.collisions).toBe(1);
		expect(registry.stats.claims).toBe(0);
		// Fix round 1 (Minor-1): a refused claim consumes nothing — the writer's ticket
		// survives and it is never marked mid-claim.
		const entryA = registry.liveEntries().find((e) => e.root === a.el.firstElementChild)!;
		expect(entryA.tickets).toHaveLength(1);
		expect(entryA.claiming).toBe(false);
	});

	test('two DIFFERENT blocks in one document (same docId, different lines) still adopt normally', async () => {
		jest.useFakeTimers();
		const note = COUNTER_NOTE + '\nMID\n\n```ds-counter\nname: Other\ncurrent_value: 1\nmax_value: 20\nmin_value: 0\n```\n';
		const { registry, render } = await setup(note);
		const first = await render('ds-counter', 0, 'doc-one');
		const firstRoot = first.el.firstElementChild as HTMLElement;
		await render('ds-counter', 1, 'doc-one');
		(first.el.querySelector('button[aria-label^="Increase"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		const again = await render('ds-counter', 0, 'doc-one');
		expect(again.el.firstElementChild).toBe(firstRoot);
		expect(registry.stats.claims).toBe(1);
		expect(registry.stats.collisions).toBe(0);
	});

	// Fix round 1 (I-1): the guard must compare LIVE positions, not each host's cached
	// lastKnownLineStart — that cache only refreshes when a host reads its OWN section, and
	// an edit above the block (B5) re-renders neither instance, so two truly-colliding hosts
	// can carry different stale cached lines and slip past a cache-only comparison.
	test('a line shift above the block does not defeat the collision guard (live positions, not stale cache)', async () => {
		jest.useFakeTimers();
		const { app, registry, render } = await setup(COUNTER_NOTE);
		const a = await render('ds-counter', 0, 'doc-same');
		const aRoot = a.el.firstElementChild as HTMLElement; // captured before the rebuild
		const b = await render('ds-counter', 0, 'doc-same'); // two instances, same docId, same block
		// An edit ABOVE the block: shifts its true line, but (B5) rerenders neither instance,
		// so both hosts' cached lastKnownLineStart stay at the OLD (pre-edit) line for now.
		app.vault.setFile('Note.md', '\n\n\n' + app.vault.getContent('Note.md'));
		(a.el.querySelector('button[aria-label^="Increase"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS); // refreshes ONLY a's cache
		const c = await render('ds-counter', 0, 'doc-same'); // the rebuild the writer's click caused
		expect(c.el.firstElementChild).not.toBe(a.el.firstElementChild); // NOT moved into b's spot
		expect(c.el.firstElementChild).not.toBe(b.el.firstElementChild);
		expect(a.el.firstElementChild).toBe(aRoot); // the writer's root was not moved (not adopted)
		expect(registry.stats.collisions).toBe(1);
		expect(registry.stats.claims).toBe(0);
	});

	// Fix round 1 (Minor-2): a leaked entry whose render child was added but never loaded
	// (e.g. torn down before Obsidian finished mounting it) is not a real second instance of
	// anything on screen. Without ignoring it, that ONE leaked entry at this docId+line would
	// collide with EVERY later claim for the block, forever, silently disabling adoption.
	test('a leaked entry whose render child never loaded does not block a real claim', async () => {
		jest.useFakeTimers();
		const { app, plugin, registry, render } = await setup(COUNTER_NOTE);
		const leakCtx = makeFakeContext(app, 'Note.md', 0);
		(leakCtx as any).docId = 'doc-same';
		await plugin.registeredProcessors.get('ds-counter')!(bodyOf(app.vault.getContent('Note.md')!, 0), leakCtx.el, leakCtx as any);
		// deliberately never call leakCtx.addedChildren[...].load() — its render child stays unloaded

		const a = await render('ds-counter', 0, 'doc-same');
		const aRoot = a.el.firstElementChild as HTMLElement; // captured before adoption moves it
		(a.el.querySelector('button[aria-label^="Increase"]') as HTMLElement).click();
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		const c = await render('ds-counter', 0, 'doc-same');
		expect(c.el.firstElementChild).toBe(aRoot); // adopted normally
		expect(registry.stats.claims).toBe(1);
		expect(registry.stats.collisions).toBe(0);
	});
});

describe('SC-340 §9.2: the form editor opens with the CURRENT body after adopted writes', () => {
	// Fix round 1 (M-2): TWO adopted writes before the pencil click — proves currentBody()
	// tracks the LATEST body (host.lastKnownBody), not just "any body newer than mount",
	// which a single-write test can't distinguish from a stale-but-not-mount-time body.
	test('pencil after TWO adopted writes passes the LATEST written body, not the mount-time source nor the first adopted body', async () => {
		jest.useFakeTimers();
		const spy = jest.spyOn(FormModal, 'openFormEditor').mockImplementation(() => ({}) as any);
		const { app, render } = await setup(COUNTER_NOTE, undefined, true, true);
		const ctx1 = await render('ds-counter');
		const root = ctx1.el.firstElementChild as HTMLElement;

		(root.querySelector('button[aria-label^="Increase"]') as HTMLElement).click(); // 10 -> 11
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		const ctx2 = await render('ds-counter'); // adopted (write #1)
		expect(ctx2.el.firstElementChild).toBe(root);

		(root.querySelector('button[aria-label^="Increase"]') as HTMLElement).click(); // 11 -> 12
		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		const ctx3 = await render('ds-counter'); // adopted again (write #2)
		expect(ctx3.el.firstElementChild).toBe(root);

		// The counter's chrome-panel pencil (authoringAnchor.test.ts) — counter declares
		// `chrome`, so it renders through the panel entry point, not the trailing-pencil
		// one (see the fix-round-1 report for why a second assertion on that other entry
		// point isn't added here).
		const pencil = root.querySelector<HTMLElement>('.dse-btn[aria-label^="Edit "]');
		expect(pencil).not.toBeNull();
		pencil!.click();
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy.mock.calls[0][3]).toBe(bodyOf(app.vault.getContent('Note.md')!));
		expect(spy.mock.calls[0][3]).toContain('current_value: 12');
		expect(spy.mock.calls[0][3]).not.toContain('current_value: 11');
		expect(spy.mock.calls[0][3]).not.toContain('current_value: 10');
		spy.mockRestore();
		jest.useRealTimers();
	});
});

describe('SC-340 §6.6: the hidden viewAdoption key', () => {
	test('absent -> on; explicit false -> off; never added to the saved settings by default', () => {
		expect(migrateSettings({}).viewAdoption !== false).toBe(true);
		expect(migrateSettings({ viewAdoption: false }).viewAdoption !== false).toBe(false);
		expect('viewAdoption' in migrateSettings({})).toBe(false);
	});
});
