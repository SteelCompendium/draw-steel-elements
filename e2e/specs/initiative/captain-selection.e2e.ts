// SC-437 [S][K]: selecting a roster cell and the captain badge. The row-kind x selection and promote / relieve tables live in the
// jsdom matrix (test/dom/elements/initiative-matrix.test.ts); here real clicks drive the cells and the badge, and the note + screen are read.
// Initiative/tracker.md: three Ogres (cells 0-1..0-3). Initiative/captain.md: Goblins #1-#3 (0-1..0-3), the Goblin Captain (1-1, selected),
// an attached Warg Rider (2-1).
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const MIN = 'Initiative/tracker.md';
const CAP = 'Initiative/captain.md';
const INIT = 'ds-initiative';

type Scope = ReturnType<typeof dse.block>;
const cell = (root: Scope, key: string) => root.control({ css: `.dse-init__cell[data-instance-key="${key}"]` });
const detailName = (root: Scope) => root.control({ css: '.dse-init__detail .dse-init__name' });
type Group = { selectedInstanceKey?: string; creatures: Array<{ name: string; squad_role?: string; captain_of?: string }> };
const group = async (note: string): Promise<Group> => ((await dse.expectNoteBlock(note, INIT).value()) as { enemy_groups: Group[] }).enemy_groups[0];

describe('initiative: selecting a roster cell', () => {
	it('[INIT-S01] clicking Ogre #3\'s cell selects it: the ring and label move, the detail row switches, the key is written', async () => {
		await dse.openNote(MIN);
		const root = dse.block(INIT);
		await expect(detailName(root)).toHaveText('Ogre #1');
		await expect(cell(root, '0-1')).toHaveAttribute('aria-pressed', 'false'); // the default selection is not recorded as a click
		const w = await dse.waitForWrite(MIN, () => dse.click(root.control('init.cell.stamina', { nth: 2 })));
		expect(w.count).toBe(1);
		expect((await group(MIN)).selectedInstanceKey).toBe('0-3');
		await expect(detailName(root)).toHaveText('Ogre #3');
		await expect(cell(root, '0-3')).toHaveAttribute('aria-pressed', 'true');
		await expect(cell(root, '0-3')).toHaveAttribute('aria-label', 'Selected — Ogre #3');
		await expect(cell(root, '0-1')).toHaveAttribute('aria-pressed', 'false');
		await expect(cell(root, '0-1')).toHaveAttribute('aria-label', 'Select Ogre #1');
	});
});

describe('initiative: the captain badge', () => {
	it('[INIT-K01] Make captain: the attached Warg Rider takes the role, the Goblin Captain becomes attached, the badge flips', async () => {
		await dse.openNote(CAP);
		const root = dse.block(INIT);
		await dse.click(root.control('init.cell.stamina', { nth: 4 })); // the Warg Rider
		await expect(detailName(root)).toHaveElementProperty('textContent', 'Warg Rider #1Make captain');
		const make = root.control('init.captain.make');
		await expect(make).toHaveAttribute('aria-label', 'Make Warg Rider captain of Goblin');
		await dse.waitForWrite(CAP, () => dse.click(make));
		await dse.settle();
		const g = await group(CAP);
		expect(g.creatures.map((c) => [c.name, c.squad_role])).toEqual([['Goblin', 'minion'], ['Goblin Captain', 'attached'], ['Warg Rider', 'captain']]);
		expect(g.selectedInstanceKey).toBe('2-1');
		await expect(root.control('init.captain.relieve')).toHaveAttribute('aria-label', 'Relieve Warg Rider as captain');
		await expect(root.control('init.captain.make')).not.toBeExisting();
		await expect(root.control({ css: '.dse-init__groupbody' })).toHaveAttribute('data-captain', 'up');
	});

	it('[INIT-K02] Relieve: the captain becomes attached (the squad keeps them) and the group no longer reports a captain', async () => {
		await dse.openNote(CAP);
		const root = dse.block(INIT);
		const relieve = root.control('init.captain.relieve'); // the Goblin Captain is the selected creature
		await expect(relieve).toHaveAttribute('aria-label', 'Relieve Goblin Captain as captain');
		await expect(relieve).toHaveAttribute('aria-pressed', 'true');
		await dse.waitForWrite(CAP, () => dse.click(relieve));
		await dse.settle();
		const g = await group(CAP);
		expect(g.creatures.map((c) => [c.name, c.squad_role])).toEqual([['Goblin', 'minion'], ['Goblin Captain', 'attached'], ['Warg Rider', 'attached']]);
		await expect(root.control('init.captain.make')).toHaveAttribute('aria-label', 'Make Goblin Captain captain of Goblin');
		await expect(root.control('init.captain.relieve')).not.toBeExisting();
		await expect(root.control({ css: '.dse-init__groupbody' })).not.toHaveAttribute('data-captain');
	});
});
