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
import { App, Component, Notice, Plugin, stringifyYaml } from '../../mocks/obsidian';
import { negotiationElement } from '../../../src/elements/negotiation/definition';
import type { NegotiationView } from '../../../src/elements/negotiation/view';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';

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

function makeDeps(): ElementPipelineDeps {
	const app = new App();
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

async function mount(source: string, pane: HTMLElement = newPane(), plugin?: Plugin): Promise<Mounted> {
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
		lastKnownBody: null,
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
async function redraw(old: Mounted, source: string): Promise<Mounted> {
	const fresh = await mount(source, old.pane, old.plugin);
	const active = document.activeElement;
	old.root.remove();
	if (active && old.root.contains(active)) active.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
	old.view.unload();
	await later();
	return fresh;
}

beforeEach(() => {
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
		const inserted = await mount(src({ name: 'New one' }), old.pane, old.plugin); // the edit added a negotiation above ours
		const fresh = await mount(EDITED, old.pane, old.plugin);
		old.root.remove();
		old.view.unload();
		await later();
		expect(document.activeElement).toBe(document.body);
		expect(inserted.root.contains(document.activeElement)).toBe(false);
		expect(fresh.root.contains(document.activeElement)).toBe(false);
	});

	test('[OE09] the user moved focus elsewhere before the redraw arrived (Live Preview order): focus is not moved', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'negotiation.tab.learn-more'));
		old.root.remove();
		old.view.unload();
		await later(5);
		const elsewhere = document.body.appendChild(document.createElement('button'));
		elsewhere.focus();
		const fresh = await mount(EDITED, old.pane, old.plugin);
		await later(45);
		expect(document.activeElement).toBe(elsewhere);
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

	test('[OE14] the card\'s own write (a seal pressed, saved after the debounce) is not an outside edit: a redraw right after it hands nothing on; one after a quiet gap does', async () => {
		const own = await mount(BASE);
		const seal = ctl(own.root, 'negotiation.interest.seal', 1);
		press(seal);
		seal.click(); // a keyboard press: the seal is chosen and the write is scheduled
		await later(PERSIST_DEBOUNCE_MS + 50);
		expect(own.writes).toHaveLength(1);
		const afterOwn = await redraw(own, own.writes[0]); // Live Preview rebuilds the widget for the card's own save
		expect(document.activeElement).toBe(document.body);
		expect(afterOwn.root.contains(document.activeElement)).toBe(false);

		const quiet = await mount(BASE);
		press(ctl(quiet.root, 'negotiation.tab.learn-more'));
		quiet.view['lastPersistAt'] = Date.now() - 2999; // the write 2999 ms ago is still its own redraw's
		const fresh1 = await redraw(quiet, EDITED);
		expect(document.activeElement).toBe(document.body);
		const quiet2 = await mount(BASE);
		press(ctl(quiet2.root, 'negotiation.tab.learn-more'));
		quiet2.view['lastPersistAt'] = Date.now() - 3001; // 3001 ms ago: an outside edit
		const fresh2 = await redraw(quiet2, EDITED);
		expect(document.activeElement).toBe(ctl(fresh2.root, 'negotiation.tab.learn-more'));
		expect(fresh1.root).not.toBe(fresh2.root);
	});

	test('[OE15] a plugin that unloads while the redraw is pending cancels the hand-off', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'negotiation.tab.learn-more'));
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
		first.root.remove();
		first.view.unload();
		await later(5);
		expect(document.activeElement).toBe(document.body);
		const second = await mount(src({ current_patience: 1 }), old.pane, old.plugin);
		await later(45);
		// The second card's hand-off is the FIRST one's settle re-claim only when it is still armed; here the first view's own memory starts one.
		expect(document.activeElement).toBe(ctl(second.root, 'negotiation.appeal.motivation', 1));
	});
});
