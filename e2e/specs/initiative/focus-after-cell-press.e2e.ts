// A mouse press on a roster cell selects that creature and swaps the detail row in place (`detailRowContainer.empty()` + rebuild), so the
// detail row's Stamina control a keyboard user was on is thrown away and focus fell to <body>: the note's click shield stops the press from
// focusing the cell, and nothing handed focus back. When focus was INSIDE the tracker, it now lands on the cell that was pressed (where the
// browser itself would have put it had the shield not stopped it). Reading view only. Initiative/tracker.md: Alice Alpha and three Ogres
// (cells 0-1..0-3, Ogre #1 selected).
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const TRACKER = 'Initiative/tracker.md';
const INIT = 'ds-initiative';
const TABS = 80; // Tab presses from the top of the note to the control (the chrome panel and the whole tracker are in the way)

/** What holds focus: its control id, the roster cell it is in (by instance key) and whether it is inside the Reading view's tracker (not the
 *  hidden Live Preview copy). */
const focusState = () =>
	dse.page<{ ctl: string | null; cell: string | null; inTracker: boolean }>(`(() => {
		const a = document.activeElement;
		return {
			ctl: a?.closest('[data-dse-control]')?.getAttribute('data-dse-control') ?? null,
			cell: a?.closest('.dse-init__cell')?.getAttribute('data-instance-key') ?? null,
			inTracker: !!a?.closest('.markdown-reading-view [data-dse-element="initiative"]'),
		};
	})()`);

describe('initiative: keyboard focus after a mouse press on a roster cell', () => {
	it('[INIT-F13] focus on the detail row Stamina control, then a mouse press on another roster cell: the cell that was pressed holds focus', async () => {
		await dse.openNote(TRACKER);
		const root = dse.block(INIT);
		await dse.tabTo(root.control('init.detail.stamina'), TABS);
		expect(await focusState()).toMatchObject({ ctl: 'init.detail.stamina', inTracker: true });
		await dse.waitForWrite(TRACKER, () => dse.click(root.control('init.cell.stamina', { nth: 2 })));
		await dse.settle();
		await expect(root.control('init.detail.stamina')).toHaveAttribute('aria-label', 'Edit Stamina: Ogre #3'); // the detail row was swapped
		expect(await focusState()).toEqual({ ctl: 'init.cell.stamina', cell: '0-3', inTracker: true });
	});

	// SC-458 may later make a press focus its roving target from anywhere (the click shield today stops the press from focusing the
	// cell, and the tracker only hands focus back when it already held it). That ticket flips this test: after the press, focus would
	// be on the cell that was pressed. Until then focus must stay where it was, outside the tracker. Focus is put on <body> first: after
	// `openNote` it sits on the note's own scroller, and a hand-over to the cell is refused whenever something holds focus, so that start
	// state would pass even if the tracker took focus it had never held.
	it('[INIT-F14] focus on <body>, then a mouse press on a roster cell: no focus is pulled into the tracker (SC-458 flips this)', async () => {
		await dse.openNote(TRACKER);
		const root = dse.block(INIT);
		await dse.page(`(() => { document.activeElement?.blur(); return true; })()`);
		expect(await dse.page<boolean>('document.activeElement === document.body')).toBe(true);
		const before = await focusState();
		expect(before.inTracker).toBe(false);
		await dse.waitForWrite(TRACKER, () => dse.click(root.control('init.cell.stamina', { nth: 2 })));
		await dse.settle();
		await expect(root.control('init.detail.stamina')).toHaveAttribute('aria-label', 'Edit Stamina: Ogre #3');
		const after = await focusState();
		expect([after.ctl, after.cell, after.inTracker]).toEqual([before.ctl, before.cell, before.inTracker]);
	});
});
