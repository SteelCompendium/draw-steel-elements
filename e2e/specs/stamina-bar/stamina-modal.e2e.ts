// SC-408 pilot: the StaminaEditModal opened from a standalone ds-stamina-bar, in real Obsidian
// (experimental OFF, the shipped product). This file: opening, Apply box / Damage / Healing,
// the quick actions, the temporary-Stamina stepper and the footer. The stamina stepper, Escape /
// close semantics and the needs-real-Obsidian scenarios are in stamina-modal-stepper.e2e.ts.
//
// Ids in titles (`[STAM-xx]`) are unique and drive `--only=`; the xNN in S1's inventory
// (sc408-s1-stamina-inventory.md) is noted per test. basic.md = 15/20 Stamina, 5 temp, hero rules
// (a standalone ds-stamina bar always opens as a hero: floor -10).
import { expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { applyAmount, applyAndWrite, expectApplyLabel, openBarModal } from '../../driver/stamina';

const NOTE = 'Stamina/basic.md';
const BAR = 'ds-stamina-bar';

describe('stamina-edit-modal from ds-stamina-bar: open, Apply box, Damage, Healing', () => {
	it('[STAM-E01] clicking the bar opens the modal: titled, Apply box focused, Apply disabled, nothing written', async () => {
		const modal = await openBarModal(NOTE);
		await expect(modal.control({ css: '.dse-modal__title-text' })).toHaveText('Stamina', { ignoreCase: true }); // CSS upper-cases it
		expect(await dse.focusedControl()).toBe('sedit.apply-amount'); // M02
		await expect(modal.control('sedit.apply')).toBeDisabled(); // M07
		await expectApplyLabel(modal, 'No Stamina Change');
		await dse.expectNoWrite(NOTE, () => dse.click(modal.control('modal.close')));
		await expect(modal.root).not.toBeExisting();
	});

	it('[STAM-D01] Damage less than temp: temp absorbs it, Stamina unchanged, exactly one write', async () => {
		const modal = await openBarModal(NOTE);
		await applyAmount(modal, '3', 'sedit.damage');
		await expectApplyLabel(modal, 'Lose 3 Temp Stamina');
		expect(await applyAndWrite(modal, NOTE)).toBe(1);
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ max_stamina: 20, current_stamina: 15, temp_stamina: 2 });
	});

	it('[STAM-D02] Damage more than temp: temp is spent first, the rest comes off Stamina', async () => {
		const modal = await openBarModal(NOTE);
		await applyAmount(modal, '8', 'sedit.damage');
		await expectApplyLabel(modal, 'Lose 3 Stamina and Lose 5 Temp Stamina');
		expect(await applyAndWrite(modal, NOTE)).toBe(1);
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ current_stamina: 12, temp_stamina: 0 });
	});

	it('[STAM-D03] Damage accumulates: three presses of 3 spend the 5 temp, then 4 Stamina', async () => {
		const modal = await openBarModal(NOTE);
		await dse.type(modal.control('sedit.apply-amount'), '3', { replace: true });
		for (let i = 0; i < 3; i++) await dse.click(modal.control('sedit.damage'));
		await expectApplyLabel(modal, 'Lose 4 Stamina and Lose 5 Temp Stamina'); // A05
		expect(await applyAndWrite(modal, NOTE)).toBe(1);
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ current_stamina: 11, temp_stamina: 0 });
	});

	it('[STAM-D07] Damage with an empty Apply box is a silent no-op', async () => {
		const modal = await openBarModal(NOTE);
		await dse.type(modal.control('sedit.apply-amount'), '5', { replace: true });
		await dse.press('Backspace');
		await dse.click(modal.control('sedit.damage')); // A07
		await expectApplyLabel(modal, 'No Stamina Change');
		await dse.expectNoWrite(NOTE, () => dse.click(modal.control('modal.close')));
	});

	it('[STAM-D08] a decimal amount is truncated: 2.9 damage is 2', async () => {
		const modal = await openBarModal(NOTE);
		await applyAmount(modal, '2.9', 'sedit.damage'); // A08
		await expectApplyLabel(modal, 'Lose 2 Temp Stamina');
		await dse.expectNoWrite(NOTE, () => dse.click(modal.control('modal.close')));
	});

	// A09 / S1 B9 (SC-427): the Apply box takes "1e3" (a valid number-input value) but the modal
	// reads it with parseInt, so it applies 1. Correct behaviour: 1000, capped at the death floor.
	knownBug(
		'SC-427',
		'[STAM-D09] an exponent amount is read as a number: 1e3 damage is capped at the death floor',
		async () => {
			const modal = await openBarModal(NOTE);
			await applyAmount(modal, '1e3', 'sedit.damage');
			await expectApplyLabel(modal, 'Lose 25 Stamina and Lose 5 Temp Stamina', {
				wait: 1500,
				message: 'an exponent amount (1e3) should be read as 1000 and capped at the death floor',
			});
		},
		{ failsWith: /an exponent amount \(1e3\) should be read as 1000/ },
	);

	it('[STAM-H01] Healing is capped at max Stamina and leaves temp alone', async () => {
		const modal = await openBarModal(NOTE);
		await applyAmount(modal, '9', 'sedit.healing'); // A11, A12
		await expectApplyLabel(modal, 'Gain 5 Stamina');
		expect(await applyAndWrite(modal, NOTE)).toBe(1);
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ current_stamina: 20, temp_stamina: 5 });
	});

	it('[STAM-A16] Enter in the Apply box applies nothing (current behaviour, not a bug ruling)', async () => {
		const modal = await openBarModal(NOTE);
		await dse.type(modal.control('sedit.apply-amount'), '5', { replace: true });
		await dse.expectNoWrite(NOTE, () => dse.press('Enter', modal.control('sedit.apply-amount')));
		await expectApplyLabel(modal, 'No Stamina Change');
		await expect(modal.root).toBeExisting();
		await dse.click(modal.control('modal.close'));
	});

	it('[STAM-A18] ArrowUp / ArrowDown step the Apply box and it never goes below 0', async () => {
		const modal = await openBarModal(NOTE);
		const box = modal.control('sedit.apply-amount');
		for (let i = 0; i < 3; i++) await dse.press('ArrowUp', box);
		await expect(box).toHaveValue('3');
		for (let i = 0; i < 5; i++) await dse.press('ArrowDown', box);
		await expect(box).toHaveValue('0');
		await dse.click(modal.control('modal.close'));
	});
});

