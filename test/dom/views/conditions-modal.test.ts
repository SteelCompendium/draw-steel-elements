// SC-186 — ConditionsModal (Option D "active list" manager): the single modal that
// replaces the retired two-modal AddConditionsModal/CustomizeConditionModal flow. Pins
// DOM shape, add via the real combobox (known + custom), delete, the inline row editor
// writing duration/color/effect, the duration-round-trip regression (the old
// Customize-clobber bug), the fallback glyph for unregistered keys, badge rendering, and
// the SC-186 fix-round findings (HIGH-1/2, MED-1/2/3/4, LOW-3/4) and the micro-round
// residuals (LOW-A/B/D + the HIGH-1 scrollIntoView nicety) — see ConditionsModal.ts's
// file header for the causal explanation of each.
import * as fs from 'fs';
import * as path from 'path';
import { ConditionsModal } from '@views/ConditionsModal';
import type { Condition, ConditionHolder } from '@drawSteelAdmonition/EncounterData';
import { ConditionManager } from '@utils/Conditions';
import { openManagedModal } from '@/framework/kit';
import { App, Component } from '../../mocks/obsidian';
import { styleGuardFindings } from '../kit/styleGuard';

function makeModal(conditions: (string | Condition)[] = [], onChange = jest.fn()) {
	const holder: ConditionHolder = { conditions };
	const modal = new ConditionsModal(new App() as any, holder, new ConditionManager(), onChange);
	modal.open();
	const container = (modal as any).containerEl as HTMLElement;
	return { modal, holder, onChange, container };
}

function rows(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>('.dse-condal__row'));
}

function rowByName(container: HTMLElement, name: string): HTMLElement {
	const row = rows(container).find((r) => r.querySelector('.dse-condal__name')?.textContent === name);
	if (!row) throw new Error(`no .dse-condal__row for "${name}"`);
	return row;
}

function footerBtn(container: HTMLElement, label: string): HTMLButtonElement {
	const el = container.querySelector<HTMLButtonElement>(`.dse-modal__footer button[aria-label="${label}"]`);
	if (!el) throw new Error(`no footer button [aria-label="${label}"]`);
	return el;
}

function openCombobox(container: HTMLElement): HTMLInputElement {
	(container.querySelector('button[aria-label="Add condition"]') as HTMLElement).click();
	return container.querySelector('.dse-condal__input') as HTMLInputElement;
}

function typeQuery(input: HTMLInputElement, text: string): void {
	input.value = text;
	input.dispatchEvent(new Event('input'));
}

