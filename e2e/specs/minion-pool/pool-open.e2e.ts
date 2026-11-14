// SC-435: opening and leaving the minion stamina pool modal. Reached from a minion squad's roster cell
// (double-click), the detail row's numeric control (keyboard) and its row bar (click); left by Apply, Reset,
// Cancel (the X, the backdrop) and Escape. Initiative/squad.md: five Goblins of 4 Stamina (pool 20);
// Initiative/squad-hurt.md: pool 10, Goblins #1 and #2 dead.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { expectPoolApply, HURT, INIT, openPoolModal, poolBoxes, SQUAD, TWO_SQUADS } from '../../driver/pool';

const title = (modal: Awaited<ReturnType<typeof dse.modal>>) => modal.control({ css: '.dse-modal__title-text' });

describe('minion pool: opening', () => {
	it('[POOL-E01] a real double-click on a roster cell opens the squad pool modal on the full pool, with focus on the damage box (SC-429)', async () => {
		const { modal } = await openPoolModal(SQUAD, 'cell', 2);
		await expect(title(modal)).toHaveText('Goblin Squad - Minion Stamina Pool', { ignoreCase: true });
		await expect(modal.control('pool.stamina.input')).toHaveValue('20');
		await expect(modal.control({ css: '.dse-sedit__max' })).toHaveText('/ 20');
		await expectPoolApply(modal, 'No Stamina Change');
		await expect(modal.control('pool.apply')).toBeDisabled();
		// SC-429 item 2: the first control is the Apply box, never "Decrease Stamina pool".
		expect(await dse.focusedControl()).toBe('pool.damage-amount');
		await dse.settle(); // the cell click's selection write lands with the modal open; the modal survives it
		await expect(modal.root).toBeExisting();
		await dse.expectNoWrite(SQUAD, () => dse.click(modal.control('modal.close')));
	});

	it('[POOL-E02] Space and Enter pressed right after opening change nothing (SC-429: they used to decrement the pool)', async () => {
		const { modal } = await openPoolModal(SQUAD, 'cell');
		await dse.press('Space');
		await dse.press('Enter');
		await expect(modal.control('pool.stamina.input')).toHaveValue('20');
		await expectPoolApply(modal, 'No Stamina Change');
		await dse.settle(); // the cell click's selection write lands before the no-write check starts
		await dse.expectNoWrite(SQUAD, () => dse.click(modal.control('modal.close')));
	});

	it('[POOL-E03] the detail row numeric control (keyboard: Tab + Enter) opens the pool modal', async () => {
		const { modal } = await openPoolModal(SQUAD, 'numeric');
		await expect(title(modal)).toHaveText('Goblin Squad - Minion Stamina Pool', { ignoreCase: true });
		await expect(modal.control('pool.stamina.input')).toHaveValue('20');
		await dse.expectNoWrite(SQUAD, () => dse.click(modal.control('modal.close')));
	});

	it('[POOL-E04] clicking the detail row bar opens the pool modal; a dead minion is not selected, so its row has no kill box', async () => {
		const { modal } = await openPoolModal(HURT, 'bar');
		await expect(modal.control('pool.stamina.input')).toHaveValue('10');
		await expect(modal.control({ css: '.dse-sedit__max' })).toHaveText('/ 20');
		expect(await poolBoxes()).toBe('---'); // #3, #4, #5 are alive; #1 and #2 have no row
		await expect(modal.control('pool.minion-count')).toHaveAttribute('max', '3'); // SC-429: living minions only
		await dse.expectNoWrite(HURT, () => dse.click(modal.control('modal.close')));
	});

	it('[POOL-E05] double-clicking a DEAD minion\'s cell opens the same squad pool modal', async () => {
		const { modal } = await openPoolModal(HURT, 'cell', 0);
		await expect(modal.control('pool.stamina.input')).toHaveValue('10');
		expect(await poolBoxes()).toBe('---');
		await dse.settle();
		await dse.expectNoWrite(HURT, () => dse.click(modal.control('modal.close')));
	});
});

