// SC-656 — an outside edit redraws a negotiation card while keyboard focus is on one of its controls. Obsidian throws the old section away and
// draws a new one (the old view unloads, its root leaves the document), and focus fell to <body>: the next Tab started from the top of the note.
// The view now remembers the focused control (and where the card sat) while focus is inside it, and hands focus to the same control of the redrawn
// card through the shared window hand-off (framework/chrome/windowHandoff.ts, silent: nothing was lost, no window closed). It never pulls focus
// in: only when focus was in the card, still is the user's choice when the redraw arrives, and the card's own write is not an outside edit.
//
// Harness: the real ElementPipeline mounts the negotiation twice into one pane (the old section, the section Obsidian draws for the edit) with
// real, loaded views; "Obsidian redraws" is `old.view.unload()` around the second mount, the two orders measured in real Obsidian (Reading view
// draws the new section first and the old root is out of the document by the time the old view unloads; Live Preview unloads first and the new
// widget arrives ~10 ms later). Same shape as montage-outside-edit.test.ts. Time is the FAKE clock with literal gaps.
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost } from '../../../src/framework/host/BlockHost';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Component, Notice, Plugin, parseYaml, stringifyYaml } from '../../mocks/obsidian';
import { negotiationElement } from '../../../src/elements/negotiation/definition';
import type { NegotiationView } from '../../../src/elements/negotiation/view';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { handOffAfterOutsideRedraw } from '../../../src/framework/chrome/windowHandoff';
import { carryOwnSaveFocus } from '../../../src/framework/host/livePreviewFocusCarry';

// The real hand-off, counted: a test that says "nothing is handed on" asserts no hand-off was STARTED (focus alone cannot tell, the SC-602 carry may land it).
jest.mock('../../../src/framework/chrome/windowHandoff', () => {
	const actual = jest.requireActual('../../../src/framework/chrome/windowHandoff');
	return { ...actual, handOffAfterOutsideRedraw: jest.fn(actual.handOffAfterOutsideRedraw) };
});
const handOffs = (): number => (handOffAfterOutsideRedraw as jest.Mock).mock.calls.length;

