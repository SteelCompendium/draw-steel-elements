// SC-438 [L]: the Log an action sheet in full: the three Result chips, the Skill field and its reuse warning, the Note, Log / Save, Remove,
// Cancel, and every way out (Cancel, Escape from a field and aimed at the X, the X, the backdrop), with the keyboard. What each result x skill x
// note combination writes is in the jsdom matrix (test/dom/elements/montage-matrix.test.ts).
// Montage/mid.md: round 2 in play, Kira (skill Nature), Bram (failure with Endurance and a note), Osric (an assist), Yenna (no entry); limits 4 / 3.
// Montage/fresh.md: nothing logged. Montage/hand-written.md: Bram's round-1 entry holds an unrecognised result.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { blockOf, cellOf, expectText, FRESH, HAND, MID, modalsOpen, MONTAGE, roundChip } from '../../driver/montage';

type Modal = Awaited<ReturnType<typeof dse.modal>>;
const pressed = (modal: Modal, kind: string) => modal.control(`montage.log.result.${kind}`);
const title = (modal: Modal) => modal.control({ css: '.dse-modal__title-text' });

/** Open the NEW sheet for Kira's open socket (round 1 of Montage/fresh.md) from the bar. */
async function openNewFresh(): Promise<{ root: ReturnType<typeof dse.block>; modal: Modal }> {
	await dse.openNote(FRESH);
	const root = dse.block(MONTAGE);
	await dse.click(root.control('montage.bar.log'));
	return { root, modal: await dse.modal('montage-log') };
}

