// SC-439 [L]: keyboard focus after a save in Live Preview. The controls' ids let the existing Live Preview focus carry (SC-602) hand focus back
// to the very seal or chip that was pressed, where an un-id'd card could only land it on the card's anchor. Reset and Complete Argument
// are checked here the way F01 / F02 check them in Reading view. Negotiation/basic.md: Interest 3 / Patience 3.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { BASIC, blockOf, expectMenuAtButton, focusAnywhere, interestOf, menuPlacement, openMenu, patienceOf, resetFromKeyboard } from '../../driver/negotiation';

const NEGO = 'ds-negotiation';

/** Which appeal chip holds focus (its position among the Motivation chips of the card in the editor; -1 for none). */
const chipIndexInFocus = (): Promise<number> =>
	dse.page<number>(`[...document.querySelectorAll('.cm-content [data-dse-element="negotiation"] [data-dse-control="negotiation.appeal.motivation"]')].indexOf(document.activeElement)`);

describe('negotiation: keyboard focus after a save in Live Preview', () => {
	it('[NEGO-L01] ArrowRight on the focused Patience seal: once the save has landed, focus is on the seal that is now checked (4), not on the card anchor', async () => {
		await dse.openNote(BASIC, { mode: 'live-preview' });
		const root = dse.block(NEGO, 0);
		await dse.focusByScript(root.control('negotiation.patience.seal', { nth: 3 })); // a real Tab from the editor would indent the note
		await dse.waitForWrite(BASIC, () => dse.press('ArrowRight', root.control('negotiation.patience')));
		await dse.settle();
		expect(patienceOf(await blockOf(BASIC))).toBe(4);
		await dse.waitFor(`document.activeElement?.closest('[data-dse-control="negotiation.patience.seal"]')?.getAttribute('data-value') === '4'`, 'focus to settle on seal 4');
		expect(await focusAnywhere()).toMatchObject({ ctl: 'negotiation.patience.seal', value: '4', inNego: true });
	});

	it('[NEGO-L02] Live Preview: Enter on Complete Argument leaves focus inside the card, on the first appeal chip', async () => {
		await dse.openNote(BASIC, { mode: 'live-preview' });
		const root = dse.block(NEGO, 0);
		await dse.click(root.control('negotiation.tier.row', { nth: 3 }));
		const complete = root.control('negotiation.complete');
		await dse.focusByScript(complete);
		await dse.waitForWrite(BASIC, () => dse.press('Enter', complete));
		await dse.settle();
		expect(interestOf(await blockOf(BASIC))).toBe(4);
		const f = await focusAnywhere();
		expect(f).toMatchObject({ inNego: true, ctl: 'negotiation.appeal.motivation' });
		expect(f.tag).not.toBe('BODY');
	});

	it('[NEGO-L04] Live Preview: after Complete Argument the next Tab continues inside the card, to the second appeal chip', async () => {
		await dse.openNote(BASIC, { mode: 'live-preview' });
		const root = dse.block(NEGO, 0);
		await dse.click(root.control('negotiation.tier.row', { nth: 3 }));
		const complete = root.control('negotiation.complete');
		await dse.focusByScript(complete);
		await dse.waitForWrite(BASIC, () => dse.press('Enter', complete));
		await dse.settle();
		expect(await chipIndexInFocus()).toBe(0);
		await dse.press('Tab');
		expect(await focusAnywhere()).toMatchObject({ inNego: true, ctl: 'negotiation.appeal.motivation' });
		expect(await chipIndexInFocus()).toBe(1);
	});

	it('[NEGO-L05] Live Preview: a Complete Argument made with focus on the page pulls no focus into the card', async () => {
		await dse.openNote(BASIC, { mode: 'live-preview' });
		const root = dse.block(NEGO, 0);
		await dse.click(root.control('negotiation.tier.row', { nth: 3 }));
		await dse.page(`document.activeElement.blur()`);
		expect(await focusAnywhere()).toMatchObject({ inNego: false });
		// A scripted press: a pointer press does not move focus at all (the click shield cancels pointerdown / mousedown), so this stands for any press made while focus is outside the card.
		await dse.waitForWrite(BASIC, () => dse.page(`document.querySelector('.cm-content [data-dse-control="negotiation.complete"]').click()`));
		await dse.settle();
		expect(interestOf(await blockOf(BASIC))).toBe(4);
		expect(await focusAnywhere()).toMatchObject({ inNego: false });
	});

	it('[NEGO-L03] Live Preview: Reset chosen from the keyboard leaves focus on the options button of the redrawn card', async () => {
		await dse.openNote(BASIC, { mode: 'live-preview' });
		const root = dse.block(NEGO, 0);
		await dse.waitForWrite(BASIC, () => dse.click(root.control('negotiation.patience.seal', { nth: 1 })));
		await dse.focusByScript(root.control('negotiation.menu'));
		await resetFromKeyboard(BASIC, root);
		expect(patienceOf(await blockOf(BASIC))).toBe(3);
		// The save redraws the widget (a new root): the SC-602 carry hands focus on to the new options button once it is drawn.
		await dse.waitFor(`document.activeElement?.closest('[data-dse-control="negotiation.menu"]') !== null && !!document.activeElement?.closest('.cm-content')`, 'focus to settle on the options button');
		const f = await focusAnywhere();
		expect(f).toMatchObject({ inNego: true, ctl: 'negotiation.menu' });
		expect(f.tag).not.toBe('BODY');
	});

	it('[NEGO-L07] Live Preview: Reset on a negotiation already in its initial state writes nothing and leaves focus on the options button', async () => {
		await dse.openNote(BASIC, { mode: 'live-preview' });
		const root = dse.block(NEGO, 0);
		await dse.focusByScript(root.control('negotiation.menu'));
		await resetFromKeyboard(BASIC, root); // the first Reset rewrites the hand-formatted YAML in the tracker's own: that is a change
		await dse.waitFor(`document.activeElement?.closest('[data-dse-control="negotiation.menu"]') !== null && !!document.activeElement?.closest('.cm-content')`, 'focus to settle on the options button');
		await resetFromKeyboard(BASIC, root, { writes: false });
		expect(await focusAnywhere()).toMatchObject({ inNego: true, ctl: 'negotiation.menu' });
	});

	it('[NEGO-L08] Live Preview: a Reset made with the mouse while focus is on the page pulls no focus into the card', async () => {
		await dse.openNote(BASIC, { mode: 'live-preview' });
		const root = dse.block(NEGO, 0);
		await dse.waitForWrite(BASIC, () => dse.click(root.control('negotiation.patience.seal', { nth: 1 })));
		await dse.page(`document.activeElement.blur()`);
		expect(await focusAnywhere()).toMatchObject({ inNego: false });
		await openMenu(root);
		await dse.waitForWrite(BASIC, () => dse.click(dse.control('negotiation.menu.reset')));
		await dse.waitFor(`document.querySelectorAll('.menu').length === 0`, 'the menu to close');
		await dse.settle();
		expect(patienceOf(await blockOf(BASIC))).toBe(3);
		expect(await focusAnywhere()).toMatchObject({ inNego: false });
	});

	it('[NEGO-L06] Live Preview: the options menu opened with Enter on the button appears beside the button, not in the window corner', async () => {
		await dse.openNote(BASIC, { mode: 'live-preview' });
		const root = dse.block(NEGO, 0);
		const menu = root.control('negotiation.menu');
		await dse.focusByScript(menu);
		await dse.press('Enter', menu);
		try {
			await dse.waitFor(`document.querySelectorAll('.menu').length === 1`, 'the menu to open');
			expectMenuAtButton(await menuPlacement(true));
		} finally {
			await dse.press('Escape');
			await dse.waitFor(`document.querySelectorAll('.menu').length === 0`, 'the menu to close');
		}
	});
});