const OFFERS = { i5: 'five', i4: 'four', i3: 'three', i2: 'two', i1: 'one', i0: 'zero' };
const MOT = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Motive ${i + 1}`, reason: 'r' }));
/** A negotiation body; `over` replaces or adds any top-level key. */
const src = (over: Record<string, unknown> = {}): string =>
	stringifyYaml({
		name: 'Frodo', initial_interest: 3, initial_patience: 3, current_interest: 3, current_patience: 3,
		motivations: MOT(3), pitfalls: [{ name: 'Power', reason: 'ring' }], ...OFFERS, ...over,
	}).trim();
const BASE = src();
/** What a Sync changed: the card is redrawn (here, a lower Patience). */
const EDITED = src({ current_patience: 2 });

interface Mounted {
	view: NegotiationView;
	root: HTMLElement;
	pane: HTMLElement;
	plugin: Plugin;
	writes: string[];
}

/** The vault `modify` listeners the views registered (the mock vault's `on` is a stub). A view of an unloaded card is still in the list: its root is out of
 *  the document, so it records nothing (real Obsidian unregisters it). */
let modifyListeners: Array<(file: { path: string }) => void> = [];
/** The note changed (Sync, another pane): every view hears it BEFORE Obsidian redraws anything. */
const modify = (): void => modifyListeners.forEach((l) => l({ path: 'Note.md' }));

function makeDeps(): ElementPipelineDeps {
	const app = new App();
	(app.vault as unknown as { on: unknown }).on = (name: string, cb: (file: { path: string }) => void) => {
		if (name === 'modify') modifyListeners.push(cb);
		return {};
	};
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	return {
		app: app as any, plugin: plugin as any, settings: DEFAULT_SETTINGS, theme: createThemeService(prefs, plugin as any), prefs,
		refs: createReferenceService(app as any, DEFAULT_SETTINGS), validation: createValidationService(), session: createSessionStore(), roll: createRollService(prefs),
	};
}

/** A pane like Obsidian's (`.workspace-leaf` > `.markdown-reading-view`), or the one handed in (a second section of the same pane). */
function newPane(): HTMLElement {
	const leaf = document.body.appendChild(document.createElement('div'));
	leaf.className = 'workspace-leaf';
	const pane = leaf.appendChild(document.createElement('div'));
	pane.className = 'markdown-reading-view';
	return pane;
}

/** `raw`: the host knows the note's own text of the block (`lastKnownBody`, as the Reading view and Live Preview hosts do), so a redrawn card's content is comparable. */
async function mount(source: string, pane: HTMLElement = newPane(), plugin?: Plugin, raw = false): Promise<Mounted> {
	const deps = makeDeps();
	if (plugin) deps.plugin = plugin as any;
	(deps.plugin as unknown as Plugin).load(); // the hand-off is owned by the plugin: a plugin that is not loaded starts none
	const containerEl = pane.appendChild(document.createElement('div'));
	const views: Component[] = [];
	const writes: string[] = [];
	const host = {
		mode: 'reading', sourcePath: 'Note.md', containerEl, canPersist: true,
		addChild: (child: Component) => (child.load(), views.push(child), child),
		getBlockInfo: () => ({ language: 'ds-negotiation', lineStart: 0, lineEnd: 40 }),
		replaceSource: jest.fn(async (body: string) => (writes.push(body), true)),
		blockKey: () => 'Note.md::ds-negotiation::0',
		lastKnownBody: raw ? source : null,
	} as unknown as BlockHost;
	await new ElementPipeline(deps).run(negotiationElement, source, host);
	return { view: views[0] as unknown as NegotiationView, root: containerEl.firstElementChild as HTMLElement, pane, plugin: deps.plugin as unknown as Plugin, writes };
}

const ctl = (root: Element, id: string, n = 0): HTMLElement => {
	const el = root.querySelectorAll<HTMLElement>(`[data-dse-control="${id}"]`)[n];
	if (!el) throw new Error(`no [data-dse-control="${id}"][${n}]`);
	return el;
};
/** Time passes on the FAKE clock: the hand-off's TTL (3 s) and SETTLE (1.5 s) windows close only when a test says so. */
const later = async (ms = 30): Promise<void> => {
	await jest.advanceTimersByTimeAsync(ms);
};
const press = (el: HTMLElement): void => el.focus();

/** Reading view's order: the new section is drawn first, then the old one is thrown away; its root is out of the document when the view unloads,
 *  and the focused control's focusout (if the engine sends one on removal) reaches the detached root. */
async function redraw(old: Mounted, source: string, raw = false): Promise<Mounted> {
	modify(); // the note changed: Obsidian then draws the new section...
	const fresh = await mount(source, old.pane, old.plugin, raw);
	const active = document.activeElement;
	// ...and throws the old one away. Chromium sends the focusout of a removed focused node while the root still reports `isConnected`.
	if (active && old.root.contains(active)) active.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
	old.root.remove();
	await Promise.resolve(); // (the focusout's microtask runs before the view unloads: a card that left the document did not lose focus to the user)
	old.view.unload();
	await later();
	return fresh;
}

beforeEach(() => {
	modifyListeners = [];
	(handOffAfterOutsideRedraw as jest.Mock).mockClear();
	jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
	Notice.notices.length = 0;
});
afterEach(() => {
	jest.restoreAllMocks();
	jest.useRealTimers();
	document.body.innerHTML = '';
});

describe('SC-656: an outside edit redraws the negotiation card while a control of it has focus', () => {
	test('[OE01] the Learn Motivation/Pitfall tab: focus lands on the same tab of the redrawn card, with no Notice', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'negotiation.tab.learn-more'));
		const fresh = await redraw(old, EDITED);
		expect(document.activeElement).toBe(ctl(fresh.root, 'negotiation.tab.learn-more'));
		expect(Notice.notices).toEqual([]);
	});

	test('[OE02] the second Motivation chip: focus lands on the second chip, not the first (same position among its kind)', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'negotiation.appeal.motivation', 1));
		const fresh = await redraw(old, EDITED);
		expect(document.activeElement).toBe(ctl(fresh.root, 'negotiation.appeal.motivation', 1));
	});

	test('[OE03] the options button and the "NPC caught a lie" box: each is carried', async () => {
		const a = await mount(BASE);
		press(ctl(a.root, 'negotiation.menu'));
		const afterA = await redraw(a, EDITED);
		expect(document.activeElement).toBe(ctl(afterA.root, 'negotiation.menu'));
		const b = await redraw(afterA, BASE);
		press(ctl(b.root, 'negotiation.mod.lie'));
		const afterB = await redraw(b, EDITED);
		expect(document.activeElement).toBe(ctl(afterB.root, 'negotiation.mod.lie'));
	});

	test('[OE04] a Patience seal: the ring follows the control; focus lands on the seal at the same position', async () => {
		const old = await mount(BASE);
		const seals = Array.from(old.root.querySelectorAll<HTMLElement>('[data-dse-control="negotiation.patience.seal"]'));
		press(seals[2]);
		const fresh = await redraw(old, src({ current_patience: 1 }));
		expect(document.activeElement).toBe(ctl(fresh.root, 'negotiation.patience.seal', 2));
	});

	test('[OE05] Complete Argument: the redrawn card has no tier chosen, so the button is disabled; focus lands where Complete lands (first Motivation chip)', async () => {
		const old = await mount(BASE);
		ctl(old.root, 'negotiation.tier.row', 3).click();
		press(ctl(old.root, 'negotiation.complete'));
		const fresh = await redraw(old, EDITED);
		expect((ctl(fresh.root, 'negotiation.complete') as HTMLButtonElement).disabled).toBe(true);
		expect(document.activeElement).toBe(ctl(fresh.root, 'negotiation.appeal.motivation', 0));
	});

	test('[OE06] fallback: the control is gone (the outside edit removed the third Motivation): focus lands on the last chip of its kind', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'negotiation.appeal.motivation', 2));
		const fresh = await redraw(old, src({ motivations: MOT(2) }));
		expect(document.activeElement).toBe(ctl(fresh.root, 'negotiation.appeal.motivation', 1));
	});

	test('[OE07] fallback: every chip is gone and the lost control had no usable sibling of its kind: the card root, never <body>', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'negotiation.appeal.pitfall', 0));
		const fresh = await redraw(old, src({ pitfalls: [], motivations: [] }));
		expect(document.activeElement).toBe(fresh.root);
		expect(fresh.root.getAttribute('tabindex')).toBe('-1');
	});

	test('[OE08] the number of negotiations in the pane changed (one was inserted above): the position no longer says which card is ours, focus is not moved', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'negotiation.tab.learn-more'));
		modify(); // the note changes, then Obsidian draws the sections
		const inserted = await mount(src({ name: 'New one' }), old.pane, old.plugin); // the edit added a negotiation above ours
		const fresh = await mount(EDITED, old.pane, old.plugin);
		old.root.remove();
		old.view.unload();
		await later();
		expect(document.activeElement).toBe(document.body);
		expect(Notice.notices).toEqual([]); // no window closed: nothing to tell
		expect(inserted.root.contains(document.activeElement)).toBe(false);
		expect(fresh.root.contains(document.activeElement)).toBe(false);
	});

	test('[OE09] the user moved focus elsewhere before the redraw arrived (Live Preview order): focus is not moved', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'negotiation.tab.learn-more'));
		modify();
		old.root.remove();
		old.view.unload();
		await later(5);
		const elsewhere = document.body.appendChild(document.createElement('button'));
		elsewhere.focus();
		elsewhere.blur(); // focus is free again (on <body>) when the card arrives: only the user's move cancels the hand-off
		const fresh = await mount(EDITED, old.pane, old.plugin);
		await later(45);
		expect(document.activeElement).toBe(document.body);
		expect(fresh.root.contains(document.activeElement)).toBe(false);
	});

	test('[OE10] Live Preview order (unload first, the new widget ~45 ms later): focus lands once the card is built', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'negotiation.appeal.motivation', 1));
		old.view.unload(); // the root is still in the document when the view unloads
		old.root.remove();
		await later(45);
		expect(document.activeElement).toBe(document.body); // nothing to hand it to yet
		const fresh = await mount(EDITED, old.pane, old.plugin);
		await later();
		expect(document.activeElement).toBe(ctl(fresh.root, 'negotiation.appeal.motivation', 1));
	});

	test('[OE11] focus was not in the card (on a control elsewhere on the page): the redraw pulls nothing in', async () => {
		const old = await mount(BASE);
		const elsewhere = document.body.appendChild(document.createElement('button'));
		elsewhere.focus();
		const fresh = await redraw(old, EDITED);
		expect(document.activeElement).toBe(elsewhere);
		expect(fresh.root.contains(document.activeElement)).toBe(false);
	});

	test('[OE12] focus had left the card for <body> (a click on the page) before the outside edit: nothing is pulled back in', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'negotiation.tab.learn-more'));
		(document.activeElement as HTMLElement).blur();
		await later(5);
		const fresh = await redraw(old, EDITED);
		expect(document.activeElement).toBe(document.body);
		expect(fresh.root.contains(document.activeElement)).toBe(false);
	});

	test('[OE13] focus moved to another control of the card, then the redraw: the LAST focused control is carried', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'negotiation.tab.learn-more'));
		press(ctl(old.root, 'negotiation.menu'));
		const fresh = await redraw(old, EDITED);
		expect(document.activeElement).toBe(ctl(fresh.root, 'negotiation.menu'));
	});

	test('[OE14] the card\'s own save redrawn in Live Preview (the SC-602 carry armed for it) hands nothing on; an outside edit 500 ms after an adopted own write (Reading view: no unload) does', async () => {
		const own = await mount(BASE);
		own.pane.classList.add('cm-content'); // Live Preview: the carry reads only roots drawn in a CodeMirror editor
		const seal = ctl(own.root, 'negotiation.interest.seal', 1);
		press(seal);
		seal.click(); // a keyboard press: the seal is chosen and the write is scheduled
		await later(PERSIST_DEBOUNCE_MS + 50);
		expect(own.writes).toHaveLength(1);
		const entry = { root: own.root, view: own.view, host: { blockKey: () => 'Note.md::ds-negotiation::0', lastWriteLineStart: 0 }, tickets: [{ body: own.writes[0], at: Date.now() }] };
		expect(carryOwnSaveFocus(entry as never)).toBe(true); // what the registry does as it releases the view
		await redraw(own, own.writes[0]);
		expect(handOffs()).toBe(0); // (focus itself is the carry's to land: only a hand-off that was never started cannot double it)
		(document.activeElement as HTMLElement).blur();

		const adopted = await mount(BASE); // Reading view: the write was adopted, the view lives on; 500 ms later Sync changes the note
		const chip = ctl(adopted.root, 'negotiation.appeal.motivation', 1);
		press(chip);
		chip.click();
		await later(PERSIST_DEBOUNCE_MS + 50);
		await later(500 - 50);
		const fresh = await redraw(adopted, EDITED);
		expect(handOffs()).toBe(1);
		expect(document.activeElement).toBe(ctl(fresh.root, 'negotiation.appeal.motivation', 1));
	});

	test('[OE15] a plugin that unloads while the redraw is pending cancels the hand-off', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'negotiation.tab.learn-more'));
		modify();
		old.root.remove();
		old.view.unload();
		old.plugin.unload();
		await later(5);
		await mount(EDITED, old.pane, old.plugin);
		await later(45);
		expect(document.activeElement).toBe(document.body);
	});

	test('[OE16] the redraw is a burst (Sync redraws twice): the second card keeps the focus too', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'negotiation.appeal.motivation', 1));
		const first = await redraw(old, EDITED);
		expect(document.activeElement).toBe(ctl(first.root, 'negotiation.appeal.motivation', 1));
		modify(); // the second change of the burst: focus is on the first redraw's chip
		first.root.remove();
		first.view.unload();
		await later(5);
		expect(document.activeElement).toBe(document.body);
		const second = await mount(src({ current_patience: 1 }), old.pane, old.plugin);
		await later(45);
		// The second card's hand-off is the FIRST one's settle re-claim only when it is still armed; here the first view's own memory starts one.
		expect(document.activeElement).toBe(ctl(second.root, 'negotiation.appeal.motivation', 1));
	});

	// The pinned sidebar refreshes a card in place for an outside edit (SidebarPanel.handleExternalChange -> view.update(model)): no unload, no redraw by Obsidian.
	test('[OE17] the pinned sidebar\'s in-place refresh with a new model: focus lands on the same control of the rebuilt card; focus on the page pulls nothing in', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'negotiation.appeal.motivation', 1));
		const model = negotiationElement.parse(parseYaml(EDITED), EDITED);
		await old.view.update(model as never);
		expect(old.root.textContent).toContain('Patience'); // rebuilt
		expect(document.activeElement).toBe(ctl(old.root, 'negotiation.appeal.motivation', 1));
		(document.activeElement as HTMLElement).blur();
		await old.view.update(negotiationElement.parse(parseYaml(BASE), BASE) as never);
		expect(document.activeElement).toBe(document.body);
	});

	test('[OE18] a card that scrolled out of the page (focus fell to <body>, the view lives on) keeps no claim: a later outside edit to it pulls nothing into the other card in the pane', async () => {
		const top = await mount(BASE);
		press(ctl(top.root, 'negotiation.appeal.motivation', 1));
		top.root.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); // the section's DOM leaves the page, with focus in it
		top.root.remove();
		await Promise.resolve();
		const bottom = await mount(src({ name: 'Bottom Frodo' }), top.pane, top.plugin); // the card the user is looking at, now the only one in the pane
		await later(30);
		modify(); // Sync edits the TOP block, which is off the page
		top.view.unload();
		await later(45);
		expect(handOffs()).toBe(0);
		expect(document.activeElement).toBe(document.body);
		expect(bottom.root.contains(document.activeElement)).toBe(false);
	});

	test('[OE19] the outside edit disables the box that has focus ("Argument has already been made", a motivation is now appealed to): focus lands on the lie box, then never <body>', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'negotiation.mod.same'));
		const fresh = await redraw(old, src({ currentArgument: { motivationsUsed: ['Motive 1'] } }));
		expect((ctl(fresh.root, 'negotiation.mod.same') as HTMLInputElement).disabled).toBe(true);
		expect(document.activeElement).toBe(ctl(fresh.root, 'negotiation.mod.lie'));
		const reuse = await mount(src({ currentArgument: { motivationsUsed: ['Motive 1'] }, motivations: [{ name: 'Motive 1', reason: 'r', hasBeenAppealedTo: true }] }));
		press(ctl(reuse.root, 'negotiation.mod.reuse'));
		const after = await redraw(reuse, src({ currentArgument: { motivationsUsed: ['Motive 1'] }, motivations: [{ name: 'Motive 1', reason: 'r' }] })); // un-spent: Reuse is greyed out
		expect((ctl(after.root, 'negotiation.mod.reuse') as HTMLInputElement).disabled).toBe(true);
		expect(document.activeElement).toBe(ctl(after.root, 'negotiation.mod.lie'));
	});

	test('[OE20] a block above is deleted and this one changed (the pane\'s count changed, nothing sits at the slot): no focus, and no window Notice either', async () => {
		const above = await mount(src({ name: 'Above' }), undefined, undefined, true);
		const old = await mount(BASE, above.pane, above.plugin, true);
		press(ctl(old.root, 'negotiation.tab.learn-more'));
		modify();
		const fresh = await mount(EDITED, old.pane, old.plugin, true); // the redraw: the block above is gone, ours changed
		above.root.remove();
		above.view.unload();
		old.root.remove();
		old.view.unload();
		await later(45);
		expect(fresh.root).toBeTruthy();
		expect(document.activeElement).toBe(document.body);
		expect(Notice.notices).toEqual([]);
	});

	test('[OE21] the pinned sidebar refresh: Complete focused with a tier chosen, the outside edit changes the standing (the tier is dropped, Complete is disabled): focus lands on the first Motivation chip', async () => {
		const old = await mount(BASE);
		ctl(old.root, 'negotiation.tier.row', 3).click();
		press(ctl(old.root, 'negotiation.complete'));
		await old.view.update(negotiationElement.parse(parseYaml(EDITED), EDITED) as never);
		expect((ctl(old.root, 'negotiation.complete') as HTMLButtonElement).disabled).toBe(true);
		expect(document.activeElement).toBe(ctl(old.root, 'negotiation.appeal.motivation', 0));
	});

	// Q12: the chosen tier is view state; an outside edit that leaves the argument and the standing alone keeps it.
	const RENAMED = src({ name: 'Sam' });
	const chosenTier = (root: HTMLElement): string | null => root.querySelector('[data-dse-control="negotiation.tier.row"][aria-checked="true"]')?.getAttribute('data-tier') ?? null;
	const tierCount = (root: HTMLElement): number => root.querySelectorAll('[data-dse-control="negotiation.tier.row"][aria-checked="true"]').length;

	test('[OE22] Complete Argument focused with a tier chosen, an outside edit that changes neither the argument nor the standing: the tier is kept, Complete is enabled and holds focus', async () => {
		const old = await mount(BASE);
		ctl(old.root, 'negotiation.tier.row', 3).click();
		press(ctl(old.root, 'negotiation.complete'));
		const fresh = await redraw(old, RENAMED);
		expect(tierCount(fresh.root)).toBe(1);
		expect(chosenTier(fresh.root)).toBe(chosenTier(old.root));
		expect((ctl(fresh.root, 'negotiation.complete') as HTMLButtonElement).disabled).toBe(false);
		expect(document.activeElement).toBe(ctl(fresh.root, 'negotiation.complete'));
	});

	test('[OE23] the outside edit moved the standing (an argument completed elsewhere, the argument itself still empty): the tier is dropped, so Complete cannot spend Patience twice', async () => {
		const old = await mount(BASE);
		ctl(old.root, 'negotiation.tier.row', 3).click();
		press(ctl(old.root, 'negotiation.complete'));
		const fresh = await redraw(old, src({ current_patience: 2 })); // same currentArgument ({}), Patience one lower
		expect(tierCount(fresh.root)).toBe(0);
		expect((ctl(fresh.root, 'negotiation.complete') as HTMLButtonElement).disabled).toBe(true);
		expect(document.activeElement).toBe(ctl(fresh.root, 'negotiation.appeal.motivation', 0));
	});

	test('[OE24] the outside edit toggled a chip (currentArgument changed) or spent a motivation: the tier is dropped', async () => {
		const a = await mount(BASE);
		ctl(a.root, 'negotiation.tier.row', 2).click();
		press(ctl(a.root, 'negotiation.complete'));
		const afterChip = await redraw(a, src({ currentArgument: { motivationsUsed: ['Motive 2'] } }));
		expect(tierCount(afterChip.root)).toBe(0);
		const b = await redraw(afterChip, BASE);
		ctl(b.root, 'negotiation.tier.row', 2).click();
		press(ctl(b.root, 'negotiation.complete'));
		const afterSpent = await redraw(b, src({ motivations: [{ name: 'Motive 1', reason: 'r', hasBeenAppealedTo: true }, ...MOT(3).slice(1)] }));
		expect(tierCount(afterSpent.root)).toBe(0);
	});

	test('[OE25] the pane\'s count changed: no card is claimed, so no tier is carried to a card that may not be ours', async () => {
		const old = await mount(BASE);
		ctl(old.root, 'negotiation.tier.row', 3).click();
		press(ctl(old.root, 'negotiation.complete'));
		modify();
		const inserted = await mount(src({ name: 'New one' }), old.pane, old.plugin);
		const fresh = await mount(RENAMED, old.pane, old.plugin);
		old.root.remove();
		old.view.unload();
		await later(45);
		expect(tierCount(inserted.root)).toBe(0);
		expect(tierCount(fresh.root)).toBe(0);
		expect(document.activeElement).toBe(document.body);
	});

	test('[OE26] the pinned sidebar refresh keeps the tier on a match and drops it on a changed standing', async () => {
		const old = await mount(BASE);
		ctl(old.root, 'negotiation.tier.row', 1).click();
		press(ctl(old.root, 'negotiation.complete'));
		await old.view.update(negotiationElement.parse(parseYaml(RENAMED), RENAMED) as never);
		expect(tierCount(old.root)).toBe(1);
		expect(document.activeElement).toBe(ctl(old.root, 'negotiation.complete'));
		await old.view.update(negotiationElement.parse(parseYaml(EDITED), EDITED) as never);
		expect(tierCount(old.root)).toBe(0);
	});

	// MED-A: `atChange` describes ONE change and the redraw right behind it. A re-render with no modify before it (previewMode.rerender, a plugin reload) must not use a
	// stale one: the card's own adopted write left it set, and the user then moved on.
	const staleThen = async (leave: () => void | Promise<void>): Promise<{ old: Mounted; bottom: Mounted }> => {
		const old = await mount(BASE);
		press(ctl(old.root, 'negotiation.appeal.motivation', 1));
		modify(); // the card's own write, adopted (or an edit elsewhere in the note): focus is inside, no redraw of this card follows
		await leave();
		old.root.remove(); // later, a re-render with no change to the note: the old root goes, a card sits at the slot
		const bottom = await mount(src({ name: 'Bottom Frodo' }), old.pane, old.plugin);
		old.view.unload();
		await later(45);
		return { old, bottom };
	};

	test('[OE27] the user blurred the card (focusout to the page) after the modify: a later re-render with no modify hands nothing on', async () => {
		const { bottom } = await staleThen(async () => {
			(document.activeElement as HTMLElement).blur();
			await Promise.resolve();
		});
		expect(handOffs()).toBe(0);
		expect(document.activeElement).toBe(document.body);
		expect(bottom.root.contains(document.activeElement)).toBe(false);
	});

	test.each([
		['pointerdown', () => void document.dispatchEvent(new Event('pointerdown', { bubbles: true }))],
		['keydown', () => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))],
		['wheel', () => void document.dispatchEvent(new Event('wheel', { bubbles: true }))],
	])('[OE28] user input (%s) after the modify: a later re-render with no modify hands nothing on', async (_name, input) => {
		await staleThen(input);
		expect(handOffs()).toBe(0);
		expect(document.activeElement).toBe(document.body);
	});

	test('[OE29] with nothing in between, the modify\'s memory is still used (the redraw right behind the change)', async () => {
		await staleThen(() => undefined);
		expect(handOffs()).toBe(1);
	});

	test('[OE30] the focused control is present but cannot take focus (an outside collapsed: true hides it): focus lands on the card root, never <body>', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'negotiation.tab.learn-more'));
		modify();
		const fresh = await mount(src({ name: 'Collapsed' }), old.pane, old.plugin);
		ctl(fresh.root, 'negotiation.tab.learn-more').focus = () => undefined; // hidden by the collapse: the engine refuses focus
		old.root.remove();
		old.view.unload();
		await later(45);
		expect(document.activeElement).toBe(fresh.root);
		expect(fresh.root.getAttribute('tabindex')).toBe('-1');
	});

	// LOW-C: only input made ELSEWHERE while the card is still in the page says the redraw is not coming.
	test('[OE31] a key pressed ON the focused chip (input inside the card) between the modify and the redraw: the hand-off still lands on the same chip', async () => {
		const old = await mount(BASE);
		const chip = ctl(old.root, 'negotiation.appeal.motivation', 1);
		press(chip);
		modify();
		chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true })); // a no-op key: focus does not move
		const fresh = await mount(EDITED, old.pane, old.plugin);
		old.root.remove();
		old.view.unload();
		await later(45);
		expect(document.activeElement).toBe(ctl(fresh.root, 'negotiation.appeal.motivation', 1));
	});

	test('[OE32] a key pressed (or a pointer press) on the page while the old root is already out of the document (Reading view\'s gap before the unload): the hand-off still lands', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'negotiation.appeal.motivation', 1));
		modify();
		const fresh = await mount(EDITED, old.pane, old.plugin);
		old.root.remove(); // the new section is drawn and the old one gone; the old view has not unloaded yet
		document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true }));
		document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		old.view.unload();
		await later(45);
		expect(document.activeElement).toBe(ctl(fresh.root, 'negotiation.appeal.motivation', 1));
	});

	// LOW-D: the silent hand-off shows no Notice even when the host knows the block text, so the redrawn card's content differs from the old one's.
	test('[OE33] the host knows the note\'s text of the block (`lastKnownBody`, as in Reading view and Live Preview): the redrawn card has different content, and still no Notice', async () => {
		const old = await mount(BASE, undefined, undefined, true);
		press(ctl(old.root, 'negotiation.tab.learn-more'));
		const fresh = await redraw(old, EDITED, true);
		expect(document.activeElement).toBe(ctl(fresh.root, 'negotiation.tab.learn-more'));
		expect(Notice.notices).toEqual([]);
	});
});