describe('stamina-edit-modal: two blocks in one note', () => {
	it('[STAM-W10] editing the second of two ds-stamina bars writes only that block; the first stays byte-identical', async () => {
		const note = 'Stamina/two-blocks.md'; // 20/20 +5 temp, then 8/10
		await dse.openNote(note);
		await dse.click(dse.block(BAR, 1).control('stamina.bar'));
		const modal = await dse.modal('stamina-edit');
		await applyAmount(modal, '3', 'sedit.damage');
		await expectApplyLabel(modal, 'Lose 3 Stamina');
		expect(await applyAndWrite(modal, note)).toBe(1);
		await dse.expectNoteBlock(note, BAR, 1).toMatchObject({ max_stamina: 10, current_stamina: 5 });
		// (the invariant after every test also requires every fence this test did not declare to be byte-equal)
		await dse.expectNoteBlock(note, BAR, 0).toEqual({ max_stamina: 20, current_stamina: 15, temp_stamina: 5 });
	});
});

describe('stamina-edit-modal from ds-stamina-bar: quick actions and temporary Stamina', () => {
	it('[STAM-Q01] Kill drops a hero to the death floor and clears temp', async () => {
		const modal = await openBarModal(NOTE);
		await dse.click(modal.control('sedit.kill')); // hero floor ceil(-20/2) = -10
		await expectApplyLabel(modal, 'Lose 25 Stamina and Lose 5 Temp Stamina');
		expect(await applyAndWrite(modal, NOTE)).toBe(1);
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ current_stamina: -10, temp_stamina: 0 });
	});

	it('[STAM-Q04] Full Heal restores max Stamina and discards temp (current behaviour)', async () => {
		const modal = await openBarModal(NOTE);
		await dse.click(modal.control('sedit.full-heal'));
		await expectApplyLabel(modal, 'Gain 5 Stamina and Lose 5 Temp Stamina');
		expect(await applyAndWrite(modal, NOTE)).toBe(1);
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ current_stamina: 20, temp_stamina: 0 });
	});

	it('[STAM-T01] the temp "+" grants 1 temp Stamina', async () => {
		const modal = await openBarModal(NOTE);
		await dse.click(modal.control('sedit.temp.inc'));
		await expectApplyLabel(modal, 'Gain 1 Temp Stamina');
		expect(await applyAndWrite(modal, NOTE)).toBe(1);
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ current_stamina: 15, temp_stamina: 6 });
	});

	it('[STAM-T02] a typed temp value higher than the current is granted once the field blurs', async () => {
		const modal = await openBarModal(NOTE);
		await dse.type(modal.control('sedit.temp.input'), '8', { replace: true });
		await dse.blur(modal.control('sedit.temp.input'));
		await expectApplyLabel(modal, 'Gain 3 Temp Stamina');
		expect(await applyAndWrite(modal, NOTE)).toBe(1);
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ temp_stamina: 8 });
	});

	// T03 / S1 B6 (SC-433, ruled by Scott 2026-10-18): the temp field is a DIRECT edit like the Stamina
	// field; "keep the higher" belongs only to gaining temp from an effect. Today a typed lower value is
	// swallowed (the field snaps back to 5 and nothing changes).
	knownBug(
		'SC-433',
		'[STAM-T03] a typed temp value lower than the current is applied as typed: 3 over 5 is a loss of 2',
		async () => {
			const modal = await openBarModal(NOTE);
			await dse.type(modal.control('sedit.temp.input'), '3', { replace: true });
			await dse.blur(modal.control('sedit.temp.input'));
			await expectApplyLabel(modal, 'Lose 2 Temp Stamina', {
				wait: 1500,
				message: 'a typed temp value lower than the current should be applied as typed (Lose 2 Temp Stamina)',
			});
			await expect(modal.control('sedit.temp.input')).toHaveValue('3');
			expect(await applyAndWrite(modal, NOTE)).toBe(1);
			await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ temp_stamina: 3 });
		},
		{ failsWith: /a typed temp value lower than the current should be applied as typed/ },
	);

	// T04 / S1 B6 (SC-433): the temp "-" is enabled but a silent no-op (it can never lower temp, not
	// even to walk back a "+" pressed in the same session). Ruled: a direct edit, so "-" at 5 gives 4.
	knownBug(
		'SC-433',
		'[STAM-T04] the temp "-" at temp 5 lowers it by one: Apply writes temp_stamina 4',
		async () => {
			const modal = await openBarModal(NOTE);
			await expect(modal.control('sedit.temp.dec')).toBeEnabled();
			await dse.click(modal.control('sedit.temp.dec'));
			await expectApplyLabel(modal, 'Lose 1 Temp Stamina', {
				wait: 1500,
				message: 'the temp "-" at 5 should lower temp to 4 (Lose 1 Temp Stamina)',
			});
			expect(await applyAndWrite(modal, NOTE)).toBe(1);
			await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ temp_stamina: 4 });
		},
		{ failsWith: /the temp "-" at 5 should lower temp to 4/ },
	);

	// T11: the plain driver of `sedit.temp.dec x click` (the exercised-set gate needs a non-known-bug one).
	// It asserts only what holds both today (where "-" does nothing, B6) and once SC-433 lands (where
	// "-" lowers temp): after a click the Apply label always agrees with the temp field, and nothing is
	// written until Apply.
	it('[STAM-T11] after the temp "-" is pressed, the Apply label always agrees with the temp field, temp never rises, and nothing is written', async () => {
		const modal = await openBarModal(NOTE);
		await dse.expectNoWrite(NOTE, () => dse.click(modal.control('sedit.temp.dec')));
		const shown = Number(await modal.control('sedit.temp.input').getValue());
		// Bounds that hold today and after SC-433: a "-" press can never RAISE temp, nor take it below 0.
		expect(shown).toBeLessThanOrEqual(5); // never raised above its starting 5
		expect(shown).toBeGreaterThanOrEqual(0);
		const delta = shown - 5;
		const expected = delta === 0 ? 'No Stamina Change' : delta > 0 ? `Gain ${delta} Temp Stamina` : `Lose ${-delta} Temp Stamina`;
		await expectApplyLabel(modal, expected);
		await dse.click(modal.control('modal.close'));
	});

	it('[STAM-T05] the temp "-" is really disabled at 0 temp and a click does nothing', async () => {
		const modal = await openBarModal('Stamina/recoveries.md'); // temp 0
		await expect(modal.control('sedit.temp.dec')).toBeDisabled();
		await dse.click(modal.control('sedit.temp.dec'));
		await expectApplyLabel(modal, 'No Stamina Change');
		await dse.click(modal.control('modal.close'));
	});

	it('[STAM-T09] a decimal temp value is truncated: 7.5 grants up to 7', async () => {
		const modal = await openBarModal(NOTE);
		await dse.type(modal.control('sedit.temp.input'), '7.5', { replace: true });
		await dse.blur(modal.control('sedit.temp.input'));
		await expectApplyLabel(modal, 'Gain 2 Temp Stamina');
		await dse.click(modal.control('modal.close'));
	});

	// T10 / SC-433: a typed negative temp clamps to 0 and, being a direct edit, is applied as 0 (a loss
	// of the whole 5). Today "keep the higher" swallows it and nothing changes.
	knownBug(
		'SC-433',
		'[STAM-T10] a negative typed temp value clamps to 0 and is applied as typed: temp goes to 0',
		async () => {
			const modal = await openBarModal(NOTE);
			await dse.type(modal.control('sedit.temp.input'), '-3', { replace: true });
			await dse.blur(modal.control('sedit.temp.input'));
			await expectApplyLabel(modal, 'Lose 5 Temp Stamina', {
				wait: 1500,
				message: 'a negative typed temp value should clamp to 0 and be applied as typed (Lose 5 Temp Stamina)',
			});
		},
		{ failsWith: /a negative typed temp value should clamp to 0 and be applied as typed/ },
	);
});

