// SC-583: a condition key matches regardless of case. Initiative/key-case.md: hero Alice Alpha has `key: Dazed` and `key: Hexed`
// (a hand-written standard condition and a hand-written custom one); Ogre #1 already holds both `Dazed` and `dazed`. The window
// reads `Dazed` as the standard Dazed, picking Dazed (or typing "hexed") adds nothing, and what the user wrote keeps its spelling.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { INIT, KEYCASE, addByKeyboard, menuOptions, modalRows, noteCondition, openConditionsModal, trackerIcons } from '../../driver/conditions';

describe('conditions-modal: condition keys in any case', () => {
	it('[COND-K01] a hand-written `Dazed` is the standard Dazed row (no CUSTOM tag) and `Hexed` stays custom; opening the window writes nothing', async () => {
		await dse.openNote(KEYCASE);
		await dse.expectNoWrite(KEYCASE, async () => {
			const root = dse.block(INIT);
			await dse.click(root.control('init.cond.add', { nth: 0 }));
			const modal = await dse.modal('conditions');
			expect(await modalRows()).toEqual([
				{ name: 'Dazed', custom: false, badges: [], editorOpen: false },
				{ name: 'Hexed', custom: true, badges: [], editorOpen: false },
			]);
			expect(await trackerIcons('hero')).toEqual(['Dazed', 'Hexed']);
			await dse.click(modal.control('modal.close'));
		});
	});

	it('[COND-K02] picking Dazed with `Dazed` present adds nothing and writes nothing; a later pick keeps the hand-written `Dazed` spelling and leaves one dazed condition', async () => {
		const { modal } = await openConditionsModal(KEYCASE, 'hero');
		await dse.click(modal.control('cond.add'));
		await dse.type(modal.control('cond.input'), 'daz');
		expect((await menuOptions()).names).toEqual(['Dazed', 'Add custom: "daz"']);
		await dse.expectNoWrite(KEYCASE, () => dse.press('Enter', modal.control('cond.input')));
		expect((await modalRows()).map((r) => r.name)).toEqual(['Dazed', 'Hexed']);
		await expect(modal.control('cond.input')).toHaveValue('daz');
		await expect(modal.control('cond.input')).toBeFocused();
		// An unrelated pick writes the note: the one dazed condition is still spelled `Dazed`.
		await dse.type(modal.control('cond.input'), 'gra', { replace: true });
		const w = await dse.waitForWrite(KEYCASE, () => dse.press('Enter', modal.control('cond.input')));
		expect(w.count).toBe(1);
		const block = (await dse.expectNoteBlock(KEYCASE, INIT).value()) as { heroes: Array<{ conditions: Array<Record<string, unknown>> }> };
		const keys = block.heroes[0].conditions.map((c) => c.key as string);
		expect(keys).toEqual(['Dazed', 'Hexed', 'grabbed']);
		expect(keys.filter((k) => k.toLowerCase() === 'dazed')).toHaveLength(1);
		expect(await dse.noteText(KEYCASE)).toContain('      - key: Dazed\n      - key: Hexed\n      - key: grabbed\n');
		await dse.closeModals();
	});

	it('[COND-K03] the Add menu treats `Dazed` as already present by option click, and a typed custom "hexed" as the present `Hexed`: no write, no new row', async () => {
		const { modal } = await openConditionsModal(KEYCASE, 'hero');
		await dse.click(modal.control('cond.add'));
		await dse.type(modal.control('cond.input'), 'Dazed');
		await dse.expectNoWrite(KEYCASE, () => dse.click(modal.control('cond.option', { nth: 0 })));
		await dse.type(modal.control('cond.input'), 'hexed', { replace: true });
		expect((await menuOptions()).names).toEqual(['Add custom: "hexed"']);
		await dse.expectNoWrite(KEYCASE, () => dse.press('Enter', modal.control('cond.input')));
		expect((await modalRows()).map((r) => r.name)).toEqual(['Dazed', 'Hexed']);
		await dse.closeModals();
	});

	it('[COND-K04] editing the hand-written `Dazed` (End of Turn) and removing `Hexed` act on those entries and keep the spelling', async () => {
		const { modal } = await openConditionsModal(KEYCASE, 'hero');
		await dse.click(modal.control('cond.edit', { nth: 0 }));
		const w = await dse.waitForWrite(KEYCASE, () => dse.click(modal.control('cond.duration', { nth: 1 })));
		expect(w.count).toBe(1);
		expect(await noteCondition(KEYCASE, 'hero', 0)).toEqual({ key: 'Dazed', duration: 'eot' });
		await dse.waitForWrite(KEYCASE, () => dse.click(modal.control('cond.remove', { nth: 1 })));
		expect((await modalRows()).map((r) => r.name)).toEqual(['Dazed']);
		await dse.closeModals();
		await dse.expectNoteBlock(KEYCASE, INIT).toMatchObject({ heroes: [{ conditions: [{ key: 'Dazed', duration: 'eot' }] }] });
		expect(await trackerIcons('hero')).toEqual(['Dazed']);
	});

	it('[COND-K05] a note already holding `Dazed` and `dazed` (Ogre #1) opens as two standard Dazed rows with no write; removing one leaves the other, nothing merged', async () => {
		await dse.openNote(KEYCASE);
		await dse.expectNoWrite(KEYCASE, async () => {
			const root = dse.block(INIT);
			await dse.click(root.control('init.cond.add', { nth: 1 }));
			const modal = await dse.modal('conditions');
			expect(await modalRows()).toEqual([
				{ name: 'Dazed', custom: false, badges: [], editorOpen: false },
				{ name: 'Dazed', custom: false, badges: ['EoT'], editorOpen: false },
			]);
			await dse.click(modal.control('modal.close'));
		});
		const { modal } = await openConditionsModal(KEYCASE, 'creature');
		await addByKeyboard(modal, 'Dazed'); // already present twice: still a no-op
		await dse.settle();
		await dse.waitForWrite(KEYCASE, () => dse.click(modal.control('cond.remove', { nth: 0 })));
		await dse.closeModals();
		expect(await noteCondition(KEYCASE, 'creature', 0)).toEqual({ key: 'dazed', duration: 'eot' });
	});
});
