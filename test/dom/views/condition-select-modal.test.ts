// Plan 09 Task 8 (D2 §3.x) — AddConditionsModal (ConditionSelectModal.ts) on the kit
// managedModal. Condition list items become kit-button rows
// (.dse-cond-item[aria-selected], the toggle carrying aria-pressed checkbox
// semantics); the customize cog is a REAL button revealed on hover AND focus
// (:hover / :focus-within — a11y, not the legacy mouseenter-only inline
// display toggle); row icons are colored through the VALIDATED
// --dse-condition-color property (OD-8/SD-2), never el.style.color. Constructor
// signature (app, character, conditionManager, onAdd) unchanged for Initiative (T9).
import * as fs from 'fs';
import * as path from 'path';
import { AddConditionsModal } from '@views/ConditionSelectModal';
import { ConditionManager } from '@utils/Conditions';
import { openManagedModal } from '@/framework/kit';
import { App, Component } from '../../mocks/obsidian';
import { styleGuardFindings } from '../kit/styleGuard';

function makeModal() {
	const onAdd = jest.fn();
	const character = { name: 'Frodo', isHero: true } as any;
	const modal = new AddConditionsModal(new App() as any, character, new ConditionManager(), onAdd);
	modal.open();
	const container = (modal as any).containerEl as HTMLElement;
	return { modal, onAdd, container };
}

function row(container: HTMLElement, name: string): HTMLElement {
	const toggle = container.querySelector(`button[aria-label="${name}"]`);
	const rowEl = toggle?.closest('.dse-cond-item');
	if (!rowEl) throw new Error(`no .dse-cond-item row for "${name}"`);
	return rowEl as HTMLElement;
}

function toggleOf(container: HTMLElement, name: string): HTMLButtonElement {
	return container.querySelector(`button[aria-label="${name}"]`) as HTMLButtonElement;
}

function cogOf(container: HTMLElement, name: string): HTMLButtonElement {
	return container.querySelector(`button[aria-label="Customize ${name}"]`) as HTMLButtonElement;
}

function footerBtn(container: HTMLElement, label: string): HTMLButtonElement {
	const el = container.querySelector<HTMLButtonElement>(
		`.dse-modal__footer button[aria-label="${label}"]`,
	);
	if (!el) throw new Error(`no footer button [aria-label="${label}"]`);
	return el;
}

