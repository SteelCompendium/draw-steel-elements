// SC-379 — kit/track: a 0..N radiogroup of numbered seals on a horizontal or vertical rail.
// A TRUE radiogroup (the powerRollPanel/tabs contract): real <button role="radio">, exactly
// one checked, ONE Tab stop (roving tabindex), arrows/Home/End with wrap where selection
// follows focus, a no-op on re-selecting the checked slot, and a `disabled` form with no
// listeners. The CSS reads attribute hooks (data-fill / data-current / data-edge), pinned here.
import * as fs from 'fs';
import * as path from 'path';
import { track } from '../../../src/framework/kit/track';
import type { TrackOptions } from '../../../src/framework/kit/track';
import { Component } from '../../mocks/obsidian';
import { styleGuardFindings } from './styleGuard';

function fakeOwner(): any {
	const owner = new Component();
	owner.load();
	return owner;
}

function keydown(el: HTMLElement, key: string): boolean {
	return el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function mount(over: Partial<TrackOptions> = {}) {
	const parent = document.createElement('div');
	document.body.appendChild(parent); // needed for focus assertions
	const onChange = jest.fn();
	const handle = track(
		parent,
		{ orientation: 'horizontal', max: 5, value: 3, label: 'Patience', onChange, ...over },
		fakeOwner(),
	);
	const slots = (): HTMLButtonElement[] =>
		Array.from(handle.rootEl.querySelectorAll<HTMLButtonElement>('.dse-track__slot'));
	return { parent, handle, slots, onChange };
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('SC-379: kit/track', () => {
	describe('DOM + ARIA', () => {
		test('horizontal: a labelled radiogroup of 0..max REAL <button role="radio"> seals, ascending, with a rail behind them', () => {
			const { handle, slots } = mount();

			expect(handle.rootEl.classList.contains('dse-track')).toBe(true);
			expect(handle.rootEl.classList.contains('dse-track--horizontal')).toBe(true);
			expect(handle.rootEl.getAttribute('role')).toBe('radiogroup');
			expect(handle.rootEl.getAttribute('aria-label')).toBe('Patience');
			expect(slots().map((s) => s.getAttribute('data-value'))).toEqual(['0', '1', '2', '3', '4', '5']);
			for (const slot of slots()) {
				expect(slot.tagName).toBe('BUTTON');
				expect(slot.getAttribute('type')).toBe('button');
				expect(slot.getAttribute('role')).toBe('radio');
				expect(slot.getAttribute('aria-label')).toBe(`Patience ${slot.getAttribute('data-value')}`);
				// the seal: slot > .dse-track__mark > .dse-track__n (the numeral)
				expect(slot.querySelector('.dse-track__mark > .dse-track__n')!.textContent).toBe(
					slot.getAttribute('data-value'),
				);
				expect(slot.querySelector('.dse-track__text')).toBeNull(); // vertical-only
			}
			expect(handle.rootEl.querySelector('.dse-track__rail')).not.toBeNull();
			expect(handle.rootEl.querySelector('.dse-track__rail-fill')).not.toBeNull();
			expect(Object.keys(handle.slotEls)).toEqual(['0', '1', '2', '3', '4', '5']);
			expect(handle.slotEls[3]).toBe(slots()[3]);
		});

		test('vertical: DOM order follows `order` (descending = 5 at the top), rows carry slotText, there is no horizontal rail', () => {
			const { handle, slots } = mount({
				orientation: 'vertical',
				order: 'descending',
				label: 'Interest',
				slotText: (n) => `offer ${n}`,
				slotLabel: (n) => `Interest ${n}: offer ${n}`,
			});

			expect(handle.rootEl.classList.contains('dse-track--vertical')).toBe(true);
			expect(slots().map((s) => s.getAttribute('data-value'))).toEqual(['5', '4', '3', '2', '1', '0']);
			expect(slots()[0].querySelector('.dse-track__text')!.textContent).toBe('offer 5');
			expect(slots()[0].getAttribute('aria-label')).toBe('Interest 5: offer 5');
			expect(handle.rootEl.querySelector('.dse-track__rail')).toBeNull();
			expect(handle.rootEl.querySelector('.dse-track__rail-fill')).toBeNull();
		});

		test('the vertical first and last slots carry the edge hooks the CSS uses to stop the rail at the seal centre; middle slots carry none', () => {
			const { slots } = mount({ orientation: 'vertical', order: 'descending' });

			expect(slots().map((s) => s.getAttribute('data-edge'))).toEqual([
				'first', null, null, null, null, 'last',
			]);
		});

		test('--dse-track-fill (value / max) is the one TS->CSS seam, updated by setValue', () => {
			const { handle } = mount({ value: 3 });

			expect(handle.rootEl.style.getPropertyValue('--dse-track-fill')).toBe('0.6');
			handle.setValue(5);
			expect(handle.rootEl.style.getPropertyValue('--dse-track-fill')).toBe('1');
		});
	});

	describe('value + fill modes', () => {
		test('exactly one slot is checked and carries [data-current]; the value is clamped to 0..max for display', () => {
			const checked = (slots: HTMLButtonElement[]) =>
				slots.filter((s) => s.getAttribute('aria-checked') === 'true').map((s) => s.getAttribute('data-value'));

			const a = mount({ value: 3 });
			expect(checked(a.slots())).toEqual(['3']);
			expect(a.slots().filter((s) => s.hasAttribute('data-current')).map((s) => s.dataset.value)).toEqual(['3']);

			const over = mount({ value: 9 });
			expect(over.handle.getValue()).toBe(5);
			expect(checked(over.slots())).toEqual(['5']);

			const under = mount({ value: -4 });
			expect(under.handle.getValue()).toBe(0);
			expect(checked(under.slots())).toEqual(['0']);
		});

		test("fill 'remaining': 1..value = on, > value = spent, 0 = floor; at value 0 every seal 1..max is spent", () => {
			const { handle, slots } = mount({ fill: 'remaining', value: 3 });
			const fills = () => slots().map((s) => s.getAttribute('data-fill'));

			expect(fills()).toEqual(['floor', 'on', 'on', 'on', 'spent', 'spent']);
			handle.setValue(0);
			expect(fills()).toEqual(['floor', 'spent', 'spent', 'spent', 'spent', 'spent']);
		});

		test("fill 'none' (and the default): every slot is plain", () => {
			const none = mount({ fill: 'none' });
			expect(none.slots().every((s) => s.getAttribute('data-fill') === 'plain')).toBe(true);
			const dflt = mount();
			expect(dflt.slots().every((s) => s.getAttribute('data-fill') === 'plain')).toBe(true);
		});

		test('setValue repaints in place (aria-checked, tabindex, data-fill, data-current) WITHOUT firing onChange or moving focus', () => {
			const { handle, slots, onChange } = mount({ fill: 'remaining', value: 3 });
			const before = slots();

			handle.setValue(1);

			expect(slots()).toEqual(before); // same nodes — no rebuild
			expect(handle.getValue()).toBe(1);
			expect(slots()[1].getAttribute('aria-checked')).toBe('true');
			expect(slots()[3].getAttribute('aria-checked')).toBe('false');
			expect(slots()[1].hasAttribute('data-current')).toBe(true);
			expect(slots()[3].hasAttribute('data-current')).toBe(false);
			expect(slots()[1].getAttribute('data-fill')).toBe('on');
			expect(slots()[2].getAttribute('data-fill')).toBe('spent');
			expect(onChange).not.toHaveBeenCalled();
			expect(document.activeElement).not.toBe(slots()[1]);
		});
	});

	describe('keyboard + pointer', () => {
		test('roving tabindex: 0 on the checked slot only (one Tab stop), -1 on the rest — and it follows the value', () => {
			const { handle, slots } = mount({ value: 3 });
			const stops = () => slots().map((s) => s.getAttribute('tabindex'));

			expect(stops()).toEqual(['-1', '-1', '-1', '0', '-1', '-1']);
			handle.setValue(5);
			expect(stops()).toEqual(['-1', '-1', '-1', '-1', '-1', '0']);
		});

		test('click selects the slot: repaint + exactly one onChange(n)', () => {
			const { slots, onChange } = mount({ value: 3 });

			slots()[1].click();

			expect(slots()[1].getAttribute('aria-checked')).toBe('true');
			expect(onChange).toHaveBeenCalledTimes(1);
			expect(onChange).toHaveBeenCalledWith(1);
		});

		test('clicking the CURRENT slot is a no-op: no onChange', () => {
			const { slots, onChange } = mount({ value: 3 });

			slots()[3].click();

			expect(onChange).not.toHaveBeenCalled();
			expect(slots()[3].getAttribute('aria-checked')).toBe('true');
		});

		test('horizontal arrows: Right/Down = next in DOM order, Left/Up = previous; selection follows focus, ONE onChange per move', () => {
			const { slots, onChange } = mount({ value: 3 });

			keydown(slots()[3], 'ArrowRight');
			expect(slots()[4].getAttribute('aria-checked')).toBe('true');
			expect(document.activeElement).toBe(slots()[4]);
			expect(onChange).toHaveBeenLastCalledWith(4);

			keydown(slots()[4], 'ArrowLeft');
			expect(slots()[3].getAttribute('aria-checked')).toBe('true');
			expect(onChange).toHaveBeenLastCalledWith(3);

			keydown(slots()[3], 'ArrowDown');
			expect(onChange).toHaveBeenLastCalledWith(4);
			keydown(slots()[4], 'ArrowUp');
			expect(onChange).toHaveBeenLastCalledWith(3);

			expect(onChange).toHaveBeenCalledTimes(4);
		});

		test('arrows wrap at both ends; Home/End jump to the first/last slot in DOM order', () => {
			const { slots, onChange } = mount({ value: 5 });

			keydown(slots()[5], 'ArrowRight'); // wraps past the last
			expect(onChange).toHaveBeenLastCalledWith(0);
			keydown(slots()[0], 'ArrowLeft'); // wraps back
			expect(onChange).toHaveBeenLastCalledWith(5);
			keydown(slots()[5], 'Home');
			expect(onChange).toHaveBeenLastCalledWith(0);
			keydown(slots()[0], 'End');
			expect(onChange).toHaveBeenLastCalledWith(5);
		});

		test('DOM order, not numeric order, decides "next": ArrowDown on a descending Interest track goes 3 -> 2; Home is the TOP row (5)', () => {
			const { slots, onChange } = mount({ orientation: 'vertical', order: 'descending', value: 3, label: 'Interest' });

			keydown(slots()[2], 'ArrowDown'); // DOM row 2 is value 3
			expect(onChange).toHaveBeenLastCalledWith(2);
			keydown(slots()[3], 'Home');
			expect(onChange).toHaveBeenLastCalledWith(5);
		});

		test('handled keys are preventDefault-ed; unrelated keys pass through untouched', () => {
			const { slots, onChange } = mount({ value: 3 });

			expect(keydown(slots()[3], 'ArrowRight')).toBe(false); // defaultPrevented -> dispatchEvent false
			expect(keydown(slots()[4], 'a')).toBe(true);
			expect(keydown(slots()[4], 'Tab')).toBe(true);
			expect(onChange).toHaveBeenCalledTimes(1);
		});
	});

	describe('disabled (read-only hosts, F1 §4.4)', () => {
		test('REAL disabled buttons carrying the state, and no listeners: clicks and keys change nothing', () => {
			const { handle, slots, onChange } = mount({ disabled: true, value: 3 });

			for (const slot of slots()) expect(slot.disabled).toBe(true);
			expect(slots()[3].getAttribute('aria-checked')).toBe('true'); // state is still shown

			slots()[1].click();
			keydown(slots()[3], 'ArrowRight');
			expect(onChange).not.toHaveBeenCalled();
			expect(handle.getValue()).toBe(3);
			expect(slots()[3].getAttribute('aria-checked')).toBe('true');
		});
	});

	describe('hygiene', () => {
		test('track.ts passes the shared kit style guard (no inline colour, only --dse-* setProperty geometry)', () => {
			const src = fs.readFileSync(path.join(__dirname, '../../../src/framework/kit/track.ts'), 'utf8');

			expect(styleGuardFindings(src)).toEqual([]);
		});

		test('listeners are owner-bound: unloading the owner detaches them', () => {
			const parent = document.createElement('div');
			const owner = new Component();
			owner.load();
			const onChange = jest.fn();
			const handle = track(parent, { orientation: 'horizontal', max: 5, value: 3, label: 'P', onChange }, owner as any);

			owner.unload();
			handle.slotEls[1].click();

			expect(onChange).not.toHaveBeenCalled();
		});
	});
});