describe('montage: the Log an action sheet', () => {
	it('[MONT-L01] a new sheet starts on Success; Failure, then a skill and a note, then Log writes one entry, tallies the failure and lists the skill', async () => {
		const { root, modal } = await openNewFresh();
		await expect(title(modal)).toHaveElementProperty('textContent', 'Kira · round 1');
		await expect(pressed(modal, 'success')).toHaveAttribute('aria-pressed', 'true');
		await dse.click(pressed(modal, 'failure'));
		await expect(pressed(modal, 'failure')).toHaveAttribute('aria-pressed', 'true');
		await expect(pressed(modal, 'success')).toHaveAttribute('aria-pressed', 'false');
		await dse.type(modal.control('montage.log.skill'), 'Nature');
		await dse.type(modal.control('montage.log.note'), 'Slipped on the scree.');
		const w = await dse.waitForWrite(FRESH, () => dse.click(modal.control('montage.log.submit')));
		expect(w.count).toBe(1);
		await expect(modal.root).not.toBeExisting();
		const b = await blockOf(FRESH);
		expect(b.entries).toEqual([{ hero: 'Kira', round: 1, result: 'failure', skill: 'Nature', note: 'Slipped on the scree.' }]);
		expect([b.successes, b.failures]).toEqual([0, 1]);
		expect(b.participants![0].skills_used).toEqual(['Nature']);
		await expect(cellOf(root, 'Kira', 1)).toHaveAttribute('data-kind', 'failure');
		await expect(cellOf(root, 'Kira', 1)).toHaveAttribute('data-noted', 'on');
	});

	it('[MONT-L02] the Assist chip logs an assist: an entry, no success and no failure counted', async () => {
		const { modal } = await openNewFresh();
		await dse.click(pressed(modal, 'assist'));
		await expect(pressed(modal, 'assist')).toHaveAttribute('aria-pressed', 'true');
		await dse.waitForWrite(FRESH, () => dse.click(modal.control('montage.log.submit')));
		const b = await blockOf(FRESH);
		expect(b.entries).toEqual([{ hero: 'Kira', round: 1, result: 'assist' }]);
		expect([b.successes, b.failures]).toEqual([0, 0]);
	});

	it('[MONT-L03] the Success chip pressed again after another one wins: Failure, then Success, logs a success', async () => {
		const { modal } = await openNewFresh();
		await dse.click(pressed(modal, 'failure'));
		await dse.click(pressed(modal, 'success'));
		await expect(pressed(modal, 'success')).toHaveAttribute('aria-pressed', 'true');
		await dse.waitForWrite(FRESH, () => dse.click(modal.control('montage.log.submit')));
		const b = await blockOf(FRESH);
		expect(b.entries).toEqual([{ hero: 'Kira', round: 1, result: 'success' }]);
		expect([b.successes, b.failures]).toEqual([1, 0]);
	});

	it('[MONT-L04] typing a skill the hero already used shows the reuse warning and leaves Log enabled; logging it anyway lists it twice', async () => {
		await dse.openNote(MID);
		const root = dse.block(MONTAGE);
		await dse.click(root.control('montage.board.row-act', { nth: 0 })); // Kira, round 2
		const modal = await dse.modal('montage-log');
		const warn = modal.control({ css: '.dse-mt__sheet-warn' });
		await expect(warn).not.toBeDisplayed();
		await dse.type(modal.control('montage.log.skill'), 'Nature');
		await expect(warn).toBeDisplayed();
		await expect(warn).toHaveElementProperty('textContent', 'Kira already used Nature in this montage — reuse is not allowed');
		await expect(modal.control('montage.log.submit')).toBeEnabled();
		await dse.waitForWrite(MID, () => dse.click(modal.control('montage.log.submit')));
		expect((await blockOf(MID)).participants![0].skills_used).toEqual(['Nature', 'Nature']);
	});

	it('[MONT-L05] editing an entry: the sheet is pre-filled, Success replaces Failure, Save writes one correction and moves both tallies', async () => {
		await dse.openNote(MID);
		const root = dse.block(MONTAGE);
		await dse.click(root.control('montage.cell', { nth: 1 })); // Bram round 1: a failure with Endurance
		const modal = await dse.modal('montage-log');
		await expect(modal.control('montage.log.submit')).toHaveAttribute('aria-label', 'Save');
		await dse.click(pressed(modal, 'success'));
		const w = await dse.waitForWrite(MID, () => dse.click(modal.control('montage.log.submit')));
		expect(w.count).toBe(1);
		const b = await blockOf(MID);
		expect(b.entries![1]).toEqual({ hero: 'Bram', round: 1, result: 'success', skill: 'Endurance', note: 'Dropped the water cask.' });
		expect([b.successes, b.failures]).toEqual([2, 0]);
		await expect(cellOf(root, 'Bram', 1)).toHaveAttribute('data-kind', 'success');
	});

	it('[MONT-L06] Remove (edit sheets only) deletes the entry, gives back its tally and skill, and closes the sheet: one write', async () => {
		await dse.openNote(MID);
		const root = dse.block(MONTAGE);
		await dse.click(root.control('montage.cell', { nth: 1 }));
		const modal = await dse.modal('montage-log');
		const w = await dse.waitForWrite(MID, () => dse.click(modal.control('montage.log.remove')));
		expect(w.count).toBe(1);
		await expect(modal.root).not.toBeExisting();
		const b = await blockOf(MID);
		expect(b.entries!.map((e) => e.hero)).toEqual(['Kira', 'Osric']);
		expect([b.successes, b.failures]).toEqual([1, 0]);
		expect(b.participants![1].skills_used).toEqual([]);
		await expect(cellOf(root, 'Bram', 1)).toHaveAttribute('data-kind', 'none');
	});

	it('[MONT-L07] Cancel by click closes a sheet with typed data and writes nothing; Enter on the focused Cancel does the same', async () => {
		let { modal } = await openNewFresh();
		await dse.click(pressed(modal, 'failure'));
		await dse.type(modal.control('montage.log.skill'), 'Insight');
		await dse.expectNoWrite(FRESH, () => dse.click(modal.control('montage.log.cancel')));
		await expect(modal.root).not.toBeExisting();
		({ modal } = await openNewFresh());
		const cancel = modal.control('montage.log.cancel');
		await dse.tabTo(cancel, 12);
		await dse.expectNoWrite(FRESH, () => dse.press('Enter', cancel));
		await expect(modal.root).not.toBeExisting();
		expect((await blockOf(FRESH)).entries).toBeUndefined();
	});

	it('[MONT-L08] Escape typed in the Note field closes the sheet and drops the draft; Escape aimed at the X, the X and the backdrop do the same, none writes', async () => {
		let { modal } = await openNewFresh();
		const note = modal.control('montage.log.note');
		await dse.type(note, 'a long consequence');
		await dse.expectNoWrite(FRESH, () => dse.press('Escape', note));
		await expect(modal.root).not.toBeExisting();
		({ modal } = await openNewFresh());
		await dse.expectNoWrite(FRESH, () => dse.press('Escape', dse.aimedAt('modal.close')));
		await expect(modal.root).not.toBeExisting();
		({ modal } = await openNewFresh());
		await dse.expectNoWrite(FRESH, () => dse.click(modal.control('modal.close')));
		await expect(modal.root).not.toBeExisting();
		({ modal } = await openNewFresh());
		await dse.expectNoWrite(FRESH, () => dse.click(modal.control('modal.backdrop'), { inset: 5 }));
		await expect(modal.root).not.toBeExisting();
		expect(await modalsOpen()).toBe(0);
	});

	it('[MONT-L09] an entry whose result is unrecognised opens with no chip pressed and Save disabled (a click does nothing); a chip enables it', async () => {
		await dse.openNote(HAND);
		const root = dse.block(MONTAGE);
		await dse.click(root.control('montage.cell', { nth: 1 })); // Bram round 1: result "dodged"
		const modal = await dse.modal('montage-log');
		for (const kind of ['success', 'failure', 'assist']) await expect(pressed(modal, kind)).toHaveAttribute('aria-pressed', 'false');
		await expect(modal.control('montage.log.submit')).toBeDisabled();
		await dse.expectNoWrite(HAND, () => dse.click(modal.control('montage.log.submit')));
		await expect(modal.root).toBeExisting();
		await dse.click(pressed(modal, 'assist'));
		await expect(modal.control('montage.log.submit')).toBeEnabled();
		await dse.waitForWrite(HAND, () => dse.click(modal.control('montage.log.submit')));
		expect((await blockOf(HAND)).entries![1]).toEqual({ hero: 'Bram', round: 1, result: 'assist' });
	});

	it('[MONT-L10] from the keyboard: Tab to Log and Enter writes the entry (the sheet starts with its first control focused)', async () => {
		const { modal } = await openNewFresh();
		const submit = modal.control('montage.log.submit');
		await dse.tabTo(submit, 12);
		const w = await dse.waitForWrite(FRESH, () => dse.press('Enter', submit));
		expect(w.count).toBe(1);
		await expect(modal.root).not.toBeExisting();
		expect((await blockOf(FRESH)).entries).toEqual([{ hero: 'Kira', round: 1, result: 'success' }]);
	});

	it('[MONT-L11] a reused sheet reads the round it was opened for: Yenna round 1 is already played, and logging it fills that cell, not the round in play', async () => {
		await dse.openNote(MID);
		const root = dse.block(MONTAGE);
		await dse.click(root.control('montage.cell', { nth: 3 })); // Yenna round 1
		const modal = await dse.modal('montage-log');
		await dse.waitForWrite(MID, () => dse.click(modal.control('montage.log.submit')));
		const b = await blockOf(MID);
		expect(b.entries![3]).toEqual({ hero: 'Yenna', round: 1, result: 'success' });
		expect(b.current_round).toBe(2);
		await expect(cellOf(root, 'Yenna', 1)).toHaveAttribute('data-kind', 'success');
		await expectText(roundChip(root), 'Round 2 / 3');
	});
});
