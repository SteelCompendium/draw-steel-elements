// SC-435: the Apply Damage row (damage per minion x minions hit), the kill checkboxes and their labels, the
// auto-check at a 0 pool, Reset and Apply, and what the tracker shows afterwards (the detail-row rebuild).
// Initiative/squad.md: five Goblins of 4 Stamina (pool 20); Initiative/squad-hurt.md: pool 10, #1 and #2 dead,
// #3 selected. The kill arithmetic itself is the jsdom matrix's job; each case here drives it with real input.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { applyPoolAndWrite, cellText, expectPoolApply, HURT, INIT, openPoolModal, poolBoxes, poolInfo, SQUAD } from '../../driver/pool';

type Modal = Awaited<ReturnType<typeof dse.modal>>;
const group = (extra: Record<string, unknown>) => ({ enemy_groups: [{ name: 'Goblin Squad', ...extra }] });

/** Type `damage` and `minions` into the Apply Damage row and press its button. */
async function hit(modal: Modal, damage: string, minions: string): Promise<void> {
	await dse.type(modal.control('pool.damage-amount'), damage, { replace: true });
	await dse.type(modal.control('pool.minion-count'), minions, { replace: true });
	await dse.click(modal.control('pool.apply-damage'));
}

describe('minion pool: the Apply Damage row', () => {
	it('[POOL-A01] 3 damage to 1 minion lowers the pool to 17, no kill owed; Apply writes it once and the tracker repaints', async () => {
		const { root, modal } = await openPoolModal(SQUAD);
		await hit(modal, '3', '1');
		await expect(modal.control('pool.stamina.input')).toHaveValue('17');
		await expectPoolApply(modal, 'Deal 3 damage');
		expect(await applyPoolAndWrite(modal, SQUAD)).toBe(1);
		await dse.expectNoteBlock(SQUAD, INIT).toMatchObject(group({ minion_stamina_pool: 17 }));
		await expect(root.control('init.detail.stamina')).toHaveElementProperty('textContent', '17/20 (4)');
		expect(await cellText(root, '0-4')).toBe('17/20 (4)');
	});

	it('[POOL-A02] a typed count past the living minions is capped and shown capped (SC-429); 99 damage x 5 empties the pool', async () => {
		const { modal } = await openPoolModal(SQUAD);
		await hit(modal, '1', '9');
		await expect(modal.control('pool.minion-count')).toHaveValue('5'); // the box shows what was applied
		await expect(modal.control('pool.stamina.input')).toHaveValue('15'); // 5 damage, not 9
		await expectPoolApply(modal, 'Deal 5 damage, kill 1 minion(s)');
		await hit(modal, '99', '5');
		await expect(modal.control('pool.stamina.input')).toHaveValue('0');
		expect(await poolBoxes()).toBe('xxxxx'); // an empty pool ticks and locks every living minion
		await dse.expectNoWrite(SQUAD, () => dse.click(modal.control('modal.close')));
	});

	it('[POOL-A03] the count box\'s spinner stops at the LIVING minions: with 2 of 5 dead, ArrowUp from 1 reaches 3 and no further (SC-429)', async () => {
		const { modal } = await openPoolModal(HURT);
		const count = modal.control('pool.minion-count');
		await dse.type(count, '1', { replace: true });
		for (let i = 0; i < 5; i++) await dse.press('ArrowUp', count);
		await expect(count).toHaveValue('3');
		await dse.expectNoWrite(HURT, () => dse.click(modal.control('modal.close')));
	});

	it('[POOL-A04] at rest the info line is hidden (no "0 damage will kill 0 minion(s)", SC-429); damage shows it; Reset hides it again', async () => {
		const { modal } = await openPoolModal(SQUAD);
		expect(await poolInfo()).toEqual({ text: '', hidden: true });
		await hit(modal, '2', '1');
		expect(await poolInfo()).toEqual({ text: '2 damage will kill 0 minion(s).', hidden: false });
		await dse.click(modal.control('pool.reset'));
		expect(await poolInfo()).toEqual({ text: '', hidden: true });
		await dse.expectNoWrite(SQUAD, () => dse.click(modal.control('modal.close')));
	});
});

