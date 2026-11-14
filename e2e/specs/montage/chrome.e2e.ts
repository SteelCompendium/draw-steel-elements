// SC-438 [C]: the montage's chrome panel items (a hover panel, hidden until the pointer is over the montage or focus is inside it): Add a round,
// Add a hero and Set limits... (open their modal), Reset progress. Each by pointer and by keyboard. Montage/fresh.md: Kira and Bram, nothing
// logged, round 1 of 3, limits 3 / 2. Montage/mid.md: round 2 with entries, a title and limits 4 / 3.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { blockOf, dismiss, expectText, FRESH, MID, MONTAGE, modalsOpen, roundChip, TABS, verdict } from '../../driver/montage';

describe('montage: the chrome panel items', () => {
	it('[MONT-C01] Add a round by click: one write, rounds 3 to 4, a fourth round column, the round in play unchanged', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		await dse.hover(root.root);
		const w = await dse.waitForWrite(FRESH, () => dse.click(root.control('montage.chrome.add-round')));
		expect(w.count).toBe(1);
		const b = await blockOf(FRESH);
		expect([b.rounds, b.current_round]).toEqual([4, 1]);
		await expectText(roundChip(root), 'Round 1 / 4');
		await expect(root.control({ css: '.dse-mt__board-rhead[data-round="4"]' })).toBeExisting();
	});

	it('[MONT-C02] Add a round from the keyboard: Enter on the focused item adds the round', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		const item = root.control('montage.chrome.add-round');
		await dse.tabTo(item, TABS);
		const w = await dse.waitForWrite(FRESH, () => dse.press('Enter', item));
		expect(w.count).toBe(1);
		expect((await blockOf(FRESH)).rounds).toBe(4);
		await expectText(roundChip(root), 'Round 1 / 4');
	});

	it('[MONT-C03] Add a hero by click and by Enter opens the Add a hero window and writes nothing', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		await dse.hover(root.root);
		await dse.expectNoWrite(FRESH, () => dse.click(root.control('montage.chrome.add-hero')));
		let modal = await dse.modal('montage-add-hero');
		await expect(modal.control({ css: '.dse-modal__title-text' })).toHaveElementProperty('textContent', 'Add a hero');
		await dismiss(modal);
		const item = root.control('montage.chrome.add-hero');
		await dse.tabTo(item, TABS);
		await dse.expectNoWrite(FRESH, () => dse.press('Enter', item));
		modal = await dse.modal('montage-add-hero');
		await dismiss(modal);
		expect(await modalsOpen()).toBe(0);
	});

	it('[MONT-C04] Set limits... by click and by Enter opens the window pre-filled with the current limits and writes nothing', async () => {
		await dse.openNote(MID);
		const root = dse.block(MONTAGE);
		await dse.hover(root.root);
		await dse.expectNoWrite(MID, () => dse.click(root.control('montage.chrome.set-limits')));
		let modal = await dse.modal('montage-limits');
		await expect(modal.control('montage.limits.success')).toHaveValue('4');
		await expect(modal.control('montage.limits.failure')).toHaveValue('3');
		await dismiss(modal);
		const item = root.control('montage.chrome.set-limits');
		await dse.tabTo(item, TABS);
		await dse.expectNoWrite(MID, () => dse.press('Enter', item));
		modal = await dse.modal('montage-limits');
		await dismiss(modal);
	});

	it('[MONT-C05] Reset progress by click: one write that clears the tallies, entries, round and skills and keeps the title, limits, rounds and roster', async () => {
		await dse.openNote(MID);
		const root = dse.block(MONTAGE);
		await dse.hover(root.root);
		const w = await dse.waitForWrite(MID, () => dse.click(root.control('montage.chrome.reset-progress')));
		expect(w.count).toBe(1);
		const b = await blockOf(MID);
		expect(b).toMatchObject({ title: 'Cross the Ashfall', rounds: 3, success_limit: 4, failure_limit: 3, successes: 0, failures: 0, current_round: 1 });
		expect(b.entries).toBeUndefined();
		expect(b.participants!.map((p) => p.name)).toEqual(['Kira', 'Bram', 'Osric', 'Yenna']);
		expect(b.participants![0].skills_used).toEqual([]);
		await expectText(verdict(root), 'Not started');
		await expectText(roundChip(root), 'Round 1 / 3');
	});

	it('[MONT-C06] Reset progress from the keyboard: Enter on the focused item resets, in one write', async () => {
		await dse.openNote(MID);
		const root = dse.block(MONTAGE);
		const item = root.control('montage.chrome.reset-progress');
		await dse.tabTo(item, TABS);
		const w = await dse.waitForWrite(MID, () => dse.press('Enter', item));
		expect(w.count).toBe(1);
		expect((await blockOf(MID)).entries).toBeUndefined();
		await expectText(roundChip(root), 'Round 1 / 3');
	});
});
