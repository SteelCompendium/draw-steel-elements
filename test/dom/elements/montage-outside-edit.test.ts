// SC-650 — an outside edit to the note while a montage window (Log an action, the edit sheet of a recorded cell, Add a hero, Set limits) is
// open. Obsidian redraws the block, the old view unloads and its window closes with it (as it always did); what was missing was telling the
// user and focus: the control that opened the window is gone, so focus fell to <body>. The window now closes with the Notice the initiative
// tracker shows (SC-608), and focus lands on the redrawn montage's replacement of the control that opened the window, by the montage's own
// focus rules (SC-626: the same cell, the nearest equivalent when the opener is gone or disabled). The pinned-sidebar half (the window stays
// open after the refresh and its Apply is silently lost) is the `update()` path, driven here without the sidebar.
//
// Harness: the real ElementPipeline mounts the montage twice into one pane (the old section and the section Obsidian draws for the edit) with
// real, loaded views; "Obsidian redraws" is `old.view.unload()` before or after the second mount, the two orders measured in real Obsidian
// (Reading view draws the new section first, Live Preview closes first and the new widget arrives ~10 ms later). Same shape as
// initiative-outside-edit.test.ts.
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Component, MarkdownRenderer, Modal, Notice, Plugin, parseYaml } from '../../mocks/obsidian';
import { montageElement } from '../../../src/elements/montage/definition';
import type { MontageView } from '../../../src/elements/montage/view';
import type { MontageModel } from '../../../src/elements/montage/model';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import { HANDOFF_SETTLE_MS } from '../../../src/framework/chrome/windowHandoff';

/** A montage in round 1, nobody has acted: Log an action is live, the board has open sockets. */
const BASE = ['title: Heist', 'rounds: 3', 'success_limit: 5', 'failure_limit: 3', 'successes: 0', 'failures: 0', 'participants:', '  - name: Kira', '  - name: Bram', 'current_round: 1'].join('\n');
/** The same block after a Sync / another device changed the success limit: the block is different. */
const EDITED = BASE.replace('success_limit: 5', 'success_limit: 6');
/** Kira has a recorded action in round 1 (a recorded cell: the edit sheet), round 2 in play. */
const WITH_ENTRY = [
	'title: Heist', 'rounds: 3', 'success_limit: 5', 'failure_limit: 3', 'successes: 1', 'failures: 0', 'participants:', '  - name: Kira', '  - name: Bram',
	'entries:', '  - hero: Kira', '    round: 1', '    result: success', 'current_round: 2',
].join('\n');
const WITH_ENTRY_EDITED = WITH_ENTRY.replace('success_limit: 5', 'success_limit: 6');
/** Both heroes have acted in round 1: Log an action is disabled (every hero has acted), End round is the next move. */
const EVERYONE_ACTED = [
	'title: Heist', 'rounds: 3', 'success_limit: 5', 'failure_limit: 3', 'successes: 2', 'failures: 0', 'participants:', '  - name: Kira', '  - name: Bram',
	'entries:', '  - hero: Kira', '    round: 1', '    result: success', '  - hero: Bram', '    round: 1', '    result: success', 'current_round: 1',
].join('\n');
const NOTICE = 'The note changed outside, so this window closed without saving';

interface Mounted {
	view: MontageView;
	root: HTMLElement;
	pane: HTMLElement;
	plugin: Plugin;
	/** What the view asked its host to write (the debounced flush), oldest first. */
	writes: string[];
}