/** The customize modal opened ON TOP of the select modal (the last .dse-modal). */
function topModal(): HTMLElement {
	const modals = document.querySelectorAll<HTMLElement>('.dse-modal');
	return modals[modals.length - 1];
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('Task 8 (D2 §3.x): AddConditionsModal — managedModal scaffold', () => {
	test('is a kit DseModal: .dse-modal, "Add Conditions" title via aria-labelledby, list in .dse-modal__body', () => {
		const { container } = makeModal();
		expect(container.classList.contains('dse-modal')).toBe(true);
		const titleEl = container.querySelector('.dse-modal__title') as HTMLElement;
		expect(titleEl.textContent).toBe('Add Conditions');
		expect(container.getAttribute('aria-labelledby')).toBe(titleEl.id);
		expect(container.querySelector('.dse-modal__body .dse-cond-list')).not.toBeNull();
	});

	test('the list is a real listbox: role="listbox" + aria-multiselectable (SC-4)', () => {
		const { container } = makeModal();
		const listEl = container.querySelector('.dse-cond-list') as HTMLElement;
		expect(listEl.getAttribute('role')).toBe('listbox');
		expect(listEl.getAttribute('aria-multiselectable')).toBe('true');
	});

	test('renders all 24 conditions as .dse-cond-item[role="option"][aria-selected] rows with a kit divider between real and pseudo', () => {
		const { container } = makeModal();
		const rows = container.querySelectorAll('.dse-cond-item');
		expect(rows).toHaveLength(24); // 8 conditions + 16 pseudo-conditions
		rows.forEach((r) => {
			expect(r.getAttribute('role')).toBe('option'); // SC-4: aria-selected needs a real role
			expect(r.getAttribute('aria-selected')).toBe('false');
		});

		// The divider is a kit .dse-hr separator sitting after the 8 real conditions.
		const list = container.querySelector('.dse-cond-list') as HTMLElement;
		const children = Array.from(list.children);
		expect(children[8].getAttribute('role')).toBe('separator');
		expect(children[8].classList.contains('dse-hr')).toBe(true);
	});

	test('every row is built from REAL kit <button>s: a labelled toggle (aria-pressed) + a labelled cog', () => {
		const { container } = makeModal();
		const toggle = toggleOf(container, 'Bleeding');
		expect(toggle.tagName).toBe('BUTTON');
		expect(toggle.getAttribute('aria-pressed')).toBe('false');
		expect(toggle.querySelector('.dse-btn__icon')?.getAttribute('data-icon')).toBe('droplet');
		expect(toggle.textContent).toContain('Bleeding');

		const cog = cogOf(container, 'Bleeding');
		expect(cog.tagName).toBe('BUTTON');
		expect(cog.classList.contains('dse-cond-item__cog')).toBe(true);
		expect(cog.querySelector('[data-icon="cog"]')).not.toBeNull();
	});

	test('footer: real Cancel / accent "Add Conditions" buttons (CB-8)', () => {
		const { container } = makeModal();
		expect(footerBtn(container, 'Cancel').tagName).toBe('BUTTON');
		const add = footerBtn(container, 'Add Conditions');
		expect(add.classList.contains('dse-btn--accent')).toBe(true);
		expect(add.disabled).toBe(false);
	});
});

describe('Task 8: selection behavior (legacy callback contract)', () => {
	test('clicking a row toggle selects it: aria-selected + aria-pressed flip together', () => {
		const { container } = makeModal();
		toggleOf(container, 'Bleeding').click();
		expect(row(container, 'Bleeding').getAttribute('aria-selected')).toBe('true');
		expect(toggleOf(container, 'Bleeding').getAttribute('aria-pressed')).toBe('true');

		toggleOf(container, 'Bleeding').click(); // deselect
		expect(row(container, 'Bleeding').getAttribute('aria-selected')).toBe('false');
		expect(toggleOf(container, 'Bleeding').getAttribute('aria-pressed')).toBe('false');
	});

	test('"Add Conditions" hands the selected conditions to onAdd and closes', () => {
		const { container, onAdd } = makeModal();
		toggleOf(container, 'Bleeding').click();
		toggleOf(container, 'Marked').click();
		footerBtn(container, 'Add Conditions').click();

		expect(onAdd).toHaveBeenCalledTimes(1);
		expect(onAdd).toHaveBeenCalledWith([{ key: 'bleeding' }, { key: 'marked' }]);
		expect(document.body.contains(container)).toBe(false);
	});

	test('deselected conditions are NOT added; Cancel adds nothing', () => {
		const { container, onAdd } = makeModal();
		toggleOf(container, 'Bleeding').click();
		toggleOf(container, 'Bleeding').click();
		footerBtn(container, 'Add Conditions').click();
		expect(onAdd).toHaveBeenCalledWith([]);

		const second = makeModal();
		toggleOf(second.container, 'Dazed').click();
		footerBtn(second.container, 'Cancel').click();
		expect(second.onAdd).not.toHaveBeenCalled();
		expect(document.body.contains(second.container)).toBe(false);
	});
});

describe('Task 8: the customize flow (cog → CustomizeConditionModal → row preview)', () => {
	test('the cog opens the customize modal AND auto-selects the row (legacy behavior)', () => {
		const { container } = makeModal();
		cogOf(container, 'Bleeding').click();

		const customize = topModal();
		expect(customize).not.toBe(container);
		expect(customize.querySelector('.dse-modal__title')?.textContent).toBe('Customize Condition');
		expect(row(container, 'Bleeding').getAttribute('aria-selected')).toBe('true');
	});

	test('saving a customization recolors the row icon via the VALIDATED property and flows into onAdd', () => {
		const { container, onAdd } = makeModal();
		cogOf(container, 'Bleeding').click();

		const customize = topModal();
		const colorInput = customize.querySelector('input[type="color"]') as HTMLInputElement;
		colorInput.value = '#ff0000';
		colorInput.dispatchEvent(new Event('change'));
		(customize.querySelector('.dse-modal__footer button[aria-label="Save"]') as HTMLButtonElement).click();

		const iconEl = toggleOf(container, 'Bleeding').querySelector('.dse-btn__icon') as HTMLElement;
		expect(iconEl.style.getPropertyValue('--dse-condition-color')).toBe('#ff0000');
		expect(iconEl.style.color).toBe(''); // NEVER el.style.color (SC-5)

		footerBtn(container, 'Add Conditions').click();
		expect(onAdd).toHaveBeenCalledWith([{ key: 'bleeding', color: '#ff0000', effect: 'static' }]);
	});

	test('closing the select modal closes an open child customize modal (owner-bound, F1 §4.5)', () => {
		const { modal, container } = makeModal();
		cogOf(container, 'Bleeding').click();
		const customize = topModal();
		expect(document.body.contains(customize)).toBe(true);

		modal.close();
		expect(document.body.contains(customize)).toBe(false);
	});
});

describe('Task 8: managed lifecycle + hygiene', () => {
	test('openManagedModal: owner unload auto-closes the modal (F1 §4.5)', () => {
		const owner = new Component();
		const onAdd = jest.fn();
		const modal = openManagedModal(
			owner as any,
			() =>
				new AddConditionsModal(new App() as any, { name: 'x' } as any, new ConditionManager(), onAdd),
		);
		const container = (modal as any).containerEl as HTMLElement;
		owner.unload();
		expect(document.body.contains(container)).toBe(false);
		expect(onAdd).not.toHaveBeenCalled();
	});

	test('source hygiene: imports the kit + the shared color helper, passes the style guard, no inline display toggling', () => {
		const src = fs.readFileSync(
			path.join(__dirname, '../../../src/views/ConditionSelectModal.ts'),
			'utf8',
		);
		expect(src).toMatch(/from '@\/framework\/kit'/);
		expect(src).toMatch(/applyConditionColor/);
		// comment-stripped like the guard itself (the header COMMENT names the ban)
		const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
		expect(code).not.toMatch(/\.style\.color/);
		expect(code).not.toMatch(/\.style\.display/); // the legacy hover-only cog reveal
		expect(styleGuardFindings(src)).toEqual([]);
	});

	test('CSS: the cog reveals on hover AND focus-within; row icons fall back to --dse-fg-muted; the legacy block is evicted', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		// hover + focus reveal (§3.x a11y)
		expect(sheet).toMatch(/\.dse-cond-item:hover\s+\.dse-cond-item__cog/);
		expect(sheet).toMatch(/\.dse-cond-item:focus-within\s+\.dse-cond-item__cog/);
		// validated color with the muted fallback
		expect(sheet).toMatch(
			/\.dse-cond-item__toggle\s+\.dse-btn__icon[^}]*color:\s*var\(--dse-condition-color,\s*var\(--dse-fg-muted\)\)/,
		);
		// selected row reads via aria-selected
		expect(sheet).toMatch(/\.dse-cond-item\[aria-selected='true'\]/);
		// the legacy condition-modal chrome is gone (.condition-icon — the TRACKER
		// class — and the shared .condition-effect-* block stay)
		expect(sheet).not.toMatch(/\.conditions-list/);
		expect(sheet).not.toMatch(/\.condition-item/);
		expect(sheet).not.toMatch(/\.condition-icon-preview/);
		expect(sheet).not.toMatch(/\.condition-label/);
		expect(sheet).not.toMatch(/\.condition-customize-icon/);
		expect(sheet).not.toMatch(/\.horizontal-divider/);
		expect(sheet).not.toMatch(/\.add-condition-modal/);
		expect(sheet).toMatch(/\.condition-icon\b/);
	});
});
