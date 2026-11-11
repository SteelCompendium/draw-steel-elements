// SC-435: a minion's condition icons in the pool modal. A click removes that condition and saves at once (the
// modal stays open), and later damage in the same session saves again (DC-6). Initiative/squad-hurt.md: Goblin #3
// is grabbed and dazed; pool 10 with #1 and #2 dead.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { applyPoolAndWrite, conditionGlyphs, conditionNames, CUSTOM, expectPoolApply, HURT, INIT, openPoolModal } from '../../driver/pool';

const instance3 = (extra: Record<string, unknown>) => ({ enemy_groups: [{ name: 'Goblin Squad', creatures: [{ instances: [{ id: 1 }, { id: 2 }, { id: 3, ...extra }, { id: 4 }, { id: 5 }] }] }] });

describe('minion pool: condition icons', () => {
	it('[POOL-C01] a click on an icon removes that one condition: one write at once, the modal stays open, the other icon stays', async () => {
		const { modal } = await openPoolModal(HURT);
		expect(await conditionNames()).toEqual(['Grabbed', 'Dazed']);
		const w = await dse.waitForWrite(HURT, () => dse.click(modal.control('pool.condition', { nth: 0 })));
		expect(w.count).toBe(1);
		await expect(modal.root).toBeExisting();
		expect(await conditionNames()).toEqual(['Dazed']);
		expect(await focusOnConditionIcon()).toBe(false); // a mouse click hands focus to nothing (the SC-572 hand-off is keyboard-only)
		// (the tracker writes a condition back in its object form, `{ key }`)
		await dse.expectNoteBlock(HURT, INIT).toMatchObject(instance3({ conditions: [{ key: 'dazed' }] }));
		await dse.expectNoWrite(HURT, () => dse.click(modal.control('modal.close')));
	});

	it('[POOL-C02] DC-6: a condition removed and then damage applied in one session both land (the rebuild after the removal leaves the modal usable)', async () => {
		const { root, modal } = await openPoolModal(HURT);
		const first = await dse.waitForWrite(HURT, () => dse.click(modal.control('pool.condition', { nth: 0 })));
		expect(first.count).toBe(1);
		await dse.type(modal.control('pool.stamina.input'), '9', { replace: true });
		await dse.press('Enter', modal.control('pool.stamina.input'));
		await expectPoolApply(modal, 'Deal 1 damage');
		expect(await applyPoolAndWrite(modal, HURT)).toBe(1);
		await dse.expectNoteBlock(HURT, INIT).toMatchObject({
			enemy_groups: [{ name: 'Goblin Squad', minion_stamina_pool: 9, creatures: [{ instances: [{ id: 1 }, { id: 2 }, { id: 3, conditions: [{ key: 'dazed' }] }, { id: 4 }, { id: 5 }] }] }],
		});
		await expect(root.control('init.detail.stamina')).toHaveElementProperty('textContent', '9/20 (4)');
	});

	it('[POOL-C03] removing both conditions empties the minion\'s row; staged damage survives each removal', async () => {
		const { modal } = await openPoolModal(HURT);
		await dse.type(modal.control('pool.damage-amount'), '1', { replace: true });
		await dse.click(modal.control('pool.apply-damage')); // the count box still says 1
		await expectPoolApply(modal, 'Deal 1 damage');
		await dse.waitForWrite(HURT, () => dse.click(modal.control('pool.condition', { nth: 0 })));
		await dse.waitForWrite(HURT, () => dse.click(modal.control('pool.condition', { nth: 0 })));
		expect(await conditionNames()).toEqual([]);
		await expectPoolApply(modal, 'Deal 1 damage'); // nothing staged was lost
		await dse.expectNoteBlock(HURT, INIT).toMatchObject(instance3({ conditions: [] }));
		await dse.expectNoWrite(HURT, () => dse.click(modal.control('modal.close')));
	});
});

