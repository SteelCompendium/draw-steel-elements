// SC-438 [S]: the Set limits... window: the Success limit and Failure limit fields (pre-filled), Save and Cancel and every way out, by pointer
// and keyboard. Save floors at 0 and truncates (0 = "no limit set"); a limit below the tally ends the montage. Montage/mid.md: limits 4 / 3,
// 1 success and 1 failure, round 2. Montage/fresh.md: limits 3 / 2, nothing logged.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { blockOf, expectText, FRESH, MID, modalsOpen, openLimits, roundChip, trackTail, verdict } from '../../driver/montage';

const slots = (kind: string) =>
	dse.page<number>(`document.querySelectorAll('.markdown-reading-view [data-dse-element="montage"] .dse-mt__track[data-kind="${kind}"] .dse-mt__track-slot').length`);

describe('montage: the Set limits window', () => {
	it('[MONT-S01] typed limits and Save: one write stores them and the outcome tracks redraw with that many slots', async () => {
		const { modal } = await openLimits(MID);
		await expect(modal.control('montage.limits.success')).toHaveValue('4');
		await expect(modal.control('montage.limits.failure')).toHaveValue('3');
		await dse.type(modal.control('montage.limits.success'), '6', { replace: true });
		await dse.type(modal.control('montage.limits.failure'), '5', { replace: true });
		const w = await dse.waitForWrite(MID, () => dse.click(modal.control('montage.limits.save')));
		expect(w.count).toBe(1);
		await expect(modal.root).not.toBeExisting();
		const b = await blockOf(MID);
		expect([b.success_limit, b.failure_limit]).toEqual([6, 5]);
		expect([b.successes, b.failures]).toEqual([1, 1]); // limits never touch the tallies
		expect(await slots('success')).toBe(6);
		expect(await slots('failure')).toBe(5);
	});

	it('[MONT-S02] a negative value floors at 0 and a fraction is truncated; 0 reads "no limit set"', async () => {
		const { modal } = await openLimits(MID);
		await dse.type(modal.control('montage.limits.success'), '-3', { replace: true });
		await dse.type(modal.control('montage.limits.failure'), '2.9', { replace: true });
		await dse.waitForWrite(MID, () => dse.click(modal.control('montage.limits.save')));
		const b = await blockOf(MID);
		expect([b.success_limit, b.failure_limit]).toEqual([0, 2]);
		expect(await slots('success')).toBe(0);
		await expectText(trackTail(dse.block('ds-montage'), 'success'), 'no success limit set');
	});

	it('[MONT-S03] a success limit at or below the successes so far ends the montage as a total success: Complete, the done bar', async () => {
		const { root, modal } = await openLimits(MID);
		await dse.type(modal.control('montage.limits.success'), '1', { replace: true });
		await dse.waitForWrite(MID, () => dse.click(modal.control('montage.limits.save')));
		await dse.settle();
		expect((await blockOf(MID)).success_limit).toBe(1);
		await expectText(roundChip(root), 'Complete');
		await expectText(verdict(root), 'Total Success');
	});

	it('[MONT-S04] Cancel by click closes the window with typed values and writes nothing; Enter on the focused Cancel does the same', async () => {
		let { modal } = await openLimits(MID);
		await dse.type(modal.control('montage.limits.success'), '9', { replace: true });
		await dse.expectNoWrite(MID, () => dse.click(modal.control('montage.limits.cancel')));
		await expect(modal.root).not.toBeExisting();
		({ modal } = await openLimits(MID));
		const cancel = modal.control('montage.limits.cancel');
		await dse.tabTo(cancel, 8);
		await dse.expectNoWrite(MID, () => dse.press('Enter', cancel));
		await expect(modal.root).not.toBeExisting();
		expect((await blockOf(MID)).success_limit).toBe(4);
	});

	it('[MONT-S05] Escape aimed at the X (focus is in a field), the X and the backdrop each dismiss the window without saving', async () => {
		let { modal } = await openLimits(MID);
		await dse.type(modal.control('montage.limits.failure'), '9', { replace: true });
		await dse.expectNoWrite(MID, () => dse.press('Escape', dse.aimedAt('modal.close')));
		await expect(modal.root).not.toBeExisting();
		({ modal } = await openLimits(MID));
		await dse.expectNoWrite(MID, () => dse.click(modal.control('modal.close')));
		await expect(modal.root).not.toBeExisting();
		({ modal } = await openLimits(MID));
		await dse.expectNoWrite(MID, () => dse.click(modal.control('modal.backdrop'), { inset: 5 }));
		await expect(modal.root).not.toBeExisting();
		expect(await modalsOpen()).toBe(0);
		expect((await blockOf(MID)).failure_limit).toBe(3);
	});

	it('[MONT-S06] from the keyboard: change the success limit, Tab to Save and Enter saves it', async () => {
		const { modal } = await openLimits(MID);
		await dse.type(modal.control('montage.limits.success'), '7', { replace: true });
		const save = modal.control('montage.limits.save');
		await dse.tabTo(save, 8);
		const w = await dse.waitForWrite(MID, () => dse.press('Enter', save));
		expect(w.count).toBe(1);
		await expect(modal.root).not.toBeExisting();
		expect((await blockOf(MID)).success_limit).toBe(7);
	});

	it('[MONT-S07] Save with nothing changed rewrites nothing (the host skips identical bytes)', async () => {
		const { modal } = await openLimits(FRESH);
		await dse.expectNoWrite(FRESH, () => dse.click(modal.control('montage.limits.save')));
		await expect(modal.root).not.toBeExisting();
		expect((await blockOf(FRESH)).success_limit).toBe(3);
	});
});
