// SC-186 — ConditionsModal (Option D "active list" manager): the single modal that
// replaces the retired two-modal AddConditionsModal/CustomizeConditionModal flow. Pins
// DOM shape, add via the real combobox (known + custom), delete, the inline row editor
// writing duration/color/effect, the duration-round-trip regression (the old
// Customize-clobber bug), the fallback glyph for unregistered keys, and badge rendering.
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
		expect(row.querySelector('.dse-cond-item__dur')?.textContent).toBe('Save Ends');
	});

	test('duration badge falls back to the legacy effect-string parse when `duration` is absent', () => {
		const { container } = makeModal([{ key: 'slowed', effect: 'EoT' }]);
		const row = rowByName(container, 'Slowed');
		expect(row.querySelector('.dse-cond-item__dur')?.textContent).toBe('EoT');
	});

	test('no duration -> no duration badge', () => {
		const { container } = makeModal(['restrained']);
		expect(rowByName(container, 'Restrained').querySelector('.dse-cond-item__dur')).toBeNull();
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
		expect(rowByName(container, 'Bleeding').querySelector('.dse-cond-item__dur')?.textContent).toBe('Save Ends');
	});

	test('"Until removed" clears an existing duration', () => {
		const onChange = jest.fn();
		const { container } = makeModal([{ key: 'bleeding', duration: 'eot' }], onChange);
		(rowByName(container, 'Bleeding').querySelector('button[aria-label="Customize Bleeding"]') as HTMLElement).click();
		const editor = container.querySelector('.dse-condal__editor') as HTMLElement;
		(editor.querySelector('button[aria-label="Until removed"]') as HTMLElement).click();

		expect(onChange).toHaveBeenLastCalledWith([{ key: 'bleeding' }]);
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
		expect(rowByName(container, 'Bleeding').querySelector('.dse-cond-item__dur')?.textContent).toBe('Save Ends');

		(rowByName(container, 'Bleeding').querySelector('button[aria-label="Customize Bleeding"]') as HTMLElement).click();
		const editor = container.querySelector('.dse-condal__editor') as HTMLElement;
		(editor.querySelector('button[aria-label="glow"]') as HTMLElement).click();

		expect(onChange).toHaveBeenLastCalledWith([{ key: 'bleeding', duration: 'save-ends', effect: 'glow' }]);
		expect(rowByName(container, 'Bleeding').querySelector('.dse-cond-item__dur')?.textContent).toBe('Save Ends');
	});
});

describe('SC-186: add — the real combobox (arrow keys + Enter, Escape, known + custom)', () => {
	test('"+ Add condition" swaps in a real combobox and focuses it', () => {
		const { container } = makeModal([]);
		const input = openCombobox(container);
		expect(container.querySelector('.dse-condal__add')).toBeNull();
		expect(input.getAttribute('role')).toBe('searchbox');
		expect(document.activeElement).toBe(input);
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

	test('picking the "Add custom: <text>" row adds `{ key: slug(text) }` and a CUSTOM-tagged row', () => {
		const onChange = jest.fn();
		const { container } = makeModal([], onChange);
		const input = openCombobox(container);
		typeQuery(input, 'Hexed By The Witch');
		const menu = container.querySelector('.dse-condal__menu') as HTMLElement;
		const customItem = menu.querySelector('.dse-condal__menu-custom') as HTMLElement;
		customItem.click();

		expect(onChange).toHaveBeenCalledWith([{ key: 'hexed-by-the-witch' }]);
		const row = rowByName(container, 'Hexed By The Witch');
		expect(row.querySelector('.dse-condal__tag')?.textContent).toBe('custom');
		expect(row.querySelector('.dse-condal__glyph')?.getAttribute('data-icon')).toBe('circle-dashed');
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

	test('blur (focus leaving the wrap entirely) collapses the combobox', () => {
		const { container } = makeModal([]);
		const input = openCombobox(container);
		const outside = document.createElement('button');
		document.body.appendChild(outside);
		input.dispatchEvent(new FocusEvent('focusout', { relatedTarget: outside, bubbles: true }));

		expect(container.querySelector('.dse-condal__combobox')).toBeNull();
		outside.remove();
	});

	test('blank/punctuation-only custom text is a no-op (never adds an empty-key condition)', () => {
		const onChange = jest.fn();
		const { container } = makeModal([], onChange);
		const input = openCombobox(container);
		typeQuery(input, '???');
		const menu = container.querySelector('.dse-condal__menu') as HTMLElement;
		(menu.querySelector('.dse-condal__menu-custom') as HTMLElement).click();

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
