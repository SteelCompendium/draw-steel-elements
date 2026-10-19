// SC-408 pilot: the StaminaEditModal's Stamina stepper (type / blur / Enter / Escape), the ways
// a modal closes, and the interactions only a real Obsidian can answer (S1 section 4): event
// order on blur-then-click, Escape / X / backdrop semantics, an external edit while the modal
// is open, modal stacking. basic.md = 15/20 Stamina, 5 temp, hero rules.
import { expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { applyAmount, applyAndWrite, expectApplyLabel, openBarModal } from '../../driver/stamina';

const NOTE = 'Stamina/basic.md';
const BAR = 'ds-stamina-bar';

describe('stamina-edit-modal: Stamina stepper', () => {
	it('[STAM-S01] the Stamina "+" and "-" step one at a time and the Apply label follows', async () => {
		const modal = await openBarModal(NOTE);
		for (let i = 0; i < 2; i++) await dse.click(modal.control('sedit.stamina.inc'));
		await expectApplyLabel(modal, 'Gain 2 Stamina');
		for (let i = 0; i < 3; i++) await dse.click(modal.control('sedit.stamina.dec'));
		await expectApplyLabel(modal, 'Lose 1 Stamina');
		expect(await applyAndWrite(modal, NOTE)).toBe(1);
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ current_stamina: 14, temp_stamina: 5 });
	});

	it('[STAM-S02] typing a Stamina value and pressing Enter commits it', async () => {
		const modal = await openBarModal(NOTE);
		await dse.type(modal.control('sedit.stamina.input'), '18', { replace: true });
		await dse.press('Enter', modal.control('sedit.stamina.input'));
		await expectApplyLabel(modal, 'Gain 3 Stamina');
		expect(await applyAndWrite(modal, NOTE)).toBe(1);
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ current_stamina: 18 });
	});

	it('[STAM-S03] typing a Stamina value then clicking away commits it, once, with no write until Apply', async () => {
		const modal = await openBarModal(NOTE);
		await dse.type(modal.control('sedit.stamina.input'), '12', { replace: true });
		await dse.expectNoWrite(NOTE, () => dse.blur(modal.control('sedit.stamina.input')));
		await expectApplyLabel(modal, 'Lose 3 Stamina');
		await expect(modal.control('sedit.stamina.input')).toHaveValue('12');
		expect(await applyAndWrite(modal, NOTE)).toBe(1);
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ current_stamina: 12 });
	});

	it('[STAM-S04] a decimal Stamina value is truncated: 7.5 commits 7', async () => {
		const modal = await openBarModal(NOTE);
		await dse.type(modal.control('sedit.stamina.input'), '7.5', { replace: true });
		await dse.press('Enter', modal.control('sedit.stamina.input'));
		await expectApplyLabel(modal, 'Lose 8 Stamina');
		await dse.click(modal.control('modal.close'));
	});

	it('[STAM-S05] an emptied Stamina draft reverts to the shown value instead of committing', async () => {
		const modal = await openBarModal(NOTE);
		await dse.type(modal.control('sedit.stamina.input'), '9', { replace: true });
		await dse.press('Backspace');
		await dse.press('Enter', modal.control('sedit.stamina.input'));
		await expect(modal.control('sedit.stamina.input')).toHaveValue('15');
		await expectApplyLabel(modal, 'No Stamina Change');
		await dse.click(modal.control('modal.close'));
	});

	// S1 B3 (SC-427, fixed): a typed value past max used to be accepted into the stepper, with the
	// Apply label announcing the unclamped change while Apply persisted the clamped one. The field
	// is now bounded to [floor, max], so the typed 30 commits as 20 and the label says Gain 5.
	it('[STAM-S08] a typed Stamina above max: the Apply label says what will actually be applied', async () => {
		const modal = await openBarModal(NOTE);
		await dse.type(modal.control('sedit.stamina.input'), '30', { replace: true });
		await dse.press('Enter', modal.control('sedit.stamina.input'));
		await expectApplyLabel(modal, 'Gain 5 Stamina', {
			wait: 1500, // 15 -> max 20
			message: 'the Apply label should state the applied change (Gain 5), not the typed overshoot',
		});
		await expect(modal.control('sedit.stamina.input')).toHaveValue('20'); // the field itself shows the clamp
		expect(await applyAndWrite(modal, NOTE)).toBe(1);
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ current_stamina: 20 });
	});

	// S14: Chromium order is mousedown -> blur (commit) -> click, so Damage lands on top of the
	// freshly committed typed value.
	it('[STAM-S14] typing a Stamina value then pressing Damage: the blur commits first, Damage applies on top', async () => {
		const modal = await openBarModal(NOTE);
		await dse.type(modal.control('sedit.apply-amount'), '2', { replace: true });
		await dse.type(modal.control('sedit.stamina.input'), '12', { replace: true });
		await dse.click(modal.control('sedit.damage'));
		await expectApplyLabel(modal, 'Lose 3 Stamina and Lose 2 Temp Stamina');
		await dse.click(modal.control('modal.close'));
	});

	// S13 / S1 B7 (SC-430, fixed): Apply's label used to change only at the field's blur, i.e. between
	// mousedown and mouseup. The right-aligned button re-sized under the pointer, so a press on its
	// padding was lost (measured: not because it was disabled). Apply's label now follows the
	// half-typed draft and nothing moves at blur, so the first click applies. (Chrome 150 and 106.)
	it('[STAM-S13] type a new Stamina value, then click the edge of Apply: the first click applies', async () => {
		const modal = await openBarModal(NOTE);
		await dse.type(modal.control('sedit.stamina.input'), '12', { replace: true });
		const w = await dse.waitForWrite(NOTE, async () => {
			await dse.click(modal.control('sedit.apply'), { inset: 3 });
			await expect(modal.root).not.toBeExisting({ wait: 1500, message: 'the first click on Apply should apply and close the modal' });
		});
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ current_stamina: 12 });
	});

	// SC-430 D3: the Temp Stamina field. The label must SHRINK at blur for this to bite (a label that
	// grows keeps the inset point on the button either way and passes with the fix reverted): the
	// pending Damage makes it "Lose 2 Stamina and Lose 5 Temp Stamina", and committing Temp 5 (the
	// current value) drops the Temp part, so a late label update would move the button's left edge.
	it('[STAM-S13c] Damage 7, then type Temp 5 and click the edge of Apply: the first click applies', async () => {
		const modal = await openBarModal(NOTE);
		await applyAmount(modal, '7', 'sedit.damage');
		await expectApplyLabel(modal, 'Lose 2 Stamina and Lose 5 Temp Stamina');
		await dse.type(modal.control('sedit.temp.input'), '5', { replace: true });
		const w = await dse.waitForWrite(NOTE, async () => {
			await dse.click(modal.control('sedit.apply'), { inset: 3 });
			await expect(modal.root).not.toBeExisting({ wait: 1500, message: 'the first click on Apply should apply and close the modal' });
		});
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ current_stamina: 13, temp_stamina: 5 });
	});

	it('[STAM-S13b] type a new Stamina value, then click the label of Apply: the first click applies', async () => {
		const modal = await openBarModal(NOTE);
		await dse.type(modal.control('sedit.stamina.input'), '12', { replace: true });
		const w = await dse.waitForWrite(NOTE, () => dse.click(modal.control('sedit.apply')));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ current_stamina: 12 });
	});
});

