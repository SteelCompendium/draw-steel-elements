// SC-605 — in Live Preview an element's OWN save redraws its CodeMirror widget with a NEW view, so session state the old view held (the
// initiative tracker's half-typed Malice quick-add) was lost. livePreviewStateCarry.ts captures the view's opt-in `carryState()` while the
// old root is still in place (ViewRegistry.beforeRelease, or the editor update for an identical twin), armed by the own-write ticket (not by
// focus), keyed by the written block and scoped to the pane; the pipeline's `takeCarriedState` hands it to the next view of that block
// before mount, once. jsdom cannot run Obsidian's StateField, so a fake entry stands for the old widget and a second root for the redraw;
// the real-Obsidian redraw is in e2e (INIT-L09..L17).
import { describe, test, expect, beforeEach } from '@jest/globals';
import {
	carryOwnSaveState,
	onEditorUpdateState,
	takeCarriedState,
	clearCarriedState,
	CARRY_TTL_MS,
} from '@/framework/host/livePreviewStateCarry';
import { CLAIM_WINDOW_MS } from '@/framework/host/viewRegistry';
import type { ViewRegistry, ViewRegistryEntry } from '@/framework/host/viewRegistry';
import { ElementPipeline } from '@/framework/pipeline';
import { ElementView } from '@/framework/view';
import type { ElementDefinition } from '@/framework/registry';
import { ReadingModeBlockHost } from '@/framework/host/ReadingModeBlockHost';
import { makeCompendiumDeps } from '../elements/_refHarness';
import { App, Plugin, makeFakeContext } from '../../mocks/obsidian';

const KEY = 'Note.md::ds-initiative::13';
const WRITTEN = 'Note.md::ds-initiative::4';
const DRAFT = { amount: '2', label: 'Feytouched' };

/** A workspace pane; `.cm-content` inside it is Live Preview's editor (Reading view and the sidebar have none). */
function makePane(cm = true): { leaf: HTMLElement; content: HTMLElement } {
	const leaf = document.body.appendChild(document.createElement('div'));
	leaf.className = 'workspace-leaf';
	const content = leaf.appendChild(document.createElement('div'));
	if (cm) content.className = 'cm-content';
	return { leaf, content };
}
const makeRoot = (parent: HTMLElement | null): HTMLElement => {
	const root = document.createElement('div');
	root.setAttribute('data-dse-element', 'initiative');
	parent?.appendChild(root);
	return root;
};

/** A registry entry of the old widget: only what the carry reads. `state` is what its view's `carryState()` returns (`null`: the view
 *  does not implement it). */
function makeEntry(
	root: HTMLElement,
	opts: { key?: string; line?: number | null; ticketAge?: number | null; state?: unknown } = {},
): ViewRegistryEntry & { calls: number } {
	const { key = KEY, line = null, ticketAge = 0 } = opts;
	const state = 'state' in opts ? opts.state : DRAFT;
	const view: Record<string, unknown> = {};
	const entry = {
		root,
		host: { blockKey: () => key, lastWriteLineStart: line },
		tickets: ticketAge === null ? [] : [{ body: 'x', at: Date.now() - ticketAge }],
		released: false,
		view,
		calls: 0,
	};
	if (state !== null) view.carryState = () => {
		entry.calls++;
		return state;
	};
	return entry as unknown as ViewRegistryEntry & { calls: number };
}

beforeEach(() => {
	clearCarriedState();
	document.body.innerHTML = '';
});

