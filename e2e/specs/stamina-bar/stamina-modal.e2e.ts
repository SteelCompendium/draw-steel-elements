// SC-408 pilot: the StaminaEditModal opened from a standalone ds-stamina-bar, in real Obsidian
// (experimental OFF, the shipped product). P1 proof scenarios; P2 grows this to the full set.
// Ids in the titles (`[STAM-xx]`) match the S1 inventory and drive `--only=`.
import { dse, knownBug } from '../../driver/dse';

const NOTE = 'Stamina/basic.md'; // max 20, current 15, temp 5
const BAR = 'ds-stamina-bar';

async function openStaminaModal() {
	await dse.click(dse.block(BAR).control({ css: '.dse-stamina__cluster' }));
	return dse.modal('stamina-edit');
}

describe('stamina-edit-modal (from ds-stamina-bar)', () => {
	beforeEach(async () => {
		await dse.openNote(NOTE);
	});

	it('[STAM-D01] Damage less than temp: temp absorbs it, Stamina unchanged, exactly one write', async () => {
		const modal = await openStaminaModal();
		await dse.type(modal.control({ css: '.dse-sedit__apply-input' }), '3', { replace: true });
		await dse.click(modal.control({ name: 'Damage' }));
		await expect(modal.control({ css: '.dse-modal__footer .dse-btn--accent' })).toHaveText(expect.stringContaining('3 Temp Stamina'));
		const w = await dse.waitForWrite(NOTE, () => dse.click(modal.control({ css: '.dse-modal__footer .dse-btn--accent' })));
		expect(w.count).toBe(1);
		await expect(modal.root).not.toBeExisting();
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ max_stamina: 20, current_stamina: 15, temp_stamina: 2 });
	});

	it('[STAM-K01] Escape closes the modal without writing', async () => {
		const modal = await openStaminaModal();
		await dse.type(modal.control({ css: '.dse-sedit__apply-input' }), '5', { replace: true });
		await dse.click(modal.control({ name: 'Damage' }));
		await dse.expectNoWrite(NOTE, () => dse.press('Escape'));
		await expect(modal.root).not.toBeExisting();
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ current_stamina: 15, temp_stamina: 5 });
	});

	// S1 B7, confirmed in real Obsidian (app 1.14.4 on both Chrome 150 and Chrome 106): typing a new
	// Stamina value leaves Apply disabled until the input's blur commits it. A press on the label
	// text works (the click target is the label span, which Chrome still dispatches), but a press
	// on the button's OWN surface - its padding - lands on the still-disabled button: the blur
	// enables it afterwards and the click is swallowed. Correct behaviour: the first click applies.
	// (Not B7: the control case, a press on the label, is the next test and passes.)
	knownBug(
		'B7-pending-ticket',
		'[STAM-S13] type a new Stamina value, then click the edge of Apply: the first click applies',
		async () => {
			const modal = await openStaminaModal();
			await dse.type(modal.control({ css: 'input[aria-label="Stamina"]' }), '12', { replace: true });
			const apply = modal.control({ css: '.dse-modal__footer .dse-btn--accent' });
			const w = await dse.waitForWrite(NOTE, async () => {
				await dse.click(apply, { inset: 3 });
				await expect(modal.root).not.toBeExisting({ wait: 1500, message: 'the first click on Apply should apply and close the modal' });
			});
			expect(w.count).toBe(1);
			await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ current_stamina: 12 });
		},
		{ failsWith: /first click on Apply should apply/ },
	);

	it('[STAM-S13b] type a new Stamina value, then click the label of Apply: the first click applies', async () => {
		const modal = await openStaminaModal();
		await dse.type(modal.control({ css: 'input[aria-label="Stamina"]' }), '12', { replace: true });
		const apply = modal.control({ css: '.dse-modal__footer .dse-btn--accent' });
		const w = await dse.waitForWrite(NOTE, () => dse.click(apply));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(NOTE, BAR).toMatchObject({ current_stamina: 12 });
	});
});
