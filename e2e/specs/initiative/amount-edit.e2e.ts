// SC-600: hand-editing a creature's `amount` keeps the instances it can. Initiative/amount-edit.md: three Ogres, #2 grabbed at 25/60.
// The note is edited on disk (a plain vault.process), the card follows it, and a normal click on ANOTHER Ogre's cell saves the block:
// Ogre #2 must still be grabbed at 25, new Ogres are appended at the end at full stamina, removed ones are cut from the end.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const NOTE = 'Initiative/amount-edit.md';
const INIT = 'ds-initiative';
const CELLS = '.markdown-reading-view .dse-init__cell';

const ogre = (id: number, current_stamina: number, extra: Record<string, unknown> = {}) => ({ id, current_stamina, ...extra });

describe('initiative: editing a creature amount by hand keeps the existing creatures', () => {
	it('[INIT-AMT-E01] amount 3 -> 4: Ogre #2 keeps its condition and stamina, a fresh Ogre #4 is added at the end', async () => {
		await dse.openNote(NOTE);
		await dse.externalEdit(NOTE, `c.replace('amount: 3', 'amount: 4')`);
		await dse.waitFor(`document.querySelectorAll('${CELLS}').length === 4`, 'the card to follow the outside change to four Ogres');
		const root = dse.block(INIT);
		const w = await dse.waitForWrite(NOTE, () => dse.click(root.control('init.cell.stamina', { nth: 2 })));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(NOTE, INIT).toMatchObject({
			enemy_groups: [
				{
					creatures: [
						{
							amount: 4,
							instances: [
								ogre(1, 60),
								ogre(2, 25, { conditions: ['grabbed'] }), // still a plain name (SC-592)
								ogre(3, 60),
								ogre(4, 60, { temp_stamina: 0, conditions: [] }),
							],
						},
					],
				},
			],
		});
	});

	it('[INIT-AMT-E02] amount 3 -> 2: Ogre #2 keeps its condition and stamina, Ogre #3 is cut from the end', async () => {
		await dse.openNote(NOTE);
		await dse.externalEdit(NOTE, `c.replace('amount: 3', 'amount: 2')`);
		await dse.waitFor(`document.querySelectorAll('${CELLS}').length === 2`, 'the card to follow the outside change to two Ogres');
		const root = dse.block(INIT);
		const w = await dse.waitForWrite(NOTE, () => dse.click(root.control('init.cell.stamina', { nth: 0 })));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(NOTE, INIT).toMatchObject({
			enemy_groups: [{ creatures: [{ amount: 2, instances: [ogre(1, 60), ogre(2, 25, { conditions: ['grabbed'] })] }] }],
		});
	});
});
