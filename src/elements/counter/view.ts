// Plan 09 Task 4 (D2 §3.9) — CounterElementView on the D2 kit `stepper`, replacing the
// Plan 07 port's hand-rolled chevron <button>s + click-to-edit input swap. The stepper
// is the whole control surface:
//  - `editable: true` — the value IS the stepper's <input type=number>, with the kit's
//    ONE commit path (CB-10): Enter/blur funnel into a single guarded commit, Escape
//    reverts a dirty draft, and a no-op/clamped commit never fires onChange — so a
//    clamped edit skips the write entirely (the Plan 07 view's "nothing changed,
//    nothing to persist" contract, now kit-enforced);
//  - `integer: true` — a typed "5.5" commits 5 (Math.trunc = parseInt's toward-zero
//    semantics, the legacy finishEditing behavior): the counter NEVER persists a float;
//  - min/max forward the model bounds, so the ± buttons auto-disable at the bounds via
//    the REAL `disabled` property (CB-8; an undefined max_value stays unbounded);
//  - the stepper's render() already does the targeted display refresh (input value +
//    button disabling, in place) BEFORE onChange fires, so onChange is exactly "mutate
//    this.model, then void this.persist()" — the framework's debounced write-behind
//    (F1 §4.2) coalesces rapid ± clicks into exactly one host.replaceSource call. The
//    serialize path (model.ts) is untouched: persisted YAML stays byte-compatible.
//
// SC-5 eviction (D2 §5): the value_height/name_height YAML knobs no longer become
// inline `font-size` (nor the input an inline height) — they arrive as the
// --dse-value-scale / --dse-label-scale custom properties (sanctioned --dse-* geometry
// via setProperty, the same statgrid scale grammar as values-row/characteristics),
// consumed by the stylesheet's `.dse-counter__value/__name` rules. No other `.style`
// access, no color anywhere in code.
import { setTooltip } from 'obsidian';
import { ElementView } from '@/framework/view';
import { stepper } from '@/framework/kit';
import type { Counter } from '@model/Counter';

const READ_ONLY_TOOLTIP = 'Read-only in this context';

export class CounterElementView extends ElementView<Counter> {
	protected onMount(root: HTMLElement, model: Counter): void {
		const container = root.createDiv({ cls: 'dse-counter' });
		container.style.setProperty('--dse-value-scale', String(model.value_height));
		container.style.setProperty('--dse-label-scale', String(model.name_height));

		const canPersist = this.cx.host.canPersist;
		const handle = stepper(
			container,
			{
				value: model.current_value,
				// Counter.parse always materializes min_value (default 0) — the legacy
				// updateButtons floor; max_value may be undefined (unbounded: the plus
				// button then never auto-disables), exactly as the legacy view behaved.
				min: model.min_value,
				max: model.max_value,
				// F1 §4.4: when the host can't persist, render the static span (no dead
				// input) — the buttons are force-disabled below.
				editable: canPersist,
				integer: true,
				// P09 T4 review (Important #1): a persisted current_value may sit OUTSIDE
				// [min,max] (hand-edited YAML, a later-lowered max_value). Show it as
				// stored and let ± step it back toward the range one press at a time —
				// the legacy CounterView contract exactly (display never clamped;
				// decrement guarded only by min, so 25 → 24 under max 20; increment
				// disabled at/above max; typed finishEditing clamped, as typed commits
				// still do here).
				clampInitial: false,
				label: model.name || 'Counter',
				onChange: (value) => {
					this.model.current_value = value;
					void this.persist();
				},
			},
			this,
		);

		// The stepper's value node (input when editable, span when read-only) IS the
		// counter's big value — tag it with the element grammar class so the stylesheet
		// scales it via --dse-value-scale.
		handle.rootEl
			.querySelector<HTMLElement>('.dse-stepper__input, .dse-stepper__value')
			?.addClass('dse-counter__value');

		container.createDiv({ cls: 'dse-counter__name', text: model.name });

		if (!canPersist) {
			// Visible but inert: REAL `disabled` on both kit buttons (CB-8 — the kit's
			// click guard also swallows synthetic dispatchEvent clicks). Nothing ever
			// calls setValue here, so the stepper never re-enables them; persist() is
			// double-gated anyway (ElementView.persist no-ops when !canPersist), and the
			// pipeline already stamped data-dse-readonly on the root (CSS badge).
			handle.rootEl.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
				btn.disabled = true;
			});
			setTooltip(container, READ_ONLY_TOOLTIP);
		}
	}
}
