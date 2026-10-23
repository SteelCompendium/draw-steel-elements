// SC-495 (found by the SC-465 survey): the kit stepper's "-" / "+" disable themselves at their bound. When
// the pressed button held focus, real Chromium dropped focus to <body> and the next Tab started at the top
// of the page. The stepper now hands focus to its own value node (the number field when editable).
//   basic.md  15/20 Stamina, 5 Temporary Stamina
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { openBarModal } from '../../driver/stamina';

const NOTE = 'Stamina/basic.md';

/** Does the focused element show its keyboard focus ring (:focus-visible)? */
const focusRing = (): Promise<boolean> => dse.page<boolean>(`document.activeElement?.matches(':focus-visible') === true`);
const focusedValue = (): Promise<string | null> =>
	dse.page<string | null>(`document.activeElement instanceof HTMLInputElement ? document.activeElement.value : null`);

describe('stamina-edit-modal: a stepper keeps keyboard focus when "-" / "+" disables itself (SC-495)', () => {
	it('[STAM-SF01] Temporary Stamina "-" pressed with Enter down to 0: focus moves to the number field (ring shown), the next Tab reaches "+", and Enter there changes nothing', async () => {
		const modal = await openBarModal(NOTE);
		const dec = modal.control('sedit.temp.dec');
		await dse.tabTo(dec, 16);
		for (let i = 0; i < 5; i++) await dse.press('Enter', dec); // 5 -> 0: the last press disables "-" while it holds focus
		await expect(dec).toBeDisabled();
		expect(await dse.focusedControl()).toBe('sedit.temp.input');
		expect(await focusedValue()).toBe('0');
		expect(await focusRing()).toBe(true); // a keyboard press keeps the keyboard ring on the new target
		// One more Enter must not walk the value back up (focus did not land on "+").
		await dse.press('Enter', modal.control('sedit.temp.input'));
		expect(await focusedValue()).toBe('0');
		expect(await dse.focusedControl()).toBe('sedit.temp.input');
		await dse.press('Tab');
		expect(await dse.focusedControl()).toBe('sedit.temp.inc'); // the opposite button is the next stop
		await dse.click(modal.control('modal.close'));
	});

	it('[STAM-SF02] Stamina "+" pressed with Enter up to max: focus moves to the number field instead of <body>, and Tab stays in the modal', async () => {
		const modal = await openBarModal(NOTE);
		const inc = modal.control('sedit.stamina.inc');
		await dse.tabTo(inc, 16);
		for (let i = 0; i < 5; i++) await dse.press('Enter', inc); // 15 -> 20
		await expect(inc).toBeDisabled();
		expect(await dse.focusedControl()).toBe('sedit.stamina.input');
		expect(await focusedValue()).toBe('20');
		expect(await focusRing()).toBe(true);
		await dse.press('Tab');
		expect(await dse.page<boolean>(`!!document.activeElement?.closest('.modal-container .dse-modal')`)).toBe(true);
		await dse.click(modal.control('modal.close'));
	});

	it('[STAM-SF03] a MOUSE press that takes Temporary Stamina to 0 also moves focus to the number field, with no ring', async () => {
		const modal = await openBarModal(NOTE);
		const dec = modal.control('sedit.temp.dec');
		for (let i = 0; i < 5; i++) await dse.click(dec);
		await expect(dec).toBeDisabled();
		expect(await dse.focusedControl()).toBe('sedit.temp.input');
		expect(await focusRing()).toBe(false);
		await dse.click(modal.control('modal.close'));
	});
});
