// SC-439 [F]: keyboard focus after the negotiation saves. Seal, chip and Spent writes repaint in place (focus stays: asserted in the
// scenarios that press them); Reset rebuilds the whole card, and Complete Argument disarms the very button that was pressed. A keyboard
// user should still have focus inside the card afterwards, not on the page.
// Negotiation/basic.md: Interest 3 / Patience 3.
import { expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { BASIC, blockOf, focusState, interestOf, openNego, patienceOf, patienceSeal, TABS } from '../../driver/negotiation';

describe('negotiation: keyboard focus after a save', () => {
	knownBug('SC-639', '[NEGO-F01] Reset chosen from the keyboard (Enter on the options button, then Down and Enter in the menu): focus lands inside the card, not on the page', async () => {
		const root = await openNego(BASIC);
		await dse.waitForWrite(BASIC, () => dse.click(patienceSeal(root, 1)));
		const menu = root.control('negotiation.menu');
		await dse.tabTo(menu, TABS);
		await dse.press('Enter', menu);
		await dse.waitFor(`document.querySelectorAll('.menu').length === 1`, 'the menu to open');
		await dse.press('ArrowDown');
		await dse.waitForWrite(BASIC, () => dse.press('Enter'));
		await dse.settle();
		await dse.waitFor(`document.querySelectorAll('.menu').length === 0`, 'the menu to close');
		expect(patienceOf(await blockOf(BASIC))).toBe(3);
		const f = await focusState();
		expect(f).toMatchObject({ inCard: true });
		expect(f.tag).not.toBe('BODY');
	}, { failsWith: /BODY|inCard/ });

	knownBug('SC-642', '[NEGO-F02] Complete Argument pressed with Enter: focus stays inside the card (the pressed button disarms itself)', async () => {
		const root = await openNego(BASIC);
		await dse.click(root.control('negotiation.tier.row', { nth: 3 }));
		const complete = root.control('negotiation.complete');
		await dse.tabTo(complete, TABS);
		await dse.waitForWrite(BASIC, () => dse.press('Enter', complete));
		await dse.settle();
		expect(interestOf(await blockOf(BASIC))).toBe(4);
		const f = await focusState();
		expect(f).toMatchObject({ inCard: true });
		expect(f.tag).not.toBe('BODY');
	}, { failsWith: /BODY|inCard/ });
});
