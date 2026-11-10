// SC-435 (SC-408 R2 LOW-1): the driver's own edited-block bookkeeping. `dse.block()` used to mark its block as
// "being edited" the moment a test named it, even when the test only read it, which exempted the block from the
// after-every-test "every OTHER fence is byte-identical" check. A block is now marked only by a click / type /
// press / double-click on one of its elements.
import { expect } from '@wdio/globals';
import { dse } from '../driver/dse';

const NOTE = 'Stamina/two-blocks.md'; // two ds-stamina-bar blocks (fences 0 and 1)
const BAR = 'ds-stamina-bar';

describe('driver: a block is declared edited only by input inside it', () => {
	it('[DRV-01] naming a block and reading it declares nothing', async () => {
		await dse.openNote(NOTE);
		const second = dse.block(BAR, 1);
		await expect(second.control('stamina.bar')).toBeDisplayed();
		await expect(second.root).toBeExisting();
		expect(dse.editedFences(NOTE)).toEqual([]);
	});

	it('[DRV-02] a real click inside block 1 declares block 1 only; hovering block 0 declares nothing', async () => {
		await dse.openNote(NOTE);
		await dse.hover(dse.block(BAR, 0).root);
		expect(dse.editedFences(NOTE)).toEqual([]);
		await dse.click(dse.block(BAR, 1).control('stamina.bar'));
		expect(dse.editedFences(NOTE)).toEqual([1]);
		const modal = await dse.modal('stamina-edit');
		await dse.expectNoWrite(NOTE, () => dse.click(modal.control('modal.close')));
	});
});
