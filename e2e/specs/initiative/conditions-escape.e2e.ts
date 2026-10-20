// SC-431: the Conditions window's add-condition dropdown. Obsidian runs the modal's Scope from a window
// capture listener before the dropdown's own Escape handler, so Escape used to close the WHOLE window
// (0 modals open afterwards). The first Escape now closes only the dropdown; a second closes the window.
// Initiative/tracker.md: hero Alice Alpha plus three Ogres; the first "Add Condition" button is the hero's.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const NOTE = 'Initiative/tracker.md';

describe('conditions-modal: Escape in the add-condition dropdown', () => {
	it('[COND-E01] Escape with the dropdown open closes only the dropdown; a second Escape closes the window; nothing is written', async () => {
		await dse.openNote(NOTE);
		await dse.click(dse.block('ds-initiative').control('init.cond.add'));
		const modal = await dse.modal('conditions');
		await dse.click(modal.control('cond.add'));
		await dse.type(modal.control('cond.input'), 'daz');
		await dse.expectNoWrite(NOTE, () => dse.press('Escape', modal.control('cond.input')));
		await expect(modal.root).toBeExisting({ wait: 1500, message: 'the first Escape should close only the dropdown and keep the Conditions window open' });
		await expect(modal.control('cond.input')).not.toBeExisting();
		await expect(modal.control('cond.add')).toBeExisting();
		await dse.expectNoWrite(NOTE, () => dse.press('Escape', modal.control('cond.add')));
		await expect(modal.root).not.toBeExisting();
	});
});
