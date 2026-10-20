// SC-432 — the confirmation shown on the FIRST press of the relabelled "Heal Recovery Value"
// button in a Stamina modal session, for a hero whose block tracks no Recoveries pool. The
// press heals one Recovery's worth and spends nothing (there is no pool to spend from); this
// dialog says so before the heal is staged. Scott (2026-10-18): "Maybe make a confirmation
// dialog for the hero without a pool to ensure the user understands".
//
// Same shape as ResetEncounterModal (kit DseModal: title via aria-labelledby, message in the
// body, a footer of real kit buttons, Cancel first so it takes the §2.6 initial focus — the safe
// default). Escape and the X close ONLY this dialog (Obsidian closes the topmost modal; the
// Stamina modal underneath keeps its pending state). Opened through openManagedModal by the
// Stamina modal, so it also closes if the Stamina modal does.
import type { App } from 'obsidian';
import { DseModal } from '@/framework/kit';

/** The relabelled button's visible text (SC-432): it heals, it does not spend. */
export const FREE_HEAL_LABEL = 'Heal Recovery Value';
/** Its tooltip / accessible name leads with the visible text, then says what it does NOT do
 *  (SC-324 name-then-explanation pattern, kit `labelWithReason`). */
export const FREE_HEAL_NOTE = 'Spends no Recovery';

export const FREE_HEAL_CONFIRM_TITLE = 'Heal without spending a Recovery?';
export const FREE_HEAL_CONFIRM_CANCEL = 'Cancel';
export const FREE_HEAL_CONFIRM_OK = 'Heal';

/** The dialog's message. `amount` is the Recovery value (null when unknown). */
export function freeHealConfirmMessage(amount: number | null): string {
	const worth = amount === null ? "one Recovery's worth of Stamina" : `one Recovery's worth of Stamina (${amount})`;
	return (
		`This hero has no Recoveries tracked, so there is no Recovery to spend. ` +
		`${FREE_HEAL_LABEL} heals ${worth}, stopping at maximum Stamina, and does not track or spend a Recovery. ` +
		`You won't be asked again while this window is open.`
	);
}

export class FreeHealConfirmModal extends DseModal {
	constructor(
		app: App,
		private readonly amount: number | null,
		private readonly onConfirm: () => void,
		/** Runs after the dialog is gone, however it closed (Confirm, Cancel, Escape, X). */
		private readonly onDismissed: () => void = () => {},
	) {
		super(app);
	}

	onOpen() {
		this.setDseTitle(FREE_HEAL_CONFIRM_TITLE);
		this.body.createEl('p', { text: freeHealConfirmMessage(this.amount) });
		this.footer([
			{
				label: FREE_HEAL_CONFIRM_CANCEL,
				text: FREE_HEAL_CONFIRM_CANCEL,
				control: 'sedit.free-heal.cancel',
				onClick: () => this.close(),
			},
			{
				label: FREE_HEAL_CONFIRM_OK,
				text: FREE_HEAL_CONFIRM_OK,
				control: 'sedit.free-heal.confirm',
				variant: 'accent',
				onClick: () => {
					this.onConfirm();
					this.close();
				},
			},
		]);
	}

	onClose() {
		this.onDismissed();
	}
}
