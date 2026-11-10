// SC-437 [X]: the "Reset encounter state" chrome item and ResetEncounterModal in full: Yes, Reset, Cancel, Escape, the X, the backdrop and
// the keyboard (Cancel takes the initial focus; Tab reaches Yes, Reset). What a reset clears and keeps, per field, is in the jsdom matrix
// (test/dom/elements/initiative-matrix.test.ts). Initiative/rich.md is a live encounter: title, round 2, a condition, a spent hero, Malice 4
// with round_gain 2 and a log. Initiative/squad.md: five Goblins.
import { expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';

const RICH = 'Initiative/rich.md';
const SQUAD = 'Initiative/squad.md';
const INIT = 'ds-initiative';

type Scope = ReturnType<typeof dse.block>;

/** Open the note, reveal the chrome panel, press Reset encounter state and wait for the confirm modal. */
async function openReset(note = RICH): Promise<{ root: Scope; modal: Awaited<ReturnType<typeof dse.modal>> }> {
	await dse.openNote(note);
	const root = dse.block(INIT);
	await dse.hover(root.root); // the chrome panel is revealed by the pointer being over the tracker
	await dse.click(root.control('init.reset-encounter'));
	return { root, modal: await dse.modal('reset-encounter') };
}

/** The live state a reset must clear and the authored setup it must keep, as the note holds it. */
async function stateOf(note: string): Promise<{ name?: string; round?: number; malice: { value: number; round_gain?: number; log?: unknown[] }; heroes: Array<{ has_taken_turn?: boolean; conditions?: unknown[] }> }> {
	return (await dse.expectNoteBlock(note, INIT).value()) as never;
}

describe('initiative: Reset encounter state', () => {
	it('[INIT-X01] Yes, Reset: one write that clears the live state (round, Malice, log, turn, conditions) and keeps the title and round_gain; the modal closes', async () => {
		const { modal } = await openReset();
		const w = await dse.waitForWrite(RICH, () => dse.click(modal.control('init.reset-encounter.confirm')));
		expect(w.count).toBe(1);
		await expect(modal.root).not.toBeExisting();
		const s = await stateOf(RICH);
		expect(s.name).toBe('Warren Ambush');
		expect(s.round).toBeUndefined();
		expect(s.malice).toEqual({ value: 0, round_gain: 2 });
		expect(s.heroes.map((h) => h.has_taken_turn)).toEqual([undefined, undefined]);
		expect(s.heroes[0].conditions).toEqual([]);
	});

	it('[INIT-X02] Cancel closes the modal and changes nothing: no write, the round and Malice still show', async () => {
		const { root, modal } = await openReset();
		await dse.expectNoWrite(RICH, () => dse.click(modal.control('init.reset-encounter.cancel')));
		await expect(modal.root).not.toBeExisting();
		await expect(root.control({ css: '.dse-init__round-value' })).toHaveText('Round 2');
		await expect(root.control({ css: '.dse-init__malice-value' })).toHaveElementProperty('textContent', 'Malice: 4');
	});

	it('[INIT-X03] Escape, the X and a click on the backdrop each dismiss it without resetting', async () => {
		let { modal } = await openReset();
		await dse.expectNoWrite(RICH, () => dse.press('Escape', dse.aimedAt('modal.close')));
		await expect(modal.root).not.toBeExisting();
		({ modal } = await openReset());
		await dse.expectNoWrite(RICH, () => dse.click(modal.control('modal.close')));
		await expect(modal.root).not.toBeExisting();
		({ modal } = await openReset());
		await dse.expectNoWrite(RICH, () => dse.click(modal.control('modal.backdrop'), { inset: 5 }));
		await expect(modal.root).not.toBeExisting();
		expect((await stateOf(RICH)).round).toBe(2);
	});

	it('[INIT-X04] the keyboard: Cancel has the initial focus and Enter on it dismisses; Tab to Yes, Reset and Enter resets', async () => {
		let { root, modal } = await openReset();
		const cancel = modal.control('init.reset-encounter.cancel');
		await expect(cancel).toBeFocused();
		await dse.expectNoWrite(RICH, () => dse.press('Enter', cancel));
		await expect(modal.root).not.toBeExisting();
		await expect(root.control({ css: '.dse-init__round-value' })).toHaveText('Round 2');
		({ root, modal } = await openReset());
		const confirm = modal.control('init.reset-encounter.confirm');
		await dse.tabTo(confirm, 6);
		const w = await dse.waitForWrite(RICH, () => dse.press('Enter', confirm));
		expect(w.count).toBe(1);
		await expect(modal.root).not.toBeExisting();
		expect((await stateOf(RICH)).round).toBeUndefined();
	});
});

describe('initiative: what the screen shows after a reset', () => {
	it('[INIT-X05] after Yes, Reset the enemy groups still show their roster and detail row, back at full stamina', async () => {
		const { root, modal } = await openReset();
		await dse.waitForWrite(RICH, () => dse.click(modal.control('init.reset-encounter.confirm')));
		await dse.settle();
		await expect(root.control('init.cell.stamina', { nth: 0 })).toBeDisplayed();
		// the numeric button is visually stood down on the Steel screen, so read its text, not WebDriver's visible text
		await expect(root.control('init.detail.stamina', { nth: 0 })).toHaveElementProperty('textContent', '60/60');
	});

	it('[INIT-X06] after Yes, Reset the heroes show full stamina, not "0 / 30" Dying', async () => {
		const { root, modal } = await openReset();
		await dse.waitForWrite(RICH, () => dse.click(modal.control('init.reset-encounter.confirm')));
		await dse.settle();
		await expect(root.control('init.hero.stamina', { nth: 0 })).toHaveElementProperty('textContent', '30/30');
	});

	knownBug(
		'SC-575',
		'[INIT-X07] after Yes, Reset a minion squad\'s shared action pips are cleared in the note',
		async () => {
			await dse.openNote(SQUAD);
			const root = dse.block(INIT);
			await dse.waitForWrite(SQUAD, () => dse.click(root.control('init.detail.squad-action', { nth: 0 }))); // Move
			await dse.hover(root.root);
			await dse.click(root.control('init.reset-encounter'));
			const modal = await dse.modal('reset-encounter');
			await dse.waitForWrite(SQUAD, () => dse.click(modal.control('init.reset-encounter.confirm')));
			const data = (await dse.expectNoteBlock(SQUAD, INIT).value()) as { enemy_groups: Array<{ creatures: Array<{ actions?: Record<string, boolean> }> }> };
			expect(Object.values(data.enemy_groups[0].creatures[0].actions ?? {}).some(Boolean)).toBe(false);
		},
		{ failsWith: /Expected: false/ },
	);
});