describe('stamina-edit-modal: closing without Apply never writes', () => {
	// S06 / SC-431 (found by P2a): the stepper swallows Escape on a dirty draft "so a containing
	// modal doesn't close on the SAME press" (stepper.ts) and jsdom pins that, but real Obsidian's
	// modal Scope closes the whole modal anyway, losing every pending edit. Intended behaviour (the
	// ticket): the first Escape reverts only the half-typed draft and the modal stays open with the
	// Damage still pending; a second Escape closes it, with no write.
	knownBug(
		'SC-431',
		'[STAM-S06] Escape on a half-typed Stamina draft reverts only the draft; the modal stays open with the Damage still pending',
		async () => {
			const modal = await openBarModal(NOTE);
			await applyAmount(modal, '4', 'sedit.damage');
			await dse.type(modal.control('sedit.stamina.input'), '12', { replace: true });
			await dse.press('Escape', modal.control('sedit.stamina.input'));
			await expect(modal.root).toBeExisting({ wait: 1500, message: 'the first Escape should revert only the half-typed draft and keep the modal open' });
			await expect(modal.control('sedit.stamina.input')).toHaveValue('15');
			await expectApplyLabel(modal, 'Lose 4 Temp Stamina'); // the Damage is still pending
			await dse.expectNoWrite(NOTE, () => dse.press('Escape', modal.control('sedit.stamina.input')));
			await expect(modal.root).not.toBeExisting();
		},
		{ failsWith: /the first Escape should revert only the half-typed draft/ },
	);

	it('[STAM-S07] Escape with a clean draft closes the modal without writing', async () => {
		const modal = await openBarModal(NOTE);
		await dse.click(modal.control('sedit.stamina.input'));
		await dse.expectNoWrite(NOTE, () => dse.press('Escape', modal.control('sedit.stamina.input')));
		await expect(modal.root).not.toBeExisting();
	});

	it('[STAM-F07a] Escape with a pending Damage edit discards it', async () => {
		const modal = await openBarModal(NOTE);
		await applyAmount(modal, '4', 'sedit.damage');
		await dse.expectNoWrite(NOTE, () => dse.press('Escape', dse.aimedAt('modal.close')));
		await expect(modal.root).not.toBeExisting();
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ current_stamina: 15, temp_stamina: 5 });
	});

	it('[STAM-F07b] the X button with a pending edit discards it', async () => {
		const modal = await openBarModal(NOTE);
		await applyAmount(modal, '4', 'sedit.damage');
		await dse.expectNoWrite(NOTE, () => dse.click(modal.control('modal.close')));
		await expect(modal.root).not.toBeExisting();
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ current_stamina: 15, temp_stamina: 5 });
	});

	it('[STAM-F07c] clicking the backdrop with a pending edit discards it', async () => {
		const modal = await openBarModal(NOTE);
		await applyAmount(modal, '4', 'sedit.damage');
		await dse.expectNoWrite(NOTE, () => dse.click(modal.control('modal.backdrop'), { inset: 5 }));
		await expect(modal.root).not.toBeExisting();
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ current_stamina: 15, temp_stamina: 5 });
	});
});

