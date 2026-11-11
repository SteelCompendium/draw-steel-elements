// SC-436: a condition row's own controls: the cog (opens the inline editor under the row, one at a time) and the trash
// button (removes that row at once). Opening or closing an editor writes nothing; a removal writes once and leaves focus
// on the row that took its slot, never on <body>. Initiative/conditions.md: hero Bleeding, Dazed, Hexed, Slowed;
// Ogre #1 Grabbed, Prone.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { CONDITIONS, INIT, focusedOption, modalNames, modalRows, openConditionsModal, openFrom, trackerIcons } from '../../driver/conditions';

describe('conditions-modal: the row cog', () => {
	it('[COND-R01] a click on a cog opens that row\'s editor, another cog moves it (one at a time), the same cog closes it; no write, focus stays on the cog', async () => {
		await dse.openNote(CONDITIONS);
		const root = dse.block(INIT);
		await dse.expectNoWrite(CONDITIONS, async () => {
			const modal = await openFrom(root, 'hero');
			await dse.click(modal.control('cond.edit', { nth: 0 }));
			expect((await modalRows()).map((r) => r.editorOpen)).toEqual([true, false, false, false]);
			await expect(modal.control('cond.edit', { nth: 0 })).toHaveAttribute('aria-pressed', 'true');
			await dse.click(modal.control('cond.edit', { nth: 2 }));
			expect((await modalRows()).map((r) => r.editorOpen)).toEqual([false, false, true, false]);
			expect(await focusedOption()).toEqual({ ctl: 'cond.edit', label: 'Customize Hexed' });
			await dse.click(modal.control('cond.edit', { nth: 2 }));
			expect((await modalRows()).map((r) => r.editorOpen)).toEqual([false, false, false, false]);
			await dse.click(modal.control('modal.close'));
		});
	});

	it('[COND-R02] Tab to a cog and Enter opens its editor; Enter again closes it; focus stays on the cog; no write', async () => {
		await dse.openNote(CONDITIONS);
		const root = dse.block(INIT);
		await dse.expectNoWrite(CONDITIONS, async () => {
			const modal = await openFrom(root, 'hero');
			const cog = () => modal.control('cond.edit', { nth: 1 }); // the list is rebuilt after each toggle, so look the cog up again
			await dse.tabTo(cog(), 40);
			await dse.press('Enter', cog());
			expect((await modalRows()).map((r) => r.editorOpen)).toEqual([false, true, false, false]);
			expect(await focusedOption()).toEqual({ ctl: 'cond.edit', label: 'Customize Dazed' });
			await dse.press('Enter', cog());
			expect((await modalRows()).map((r) => r.editorOpen)).toEqual([false, false, false, false]);
			expect(await focusedOption()).toEqual({ ctl: 'cond.edit', label: 'Customize Dazed' });
			await dse.click(modal.control('modal.close'));
		});
	});
});

describe('conditions-modal: removing a condition', () => {
	it('[COND-R03] the trash button removes exactly its row: one write, the other rows and their settings stay, focus moves to the cog of the row that took its slot', async () => {
		const { modal } = await openConditionsModal(CONDITIONS, 'hero');
		const w = await dse.waitForWrite(CONDITIONS, () => dse.click(modal.control('cond.remove', { nth: 1 }))); // Dazed
		expect(w.count).toBe(1);
		expect(await modalNames()).toEqual(['Bleeding', 'Hexed', 'Slowed']);
		expect(await focusedOption()).toEqual({ ctl: 'cond.edit', label: 'Customize Hexed' });
		await dse.expectNoteBlock(CONDITIONS, INIT).toMatchObject({
			heroes: [{ name: 'Alice Alpha', conditions: ['bleeding', { key: 'hexed' }, { key: 'slowed', effect: 'save ends' }] }],
			enemy_groups: [{ creatures: [{ instances: [{ conditions: ['grabbed', { key: 'prone', duration: 'save-ends' }] }, { id: 2 }] }] }],
		});
		expect(await trackerIcons('hero')).toEqual(['Bleeding', 'Hexed', 'Slowed']);
		await dse.closeModals();
	});

	it('[COND-R04] Tab to a trash button and Enter removes it; removing the last row focuses the previous cog, removing the only row focuses "+ Add condition"', async () => {
		const { modal } = await openConditionsModal(CONDITIONS, 'creature');
		const second = modal.control('cond.remove', { nth: 1 }); // Prone, the last row
		await dse.tabTo(second, 40);
		const w = await dse.waitForWrite(CONDITIONS, () => dse.press('Enter', second));
		expect(w.count).toBe(1);
		expect(await modalNames()).toEqual(['Grabbed']);
		expect(await focusedOption()).toEqual({ ctl: 'cond.edit', label: 'Customize Grabbed' });
		await dse.waitForWrite(CONDITIONS, () => dse.click(modal.control('cond.remove', { nth: 0 })));
		expect(await modalNames()).toEqual([]);
		await expect(modal.control('cond.add')).toBeFocused();
		await dse.expectNoteBlock(CONDITIONS, INIT).toMatchObject({
			heroes: [{ name: 'Alice Alpha' }],
			enemy_groups: [{ creatures: [{ instances: [{ id: 1, conditions: [] }, { id: 2 }] }] }],
		});
		expect(await trackerIcons('creature')).toEqual([]);
		await dse.closeModals();
	});

	it('[COND-R05] removing a row above an open editor keeps that editor open on the same condition', async () => {
		const { modal } = await openConditionsModal(CONDITIONS, 'hero');
		await dse.click(modal.control('cond.edit', { nth: 3 })); // Slowed
		await dse.waitForWrite(CONDITIONS, () => dse.click(modal.control('cond.remove', { nth: 0 }))); // Bleeding
		expect(await modalRows()).toMatchObject([
			{ name: 'Dazed', editorOpen: false },
			{ name: 'Hexed', editorOpen: false },
			{ name: 'Slowed', editorOpen: true },
		]);
		await dse.closeModals();
	});

	it('[COND-R06] removing the row whose editor is open closes the editor; the removed condition leaves the note', async () => {
		const { modal } = await openConditionsModal(CONDITIONS, 'hero');
		await dse.click(modal.control('cond.edit', { nth: 2 })); // Hexed
		await dse.waitForWrite(CONDITIONS, () => dse.click(modal.control('cond.remove', { nth: 2 })));
		expect((await modalRows()).map((r) => r.editorOpen)).toEqual([false, false, false]);
		expect(await modalNames()).toEqual(['Bleeding', 'Dazed', 'Slowed']);
		const hero = ((await dse.expectNoteBlock(CONDITIONS, INIT).value()) as { heroes: Array<{ conditions: Array<{ key: string }> }> }).heroes[0];
		expect(hero.conditions.map((c) => c.key)).toEqual(['bleeding', 'dazed', 'slowed']);
		await dse.closeModals();
	});
});
