// Plan 08 Task 2 (D2 §2.2) — kit/stepper: labelled numeric ± triad. role="group" +
// aria-label, buttons "Decrease/Increase {label}" that auto-disable at min/max via the
// REAL disabled property, an aria-live="polite" value, an editable <input type="number">
// mode whose Enter/blur commit path fires onChange exactly ONCE (CB-10) and whose Escape
// reverts, and a { setValue, getValue } Handle that updates in place (CB-7).
import { stepper } from '../../../src/framework/kit/stepper';
import { Component } from '../../mocks/obsidian';

function fakeOwner(): any {
	return new Component();
}

function keydown(el: HTMLElement, key: string): void {
	el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function blur(el: HTMLElement): void {
	el.dispatchEvent(new FocusEvent('blur'));
}

describe('Plan 08 Task 2: kit/stepper (D2 §2.2)', () => {
	describe('structure + a11y', () => {
		test('renders role="group" with the aria-label and minus/plus iconButtons around the value', () => {
			const parent = document.createElement('div');
			const { rootEl } = stepper(
				parent,
				{ value: 3, label: 'Malice', onChange: () => {} },
				fakeOwner(),
			);

			expect(rootEl.hasClass('dse-stepper')).toBe(true);
			expect(rootEl.getAttribute('role')).toBe('group');
			expect(rootEl.getAttribute('aria-label')).toBe('Malice');

			const buttons = rootEl.querySelectorAll('button.dse-btn.dse-stepper__btn');
			expect(buttons).toHaveLength(2);
			expect(buttons[0].getAttribute('aria-label')).toBe('Decrease Malice');
			expect(buttons[1].getAttribute('aria-label')).toBe('Increase Malice');
			expect(buttons[0].querySelector('.dse-btn__icon')!.getAttribute('data-icon')).toBe('minus');
			expect(buttons[1].querySelector('.dse-btn__icon')!.getAttribute('data-icon')).toBe('plus');

			// DOM order: decrease, value, increase.
			const children = Array.from(rootEl.children);
			expect(children[0]).toBe(buttons[0]);
			expect(children[1].hasClass('dse-stepper__value')).toBe(true);
			expect(children[2]).toBe(buttons[1]);
		});

		test('the value display announces changes via aria-live="polite" (§4.8)', () => {
			const parent = document.createElement('div');
			const { rootEl } = stepper(parent, { value: 3, label: 'Malice', onChange: () => {} }, fakeOwner());
			const valueEl = rootEl.querySelector('.dse-stepper__value')!;
			expect(valueEl.getAttribute('aria-live')).toBe('polite');
			expect(valueEl.textContent).toBe('3');
		});
	});

	describe('increment / decrement', () => {
		test('plus/minus commit value ± step (default 1) and fire onChange with the new value', () => {
			const parent = document.createElement('div');
			const onChange = jest.fn();
			const handle = stepper(parent, { value: 3, label: 'Malice', onChange }, fakeOwner());
			const [minusEl, plusEl] = Array.from(
				handle.rootEl.querySelectorAll<HTMLButtonElement>('.dse-stepper__btn'),
			);

			plusEl.click();
			expect(onChange).toHaveBeenLastCalledWith(4);
			expect(handle.getValue()).toBe(4);
			expect(handle.rootEl.querySelector('.dse-stepper__value')!.textContent).toBe('4');

			minusEl.click();
			expect(onChange).toHaveBeenLastCalledWith(3);
			expect(handle.getValue()).toBe(3);
			expect(onChange).toHaveBeenCalledTimes(2);
		});

		test('honors a custom step', () => {
			const parent = document.createElement('div');
			const onChange = jest.fn();
			const handle = stepper(parent, { value: 10, step: 5, label: 'VP', onChange }, fakeOwner());
			handle.rootEl.querySelectorAll<HTMLButtonElement>('.dse-stepper__btn')[1].click();
			expect(onChange).toHaveBeenLastCalledWith(15);
		});
	});

	describe('min/max bounds — buttons auto-disable via the REAL property', () => {
		test('at min the decrease button is disabled (real property); at max the increase button is', () => {
			const parent = document.createElement('div');
			const onChange = jest.fn();
			const handle = stepper(
				parent,
				{ value: 0, min: 0, max: 2, label: 'Surges', onChange },
				fakeOwner(),
			);
			const [minusEl, plusEl] = Array.from(
				handle.rootEl.querySelectorAll<HTMLButtonElement>('.dse-stepper__btn'),
			);

			expect(minusEl.disabled).toBe(true); // starts at min
			expect(plusEl.disabled).toBe(false);

			plusEl.click();
			plusEl.click();
			expect(onChange).toHaveBeenCalledTimes(2);
			expect(handle.getValue()).toBe(2);
			expect(plusEl.disabled).toBe(true); // reached max
			expect(minusEl.disabled).toBe(false);

			plusEl.click(); // disabled — no further onChange
			expect(onChange).toHaveBeenCalledTimes(2);
		});

		test('unbounded steppers never disable their buttons', () => {
			const parent = document.createElement('div');
			const handle = stepper(parent, { value: 0, label: 'x', onChange: () => {} }, fakeOwner());
			const [minusEl, plusEl] = Array.from(
				handle.rootEl.querySelectorAll<HTMLButtonElement>('.dse-stepper__btn'),
			);
			minusEl.click();
			expect(handle.getValue()).toBe(-1);
			expect(minusEl.disabled).toBe(false);
			expect(plusEl.disabled).toBe(false);
		});
	});

	describe('clampInitial: false — an out-of-range seed shows AS-IS and steps back toward the range (P09 T4 review)', () => {
		// Legacy CounterView parity: display was current_value.toString() (never clamped),
		// decrement guarded only by min (25 → 24 even above max), increment disabled
		// at/above max, and only TYPED commits clamped.
		function overMax(onChange = jest.fn()) {
			const parent = document.createElement('div');
			const handle = stepper(
				parent,
				{ value: 25, min: 0, max: 20, clampInitial: false, label: 'Health', onChange },
				fakeOwner(),
			);
			const [minusEl, plusEl] = Array.from(
				handle.rootEl.querySelectorAll<HTMLButtonElement>('.dse-stepper__btn'),
			);
			return { handle, minusEl, plusEl, onChange };
		}

		test('seeds the stored value UNCLAMPED: 25 displays as 25 with max 20', () => {
			const { handle } = overMax();
			expect(handle.getValue()).toBe(25);
			expect(handle.rootEl.querySelector('.dse-stepper__value')!.textContent).toBe('25');
		});

		test('above max: minus steps 25 → 24 (ONE step toward the range, NOT a jump to 20)', () => {
			const { handle, minusEl, onChange } = overMax();
			minusEl.click();
			expect(onChange).toHaveBeenCalledTimes(1);
			expect(onChange).toHaveBeenLastCalledWith(24);
			expect(handle.getValue()).toBe(24);
			expect(handle.rootEl.querySelector('.dse-stepper__value')!.textContent).toBe('24');
		});

		test('above max: increment is REAL-disabled (cannot go further out); a synthetic click is swallowed', () => {
			const { handle, plusEl, onChange } = overMax();
			expect(plusEl.disabled).toBe(true);
			plusEl.click();
			expect(onChange).not.toHaveBeenCalled();
			expect(handle.getValue()).toBe(25);
		});

		test('stepping down re-enters the range at 20, then normal min/max behavior resumes', () => {
			const { handle, minusEl, plusEl, onChange } = overMax();
			for (let i = 0; i < 5; i++) minusEl.click(); // 25 → 24 → 23 → 22 → 21 → 20
			expect(handle.getValue()).toBe(20);
			expect(onChange).toHaveBeenLastCalledWith(20);
			expect(onChange).toHaveBeenCalledTimes(5);
			expect(plusEl.disabled).toBe(true); // now AT max — the normal at-bound rule
			minusEl.click();
			expect(handle.getValue()).toBe(19);
			expect(plusEl.disabled).toBe(false); // back inside: normal clamping resumed
		});

		test('a large step from above max lands inside the range and clamps at the FAR bound (never overshoots below min)', () => {
			const parent = document.createElement('div');
			const onChange = jest.fn();
			const handle = stepper(
				parent,
				{ value: 25, min: 0, max: 20, step: 30, clampInitial: false, label: 'x', onChange },
				fakeOwner(),
			);
			handle.rootEl.querySelectorAll<HTMLButtonElement>('.dse-stepper__btn')[0].click(); // 25 − 30
			expect(onChange).toHaveBeenLastCalledWith(0); // min-clamped once in range
			expect(handle.getValue()).toBe(0);
		});

		test('symmetric below min: -5 displays as -5; minus is disabled; plus steps -5 → -4 (not a jump to 0)', () => {
			const parent = document.createElement('div');
			const onChange = jest.fn();
			const handle = stepper(
				parent,
				{ value: -5, min: 0, max: 20, clampInitial: false, label: 'Health', onChange },
				fakeOwner(),
			);
			const [minusEl, plusEl] = Array.from(
				handle.rootEl.querySelectorAll<HTMLButtonElement>('.dse-stepper__btn'),
			);
			expect(handle.rootEl.querySelector('.dse-stepper__value')!.textContent).toBe('-5');
			expect(minusEl.disabled).toBe(true); // can't go further below min
			expect(plusEl.disabled).toBe(false);
			minusEl.click();
			expect(onChange).not.toHaveBeenCalled();
			plusEl.click();
			expect(onChange).toHaveBeenCalledTimes(1);
			expect(onChange).toHaveBeenLastCalledWith(-4);
			expect(handle.getValue()).toBe(-4);
		});

		test('TYPED commits still clamp to [min,max] (typing is deliberate): draft "99" commits 20', () => {
			const parent = document.createElement('div');
			const onChange = jest.fn();
			const handle = stepper(
				parent,
				{ value: 25, min: 0, max: 20, clampInitial: false, editable: true, label: 'Health', onChange },
				fakeOwner(),
			);
			const inputEl = handle.rootEl.querySelector<HTMLInputElement>('input.dse-stepper__input')!;
			expect(inputEl.value).toBe('25'); // the unclamped seed reaches the editable input too
			inputEl.value = '99';
			keydown(inputEl, 'Enter');
			expect(onChange).toHaveBeenCalledTimes(1);
			expect(onChange).toHaveBeenCalledWith(20);
			expect(inputEl.value).toBe('20');
			expect(handle.getValue()).toBe(20);
		});

		test('an IN-RANGE seed under clampInitial:false behaves exactly like the default', () => {
			const parent = document.createElement('div');
			const onChange = jest.fn();
			const handle = stepper(
				parent,
				{ value: 10, min: 0, max: 20, clampInitial: false, label: 'x', onChange },
				fakeOwner(),
			);
			const [minusEl, plusEl] = Array.from(
				handle.rootEl.querySelectorAll<HTMLButtonElement>('.dse-stepper__btn'),
			);
			expect(handle.getValue()).toBe(10);
			expect(minusEl.disabled).toBe(false);
			expect(plusEl.disabled).toBe(false);
			plusEl.click();
			expect(onChange).toHaveBeenLastCalledWith(11);
		});

		test('DEFAULT (clampInitial unset) still clamps the seed: 25 with max 20 displays 20 (unchanged)', () => {
			const parent = document.createElement('div');
			const handle = stepper(
				parent,
				{ value: 25, min: 0, max: 20, label: 'x', onChange: () => {} },
				fakeOwner(),
			);
			expect(handle.getValue()).toBe(20);
			expect(handle.rootEl.querySelector('.dse-stepper__value')!.textContent).toBe('20');
		});
	});

	describe('Handle: setValue / getValue (in-place, CB-7)', () => {
		test('setValue updates the SAME value node in place without firing onChange', () => {
			const parent = document.createElement('div');
			const onChange = jest.fn();
			const handle = stepper(parent, { value: 3, min: 0, max: 10, label: 'x', onChange }, fakeOwner());
			const valueEl = handle.rootEl.querySelector('.dse-stepper__value')!;

			handle.setValue(7);

			expect(handle.getValue()).toBe(7);
			expect(handle.rootEl.querySelector('.dse-stepper__value')).toBe(valueEl); // same node
			expect(valueEl.textContent).toBe('7');
			expect(onChange).not.toHaveBeenCalled();
		});

		test('setValue clamps into [min, max] and refreshes button disabling', () => {
			const parent = document.createElement('div');
			const handle = stepper(parent, { value: 3, min: 0, max: 10, label: 'x', onChange: () => {} }, fakeOwner());
			handle.setValue(99);
			expect(handle.getValue()).toBe(10);
			const [, plusEl] = Array.from(
				handle.rootEl.querySelectorAll<HTMLButtonElement>('.dse-stepper__btn'),
			);
			expect(plusEl.disabled).toBe(true);
		});
	});

	test('format renders the display value (display-only — commits stay numeric)', () => {
		const parent = document.createElement('div');
		const onChange = jest.fn();
		const handle = stepper(
			parent,
			{ value: 3, label: 'VP', format: (n) => `${n} VP`, onChange },
			fakeOwner(),
		);
		const valueEl = handle.rootEl.querySelector('.dse-stepper__value')!;
		expect(valueEl.textContent).toBe('3 VP');
		handle.rootEl.querySelectorAll<HTMLButtonElement>('.dse-stepper__btn')[1].click();
		expect(valueEl.textContent).toBe('4 VP');
		expect(onChange).toHaveBeenLastCalledWith(4);
	});

	describe('editable mode — <input type="number"> (CB-10)', () => {
		function editable(over: Partial<Parameters<typeof stepper>[1]> = {}, onChange = jest.fn()) {
			const parent = document.createElement('div');
			const handle = stepper(
				parent,
				{ value: 3, min: 0, max: 10, editable: true, label: 'Stamina', onChange, ...over },
				fakeOwner(),
			);
			const inputEl = handle.rootEl.querySelector<HTMLInputElement>('input.dse-stepper__input')!;
			return { handle, inputEl, onChange };
		}

		test('renders an <input type="number"> carrying the label and live region instead of the span', () => {
			const { handle, inputEl } = editable();
			expect(inputEl).not.toBeNull();
			expect(inputEl.type).toBe('number');
			expect(inputEl.value).toBe('3');
			expect(inputEl.getAttribute('aria-label')).toBe('Stamina');
			expect(inputEl.getAttribute('aria-live')).toBe('polite');
			expect(handle.rootEl.querySelector('.dse-stepper__value')).toBeNull();
		});

		test('Enter commits ONCE — a following blur does not double-commit (CB-10)', () => {
			const { handle, inputEl, onChange } = editable();
			inputEl.value = '7';
			keydown(inputEl, 'Enter');
			expect(onChange).toHaveBeenCalledTimes(1);
			expect(onChange).toHaveBeenCalledWith(7);
			expect(handle.getValue()).toBe(7);

			blur(inputEl); // the browser blurs after Enter in a modal-close flow
			expect(onChange).toHaveBeenCalledTimes(1); // STILL once
		});

		test('blur alone commits once', () => {
			const { inputEl, onChange } = editable();
			inputEl.value = '5';
			blur(inputEl);
			expect(onChange).toHaveBeenCalledTimes(1);
			expect(onChange).toHaveBeenCalledWith(5);
		});

		test('Escape reverts the draft to the current value without committing', () => {
			const { handle, inputEl, onChange } = editable();
			inputEl.value = '9';
			keydown(inputEl, 'Escape');
			expect(inputEl.value).toBe('3');
			expect(handle.getValue()).toBe(3);
			blur(inputEl); // post-revert blur is a no-op too
			expect(onChange).not.toHaveBeenCalled();
		});

		test('commit clamps into [min, max] and normalizes the input text', () => {
			const { inputEl, onChange } = editable();
			inputEl.value = '50';
			keydown(inputEl, 'Enter');
			expect(onChange).toHaveBeenCalledTimes(1);
			expect(onChange).toHaveBeenCalledWith(10);
			expect(inputEl.value).toBe('10');
		});

		test('an empty/invalid draft reverts instead of committing', () => {
			const { inputEl, onChange } = editable();
			inputEl.value = '';
			keydown(inputEl, 'Enter');
			expect(onChange).not.toHaveBeenCalled();
			expect(inputEl.value).toBe('3');
		});

		describe('integer: true — typed commits truncate toward zero (parseInt semantics)', () => {
			test('typing "7.5" commits 7, not a float', () => {
				const { handle, inputEl, onChange } = editable({ integer: true });
				inputEl.value = '7.5';
				keydown(inputEl, 'Enter');
				expect(onChange).toHaveBeenCalledTimes(1);
				expect(onChange).toHaveBeenCalledWith(7);
				expect(handle.getValue()).toBe(7);
				expect(inputEl.value).toBe('7'); // normalized display
			});

			test('truncation is toward zero: "-2.9" commits -2 (not -3), matching parseInt', () => {
				const parent = document.createElement('div');
				const onChange = jest.fn();
				const handle = stepper(
					parent,
					{ value: 0, editable: true, integer: true, label: 'x', onChange },
					fakeOwner(),
				);
				const inputEl = handle.rootEl.querySelector<HTMLInputElement>('input.dse-stepper__input')!;
				inputEl.value = '-2.9';
				keydown(inputEl, 'Enter');
				expect(onChange).toHaveBeenCalledWith(-2);
				expect(handle.getValue()).toBe(-2);
			});

			test('truncation runs BEFORE clamping (min 0: "-2.9" → -2 → clamped 0, the legacy correct-to-0)', () => {
				const { handle, inputEl, onChange } = editable({ integer: true }); // min 0, max 10, value 3
				inputEl.value = '-2.9';
				keydown(inputEl, 'Enter');
				expect(onChange).toHaveBeenCalledWith(0);
				expect(handle.getValue()).toBe(0);
			});

			test('default (integer unset) still commits the raw decimal — opt-in only', () => {
				const { handle, inputEl, onChange } = editable();
				inputEl.value = '7.5';
				keydown(inputEl, 'Enter');
				expect(onChange).toHaveBeenCalledWith(7.5);
				expect(handle.getValue()).toBe(7.5);
			});
		});

		test('the ± buttons drive the input value too', () => {
			const { handle, inputEl, onChange } = editable();
			handle.rootEl.querySelectorAll<HTMLButtonElement>('.dse-stepper__btn')[1].click();
			expect(inputEl.value).toBe('4');
			expect(onChange).toHaveBeenCalledWith(4);
		});

		test('setValue updates the input in place without firing onChange', () => {
			const { handle, inputEl, onChange } = editable();
			handle.setValue(8);
			expect(inputEl.value).toBe('8');
			expect(onChange).not.toHaveBeenCalled();
		});
	});

	test('lifecycle: owner.unload() detaches ALL stepper listeners (F1 §4.5)', () => {
		const parent = document.createElement('div');
		const onChange = jest.fn();
		const owner = fakeOwner();
		const handle = stepper(
			parent,
			{ value: 3, editable: true, label: 'x', onChange },
			owner,
		);
		const inputEl = handle.rootEl.querySelector<HTMLInputElement>('input.dse-stepper__input')!;

		owner.unload();
		handle.rootEl.querySelectorAll<HTMLButtonElement>('.dse-stepper__btn')[1].click();
		inputEl.value = '7';
		keydown(inputEl, 'Enter');
		blur(inputEl);

		expect(onChange).not.toHaveBeenCalled();
	});
});
