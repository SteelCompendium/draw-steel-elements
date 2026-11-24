// SC-191 impl spec §D "the ⋯ overflow (add a round / add a hero / set limits… / Clear
// all / Reset progress)" — the two chrome items that need a Director-typed value before
// they can act ("Add a hero" needs a name; "Set limits…" needs two numbers). "Add a
// round", "Clear all" and "Reset progress" need no input and fire straight from the
// chrome item's own `onClick` (view.ts) — these two small `kit/managedModal`s are the
// odd ones out, on the same DseModal base every other DSE modal uses. SC-690 adds a third,
// "Remove a hero": it needs a choice (which hero), and it deletes from the note, so it
// names what will go before it is pressed.
import type { App } from 'obsidian';
import { setIcon } from 'obsidian';
import { DseModal, setPressedState, stampControl } from '@/framework/kit';
import { FOCUS_AT_ATTR } from '@/framework/kit/controlFocus';
import type { MontageHeroRemoval } from './model';

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

/** SC-690 — the one plain line a picked hero gets: what Remove will take with them. Said before the press, so the press needs no
 *  second question (the window itself is the second step: menu, pick, Remove). */
export function removalSummary(name: string, removal: MontageHeroRemoval): string {
	if (removal.actions > 0) {
		const them = removal.actions === 1 ? 'It is' : 'They are';
		return `${name} has ${removal.actions} logged ${removal.actions === 1 ? 'action' : 'actions'}. ${them} removed too, and the tally follows.`;
	}
	if (removal.shared > 0) return `Another hero is also named ${name}, so the logged actions stay with that row.`;
	return `${name} has no logged actions.`;
}

export class MontageRemoveHeroModal extends DseModal {
	private readonly heroes: () => string[];
	private readonly removalOf: (name: string) => MontageHeroRemoval;
	private readonly onRemove: (name: string) => void;

	/** `heroes` answers the names on the board now, in board order, and `removalOf` what Remove would do to one of them. Both are
	 *  read from the LIVE model when the window opens and again when a hero is picked, never cached; `onRemove` checks the board once
	 *  more before it writes (SC-627's rule for Add a hero). */
	constructor(
		app: App,
		heroes: () => string[],
		removalOf: (name: string) => MontageHeroRemoval,
		onRemove: (name: string) => void,
	) {
		super(app);
		this.heroes = heroes;
		this.removalOf = removalOf;
		this.onRemove = onRemove;
	}

	onOpen(): void {
		this.setDseTitle('Remove a hero');
		let picked: string | undefined;
		const chips: HTMLButtonElement[] = [];
		// One option per hero, each a pressed-state chip like the Log an action sheet's Result chips: the picked one carries a check
		// as well as the accent border, so the choice never rests on colour alone.
		const list = this.body.createDiv({ cls: 'dse-mt__sheet-herolist' });
		list.setAttribute('role', 'group');
		list.setAttribute('aria-label', 'Hero to remove');
		const summary = this.body.createDiv({ cls: 'dse-mt__sheet-consequence' });
		summary.setAttribute('role', 'status');
		summary.hidden = true;

		const [, removeBtn] = this.footer([
			{ label: 'Cancel', text: 'Cancel', control: 'montage.remove-hero.cancel', variant: 'ghost', onClick: () => this.close() },
			{
				label: 'Remove',
				text: 'Remove',
				control: 'montage.remove-hero.submit',
				variant: 'danger',
				disabled: true,
				onClick: () => {
					if (picked === undefined) return;
					this.onRemove(picked);
					this.close();
				},
			},
		]);

		for (const name of this.heroes()) {
			const chip = list.createEl('button', { cls: 'dse-optchip dse-mt__sheet-herochip' });
			chip.setAttribute('type', 'button');
			chip.setAttribute('aria-label', name);
			chip.setAttribute(FOCUS_AT_ATTR, name); // named by the hero, the way the board names a hero's controls
			stampControl(chip, 'montage.remove-hero.hero');
			setIcon(chip.createSpan({ cls: 'dse-mt__sheet-chipglyph' }), 'check');
			chip.createSpan({ cls: 'dse-mt__sheet-heroname', text: name });
			setPressedState(chip, false);
			this.lifecycle.registerDomEvent(chip, 'click', () => {
				picked = name;
				chips.forEach((c) => setPressedState(c, c === chip));
				summary.setText(removalSummary(name, this.removalOf(name)));
				summary.hidden = false;
				removeBtn.setDisabled(false);
			});
			chips.push(chip);
		}
		if (chips.length === 0) this.body.createDiv({ cls: 'dse-mt__sheet-hint', text: 'No heroes on the board.' });
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