function makeDeps(): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	prefs.describe(DSE_PREF_DESCRIPTORS);
	return {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme: createThemeService(prefs, plugin as any),
		prefs,
		refs: createReferenceService(app as any, DEFAULT_SETTINGS),
		validation: createValidationService(),
		session: createSessionStore(),
		roll: createRollService(prefs),
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

/** `raw`: the host knows the note's own text of the block (`lastKnownBody`, as the Reading view and Live Preview hosts do); the sidebar's does not. */
async function mount(source: string, pane: HTMLElement = newPane(), sourcePath = 'Montage.md', raw = false, mode: RenderMode = 'reading'): Promise<Mounted> {
	const deps = makeDeps();
	(deps.plugin as unknown as Plugin).load(); // the hand-off is owned by the plugin: a plugin that is not loaded starts none
	const containerEl = pane.appendChild(document.createElement('div'));
	const views: Component[] = [];
	const writes: string[] = [];
	const host = {
		mode,
		sourcePath,
		containerEl,
		canPersist: true,
		addChild: (child: Component) => {
			child.load(); // real Obsidian's BlockHost is a loaded Component: a loaded view is the faithful fixture
			views.push(child);
			return child;
		},
		getBlockInfo: () => ({ language: 'ds-montage', lineStart: 0, lineEnd: 40 }),
		replaceSource: jest.fn(async (body: string) => (writes.push(body), true)),
		blockKey: () => `${sourcePath}::ds-montage::0`,
		lastKnownBody: raw ? source : null,
	} as unknown as BlockHost;
	await new ElementPipeline(deps).run(montageElement, source, host);
	return { view: views[0] as unknown as MontageView, root: containerEl.firstElementChild as HTMLElement, pane, plugin: deps.plugin as unknown as Plugin, writes };
}

const ctl = <T extends HTMLElement = HTMLElement>(root: Element, id: string, n = 0): T => {
	const el = root.querySelectorAll<T>(`[data-dse-control="${id}"]`)[n];
	if (!el) throw new Error(`no [data-dse-control="${id}"][${n}]`);
	return el;
};
const cellOf = (root: Element, hero: string, round: number): HTMLElement =>
	root.querySelector(`.dse-mt__cell[data-hero="${hero}"][data-round="${round}"]`) as HTMLElement;
const windowEl = (id: string): HTMLElement | null => document.querySelector(`.modal-content [data-dse-control="${id}"]`);
const anyWindow = (): boolean => document.querySelector('.dse-modal') !== null;
const focused = (): string | null => document.activeElement?.closest('[data-dse-control]')?.getAttribute('data-dse-control') ?? null;
const focusedCell = (): string | null => document.activeElement?.closest('.dse-mt__cell')?.getAttribute('data-dse-focus-at') ?? null;
const type = (el: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
	el.value = value;
	el.dispatchEvent(new Event('input', { bubbles: true }));
};
/** Time passes on the FAKE clock (see the `beforeEach`): the hand-off's TTL (3 s) and SETTLE (1.5 s) windows close only when a test says so. */
const later = async (ms = 30): Promise<void> => {
	await jest.advanceTimersByTimeAsync(ms);
};
const notices = (): string[] => Notice.notices.filter((n) => n === NOTICE);

/** A keyboard press: the control holds focus, then Enter on it (a click with no pointer). */
const press = (el: HTMLElement): void => {
	el.focus();
	el.click();
};

/** Obsidian redraws the block after an outside edit, Reading view order: the new section first, then the old one is thrown away. */
async function redraw(old: Mounted, source: string, raw = false): Promise<Mounted> {
	const fresh = await mount(source, old.pane, 'Montage.md', raw);
	old.view.unload();
	old.root.remove();
	await later();
	return fresh;
}

let closeOriginal: () => void = () => undefined;
beforeEach(() => {
	jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
	Notice.notices.length = 0;
	// Real Obsidian hands focus back to the control that held it when a modal opened, synchronously inside `close()`, and only while that
	// control is still in the document. The shared Modal mock does not, so the two ends of it are stood in for.
	const openers = new WeakMap<object, Element | null>();
	const open = Modal.prototype.open;
	const close = Modal.prototype.close;
	closeOriginal = close;
	jest.spyOn(Modal.prototype, 'open').mockImplementation(function (this: Modal) {
		openers.set(this, document.activeElement);
		open.call(this);
	});
	jest.spyOn(Modal.prototype, 'close').mockImplementation(function (this: Modal) {
		close.call(this);
		const opener = openers.get(this) as HTMLElement | null | undefined;
		if (opener && opener !== document.body && opener.isConnected) opener.focus();
	});
});
afterEach(() => {
	jest.restoreAllMocks();
	jest.useRealTimers();
	document.body.innerHTML = '';
});

describe('SC-650: an outside edit redraws the montage while a window is open (Reading view, Live Preview)', () => {
	test('[OW01] Log an action from the bar: the window closes with one Notice, and focus lands on the rebuilt Log an action button with the ring', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'montage.bar.log'));
		expect(windowEl('montage.log.submit')).not.toBeNull();
		const fresh = await redraw(old, EDITED);
		expect(anyWindow()).toBe(false);
		expect(notices()).toHaveLength(1);
		expect(document.activeElement).toBe(ctl(fresh.root, 'montage.bar.log'));
		expect(document.activeElement?.matches(':focus-visible') ?? true).toBe(true);
	});

	test('[OW02] the sheet of a recorded cell: focus lands on the same cell (hero and round) of the redrawn board', async () => {
		const old = await mount(WITH_ENTRY);
		press(cellOf(old.root, 'Kira', 1));
		expect(windowEl('montage.log.remove')).not.toBeNull(); // the edit sheet
		const fresh = await redraw(old, WITH_ENTRY_EDITED);
		expect(anyWindow()).toBe(false);
		expect(notices()).toHaveLength(1);
		expect(document.activeElement).toBe(cellOf(fresh.root, 'Kira', 1));
		expect(focusedCell()).toBe('1:Kira');
	});

	test('[OW03] a hero\'s row button: focus lands on that hero\'s button, not the first', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'montage.board.row-act', 1));
		const fresh = await redraw(old, EDITED);
		expect(notices()).toHaveLength(1);
		expect(document.activeElement).toBe(ctl(fresh.root, 'montage.board.row-act', 1));
	});

	test('[OW04] Add a hero from the board corner: the window closes, Notice, focus on the rebuilt corner button', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'montage.board.add-hero'));
		type(ctl<HTMLInputElement>(document.body, 'montage.add-hero.name'), 'Osric'); // typed in the window: dropped with it
		const fresh = await redraw(old, EDITED);
		expect(anyWindow()).toBe(false);
		expect(notices()).toHaveLength(1);
		expect(document.activeElement).toBe(ctl(fresh.root, 'montage.board.add-hero'));
		await later(PERSIST_DEBOUNCE_MS + 50);
		expect(old.writes).toEqual([]); // what was typed was never written over the outside edit
	});

	test('[OW05] Add a hero from the chrome panel: focus lands on the rebuilt chrome item', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'montage.chrome.add-hero'));
		const fresh = await redraw(old, EDITED);
		expect(notices()).toHaveLength(1);
		expect(document.activeElement).toBe(ctl(fresh.root, 'montage.chrome.add-hero'));
	});

	test('[OW06] Set limits: focus lands on the rebuilt Set limits item, and the limit typed in the window is not written', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'montage.chrome.set-limits'));
		type(ctl<HTMLInputElement>(document.body, 'montage.limits.success'), '9');
		const fresh = await redraw(old, EDITED);
		expect(anyWindow()).toBe(false);
		expect(notices()).toHaveLength(1);
		expect(document.activeElement).toBe(ctl(fresh.root, 'montage.chrome.set-limits'));
		await later(PERSIST_DEBOUNCE_MS + 50);
		expect(old.writes).toEqual([]);
	});

	test('[OW07] Live Preview order (the window closes first, the new widget arrives later): Notice and focus once it is built', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'montage.bar.log'));
		old.view.unload();
		old.root.remove();
		await later(45); // Live Preview's widget arrives 10-45 ms after the close (windowHandoff.ts)
		expect(anyWindow()).toBe(false);
		expect(document.activeElement).toBe(document.body); // nothing to hand it to yet
		const fresh = await mount(EDITED, old.pane);
		await later();
		expect(notices()).toHaveLength(1);
		expect(document.activeElement).toBe(ctl(fresh.root, 'montage.bar.log'));
	});

	test('[OW08] a card whose brief is still rendering is not focused half-built: the hand-off waits for the whole card', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'montage.bar.log'));
		const render = MarkdownRenderer.render;
		jest.spyOn(MarkdownRenderer, 'render').mockImplementation(async (...args: Parameters<typeof render>) => {
			await new Promise((resolve) => setTimeout(resolve, 100)); // the brief takes a while: the card's root is in the pane, its controls are not
			return render(...args);
		});
		const pending = mount(`${EDITED}\ndescription: A long brief`, old.pane); // Reading view order: the new section is drawn first
		await later(10);
		old.view.unload();
		old.root.remove();
		await later(60); // the old view is gone and the new card is still waiting for its brief
		expect(document.activeElement).toBe(document.body);
		expect(notices()).toHaveLength(0);
		await later(200);
		const described = await pending;
		await later();
		expect(notices()).toHaveLength(1);
		expect(document.activeElement).toBe(ctl(described.root, 'montage.bar.log')); // the control itself, not the card's root
	});

	test('[OW09] the montage\'s own write shows no Notice and still hands focus to the rebuilt opener', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'montage.bar.log'));
		const submit = ctl(document.body, 'montage.log.submit');
		submit.focus();
		submit.click(); // Log: the window closes by itself, the card rebuilds
		await later(PERSIST_DEBOUNCE_MS + 50);
		expect(anyWindow()).toBe(false);
		expect(notices()).toHaveLength(0);
		expect(old.writes).toHaveLength(1);
		expect(focused()).toBe('montage.bar.log');
	});

	test('[OW28] after the montage\'s own write (a rebuild that closes its window) a later window still hands off: the rebuilt card is not marked as unloading', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'montage.bar.log'));
		const submit = ctl(document.body, 'montage.log.submit');
		submit.focus();
		submit.click(); // Log: the rebuild unloads the window's component while the window is still open, then the window closes
		await later(PERSIST_DEBOUNCE_MS + 50);
		expect(notices()).toHaveLength(0);
		const written = old.writes[0];
		press(ctl(old.root, 'montage.chrome.set-limits')); // a second window, on the same (rebuilt) view
		const fresh = await redraw(old, written.replace('success_limit: 5', 'success_limit: 6'), false);
		expect(anyWindow()).toBe(false);
		expect(notices()).toHaveLength(1);
		expect(document.activeElement).toBe(ctl(fresh.root, 'montage.chrome.set-limits'));
	});

	test('[OW29] ...and an unload long after that write, with no window open, says and does nothing (the window of that write is not remembered)', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'montage.bar.log'));
		const submit = ctl(document.body, 'montage.log.submit');
		submit.focus();
		submit.click();
		await later(PERSIST_DEBOUNCE_MS + 50);
		const fresh = await redraw(old, EDITED); // an outside edit redraws the card; no window is open
		expect(notices()).toHaveLength(0);
		expect(document.activeElement).toBe(document.body);
		expect(fresh.root.contains(document.activeElement)).toBe(false);
	});

	test('[OW10] opened with the mouse (focus was not inside the card): the Notice shows, nothing is focused', async () => {
		const old = await mount(BASE);
		ctl(old.root, 'montage.bar.log').click(); // nothing held focus
		const fresh = await redraw(old, EDITED);
		expect(notices()).toHaveLength(1);
		expect(document.activeElement).toBe(document.body);
		expect(fresh.root.hasAttribute('tabindex')).toBe(false);
	});

	test('[OW11] the opener is disabled in the redrawn card (every hero has acted): the nearest equivalent, End round, takes focus', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'montage.bar.log'));
		const fresh = await redraw(old, EVERYONE_ACTED);
		expect(notices()).toHaveLength(1);
		expect((ctl(fresh.root, 'montage.bar.log') as HTMLButtonElement).disabled).toBe(true);
		expect(focused()).toBe('montage.bar.end-round');
	});

	test('[OW12] the cell the window was opened from is no longer a control (the edit removed the entry): its fallback takes focus, never <body>', async () => {
		const old = await mount(WITH_ENTRY);
		press(cellOf(old.root, 'Kira', 1));
		const fresh = await redraw(old, BASE.replace('current_round: 1', 'current_round: 2').replace('success_limit: 5', 'success_limit: 6')); // round 1 is a past, empty cell: still a control
		expect(focusedCell()).toBe('1:Kira');
		expect(fresh.root.contains(document.activeElement)).toBe(true);
		// ...and when the hero went with it, the bar's Log an action stands in
		document.body.innerHTML = '';
		const second = await mount(WITH_ENTRY);
		press(cellOf(second.root, 'Kira', 1));
		const gone = await redraw(second, WITH_ENTRY_EDITED.replace('  - name: Kira\n', '').replace('hero: Kira', 'hero: Bram'));
		expect(focused()).toBe('montage.bar.log');
		expect(gone.root.contains(document.activeElement)).toBe(true);
	});

	test('[OW13] the redrawn block has the same disk content (the view\'s own save, a re-render): no Notice, and focus still comes back', async () => {
		const old = await mount(BASE, undefined, 'Montage.md', true);
		press(ctl(old.root, 'montage.bar.log'));
		const fresh = await redraw(old, BASE, true);
		expect(anyWindow()).toBe(false);
		expect(notices()).toHaveLength(0);
		expect(document.activeElement).toBe(ctl(fresh.root, 'montage.bar.log'));
	});

	test('[OW14] an outside edit that changes only bytes the model drops (a YAML comment): Notice and focus, like any other outside edit', async () => {
		const old = await mount(BASE, undefined, 'Montage.md', true);
		press(ctl(old.root, 'montage.chrome.set-limits'));
		const fresh = await redraw(old, BASE.replace('rounds: 3', 'rounds: 3 # synced from phone'), true);
		expect(notices()).toHaveLength(1);
		expect(document.activeElement).toBe(ctl(fresh.root, 'montage.chrome.set-limits'));
	});

	test('[OW15] the view wrote while its window was open (a quick Log), then Live Preview redraws it from that write: same disk content, no Notice, focus comes back', async () => {
		const old = await mount(BASE, undefined, 'Montage.md', true);
		ctl(old.root, 'montage.quick.success', 0).click(); // a Log through the board's quick trio: a write in flight
		await later();
		press(ctl(old.root, 'montage.chrome.set-limits')); // ...and a window opened before it lands
		await later(PERSIST_DEBOUNCE_MS + 50);
		expect(old.writes).toHaveLength(1);
		const fresh = await mount(old.writes[0], old.pane, 'Montage.md', true); // the widget Live Preview draws for that write
		old.view.unload();
		old.root.remove();
		await later();
		expect(notices()).toHaveLength(0);
		expect(document.activeElement).toBe(ctl(fresh.root, 'montage.chrome.set-limits'));
	});

	test('[OW16] the montage is gone (the note was closed, the edit deleted the block): nothing is shown or focused', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'montage.bar.log'));
		old.view.unload();
		old.root.remove();
		await later(60);
		expect(anyWindow()).toBe(false);
		expect(notices()).toHaveLength(0);
		expect(document.activeElement).toBe(document.body);
	});

	test('[OW17] two montages in one note: the window of the SECOND hands focus to the second, not to the first', async () => {
		const first = await mount(BASE);
		const second = await mount(BASE, first.pane); // the same pane, below the first
		press(ctl(second.root, 'montage.bar.log'));
		const fresh = await mount(EDITED, first.pane); // only the second block was edited: the first section is not redrawn
		second.view.unload();
		second.root.remove();
		await later();
		expect(notices()).toHaveLength(1);
		expect(document.activeElement).toBe(ctl(fresh.root, 'montage.bar.log'));
		expect(first.root.contains(document.activeElement)).toBe(false);
	});

	test('[OW18] a montage inserted above the open one by the same edit: the Notice shows, focus is NOT moved to the wrong montage', async () => {
		const first = await mount(BASE);
		const second = await mount(BASE, first.pane);
		press(ctl(second.root, 'montage.bar.log'));
		const inserted = await mount(EDITED.replace('Heist', 'Newt'), first.pane); // the edit inserts a montage between the two...
		const fresh = await mount(EDITED, first.pane); // ...and changes the second
		second.view.unload();
		second.root.remove();
		await later();
		expect(notices()).toHaveLength(1);
		expect(document.activeElement).toBe(document.body);
		expect([first.root, inserted.root, fresh.root].some((r) => r.contains(document.activeElement))).toBe(false);
	});

	test('[OW19] a burst of outside edits (Sync): focus follows each redraw, one Notice', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'montage.bar.log'));
		let current = await redraw(old, EDITED);
		expect(document.activeElement).toBe(ctl(current.root, 'montage.bar.log'));
		for (const limit of [7, 8]) {
			await later(1400); // the next redraw comes about 1.4 s after the last one; the watch stays armed 1.5 s
			const previous = current;
			current = await mount(EDITED.replace('success_limit: 6', `success_limit: ${limit}`), old.pane);
			previous.view.unload(); // discards the control that held focus
			previous.root.remove();
			await later();
			expect(document.activeElement).toBe(ctl(current.root, 'montage.bar.log'));
		}
		expect(notices()).toHaveLength(1);
		await later(HANDOFF_SETTLE_MS + 100);
	});

	test('[OW20] unloading the plugin cancels a hand-off that is waiting: no Notice, no focus when the new montage appears later', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'montage.bar.log'));
		old.view.unload();
		old.root.remove();
		old.plugin.unload();
		const fresh = await mount(EDITED, old.pane);
		await later();
		expect(notices()).toHaveLength(0);
		expect(document.activeElement).toBe(document.body);
		expect(fresh.root.contains(document.activeElement)).toBe(false);
	});

	test('[OW21] focus that the user has put elsewhere is not taken; the Notice still follows the redraw', async () => {
		const old = await mount(BASE);
		press(ctl(old.root, 'montage.bar.log'));
		const other = document.body.appendChild(document.createElement('input'));
		const fresh = await mount(EDITED, old.pane);
		old.view.unload();
		old.root.remove();
		other.focus(); // the user clicked into another field before the hand-off ran...
		other.blur(); // ...and out of it again: focus is free once more, but it is no longer ours to give
		await later();
		expect(document.activeElement).toBe(document.body);
		expect(notices()).toHaveLength(1);
		expect(fresh.root.contains(document.activeElement)).toBe(false);
	});

	test('[OW22] a Cancel (a window closed without a write, the card untouched) starts no hand-off: no Notice, focus where the window left it', async () => {
		const old = await mount(BASE);
		const opener = ctl(old.root, 'montage.bar.log');
		press(opener);
		const cancel = ctl(document.body, 'montage.log.cancel');
		cancel.focus();
		cancel.click();
		await later(PERSIST_DEBOUNCE_MS + 50);
		expect(anyWindow()).toBe(false);
		expect(notices()).toHaveLength(0);
		expect(document.activeElement).toBe(opener); // Obsidian's own focus return
		old.view.unload(); // a later redraw of the card has no window to say anything about
		old.root.remove();
		await mount(EDITED, old.pane);
		await later();
		expect(notices()).toHaveLength(0);
	});
});

