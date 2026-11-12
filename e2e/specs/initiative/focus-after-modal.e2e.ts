// A modal the tracker opens takes focus, and Obsidian hands it back to the control that held it when the modal closes. The pool
// modal's Apply rebuilds the whole tracker and the Conditions window rebuilds its conditions row, so that control was gone and focus
// fell to <body>: a keyboard user pressed Enter on Apply and had to Tab in from the top of the note. The tracker now remembers the
// focused control when the modal opens and gives it to its rebuilt successor once the modal has closed. The mapping per route:
//   pool modal from the detail row's Stamina control (keyboard) -> Apply        -> the rebuilt detail row Stamina control
//   pool modal from a keyboard-focused roster cell, double-click -> Apply       -> the rebuilt cell of the same minion
//   Stamina modal from a roster cell, double-click -> Apply                     -> the same cell (a repaint in place; nothing to rebuild)
//   Conditions window from Add Condition (keyboard) -> add one, Escape, Escape  -> the rebuilt Add Condition button
//   pool modal -> Escape: no rebuild, and focus lands on the opener as before.
// The roster cells open the Stamina edit only on a double-click, so the keyboard route to the same edit is: select the cell with Enter,
// then press the detail row's Stamina control (INIT-F12). Reading view only (Live Preview losing focus on the tracker's own write is
// another matter). Initiative/squad.md: five Goblins of 4 Stamina (pool 20), Goblin #1 selected; Initiative/tracker.md: Alice Alpha and
// three Ogres of 60.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { INIT, SQUAD } from '../../driver/pool';

const TRACKER = 'Initiative/tracker.md';
const TABS = 80; // Tab presses from the top of the note to the control (the chrome panel and the whole tracker are in the way)

/** What holds focus: its control id, the roster cell it is in (by instance key), whether it is inside the Reading view's tracker (not
 *  the hidden Live Preview copy) and whether it draws the ring. */
const focusState = () =>
	dse.page<{ ctl: string | null; cell: string | null; inTracker: boolean; ring: boolean }>(`(() => {
		const a = document.activeElement;
		return {
			ctl: a?.closest('[data-dse-control]')?.getAttribute('data-dse-control') ?? null,
			cell: a?.closest('.dse-init__cell')?.getAttribute('data-instance-key') ?? null,
			inTracker: !!a?.closest('.markdown-reading-view [data-dse-element="initiative"]'),
			ring: !!a && a.matches(':focus-visible'),
		};
	})()`);

type Modal = Awaited<ReturnType<typeof dse.modal>>;

/** Stage 3 damage on one minion in the open pool modal, then reach Apply with Tab. */
async function stagePoolAndReachApply(modal: Modal): Promise<ReturnType<Modal['control']>> {
	await dse.type(modal.control('pool.damage-amount'), '3', { replace: true });
	await dse.type(modal.control('pool.minion-count'), '1', { replace: true });
	await dse.click(modal.control('pool.apply-damage'));
	const apply = modal.control('pool.apply');
	await dse.tabTo(apply, 30);
	return apply;
}