function pressKey(input: HTMLInputElement, key: string): void {
	input.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

/** SC-186 fix-round HIGH-2: picks are bound to `mousedown` (not `click`) so a real
 *  browser's focus-shift-on-mousedown-away-from-input can never race the pick. Tests
 *  must dispatch the same event the production affordance uses. */
function mousedownPick(item: HTMLElement): void {
	item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('SC-186: ConditionsModal — DOM shape', () => {
	test('is a kit DseModal: .dse-modal, "Conditions" title, the width class, list + addwrap in the body', () => {
		const { container } = makeModal();
		expect(container.classList.contains('dse-modal')).toBe(true);
		expect(container.classList.contains('dse-condal-modal')).toBe(true);
		const titleEl = container.querySelector('.dse-modal__title') as HTMLElement;
		expect(titleEl.textContent).toBe('Conditions');
		expect(container.getAttribute('aria-labelledby')).toBe(titleEl.id);
		expect(container.querySelector('.dse-modal__body .dse-condal__list')).not.toBeNull();
		expect(container.querySelector('.dse-modal__body .dse-condal__addwrap')).not.toBeNull();
	});

	test('the list is role="list" with an accessible label; each row is role="listitem"', () => {
		const { container } = makeModal(['bleeding', 'slowed']);
		const list = container.querySelector('.dse-condal__list') as HTMLElement;
		expect(list.getAttribute('role')).toBe('list');
		expect(list.getAttribute('aria-label')).toBe('Active conditions');
		expect(rows(container)).toHaveLength(2);
		rows(container).forEach((r) => expect(r.getAttribute('role')).toBe('listitem'));
	});

	test('footer: a single accent "Done" button — no Cancel, no staged-count label', () => {
		const { container } = makeModal(['bleeding']);
		const done = footerBtn(container, 'Done');
		expect(done.classList.contains('dse-btn--accent')).toBe(true);
		expect(container.querySelectorAll('.dse-modal__footer button')).toHaveLength(1);
	});

	test('an empty holder renders zero rows and the bare "+ Add condition" button', () => {
		const { container } = makeModal([]);
		expect(rows(container)).toHaveLength(0);
		expect(container.querySelector('button[aria-label="Add condition"]')).not.toBeNull();
		expect(container.querySelector('.dse-condal__combobox')).toBeNull();
	});

	test('bare-string entries normalize to {key} rows just like object entries', () => {
		const { container } = makeModal(['bleeding']);
		expect(rowByName(container, 'Bleeding')).toBeDefined();
	});
});

describe('SC-186: each row — glyph, name, badges, cog + delete', () => {
	test('a known condition: registry icon/name, no CUSTOM tag', () => {
		const { container } = makeModal(['bleeding']);
		const row = rowByName(container, 'Bleeding');
		expect(row.querySelector('.dse-condal__glyph')?.getAttribute('data-icon')).toBe('droplet');
		expect(row.querySelector('.dse-condal__tag')).toBeNull();
		expect(row.querySelector('button[aria-label="Customize Bleeding"]')).not.toBeNull();
		expect(row.querySelector('button[aria-label="Remove Bleeding"]')).not.toBeNull();
	});

	test('SC-186: an unregistered (custom) key falls back to the generic glyph + title case + a dashed CUSTOM tag', () => {
		const { container } = makeModal([{ key: 'hexed' }]);
		const row = rowByName(container, 'Hexed');
		expect(row.querySelector('.dse-condal__glyph')?.getAttribute('data-icon')).toBe('circle-dashed');
		expect(row.querySelector('.dse-condal__tag')?.textContent).toBe('custom');
	});

	test('duration badge renders from the first-class `duration` field', () => {
		const { container } = makeModal([{ key: 'bleeding', duration: 'save-ends' }]);
		const row = rowByName(container, 'Bleeding');
		expect(row.querySelector('.dse-condal__dur')?.textContent).toBe('Save Ends');
	});

	test('duration badge falls back to the legacy effect-string parse when `duration` is absent', () => {
		const { container } = makeModal([{ key: 'slowed', effect: 'EoT' }]);
		const row = rowByName(container, 'Slowed');
		expect(row.querySelector('.dse-condal__dur')?.textContent).toBe('EoT');
	});

	test('no duration -> no duration badge', () => {
		const { container } = makeModal(['restrained']);
		expect(rowByName(container, 'Restrained').querySelector('.dse-condal__dur')).toBeNull();
	});

	test('the color rides the VALIDATED --dse-condition-color property, never el.style.color', () => {
		const { container } = makeModal([{ key: 'bleeding', color: '#ff0000' }]);
		const glyph = rowByName(container, 'Bleeding').querySelector('.dse-condal__glyph') as HTMLElement;
		expect(glyph.style.getPropertyValue('--dse-condition-color')).toBe('#ff0000');
		expect(glyph.style.color).toBe('');
	});

	test('delete removes the row and applies live (onChange fires with the remaining list)', () => {
		const onChange = jest.fn();
		const { container, holder } = makeModal(['bleeding', 'slowed'], onChange);

		(rowByName(container, 'Slowed').querySelector('button[aria-label="Remove Slowed"]') as HTMLElement).click();

		expect(rows(container)).toHaveLength(1);
		expect(rowByName(container, 'Bleeding')).toBeDefined();
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith([{ key: 'bleeding' }]);
		expect(holder.conditions).toEqual([{ key: 'bleeding' }]);
	});

	test('SC-186 fix-round MED-3: deleting a row focuses the row that shifted into its slot, not <body>', () => {
		const { container } = makeModal(['bleeding', 'slowed', 'restrained']);
		(rowByName(container, 'Bleeding').querySelector('button[aria-label="Remove Bleeding"]') as HTMLElement).click();
		// "Slowed" shifted from index 1 to index 0 — its cog should be focused.
		const cog = rowByName(container, 'Slowed').querySelector('button[aria-label="Customize Slowed"]');
		expect(document.activeElement).toBe(cog);
	});

	test('SC-186 fix-round MED-3: deleting the LAST row focuses the shifted-into-place row, not the deleted one', () => {
		const { container } = makeModal(['bleeding', 'slowed']);
		(rowByName(container, 'Slowed').querySelector('button[aria-label="Remove Slowed"]') as HTMLElement).click();
		const cog = rowByName(container, 'Bleeding').querySelector('button[aria-label="Customize Bleeding"]');
		expect(document.activeElement).toBe(cog);
	});

	test('SC-186 fix-round MED-3: deleting the ONLY row focuses the "+ Add condition" button, not <body>', () => {
		const { container } = makeModal(['bleeding']);
		(rowByName(container, 'Bleeding').querySelector('button[aria-label="Remove Bleeding"]') as HTMLElement).click();
		expect(document.activeElement).toBe(container.querySelector('button[aria-label="Add condition"]'));
	});
});

describe('SC-186: the inline row editor (cog) — Duration / Color / Effect', () => {
	test('the cog opens an inline editor UNDER the row (no child modal); a second click closes it', () => {
		const { container } = makeModal(['bleeding']);
		const row = rowByName(container, 'Bleeding');
		(row.querySelector('button[aria-label="Customize Bleeding"]') as HTMLElement).click();

		expect(document.querySelectorAll('.dse-modal')).toHaveLength(1); // no child modal
		const editor = container.querySelector('.dse-condal__editor') as HTMLElement;
		expect(editor).not.toBeNull();
		expect(rowByName(container, 'Bleeding').classList.contains('dse-condal__row--open')).toBe(true);
		expect(editor.querySelector('[aria-label="Duration"]')).not.toBeNull();
		expect(editor.querySelector('[aria-label="Color"]')).not.toBeNull();
		expect(editor.querySelector('[aria-label="Effect"]')).not.toBeNull();

		(rowByName(container, 'Bleeding').querySelector('button[aria-label="Customize Bleeding"]') as HTMLElement).click();
		expect(container.querySelector('.dse-condal__editor')).toBeNull();
	});

	test('SC-186 fix-round MED-3: toggling the editor keeps focus on the same row\'s cog', () => {
		const { container } = makeModal(['bleeding']);
		(rowByName(container, 'Bleeding').querySelector('button[aria-label="Customize Bleeding"]') as HTMLElement).click();
		expect(document.activeElement).toBe(
			rowByName(container, 'Bleeding').querySelector('button[aria-label="Customize Bleeding"]'),
		);
	});

	test('only one editor is open at a time', () => {
		const { container } = makeModal(['bleeding', 'slowed']);
		(rowByName(container, 'Bleeding').querySelector('button[aria-label="Customize Bleeding"]') as HTMLElement).click();
		(rowByName(container, 'Slowed').querySelector('button[aria-label="Customize Slowed"]') as HTMLElement).click();
		expect(container.querySelectorAll('.dse-condal__editor')).toHaveLength(1);
		expect(rowByName(container, 'Bleeding').classList.contains('dse-condal__row--open')).toBe(false);
		expect(rowByName(container, 'Slowed').classList.contains('dse-condal__row--open')).toBe(true);
	});

	test('picking a duration chip writes `duration` live and applies immediately', () => {
		const onChange = jest.fn();
		const { container } = makeModal(['bleeding'], onChange);
		(rowByName(container, 'Bleeding').querySelector('button[aria-label="Customize Bleeding"]') as HTMLElement).click();

		const editor = container.querySelector('.dse-condal__editor') as HTMLElement;
		(editor.querySelector('button[aria-label="Save Ends"]') as HTMLElement).click();

		expect(onChange).toHaveBeenLastCalledWith([{ key: 'bleeding', duration: 'save-ends' }]);
		expect(rowByName(container, 'Bleeding').querySelector('.dse-condal__dur')?.textContent).toBe('Save Ends');
	});

	test('"Until removed" clears an existing first-class duration', () => {
		const onChange = jest.fn();
		const { container } = makeModal([{ key: 'bleeding', duration: 'eot' }], onChange);
		(rowByName(container, 'Bleeding').querySelector('button[aria-label="Customize Bleeding"]') as HTMLElement).click();
		const editor = container.querySelector('.dse-condal__editor') as HTMLElement;
		(editor.querySelector('button[aria-label="Until removed"]') as HTMLElement).click();

		expect(onChange).toHaveBeenLastCalledWith([{ key: 'bleeding' }]);
	});

	test('SC-186 fix-round MED-1 REGRESSION: "Until removed" against a LEGACY effect-string duration actually clears it (was a silent no-op)', () => {
		// The bug: setDuration only ever wrote `duration`, so on a condition whose ONLY
		// duration signal was the legacy `effect: "save ends"` text, clicking "Until
		// removed" wrote `duration: undefined` — a value resolveDuration() already
		// treats as "fall through to the legacy effect string" — so the badge never
		// changed and the click was invisible (while still firing a spurious write).
		const onChange = jest.fn();
		const { container } = makeModal([{ key: 'bleeding', effect: 'save ends' }], onChange);
		expect(rowByName(container, 'Bleeding').querySelector('.dse-condal__dur')?.textContent).toBe('Save Ends');

		(rowByName(container, 'Bleeding').querySelector('button[aria-label="Customize Bleeding"]') as HTMLElement).click();
		const editor = container.querySelector('.dse-condal__editor') as HTMLElement;
		(editor.querySelector('button[aria-label="Until removed"]') as HTMLElement).click();

		expect(onChange).toHaveBeenLastCalledWith([{ key: 'bleeding' }]); // effect cleared too
		expect(rowByName(container, 'Bleeding').querySelector('.dse-condal__dur')).toBeNull();
	});

	test('SC-186 micro-round LOW-A: a condition that ALREADY has a first-class duration still carries a DEAD legacy effect string, which any explicit duration write must also clear', () => {
		// The bug: setDuration's cleanup only ran when `entry.duration` STARTED
		// undefined. `{effect: 'eot', duration: 'save-ends'}` (hand-authored, or written
		// by a pre-fix build) already has a first-class `duration`, so the guard skipped
		// the legacy `effect` text entirely — picking a DIFFERENT preset (here, "End of
		// Turn") emitted `{key, effect: 'eot'}` with `duration` cleared but the dead
		// `effect: 'eot'` left behind, and resolveDuration() immediately fell back to
		// THAT the moment `duration` was gone, flipping the badge to "EoT" regardless of
		// which preset was actually clicked.
		const onChange = jest.fn();
		const { container } = makeModal([{ key: 'bleeding', effect: 'eot', duration: 'save-ends' }], onChange);
		(rowByName(container, 'Bleeding').querySelector('button[aria-label="Customize Bleeding"]') as HTMLElement).click();
		const editor = container.querySelector('.dse-condal__editor') as HTMLElement;
		(editor.querySelector('button[aria-label="End of Turn"]') as HTMLElement).click();

		expect(onChange).toHaveBeenLastCalledWith([{ key: 'bleeding', duration: 'eot' }]); // no dangling effect
		expect(rowByName(container, 'Bleeding').querySelector('.dse-condal__dur')?.textContent).toBe('EoT');
	});

	test('picking a swatch writes `color` live via the VALIDATED property', () => {
		const onChange = jest.fn();
		const { container } = makeModal(['bleeding'], onChange);
		(rowByName(container, 'Bleeding').querySelector('button[aria-label="Customize Bleeding"]') as HTMLElement).click();
		const editor = container.querySelector('.dse-condal__editor') as HTMLElement;
		(editor.querySelector('button[aria-label="Color #c0392b"]') as HTMLElement).click();

		expect(onChange).toHaveBeenLastCalledWith([{ key: 'bleeding', color: '#c0392b' }]);
		const glyph = rowByName(container, 'Bleeding').querySelector('.dse-condal__glyph') as HTMLElement;
		expect(glyph.style.getPropertyValue('--dse-condition-color')).toBe('#c0392b');
	});

	test('the custom color <input type=color> change event writes `color`', () => {
		const onChange = jest.fn();
		const { container } = makeModal(['bleeding'], onChange);
		(rowByName(container, 'Bleeding').querySelector('button[aria-label="Customize Bleeding"]') as HTMLElement).click();
		const editor = container.querySelector('.dse-condal__editor') as HTMLElement;
		const colorInput = editor.querySelector('input[type="color"]') as HTMLInputElement;
		colorInput.value = '#00ff00';
		colorInput.dispatchEvent(new Event('change'));

		expect(onChange).toHaveBeenLastCalledWith([{ key: 'bleeding', color: '#00ff00' }]);
	});

	test('picking an effect chip writes `effect` live; "static" clears it', () => {
		const onChange = jest.fn();
		const { container } = makeModal(['bleeding'], onChange);
		(rowByName(container, 'Bleeding').querySelector('button[aria-label="Customize Bleeding"]') as HTMLElement).click();
		let editor = container.querySelector('.dse-condal__editor') as HTMLElement;
		(editor.querySelector('button[aria-label="glow"]') as HTMLElement).click();
		expect(onChange).toHaveBeenLastCalledWith([{ key: 'bleeding', effect: 'glow' }]);

		editor = container.querySelector('.dse-condal__editor') as HTMLElement;
		(editor.querySelector('button[aria-label="static"]') as HTMLElement).click();
		expect(onChange).toHaveBeenLastCalledWith([{ key: 'bleeding' }]);
	});

	test('SC-186 REGRESSION: picking an effect on a YAML-authored duration condition MIGRATES (never clobbers) the duration', () => {
		// The bug: the old CustomizeConditionModal wrote color+effect back
		// unconditionally on Save, and its effect <select> had no duration options, so
		// opening Customize on a hand-authored `effect: "save ends"` condition and
		// hitting Save silently stripped the duration. Here, picking an EFFECT must
		// migrate the legacy duration into the first-class field, not destroy it.
		const onChange = jest.fn();
		const { container } = makeModal([{ key: 'bleeding', effect: 'save ends' }], onChange);
		expect(rowByName(container, 'Bleeding').querySelector('.dse-condal__dur')?.textContent).toBe('Save Ends');

		(rowByName(container, 'Bleeding').querySelector('button[aria-label="Customize Bleeding"]') as HTMLElement).click();
		const editor = container.querySelector('.dse-condal__editor') as HTMLElement;
		(editor.querySelector('button[aria-label="glow"]') as HTMLElement).click();

		expect(onChange).toHaveBeenLastCalledWith([{ key: 'bleeding', duration: 'save-ends', effect: 'glow' }]);
		expect(rowByName(container, 'Bleeding').querySelector('.dse-condal__dur')?.textContent).toBe('Save Ends');
	});

	test('SC-186 fix-round MED-3: picking a chip in the editor keeps focus on the row\'s cog', () => {
		const { container } = makeModal(['bleeding']);
		(rowByName(container, 'Bleeding').querySelector('button[aria-label="Customize Bleeding"]') as HTMLElement).click();
		const editor = container.querySelector('.dse-condal__editor') as HTMLElement;
		(editor.querySelector('button[aria-label="Save Ends"]') as HTMLElement).click();
		expect(document.activeElement).toBe(
			rowByName(container, 'Bleeding').querySelector('button[aria-label="Customize Bleeding"]'),
		);
	});
});

describe('SC-186: add — the real combobox (arrow keys + Enter, Escape, known + custom)', () => {
	test('"+ Add condition" swaps in a real combobox and focuses it', () => {
		const { container } = makeModal([]);
		const input = openCombobox(container);
		expect(container.querySelector('.dse-condal__add')).toBeNull();
		expect(document.activeElement).toBe(input);
	});

	test('SC-186 micro-round INFO (finishes HIGH-1): opening the combobox scrolls the dropdown into view', () => {
		// jsdom doesn't implement scrollIntoView, so this spies on the prototype (like
		// the guarded call site itself expects to find nothing in test but SOMETHING in
		// a real browser) to confirm the call happens at all, on the menu specifically.
		const spy = jest.fn();
		(HTMLElement.prototype as any).scrollIntoView = spy;
		try {
			const { container } = makeModal([]);
			openCombobox(container);
			const menu = container.querySelector('.dse-condal__menu');
			expect(spy).toHaveBeenCalledWith({ block: 'nearest' });
			expect(spy.mock.instances[spy.mock.instances.length - 1]).toBe(menu);
		} finally {
			delete (HTMLElement.prototype as any).scrollIntoView;
		}
	});

	test('SC-186 fix-round MED-4: role="combobox" is on the INPUT (not the wrapper), with aria-controls the listbox', () => {
		const { container } = makeModal([]);
		const input = openCombobox(container);
		expect(input.getAttribute('role')).toBe('combobox');
		expect(input.getAttribute('aria-haspopup')).toBe('listbox');
		expect(input.getAttribute('aria-expanded')).toBe('true');
		const menu = container.querySelector('.dse-condal__menu') as HTMLElement;
		expect(menu.id).toBeTruthy();
		expect(input.getAttribute('aria-controls')).toBe(menu.id);
		// The wrapper div carries no combobox role of its own.
		expect(container.querySelector('.dse-condal__combobox')?.getAttribute('role')).toBeNull();
	});

	test('SC-186 fix-round MED-4: aria-activedescendant tracks the highlighted option by id', () => {
		const { container } = makeModal([]);
		const input = openCombobox(container);
		typeQuery(input, 'co');
		const menu = container.querySelector('.dse-condal__menu') as HTMLElement;
		const activeItem = menu.querySelector('.dse-condal__menu-item--active') as HTMLElement;
		expect(activeItem.id).toBeTruthy();
		expect(input.getAttribute('aria-activedescendant')).toBe(activeItem.id);

		pressKey(input, 'ArrowDown');
		const newActive = menu.querySelector('.dse-condal__menu-item--active') as HTMLElement;
		expect(newActive.id).not.toBe(activeItem.id);
		expect(input.getAttribute('aria-activedescendant')).toBe(newActive.id);
	});

	test('SC-186 fix-round MED-4: the dropdown listbox never contains a role="separator" child', () => {
		const { container } = makeModal([]);
		const input = openCombobox(container);
		typeQuery(input, 'co');
		const menu = container.querySelector('.dse-condal__menu') as HTMLElement;
		expect(menu.querySelector('[role="separator"]')).toBeNull();
		Array.from(menu.children).forEach((child) => expect(child.getAttribute('role')).toBe('option'));
	});

	test('typing filters the dropdown; the first match is keyboard-highlighted', () => {
		const { container } = makeModal([]);
		const input = openCombobox(container);
		typeQuery(input, 'co');

		const menu = container.querySelector('.dse-condal__menu') as HTMLElement;
		const items = Array.from(menu.querySelectorAll('.dse-condal__menu-item'));
		const names = items.map((i) => i.querySelector('.dse-condal__menu-name')?.textContent);
		expect(names).toContain('Covered');
		expect(names).toContain('Concealed');
		expect(items[0].classList.contains('dse-condal__menu-item--active')).toBe(true);
		// Always ends with an "Add custom: <text>" row.
		const last = items[items.length - 1];
		expect(last.classList.contains('dse-condal__menu-custom')).toBe(true);
		expect(last.textContent).toContain('Add custom:');
		expect(last.textContent).toContain('co');
	});

	test('empty query shows the full catalog with no "Add custom" row', () => {
		const { container } = makeModal([]);
		const input = openCombobox(container);
		typeQuery(input, '');
		const menu = container.querySelector('.dse-condal__menu') as HTMLElement;
		expect(menu.querySelector('.dse-condal__menu-custom')).toBeNull();
		expect(menu.querySelectorAll('.dse-condal__menu-item').length).toBeGreaterThan(1);
	});

	test('ArrowDown/ArrowUp move the highlighted match; Enter picks it', () => {
		const onChange = jest.fn();
		const { container } = makeModal([], onChange);
		const input = openCombobox(container);
		typeQuery(input, 'co'); // Covered, Concealed, Unconscious(?), + custom
		pressKey(input, 'ArrowDown'); // move off Covered onto the 2nd match
		pressKey(input, 'Enter');

		expect(onChange).toHaveBeenCalledTimes(1);
		const added = onChange.mock.calls[0][0] as Condition[];
		expect(added).toHaveLength(1);
		expect(added[0].key).not.toBe('covered'); // moved past the first match
	});

	test('picking a KNOWN match adds it by registry key and keeps the combobox open, cleared, refocused', () => {
		const onChange = jest.fn();
		const { container } = makeModal([], onChange);
		const input = openCombobox(container);
		typeQuery(input, 'Bleeding');
		pressKey(input, 'Enter');

		expect(onChange).toHaveBeenCalledWith([{ key: 'bleeding' }]);
		expect(rowByName(container, 'Bleeding')).toBeDefined();
		// Still open, for rapid multi-add — the SAME input, cleared and refocused.
		const stillInput = container.querySelector('.dse-condal__input') as HTMLInputElement;
		expect(stillInput).not.toBeNull();
		expect(stillInput.value).toBe('');
		expect(document.activeElement).toBe(stillInput);
	});

	test('SC-186 fix-round HIGH-2 REGRESSION: a MOUSE pick (mousedown, not click) adds the condition', () => {
		// The bug: picks were bound to `click`. A real browser blurs the input on
		// `mousedown` even against this non-focusable `<div role="option">`, which fired
		// the (now-removed) `focusout` auto-close BEFORE the subsequent `click` could
		// ever run — a mouse pick silently did nothing. jsdom's `.click()` never
		// exercised this because it doesn't replicate that focus-shift-on-mousedown
		// behavior, so this regression test dispatches the REAL event sequence a mouse
		// produces (mousedown only — never `.click()`) against the production listener.
		const onChange = jest.fn();
		const { container } = makeModal([], onChange);
		const input = openCombobox(container);
		typeQuery(input, 'Bleeding');
		const menu = container.querySelector('.dse-condal__menu') as HTMLElement;
		const item = menu.querySelector('.dse-condal__menu-item') as HTMLElement;

		mousedownPick(item);

		expect(onChange).toHaveBeenCalledWith([{ key: 'bleeding' }]);
		expect(rowByName(container, 'Bleeding')).toBeDefined();
	});

	test('SC-186 fix-round HIGH-2 REGRESSION #2: a successful mouse pick does NOT spuriously close the combobox', () => {
		// A second, subtler instance of the same class of bug: the pick handler's own
		// re-render (renderList()/comboReset()) DETACHES the clicked item from the DOM
		// mid-bubble, so the document-level outside-close listener (which runs AFTER the
		// item's own mousedown handler, per bubble order) must not mistake "the node I
		// was dispatched from is no longer attached to addWrapEl" for "the click landed
		// outside addWrapEl" — composedPath(), not a post-hoc .contains() check, is what
		// makes that distinction correctly.
		const { container } = makeModal([]);
		const input = openCombobox(container);
		typeQuery(input, 'Bleeding');
		const menu = container.querySelector('.dse-condal__menu') as HTMLElement;
		mousedownPick(menu.querySelector('.dse-condal__menu-item') as HTMLElement);

		expect(container.querySelector('.dse-condal__combobox')).not.toBeNull(); // still open
		expect(document.activeElement).toBe(container.querySelector('.dse-condal__input'));
	});

	test('SC-186 micro-round LOW-B: a right-click (or middle-click) on a match does NOT pick it', () => {
		// The bug: `mousedown` fires for every button, so binding the pick straight to it
		// (HIGH-2's own fix) meant right-click (button 2) and middle-click (button 1)
		// both added the condition — and preventDefault() on a right-click additionally
		// suppressed the browser's own context menu. Left-click (button 0) only.
		const onChange = jest.fn();
		const { container } = makeModal([], onChange);
		const input = openCombobox(container);
		typeQuery(input, 'Bleeding');
		const menu = container.querySelector('.dse-condal__menu') as HTMLElement;
		const item = menu.querySelector('.dse-condal__menu-item') as HTMLElement;

		item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 2 }));

		expect(onChange).not.toHaveBeenCalled();
		expect(rows(container)).toHaveLength(0);
	});

	test('picking the "Add custom: <text>" row adds `{ key: slug(text) }` and a CUSTOM-tagged row', () => {
		const onChange = jest.fn();
		const { container } = makeModal([], onChange);
		const input = openCombobox(container);
		typeQuery(input, 'Hexed By The Witch');
		const menu = container.querySelector('.dse-condal__menu') as HTMLElement;
		const customItem = menu.querySelector('.dse-condal__menu-custom') as HTMLElement;
		mousedownPick(customItem);

		expect(onChange).toHaveBeenCalledWith([{ key: 'hexed-by-the-witch' }]);
		const row = rowByName(container, 'Hexed By The Witch');
		expect(row.querySelector('.dse-condal__tag')?.textContent).toBe('custom');
		expect(row.querySelector('.dse-condal__glyph')?.getAttribute('data-icon')).toBe('circle-dashed');
	});

	test('SC-186 fix-round MED-2 (refined LOW-D): picking a match that ALREADY EXISTS never adds a duplicate, and leaves focus + the query in the input', () => {
		// LOW-D: the original MED-2 fix moved focus to the existing row's cog as the
		// "acknowledgment" — which yanked focus OUT of the input while the combobox
		// stayed visibly open, so further keystrokes went nowhere. The row is now
		// scrolled into view instead; focus and the typed query are left untouched.
		const onChange = jest.fn();
		const { container } = makeModal(['bleeding'], onChange);
		const input = openCombobox(container);
		typeQuery(input, 'Bleeding');
		const menu = container.querySelector('.dse-condal__menu') as HTMLElement;
		const item = Array.from(menu.querySelectorAll('.dse-condal__menu-item')).find(
			(i) => i.querySelector('.dse-condal__menu-name')?.textContent === 'Bleeding',
		) as HTMLElement;

		const existingRow = rowByName(container, 'Bleeding');
		const scrollSpy = jest.fn();
		existingRow.scrollIntoView = scrollSpy;

		mousedownPick(item);

		expect(onChange).not.toHaveBeenCalled(); // no add, no write
		expect(rows(container)).toHaveLength(1);
		expect(scrollSpy).toHaveBeenCalledWith({ block: 'nearest' });
		// Focus and the query stayed in the input — nothing was yanked away.
		expect(document.activeElement).toBe(container.querySelector('.dse-condal__input'));
		expect((container.querySelector('.dse-condal__input') as HTMLInputElement).value).toBe('Bleeding');
	});

	test('rapid multi-add: two picks in a row without reopening produce two rows', () => {
		const onChange = jest.fn();
		const { container } = makeModal([], onChange);
		const input = openCombobox(container);
		typeQuery(input, 'Bleeding');
		pressKey(input, 'Enter');
		const secondInput = container.querySelector('.dse-condal__input') as HTMLInputElement;
		typeQuery(secondInput, 'Slowed');
		pressKey(secondInput, 'Enter');

		expect(rows(container)).toHaveLength(2);
		expect(onChange).toHaveBeenLastCalledWith([{ key: 'bleeding' }, { key: 'slowed' }]);
	});

	test('Escape closes the combobox back to the "+ Add condition" button, focused', () => {
		const { container } = makeModal([]);
		const input = openCombobox(container);
		pressKey(input, 'Escape');

		expect(container.querySelector('.dse-condal__combobox')).toBeNull();
		const addBtn = container.querySelector('button[aria-label="Add condition"]') as HTMLElement;
		expect(addBtn).not.toBeNull();
		expect(document.activeElement).toBe(addBtn);
	});

	test('SC-186 fix-round LOW-4: Escape inside the combobox does not bubble past this modal (stopPropagation)', () => {
		const { container } = makeModal([]);
		const input = openCombobox(container);
		const outerHandler = jest.fn();
		// A real Obsidian Modal closes itself on an Escape that reaches its own Scope —
		// simulated here as a bubble-phase listener on an ancestor of the input.
		container.addEventListener('keydown', outerHandler);
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
		expect(outerHandler).not.toHaveBeenCalled();
	});

	test('SC-186 fix-round HIGH-2: outside-close is a single DOCUMENT-level mousedown, not focusout', () => {
		const { container } = makeModal([]);
		openCombobox(container);
		const outside = document.createElement('button');
		document.body.appendChild(outside);

		outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

		expect(container.querySelector('.dse-condal__combobox')).toBeNull();
		outside.remove();
	});

	test('a mousedown INSIDE the add control (e.g. the search icon) does not close the combobox', () => {
		const { container } = makeModal([]);
		openCombobox(container);
		const searchIcon = container.querySelector('.dse-condal__search') as HTMLElement;
		searchIcon.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		expect(container.querySelector('.dse-condal__combobox')).not.toBeNull();
	});

	test('blank/punctuation-only custom text is a no-op (never adds an empty-key condition)', () => {
		const onChange = jest.fn();
		const { container } = makeModal([], onChange);
		const input = openCombobox(container);
		typeQuery(input, '???');
		const menu = container.querySelector('.dse-condal__menu') as HTMLElement;
		mousedownPick(menu.querySelector('.dse-condal__menu-custom') as HTMLElement);

		expect(onChange).not.toHaveBeenCalled();
		expect(rows(container)).toHaveLength(0);
	});
});

