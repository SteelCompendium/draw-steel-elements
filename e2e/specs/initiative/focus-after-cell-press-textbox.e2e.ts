// A mouse press on a roster cell selects that creature. The note's click shield blurs a focused text box on the press's pointerdown (so a click
// away saves the draft), so a keyboard user who was typing in the Malice quick-add amount or label lost focus to <body> instead of landing on the
// cell they pressed: the tracker's "was focus inside" check ran after the shield's blur. When focus was in a text box of the tracker, it now lands
// on the cell that was pressed, and what was typed stays in the box; when focus was NOT inside the tracker nothing is pulled in. Reading view and the
// pinned sidebar tracker. Initiative/tracker.md: Alice Alpha and three Ogres (cells 0-1..0-3, Ogre #1 selected), Malice 3.
// Sidebar/initiative-pinned.md: the same roster, pinned by script (fixed `_dse_anchor`, no note write); a note with no tracker is open beside it, so
// every tracker control on the page is the sidebar's.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const TRACKER = 'Initiative/tracker.md';
const PINNED = 'Sidebar/initiative-pinned.md';
const OTHER = 'Sidebar/three-counters.md';
const ANCHOR = 'sbin01';
const INIT = 'ds-initiative';
const AMOUNT = 'init.malice.quickadd.amount';
const LABEL = 'init.malice.quickadd.label';

/** What holds focus: its control id, the roster cell it is in (by instance key), and which surface's tracker it is in. */
const focusState = () =>
	dse.page<{ ctl: string | null; cell: string | null; surface: string }>(`(() => {
		const a = document.activeElement;
		return {
			ctl: a?.closest('[data-dse-control]')?.getAttribute('data-dse-control') ?? null,
			cell: a?.closest('.dse-init__cell')?.getAttribute('data-instance-key') ?? null,
			surface: !a || a === document.body ? 'body' : a.closest('.dse-sidebar') ? 'sidebar' : a.closest('.markdown-reading-view [data-dse-element="initiative"]') ? 'reading' : 'other',
		};
	})()`);
const blurToBody = async (): Promise<void> => {
	await dse.page(`(() => { document.activeElement?.blur(); return true; })()`);
	expect(await dse.page<boolean>('document.activeElement === document.body')).toBe(true);
};
const closeSidebar = (): Promise<unknown> => dse.page(`(() => { app.workspace.detachLeavesOfType('dse-sidebar'); return true; })()`);

describe('initiative: keyboard focus after a mouse press on a roster cell, from a text box', () => {
	it('[INIT-F17] click into the Malice quick-add amount, type, then a mouse press on a roster cell: the creature is selected, the cell holds focus and the amount stays typed', async () => {
		await dse.openNote(TRACKER);
		const root = dse.block(INIT);
		await dse.type(root.control(AMOUNT), '7', { replace: true });
		expect(await focusState()).toEqual({ ctl: AMOUNT, cell: null, surface: 'reading' });
		await dse.waitForWrite(TRACKER, () => dse.click(root.control('init.cell.stamina', { nth: 2 })));
		await dse.settle();
		await expect(root.control('init.detail.stamina')).toHaveAttribute('aria-label', 'Edit Stamina: Ogre #3'); // the detail row was swapped
		expect(await focusState()).toEqual({ ctl: 'init.cell.stamina', cell: '0-3', surface: 'reading' });
		await expect(root.control(AMOUNT)).toHaveValue('7');
	});

	it('[INIT-F18] the same from the quick-add label: the cell holds focus and both typed boxes keep their text', async () => {
		await dse.openNote(TRACKER);
		const root = dse.block(INIT);
		await dse.type(root.control(AMOUNT), '2', { replace: true });
		await dse.type(root.control(LABEL), 'Feyt', { replace: true });
		expect(await focusState()).toEqual({ ctl: LABEL, cell: null, surface: 'reading' });
		await dse.waitForWrite(TRACKER, () => dse.click(root.control('init.cell.stamina', { nth: 1 })));
		await dse.settle();
		await expect(root.control('init.detail.stamina')).toHaveAttribute('aria-label', 'Edit Stamina: Ogre #2');
		expect(await focusState()).toEqual({ ctl: 'init.cell.stamina', cell: '0-2', surface: 'reading' });
		await expect(root.control(AMOUNT)).toHaveValue('2');
		await expect(root.control(LABEL)).toHaveValue('Feyt');
	});

	// The third text box of the tracker the shield blurs: the encounter title while it is being edited. The press commits it (a real blur), then selects the cell.
	it('[INIT-F23] type a new encounter title (editor open), then a mouse press on a roster cell: the title is saved, the cell holds focus', async () => {
		await dse.openNote(TRACKER);
		const root = dse.block(INIT);
		await dse.click(root.control('init.title'));
		await dse.type(root.control('init.title.input'), 'Night Watch', { replace: true });
		expect(await focusState()).toEqual({ ctl: 'init.title.input', cell: null, surface: 'reading' });
		await dse.waitForWrite(TRACKER, () => dse.click(root.control('init.cell.stamina', { nth: 2 })));
		await dse.settle();
		await expect(root.control('init.detail.stamina')).toHaveAttribute('aria-label', 'Edit Stamina: Ogre #3');
		await expect(root.control('init.title.input')).not.toBeExisting();
		expect(((await dse.expectNoteBlock(TRACKER, INIT).value()) as { name?: string }).name).toBe('Night Watch');
		expect(await focusState()).toEqual({ ctl: 'init.cell.stamina', cell: '0-3', surface: 'reading' });
	});

	// Focus is put on <body> first: after `openNote` it sits on the note's own scroller, and a hand-over is refused whenever something holds focus,
	// so that start state would pass even if the tracker took focus it had never held.
	it('[INIT-F19] focus on <body> with text typed in the amount box, then a mouse press on a roster cell: no focus is pulled into the tracker', async () => {
		await dse.openNote(TRACKER);
		const root = dse.block(INIT);
		await dse.type(root.control(AMOUNT), '7', { replace: true });
		await blurToBody();
		expect((await focusState()).surface).toBe('body');
		await dse.waitForWrite(TRACKER, () => dse.click(root.control('init.cell.stamina', { nth: 2 })));
		await dse.settle();
		await expect(root.control('init.detail.stamina')).toHaveAttribute('aria-label', 'Edit Stamina: Ogre #3');
		expect(await focusState()).toEqual({ ctl: null, cell: null, surface: 'body' });
		await expect(root.control(AMOUNT)).toHaveValue('7');
	});
});

