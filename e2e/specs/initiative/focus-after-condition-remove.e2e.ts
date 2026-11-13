// A mouse press on a condition's remove button removes the condition and redraws the conditions row (`empty()` + rebuild), so the control
// that held keyboard focus in that row was thrown away and focus fell to <body>: the note's click shield stops the press from focusing the
// chip, the Add Condition button a keyboard user was on stayed focused until the redraw destroyed it. When focus was INSIDE the row it now
// lands on the rebuilt replacement (Add Condition -> the new Add Condition); when focus was not inside the tracker nothing is pulled in.
// Reading view only. Initiative/rich.md: Alice (grabbed), Bruno, Ogre #1 (selected) dazed; the detail row is the Ogre's.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const RICH = 'Initiative/rich.md';
const INIT = 'ds-initiative';
const TABS = 80; // Tab presses from the top of the note to the control (the chrome panel and the whole tracker are in the way)
const DETAIL_REMOVE = '.markdown-reading-view .dse-init__detail [data-dse-control="init.cond.remove"]';

/** What holds focus: its control id, whether it sits in the detail row, and whether it is inside the Reading view's tracker (not the
 *  hidden Live Preview copy). */
const focusState = () =>
	dse.page<{ ctl: string | null; inDetail: boolean; inTracker: boolean }>(`(() => {
		const a = document.activeElement;
		return {
			ctl: a?.closest('[data-dse-control]')?.getAttribute('data-dse-control') ?? null,
			inDetail: !!a?.closest('.dse-init__detail'),
			inTracker: !!a?.closest('.markdown-reading-view [data-dse-element="initiative"]'),
		};
	})()`);

describe('initiative: keyboard focus after a mouse press removes a condition', () => {
	it('[INIT-F15] Tab to the detail row\'s Add Condition, then a mouse press on its condition: the condition is gone and the rebuilt Add Condition button holds focus', async () => {
		await dse.openNote(RICH);
		const root = dse.block(INIT);
		const add = root.control('init.cond.add', { nth: 2 }); // Alice's, Bruno's, then the open Ogre's
		await dse.tabTo(add, TABS);
		expect(await focusState()).toEqual({ ctl: 'init.cond.add', inDetail: true, inTracker: true });
		await expect(root.control('init.cond.remove', { nth: 1 })).toHaveAttribute('aria-label', 'Remove condition: Dazed'); // Alice's Grabbed is nth 0
		await dse.page(`(() => { window.__sc614Add = document.activeElement; return true; })()`);
		await dse.waitForWrite(RICH, () => dse.click(root.control('init.cond.remove', { nth: 1 })));
		await dse.settle();
		await expect(root.control({ css: DETAIL_REMOVE })).not.toBeExisting(); // the Dazed icon is gone, the row was redrawn
		expect(await dse.page<boolean>(`window.__sc614Add !== document.activeElement && !window.__sc614Add.isConnected`)).toBe(true); // a new button, not the old one
		expect(await focusState()).toEqual({ ctl: 'init.cond.add', inDetail: true, inTracker: true });
	});

	// Focus is put on <body> first: after `openNote` it sits on the note's own scroller, and a hand-over is refused whenever something
	// holds focus, so that start state would pass even if the tracker took focus it had never held.
	it('[INIT-F16] focus on <body>, then a mouse press on a condition: no focus is pulled into the tracker', async () => {
		await dse.openNote(RICH);
		const root = dse.block(INIT);
		await dse.page(`(() => { document.activeElement?.blur(); return true; })()`);
		expect(await dse.page<boolean>('document.activeElement === document.body')).toBe(true);
		expect((await focusState()).inTracker).toBe(false);
		await expect(root.control('init.cond.remove', { nth: 1 })).toHaveAttribute('aria-label', 'Remove condition: Dazed');
		await dse.waitForWrite(RICH, () => dse.click(root.control('init.cond.remove', { nth: 1 })));
		await dse.settle();
		await expect(root.control({ css: DETAIL_REMOVE })).not.toBeExisting();
		expect(await dse.page<boolean>('document.activeElement === document.body')).toBe(true);
		expect((await focusState()).inTracker).toBe(false);
	});
});
