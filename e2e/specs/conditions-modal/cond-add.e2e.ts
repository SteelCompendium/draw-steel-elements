// SC-436: the "+ Add condition" dropdown (a combobox) and custom conditions. Opening the dropdown, filtering it and
// moving the active option write nothing; every pick writes the note once, on the hero or the creature the window was
// opened from, and keeps the dropdown open for the next pick.
import { expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { INIT, TRACKER, addByKeyboard, menuOptions, modalNames, modalRows, openConditionsModal, openFrom, trackerIcons } from '../../driver/conditions';

describe('conditions-modal: the Add dropdown', () => {
	it('[COND-A01] "+ Add condition" opens the dropdown over the whole catalogue with the first option active, input focused, no write', async () => {
		await dse.openNote(TRACKER);
		const root = dse.block(INIT);
		await dse.expectNoWrite(TRACKER, async () => {
			const modal = await openFrom(root, 'hero');
			await dse.click(modal.control('cond.add'));
			await expect(modal.control('cond.input')).toBeFocused();
			await expect(modal.control('cond.add')).not.toBeExisting();
			const menu = await menuOptions();
			expect(menu.names.slice(0, 3)).toEqual(['Bleeding', 'Dazed', 'Frightened']);
			expect(menu.names).toContain('Grabbed');
			expect(menu.active).toBe(0);
			await dse.click(modal.control('modal.close'));
		});
	});

	it('[COND-A02] typing filters the catalogue and always ends with the "Add custom" row; clearing restores it; no write', async () => {
		await dse.openNote(TRACKER);
		const root = dse.block(INIT);
		await dse.expectNoWrite(TRACKER, async () => {
			const modal = await openFrom(root, 'hero');
			await dse.click(modal.control('cond.add'));
			await dse.type(modal.control('cond.input'), 'daz');
			expect((await menuOptions()).names).toEqual(['Dazed', 'Add custom: "daz"']);
			await dse.type(modal.control('cond.input'), 'zzq');
			expect((await menuOptions()).names).toEqual(['Add custom: "dazzzq"']);
			await dse.press('Control+a'); // (page-level keys: no target, so not a manifest pair)
			await dse.press('Backspace');
			expect((await menuOptions()).names.length).toBeGreaterThan(5);
			expect((await menuOptions()).names.some((n) => n.startsWith('Add custom'))).toBe(false);
			await dse.click(modal.control('modal.close'));
		});
	});

	it('[COND-A03] ArrowDown / ArrowUp move the active option (stopping at both ends) and Enter adds the active one: one write, dropdown stays open', async () => {
		const { modal } = await openConditionsModal(TRACKER, 'hero');
		await dse.click(modal.control('cond.add'));
		const input = modal.control('cond.input');
		await dse.press('ArrowUp', input);
		expect((await menuOptions()).active).toBe(0); // already at the top
		await dse.press('ArrowDown', input);
		await dse.press('ArrowDown', input);
		await dse.press('ArrowUp', input);
		expect(await menuOptions()).toMatchObject({ active: 1 });
		const w = await dse.waitForWrite(TRACKER, () => dse.press('Enter', input));
		expect(w.count).toBe(1);
		expect(await modalNames()).toEqual(['Dazed']);
		await expect(input).toBeFocused();
		expect((await menuOptions()).active).toBe(0); // reset to the top for the next pick
		await dse.expectNoteBlock(TRACKER, INIT).toMatchObject({ heroes: [{ name: 'Alice Alpha', conditions: [{ key: 'dazed' }] }] });
		expect(await trackerIcons('hero')).toEqual(['Dazed']);
		await dse.closeModals();
	});

	it('[COND-A04] clicking an option adds that condition with one write; the dropdown stays open, cleared and focused, for rapid multi-add', async () => {
		const { modal } = await openConditionsModal(TRACKER, 'hero');
		await dse.click(modal.control('cond.add'));
		await dse.type(modal.control('cond.input'), 'gra');
		await dse.waitForWrite(TRACKER, () => dse.click(modal.control('cond.option', { nth: 0 })));
		expect(await modalNames()).toEqual(['Grabbed']);
		await expect(modal.control('cond.input')).toBeFocused();
		await expect(modal.control('cond.input')).toHaveValue('');
		const w = await dse.waitForWrite(TRACKER, () => dse.click(modal.control('cond.option', { nth: 0 }))); // the first option is Bleeding again
		expect(w.count).toBe(1);
		expect(await modalNames()).toEqual(['Grabbed', 'Bleeding']);
		await dse.expectNoteBlock(TRACKER, INIT).toMatchObject({ heroes: [{ conditions: [{ key: 'grabbed' }, { key: 'bleeding' }] }] });
		await dse.closeModals();
	});

	it('[COND-A05] a click away from the dropdown (on the title) closes just the dropdown, back to "+ Add condition", no write', async () => {
		await dse.openNote(TRACKER);
		const root = dse.block(INIT);
		await dse.expectNoWrite(TRACKER, async () => {
			const modal = await openFrom(root, 'hero');
			await dse.click(modal.control('cond.add'));
			await dse.type(modal.control('cond.input'), 'daz');
			await dse.blur(modal.control('cond.input'));
			await expect(modal.control('cond.input')).not.toBeExisting();
			await expect(modal.control('cond.add')).toBeExisting();
			await expect(modal.root).toBeExisting();
			await dse.click(modal.control('modal.close'));
		});
	});

	it('[COND-A06] a condition the actor already has is not added twice: the pick is a no-op (no write), focus and text stay in the input', async () => {
		const { modal } = await openConditionsModal(TRACKER, 'hero');
		await addByKeyboard(modal, 'daz');
		await dse.settle();
		await dse.type(modal.control('cond.input'), 'daz');
		await dse.expectNoWrite(TRACKER, () => dse.press('Enter', modal.control('cond.input')));
		expect(await modalNames()).toEqual(['Dazed']);
		await expect(modal.control('cond.input')).toHaveValue('daz');
		await expect(modal.control('cond.input')).toBeFocused();
		await dse.closeModals();
	});

	it('[COND-A07] on the creature row the pick lands on the selected creature only: the hero and the other Ogres are untouched', async () => {
		const { modal } = await openConditionsModal(TRACKER, 'creature');
		await dse.click(modal.control('cond.add'));
		await dse.type(modal.control('cond.input'), 'gra');
		const w = await dse.waitForWrite(TRACKER, () => dse.press('Enter', modal.control('cond.input')));
		expect(w.count).toBe(1);
		const block = (await dse.expectNoteBlock(TRACKER, INIT).value()) as {
			heroes: Array<Record<string, unknown>>;
			enemy_groups: Array<{ creatures: Array<{ instances: Array<{ id: number; conditions?: unknown[] }> }> }>;
		};
		expect(block.heroes).toEqual([{ name: 'Alice Alpha', max_stamina: 30 }]);
		const inst = block.enemy_groups[0].creatures[0].instances;
		expect(inst.map((i) => i.conditions)).toEqual([[{ key: 'grabbed' }], [], []]);
		expect(await trackerIcons('creature')).toEqual(['Grabbed']);
		expect(await trackerIcons('hero')).toEqual([]);
		await dse.closeModals();
	});
});

describe('conditions-modal: custom conditions', () => {
	it('[COND-C01] typing a name nobody registered and pressing Enter adds a custom condition (slugged key, CUSTOM tag, fallback glyph in the tracker)', async () => {
		const { modal } = await openConditionsModal(TRACKER, 'hero');
		await dse.click(modal.control('cond.add'));
		await dse.type(modal.control('cond.input'), 'Fire Aura!');
		expect((await menuOptions()).names).toEqual(['Add custom: "Fire Aura!"']);
		const w = await dse.waitForWrite(TRACKER, () => dse.press('Enter', modal.control('cond.input')));
		expect(w.count).toBe(1);
		expect(await modalRows()).toEqual([{ name: 'Fire Aura', custom: true, badges: [], editorOpen: false }]);
		await dse.expectNoteBlock(TRACKER, INIT).toMatchObject({ heroes: [{ name: 'Alice Alpha', conditions: [{ key: 'fire-aura' }] }] });
		expect(await trackerIcons('hero')).toEqual(['Fire Aura']);
		await dse.closeModals();
	});

	it('[COND-C02] clicking the "Add custom" row adds the typed text as a condition, with one write', async () => {
		const { modal } = await openConditionsModal(TRACKER, 'creature');
		await dse.click(modal.control('cond.add'));
		await dse.type(modal.control('cond.input'), 'hexed');
		const options = (await menuOptions()).names;
		expect(options).toEqual(['Add custom: "hexed"']);
		const w = await dse.waitForWrite(TRACKER, () => dse.click(modal.control('cond.option', { nth: options.length - 1 })));
		expect(w.count).toBe(1);
		expect(await modalNames()).toEqual(['Hexed']);
		await dse.expectNoteBlock(TRACKER, INIT).toMatchObject({
			enemy_groups: [{ creatures: [{ instances: [{ id: 1, conditions: [{ key: 'hexed' }] }, { id: 2 }, { id: 3 }] }] }],
		});
		await dse.closeModals();
	});

	it('[COND-C03] punctuation-only text slugs to nothing: Enter adds no row and writes nothing', async () => {
		const { modal } = await openConditionsModal(TRACKER, 'hero');
		await dse.click(modal.control('cond.add'));
		await dse.type(modal.control('cond.input'), '!!!');
		await dse.expectNoWrite(TRACKER, () => dse.press('Enter', modal.control('cond.input')));
		expect(await modalNames()).toEqual([]);
		await dse.closeModals();
	});
});

describe('conditions-modal: known bugs on the Add dropdown', () => {
	knownBug('SC-257', '[COND-C04] a custom condition named in a non-Latin script is added (it slugs to an empty key today and the pick is silently dropped)', async () => {
		const { modal } = await openConditionsModal(TRACKER, 'hero');
		await dse.click(modal.control('cond.add'));
		await dse.type(modal.control('cond.input'), '\u706b'); // 火
		await dse.press('Enter', modal.control('cond.input'));
		await dse.settle();
		expect(await modalNames()).toHaveLength(1);
	}, { failsWith: /Received length: 0/ });
});
