// SC-191 impl spec §D "the ⋯ overflow (add a round / add a hero / set limits… / Clear
// all / Reset progress)" — the two chrome items that need a Director-typed value before
// they can act ("Add a hero" needs a name; "Set limits…" needs two numbers). "Add a
// round", "Clear all" and "Reset progress" need no input and fire straight from the
// chrome item's own `onClick` (view.ts) — these two small `kit/managedModal`s are the
// odd ones out, on the same DseModal base every other DSE modal uses.
import type { App } from 'obsidian';
import { DseModal } from '@/framework/kit';

export class MontageAddHeroModal extends DseModal {
	private readonly onAdd: (name: string) => void;

	constructor(app: App, onAdd: (name: string) => void) {
		super(app);
		this.onAdd = onAdd;
	}

	onOpen(): void {
		this.setDseTitle('Add a hero');
		const input = this.body.createEl('input', { cls: 'dse-mt__sheet-input', type: 'text' });
		input.setAttribute('placeholder', "Hero's name");
		input.setAttribute('aria-label', "Hero's name");

		const [, addBtn] = this.footer([
			{ label: 'Cancel', text: 'Cancel', variant: 'ghost', onClick: () => this.close() },
			{
				label: 'Add',
				text: 'Add',
				variant: 'accent',
				disabled: true,
				onClick: () => {
					const name = input.value.trim();
					if (!name) return;
					this.onAdd(name);
					this.close();
				},
			},
		]);
		this.lifecycle.registerDomEvent(input, 'input', () => addBtn.setDisabled(input.value.trim() === ''));
	}
}

export class MontageSetLimitsModal extends DseModal {
	private readonly successLimit: number;
	private readonly failureLimit: number;
	private readonly onSave: (successLimit: number, failureLimit: number) => void;

	constructor(app: App, successLimit: number, failureLimit: number, onSave: (successLimit: number, failureLimit: number) => void) {
		super(app);
		this.successLimit = successLimit;
		this.failureLimit = failureLimit;
		this.onSave = onSave;
	}

	onOpen(): void {
		this.setDseTitle('Set limits…');

		const successRow = this.body.createDiv({ cls: 'dse-mt__sheet-field' });
		successRow.createSpan({ cls: 'dse-mt__sheet-label', text: 'Success limit' });
		const successInput = successRow.createEl('input', { cls: 'dse-mt__sheet-input', type: 'number' });
		successInput.value = String(this.successLimit);
		successInput.setAttribute('min', '0');
		successInput.setAttribute('aria-label', 'Success limit');

		const failureRow = this.body.createDiv({ cls: 'dse-mt__sheet-field' });
		failureRow.createSpan({ cls: 'dse-mt__sheet-label', text: 'Failure limit' });
		const failureInput = failureRow.createEl('input', { cls: 'dse-mt__sheet-input', type: 'number' });
		failureInput.value = String(this.failureLimit);
		failureInput.setAttribute('min', '0');
		failureInput.setAttribute('aria-label', 'Failure limit');

		this.footer([
			{ label: 'Cancel', text: 'Cancel', variant: 'ghost', onClick: () => this.close() },
			{
				label: 'Save',
				text: 'Save',
				variant: 'accent',
				onClick: () => {
					this.onSave(Number(successInput.value) || 0, Number(failureInput.value) || 0);
					this.close();
				},
			},
		]);
	}
}
