// Plan 07 Task 4 (F1 §6 step 7) — CounterElementView: ports the legacy
// Counter/CounterView.ts DOM (value display, click-to-edit <input type=number>, +/−
// chevron buttons) onto ElementView. The legacy manual click shield
// (CounterProcessor's capture-phase mousedown/pointerdown stop) and try/catch error div
// are dropped — the pipeline arms the shield on the root and owns the single error
// boundary (F1 §2.4).
//
// Key adaptations from the legacy view (same recipe as stamina-bar):
//  - the 3 `CodeBlocks.updateCounter(plugin.app, data, ctx)` calls (legacy
//    CounterView.ts:55/:65/:160) become "mutate this.model, then void this.persist()" —
//    the framework's debounced write-behind (F1 §4.2) coalesces rapid clicks into
//    exactly one host.replaceSource call;
//  - raw addEventListener (legacy :32/:51/:61/:149/:163-165) becomes
//    this.registerDomEvent — Counter mounts its DOM exactly once (no collapsible
//    wrapper / re-render cycle), so binding to the view itself is lifecycle-correct;
//  - the legacy per-edit churn (a fresh <input> and a fresh value <div> per edit cycle,
//    each re-binding listeners) is replaced by TWO stable nodes created once in onMount
//    and swapped in/out via replaceWith — every listener is registered exactly once for
//    the view's lifetime, and the `editing` guard keeps Enter-then-blur from committing
//    (and persisting) twice;
//  - all write-triggering controls are gated on cx.host.canPersist (F1 §4.4): when the
//    host can't persist, no listener is bound at all, the buttons render disabled, and a
//    read-only tooltip is set (the framework's data-dse-readonly badge shows on the root
//    automatically).
import { setIcon, setTooltip } from 'obsidian';
import { ElementView } from '@/framework/view';
import type { Counter } from '@model/Counter';

const READ_ONLY_TOOLTIP = 'Read-only in this context';

export class CounterElementView extends ElementView<Counter> {
	private valueDisplay!: HTMLElement;
	private inputField!: HTMLInputElement;
	private incrementButton!: HTMLButtonElement;
	private decrementButton!: HTMLButtonElement;
	/** True while the click-to-edit input is swapped into the display slot. Guards
	 *  finishEditing so an Enter commit followed by the browser's late blur (the input
	 *  is detached by then) cannot mutate + persist a second time. */
	private editing = false;

	protected onMount(root: HTMLElement, model: Counter): void {
		// Legacy DOM parity: CounterProcessor created `.ds-counter-ele-container` around
		// CounterView.build's `.ds-counter-container` — keep both so existing user CSS
		// targeting either class keeps working.
		const eleContainer = root.createEl('div', { cls: 'ds-counter-ele-container' });
		const container = eleContainer.createEl('div', { cls: 'ds-counter-container' });

		const displayContainer = container.createEl('div', { cls: 'ds-counter-display-container' });
		this.valueDisplay = displayContainer.createEl('div', {
			cls: 'ds-counter-value',
			text: model.current_value.toString(),
		});
		this.valueDisplay.style.fontSize = `${model.value_height}em`;

		const nameDisplay = displayContainer.createEl('div', { cls: 'ds-counter-name', text: model.name });
		nameDisplay.style.fontSize = `${model.name_height}em`;

		const controlsContainer = container.createEl('div', { cls: 'ds-counter-controls' });
		this.incrementButton = controlsContainer.createEl('button', { cls: 'ds-counter-button' });
		setIcon(this.incrementButton, 'chevron-up');
		this.decrementButton = controlsContainer.createEl('button', { cls: 'ds-counter-button' });
		setIcon(this.decrementButton, 'chevron-down');

		container.addClass('ds-counter-flex');

		// The click-to-edit input is created ONCE (detached — global createEl, as the
		// legacy view used) and swapped in/out of the display slot, so its listeners
		// below are registered exactly once.
		this.inputField = createEl('input', { type: 'number', cls: 'ds-counter-input' }) as HTMLInputElement;
		this.inputField.style.fontSize = `${model.value_height}em`;
		this.inputField.style.height = '1em';

		if (this.cx.host.canPersist) {
			this.registerDomEvent(this.valueDisplay, 'click', () => this.beginEditing());
			this.registerDomEvent(this.incrementButton, 'click', () => this.step(+1));
			this.registerDomEvent(this.decrementButton, 'click', () => this.step(-1));
			this.registerDomEvent(this.inputField, 'blur', () => this.finishEditing());
			this.registerDomEvent(this.inputField, 'keydown', (e: KeyboardEvent) => {
				if (e.key === 'Enter') {
					this.finishEditing();
				} else if (e.key === 'Escape') {
					// Cancel editing (legacy behavior): revert the input to the current
					// value, then commit — a no-op mutation.
					this.inputField.value = this.model.current_value.toString();
					this.finishEditing();
				}
			});
			this.updateButtons();
		} else {
			// F1 §4.4: canPersist === false (embeds, print/export, hover popovers, canvas)
			// -> visible but inert. No listeners bound at all; the pipeline already stamped
			// data-dse-readonly on the root (CSS badge).
			this.incrementButton.setAttribute('disabled', 'true');
			this.decrementButton.setAttribute('disabled', 'true');
			setTooltip(container, READ_ONLY_TOOLTIP);
		}
	}