describe('initiative: the same press in the pinned sidebar tracker', () => {
	before(() => dse.setPrefs({}, { experimental: true }));
	after(async () => {
		await closeSidebar();
		await dse.setPrefs({});
	});

	/** Pin the tracker by script (no note write) and wait for it to render; a note with no tracker is open in the main pane. */
	async function pin(): Promise<void> {
		await dse.openNote(OTHER);
		await closeSidebar();
		await dse.page(`(async () => {
			const leaf = app.workspace.getRightLeaf(false);
			await leaf.setViewState({ type: 'dse-sidebar', active: true });
			await app.workspace.revealLeaf(leaf);
			leaf.view.addPanel({ filePath: ${JSON.stringify(PINNED)}, alias: 'ds-initiative', anchorId: ${JSON.stringify(ANCHOR)} });
			return true;
		})()`);
		await dse.waitFor(`document.querySelectorAll('.dse-sidebar [data-dse-control="init.cell.stamina"]').length === 3`, 'the pinned tracker to render in the sidebar');
		dse.embeddedTarget(PINNED, INIT); // the press writes the selection into the PINNED note's block, not the open note's
	}

	it('[INIT-F20] click into the quick-add amount of the pinned tracker, type, then a mouse press on a roster cell: the cell holds focus and the amount stays typed', async () => {
		await pin();
		await dse.type(dse.control(AMOUNT), '7', { replace: true });
		expect(await focusState()).toEqual({ ctl: AMOUNT, cell: null, surface: 'sidebar' });
		await dse.waitForWrite(PINNED, () => dse.click(dse.control('init.cell.stamina', { nth: 2 })));
		await dse.settle();
		await expect(dse.control('init.detail.stamina')).toHaveAttribute('aria-label', 'Edit Stamina: Ogre #3');
		expect(await focusState()).toEqual({ ctl: 'init.cell.stamina', cell: '0-3', surface: 'sidebar' });
		await expect(dse.control(AMOUNT)).toHaveValue('7');
	});

	it('[INIT-F24] the same from the quick-add label of the pinned tracker: the cell holds focus and both typed boxes keep their text', async () => {
		await pin();
		await dse.type(dse.control(AMOUNT), '2', { replace: true });
		await dse.type(dse.control(LABEL), 'Feyt', { replace: true });
		expect(await focusState()).toEqual({ ctl: LABEL, cell: null, surface: 'sidebar' });
		await dse.waitForWrite(PINNED, () => dse.click(dse.control('init.cell.stamina', { nth: 2 })));
		await dse.settle();
		await expect(dse.control('init.detail.stamina')).toHaveAttribute('aria-label', 'Edit Stamina: Ogre #3');
		expect(await focusState()).toEqual({ ctl: 'init.cell.stamina', cell: '0-3', surface: 'sidebar' });
		await expect(dse.control(AMOUNT)).toHaveValue('2');
		await expect(dse.control(LABEL)).toHaveValue('Feyt');
	});

	it('[INIT-F21] focus on <body>, then a mouse press on a roster cell of the pinned tracker: no focus is pulled into the sidebar', async () => {
		await pin();
		await dse.type(dse.control(AMOUNT), '7', { replace: true });
		await blurToBody();
		await dse.waitForWrite(PINNED, () => dse.click(dse.control('init.cell.stamina', { nth: 1 })));
		await dse.settle();
		await expect(dse.control('init.detail.stamina')).toHaveAttribute('aria-label', 'Edit Stamina: Ogre #2');
		expect(await focusState()).toEqual({ ctl: null, cell: null, surface: 'body' });
		await expect(dse.control(AMOUNT)).toHaveValue('7');
	});
});
