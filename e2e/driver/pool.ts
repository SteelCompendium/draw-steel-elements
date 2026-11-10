// SC-435 e2e driver: helpers for the minion stamina pool modal, composed from `dse` (the way driver/stamina.ts
// is for the StaminaEditModal). Per-test setup lives here, not in a `beforeEach`.
import { expect } from '@wdio/globals';
import { dse } from './dse';

export const SQUAD = 'Initiative/squad.md'; // five Goblins of 4 Stamina (pool 20), nobody hurt
export const HURT = 'Initiative/squad-hurt.md'; // pool 10, Goblins #1 and #2 dead, #3 grabbed + dazed (selected)
export const INIT = 'ds-initiative';

type Scope = ReturnType<typeof dse.block>;
type Modal = Awaited<ReturnType<typeof dse.modal>>;

/** How the pool modal is opened from the tracker: a roster cell (double-click), the detail row's numeric control
 *  (keyboard: Tab + Enter, the Steel theme stands it down for the pointer) or the detail row's bar (click). */
export type PoolEntry = 'cell' | 'numeric' | 'bar';

/** Open `note` in Reading view and open its squad's pool modal. `nth` picks the roster cell for `cell`. */
export async function openPoolModal(note: string, via: PoolEntry = 'bar', nth = 0): Promise<{ root: Scope; modal: Modal }> {
	await dse.openNote(note);
	const root = dse.block(INIT);
	if (via === 'cell') await dse.dblclick(root.control('init.cell.stamina', { nth }));
	else if (via === 'bar') await dse.click(root.control('init.detail.bar'));
	else {
		const numeric = root.control('init.detail.stamina');
		await dse.tabTo(numeric, 80);
		await dse.press('Enter', numeric);
	}
	return { root, modal: await dse.modal('minion-pool') };
}

/** Assert the footer Apply button's label ("No Stamina Change", "Deal 8 damage, kill 2 minion(s)", ...). */
export const expectPoolApply = (modal: Modal, text: string, opts?: { wait?: number; message?: string }): Promise<void> =>
	expect(modal.control('pool.apply')).toHaveText(text, opts);

/**
 * The kill boxes as one string, top to bottom: `.` open, `o` ticked, `-` locked open, `x` locked ticked (the same
 * notation as the jsdom matrix). A page-side read: the repeated checkbox nodes of the one open pool modal.
 */
export const poolBoxes = (): Promise<string> =>
	dse.page<string>(`Array.from(document.querySelectorAll('.modal-container .dse-modal [data-dse-control="pool.kill"]'))
		.map((b) => (b.checked ? (b.disabled ? 'x' : 'o') : b.disabled ? '-' : '.')).join('')`);

/** The info line above the footer (`.dse-sedit__info`): its text and whether it is hidden. */
export const poolInfo = (): Promise<{ text: string; hidden: boolean }> =>
	dse.page<{ text: string; hidden: boolean }>(`(() => {
		const el = document.querySelector('.modal-container .dse-modal .dse-sedit__info');
		return { text: el.textContent, hidden: el.hidden };
	})()`);

/** Click Apply and wait for the single resulting write; the modal closes. Returns the write count. */
export async function applyPoolAndWrite(modal: Modal, note: string): Promise<number> {
	const w = await dse.waitForWrite(note, () => dse.click(modal.control('pool.apply')));
	await expect(modal.root).not.toBeExisting();
	return w.count;
}

/** The text a roster cell (by its `data-instance-key`, "0-3" = group 0, instance 3) shows, read as a property. */
export const cellText = (root: Scope, key: string): Promise<string> =>
	root.control({ css: `.dse-init__cell[data-instance-key="${key}"] .dse-init__cell-stamina` }).getProperty('textContent') as Promise<string>;

/** The titles of the condition icons the open pool modal shows, top to bottom ("Grabbed", "Dazed"). */
export const conditionTitles = (): Promise<string[]> =>
	dse.page<string[]>(`Array.from(document.querySelectorAll('.modal-container .dse-modal [data-dse-control="pool.condition"]')).map((i) => i.title)`);
