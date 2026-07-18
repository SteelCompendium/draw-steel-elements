// D7 Task 3 (spec §4.1) — ResourcePanel: the presentational HeroPanel<ResourceSlice> core
// for ds-resource (and, later, the ds-hero flagship's Heroic Resource slot, spec §2.3's
// composition table: "Heroic Resource | ResourcePanel (from ds-resource, §4.1) |
// {type,current,min}").
//
// Deliberately a SIGNED stepper with a floor (`min`, class-defaulted or overridden) and
// NO ceiling (spec §4.1: "a signed kit stepper (floor = min, no ceiling)") — heroic
// resources have no natural cap in the rules (RR §4), unlike ds-counter's optional
// max_value. `ResourceModel.max` (model.ts) is a persisted override seam some future
// consumer may read directly, but this panel does not wire it to the stepper's `max`
// option — there is no ceiling to enforce here.
//
// Data flow follows §2.2 exactly (same convention as ConditionsPanel): this panel never
// mutates its own `current` slice on a user action — the kit stepper computes the next
// value and this panel calls `onChange({current: next})`, letting the container mutate
// `model.current` and call `updatePanel(next)` back down.
import { HeroPanel, stepper } from '@/framework/kit';
import type { StepperHandle } from '@/framework/kit';

/** The resolved slice a ResourcePanel renders — type/min already merged from
 *  RESOURCE_BY_CLASS + any explicit override (view.ts's resolveResource call), so the
 *  panel itself stays static-map-agnostic (spec §2.1's container/presentational split:
 *  class resolution is the container's job). */
export interface ResourceSlice {
	type: string;
	current: number;
	min: number;
	/** Class gain-rule hint text (resourceByClass.ts's ResourceClassEntry.gainHint).
	 *  Empty string for an unrecognized/absent class — the hint line then renders empty
	 *  rather than a stray label with nothing to show. */
	gainHint: string;
}

export class ResourcePanel extends HeroPanel<ResourceSlice> {
	private labelEl!: HTMLElement;
	private hintEl!: HTMLElement;
	private stepperHandle!: StepperHandle;
	private onChange!: (patch: Partial<ResourceSlice>) => void;

	mountPanel(root: HTMLElement, slice: ResourceSlice, onChange: (patch: Partial<ResourceSlice>) => void): void {
		this.onChange = onChange;
		root.addClass('dse-res');

		this.labelEl = root.createDiv({ cls: 'dse-res__label', text: slice.type });

		const stepperWrap = root.createDiv({ cls: 'dse-res__stepper' });
		const canPersist = !this.host.readOnly;
		this.stepperHandle = stepper(
			stepperWrap,
			{
				value: slice.current,
				min: slice.min,
				// No `max` (spec §4.1: "no ceiling") — the plus button never disables.
				editable: canPersist,
				integer: true,
				label: slice.type,
				onChange: (value) => this.onChange({ current: value }),
			},
			this,
		);
		// F1 §4.4: read-only hosts REAL-disable every stepper button (same convention as
		// counter/view.ts and party/view.ts — the kit stepper has no built-in
		// "editable disables the buttons too" behavior).
		if (!canPersist) {
			this.stepperHandle.rootEl.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
				btn.disabled = true;
			});
		}

		this.hintEl = root.createDiv({ cls: 'dse-res__hint', text: slice.gainHint });
	}

	/** Applies an externally-changed slice in place: label/hint text refresh (class may
	 *  have changed) and the stepper's value/min via setValue (external update — never
	 *  fires onChange, F1 §6 "explicit targeted update"). */
	updatePanel(slice: ResourceSlice): void {
		this.labelEl.setText(slice.type);
		this.hintEl.setText(slice.gainHint);
		this.stepperHandle.setValue(slice.current);
	}
}