describe('stamina-edit-modal: what only a real Obsidian can answer', () => {
	it('[STAM-W08] an external edit while the modal is open closes it and is never overwritten', async () => {
		const modal = await openBarModal(NOTE);
		await applyAmount(modal, '4', 'sedit.damage');
		await dse.externalEdit(NOTE, "c.replace('current_stamina: 15', 'current_stamina: 3')");
		await expect(modal.root).not.toBeExisting(); // the stale modal is closed by the rebuild
		await dse.settle();
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ current_stamina: 3, temp_stamina: 5 });
		await expect(dse.block(BAR).control({ css: '.dse-stamina__ccur' })).toHaveText('3');
	});

	it('[STAM-K03] a second modal stacks on the first and Escape closes only the top one', async () => {
		await openBarModal(NOTE);
		// The first modal's backdrop covers the bar, so a person cannot open a second one by hand;
		// a synthetic click on the bar stands in for "something else opened a stamina modal".
		await dse.page(`document.querySelector('.markdown-reading-view .dse-stamina--clickable').click()`);
		const count = `document.querySelectorAll('.modal-container .dse-modal').length`;
		await dse.waitFor(`${count} === 2`, 'a second stamina modal');
		await dse.press('Escape', dse.aimedAt('modal.close'));
		await dse.waitFor(`${count} === 1`, 'Escape to close exactly the top modal');
		await dse.expectNoWrite(NOTE, () => dse.press('Escape', dse.aimedAt('modal.close')));
		expect(await dse.page<number>(`document.querySelectorAll('.modal-container').length`)).toBe(0);
	});
});
