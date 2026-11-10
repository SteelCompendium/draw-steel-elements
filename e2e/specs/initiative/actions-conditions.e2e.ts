// SC-437 [A][C]: the per-turn action pips (a hero's four, a creature instance's four, a minion squad's five) and removing a
// condition from a row. The slot sequences and the squad exclusivity table live in the jsdom matrix
// (test/dom/elements/initiative-matrix.test.ts); here real clicks drive the pips and the note + screen are read.
// Initiative/rich.md: Alice (grabbed), Ogre #1 dazed. Initiative/squad.md: five Goblins.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const RICH = 'Initiative/rich.md';
const SQUAD = 'Initiative/squad.md';
const INIT = 'ds-initiative';

type Scope = ReturnType<typeof dse.block>;
const pressed = (root: Scope, id: string, nth: number) => root.control(id, { nth });

async function open(note: string): Promise<Scope> {
	await dse.openNote(note);
	return dse.block(INIT);
}

describe('initiative: action pips', () => {
	it('[INIT-A01] a hero\'s Main and Move pips: pressed on screen, materialized on that hero only', async () => {
		const root = await open(RICH);
		await dse.waitForWrite(RICH, () => dse.click(pressed(root, 'init.hero.action', 0))); // Alice: Main, Maneuver, Move, Triggered
		await dse.waitForWrite(RICH, () => dse.click(pressed(root, 'init.hero.action', 2)));
		const data = (await dse.expectNoteBlock(RICH, INIT).value()) as { heroes: Array<{ actions?: Record<string, boolean> }> };
		expect(data.heroes[0].actions).toEqual({ main: true, maneuver: false, move: true, triggered: false });
		expect(data.heroes[1].actions).toBeUndefined();
		await expect(pressed(root, 'init.hero.action', 0)).toHaveAttribute('aria-pressed', 'true');
		await expect(pressed(root, 'init.hero.action', 1)).toHaveAttribute('aria-pressed', 'false');
		await expect(pressed(root, 'init.hero.action', 2)).toHaveAttribute('aria-pressed', 'true');
		await expect(pressed(root, 'init.hero.action', 4)).toHaveAttribute('aria-pressed', 'false'); // Bruno's Main
		await dse.waitForWrite(RICH, () => dse.click(pressed(root, 'init.hero.action', 0))); // pressing again releases it
		await expect(pressed(root, 'init.hero.action', 0)).toHaveAttribute('aria-pressed', 'false');
	});

	it('[INIT-A02] a creature\'s Triggered pip is stored on the selected instance, not on its siblings', async () => {
		const root = await open(RICH);
		await dse.waitForWrite(RICH, () => dse.click(pressed(root, 'init.detail.action', 3)));
		const data = (await dse.expectNoteBlock(RICH, INIT).value()) as { enemy_groups: Array<{ creatures: Array<{ instances: Array<{ id: number; actions?: Record<string, boolean> }> }> }> };
		const ogres = data.enemy_groups[0].creatures[0].instances;
		expect(ogres[0].actions).toEqual({ main: false, maneuver: false, move: false, triggered: true });
		expect(ogres[1].actions).toBeUndefined();
		await expect(pressed(root, 'init.detail.action', 3)).toHaveAttribute('aria-pressed', 'true');
	});

	it('[INIT-A03] a squad\'s Main then Maneuver: the second replaces the first (they exclude each other), on screen and in the note', async () => {
		const root = await open(SQUAD);
		await dse.waitForWrite(SQUAD, () => dse.click(pressed(root, 'init.detail.squad-action', 1))); // Move, Main, Maneuver, Second move, Triggered
		await expect(pressed(root, 'init.detail.squad-action', 1)).toHaveAttribute('aria-pressed', 'true');
		await dse.waitForWrite(SQUAD, () => dse.click(pressed(root, 'init.detail.squad-action', 2)));
		await expect(pressed(root, 'init.detail.squad-action', 1)).toHaveAttribute('aria-pressed', 'false');
		await expect(pressed(root, 'init.detail.squad-action', 2)).toHaveAttribute('aria-pressed', 'true');
		const data = (await dse.expectNoteBlock(SQUAD, INIT).value()) as { enemy_groups: Array<{ creatures: Array<{ actions: Record<string, boolean> }> }> };
		expect(data.enemy_groups[0].creatures[0].actions).toEqual({ move: false, main: false, maneuver: true, second_move: false, triggered: false });
	});

	it('[INIT-A04] Move and Triggered are independent of the exclusive three: Move + Main + Triggered stay pressed together', async () => {
		const root = await open(SQUAD);
		for (const nth of [0, 1, 4]) await dse.waitForWrite(SQUAD, () => dse.click(pressed(root, 'init.detail.squad-action', nth)));
		const data = (await dse.expectNoteBlock(SQUAD, INIT).value()) as { enemy_groups: Array<{ creatures: Array<{ actions: Record<string, boolean> }> }> };
		expect(data.enemy_groups[0].creatures[0].actions).toEqual({ move: true, main: true, maneuver: false, second_move: false, triggered: true });
		for (const nth of [0, 1, 4]) await expect(pressed(root, 'init.detail.squad-action', nth)).toHaveAttribute('aria-pressed', 'true');
	});
});

describe('initiative: removing a condition', () => {
	it('[INIT-C01] clicking a hero\'s condition icon removes it: the icon goes, the note\'s list empties, one write', async () => {
		const root = await open(RICH);
		await expect(root.control('init.cond.remove', { nth: 0 })).toHaveAttribute('aria-label', 'Remove condition: Grabbed');
		const w = await dse.waitForWrite(RICH, () => dse.click(root.control('init.cond.remove', { nth: 0 })));
		expect(w.count).toBe(1);
		const data = (await dse.expectNoteBlock(RICH, INIT).value()) as { heroes: Array<{ conditions: unknown[] }> };
		expect(data.heroes[0].conditions).toEqual([]);
		await expect(root.control({ css: '.dse-init__group--heroes [data-dse-control="init.cond.remove"]' })).not.toBeExisting();
	});

	it('[INIT-C02] and a creature\'s: Ogre #1\'s Dazed icon removes only that condition from that instance', async () => {
		const root = await open(RICH);
		await expect(root.control('init.cond.remove', { nth: 1 })).toHaveAttribute('aria-label', 'Remove condition: Dazed');
		await dse.waitForWrite(RICH, () => dse.click(root.control('init.cond.remove', { nth: 1 })));
		const data = (await dse.expectNoteBlock(RICH, INIT).value()) as { heroes: Array<{ conditions: unknown[] }>; enemy_groups: Array<{ creatures: Array<{ instances: Array<{ conditions: unknown[] }> }> }> };
		expect(data.enemy_groups[0].creatures[0].instances[0].conditions).toEqual([]);
		expect(data.heroes[0].conditions).toHaveLength(1); // Alice keeps Grabbed
	});
});
