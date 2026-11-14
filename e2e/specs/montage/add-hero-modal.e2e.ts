// SC-438 [H]: the Add a hero window: the name field, Add (disabled until the name has a non-space character), Cancel and every way out, by pointer
// and keyboard. Opened from the chrome item or the board header "+". Montage/fresh.md: Kira and Bram. Montage/empty.md: no heroes.
import { expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { blockOf, dismiss, EMPTY, expectText, FRESH, modalsOpen, openAddHero } from '../../driver/montage';

describe('montage: the Add a hero window', () => {
	it('[MONT-H01] a name and Add: one write appends the hero with an empty skills list, a third board row appears and the head counts three heroes', async () => {
		const { root, modal } = await openAddHero(FRESH, 'board');
		await expect(modal.control('montage.add-hero.submit')).toBeDisabled();
		await dse.type(modal.control('montage.add-hero.name'), '  Osric ');
		await expect(modal.control('montage.add-hero.submit')).toBeEnabled();
		const w = await dse.waitForWrite(FRESH, () => dse.click(modal.control('montage.add-hero.submit')));
		expect(w.count).toBe(1);
		await expect(modal.root).not.toBeExisting();
		const b = await blockOf(FRESH);
		expect(b.participants).toEqual([{ name: 'Kira', skills_used: [] }, { name: 'Bram', skills_used: [] }, { name: 'Osric', skills_used: [] }]);
		await expect(root.control({ css: '.dse-mt__board-name[data-hero="Osric"]' })).toBeExisting();
		await expectText(root.control({ css: '.dse-head__deck--left' }), '3 heroes · one action each per round');
	});

	it('[MONT-H02] on a montage with no heroes the first hero gets a row and a socket in the round in play', async () => {
		const { root, modal } = await openAddHero(EMPTY, 'chrome');
		await dse.type(modal.control('montage.add-hero.name'), 'Kira');
		await dse.waitForWrite(EMPTY, () => dse.click(modal.control('montage.add-hero.submit')));
		expect((await blockOf(EMPTY)).participants).toEqual([{ name: 'Kira', skills_used: [] }]);
		await expect(root.control('montage.cell.socket', { nth: 0 })).toBeExisting();
		await expect(root.control({ css: '.dse-mt__board-empty' })).not.toBeExisting();
	});

	it('[MONT-H03] a blank name keeps Add disabled and a click on it does nothing; the window stays open', async () => {
		const { modal } = await openAddHero(FRESH);
		await expect(modal.control('montage.add-hero.submit')).toBeDisabled();
		await dse.expectNoWrite(FRESH, () => dse.click(modal.control('montage.add-hero.submit')));
		await dse.type(modal.control('montage.add-hero.name'), '   ');
		await expect(modal.control('montage.add-hero.submit')).toBeDisabled();
		await dse.expectNoWrite(FRESH, () => dse.click(modal.control('montage.add-hero.submit')));
		await expect(modal.root).toBeExisting();
		await dismiss(modal);
	});

	it('[MONT-H04] Cancel by click closes the window with a typed name and writes nothing; Enter on the focused Cancel does the same', async () => {
		let { modal } = await openAddHero(FRESH);
		await dse.type(modal.control('montage.add-hero.name'), 'Osric');
		await dse.expectNoWrite(FRESH, () => dse.click(modal.control('montage.add-hero.cancel')));
		await expect(modal.root).not.toBeExisting();
		({ modal } = await openAddHero(FRESH));
		const cancel = modal.control('montage.add-hero.cancel');
		await dse.tabTo(cancel, 6);
		await dse.expectNoWrite(FRESH, () => dse.press('Enter', cancel));
		await expect(modal.root).not.toBeExisting();
		expect((await blockOf(FRESH)).participants).toHaveLength(2);
	});

	it('[MONT-H05] Escape typed in the name field, Escape aimed at the X, the X and the backdrop each dismiss the window without adding anyone', async () => {
		let { modal } = await openAddHero(FRESH);
		const name = modal.control('montage.add-hero.name');
		await dse.type(name, 'Osric');
		await dse.expectNoWrite(FRESH, () => dse.press('Escape', name));
		await expect(modal.root).not.toBeExisting();
		({ modal } = await openAddHero(FRESH));
		await dse.expectNoWrite(FRESH, () => dse.press('Escape', dse.aimedAt('modal.close')));
		await expect(modal.root).not.toBeExisting();
		({ modal } = await openAddHero(FRESH));
		await dse.expectNoWrite(FRESH, () => dse.click(modal.control('modal.close')));
		await expect(modal.root).not.toBeExisting();
		({ modal } = await openAddHero(FRESH));
		await dse.expectNoWrite(FRESH, () => dse.click(modal.control('modal.backdrop'), { inset: 5 }));
		await expect(modal.root).not.toBeExisting();
		expect(await modalsOpen()).toBe(0);
	});

	it('[MONT-H06] from the keyboard: type a name, Tab to Add and Enter adds the hero', async () => {
		const { root, modal } = await openAddHero(FRESH);
		await dse.type(modal.control('montage.add-hero.name'), 'Osric');
		const add = modal.control('montage.add-hero.submit');
		await dse.tabTo(add, 6);
		const w = await dse.waitForWrite(FRESH, () => dse.press('Enter', add));
		expect(w.count).toBe(1);
		await expect(modal.root).not.toBeExisting();
		expect((await blockOf(FRESH)).participants!.map((p) => p.name)).toEqual(['Kira', 'Bram', 'Osric']);
		await expect(root.control({ css: '.dse-mt__board-name[data-hero="Osric"]' })).toBeExisting();
	});

	knownBug('SC-627', '[MONT-H07] a name already on the board is refused: no second "Kira" is written', async () => {
		const { modal } = await openAddHero(FRESH);
		await dse.type(modal.control('montage.add-hero.name'), 'Kira');
		await dse.click(modal.control('montage.add-hero.submit'));
		await dse.settle();
		expect((await blockOf(FRESH)).participants!.filter((p) => p.name === 'Kira')).toHaveLength(1);
	});
});