	/** Legacy incrementValue/decrementValue merged: bound-clamped ±1 on the model, then
	 *  targeted display refresh + debounced persist. Bound clicks can't normally happen
	 *  (updateButtons disables the button first, and disabled buttons don't dispatch
	 *  click), so the early return is a belt only — and unlike the legacy handler (which
	 *  unconditionally called CodeBlocks.updateCounter even after a clamped no-op), a
	 *  clamped click here skips the write entirely: nothing changed, nothing to persist. */
	private step(delta: 1 | -1): void {
		const { current_value, max_value, min_value } = this.model;
		if (delta > 0 && max_value !== undefined && current_value >= max_value) return;
		if (delta < 0 && current_value <= min_value) return;
		this.model.current_value += delta;

		this.valueDisplay.setText(this.model.current_value.toString());
		this.updateButtons();
		void this.persist();
	}

	/** Ports legacy updateButtons 1:1 (disable at max_value / min_value). */
	private updateButtons(): void {
		const { current_value, max_value, min_value } = this.model;
		if (max_value !== undefined && current_value >= max_value) {
			this.incrementButton.setAttribute('disabled', 'true');
		} else {
			this.incrementButton.removeAttribute('disabled');
		}
		if (current_value <= min_value) {
			this.decrementButton.setAttribute('disabled', 'true');
		} else {
			this.decrementButton.removeAttribute('disabled');
		}
	}

	/** Ports legacy makeValueEditable: swap the value display for the number input and
	 *  disable both buttons while editing. */
	private beginEditing(): void {
		if (this.editing) return;
		this.editing = true;

		this.inputField.value = this.model.current_value.toString();
		this.valueDisplay.replaceWith(this.inputField);
		this.inputField.focus();
		this.inputField.select();

		this.incrementButton.setAttribute('disabled', 'true');
		this.decrementButton.setAttribute('disabled', 'true');
	}

	/** Ports legacy finishEditing: clamp/revert the typed value, mutate the model, swap
	 *  the display back, refresh the buttons, and persist (debounced). */
	private finishEditing(): void {
		if (!this.editing) return;
		this.editing = false;

		let newValue = parseInt(this.inputField.value);
		if (isNaN(newValue)) {
			newValue = this.model.current_value; // Revert if invalid
		} else {
			if (this.model.max_value !== undefined) {
				newValue = Math.min(newValue, this.model.max_value);
			}
			newValue = Math.max(newValue, this.model.min_value);
		}
		this.model.current_value = newValue;

		this.valueDisplay.setText(newValue.toString());
		this.inputField.replaceWith(this.valueDisplay);
		this.updateButtons();
		void this.persist();
	}
}