// SC-569: a group holding several squads names the squad in each pool modal's title; a group with one keeps the plain title.
// Initiative/two-squads.md: "Wolves" (Wolf, Dire Wolf) and "River" (two squads of Flow of the River), two cells per squad.
describe('minion pool: titles in a group of several squads', () => {
	/** Open the pool modal from roster cell `nth` of the two-squads note and return its title; the modal is closed again. */
	async function titleOfSquadAt(nth: number): Promise<string> {
		const { modal } = await openPoolModal(TWO_SQUADS, 'cell', nth);
		const text = (await title(modal).getProperty('textContent')) as string; // the real text; the Steel theme upper-cases it on screen
		await dse.settle(); // the cell click's selection write lands with the modal open
		await dse.click(modal.control('modal.close'));
		await expect(modal.root).not.toBeExisting();
		return text;
	}

	it('[POOL-E06] two differently named squads in one group: each pool modal is titled with its creature, and the two titles differ', async () => {
		const first = await titleOfSquadAt(0);
		const second = await titleOfSquadAt(2);
		expect(first).toBe('Wolves - Wolf - Minion Stamina Pool');
		expect(second).toBe('Wolves - Dire Wolf - Minion Stamina Pool');
		expect(first).not.toBe(second);
	});

	it('[POOL-E07] two squads of the same creature in one group: the titles number them "(squad 1)" and "(squad 2)", top to bottom', async () => {
		const first = await titleOfSquadAt(4);
		const second = await titleOfSquadAt(6);
		expect(first).toBe('River - Flow of the River (squad 1) - Minion Stamina Pool');
		expect(second).toBe('River - Flow of the River (squad 2) - Minion Stamina Pool');
		expect(first).not.toBe(second);
	});
});

describe('minion pool: leaving without a write', () => {
	/** Stage damage and a kill tick, so there is something to throw away. */
	async function stage(modal: Awaited<ReturnType<typeof dse.modal>>): Promise<void> {
		await dse.type(modal.control('pool.stamina.input'), '12', { replace: true });
		await dse.press('Enter', modal.control('pool.stamina.input'));
		await dse.click(modal.control('pool.kill', { nth: 0 }));
		await expectPoolApply(modal, 'Deal 8 damage, kill 2 minion(s)');
	}

	it('[POOL-F04] the X and a click on the backdrop each discard the staged edit: no write, the modal closes', async () => {
		const first = await openPoolModal(SQUAD, 'bar');
		// Staging AND cancelling sit inside the no-write window: a tick or a typed value that saved early would show here.
		await dse.expectNoWrite(SQUAD, async () => {
			await stage(first.modal);
			await dse.click(first.modal.control('modal.close'));
		});
		await expect(first.modal.root).not.toBeExisting();
		const again = await openPoolModal(SQUAD, 'bar');
		await dse.expectNoWrite(SQUAD, async () => {
			await stage(again.modal);
			await dse.click(again.modal.control('modal.backdrop'), { inset: 5 });
		});
		await expect(again.modal.root).not.toBeExisting();
		expect(await dse.noteText(SQUAD)).toContain('amount: 5'); // the note still holds the fixture's squad, nothing staged landed
		await dse.expectNoteBlock(SQUAD, INIT).toMatchObject({ enemy_groups: [{ name: 'Goblin Squad' }] });
	});

	it('[POOL-F05] Escape closes the modal from the Apply box and writes nothing', async () => {
		const { modal } = await openPoolModal(SQUAD, 'bar');
		await dse.expectNoWrite(SQUAD, async () => {
			await stage(modal);
			await dse.type(modal.control('pool.damage-amount'), '0', { replace: true }); // focus moves to a field that holds no draft
			await dse.press('Escape', dse.aimedAt('modal.close'));
		});
		await expect(modal.root).not.toBeExisting();
	});
});
