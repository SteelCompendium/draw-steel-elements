// SC-408 e2e driver: stamina-surface helpers composed from `dse` (specs import these from
// driver/ too). Per-test setup lives here, not in a `beforeEach`: a throwing beforeEach makes
// mocha skip the rest of the suite, so every test opens its own note.
import { expect } from '@wdio/globals';
import { dse } from './dse';

/** Open `note` in Reading view, click its ds-stamina-bar, return the open stamina modal. */
export async function openBarModal(note: string) {
	await dse.openNote(note);
	await dse.click(dse.block('ds-stamina-bar').control('stamina.bar'));
	return dse.modal('stamina-edit');
}

type Modal = Awaited<ReturnType<typeof dse.modal>>;

/** The footer Apply button's current label ("Lose 3 Stamina", "No Stamina Change", ...). */
export const applyLabel = (modal: Modal) => modal.control('sedit.apply').getText();

/** Assert the Apply button's label (the user-visible description of the pending edit). */
export async function expectApplyLabel(modal: Modal, text: string, opts?: { wait?: number; message?: string }): Promise<void> {
	await expect(modal.control('sedit.apply')).toHaveText(text, opts);
}

/** Type a magnitude into the Apply box (replacing its content) and press Damage or Healing. */
export async function applyAmount(modal: Modal, amount: string, button: 'sedit.damage' | 'sedit.healing'): Promise<void> {
	await dse.type(modal.control('sedit.apply-amount'), amount, { replace: true });
	await dse.click(modal.control(button));
}

/** Click Apply and wait for the single resulting write; returns the write count. */
export async function applyAndWrite(modal: Modal, note: string): Promise<number> {
	const w = await dse.waitForWrite(note, () => dse.click(modal.control('sedit.apply')));
	await expect(modal.root).not.toBeExisting();
	return w.count;
}

/** The notice (toast) texts currently on screen. */
export const noticeTexts = (): Promise<string[]> =>
	dse.page<string[]>(`Array.from(document.querySelectorAll('.notice')).map((n) => n.textContent)`);
