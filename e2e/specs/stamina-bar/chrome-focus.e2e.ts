// SC-505: the stamina bar's chrome panel sits INSIDE the bar, and Collapse hides the bar (panel included), so a
// keyboard Collapse used to drop focus to <body>; Expand did the same in reverse (the collapsed one-liner
// disappears); and Pin to sidebar writes the note and redraws the block, which also lost the button.
// Real keys throughout: Tab to the button, Enter to press it. A MOUSE press keeps the base behaviour.
//   basic.md  one ds-stamina-bar, 15/20 +5 temp
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const NOTE = 'Stamina/basic.md';
const BAR = 'ds-stamina-bar';
/** The block in the visible Reading view (Obsidian keeps a second, off-view copy of the render in the same leaf). */
const BLOCK = '.markdown-reading-view [data-dse-element="stamina-bar"]';

/** The focused element's keyboard ring, as the browser computes it (a dropped CSS rule shows up here). */
const ring = (): Promise<{ visible: boolean; outline: string }> =>
	dse.page(`(() => { const a = document.activeElement; return { visible: a.matches(':focus-visible'), outline: getComputedStyle(a).outlineStyle }; })()`);
/** Where focus is, in words: a control id, or <body>. */
const where = (): Promise<string> =>
	dse.page<string>(`(() => { const a = document.activeElement; return a === document.body ? 'body' : a?.closest('[data-dse-control]')?.getAttribute('data-dse-control') ?? a?.tagName ?? 'none'; })()`);
const isCollapsed = (): Promise<boolean> => dse.page<boolean>(`document.querySelector('${BLOCK}').hasAttribute('data-dse-collapsed')`);
const waitCollapsed = (collapsed: boolean): Promise<void> =>
	dse.waitFor(`document.querySelector('${BLOCK}').hasAttribute('data-dse-collapsed') === ${collapsed}`, collapsed ? 'the block to collapse' : 'the block to expand');
/** Is focus inside the open note's stamina bar block? */
const focusInBlock = (): Promise<boolean> => dse.page<boolean>(`document.querySelector('${BLOCK}').contains(document.activeElement)`);

/** The collapse toggle is session state keyed by the block, so it outlives `openNote`: every test starts from an
 *  expanded block, whatever an earlier (failed) test left behind. A script click is setup, not a driven control. */
const startExpanded = (): Promise<void> =>
	dse.page(`(() => { const r = document.querySelector('${BLOCK}'); if (r.hasAttribute('data-dse-collapsed')) r.querySelector('[data-dse-control="chrome.expand"]').click(); })()`);

/** Resolve once nothing has been added to or removed from the page for `quietMs`: a Pin rebuilds its block several times in
 *  the ~200 ms after the write, and focus has to be on the button after the LAST one. A state to wait for, not a sleep. */
const waitDomQuiet = (quietMs: number): Promise<void> =>
	dse.page(
		`new Promise((resolve) => { let t = setTimeout(done, ${quietMs}); const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(done, ${quietMs}); }); function done() { mo.disconnect(); resolve(true); } mo.observe(document.body, { childList: true, subtree: true }); })`,
	);

describe('stamina bar chrome: keyboard focus follows Collapse and Expand (SC-505)', () => {
	it("[CHR-F01] Tab to Collapse + Enter: the block collapses and focus lands on the one-liner's Expand button (ring shown); Enter on it expands and focus returns to Collapse (ring shown, panel shown)", async () => {
		await dse.openNote(NOTE);
		await startExpanded();
		const root = dse.block(BAR);
		const collapse = root.control('chrome.collapse');
		await dse.tabTo(collapse, 24);
		await dse.press('Enter', collapse);
		await waitCollapsed(true);
		expect(await where()).toBe('chrome.expand');
		expect(await ring()).toEqual({ visible: true, outline: 'solid' });

		await dse.press('Enter', root.control('chrome.expand'));
		await waitCollapsed(false);
		expect(await where()).toBe('chrome.collapse');
		expect(await ring()).toEqual({ visible: true, outline: 'solid' });
		// The ring is drawn on a button the reader can actually see: the hover-revealed panel is open while it holds focus.
		expect(await dse.page<string>(`getComputedStyle(document.activeElement.closest('.dse-chrome')).opacity`)).toBe('1');
	});

	// The Expand half on its own, so it is measurable without the Collapse fix: collapse with the mouse (no hand-off), then Tab to
	// Expand and press Enter.
	it('[CHR-F02] Enter on Expand (reached by keyboard) expands the block and focus lands on the restored Collapse button (ring shown, panel shown)', async () => {
		await dse.openNote(NOTE);
		await startExpanded();
		const root = dse.block(BAR);
		await dse.hover(root.root);
		await dse.click(root.control('chrome.collapse'));
		await waitCollapsed(true);
		const expand = root.control('chrome.expand');
		await dse.tabTo(expand, 40); // Tab reaches the one-liner's Expand button, as it does for a keyboard user
		await dse.press('Enter', expand);
		await waitCollapsed(false);
		expect(await where()).toBe('chrome.collapse');
		expect(await ring()).toEqual({ visible: true, outline: 'solid' });
		expect(await dse.page<string>(`getComputedStyle(document.activeElement.closest('.dse-chrome')).opacity`)).toBe('1');
	});

	it('[CHR-F03] a MOUSE click on Collapse and on Expand moves focus nowhere new (no hand-off into the block)', async () => {
		await dse.openNote(NOTE);
		await startExpanded();
		const root = dse.block(BAR);
		await dse.hover(root.root);
		await dse.click(root.control('chrome.collapse'));
		await waitCollapsed(true);
		expect(await focusInBlock()).toBe(false);
		expect(await where()).not.toBe('chrome.expand');
		await dse.click(root.control('chrome.expand'));
		await waitCollapsed(false);
		expect(await isCollapsed()).toBe(false);
		expect(await focusInBlock()).toBe(false);
		expect(await where()).not.toBe('chrome.collapse');
	});
});