describe('SC-186: managed lifecycle + hygiene', () => {
	test('openManagedModal: owner unload auto-closes the modal (F1 §4.5)', () => {
		const owner = new Component();
		const onChange = jest.fn();
		const modal = openManagedModal(
			owner as any,
			() => new ConditionsModal(new App() as any, { conditions: [] }, new ConditionManager(), onChange),
		);
		const container = (modal as any).containerEl as HTMLElement;
		owner.unload();
		expect(document.body.contains(container)).toBe(false);
		expect(onChange).not.toHaveBeenCalled();
	});

	test('Done just closes — it fires no additional onChange (add/delete already applied live)', () => {
		const onChange = jest.fn();
		const { container } = makeModal(['bleeding'], onChange);
		footerBtn(container, 'Done').click();
		expect(onChange).not.toHaveBeenCalled();
		expect(document.body.contains(container)).toBe(false);
	});

	test('source hygiene: imports the kit + the shared color/duration/display helpers, passes the style guard', () => {
		const src = fs.readFileSync(path.join(__dirname, '../../../src/views/ConditionsModal.ts'), 'utf8');
		expect(src).toMatch(/from '@\/framework\/kit'/);
		expect(src).toMatch(/applyConditionColor/);
		expect(src).toMatch(/resolveDuration/);
		const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
		expect(code).not.toMatch(/\.style\.color/);
		// Two EXEMPT data lines (form-control/preset VALUES, not styling): the color
		// input's initial swatch default, and the preset swatch hex values themselves
		// (same exemption CustomizeConditionModal's own test used to carry).
		const scanned = src
			.replace(/^.*COLOR_INPUT_DEFAULT.*$/gm, '')
			.replace(/^const SWATCHES = .*$/gm, '');
		expect(styleGuardFindings(scanned)).toEqual([]);
	});

	test('SC-186 fix-round HIGH-2 source hygiene: item picks bind mousedown (not click), with preventDefault', () => {
		const src = fs.readFileSync(path.join(__dirname, '../../../src/views/ConditionsModal.ts'), 'utf8');
		const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
		expect(code).toMatch(/registerDomEvent\(item, 'mousedown'/);
		expect(code).not.toMatch(/registerDomEvent\(item, 'click'/);
	});

	test('CSS: the retired picker/customize chrome is evicted; the new modal classes exist', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		expect(sheet).not.toMatch(/\.dse-cond-list\b/);
		expect(sheet).not.toMatch(/\.dse-cond-item\b/);
		expect(sheet).not.toMatch(/\.dse-cust\b/);
		expect(sheet).not.toMatch(/\.dse-cust__preview\b/);
		expect(sheet).toMatch(/\.dse-condal-modal\s*\{/);
		expect(sheet).toMatch(/\.dse-condal__row\s*\{/);
		expect(sheet).toMatch(/\.dse-condal__editor\s*\{/);
		expect(sheet).toMatch(/\.dse-condal__combobox\s*\{/);
		expect(sheet).toMatch(/\.dse-condal__menu\s*\{/);
		expect(sheet).toMatch(/\.dse-condal__dur\s*\{/);
	});

	test('SC-186 fix-round HIGH-1: the dropdown menu is NOT position:absolute (renders in normal flow, so the modal body can scroll to it)', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		const block = sheet.match(/\.dse-condal__menu\s*\{[^}]*\}/);
		expect(block).not.toBeNull();
		expect(block![0]).not.toMatch(/position:\s*absolute/);
	});

	test('CSS: every Steel visual treatment for the new classes carries the Steel scoping rule', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		const steelRules = sheet.match(/\[data-dse-theme='steel'\][^{]*\.dse-(condal|optchip|swatch)[^{]*\{/g) ?? [];
		expect(steelRules.length).toBeGreaterThan(0);
		for (const rule of steelRules) {
			expect(rule).toContain(':not([data-dse-print="on"])');
		}
	});
});
