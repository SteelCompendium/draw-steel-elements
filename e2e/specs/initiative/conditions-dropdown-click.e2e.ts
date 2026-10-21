// SC-474: with the "Add condition" dropdown open, a real mouse click on a row's cog or a colour swatch used to
// miss. The dropdown collapsed on the click's MOUSEDOWN, the modal shrank and re-centred, and the mouseup landed
// somewhere else, so no click fired on the control. The outside-close now waits for the click to complete.
// Initiative/tracker.md: hero Alice Alpha plus three Ogres; the first "Add Condition" button is the hero's.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import type { Scope } from '../../driver/dse';

const NOTE = 'Initiative/tracker.md';
const INIT = 'ds-initiative';
const SWATCH_GREEN = 2; // Red, Amber, Green, Blue, Purple

/** Open the hero's Conditions window, add Dazed by keyboard and leave the Add dropdown OPEN (it stays open after a pick). */
async function addDazedKeepDropdownOpen(): Promise<Scope> {
	await dse.openNote(NOTE);
	await dse.click(dse.block(INIT).control('init.cond.add'));
	const modal = await dse.modal('conditions');
	await dse.click(modal.control('cond.add'));
	await dse.type(modal.control('cond.input'), 'daz');
	await dse.press('Enter', modal.control('cond.input'));
	await dse.settle();
	await expect(modal.control('cond.input')).toBeExisting();
	return modal;
}

describe('conditions-modal: a mouse click with the add dropdown open still lands (SC-474)', () => {
	it('[COND-E04] clicking a row\'s cog with the dropdown open opens that row\'s editor and closes the dropdown', async () => {
		const modal = await addDazedKeepDropdownOpen();
		await dse.click(modal.control('cond.edit'));
		await expect(modal.control('cond.swatch', { nth: 0 })).toBeExisting({ message: 'the cog click should have opened the inline editor' });
		await expect(modal.control('cond.input')).not.toBeExisting({ message: 'the click away from the dropdown should still close it' });
		await expect(modal.control('cond.add')).toBeExisting();
		await dse.closeModals();
	});

	it('[COND-E05] clicking a colour swatch with the dropdown open writes the colour, presses the swatch and closes the dropdown', async () => {
		const modal = await addDazedKeepDropdownOpen();
		// The cog click closes the dropdown; reopen it so the swatch click is the one made with the dropdown open.
		await dse.click(modal.control('cond.edit'));
		await dse.click(modal.control('cond.add'));
		await expect(modal.control('cond.input')).toBeExisting();
		const swatch = modal.control('cond.swatch', { nth: SWATCH_GREEN });
		await dse.waitForWrite(NOTE, () => dse.click(swatch));
		await dse.settle();
		await dse.expectNoteBlock(NOTE, INIT).toMatchObject({
			heroes: [{ name: 'Alice Alpha', conditions: [{ key: 'dazed', color: '#1e8449' }] }],
		});
		await expect(modal.control('cond.swatch', { nth: SWATCH_GREEN })).toHaveAttribute('aria-pressed', 'true');
		await expect(modal.control('cond.input')).not.toBeExisting({ message: 'the click away from the dropdown should still close it' });
		await dse.closeModals();
	});

	it('[COND-E06] clicking the icon search field with the dropdown open closes the dropdown and leaves focus in the field', async () => {
		const modal = await addDazedKeepDropdownOpen();
		// The cog click closes the dropdown; reopen it so the search click is the one made with the dropdown open.
		await dse.click(modal.control('cond.edit'));
		await dse.click(modal.control('cond.add'));
		await expect(modal.control('cond.input')).toBeExisting();
		await dse.click(modal.control('cond.icon-search'));
		await expect(modal.control('cond.input')).not.toBeExisting({ message: 'the click away from the dropdown should still close it' });
		await expect(modal.control('cond.icon-search')).toBeFocused({ message: 'the close must not pull focus off the field the user clicked' });
		await dse.closeModals();
	});
});
