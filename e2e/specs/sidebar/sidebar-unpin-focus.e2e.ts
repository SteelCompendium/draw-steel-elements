// SC-511: "Unpin from sidebar" removes the panel the keyboard user just pressed, button and all, so focus fell to
// <body>. Keyboard only (a pointer press keeps the base behaviour): focus goes to the panel now in the removed panel's
// place (its header note link), else the panel above, else the "No pinned blocks" message (tabindex -1, no Tab stop).
//   Sidebar/three-counters.md  three ds-counter blocks, each with a fixed `_dse_anchor`, pinned by script (no note write)
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const NOTE = 'Sidebar/three-counters.md';
const ANCHORS = ['sbfa01', 'sbfb02', 'sbfc03'];

/** Detach every Draw Steel sidebar leaf (it outlives `openNote`'s root-leaf cleanup). */
const closeSidebar = (): Promise<unknown> => dse.page(`(() => { app.workspace.detachLeavesOfType('dse-sidebar'); return true; })()`);

/** Open the sidebar with the first `n` panels pinned (script setup: pinning itself is not what these tests drive). */
async function openSidebar(n: number): Promise<void> {
	await closeSidebar();
	await dse.page(`(async () => {
		const leaf = app.workspace.getRightLeaf(false);
		await leaf.setViewState({ type: 'dse-sidebar', active: true });
		await app.workspace.revealLeaf(leaf);
		for (const anchorId of ${JSON.stringify(ANCHORS.slice(0, n))}) leaf.view.addPanel({ filePath: ${JSON.stringify(NOTE)}, alias: 'ds-counter', anchorId });
		return true;
	})()`);
	await dse.waitFor(
		`document.querySelectorAll('.dse-sidebar [data-dse-control="chrome.unpin"]').length === ${n} && Array.from(document.querySelectorAll('.dse-sidebar__panel-note')).length === ${n}`,
		`${n} pinned panels to render in the sidebar`,
	);
}

/** Put real focus on panel `i`'s header note link (script setup), so a Tab press starts from inside the sidebar. */
const focusNote = (i: number): Promise<unknown> =>
	dse.page(`(() => { document.querySelectorAll('.dse-sidebar__panel-note')[${i}].focus(); return true; })()`);

/** Where focus is, in words: `note:<panel index>`, `empty`, `body`, or something else. */
const where = (): Promise<string> =>
	dse.page<string>(`(() => {
		const a = document.activeElement;
		if (a === document.body || !a) return 'body';
		if (a.matches('.dse-sidebar__empty')) return 'empty';
		if (a.matches('.dse-sidebar__panel-note')) return 'note:' + Array.from(document.querySelectorAll('.dse-sidebar__panel-note')).indexOf(a);
		return 'other:' + a.tagName + '.' + a.className;
	})()`);
const ring = (): Promise<{ visible: boolean; outline: string }> =>
	dse.page(`(() => { const a = document.activeElement; return { visible: a.matches(':focus-visible'), outline: getComputedStyle(a).outlineStyle }; })()`);
const panelCount = (): Promise<number> => dse.page<number>(`document.querySelectorAll('.dse-sidebar__panel').length`);
/** Real Tab presses from panel `i`'s note link to its Unpin button, then Enter. */
async function keyboardUnpin(i: number): Promise<void> {
	await focusNote(i);
	const unpin = dse.control('chrome.unpin', { nth: i });
	await dse.tabTo(unpin, 40);
	await dse.press('Enter', unpin);
}

describe('sidebar: keyboard "Unpin from sidebar" hands focus to a neighbour (SC-511)', () => {
	before(() => dse.setPrefs({}, { experimental: true }));
	after(async () => {
		await closeSidebar();
		await dse.setPrefs({});
	});

	it('[SBR-F01] Enter on Unpin of the MIDDLE of three panels: focus lands on the note link of the panel that took its place (ring shown)', async () => {
		await dse.openNote(NOTE);
		await openSidebar(3);
		await keyboardUnpin(1);
		await dse.waitFor(`document.querySelectorAll('.dse-sidebar__panel').length === 2`, 'the middle panel to go');
		expect(await where()).toBe('note:1'); // the old third panel, now second
		expect(await ring()).toEqual({ visible: true, outline: 'solid' });
	});

	it('[SBR-F02] Enter on Unpin of the LAST of three panels: focus lands on the note link of the panel above it', async () => {
		await dse.openNote(NOTE);
		await openSidebar(3);
		await keyboardUnpin(2);
		await dse.waitFor(`document.querySelectorAll('.dse-sidebar__panel').length === 2`, 'the last panel to go');
		expect(await where()).toBe('note:1');
		expect(await ring()).toEqual({ visible: true, outline: 'solid' });
	});

	it('[SBR-F03] Enter on Unpin of the ONLY panel: focus lands on the "No pinned blocks" message, which is no Tab stop (tabindex -1)', async () => {
		await dse.openNote(NOTE);
		await openSidebar(1);
		await keyboardUnpin(0);
		await dse.waitFor(`document.querySelectorAll('.dse-sidebar__panel').length === 0`, 'the only panel to go');
		expect(await where()).toBe('empty');
		expect(await dse.page<string | null>(`document.querySelector('.dse-sidebar__empty').getAttribute('tabindex')`)).toBe('-1');
		expect(await ring()).toEqual({ visible: true, outline: 'solid' });
	});

	// A real mouse press is not a keyboard activation: base behaviour, nothing is moved into the sidebar.
	it('[SBR-F04] a MOUSE click on Unpin of the middle panel removes it and moves focus to no neighbour', async () => {
		await dse.openNote(NOTE);
		await openSidebar(3);
		await dse.hover(dse.control({ css: '.dse-sidebar__panel:nth-child(2)' }));
		await dse.click(dse.control('chrome.unpin', { nth: 1 }));
		await dse.waitFor(`document.querySelectorAll('.dse-sidebar__panel').length === 2`, 'the middle panel to go');
		expect(await panelCount()).toBe(2);
		expect(await dse.page<boolean>(`document.activeElement?.closest('.dse-sidebar') !== null`)).toBe(false);
		expect(await where()).toBe('body');
	});
});