describe('SC-650: the pinned sidebar refreshes the montage in place (no redraw) while a window is open', () => {
	/** What the sidebar does on an outside change of the pinned block: re-prepare it and hand the new model to the mounted view. */
	const refresh = (view: MontageView, body: string): Promise<void> => view.update(montageElement.parse(parseYaml(body), body) as MontageModel);

	test('[OW23] the block changed: the window closes with one Notice, focus lands on the rebuilt opener, and nothing staged in it is written', async () => {
		const old = await mount(BASE, undefined, 'Montage.md', false, 'sidebar');
		press(ctl(old.root, 'montage.bar.log'));
		const staged = ctl(document.body, 'montage.log.submit'); // an Apply the window would otherwise write to the model that is replaced
		await refresh(old.view, EDITED);
		expect(anyWindow()).toBe(false);
		expect(notices()).toHaveLength(1);
		expect(focused()).toBe('montage.bar.log');
		expect(old.root.contains(document.activeElement)).toBe(true);
		staged.click(); // the window is gone: a click on a detached button writes nothing
		await later(PERSIST_DEBOUNCE_MS + 50);
		expect(old.writes).toEqual([]);
		expect(old.root.textContent).toContain('6 from Total Success'); // the rebuilt card shows the outside change (the success limit)
	});

	test('[OW24] the block did NOT change (an edit elsewhere in the note): the window stays open and its Log writes', async () => {
		const old = await mount(BASE, undefined, 'Montage.md', false, 'sidebar');
		press(ctl(old.root, 'montage.bar.log'));
		await refresh(old.view, BASE);
		expect(anyWindow()).toBe(true);
		expect(notices()).toHaveLength(0);
		const submit = ctl(document.body, 'montage.log.submit');
		submit.focus();
		submit.click();
		await later(PERSIST_DEBOUNCE_MS + 50);
		expect(old.writes).toHaveLength(1);
		expect(parseYaml(old.writes[0]).entries).toEqual([{ hero: 'Kira', round: 1, result: 'success' }]);
		expect(notices()).toHaveLength(0);
	});

	test('[OW25] an unwritten edit of this view is ahead of the disk: the refresh is compared with what was loaded or written, so the window stays', async () => {
		const old = await mount(BASE, undefined, 'Montage.md', false, 'sidebar');
		ctl(old.root, 'montage.quick.success', 0).click(); // Kira logged: in the model, waiting out the 400 ms write
		await later();
		press(ctl(old.root, 'montage.chrome.set-limits'));
		await refresh(old.view, BASE); // an edit elsewhere in the note: the block on disk is still the one that was loaded
		expect(anyWindow()).toBe(true);
		expect(notices()).toHaveLength(0);
		await later(PERSIST_DEBOUNCE_MS + 50);
		expect(parseYaml(old.writes[0]).entries).toHaveLength(1); // the Log reached the note
	});

	test('[OW26] the echo of this view\'s own write while a window is open leaves the window open (same content as what was written)', async () => {
		const old = await mount(BASE, undefined, 'Montage.md', false, 'sidebar');
		ctl(old.root, 'montage.quick.success', 0).click();
		await later(PERSIST_DEBOUNCE_MS + 50);
		expect(old.writes).toHaveLength(1);
		press(ctl(old.root, 'montage.chrome.set-limits'));
		await refresh(old.view, old.writes[0]); // the note's modify event: the pinned block now reads what this view wrote
		expect(anyWindow()).toBe(true);
		expect(notices()).toHaveLength(0);
	});

	test('[OW27] no window open: a refresh redraws the card with no Notice (focus inside the card follows, as before)', async () => {
		const old = await mount(BASE, undefined, 'Montage.md', false, 'sidebar');
		ctl(old.root, 'montage.bar.log').focus();
		await refresh(old.view, EDITED);
		expect(notices()).toHaveLength(0);
		expect(focused()).toBe('montage.bar.log');
	});
});
