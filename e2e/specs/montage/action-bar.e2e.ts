// SC-438 [R]: the bottom action bar. Live: Log an action... / Undo / Back to round N / End round N. Complete: Undo / Back to round N / Reopen /
// Clear all. Each button by pointer, the disabled ones by a real click that must do nothing. Montage/fresh.md: round 1 of 3, nothing logged.
// Montage/mid.md: round 2. Montage/acted.md: both heroes acted in round 1. Montage/brink.md: 2 of 3 successes, round 2, Bram has not acted.
// Montage/done.md: Total Success. Montage/exhausted.md: out of rounds, Partial Success.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { ACTED, barIds, blockOf, BRINK, cellOf, DONE, dismiss, EXHAUSTED, expectText, FRESH, MID, MONTAGE, modalsOpen, roundChip, TABS, trackTail, verdict } from '../../driver/montage';

describe('montage: the action bar', () => {
	it('[MONT-R01] Log an action... opens the NEW sheet for the first hero yet to act, and only that hero', async () => {
		await dse.openNote(BRINK);
		const root = dse.block(MONTAGE);
		await dse.expectNoWrite(BRINK, () => dse.click(root.control('montage.bar.log')));
		const modal = await dse.modal('montage-log');
		await expect(modal.control({ css: '.dse-modal__title-text' })).toHaveElementProperty('textContent', 'Bram · round 2'); // Kira has acted in round 2
		await dismiss(modal);
	});

	it('[MONT-R02] Log an action... is disabled once every hero has acted in the round in play: a click opens nothing and writes nothing', async () => {
		await dse.openNote(ACTED);
		const root = dse.block(MONTAGE);
		await expect(root.control('montage.bar.log')).toBeDisabled();
		await dse.expectNoWrite(ACTED, () => dse.click(root.control('montage.bar.log')));
		expect(await modalsOpen()).toBe(0);
	});

	it('[MONT-R03] Undo removes the LAST entry: its success is given back, its skill leaves the hero, one write', async () => {
		await dse.openNote(BRINK);
		const root = dse.block(MONTAGE);
		const w = await dse.waitForWrite(BRINK, () => dse.click(root.control('montage.bar.undo')));
		expect(w.count).toBe(1);
		const b = await blockOf(BRINK);
		expect(b.entries!.map((e) => `${e.hero}${e.round}`)).toEqual(['Kira1', 'Bram1']);
		expect([b.successes, b.failures]).toEqual([1, 0]);
		expect(b.participants![0].skills_used).toEqual(['Nature']);
		await expect(cellOf(root, 'Kira', 2)).toHaveAttribute('data-kind', 'none');
		await expectText(trackTail(root, 'success'), '2 from Total Success');
	});

	it('[MONT-R04] Undo is disabled with nothing logged: a click does nothing', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		await expect(root.control('montage.bar.undo')).toBeDisabled();
		await dse.expectNoWrite(FRESH, () => dse.click(root.control('montage.bar.undo')));
	});

	it('[MONT-R05] Back to round N moves the round in play back one and touches no entry', async () => {
		await dse.openNote(MID);
		const root = dse.block(MONTAGE);
		await expect(root.control('montage.bar.back')).toHaveAttribute('aria-label', 'Back to round 1');
		const w = await dse.waitForWrite(MID, () => dse.click(root.control('montage.bar.back')));
		expect(w.count).toBe(1);
		const b = await blockOf(MID);
		expect(b.current_round).toBe(1);
		expect(b.entries).toHaveLength(3);
		await expectText(roundChip(root), 'Round 1 / 3');
		await expect(root.control('montage.bar.back')).not.toBeExisting(); // round 1: nothing to go back to
	});

	it('[MONT-R06] End round N ends the round in play: round 2 of 3, and the bar then offers Back to round 1', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		await expect(root.control('montage.bar.end-round')).toHaveAttribute('aria-label', 'End round 1');
		const w = await dse.waitForWrite(FRESH, () => dse.click(root.control('montage.bar.end-round')));
		expect(w.count).toBe(1);
		expect((await blockOf(FRESH)).current_round).toBe(2);
		await expectText(roundChip(root), 'Round 2 / 3');
		await expect(root.control('montage.bar.end-round')).toHaveAttribute('aria-label', 'End round 2');
		await expect(root.control('montage.bar.back')).toBeExisting();
	});

	it('[MONT-R07] logging the winning success completes the montage: the bar becomes Undo and Clear all, the head says Complete and the band Total Success', async () => {
		await dse.openNote(BRINK);
		const root = dse.block(MONTAGE);
		await dse.waitForWrite(BRINK, () => dse.click(root.control('montage.quick.success', { nth: 0 }))); // Bram, round 2: the third success
		await dse.settle();
		const b = await blockOf(BRINK);
		expect([b.successes, b.failures]).toEqual([3, 0]);
		await expectText(roundChip(root), 'Complete');
		await expectText(verdict(root), 'Total Success');
		expect(await barIds()).toEqual(['montage.bar.undo', 'montage.bar.clear-all']);
	});

	it('[MONT-R08] Reopen on a montage that ran out of rounds adds one round and puts the play on it', async () => {
		await dse.openNote(EXHAUSTED);
		const root = dse.block(MONTAGE);
		expect(await barIds()).toEqual(['montage.bar.undo', 'montage.bar.back', 'montage.bar.reopen', 'montage.bar.clear-all']);
		await expect(root.control('montage.bar.back')).toHaveAttribute('aria-label', 'Back to round 2');
		const w = await dse.waitForWrite(EXHAUSTED, () => dse.click(root.control('montage.bar.reopen')));
		expect(w.count).toBe(1);
		const b = await blockOf(EXHAUSTED);
		expect([b.rounds, b.current_round]).toEqual([3, 3]);
		await expectText(roundChip(root), 'Round 3 / 3');
		await expect(root.control('montage.bar.reopen')).not.toBeExisting();
		await expect(root.control('montage.cell.socket', { nth: 0 })).toBeExisting(); // round 3 is open for Kira
	});

	it('[MONT-R09] Clear all on a complete montage zeroes the progress and keeps the title, limits, rounds and roster', async () => {
		await dse.openNote(DONE);
		const root = dse.block(MONTAGE);
		const w = await dse.waitForWrite(DONE, () => dse.click(root.control('montage.bar.clear-all')));
		expect(w.count).toBe(1);
		const b = await blockOf(DONE);
		expect(b).toMatchObject({ title: 'Reach the Gate', rounds: 3, success_limit: 2, failure_limit: 2, successes: 0, failures: 0, current_round: 1 });
		expect(b.entries).toBeUndefined();
		expect(b.participants!.map((p) => p.name)).toEqual(['Kira', 'Bram']);
		expect(b.participants!.map((p) => p.skills_used)).toEqual([[], []]);
		await expectText(verdict(root), 'Not started');
		expect(await barIds()).toEqual(['montage.bar.log', 'montage.bar.undo', 'montage.bar.end-round']);
	});

	it('[MONT-R10] Enter on the focused End round ends the round in play: one write, round 2 of 3', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		const end = root.control('montage.bar.end-round');
		await dse.tabTo(end, TABS);
		const w = await dse.waitForWrite(FRESH, () => dse.press('Enter', end));
		expect(w.count).toBe(1);
		expect((await blockOf(FRESH)).current_round).toBe(2);
		await expectText(roundChip(root), 'Round 2 / 3');
	});

	it('[MONT-R11] Enter on the focused Log an action... opens the NEW sheet for the first hero yet to act and writes nothing', async () => {
		await dse.openNote(BRINK);
		const root = dse.block(MONTAGE);
		const log = root.control('montage.bar.log');
		await dse.tabTo(log, TABS);
		await dse.expectNoWrite(BRINK, () => dse.press('Enter', log));
		const modal = await dse.modal('montage-log');
		await expect(modal.control({ css: '.dse-modal__title-text' })).toHaveElementProperty('textContent', 'Bram · round 2');
		await dismiss(modal);
	});
});
