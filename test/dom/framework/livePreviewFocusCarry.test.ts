// SC-602 — in Live Preview an element's OWN save redraws its CodeMirror widget with a NEW root, so the control the keyboard user pressed
// is thrown away and focus falls to <body>. livePreviewFocusCarry.ts captures the focused control while the old root is still in place
// (ViewRegistry.release, or the editor update for an identical twin) and arms a one-shot request keyed by the written block; the new
// mount's `claimChromeFocus` (SC-518) gives focus to the control's successor. jsdom cannot run Obsidian's StateField, so a fake entry
// stands for the old widget and a second root, built later, for the redraw; the real-Obsidian redraw is in e2e (INIT-L*, CTR-L*).
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { carryOwnSaveFocus, onEditorUpdate } from '@/framework/host/livePreviewFocusCarry';
import { ViewRegistry, CLAIM_WINDOW_MS } from '@/framework/host/viewRegistry';
import type { ViewRegistryEntry } from '@/framework/host/viewRegistry';
import { ReadingModeBlockHost } from '@/framework/host/ReadingModeBlockHost';
import { claimChromeFocus, disarmChromeFocus } from '@/framework/chrome/focusHandoff';
import { App, Component, Plugin, makeFakeContext } from '../../mocks/obsidian';

const KEY = 'Note.md::ds-counter::13';
const WRITTEN = 'Note.md::ds-counter::4';

/** A workspace pane; `.cm-content` inside it is Live Preview's editor (Reading view and the sidebar have none). */
function makePane(): { leaf: HTMLElement; content: HTMLElement } {
	const leaf = document.body.appendChild(document.createElement('div'));
	leaf.className = 'workspace-leaf';
	const content = leaf.appendChild(document.createElement('div'));
	content.className = 'cm-content';
	return { leaf, content };
}

/** A DSE root with one `<button data-dse-control>` per id (a counter: `counter.dec`, `counter.input`, `counter.inc`). */
function makeRoot(host: HTMLElement, ids: string[]): HTMLElement {
	const root = host.appendChild(document.createElement('div'));
	root.setAttribute('data-dse-element', 'counter');
	for (const id of ids) {
		const b = root.appendChild(document.createElement('button'));
		b.setAttribute('data-dse-control', id);
	}
	return root;
}
const ctl = (root: HTMLElement, id: string, n = 0): HTMLButtonElement =>
	root.querySelectorAll<HTMLButtonElement>(`[data-dse-control="${id}"]`)[n];

interface FakeHost {
	key: string;
	line: number | null;
}
/** A registry entry of the old widget: only what the carry reads (`root`, `host.blockKey`/`lastWriteLineStart`, `tickets`). */
function makeEntry(root: HTMLElement, host: Partial<FakeHost> = {}, ticketAge: number | null = 0): ViewRegistryEntry {
	const h: FakeHost = { key: KEY, line: null, ...host };
	return {
		root,
		host: { blockKey: () => h.key, get lastWriteLineStart() { return h.line; } },
		tickets: ticketAge === null ? [] : [{ body: 'x', at: Date.now() - ticketAge }],
		released: false,
	} as unknown as ViewRegistryEntry;
}

/** The redraw: the old widget goes, a new root with `ids` is built (detached unless `attach`), and its mount asks for focus. */
function redraw(old: HTMLElement, ids: string[], key = KEY, attach = true): HTMLElement {
	const parent = old.parentElement!;
	old.remove();
	const root = document.createElement('div');
	root.setAttribute('data-dse-element', 'counter');
	for (const id of ids) {
		const b = root.appendChild(document.createElement('button'));
		b.setAttribute('data-dse-control', id);
	}
	if (attach) parent.appendChild(root);
	claimChromeFocus(() => key, root);
	return root;
}
const flush = async (): Promise<void> => {
	for (let i = 0; i < 4; i++) await Promise.resolve();
};

let focusCalls: Array<{ el: HTMLElement; opts: unknown }>;
beforeEach(() => {
	focusCalls = [];
	const realFocus = HTMLElement.prototype.focus;
	jest.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, opts?: FocusOptions) {
		focusCalls.push({ el: this, opts });
		return realFocus.call(this, opts);
	});
});
afterEach(() => {
	for (const k of [KEY, WRITTEN]) disarmChromeFocus(k); // the request table is module state
	jest.restoreAllMocks();
	document.body.innerHTML = '';
});

