// SC-435: a minion's condition icons in the pool modal. A click removes that condition and saves at once (the
// modal stays open), and later damage in the same session saves again (DC-6). Initiative/squad-hurt.md: Goblin #3
// is grabbed and dazed; pool 10 with #1 and #2 dead.
import { expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { applyPoolAndWrite, conditionTitles, expectPoolApply, HURT, INIT, openPoolModal } from '../../driver/pool';

const instance3 = (extra: Record<string, unknown>) => ({ enemy_groups: [{ name: 'Goblin Squad', creatures: [{ instances: [{ id: 1 }, { id: 2 }, { id: 3, ...extra }, { id: 4 }, { id: 5 }] }] }] });

describe('minion pool: condition icons', () => {
	it('[POOL-C01] a click on an icon removes that one condition: one write at once, the modal stays open, the other icon stays', async () => {
		const { modal } = await openPoolModal(HURT);
		expect(await conditionTitles()).toEqual(['Grabbed', 'Dazed']);
		const w = await dse.waitForWrite(HURT, () => dse.click(modal.control('pool.condition', { nth: 0 })));
		expect(w.count).toBe(1);
		await expect(modal.root).toBeExisting();
		expect(await conditionTitles()).toEqual(['Dazed']);
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
		expect(await conditionTitles()).toEqual([]);
		await expectPoolApply(modal, 'Deal 1 damage'); // nothing staged was lost
		await dse.expectNoteBlock(HURT, INIT).toMatchObject(instance3({ conditions: [] }));
		await dse.expectNoWrite(HURT, () => dse.click(modal.control('modal.close')));
	});
});

// SC-572 (MEDIUM, a11y): the condition icon is a click-only <div> with no tabindex, role or name, so a keyboard user
// can never remove a condition here. The marker states the CORRECT behaviour; when SC-572 is fixed it goes red
// ("appears fixed"): remove it, add `press:Enter` (and the icon's name) to manifest/minion-pool-modal.ts, and keep a plain driver.
describe('minion pool: condition icons by keyboard', () => {
	knownBug('SC-572', '[POOL-C04] Tab reaches a condition icon and Enter removes that condition', async () => {
		const { modal } = await openPoolModal(HURT);
		expect(await conditionTitles()).toEqual(['Grabbed', 'Dazed']); // setup: both icons are drawn
		const icon = modal.control('pool.condition', { nth: 0 });
		await dse.tabTo(icon, 40);
		await dse.press('Enter', icon);
		await dse.settle();
		expect(await conditionTitles()).toEqual(['Dazed']);
	}, { failsWith: /Tab did not reach the control/ });
});
