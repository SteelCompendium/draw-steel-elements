// SC-439 [F]: keyboard focus after the negotiation saves. Seal, chip and Spent writes repaint in place (focus stays: asserted in the
// scenarios that press them); Reset rebuilds the whole card, and Complete Argument disarms the very button that was pressed. A keyboard
// user should still have focus inside the card afterwards, not on the page. Reset (SC-639): the button the menu was opened from is thrown away with
// the card, so focus goes to the NEW card's options button (src/elements/negotiation/view.ts), and only when focus was in the card when the menu opened.
// Negotiation/basic.md: Interest 3 / Patience 3.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { BASIC, blockOf, focusState, interestOf, onNthOfControl, openMenu, openNego, patienceOf, patienceSeal, resetFromKeyboard, TABS } from '../../driver/negotiation';

describe('negotiation: keyboard focus after a save', () => {
	it('[NEGO-F01] Reset chosen from the keyboard (Enter on the options button, then Down and Enter in the menu): focus lands on the options button of the rebuilt card, not on the page', async () => {
		const root = await openNego(BASIC);
		await dse.waitForWrite(BASIC, () => dse.click(patienceSeal(root, 1)));
		const menu = root.control('negotiation.menu');
		await dse.tabTo(menu, TABS);
		await dse.press('Enter', menu);
		await dse.waitFor(`document.querySelectorAll('.menu').length === 1`, 'the menu to open');
		await dse.press('ArrowDown');
		await dse.waitForWrite(BASIC, () => dse.press('Enter', dse.aimedAt('negotiation.menu.reset')));
		await dse.settle();
		await dse.waitFor(`document.querySelectorAll('.menu').length === 0`, 'the menu to close');
		expect(patienceOf(await blockOf(BASIC))).toBe(3);
		const f = await focusState();
		expect(f).toMatchObject({ inCard: true, ctl: 'negotiation.menu', ring: true }); // the keyboard ring follows the key press that opened the menu
		expect(f.tag).not.toBe('BODY');
	});

	it('[NEGO-F05] Reset from the options button opened with Space: focus lands on the options button too, and a second Enter opens the menu again from it', async () => {
		const root = await openNego(BASIC);
		await dse.waitForWrite(BASIC, () => dse.click(patienceSeal(root, 1)));
		await dse.tabTo(root.control('negotiation.menu'), TABS);
		await resetFromKeyboard(BASIC, root, { key: 'Space' });
		expect(patienceOf(await blockOf(BASIC))).toBe(3);
		expect(await focusState()).toMatchObject({ inCard: true, ctl: 'negotiation.menu' });
		await dse.press('Enter', root.control('negotiation.menu')); // the landed button is the live one, not a stale node
		await dse.waitFor(`document.querySelectorAll('.menu').length === 1`, 'the menu to open again');
		await dse.press('Escape');
		await dse.waitFor(`document.querySelectorAll('.menu').length === 0`, 'the menu to close');
	});

	it('[NEGO-F06] Reset on a negotiation already in its initial state writes nothing and still leaves focus on the options button', async () => {
		const root = await openNego(BASIC);
		await dse.tabTo(root.control('negotiation.menu'), TABS);
		await resetFromKeyboard(BASIC, root); // the first Reset rewrites the hand-formatted YAML in the tracker's own: that is a change
		await resetFromKeyboard(BASIC, root, { writes: false });
		expect(await focusState()).toMatchObject({ inCard: true, ctl: 'negotiation.menu' });
	});

	it('[NEGO-F08] focus on a Patience seal, the menu opened and Reset chosen with the mouse (a mouse press moves no focus): focus lands on the options button of the rebuilt card, with the ring', async () => {
		const root = await openNego(BASIC);
		await dse.waitForWrite(BASIC, () => dse.click(patienceSeal(root, 1)));
		await dse.tabTo(patienceSeal(root, 1), TABS);
		expect(await focusState()).toMatchObject({ inCard: true, ctl: 'negotiation.patience.seal' });
		await openMenu(root);
		await dse.waitForWrite(BASIC, () => dse.click(dse.control('negotiation.menu.reset')));
		await dse.waitFor(`document.querySelectorAll('.menu').length === 0`, 'the menu to close');
		await dse.settle();
		expect(patienceOf(await blockOf(BASIC))).toBe(3);
		expect(await focusState()).toMatchObject({ inCard: true, ctl: 'negotiation.menu', ring: true });
	});

	it('[NEGO-F07] a Reset made with the mouse while focus is on the page pulls no focus into the card', async () => {
		const root = await openNego(BASIC);
		await dse.waitForWrite(BASIC, () => dse.click(patienceSeal(root, 1)));
		await dse.page(`document.activeElement.blur()`);
		expect(await focusState()).toMatchObject({ inCard: false });
		await openMenu(root);
		await dse.waitForWrite(BASIC, () => dse.click(dse.control('negotiation.menu.reset')));
		await dse.waitFor(`document.querySelectorAll('.menu').length === 0`, 'the menu to close');
		await dse.settle();
		expect(patienceOf(await blockOf(BASIC))).toBe(3);
		expect(await focusState()).toMatchObject({ inCard: false, tag: 'BODY' });
	});

	// SC-642: Complete Argument disarms the very button that was pressed, and Chromium blurs a focused button the moment it is disabled, inside the
	// click dispatch (measured: 2-3 ms after the click; the save lands ~410 ms later; no rebuild is involved). Focus now goes to the FIRST USABLE control of the
	// Argument tab, where the next argument starts: the first Motivation chip (src/elements/negotiation/focusRules.ts).
	it('[NEGO-F02] Complete Argument pressed with Enter: focus stays inside the card, on the first appeal chip (the pressed button disarms itself)', async () => {
		const root = await openNego(BASIC);
		await dse.click(root.control('negotiation.tier.row', { nth: 3 }));
		const complete = root.control('negotiation.complete');
		await dse.tabTo(complete, TABS);
		await dse.waitForWrite(BASIC, () => dse.press('Enter', complete));
		await dse.settle();
		expect(interestOf(await blockOf(BASIC))).toBe(4);
		const f = await focusState();
		expect(f).toMatchObject({ inCard: true, ctl: 'negotiation.appeal.motivation' });
		expect(f.tag).not.toBe('BODY');
	});

	it('[NEGO-F03] after Complete Argument the next Tab continues inside the card: from the first appeal chip to the second', async () => {
		const root = await openNego(BASIC);
		await dse.click(root.control('negotiation.tier.row', { nth: 3 }));
		const complete = root.control('negotiation.complete');
		await dse.tabTo(complete, TABS);
		await dse.waitForWrite(BASIC, () => dse.press('Enter', complete));
		await dse.settle();
		expect(await onNthOfControl('negotiation.appeal.motivation')).toBe(0);
		await dse.press('Tab');
		expect(await focusState()).toMatchObject({ inCard: true, ctl: 'negotiation.appeal.motivation' });
		expect(await onNthOfControl('negotiation.appeal.motivation')).toBe(1);
	});

	it('[NEGO-F04] a Complete Argument made while focus is on the page pulls no focus into the card', async () => {
		const root = await openNego(BASIC);
		await dse.click(root.control('negotiation.tier.row', { nth: 3 }));
		await dse.page(`document.activeElement.blur()`);
		expect(await focusState()).toMatchObject({ inCard: false });
		// A scripted press: a pointer press does not move focus at all (the click shield cancels pointerdown / mousedown), so this stands for any press made while focus is outside the card.
		await dse.waitForWrite(BASIC, () => dse.page(`document.querySelector('.markdown-reading-view [data-dse-control="negotiation.complete"]').click()`));
		await dse.settle();
		expect(interestOf(await blockOf(BASIC))).toBe(4);
		expect(await focusState()).toMatchObject({ inCard: false, tag: 'BODY' });
	});
});