describe('SC-602: carryOwnSaveFocus + the new mount (Live Preview own-save redraw)', () => {
	test('focus on the 2nd of 3 same-id controls comes back on the 2nd control of the redrawn root, with the keyboard ring', () => {
		const { content } = makePane();
		const old = makeRoot(content, ['row', 'row', 'row']);
		ctl(old, 'row', 1).focus();
		focusCalls.length = 0;

		expect(carryOwnSaveFocus(makeEntry(old))).toBe(true);
		const next = redraw(old, ['row', 'row', 'row']);

		expect(document.activeElement).toBe(ctl(next, 'row', 1));
		expect(focusCalls).toEqual([{ el: ctl(next, 'row', 1), opts: { preventScroll: true, focusVisible: true } }]);
	});

	test('a press that had no ring (:focus-visible false) is restored without forcing one', () => {
		const { content } = makePane();
		const old = makeRoot(content, ['row']);
		ctl(old, 'row').focus();
		const matches = Element.prototype.matches;
		jest.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, sel: string) {
			return sel === ':focus-visible' ? false : matches.call(this, sel);
		});
		focusCalls.length = 0;

		carryOwnSaveFocus(makeEntry(old));
		const next = redraw(old, ['row']);

		expect(document.activeElement).toBe(ctl(next, 'row'));
		expect(focusCalls).toEqual([{ el: ctl(next, 'row'), opts: { preventScroll: true } }]);
	});

	test('Reading view and the sidebar are never armed: a root outside `.cm-content` returns false and the new mount takes nothing', () => {
		for (const wrapper of ['markdown-reading-view', 'workspace-leaf-content']) {
			const leaf = document.body.appendChild(document.createElement('div'));
			leaf.className = `workspace-leaf ${wrapper}`;
			const old = makeRoot(leaf, ['row']);
			ctl(old, 'row').focus();

			expect(carryOwnSaveFocus(makeEntry(old))).toBe(false);
			redraw(old, ['row']);

			expect(document.activeElement).toBe(document.body);
			leaf.remove();
		}
	});

	test('a mouse press, or any moment focus is not inside the root, arms nothing', () => {
		const { content } = makePane();
		const old = makeRoot(content, ['row']);
		const other = makeRoot(content, ['row']);
		const editor = content.appendChild(document.createElement('div'));
		editor.tabIndex = 0;

		// <body>: a click shield blurred the control before the write (the mouse path, SC-588/SC-609)
		expect(carryOwnSaveFocus(makeEntry(old))).toBe(false);
		// the editor text itself (a mouse click into the note)
		editor.focus();
		expect(carryOwnSaveFocus(makeEntry(old))).toBe(false);
		// another DSE block
		ctl(other, 'row').focus();
		expect(carryOwnSaveFocus(makeEntry(old))).toBe(false);

		const active = document.activeElement;
		redraw(old, ['row']);
		expect(document.activeElement).toBe(active); // the redraw moved nothing
	});

	test('an external edit (no ticket) and a ticket older than CLAIM_WINDOW_MS arm nothing', () => {
		const { content } = makePane();
		const old = makeRoot(content, ['row']);
		ctl(old, 'row').focus();

		expect(carryOwnSaveFocus(makeEntry(old, {}, null))).toBe(false);
		expect(carryOwnSaveFocus(makeEntry(old, {}, CLAIM_WINDOW_MS + 1))).toBe(false);

		const next = redraw(old, ['row']);
		expect(document.activeElement).toBe(document.body);
		expect(next.hasAttribute('tabindex')).toBe(false);
	});

	test('one write arms once: the release hook and the editor update see the same ticket, the second call is false', () => {
		const { content } = makePane();
		const old = makeRoot(content, ['row']);
		ctl(old, 'row').focus();
		const entry = makeEntry(old);

		expect(carryOwnSaveFocus(entry)).toBe(true);
		expect(carryOwnSaveFocus(entry)).toBe(false);
	});

	test('an identical twin: the request is keyed by the block the write LANDED in (lastWriteLineStart), not the live blockKey()', () => {
		const { content } = makePane();
		const old = makeRoot(content, ['row']);
		ctl(old, 'row').focus();
		// the written (upper) twin's host already reports the twin's line (13) while its write landed at line 4
		expect(carryOwnSaveFocus(makeEntry(old, { key: KEY, line: 4 }))).toBe(true);
		old.remove();

		const twin = makeRoot(content, ['row']);
		claimChromeFocus(() => KEY, twin); // the unwritten twin's mount (::13)
		expect(document.activeElement).toBe(document.body);

		const written = makeRoot(content, ['row']);
		claimChromeFocus(() => WRITTEN, written); // the written block's mount (::4)
		expect(document.activeElement).toBe(ctl(written, 'row'));
	});

	test('a host that never wrote (lastWriteLineStart null) is keyed by its live blockKey()', () => {
		const { content } = makePane();
		const old = makeRoot(content, ['row']);
		ctl(old, 'row').focus();
		carryOwnSaveFocus(makeEntry(old, { key: KEY, line: null }));
		const next = redraw(old, ['row']);
		expect(document.activeElement).toBe(ctl(next, 'row'));
	});

	test('one-shot: after the claim succeeded, a later rebuild of the same block (an outside edit) takes nothing', () => {
		const { content } = makePane();
		const old = makeRoot(content, ['row']);
		ctl(old, 'row').focus();
		carryOwnSaveFocus(makeEntry(old));
		const first = redraw(old, ['row']);
		expect(document.activeElement).toBe(ctl(first, 'row'));

		// the user (or an external edit) leaves focus on <body>, then the block is rebuilt again with the same key
		(document.activeElement as HTMLElement).blur();
		expect(document.activeElement).toBe(document.body);
		focusCalls.length = 0;
		const second = redraw(first, ['row']);

		expect(document.activeElement).toBe(document.body);
		expect(focusCalls).toEqual([]);
		expect(second.hasAttribute('tabindex')).toBe(false);
	});

	test('any focusin elsewhere between the arm and the claim cancels the request', () => {
		const { content } = makePane();
		const old = makeRoot(content, ['row']);
		const editor = content.appendChild(document.createElement('div'));
		editor.tabIndex = 0;
		ctl(old, 'row').focus();
		carryOwnSaveFocus(makeEntry(old));

		editor.focus(); // the user moved on inside the debounce window
		editor.blur();
		const next = redraw(old, ['row']);

		expect(document.activeElement).toBe(document.body);
		expect(next.contains(document.activeElement)).toBe(false);
	});

	test('scope: the same block drawn in another pane does not claim; the pressed pane does', () => {
		const a = makePane();
		const b = makePane();
		const oldA = makeRoot(a.content, ['row']);
		const copyB = makeRoot(b.content, ['row']);
		ctl(oldA, 'row').focus();
		carryOwnSaveFocus(makeEntry(oldA));
		oldA.remove();

		claimChromeFocus(() => KEY, copyB); // the other pane's copy mounts first
		expect(document.activeElement).toBe(document.body);

		const nextA = makeRoot(a.content, ['row']);
		claimChromeFocus(() => KEY, nextA);
		expect(document.activeElement).toBe(ctl(nextA, 'row'));
	});

	test('focus not free at claim time (the user is on an input): the redraw does not take it', () => {
		const { content } = makePane();
		const old = makeRoot(content, ['row']);
		ctl(old, 'row').focus();
		carryOwnSaveFocus(makeEntry(old));
		old.remove();
		const input = content.appendChild(document.createElement('input'));
		input.focus(); // the guard cancels the request at once; and even a live one would not fight for focus
		const next = makeRoot(content, ['row']);
		claimChromeFocus(() => KEY, next);

		expect(document.activeElement).toBe(input);
	});

	test('a successor that is gone lands on the root (tabindex -1), never <body>', () => {
		const { content } = makePane();
		const old = makeRoot(content, ['counter.inc']);
		ctl(old, 'counter.inc').focus();
		carryOwnSaveFocus(makeEntry(old));
		const next = redraw(old, ['other']);

		expect(document.activeElement).toBe(next);
		expect(next.getAttribute('tabindex')).toBe('-1');
	});

	test('a successor that is :disabled lands on the root, and the request does not linger', () => {
		const { content } = makePane();
		const old = makeRoot(content, ['counter.inc']);
		ctl(old, 'counter.inc').focus();
		carryOwnSaveFocus(makeEntry(old));
		old.remove();
		const next = makeRoot(content, ['counter.inc']);
		ctl(next, 'counter.inc').disabled = true;
		claimChromeFocus(() => KEY, next);

		expect(document.activeElement).toBe(next);
		expect(next.getAttribute('tabindex')).toBe('-1');
		// disarmed by the success: a rebuild with focus on <body> takes nothing
		next.blur();
		(document.activeElement as HTMLElement).blur();
		const later = redraw(next, ['counter.inc']);
		expect(document.activeElement).toBe(document.body);
		expect(later.hasAttribute('tabindex')).toBe(false);
	});

	test('a root built detached (Obsidian builds the widget before inserting it) is claimed once it is in the document', async () => {
		const { content } = makePane();
		const old = makeRoot(content, ['row', 'row']);
		ctl(old, 'row', 1).focus();
		carryOwnSaveFocus(makeEntry(old));
		const next = redraw(old, ['row', 'row'], KEY, false);
		expect(document.activeElement).toBe(document.body); // not yet: nothing to focus (and no root fallback while detached)
		expect(next.hasAttribute('tabindex')).toBe(false);

		content.appendChild(next);
		await flush();

		expect(document.activeElement).toBe(ctl(next, 'row', 1));
	});
});

