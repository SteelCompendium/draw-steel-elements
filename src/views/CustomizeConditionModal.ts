// Plan 09 Task 8 (D2 §3.x) — CustomizeConditionModal on the kit managedModal. The
// native <input type="color"> STAYS (§3.x — it is the right control for the job);
// the preview icon is colored through the VALIDATED --dse-condition-color scoped
// property (applyConditionColor, OD-8/SD-2) — never el.style.color (this file's :80
// was an SC-5 eviction-map site) — and the effect classes ride the shared
// applyConditionEffect (the legacy duplicated updateIconPreview is gone). Footer
// buttons are REAL kit <button>s (CB-8). Constructor signature
// (app, conditionData, conditionConfig, onUpdate) and the save/cancel callback
// contract are the legacy ones, unchanged; the constructor still edits a COPY, so
// Cancel never leaks a half-edit back to the caller.
import type { App } from 'obsidian';
import { setIcon } from 'obsidian';
import { Condition } from '@drawSteelAdmonition/EncounterData';
import { ConditionConfig } from '@utils/Conditions';
import { DseModal } from '@/framework/kit';
import { applyConditionColor, applyConditionEffect, CONDITION_EFFECTS } from '@/elements/conditionColor';

/** The color input's initial swatch when the condition has no color yet (the legacy
 *  default). A form-control VALUE, not styling — exempted by name in the
 *  source-hygiene test's literal scan. */
const COLOR_INPUT_DEFAULT = '#ffffff';

export class CustomizeConditionModal extends DseModal {
	private conditionData: Condition;
	private conditionConfig: ConditionConfig;
	private onUpdate: (conditionData: Condition) => void;

	constructor(
		app: App,
		conditionData: Condition,
		conditionConfig: ConditionConfig,
		onUpdate: (conditionData: Condition) => void,
	) {
		super(app);
		this.conditionData = { ...conditionData };
		this.conditionConfig = conditionConfig;
		this.onUpdate = onUpdate;
	}

	onOpen() {
		this.setDseTitle('Customize Condition');

		const layout = this.body.createDiv({ cls: 'dse-cust' });
		const tools = layout.createDiv({ cls: 'dse-cust__tools' });

		// Color picker — the native <input type="color"> stays (§3.x). It only ever
		// yields #rrggbb hex, but stored data may hold anything: the PREVIEW (and every
		// later consumer) goes through the validating helper regardless.
		const colorRow = tools.createDiv({ cls: 'dse-cust__row' });
		colorRow.createEl('label', { text: 'Color: ' });
		const colorInput = colorRow.createEl('input', { type: 'color' }) as HTMLInputElement;
		colorInput.setAttribute('aria-label', 'Condition color');
		colorInput.value = this.conditionData.color || COLOR_INPUT_DEFAULT;

		// Effect selector.
		const effectRow = tools.createDiv({ cls: 'dse-cust__row' });
		effectRow.createEl('label', { text: 'Effect: ' });
		const effectSelect = effectRow.createEl('select') as HTMLSelectElement;
		effectSelect.setAttribute('aria-label', 'Condition effect');
		for (const effect of ['static', ...CONDITION_EFFECTS]) {
			const option = effectSelect.createEl('option', { text: effect, value: effect });
			if (this.conditionData.effect === effect) option.selected = true;
		}

		// Preview — reflects the CURRENT customization immediately, then live-updates.
		const previewEl = layout.createDiv({ cls: 'dse-cust__preview' });
		setIcon(previewEl, this.conditionConfig.iconName);
		this.updatePreview(previewEl);

		this.lifecycle.registerDomEvent(colorInput, 'change', () => {
			this.conditionData.color = colorInput.value;
			this.updatePreview(previewEl);
		});
		this.lifecycle.registerDomEvent(effectSelect, 'change', () => {
			this.conditionData.effect = effectSelect.value;
			this.updatePreview(previewEl);
		});

		this.footer([
			{ label: 'Cancel', text: 'Cancel', onClick: () => this.close() },
			{
				label: 'Save',
				text: 'Save',
				variant: 'accent',
				onClick: () => {
					// Legacy Save contract verbatim: color/effect are read off the
					// controls (an untouched modal saves the defaults) and the edited
					// COPY is handed to the caller.
					this.conditionData.color = colorInput.value;
					this.conditionData.effect = effectSelect.value;
					this.onUpdate(this.conditionData);
					this.close();
				},
			},
		]);
	}

	private updatePreview(previewEl: HTMLElement): void {
		applyConditionColor(previewEl, this.conditionData.color);
		applyConditionEffect(previewEl, this.conditionData.effect);
	}
}
