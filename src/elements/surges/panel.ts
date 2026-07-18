// D7 Task 5 (spec §4.3) — SurgePanel: the presentational HeroPanel<SurgeSlice> core for
// ds-surges (and, later, a Surges slot on the ds-hero flagship, spec §2.3's composition
// table — this element "proves the surge slice the sheet + D5 share"). Deliberately the
// simplest HeroPanel yet: a single labeled kit `stepper` (floor 0, no ceiling — a
// surge count has no rules-defined cap) plus an optional hint line.
//
// Data flow follows §2.2 exactly (same convention as ResourcePanel/ConditionsPanel):
// this panel never mutates its own `surges` slice on a user action — the kit stepper
// computes the next value and this panel calls `onChange({surges: next})`, letting the
// container mutate `model.surges` and call `updatePanel(next)` back down.
import { HeroPanel, stepper } from '@/framework/kit';
import type { StepperHandle } from '@/framework/kit';

/** The resolved slice a SurgePanel renders. `highestCharacteristic` is display-only —
 *  there is no affordance to edit it from this panel (spec §4.3 gives the panel no
 *  write path for it; a future consumer, e.g. ds-hero, would set it from the hero's own
 *  characteristics and hand down a fresh slice via updatePanel). */
export interface SurgeSlice {
	surges: number;
	highestCharacteristic?: number;
}

/** AR "Surges" (reference/draw-steel-agent-reference.md:44): "each surge adds extra
 *  damage equal to your highest characteristic score." Empty string when
 *  `highestCharacteristic` is absent — the hint line then renders empty rather than a
 *  stray label with nothing to show (same convention as ResourcePanel's gainHint). */
function hintText(highestCharacteristic: number | undefined): string {
	return highestCharacteristic === undefined ? '' : `each = +${highestCharacteristic} damage`;
}

export class SurgePanel extends HeroPanel<SurgeSlice> {
	private hintEl!: HTMLElement;
	private stepperHandle!: StepperHandle;
	private onChange!: (patch: Partial<SurgeSlice>) => void;

	mountPanel(root: HTMLElement, slice: SurgeSlice, onChange: (patch: Partial<SurgeSlice>) => void): void {
		this.onChange = onChange;
		root.addClass('dse-surge');

		root.createDiv({ cls: 'dse-surge__label', text: 'Surges' });

		const stepperWrap = root.createDiv({ cls: 'dse-surge__stepper' });
		const canPersist = !this.host.readOnly;
		this.stepperHandle = stepper(
			stepperWrap,
			{
				value: slice.surges,
				min: 0, // spec §4.3: floor 0
				// No `max` — surges have no rules-defined ceiling; the plus button never
				// disables (same convention as ResourcePanel's unbounded stepper).
				editable: canPersist,
				integer: true,
				label: 'Surges',
				onChange: (value) => this.onChange({ surges: value }),
			},
			this,
		);
		// F1 §4.4: read-only hosts REAL-disable every stepper button (same convention as
		// counter/view.ts, party/view.ts, and ResourcePanel).
		if (!canPersist) {
			this.stepperHandle.rootEl.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
				btn.disabled = true;
			});
		}

		this.hintEl = root.createDiv({ cls: 'dse-surge__hint', text: hintText(slice.highestCharacteristic) });
	}

	/** Applies an externally-changed slice in place: the stepper's value via setValue
	 *  (external update — never fires onChange, F1 §6 "explicit targeted update") and
	 *  the hint text refresh. */
	updatePanel(slice: SurgeSlice): void {
		this.stepperHandle.setValue(slice.surges);
		this.hintEl.setText(hintText(slice.highestCharacteristic));
	}
}