describe('SC-602: the hook points', () => {
	test('ViewRegistry.release calls beforeRelease while the old root still holds focus, then releases; a throwing hook does not stop it', () => {
		const { content } = makePane();
		const old = makeRoot(content, ['row']);
		ctl(old, 'row').focus();
		const registry = new ViewRegistry({ enabled: false });
		registry.load();
		const app = new App();
		app.vault.setFile('Note.md', '```ds-counter\nname: A\n```');
		const ctx = makeFakeContext(app, 'Note.md');
		const host = new ReadingModeBlockHost(new Plugin(app) as any, ctx.el, ctx as any, 'ds-counter', null, registry);
		const entry = registry.own(new Component() as any, host, old);
		entry.tickets.push({ body: 'x', at: Date.now() });
		const seen: Array<{ released: boolean; active: Element | null }> = [];
		registry.beforeRelease = (e) => {
			seen.push({ released: e.released, active: document.activeElement });
			carryOwnSaveFocus(e);
			throw new Error('boom');
		};
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

		registry.release(entry, 'render-child-unload');

		expect(seen).toEqual([{ released: false, active: ctl(old, 'row') }]);
		expect(entry.released).toBe(true);
		expect(warn).toHaveBeenCalled();
		// the carry ran before the throw: the redraw gets focus back
		const key = host.blockKey();
		old.remove();
		const next = makeRoot(content, ['row']);
		claimChromeFocus(() => key, next);
		expect(document.activeElement).toBe(ctl(next, 'row'));
		disarmChromeFocus(key);
	});

	test('the editor update (twin hand-off) arms the live entry that holds focus, keyed by the written block', () => {
		const { content } = makePane();
		const old = makeRoot(content, ['row']);
		ctl(old, 'row').focus();
		const entry = makeEntry(old, { key: KEY, line: 4 });

		onEditorUpdate({ docChanged: true, view: { dom: content } } as any, { liveEntries: () => [entry] } as unknown as ViewRegistry);
		old.remove();
		const twin = makeRoot(content, ['row']);
		claimChromeFocus(() => KEY, twin);
		expect(document.activeElement).toBe(document.body); // the twin's block (::13) is not the written one
		const written = makeRoot(content, ['row']);
		claimChromeFocus(() => WRITTEN, written);

		expect(document.activeElement).toBe(ctl(written, 'row'));
	});

	test('the editor update arms nothing for a selection-only update, for focus outside its editor, for a released entry or one without focus', () => {
		const { content } = makePane();
		const old = makeRoot(content, ['row']);
		const other = makeRoot(content, ['row']);
		ctl(old, 'row').focus();
		const released = makeEntry(old);
		(released as { released: boolean }).released = true;
		const registry = (...entries: ViewRegistryEntry[]) => ({ liveEntries: () => entries }) as unknown as ViewRegistry;

		onEditorUpdate({ docChanged: false, view: { dom: content } } as any, registry(makeEntry(old)));
		onEditorUpdate({ docChanged: true, view: { dom: document.createElement('div') } } as any, registry(makeEntry(old)));
		onEditorUpdate({ docChanged: true, view: { dom: content } } as any, registry(released, makeEntry(other)));
		const next = redraw(old, ['row']);

		expect(document.activeElement).toBe(document.body);
		expect(next.hasAttribute('tabindex')).toBe(false);
	});
});

describe('SC-602: writtenBlockKey depends on the format of ReadingModeBlockHost.blockKey()', () => {
	test('a resolving host\'s key is `${path}::${language}::${lineStart}` and ends in `::<digits>`', () => {
		const app = new App();
		app.vault.setFile('Note.md', ['# T', '', '```ds-counter', 'name: A', '```', '', '```ds-counter', 'name: B', '```'].join('\n'));
		const plugin = new Plugin(app);
		const ctx = makeFakeContext(app, 'Note.md', 1);
		const host = new ReadingModeBlockHost(plugin as any, ctx.el, ctx as any, 'ds-counter');

		expect(host.blockKey()).toMatch(/::\d+$/);
		expect(host.blockKey()).toBe('Note.md::ds-counter::6');
		expect(host.lastWriteLineStart).toBeNull(); // a host that has not written: the carry keys it by blockKey() as is
	});
});