describe('stamina bar chrome: keyboard focus stays on Pin to sidebar across the redraw (SC-505)', () => {
	before(() => dse.setPrefs({}, { experimental: true }));
	after(() => dse.setPrefs({}));

	// Pin alone, from a fresh note: red on its own when only the Pin hand-off is missing (CHR-F04's Collapse/Expand preamble would fail first).
	it('[CHR-F05] Tab straight to Pin + Enter on a fresh note: the pin writes the note once and focus is on the (new) Pin button with the ring', async () => {
		await dse.openNote(NOTE);
		await startExpanded();
		const pin = dse.block(BAR).control('chrome.pin');
		await dse.tabTo(pin, 24);
		const w = await dse.waitForWrite(NOTE, () => dse.press('Enter', pin));
		expect(w.count).toBe(1);
		await dse.settle();
		await waitDomQuiet(600);
		expect(await where()).toBe('chrome.pin');
		expect(await ring()).toEqual({ visible: true, outline: 'solid' });
		expect(await focusInBlock()).toBe(true);
	});

	// The same note open in a second pane renders the same block twice (same block key, its own Pin button each). The press is in the
	// later (active) pane: the first pane's rebuild must neither cancel the request nor take focus, so focus ends on THIS pane's new Pin.
	it('[CHR-F06] the same note open in two panes: Tab + Enter on Pin in the second pane leaves focus on that pane\'s Pin button, never the first pane\'s', async () => {
		await dse.openNote(NOTE);
		await startExpanded();
		await dse.page(`(async () => {
			const a = app.workspace.getMostRecentLeaf();
			const b = app.workspace.createLeafBySplit(a, 'vertical');
			await b.setViewState({ type: 'markdown', state: { file: ${JSON.stringify(NOTE)}, mode: 'preview' }, active: true });
			app.workspace.setActiveLeaf(b, { focus: true });
			window.__paneB = b.containerEl;
			return true;
		})()`);
		await dse.waitFor(`document.querySelectorAll('.markdown-reading-view [data-dse-element="stamina-bar"]').length === 2 && Array.from(document.querySelectorAll('.markdown-reading-view [data-dse-control="chrome.pin"]')).every((b) => b.isConnected)`, 'both panes to render the bar');
		const pin = dse.block(BAR).control('chrome.pin'); // the active leaf: the second pane
		await dse.tabTo(pin, 40);
		expect(await dse.page<boolean>(`document.activeElement.closest('.workspace-leaf') === window.__paneB`)).toBe(true);
		const w = await dse.waitForWrite(NOTE, () => dse.press('Enter', pin));
		expect(w.count).toBeGreaterThanOrEqual(1);
		await dse.settle();
		await waitDomQuiet(800);
		expect(await where()).toBe('chrome.pin');
		expect(await dse.page<boolean>(`document.activeElement.closest('.workspace-leaf') === window.__paneB`)).toBe(true); // this pane, not the twin
		expect(await ring()).toEqual({ visible: true, outline: 'solid' });
	});

	// After a keyboard Collapse and Expand, as a keyboard user's session goes: that order was measured to redraw the block three
	// times, the last by Obsidian re-inserting the existing section (nothing of the plugin's runs for it), and the focus
	// has to survive all of them.
	it('[CHR-F04] Tab to Pin + Enter: the pin writes the note, the block redraws, and focus is on the (new) Pin button with the ring', async () => {
		await dse.openNote(NOTE);
		await startExpanded();
		const root = dse.block(BAR);
		const collapse = root.control('chrome.collapse');
		await dse.tabTo(collapse, 24);
		await dse.press('Enter', collapse);
		await waitCollapsed(true);
		await dse.press('Enter', root.control('chrome.expand'));
		await waitCollapsed(false);
		await dse.page(`document.activeElement.blur()`);
		const pin = root.control('chrome.pin');
		await dse.tabTo(pin, 24);
		const w = await dse.waitForWrite(NOTE, () => dse.press('Enter', pin));
		expect(w.count).toBe(1);
		await dse.settle();
		await waitDomQuiet(600);
		expect(await where()).toBe('chrome.pin');
		expect(await ring()).toEqual({ visible: true, outline: 'solid' });
		expect(await focusInBlock()).toBe(true);
	});
});