// SC-574: a custom condition (a key Draw Steel does not know) is drawn like any other, with the initiative tracker's
// fallback glyph, so it can be seen and removed here; and a click removes the ONE entry it is on, not every copy of a
// repeated plain-text condition. Initiative/squad-custom.md: Goblin #3 has on-fire, grabbed, grabbed, dazed.
describe('minion pool: custom and repeated conditions', () => {
	it('[POOL-C07] a custom condition shows the fallback glyph under a readable name, and a click removes it and saves at once', async () => {
		const { modal } = await openPoolModal(CUSTOM);
		expect(await conditionNames()).toEqual(['On Fire', 'Grabbed', 'Grabbed', 'Dazed']);
		const glyphs = await conditionGlyphs();
		expect(glyphs[0]).toBe('circle-dashed'); // the tracker's fallback for a key it does not know
		expect(glyphs[1]).not.toBe('circle-dashed'); // a built-in condition keeps its own glyph
		await expect(modal.control('pool.condition', { nth: 0 })).toHaveElementProperty('tagName', 'BUTTON');
		const w = await dse.waitForWrite(CUSTOM, () => dse.click(modal.control('pool.condition', { nth: 0 })));
		expect(w.count).toBe(1);
		await expect(modal.root).toBeExisting();
		expect(await conditionNames()).toEqual(['Grabbed', 'Grabbed', 'Dazed']);
		await dse.expectNoteBlock(CUSTOM, INIT).toMatchObject(instance3({ conditions: [{ key: 'grabbed' }, { key: 'grabbed' }, { key: 'dazed' }] }));
		await dse.expectNoWrite(CUSTOM, () => dse.click(modal.control('modal.close')));
	});

	it('[POOL-C08] one click on a condition that appears twice as plain text removes that one copy, and the second copy removes the second', async () => {
		const { modal } = await openPoolModal(CUSTOM);
		expect(await conditionNames()).toEqual(['On Fire', 'Grabbed', 'Grabbed', 'Dazed']);
		const first = await dse.waitForWrite(CUSTOM, () => dse.click(modal.control('pool.condition', { nth: 2 }))); // the SECOND grabbed
		expect(first.count).toBe(1);
		expect(await conditionNames()).toEqual(['On Fire', 'Grabbed', 'Dazed']);
		await dse.expectNoteBlock(CUSTOM, INIT).toMatchObject(instance3({ conditions: [{ key: 'on-fire' }, { key: 'grabbed' }, { key: 'dazed' }] }));
		const second = await dse.waitForWrite(CUSTOM, () => dse.click(modal.control('pool.condition', { nth: 1 }))); // the remaining grabbed
		expect(second.count).toBe(1);
		expect(await conditionNames()).toEqual(['On Fire', 'Dazed']);
		await dse.expectNoteBlock(CUSTOM, INIT).toMatchObject(instance3({ conditions: [{ key: 'on-fire' }, { key: 'dazed' }] }));
		await dse.expectNoWrite(CUSTOM, () => dse.click(modal.control('modal.close')));
	});
});

const focusOnConditionIcon = (): Promise<boolean> =>
	dse.page<boolean>(`document.activeElement?.matches('[data-dse-control="pool.condition"]') ?? false`);
const focusInsideModal = (): Promise<boolean> =>
	dse.page<boolean>(`!!document.activeElement && document.activeElement !== document.body && !!document.activeElement.closest('.modal-container .dse-modal')`);
const focusedName = (): Promise<string | null> => dse.page<string | null>(`document.activeElement?.getAttribute('aria-label') ?? null`);

// SC-572: the condition icon is a real <button> named "Remove <condition>": Tab reaches it (and draws the kit focus
// ring), Enter and Space each remove that one condition (and save at once), like a click; other keys do nothing; and
// focus stays on the icon that took the removed one's place (never <body>, as in the Conditions modal).
describe('minion pool: condition icons by keyboard', () => {
	for (const [id, key] of [['POOL-C04', 'Enter'], ['POOL-C05', 'Space']] as const) {
		it(`[${id}] Tab reaches a condition icon (ringed), other keys do nothing, ${key} removes that condition and focus moves to the next icon`, async () => {
			const { modal } = await openPoolModal(HURT);
			expect(await conditionNames()).toEqual(['Grabbed', 'Dazed']); // setup: both icons are drawn
			const icon = modal.control('pool.condition', { nth: 0 });
			await expect(icon).toHaveElementProperty('tagName', 'BUTTON');
			await expect(icon).toHaveAttribute('aria-label', 'Remove Grabbed');
			await dse.tabTo(icon, 40);
			// the kit focus ring (a shape cue, not hue-only): a 2px solid outline
			expect(await dse.page<string>(`getComputedStyle(document.activeElement).outlineStyle + ' ' + getComputedStyle(document.activeElement).outlineWidth`)).toBe('solid 2px');
			// a key that is not Enter or Space leaves the condition alone (browser.keys: not a recorded press of this control)
			await dse.expectNoWrite(HURT, async () => {
				await browser.keys('a');
				await browser.keys('ArrowRight');
			});
			expect(await conditionNames()).toEqual(['Grabbed', 'Dazed']);
			const w = await dse.waitForWrite(HURT, () => dse.press(key, icon));
			expect(w.count).toBe(1);
			await dse.settle();
			expect(await conditionNames()).toEqual(['Dazed']);
			expect(await dse.focusedControl()).toBe('pool.condition'); // focus followed the shifted icon: not <body>
			expect(await focusedName()).toBe('Remove Dazed');
			await dse.expectNoteBlock(HURT, INIT).toMatchObject(instance3({ conditions: [{ key: 'dazed' }] }));
			await dse.expectNoWrite(HURT, () => dse.click(modal.control('modal.close')));
		});
	}

	it('[POOL-C06] removing the last condition by keyboard moves focus to the damage field (inside the modal, not <body>, not a footer button)', async () => {
		const { modal } = await openPoolModal(HURT);
		await dse.tabTo(modal.control('pool.condition', { nth: 0 }), 40);
		await dse.waitForWrite(HURT, () => dse.press('Enter', modal.control('pool.condition', { nth: 0 })));
		await dse.settle();
		expect(await focusedName()).toBe('Remove Dazed');
		await dse.waitForWrite(HURT, () => dse.press('Space', modal.control('pool.condition', { nth: 0 })));
		await dse.settle();
		expect(await conditionNames()).toEqual([]);
		expect(await focusInsideModal()).toBe(true);
		expect(await dse.focusedControl()).toBe('pool.damage-amount'); // never Reset/Apply: a second Enter there would throw away staged input
		await dse.expectNoteBlock(HURT, INIT).toMatchObject(instance3({ conditions: [] }));
		await dse.expectNoWrite(HURT, () => dse.click(modal.control('modal.close')));
	});
});
