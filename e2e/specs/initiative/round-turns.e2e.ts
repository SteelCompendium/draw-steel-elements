// SC-437 [R][N]: Advance round, Reset turns (this round) and the three turn-taken controls. The permutations (starting round x
// round_gain x what is marked) live in the jsdom matrix (test/dom/elements/initiative-matrix.test.ts); here real clicks drive each
// control and the note + screen are read. Initiative/rich.md: round 2, Alice (not taken) and Bruno (taken), Ogres, Troll Boss,
// Malice 4 with round_gain 2 and one log entry.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const RICH = 'Initiative/rich.md';
const INIT = 'ds-initiative';

type Scope = ReturnType<typeof dse.block>;
const roundText = (root: Scope) => root.control({ css: '.dse-init__round-value' });
const malice = (root: Scope) => root.control({ css: '.dse-init__malice-value' });

async function openRich(): Promise<Scope> {
	await dse.openNote(RICH);
	return dse.block(INIT);
}

describe('initiative: round and turns', () => {
	it('[INIT-R01] Advance round: round 3, the round gain lands in Malice and the log, every turn mark clears, the screen follows', async () => {
		const root = await openRich();
		await expect(roundText(root)).toHaveText('Round 2');
		await expect(root.control('init.hero.turn', { nth: 1 })).toHaveAttribute('aria-pressed', 'true'); // Bruno has acted
		const w = await dse.waitForWrite(RICH, () => dse.click(root.control('init.round.advance')));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(RICH, INIT).toMatchObject({
			round: 3,
			heroes: [{ name: 'Alice Alpha' }, { name: 'Bruno Beta', has_taken_turn: false }],
			malice: { value: 6, round_gain: 2, log: [{ round: 1, amount: 3, label: 'Opening Malice' }, { round: 3, amount: 2, label: 'Round gain' }] },
		});
		await expect(roundText(root)).toHaveText('Round 3');
		await expect(malice(root)).toHaveElementProperty('textContent', 'Malice: 6');
		await expect(root.control('init.hero.turn', { nth: 1 })).toHaveAttribute('aria-pressed', 'false');
	});

	it('[INIT-R02] Reset turns (this round), a chrome item: turn marks clear, the round, Malice and log stay', async () => {
		const root = await openRich();
		await dse.hover(root.root); // the chrome panel is revealed by the pointer being over the tracker
		const w = await dse.waitForWrite(RICH, () => dse.click(root.control('init.reset-turns')));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(RICH, INIT).toMatchObject({
			round: 2,
			heroes: [{ name: 'Alice Alpha' }, { name: 'Bruno Beta', has_taken_turn: false }],
			malice: { value: 4, round_gain: 2, log: [{ round: 1, amount: 3, label: 'Opening Malice' }] },
		});
		await expect(roundText(root)).toHaveText('Round 2');
		await expect(malice(root)).toHaveElementProperty('textContent', 'Malice: 4');
		await expect(root.control('init.hero.turn', { nth: 1 })).toHaveAttribute('aria-pressed', 'false');
	});

	it('[INIT-R03] a negative round_gain: the button reads "-9" (never "+-9"), Advance round floors Malice at 0 and logs the configured amount [SC-577]', async () => {
		await dse.externalEdit(RICH, "c.replace('round_gain: 2', 'round_gain: -9')"); // Malice 4 + -9 would be -5
		const root = await openRich();
		await expect(root.control('init.round.advance')).toHaveAttribute('aria-label', 'Advance round (-9 Malice)');
		const w = await dse.waitForWrite(RICH, () => dse.click(root.control('init.round.advance')));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(RICH, INIT).toMatchObject({
			round: 3,
			malice: { value: 0, round_gain: -9, log: [{ round: 1, amount: 3, label: 'Opening Malice' }, { round: 3, amount: -9, label: 'Round gain' }] },
		});
		await expect(malice(root)).toHaveElementProperty('textContent', 'Malice: 0');
		await expect(root.control('init.malice.dec')).toBeDisabled();
	});

	it('[INIT-N01] the hero portrait overlay toggles the turn both ways and the two heroes keep their own state', async () => {
		const root = await openRich();
		const alice = root.control('init.hero.turn', { nth: 0 });
		const bruno = root.control('init.hero.turn', { nth: 1 });
		await expect(alice).toHaveAttribute('aria-pressed', 'false');
		await dse.waitForWrite(RICH, () => dse.click(alice));
		await dse.expectNoteBlock(RICH, INIT).toMatchObject({ heroes: [{ name: 'Alice Alpha', has_taken_turn: true }, { name: 'Bruno Beta', has_taken_turn: true }] });
		await expect(alice).toHaveAttribute('aria-pressed', 'true');
		await dse.waitForWrite(RICH, () => dse.click(bruno));
		await dse.expectNoteBlock(RICH, INIT).toMatchObject({ heroes: [{ has_taken_turn: true }, { name: 'Bruno Beta', has_taken_turn: false }] });
		await expect(bruno).toHaveAttribute('aria-pressed', 'false');
		await expect(alice).toHaveAttribute('aria-pressed', 'true');
	});

	it('[INIT-N03] the enemy group header button toggles that group only', async () => {
		const root = await openRich();
		const ogres = root.control('init.group.turn', { nth: 0 });
		await expect(ogres).toHaveAttribute('aria-pressed', 'false');
		const w = await dse.waitForWrite(RICH, () => dse.click(ogres));
		expect(w.count).toBe(1);
		const data = (await dse.expectNoteBlock(RICH, INIT).value()) as { enemy_groups: Array<{ name: string; has_taken_turn?: boolean }> };
		expect(data.enemy_groups.map((g) => g.has_taken_turn ?? false)).toEqual([true, false]);
		await expect(ogres).toHaveAttribute('aria-pressed', 'true');
		await expect(root.control('init.group.turn', { nth: 1 })).toHaveAttribute('aria-pressed', 'false');
	});
});

describe('initiative: round and turns, portraits off', () => {
	// With the Initiative portraits preference off there is no portrait to click: the checkbox is the turn control again and the
	// overlay stands down (styles-source 12c). Without that pair the preference would silently delete the turn toggle.
	before(() => dse.setPrefs({ portraits: 'off' }));
	after(() => dse.setPrefs({}));

	it('[INIT-N02] the checkbox toggles the hero turn, and the (stood-down) overlay agrees', async () => {
		const root = await openRich();
		const box = root.control('init.hero.turnbox', { nth: 0 });
		await expect(box).toBeDisplayed();
		await expect(root.control('init.hero.turn', { nth: 0 })).not.toBeDisplayed();
		await dse.waitForWrite(RICH, () => dse.click(box));
		await dse.expectNoteBlock(RICH, INIT).toMatchObject({ heroes: [{ name: 'Alice Alpha', has_taken_turn: true }, { name: 'Bruno Beta', has_taken_turn: true }] });
		await expect(box).toHaveAttribute('aria-pressed', 'true');
		await expect(root.control('init.hero.turn', { nth: 0 })).toHaveAttribute('aria-pressed', 'true');
	});
});
