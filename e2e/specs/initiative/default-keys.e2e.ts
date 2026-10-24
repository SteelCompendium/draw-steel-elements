// SC-485: the initiative tracker writes no default key the user never wrote. Real Obsidian, real
// pointer input, exact `toEqual` on the note's block (so a key the tracker adds is a failure, not a
// subset match). The Steel turn control is the portrait overlay (`.dse-init__portrait-toggle`).
// Initiative/tracker.md is a minimal block (Alice Alpha 30, three Ogres at 60, Malice 3);
// Initiative/full.md is the same encounter fully authored - every key the legacy writer used to fill in
// is present, so every one of them must be written back untouched.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { applyAmount, applyAndWrite } from '../../driver/stamina';

const MIN = 'Initiative/tracker.md';
const FULL = 'Initiative/full.md';
const INIT = 'ds-initiative';

const minimal = {
	heroes: [{ name: 'Alice Alpha', max_stamina: 30 }],
	enemy_groups: [{ name: 'Ogres', creatures: [{ name: 'Ogre', max_stamina: 60, amount: 3 }] }],
	malice: { value: 3 },
};

describe('initiative: a write adds no default key the user never wrote', () => {
	it('[INIT-DEF-E01] toggling the hero turn writes only has_taken_turn: true', async () => {
		await dse.openNote(MIN);
		const root = dse.block(INIT);
		const w = await dse.waitForWrite(MIN, () => dse.click(root.control('init.hero.turn')));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(MIN, INIT).toEqual({
			...minimal,
			heroes: [{ name: 'Alice Alpha', max_stamina: 30, has_taken_turn: true }],
		});
	});

	it('[INIT-DEF-E02] damaging Ogre #1 writes the whole instances list and nothing else new', async () => {
		await dse.openNote(MIN);
		const root = dse.block(INIT);
		await dse.click(root.control('init.detail.bar'));
		const modal = await dse.modal('stamina-edit');
		await applyAmount(modal, '10', 'sedit.damage');
		expect(await applyAndWrite(modal, MIN)).toBe(1);
		const ogre = (current: number[]) => ({
			name: 'Ogre',
			max_stamina: 60,
			amount: 3,
			instances: current.map((current_stamina, i) => ({ id: i + 1, current_stamina, temp_stamina: 0, conditions: [] })),
		});
		await dse.expectNoteBlock(MIN, INIT).toEqual({
			...minimal,
			enemy_groups: [{ name: 'Ogres', creatures: [ogre([50, 60, 60])] }],
		});
	});

	it('[INIT-DEF-E03] a fully-authored block keeps every key: only the toggled line changes', async () => {
		await dse.openNote(FULL);
		const before = await dse.noteText(FULL);
		expect(before).toContain('isHero: true');
		expect(before).toContain('is_squad: false');
		const root = dse.block(INIT);
		const w = await dse.waitForWrite(FULL, () => dse.click(root.control('init.hero.turn')));
		expect(w.count).toBe(1);
		const after = await dse.noteText(FULL);
		// The hero comes first in the block, so its has_taken_turn is the first one in the note.
		expect(after).toBe(before.replace('has_taken_turn: false', 'has_taken_turn: true'));
	});

	it('[INIT-DEF-E04] Reset encounter on an untouched block writes back only the source keys (Malice back to 0)', async () => {
		await dse.openNote(MIN);
		const root = dse.block(INIT);
		await dse.hover(root.root); // the chrome panel is revealed by the pointer being over the tracker
		await dse.click(root.control('init.reset-encounter'));
		const modal = await dse.modal('reset-encounter');
		const w = await dse.waitForWrite(MIN, () => dse.click(modal.control('init.reset-encounter.confirm')));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(MIN, INIT).toEqual({ ...minimal, malice: { value: 0 } });
	});
});
