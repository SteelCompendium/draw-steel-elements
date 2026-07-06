// Plan 09 Task 8 (D2 §3.x) — AddConditionsModal on the kit managedModal. Every
// condition is a .dse-cond-item[aria-selected] row of REAL kit <button>s (CB-8/MP-1):
// a ghost toggle carrying the icon + name (aria-pressed = the checkbox state) and a
// customize-cog revealed by CSS on hover AND focus (:hover / :focus-within — a11y;
// the legacy mouseenter-only inline display toggle is gone). Row icons are colored
// through the VALIDATED --dse-condition-color property (applyConditionColor,
// OD-8/SD-2) — never el.style.color — with the shared applyConditionEffect replacing
// the duplicated effect-class block. The child CustomizeConditionModal is opened
// through openManagedModal against THIS modal's lifecycle, so closing the select
// modal closes an open customize child with it (F1 §4.5). The constructor signature
// (app, character, conditionManager, onAdd) and the onAdd(Condition[]) contract are
// the legacy ones, unchanged — Initiative (T9) keeps opening it the same way.
import type { App } from 'obsidian';
import { setIcon } from 'obsidian';
import { Condition, CreatureInstance, Hero } from '@drawSteelAdmonition/EncounterData';
import { ConditionManager, ConditionConfig } from '@utils/Conditions';
import { CustomizeConditionModal } from '@views/CustomizeConditionModal';
import { DseModal, divider, iconButton, openManagedModal } from '@/framework/kit';
import type { IconButtonHandle } from '@/framework/kit';
import { applyConditionColor, applyConditionEffect } from '@/elements/conditionColor';

export class AddConditionsModal extends DseModal {
	private character: Hero | CreatureInstance;
	private conditionManager: ConditionManager;
	private onAdd: (conditions: Condition[]) => void;
	private selectedConditions: Map<string, Condition>;

	constructor(
		app: App,
		character: Hero | CreatureInstance,
		conditionManager: ConditionManager,
		onAdd: (conditions: Condition[]) => void,
	) {
		super(app);
		this.character = character;
		this.conditionManager = conditionManager;
		this.onAdd = onAdd;
		this.selectedConditions = new Map();
	}

	onOpen() {
		this.setDseTitle('Add Conditions');

		const listEl = this.body.createDiv({ cls: 'dse-cond-list' });
		listEl.setAttribute('role', 'group');
		listEl.setAttribute('aria-label', 'Conditions');

		this.conditionManager.getConditions().forEach((condition) => {
			this.addConditionRow(listEl, condition);
		});

		// Kit divider between conditions and pseudo-conditions (§2.10).
		divider(listEl, { axis: 'h' });

		this.conditionManager.getPseudoConditions().forEach((condition) => {
			this.addConditionRow(listEl, condition);
		});

		this.footer([
			{ label: 'Cancel', text: 'Cancel', onClick: () => this.close() },
			{
				label: 'Add Conditions',
				text: 'Add Conditions',
				variant: 'accent',
				onClick: () => {
					this.onAdd(Array.from(this.selectedConditions.values()));
					this.close();
				},
			},
		]);
	}

	private addConditionRow(listEl: HTMLElement, condition: ConditionConfig): void {
		const rowEl = listEl.createDiv({ cls: 'dse-cond-item' });
		rowEl.setAttribute('aria-selected', 'false');

		// The selection toggle: a real button owning the icon + name; aria-pressed is
		// the announced checkbox state, aria-selected on the row is the visual hook.
		const toggle = iconButton(
			rowEl,
			{
				icon: condition.iconName,
				label: condition.displayName,
				text: condition.displayName,
				variant: 'ghost',
				pressed: false,
				onClick: () => this.toggleCondition(rowEl, toggle, condition),
			},
			this.lifecycle,
		);
		toggle.buttonEl.addClass('dse-cond-item__toggle');

		// The customize cog: its own real button (never nested inside the toggle);
		// CSS reveals it on row hover AND focus-within.
		const cog = iconButton(
			rowEl,
			{
				icon: 'cog',
				label: `Customize ${condition.displayName}`,
				variant: 'ghost',
				tooltip: 'Customize Condition',
				onClick: () => this.openCustomizeConditionModal(rowEl, toggle, condition),
			},
			this.lifecycle,
		);
		cog.buttonEl.addClass('dse-cond-item__cog');
	}

	private setSelected(rowEl: HTMLElement, toggle: IconButtonHandle, selected: boolean): void {
		rowEl.setAttribute('aria-selected', String(selected));
		toggle.setPressed(selected);
	}

	private toggleCondition(
		rowEl: HTMLElement,
		toggle: IconButtonHandle,
		condition: ConditionConfig,
	): void {
		if (this.selectedConditions.has(condition.key)) {
			this.selectedConditions.delete(condition.key);
			this.setSelected(rowEl, toggle, false);
		} else {
			this.selectedConditions.set(condition.key, { key: condition.key });
			this.setSelected(rowEl, toggle, true);
		}
	}

	// Reflects a saved customization back onto the row's icon (validated color +
	// effect class — the legacy updateIconPreview, now the shared helpers).
	private updateIconPreview(
		toggle: IconButtonHandle,
		conditionConfig: ConditionConfig,
		conditionData: Condition,
	): void {
		const iconEl = toggle.buttonEl.querySelector<HTMLElement>('.dse-btn__icon');
		if (!iconEl) return;
		setIcon(iconEl, conditionConfig.iconName);
		applyConditionColor(iconEl, conditionData.color);
		applyConditionEffect(iconEl, conditionData.effect);
	}

	private openCustomizeConditionModal(
		rowEl: HTMLElement,
		toggle: IconButtonHandle,
		conditionConfig: ConditionConfig,
	): void {
		let existing = this.selectedConditions.get(conditionConfig.key);
		if (!existing) {
			// Customizing an unselected condition selects it (legacy behavior).
			existing = { key: conditionConfig.key };
			this.selectedConditions.set(conditionConfig.key, existing);
			this.setSelected(rowEl, toggle, true);
		}
		const conditionData: Condition = existing;

		// Owner-bound to THIS modal's lifecycle: if the select modal goes away (user
		// dismissal or the owning view unloading), the child closes with it (§4.5).
		openManagedModal(
			this.lifecycle,
			() =>
				new CustomizeConditionModal(this.app, conditionData, conditionConfig, (updatedCondition) => {
					this.selectedConditions.set(conditionConfig.key, updatedCondition);
					this.updateIconPreview(toggle, conditionConfig, updatedCondition);
				}),
		);
	}
}
