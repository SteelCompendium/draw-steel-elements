// SC-191 impl spec §D "the ⋯ overflow (add a round / add a hero / set limits… / Clear
// all / Reset progress)" — the two chrome items that need a Director-typed value before
// they can act ("Add a hero" needs a name; "Set limits…" needs two numbers). "Add a
// round", "Clear all" and "Reset progress" need no input and fire straight from the
// chrome item's own `onClick` (view.ts) — these two small `kit/managedModal`s are the
// odd ones out, on the same DseModal base every other DSE modal uses.
import type { App } from 'obsidian';
import { DseModal, stampControl } from '@/framework/kit';

export class MontageAddHeroModal extends DseModal {
	private readonly onAdd: (name: string) => void;
	private readonly heroNamed: (name: string) => string | undefined;

	/** `heroNamed` answers the board's spelling of the hero a typed name would duplicate (or `undefined`).
	 *  It is asked on every keystroke and again on Add, never cached: a hero an outside edit adds while
	 *  the window is open counts (SC-627). */
	constructor(app: App, onAdd: (name: string) => void, heroNamed: (name: string) => string | undefined = () => undefined) {
		super(app);
		this.onAdd = onAdd;
		this.heroNamed = heroNamed;
	}

	onOpen(): void {
		this.setDseTitle('Add a hero');
		const input = this.body.createEl('input', { cls: 'dse-mt__sheet-input', type: 'text' });
		input.setAttribute('placeholder', "Hero's name");
		input.setAttribute('aria-label', "Hero's name");
		stampControl(input, 'montage.add-hero.name');
		// The same warn element LogActionModal uses for the skill-reuse rule: `hidden` unless it fires.
		const warn = this.body.createDiv({ cls: 'dse-mt__sheet-warn' });
		warn.setAttribute('role', 'alert');
		warn.hidden = true;

		const [, addBtn] = this.footer([
			{ label: 'Cancel', text: 'Cancel', control: 'montage.add-hero.cancel', variant: 'ghost', onClick: () => this.close() },
			{
				label: 'Add',
				text: 'Add',
				control: 'montage.add-hero.submit',
				variant: 'accent',
				disabled: true,
				onClick: () => {
					const name = input.value.trim();
					if (!name || this.heroNamed(name) !== undefined) {
						refresh();
						return;
					}
					this.onAdd(name);
					this.close();
				},
			},
		]);
		const refresh = (): void => {
			const taken = this.heroNamed(input.value);
			warn.setText(taken === undefined ? '' : `${taken} is already on the board`);
			warn.hidden = taken === undefined;
			addBtn.setDisabled(input.value.trim() === '' || taken !== undefined);
		};
		this.lifecycle.registerDomEvent(input, 'input', refresh);
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
		stampControl(successInput, 'montage.limits.success');

		const failureRow = this.body.createDiv({ cls: 'dse-mt__sheet-field' });
		failureRow.createSpan({ cls: 'dse-mt__sheet-label', text: 'Failure limit' });
		const failureInput = failureRow.createEl('input', { cls: 'dse-mt__sheet-input', type: 'number' });
		failureInput.value = String(this.failureLimit);
		failureInput.setAttribute('min', '0');
		failureInput.setAttribute('aria-label', 'Failure limit');
		stampControl(failureInput, 'montage.limits.failure');

		this.footer([
			{ label: 'Cancel', text: 'Cancel', control: 'montage.limits.cancel', variant: 'ghost', onClick: () => this.close() },
			{
				label: 'Save',
				text: 'Save',
				control: 'montage.limits.save',
				variant: 'accent',
				onClick: () => {
					this.onSave(Number(successInput.value) || 0, Number(failureInput.value) || 0);
					this.close();
				},
			},
		]);
	}
}