describe('stamina-edit-modal from ds-stamina-bar: footer', () => {
	it('[STAM-F03] clicking the disabled Apply does nothing: no write, modal stays open', async () => {
		const modal = await openBarModal(NOTE);
		await dse.expectNoWrite(NOTE, () => dse.click(modal.control('sedit.apply')));
		await expect(modal.root).toBeExisting();
		await dse.click(modal.control('modal.close'));
	});

	it('[STAM-F05] Reset clears every pending change and disables Apply again', async () => {
		const modal = await openBarModal(NOTE);
		await applyAmount(modal, '8', 'sedit.damage');
		await dse.click(modal.control('sedit.temp.inc'));
		await dse.click(modal.control('sedit.reset'));
		await expectApplyLabel(modal, 'No Stamina Change');
		await expect(modal.control('sedit.apply')).toBeDisabled();
		await dse.expectNoWrite(NOTE, () => dse.click(modal.control('modal.close')));
	});

	// F06 / S1 B10 (SC-427): the pool modal's Reset also clears its inputs; this one leaves the
	// typed amount in the Apply box.
	knownBug(
		'SC-427',
		'[STAM-F06] Reset also clears the Apply box',
		async () => {
			const modal = await openBarModal(NOTE);
			await applyAmount(modal, '7', 'sedit.damage');
			await dse.click(modal.control('sedit.reset'));
			const value = await modal.control('sedit.apply-amount').getValue();
			if (value !== '0' && value !== '') throw new Error(`the Apply box should be cleared by Reset (it still holds "${value}")`);
		},
		{ failsWith: /Apply box should be cleared/ },
	);
});
