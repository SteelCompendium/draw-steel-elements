// SC-439 [P] [I]: the Patience seals (0..5 across) and the Interest rows (5..0 down). The click-from-every-start and every-key
// tables are in the jsdom matrix; here a real pointer and real keys drive each control and the note + screen are read.
// Negotiation/basic.md: Interest 3 / Patience 3 (neither `current_*` is in the note until a change writes it). Interest 5 is a deal,
// Interest 0 is hostile, spent Patience is a final offer: the band says so.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { BASIC, blockOf, focusState, interestOf, interestSeal, openNego, patienceOf, patienceSeal, shown, TABS } from '../../driver/negotiation';

describe('negotiation: the Patience track', () => {
	it('[NEGO-P01] a click on a seal sets Patience: the screen follows at once and the note holds the value; the checked seal does nothing', async () => {
		const root = await openNego(BASIC);
		expect((await shown()).patience).toEqual([3]);
		await dse.waitForWrite(BASIC, () => dse.click(patienceSeal(root, 1)));
		expect(await shown()).toMatchObject({ patience: [1], readout: '1', ended: null });
		expect((await blockOf(BASIC)).current_patience).toBe(1);
		await dse.waitForWrite(BASIC, () => dse.click(patienceSeal(root, 5)));
		expect(await shown()).toMatchObject({ patience: [5], readout: '5' });
		expect((await blockOf(BASIC)).current_patience).toBe(5);
		await dse.expectNoWrite(BASIC, () => dse.click(patienceSeal(root, 5)));
		expect((await blockOf(BASIC)).current_interest).toBeUndefined(); // Interest was never touched, so the note never gained it
	});

	it('[NEGO-P02] all six keys on the track move it (selection follows focus, one write each, focus stays on the seal)', async () => {
		const root = await openNego(BASIC);
		const group = root.control('negotiation.patience');
		await dse.tabTo(patienceSeal(root, 3), TABS);
		const steps: Array<[string, number]> = [['ArrowRight', 4], ['ArrowLeft', 3], ['ArrowDown', 4], ['ArrowUp', 3], ['Home', 0], ['End', 5]];
		for (const [key, value] of steps) {
			await dse.waitForWrite(BASIC, () => dse.press(key, group));
			expect((await shown()).patience).toEqual([value]);
			expect(patienceOf(await blockOf(BASIC))).toBe(value);
			const f = await focusState();
			expect([f.ctl, f.inCard]).toEqual(['negotiation.patience.seal', true]);
		}
	});

	it('[NEGO-P03] spending the last Patience ends the negotiation with a "Final offer" at the current Interest, and raising it again reopens it', async () => {
		const root = await openNego(BASIC);
		await dse.waitForWrite(BASIC, () => dse.click(patienceSeal(root, 0)));
		expect(await shown()).toMatchObject({ patience: [0], ended: 'final', band: 'Final offer', completeDisabled: true });
		await expect(root.control({ css: '.dse-nt__end-text' })).toHaveText(expect.stringContaining('final offer at Interest 3: Remembers the taste of unripe strawberries'));
		expect((await blockOf(BASIC)).current_patience).toBe(0);
		await dse.waitForWrite(BASIC, () => dse.click(patienceSeal(root, 2)));
		expect(await shown()).toMatchObject({ patience: [2], ended: null, band: null });
		expect((await blockOf(BASIC)).current_patience).toBe(2);
	});
});

describe('negotiation: the Interest track', () => {
	it('[NEGO-I01] a click on a row sets Interest: the "now" tag moves with it and the note holds the value', async () => {
		const root = await openNego(BASIC);
		expect((await shown()).interest).toEqual([3]);
		await dse.waitForWrite(BASIC, () => dse.click(interestSeal(root, 4)));
		expect((await shown()).interest).toEqual([4]);
		await expect(interestSeal(root, 4).$('.dse-nt__now')).toBeExisting();
		await expect(interestSeal(root, 3).$('.dse-nt__now')).not.toBeExisting();
		expect((await blockOf(BASIC)).current_interest).toBe(4);
		await dse.waitForWrite(BASIC, () => dse.click(interestSeal(root, 1)));
		expect((await shown()).interest).toEqual([1]);
		expect((await blockOf(BASIC)).current_interest).toBe(1);
		await dse.expectNoWrite(BASIC, () => dse.click(interestSeal(root, 1)));
		expect((await blockOf(BASIC)).current_patience).toBeUndefined();
	});

	it('[NEGO-I02] all six keys on the rows move it: Down / Right go to the LOWER row, Up / Left to the higher, Home is 5 and End is 0', async () => {
		const root = await openNego(BASIC);
		const group = root.control('negotiation.interest');
		await dse.tabTo(interestSeal(root, 3), TABS);
		const steps: Array<[string, number]> = [['ArrowDown', 2], ['ArrowUp', 3], ['ArrowRight', 2], ['ArrowLeft', 3], ['End', 0], ['Home', 5]];
		for (const [key, value] of steps) {
			await dse.waitForWrite(BASIC, () => dse.press(key, group));
			expect((await shown()).interest).toEqual([value]);
			expect(interestOf(await blockOf(BASIC))).toBe(value);
			const f = await focusState();
			expect([f.ctl, f.inCard]).toEqual(['negotiation.interest.seal', true]);
		}
	});

	it('[NEGO-I03] Interest 5 is a deal and Interest 0 is hostile: each states it in a band with the authored words, and moving off the end removes it', async () => {
		const root = await openNego(BASIC);
		await dse.waitForWrite(BASIC, () => dse.click(interestSeal(root, 5)));
		expect(await shown()).toMatchObject({ interest: [5], ended: 'deal', band: 'Negotiation over' });
		await expect(root.control({ css: '.dse-nt__end-text' })).toHaveText('Interest reached 5 — the NPC agrees: Remembers the taste of strawberries and cream!');
		await dse.waitForWrite(BASIC, () => dse.click(interestSeal(root, 0)));
		expect(await shown()).toMatchObject({ interest: [0], ended: 'hostile', band: 'Negotiation over' });
		await expect(root.control({ css: '.dse-nt__end-text' })).toHaveText("Interest fell to 0 — the NPC ends it: Thinks you're after the ring; becomes hostile");
		await dse.waitForWrite(BASIC, () => dse.click(interestSeal(root, 3)));
		expect(await shown()).toMatchObject({ interest: [3], ended: null, band: null });
		const b = await blockOf(BASIC);
		expect(b.current_interest ?? b.initial_interest).toBe(3); // back at the initial value: the note may drop the key it never declared
	});
});