describe('capture (carryOwnSaveState): only a Live Preview root whose own save is being redrawn', () => {
	test('S01 a root in .cm-content with a fresh ticket: captured; the next root of the block in the same pane takes it, once', () => {
		const pane = makePane();
		expect(carryOwnSaveState(makeEntry(makeRoot(pane.content)))).toBe(true);
		const next = makeRoot(pane.content);
		expect(takeCarriedState(() => KEY, next)).toEqual(DRAFT);
		expect(takeCarriedState(() => KEY, next)).toBeUndefined(); // one-shot
	});

	test('S02 Reading view / the sidebar (no .cm-content): nothing captured, carryState not even read', () => {
		const entry = makeEntry(makeRoot(makePane(false).content));
		expect(carryOwnSaveState(entry)).toBe(false);
		expect(entry.calls).toBe(0);
	});

	test('S03 no own-write ticket (an outside edit) or one older than the claim window: nothing captured', () => {
		const pane = makePane();
		expect(carryOwnSaveState(makeEntry(makeRoot(pane.content), { ticketAge: null }))).toBe(false);
		expect(carryOwnSaveState(makeEntry(makeRoot(pane.content), { ticketAge: CLAIM_WINDOW_MS + 1 }))).toBe(false);
		expect(takeCarriedState(() => KEY, makeRoot(pane.content))).toBeUndefined();
	});

	test('S04 one write captures once: the twin editor update, then the later release of the same entry', () => {
		const pane = makePane();
		const entry = makeEntry(makeRoot(pane.content));
		expect(carryOwnSaveState(entry)).toBe(true);
		expect(carryOwnSaveState(entry)).toBe(false);
		expect(entry.calls).toBe(1);
	});

	test('S05 a view that does not implement carryState: nothing (every element but the tracker)', () => {
		expect(carryOwnSaveState(makeEntry(makeRoot(makePane().content), { state: null }))).toBe(false);
	});

	test('S06 nothing to carry (empty boxes, e.g. right after Add) drops a carry still armed for that block', () => {
		const pane = makePane();
		expect(carryOwnSaveState(makeEntry(makeRoot(pane.content)))).toBe(true);
		expect(carryOwnSaveState(makeEntry(makeRoot(pane.content), { state: undefined }))).toBe(false);
		expect(takeCarriedState(() => KEY, makeRoot(pane.content))).toBeUndefined();
	});

	test('S16 a new capture sweeps carries whose time is up (a redraw that never mounted must not pin its pane element)', () => {
		const pane = makePane();
		carryOwnSaveState(makeEntry(makeRoot(pane.content), { key: 'Old.md::ds-initiative::4' }));
		const later = Date.now() + CARRY_TTL_MS + 10;
		carryOwnSaveState(makeEntry(makeRoot(pane.content), { ticketAge: -(CARRY_TTL_MS + 10) }), later);
		// asked as of a moment BEFORE the old carry's expiry: only the sweep can have removed it
		expect(takeCarriedState(() => 'Old.md::ds-initiative::4', makeRoot(pane.content), Date.now() + 1)).toBeUndefined();
		expect(takeCarriedState(() => KEY, makeRoot(pane.content), later + 1)).toEqual(DRAFT); // the new one is untouched
	});

	test('S17 the sweep only drops carries whose time is up: a second block captured while the first is unexpired leaves it, and both are taken', () => {
		const pane = makePane();
		const A = { amount: '1', label: 'Alpha' };
		const B = { amount: '2', label: 'Beta' };
		carryOwnSaveState(makeEntry(makeRoot(pane.content), { key: 'A.md::ds-initiative::4', state: A }));
		carryOwnSaveState(makeEntry(makeRoot(pane.content), { key: 'B.md::ds-initiative::4', state: B })); // well inside A's CARRY_TTL_MS
		expect(takeCarriedState(() => 'A.md::ds-initiative::4', makeRoot(pane.content))).toEqual(A);
		expect(takeCarriedState(() => 'B.md::ds-initiative::4', makeRoot(pane.content))).toEqual(B);
	});

	test('S07 a detached old root (already gone from the page): nothing captured', () => {
		expect(carryOwnSaveState(makeEntry(makeRoot(null)))).toBe(false);
	});
});

describe('claim (takeCarriedState): only the redrawn block, in the same pane, soon', () => {
	test('S08 keyed by the block the write LANDED in: a live key that already reports the twin line does not take it', () => {
		const pane = makePane();
		carryOwnSaveState(makeEntry(makeRoot(pane.content), { key: KEY, line: 4 }));
		expect(takeCarriedState(() => KEY, makeRoot(pane.content))).toBeUndefined(); // the identical twin below (::13)
		expect(takeCarriedState(() => WRITTEN, makeRoot(pane.content))).toEqual(DRAFT); // the written block (::4)
	});

	test('S09 the same note in another pane, same key: not taken there; the pane it was typed in still gets it', () => {
		const typed = makePane();
		const other = makePane();
		carryOwnSaveState(makeEntry(makeRoot(typed.content)));
		expect(takeCarriedState(() => KEY, makeRoot(other.content))).toBeUndefined();
		expect(takeCarriedState(() => KEY, makeRoot(typed.content))).toEqual(DRAFT);
	});

	test('S10 another note (another key): never', () => {
		const pane = makePane();
		carryOwnSaveState(makeEntry(makeRoot(pane.content)));
		expect(takeCarriedState(() => 'Other.md::ds-initiative::13', makeRoot(pane.content))).toBeUndefined();
	});

	test('S11 a root not in the document, or not in a CodeMirror editor (a sidebar panel of the same block): not taken', () => {
		const pane = makePane();
		carryOwnSaveState(makeEntry(makeRoot(pane.content)));
		expect(takeCarriedState(() => KEY, makeRoot(null))).toBeUndefined();
		const sidebar = pane.leaf.appendChild(document.createElement('div'));
		expect(takeCarriedState(() => KEY, makeRoot(sidebar))).toBeUndefined();
		expect(takeCarriedState(() => KEY, makeRoot(pane.content))).toEqual(DRAFT); // still there for the real one
	});

	test('S12 expires: a mount after CARRY_TTL_MS gets nothing (a later outside redraw never resurrects it)', () => {
		const pane = makePane();
		carryOwnSaveState(makeEntry(makeRoot(pane.content)));
		expect(takeCarriedState(() => KEY, makeRoot(pane.content), Date.now() + CARRY_TTL_MS)).toBeUndefined();
		expect(takeCarriedState(() => KEY, makeRoot(pane.content))).toBeUndefined(); // dropped, not only skipped
	});

	test('S13 no carry armed: the key is not even asked for (every ordinary mount)', () => {
		const blockKey = jest.fn(() => KEY);
		expect(takeCarriedState(blockKey, makeRoot(makePane().content))).toBeUndefined();
		expect(blockKey).not.toHaveBeenCalled();
	});
});

