// Plan 09 Task 8 (D2 §3.x) — the reset-encounter confirm on the kit managedModal:
// title wired via aria-labelledby, the message in .dse-modal__body, and a footer of
// REAL kit <button>s (CB-8) — Cancel first (it takes the §2.6 initial focus: the safe
// default for a destructive confirm) and a danger-variant "Yes, Reset". Escape-close
// and the focus trap stay Obsidian Modal defaults; Initiative (T9) opens this through
// openManagedModal for the F1 §4.5 owner-unload auto-close. The constructor signature
// (app, onConfirm) and the confirm-then-close behavior are the legacy contract,
// unchanged.
import type { App } from 'obsidian';
import { DseModal } from '@/framework/kit';

export class ResetEncounterModal extends DseModal {
	private onConfirm: () => void;

	constructor(app: App, onConfirm: () => void) {
		super(app);
		this.onConfirm = onConfirm;
	}

	onOpen() {
		this.setDseTitle('Confirm Encounter Reset');

		this.body.createEl('p', {
			text:
				'Are you sure you want to reset the encounter data?  ' +
				'All state will be lost including current stamina, conditions, turn tracker, and villain power.',
		});

		this.footer([
			{ label: 'Cancel', text: 'Cancel', onClick: () => this.close() },
			{
				label: 'Yes, Reset',
				text: 'Yes, Reset',
				variant: 'danger',
				onClick: () => {
					this.onConfirm();
					this.close();
				},
			},
		]);
	}
}