describe('initiative: keyboard focus after a modal whose save replaces its opener', () => {
	it('[INIT-F07] pool modal from the detail row Stamina control, Apply with Enter: the rebuilt Stamina control holds focus, with the keyboard ring', async () => {
		await dse.openNote(SQUAD);
		const root = dse.block(INIT);
		const numeric = root.control('init.detail.stamina');
		await dse.tabTo(numeric, TABS);
		await dse.press('Enter', numeric);
		const modal = await dse.modal('minion-pool');
		const apply = await stagePoolAndReachApply(modal);
		await dse.waitForWrite(SQUAD, () => dse.press('Enter', apply));
		await expect(modal.root).not.toBeExisting();
		await dse.settle();
		await expect(root.control('init.detail.stamina')).toHaveElementProperty('textContent', '17/20 (4)'); // the tracker was rebuilt from the edit
		expect(await focusState()).toEqual({ ctl: 'init.detail.stamina', cell: null, inTracker: true, ring: true });
	});

	it('[INIT-F08] pool modal from a keyboard-focused roster cell (double-click), Apply with Enter: the rebuilt cell of the same minion holds focus', async () => {
		await dse.openNote(SQUAD);
		const root = dse.block(INIT);
		const cell = root.control('init.cell.stamina', { nth: 2 });
		await dse.tabTo(cell, TABS);
		await dse.dblclick(cell);
		const modal = await dse.modal('minion-pool');
		const apply = await stagePoolAndReachApply(modal);
		await dse.waitForWrite(SQUAD, () => dse.press('Enter', apply));
		await expect(modal.root).not.toBeExisting();
		await dse.settle();
		await expect(root.control('init.detail.stamina')).toHaveElementProperty('textContent', '17/20 (4)');
		const now = await focusState();
		expect([now.ctl, now.cell, now.inTracker]).toEqual(['init.cell.stamina', '0-3', true]); // Goblin #3, the cell that was double-clicked
	});

	it('[INIT-F09] Stamina modal from a keyboard-focused roster cell (double-click), Apply with Enter: focus stays on that cell', async () => {
		await dse.openNote(TRACKER);
		const root = dse.block(INIT);
		const cell = root.control('init.cell.stamina', { nth: 1 });
		await dse.tabTo(cell, TABS);
		await dse.dblclick(cell);
		const modal = await dse.modal('stamina-edit');
		await dse.type(modal.control('sedit.apply-amount'), '5', { replace: true });
		await dse.click(modal.control('sedit.damage'));
		const apply = modal.control('sedit.apply');
		await dse.tabTo(apply, 30);
		await dse.waitForWrite(TRACKER, () => dse.press('Enter', apply));
		await expect(modal.root).not.toBeExisting();
		await dse.settle();
		await expect(cell).toHaveText('55/60');
		const now = await focusState();
		expect([now.ctl, now.cell, now.inTracker]).toEqual(['init.cell.stamina', '0-2', true]);
	});

	it('[INIT-F10] Escape in the pool modal: nothing is written and focus lands on the Stamina control that opened it', async () => {
		await dse.openNote(SQUAD);
		const root = dse.block(INIT);
		const numeric = root.control('init.detail.stamina');
		await dse.tabTo(numeric, TABS);
		await dse.press('Enter', numeric);
		const modal = await dse.modal('minion-pool');
		await dse.expectNoWrite(SQUAD, () => dse.press('Escape', dse.aimedAt('modal.close')));
		await expect(modal.root).not.toBeExisting();
		expect(await focusState()).toEqual({ ctl: 'init.detail.stamina', cell: null, inTracker: true, ring: true });
	});

	it('[INIT-F11] Conditions window from Add Condition (keyboard), a condition added, Escape twice: the rebuilt Add Condition button holds focus', async () => {
		await dse.openNote(TRACKER);
		const root = dse.block(INIT);
		const add = root.control('init.cond.add', { nth: 0 }); // the hero's
		await dse.tabTo(add, TABS);
		await dse.press('Enter', add);
		const modal = await dse.modal('conditions');
		await dse.click(modal.control('cond.add'));
		await dse.type(modal.control('cond.input'), 'daz');
		await dse.waitForWrite(TRACKER, () => dse.press('Enter', modal.control('cond.input')));
		await expect(root.control('init.cond.remove')).toBeExisting(); // the hero's row was rebuilt behind the window
		await dse.press('Escape', modal.control('cond.input')); // the first Escape backs out of the Add dropdown only
		await expect(modal.root).toBeExisting();
		await dse.press('Escape', modal.control('cond.add'));
		await expect(modal.root).not.toBeExisting();
		await dse.settle();
		expect(await focusState()).toEqual({ ctl: 'init.cond.add', cell: null, inTracker: true, ring: true });
	});

	it('[INIT-F12] a roster cell edits Stamina on a double-click only, but the keyboard reaches the same edit: Enter selects the cell, the detail row Stamina control opens it', async () => {
		await dse.openNote(TRACKER);
		const root = dse.block(INIT);
		const cell = root.control('init.cell.stamina', { nth: 1 }); // Ogre #2
		await dse.tabTo(cell, TABS);
		await dse.waitForWrite(TRACKER, () => dse.press('Enter', cell));
		const numeric = root.control('init.detail.stamina');
		await expect(numeric).toHaveAttribute('aria-label', 'Edit Stamina: Ogre #2');
		await dse.tabTo(numeric, TABS);
		await dse.press('Enter', numeric);
		const modal = await dse.modal('stamina-edit');
		await dse.type(modal.control('sedit.apply-amount'), '5', { replace: true });
		await dse.click(modal.control('sedit.damage'));
		await dse.waitForWrite(TRACKER, () => dse.click(modal.control('sedit.apply')));
		await expect(cell).toHaveText('55/60');
		await expect(root.control('init.cell.stamina', { nth: 0 })).toHaveText('60/60');
	});
});
