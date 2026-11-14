// SC-439 [M]: the Spent chip on each Motivations card. The spent / unspent x argument-in-progress table is in the jsdom matrix; here a
// real click and a real Enter drive the chip and the note + screen are read. Negotiation/basic.md: Higher Authority and Peace, both
// unspent. Negotiation/spent.md: Higher Authority already spent.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { BASIC, blockOf, dossier, focusState, openNego, pressedOf, SPENT, TABS } from '../../driver/negotiation';

describe('negotiation: the Spent chip on the Motivations cards', () => {
	it('[NEGO-M01] a click marks a motivation spent (and a second one unspent): the card, the argument tab chip and the note agree', async () => {
		const root = await openNego(BASIC);
		expect(await dossier()).toMatchObject({ count: '2 of 2 open', spent: [false, false], chips: ['Mark spent', 'Mark spent'] });
		await dse.waitForWrite(BASIC, () => dse.click(root.control('negotiation.spent', { nth: 0 })));
		expect(await dossier()).toMatchObject({ count: '1 of 2 open', spent: [true, false], chips: ['Spent', 'Mark spent'] });
		expect(await pressedOf('negotiation.spent')).toEqual(['true', 'false']);
		await expect(root.control('negotiation.appeal.motivation', { nth: 0 })).toHaveText(expect.stringContaining('spent')); // the appeal chip says so too
		expect((await blockOf(BASIC)).motivations).toMatchObject([{ name: 'Higher Authority', hasBeenAppealedTo: true }, { name: 'Peace' }]);
		await dse.waitForWrite(BASIC, () => dse.click(root.control('negotiation.spent', { nth: 0 })));
		expect(await dossier()).toMatchObject({ count: '2 of 2 open', spent: [false, false] });
		expect((await blockOf(BASIC)).motivations![0].hasBeenAppealedTo ?? false).toBe(false);
	});

	it('[NEGO-M02] Enter on a focused Spent chip spends that motivation (focus stays on the chip); on a spent one it un-spends it', async () => {
		const root = await openNego(SPENT);
		expect((await dossier()).spent).toEqual([true, false]);
		const peace = root.control('negotiation.spent', { nth: 1 });
		await dse.tabTo(peace, TABS);
		await dse.waitForWrite(SPENT, () => dse.press('Enter', peace));
		expect(await dossier()).toMatchObject({ count: '0 of 2 open', spent: [true, true] });
		expect((await blockOf(SPENT)).motivations).toMatchObject([{ hasBeenAppealedTo: true }, { name: 'Peace', hasBeenAppealedTo: true }]);
		const f = await focusState();
		expect([f.ctl, f.inCard]).toEqual(['negotiation.spent', true]);
		await dse.waitForWrite(SPENT, () => dse.press('Enter', peace));
		expect((await dossier()).spent).toEqual([true, false]);
		expect((await blockOf(SPENT)).motivations![1].hasBeenAppealedTo ?? false).toBe(false);
	});
});
