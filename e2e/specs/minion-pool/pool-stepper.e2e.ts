// SC-435: the pool stepper (± buttons, typed value), the death ladder it drives and the refused heal. The
// ladder's arithmetic lives in the jsdom matrix (test/dom/views/minion-stamina-pool-modal-matrix.test.ts);
// here real key and pointer events drive the stepper and the note + screen are checked.
// Initiative/squad.md: five Goblins of 4 Stamina (pool 20); Initiative/squad-hurt.md: pool 10, #1 and #2 dead.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { applyPoolAndWrite, cellText, expectPoolApply, HURT, INIT, openPoolModal, poolBoxes, poolInfo, SQUAD } from '../../driver/pool';

const group = (extra: Record<string, unknown>) => ({ enemy_groups: [{ name: 'Goblin Squad', ...extra }] });

describe('minion pool: the stepper buttons', () => {
	it('[POOL-S01] - - + steps the pool to 19; Apply writes it once and the tracker repaints every cell', async () => {
		const { root, modal } = await openPoolModal(SQUAD);
		await dse.click(modal.control('pool.stamina.dec'));
		await dse.click(modal.control('pool.stamina.dec'));
		await dse.click(modal.control('pool.stamina.inc'));
		await expect(modal.control('pool.stamina.input')).toHaveValue('19');
		await expectPoolApply(modal, 'Deal 1 damage');
		expect(await poolBoxes()).toBe('-----'); // under a minion's worth: nobody owed
		expect(await applyPoolAndWrite(modal, SQUAD)).toBe(1);
		await dse.expectNoteBlock(SQUAD, INIT).toMatchObject(group({ minion_stamina_pool: 19 }));
		await expect(root.control('init.detail.stamina')).toHaveElementProperty('textContent', '19/20 (4)');
		for (const key of ['0-1', '0-2', '0-3', '0-4', '0-5']) expect(await cellText(root, key)).toBe('19/20 (4)');
	});

	it('[POOL-S02] a disabled stepper button does nothing: Increase at the full pool, Decrease at 0', async () => {
		const { modal } = await openPoolModal(SQUAD);
		await expect(modal.control('pool.stamina.inc')).toBeDisabled();
		await dse.click(modal.control('pool.stamina.inc'));
		await expect(modal.control('pool.stamina.input')).toHaveValue('20');
		await expectPoolApply(modal, 'No Stamina Change');
		await dse.type(modal.control('pool.stamina.input'), '0', { replace: true });
		await dse.press('Enter', modal.control('pool.stamina.input'));
		await expect(modal.control('pool.stamina.dec')).toBeDisabled();
		await dse.click(modal.control('pool.stamina.dec'));
		await expect(modal.control('pool.stamina.input')).toHaveValue('0');
		await expectPoolApply(modal, 'Deal 20 damage, kill 5 minion(s)');
		await dse.expectNoWrite(SQUAD, () => dse.click(modal.control('modal.close')));
	});

	it('[POOL-S06] a keyboard user: Tab to Increase, Enter heals within the living minions\' share, and the next Enter is refused with a reason', async () => {
		const { modal } = await openPoolModal(HURT); // pool 10 with two dead: the share is 12
		const inc = modal.control('pool.stamina.inc');
		await dse.tabTo(inc, 30);
		await dse.press('Enter', inc);
		await dse.press('Enter', inc);
		await expect(modal.control('pool.stamina.input')).toHaveValue('12');
		await expectPoolApply(modal, 'Heal 2 stamina');
		await expect(modal.control('pool.apply')).toBeEnabled();
		await expect(modal.control({ css: '.dse-sedit__warn' })).toBeDisplayed(); // "minions cannot regain stamina"
		// The share (12) is reached: one more step is a heal past a dead minion's share.
		await dse.click(inc);
		await expect(modal.control('pool.stamina.input')).toHaveValue('13');
		expect((await poolInfo()).text).toBe("A heal can't raise the pool above the living minions' share (12 stamina).");
		await expect(modal.control('pool.apply')).toBeDisabled();
		await expect(modal.control('pool.apply')).toHaveAttribute('title', "Minions can't regain Stamina past a dead minion's share (at most 12)");
		await dse.expectNoWrite(HURT, () => dse.click(modal.control('modal.close')));
	});
});

