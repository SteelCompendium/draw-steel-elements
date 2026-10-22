// SC-465 (found by the SC-432 independent review, INFO-2; same shape as SC-428 M1, RECOV-R11): the
// modal's heal button (Spend Recovery with a pool, "Heal Recovery Value" without one) disables itself
// when the heal reaches max Stamina. If it held keyboard focus, real Chromium drops focus to <body> and
// the next Tab starts at the top of the page. The modal now hands focus to the NEXT enabled tab stop in
// the modal (Reset; Apply after it). Real keys throughout: Tab to the button, Enter to press it.
//   recoveries.md  12/30, 3 of 6 Recoveries (recovery value 10)
//   legacy-low.md  2/30, Recoveries not tracked (recovery value 10)
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { applyAmount, expectApplyLabel, openBarModal } from '../../driver/stamina';

const REC = 'Stamina/recoveries.md';
const FREE = 'Stamina/legacy-low.md';

/** Does the focused element show its keyboard focus ring (:focus-visible)? */
const focusRing = (): Promise<boolean> => dse.page<boolean>(`document.activeElement?.matches(':focus-visible') === true`);
/** Is focus on an enabled control inside the Stamina modal (never <body>, never outside it)? */
const focusIsLiveInModal = (): Promise<boolean> =>
	dse.page<boolean>(
		`(() => { const a = document.activeElement; return !!a && a !== document.body && a.disabled !== true && !!a.closest('.modal-container .dse-modal'); })()`,
	);

describe('stamina-edit-modal: focus stays in the modal when the heal button disables itself (SC-465)', () => {
	it('[STAM-Q14] a keyboard Spend Recovery that reaches max Stamina hands focus to Reset (ring shown), and Tab continues inside the modal', async () => {
		const modal = await openBarModal(REC); // 12/30, 3 Recoveries
		await applyAmount(modal, '8', 'sedit.healing'); // 20/30 pending: one Recovery's worth (10) reaches max
		const spend = modal.control('sedit.spend-recovery');
		await dse.tabTo(spend, 16);
		await dse.press('Enter', spend);
		await expectApplyLabel(modal, 'Gain 18 Stamina');
		await expect(spend).toBeDisabled(); // 30/30: nothing left to gain
		expect(await dse.focusedControl()).toBe('sedit.reset');
		expect(await focusIsLiveInModal()).toBe(true);
		expect(await focusRing()).toBe(true); // a keyboard heal keeps the keyboard ring on the new target
		await dse.press('Tab', modal.control('sedit.reset'));
		expect(await dse.focusedControl()).toBe('sedit.apply'); // the next Tab stays inside the modal
		await dse.click(modal.control('modal.close'));
	});

	it('[STAM-Q15] a keyboard Heal Recovery Value whose Confirm reaches max Stamina leaves focus on Reset (ring shown), and Tab continues inside the modal', async () => {
		const modal = await openBarModal(FREE); // 2/30, no pool
		await applyAmount(modal, '18', 'sedit.healing'); // 20/30 pending
		const heal = modal.control('sedit.spend-recovery');
		await dse.tabTo(heal, 16);
		await dse.press('Enter', heal); // the first press asks
		const dialog = await dse.modal('free-heal-confirm');
		const confirm = dialog.control('sedit.free-heal.confirm');
		await dse.tabTo(confirm);
		await dse.press('Enter', confirm);
		await expect(dialog.root).not.toBeExisting();
		await expectApplyLabel(modal, 'Gain 28 Stamina');
		await expect(heal).toBeDisabled();
		expect(await dse.focusedControl()).toBe('sedit.reset');
		expect(await focusIsLiveInModal()).toBe(true);
		expect(await focusRing()).toBe(true);
		await dse.press('Tab', modal.control('sedit.reset'));
		expect(await dse.focusedControl()).toBe('sedit.apply');
		await dse.click(modal.control('modal.close'));
	});

	it('[STAM-Q16] a MOUSE Spend Recovery that reaches max Stamina also moves focus to Reset, with no ring', async () => {
		const modal = await openBarModal(REC);
		await applyAmount(modal, '8', 'sedit.healing');
		const spend = modal.control('sedit.spend-recovery');
		await dse.click(spend);
		await expect(spend).toBeDisabled();
		expect(await dse.focusedControl()).toBe('sedit.reset');
		expect(await focusIsLiveInModal()).toBe(true);
		expect(await focusRing()).toBe(false); // a mouse press draws no keyboard ring (as the SC-428 marker row)
		await dse.click(modal.control('modal.close'));
	});
});
