// SC-439 [L]: keyboard focus after a save in Live Preview. The controls' ids let the existing Live Preview focus carry (SC-602) hand focus back
// to the very seal or chip that was pressed, where an un-id'd card could only land it on the card's anchor. Reset and Complete Argument
// are checked here the way F01 / F02 check them in Reading view. Negotiation/basic.md: Interest 3 / Patience 3.
import { expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { BASIC, blockOf, focusAnywhere, interestOf, patienceOf } from '../../driver/negotiation';

const NEGO = 'ds-negotiation';

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

	knownBug('SC-642', '[NEGO-L02] Live Preview: Enter on Complete Argument leaves focus inside the card', async () => {
		await dse.openNote(BASIC, { mode: 'live-preview' });
		const root = dse.block(NEGO, 0);
		await dse.click(root.control('negotiation.tier.row', { nth: 3 }));
		const complete = root.control('negotiation.complete');
		await dse.focusByScript(complete);
		await dse.waitForWrite(BASIC, () => dse.press('Enter', complete));
		await dse.settle();
		expect(interestOf(await blockOf(BASIC))).toBe(4);
		const f = await focusAnywhere();
		expect(f).toMatchObject({ inNego: true });
		expect(f.tag).not.toBe('BODY');
	}, { failsWith: /inNego|BODY/ });

	knownBug('SC-639', '[NEGO-L03] Live Preview: Reset chosen from the keyboard leaves focus inside the card', async () => {
		await dse.openNote(BASIC, { mode: 'live-preview' });
		const root = dse.block(NEGO, 0);
		await dse.waitForWrite(BASIC, () => dse.click(root.control('negotiation.patience.seal', { nth: 1 })));
		const menu = root.control('negotiation.menu');
		await dse.focusByScript(menu);
		await dse.press('Enter', menu);
		await dse.waitFor(`document.querySelectorAll('.menu').length === 1`, 'the menu to open');
		await dse.press('ArrowDown');
		await dse.waitForWrite(BASIC, () => dse.press('Enter', dse.aimedAt('negotiation.menu.reset')));
		await dse.settle();
		await dse.waitFor(`document.querySelectorAll('.menu').length === 0`, 'the menu to close');
		expect(patienceOf(await blockOf(BASIC))).toBe(3);
		const f = await focusAnywhere();
		expect(f).toMatchObject({ inNego: true });
		expect(f.tag).not.toBe('BODY');
	}, { failsWith: /inNego|BODY/ });
});