describe('minion pool: the typed pool value', () => {
	it('[POOL-S03] typing 12 and pressing Enter stages 8 damage = 2 deaths: label, info line and open boxes follow; Apply waits for two ticks', async () => {
		const { modal } = await openPoolModal(SQUAD);
		const input = modal.control('pool.stamina.input');
		await dse.type(input, '12', { replace: true });
		await dse.press('Enter', input);
		await expectPoolApply(modal, 'Deal 8 damage, kill 2 minion(s)');
		await expect(modal.control('pool.apply')).toBeDisabled();
		expect(await poolBoxes()).toBe('.....');
		const info = await poolInfo();
		expect(info.hidden).toBe(false);
		expect(info.text).toBe('8 damage will kill 2 minion(s). \nSelect 2 minion(s) to kill.');
		await dse.expectNoWrite(SQUAD, () => dse.click(modal.control('modal.close')));
	});

	it('[POOL-S04] typing then clicking elsewhere commits the same way as Enter (blur), and a half-typed value is a draft until then', async () => {
		const { modal } = await openPoolModal(SQUAD);
		const input = modal.control('pool.stamina.input');
		await dse.type(input, '16', { replace: true });
		// SC-430: Apply already shows the post-commit state while the field is still focused.
		await expectPoolApply(modal, 'Deal 4 damage, kill 1 minion(s)');
		await dse.blur(input);
		await expect(input).toHaveValue('16');
		await expectPoolApply(modal, 'Deal 4 damage, kill 1 minion(s)');
		expect(await poolBoxes()).toBe('.....');
		await dse.expectNoWrite(SQUAD, () => dse.click(modal.control('modal.close')));
	});

	it('[POOL-S05] Escape on a typed draft puts the old value back and keeps the modal open; the next Escape closes it, with no write', async () => {
		const { modal } = await openPoolModal(SQUAD);
		const input = modal.control('pool.stamina.input');
		await dse.type(input, '12', { replace: true });
		await expectPoolApply(modal, 'Deal 8 damage, kill 2 minion(s)');
		await dse.press('Escape', input);
		await expect(input).toHaveValue('20');
		await expectPoolApply(modal, 'No Stamina Change');
		await expect(modal.root).toBeExisting(); // SC-431: the first Escape only reverts the draft
		await dse.expectNoWrite(SQUAD, () => dse.press('Escape', dse.aimedAt('modal.close')));
		await expect(modal.root).not.toBeExisting();
	});

	it('[POOL-S07] typing a value and clicking Apply straight away: the blur commits it and the click still lands, one write', async () => {
		const { modal } = await openPoolModal(SQUAD);
		await dse.type(modal.control('pool.stamina.input'), '18', { replace: true });
		await expectPoolApply(modal, 'Deal 2 damage');
		expect(await applyPoolAndWrite(modal, SQUAD)).toBe(1);
		await dse.expectNoteBlock(SQUAD, INIT).toMatchObject(group({ minion_stamina_pool: 18 }));
	});
});

describe('minion pool: heals', () => {
	it('[POOL-H01] a heal inside the share is staged with the warning icon and Apply raises the pool; the dead stay dead', async () => {
		const { root, modal } = await openPoolModal(HURT);
		await dse.click(modal.control('pool.stamina.inc'));
		await dse.click(modal.control('pool.stamina.inc'));
		await expectPoolApply(modal, 'Heal 2 stamina');
		expect((await poolInfo()).text).toBe('Heal 2 stamina; dead minions stay dead.');
		expect(await applyPoolAndWrite(modal, HURT)).toBe(1);
		await dse.expectNoteBlock(HURT, INIT).toMatchObject(
			group({ minion_stamina_pool: 12, creatures: [{ instances: [{ id: 1, isDead: true }, { id: 2, isDead: true }, { id: 3 }, { id: 4 }, { id: 5 }] }] }),
		);
		expect(await cellText(root, '0-1')).toBe('DEAD');
		expect(await cellText(root, '0-3')).toBe('12/20 (4)');
	});

	it('[POOL-H02] a heal past a dead minion\'s share is refused: the reason shows, Apply is disabled and a click on it writes nothing', async () => {
		const { modal } = await openPoolModal(HURT);
		await dse.type(modal.control('pool.stamina.input'), '13', { replace: true });
		await dse.press('Enter', modal.control('pool.stamina.input'));
		expect((await poolInfo()).text).toBe("A heal can't raise the pool above the living minions' share (12 stamina).");
		const apply = modal.control('pool.apply');
		await expect(apply).toBeDisabled();
		await expect(apply).toHaveAttribute('title', "Minions can't regain Stamina past a dead minion's share (at most 12)");
		await expect(apply).toHaveText('Heal 3 stamina'); // the visible text stays the action
		await expect(apply).toHaveAttribute('aria-label', "Heal 3 stamina — Minions can't regain Stamina past a dead minion's share (at most 12)");
		await dse.expectNoWrite(HURT, () => dse.click(apply)); // disabled: the click is dead
		await expect(modal.root).toBeExisting();
		await dse.expectNoWrite(HURT, () => dse.click(modal.control('modal.close')));
	});
});

describe('minion pool: a keyboard press that disables the focused button', () => {
	it('[POOL-S08] Enter on Decrease at pool 1 steps to 0, and focus moves to the pool field instead of falling to the page (SC-495 class)', async () => {
		const { modal } = await openPoolModal(SQUAD);
		const input = modal.control('pool.stamina.input');
		await dse.type(input, '1', { replace: true });
		await dse.press('Enter', input);
		const dec = modal.control('pool.stamina.dec');
		await dse.tabTo(dec, 40);
		await dse.press('Enter', dec);
		await expect(input).toHaveValue('0');
		await expect(dec).toBeDisabled();
		expect(await dse.focusedControl()).toBe('pool.stamina.input');
		await dse.expectNoWrite(SQUAD, () => dse.click(modal.control('modal.close')));
	});
});