describe('the editor update (identical-twin hand-off: the writer\'s entry is still live when the editor updates)', () => {
	const update = (dom: HTMLElement, docChanged: boolean, set: boolean) => ({
		docChanged,
		view: { dom },
		transactions: [{ docChanged, isUserEvent: (e: string) => set && e === 'set' }],
	});
	const registryOf = (...entries: ViewRegistryEntry[]): ViewRegistry => ({ liveEntries: () => entries }) as unknown as ViewRegistry;

	test('S14 Obsidian\'s setViewData transaction ("set") captures every live entry drawn in this editor', () => {
		const pane = makePane();
		onEditorUpdateState(update(pane.content, true, true) as never, registryOf(makeEntry(makeRoot(pane.content))));
		expect(takeCarriedState(() => KEY, makeRoot(pane.content))).toEqual(DRAFT);
	});

	test('S15 not a "set" transaction (the user typing in the note), no doc change, or an entry in another editor: nothing', () => {
		const pane = makePane();
		const other = makePane();
		onEditorUpdateState(update(pane.content, true, false) as never, registryOf(makeEntry(makeRoot(pane.content))));
		onEditorUpdateState(update(pane.content, false, true) as never, registryOf(makeEntry(makeRoot(pane.content))));
		onEditorUpdateState(update(pane.content, true, true) as never, registryOf(makeEntry(makeRoot(other.content))));
		expect(takeCarriedState(() => KEY, makeRoot(pane.content))).toBeUndefined();
		expect(takeCarriedState(() => KEY, makeRoot(other.content))).toBeUndefined();
	});
});

describe('the pipeline claim: a Live Preview mount takes the carry BEFORE mount, only for a view that opts in', () => {
	/** A view that records what it held when `onMount` ran (so "before mount" is observable) and whether it was handed anything. */
	class SeamView extends ElementView<{ n: number }> {
		static seen: unknown[] = [];
		receiveCarriedState(state: unknown): void {
			this.got = state;
		}
		private got: unknown;
		protected onMount(root: HTMLElement): void {
			SeamView.seen.push(this.got);
			root.createEl('span', { text: 'x' });
		}
	}
	class PlainView extends ElementView<{ n: number }> {
		protected onMount(root: HTMLElement): void {
			root.createEl('span', { text: 'x' });
		}
	}
	const defOf = (View: typeof SeamView | typeof PlainView): ElementDefinition<{ n: number }> => ({
		id: 'seam',
		name: 'Seam',
		aliases: ['ds-counter'],
		shape: 'static',
		parse: () => ({ n: 1 }),
		createView: (cx) => new View(cx),
	});
	/** A real ReadingModeBlockHost for the note's first block, its container in a pane (or not). */
	const hostIn = (parent: HTMLElement | null): ReadingModeBlockHost => {
		const app = new App();
		app.vault.setFile('Note.md', '```ds-counter\nname: A\n```');
		const ctx = makeFakeContext(app, 'Note.md');
		parent?.appendChild(ctx.el);
		return new ReadingModeBlockHost(new Plugin(app) as any, ctx.el, ctx as any, 'ds-counter');
	};
	const run = (def: ElementDefinition<{ n: number }>, host: ReadingModeBlockHost) => new ElementPipeline(makeCompendiumDeps().deps).run(def, 'n: 1', host);
	/** Arm a carry for `host`'s block, as the old widget's release would. */
	const arm = (pane: HTMLElement, key: string, state: unknown = DRAFT) => carryOwnSaveState(makeEntry(makeRoot(pane), { key, state }));

	beforeEach(() => {
		SeamView.seen = [];
	});

	test('P01 a view that implements receiveCarriedState is handed the carry before onMount, and it is spent', async () => {
		const pane = makePane();
		const host = hostIn(pane.content);
		arm(pane.content, host.blockKey());
		await run(defOf(SeamView), host);
		expect(SeamView.seen).toEqual([DRAFT]);
		expect(takeCarriedState(() => host.blockKey(), makeRoot(pane.content))).toBeUndefined();
	});

	test('P02 a view that does not implement it leaves the carry alone; a root outside a CodeMirror editor takes nothing', async () => {
		const pane = makePane();
		const host = hostIn(pane.content);
		arm(pane.content, host.blockKey());
		await run(defOf(PlainView), host);
		expect(takeCarriedState(() => host.blockKey(), makeRoot(pane.content))).toEqual(DRAFT); // still armed for the real redraw
		await run(defOf(SeamView), hostIn(makePane(false).content));
		expect(SeamView.seen).toEqual([undefined]);
	});
});