describe('minion pool: the kill boxes', () => {
	it('[POOL-K01] two deaths owed: tick two boxes (the rest lock), a click on a locked box does nothing; Apply kills exactly those two', async () => {
		const { root, modal } = await openPoolModal(SQUAD);
		await dse.type(modal.control('pool.stamina.input'), '12', { replace: true });
		await dse.press('Enter', modal.control('pool.stamina.input'));
		await dse.click(modal.control('pool.kill', { nth: 1 }));
		expect(await poolBoxes()).toBe('.o...');
		await expect(modal.control('pool.apply')).toBeDisabled(); // 1 of 2
		await dse.click(modal.control('pool.kill', { nth: 3 }));
		expect(await poolBoxes()).toBe('-o-o-');
		await expect(modal.control('pool.apply')).toBeEnabled();
		await dse.click(modal.control('pool.kill', { nth: 0 })); // locked: nothing happens
		expect(await poolBoxes()).toBe('-o-o-');
		expect(await applyPoolAndWrite(modal, SQUAD)).toBe(1);
		await dse.expectNoteBlock(SQUAD, INIT).toMatchObject(
			group({ minion_stamina_pool: 12, creatures: [{ instances: [{ id: 1 }, { id: 2, isDead: true }, { id: 3 }, { id: 4, isDead: true }, { id: 5 }] }] }),
		);
		// The detail-row rebuild: the dead minions' cells say DEAD, the living ones show the new pool, the selection stayed.
		expect(await cellText(root, '0-2')).toBe('DEAD');
		expect(await cellText(root, '0-4')).toBe('DEAD');
		expect(await cellText(root, '0-1')).toBe('12/20 (4)');
		expect(await cellText(root, '0-5')).toBe('12/20 (4)');
		await expect(root.control('init.detail.stamina')).toHaveAttribute('aria-label', 'Edit Stamina: Goblin #1');
	});

	it('[POOL-K02] a click on a minion\'s NAME ticks its box like the box does, and again unticks it', async () => {
		const { modal } = await openPoolModal(SQUAD);
		await dse.type(modal.control('pool.stamina.input'), '16', { replace: true });
		await dse.press('Enter', modal.control('pool.stamina.input'));
		await dse.click(modal.control('pool.minion-name', { nth: 2 }));
		expect(await poolBoxes()).toBe('--o--');
		await expect(modal.control('pool.apply')).toBeEnabled();
		await dse.click(modal.control('pool.minion-name', { nth: 2 }));
		expect(await poolBoxes()).toBe('.....');
		await expect(modal.control('pool.apply')).toBeDisabled();
		await dse.expectNoWrite(SQUAD, () => dse.click(modal.control('modal.close')));
	});

	it('[POOL-K03] SC-429 item 1: a pool lowered to 0 ticks and locks every box; raising it to 1 un-ticks them, and Apply is reachable by ticking 4', async () => {
		const { root, modal } = await openPoolModal(SQUAD);
		await dse.type(modal.control('pool.stamina.input'), '0', { replace: true });
		await dse.press('Enter', modal.control('pool.stamina.input'));
		expect(await poolBoxes()).toBe('xxxxx');
		await expect(modal.control('pool.apply')).toBeEnabled();
		await dse.click(modal.control('pool.stamina.inc'));
		await expect(modal.control('pool.stamina.input')).toHaveValue('1');
		expect(await poolBoxes()).toBe('.....'); // the auto-ticks are gone and the boxes are open again
		await expectPoolApply(modal, 'Deal 19 damage, kill 4 minion(s)');
		await expect(modal.control('pool.apply')).toBeDisabled();
		await expect(modal.control('pool.apply')).toHaveAttribute('title', 'Select 4 minion(s) to kill');
		for (const nth of [0, 1, 2, 3]) await dse.click(modal.control('pool.kill', { nth }));
		expect(await poolBoxes()).toBe('oooo-');
		await expect(modal.control('pool.apply')).toBeEnabled();
		expect(await applyPoolAndWrite(modal, SQUAD)).toBe(1);
		await dse.expectNoteBlock(SQUAD, INIT).toMatchObject(
			group({ minion_stamina_pool: 1, creatures: [{ instances: [{ isDead: true }, { isDead: true }, { isDead: true }, { isDead: true }, { id: 5 }] }] }),
		);
		expect(await cellText(root, '0-5')).toBe('1/20 (4)');
	});

	it('[POOL-K04] the whole squad: pool 0 ticks all five and Apply kills them; the selected minion\'s detail row reads DEAD', async () => {
		const { root, modal } = await openPoolModal(SQUAD);
		await dse.type(modal.control('pool.stamina.input'), '0', { replace: true });
		await dse.press('Enter', modal.control('pool.stamina.input'));
		await expectPoolApply(modal, 'Deal 20 damage, kill 5 minion(s)');
		expect(await applyPoolAndWrite(modal, SQUAD)).toBe(1);
		await dse.expectNoteBlock(SQUAD, INIT).toMatchObject(
			group({ minion_stamina_pool: 0, creatures: [{ instances: [{ isDead: true }, { isDead: true }, { isDead: true }, { isDead: true }, { isDead: true }] }] }),
		);
		for (const key of ['0-1', '0-2', '0-3', '0-4', '0-5']) expect(await cellText(root, key)).toBe('DEAD');
		await expect(root.control({ css: '.dse-init__detail .dse-init__stamina' })).toHaveElementProperty('textContent', 'DEAD');
	});
});

describe('minion pool: Reset and a disabled Apply', () => {
	it('[POOL-F01] Reset throws away damage, ticks and the Apply row: the opening state is back and nothing is written', async () => {
		const { modal } = await openPoolModal(SQUAD);
		await hit(modal, '3', '2'); // 6 damage: one death owed
		await dse.click(modal.control('pool.kill', { nth: 0 }));
		await expectPoolApply(modal, 'Deal 6 damage, kill 1 minion(s)');
		await dse.expectNoWrite(SQUAD, () => dse.click(modal.control('pool.reset')));
		await expect(modal.control('pool.stamina.input')).toHaveValue('20');
		await expectPoolApply(modal, 'No Stamina Change');
		await expect(modal.control('pool.apply')).toBeDisabled();
		expect(await poolBoxes()).toBe('-----');
		await expect(modal.control('pool.damage-amount')).toHaveValue('0');
		await expect(modal.control('pool.minion-count')).toHaveValue('1');
		await expect(modal.root).toBeExisting();
		await dse.expectNoWrite(SQUAD, () => dse.click(modal.control('modal.close')));
	});

	it('[POOL-F02] Apply is dead while it is disabled: nothing staged, and a kill owed but not ticked; neither writes', async () => {
		const { modal } = await openPoolModal(SQUAD);
		await dse.expectNoWrite(SQUAD, () => dse.click(modal.control('pool.apply'))); // nothing staged
		await dse.type(modal.control('pool.stamina.input'), '16', { replace: true });
		await dse.press('Enter', modal.control('pool.stamina.input'));
		await expectPoolApply(modal, 'Deal 4 damage, kill 1 minion(s)');
		await dse.expectNoWrite(SQUAD, () => dse.click(modal.control('pool.apply'))); // one death owed, none ticked
		await expect(modal.root).toBeExisting();
		await dse.expectNoWrite(SQUAD, () => dse.click(modal.control('modal.close')));
	});
});
