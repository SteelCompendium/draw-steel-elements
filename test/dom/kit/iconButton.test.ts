// Plan 08 Task 2 (D2 §2.1) — kit/iconButton + buttonRow: the accessible control
// primitive. A REAL <button> (semantic HTML, §4.1) with a REQUIRED aria-label (§4.2),
// real `disabled` property (CB-8 — a "disabled" class alone let Enter through),
// aria-pressed for toggles (§4.3), owner-bound listeners (F1 §4.5), and a Handle for
// in-place updates (no container.empty() rebuilds, CB-7).
//
// Also hosts the kit-wide hygiene guard (reconciled by Plan 09 Task 0): the four
// Task-2 kit files must contain no inline COLOR and no color literal (D2 §5 exit
// rule; setProperty('--dse-*') geometry is allowed — see ./styleGuard.ts), and the
// .dse-btn CSS must derive its ≥44px hit area from var(--dse-touch-min) (§4.6).
import * as fs from 'fs';
import * as path from 'path';
import { iconButton, buttonRow } from '../../../src/framework/kit/iconButton';
import { styleGuardFindings } from './styleGuard';
import { Component } from '../../mocks/obsidian';
import * as obsidian from '../../mocks/obsidian';

afterEach(() => {
	jest.restoreAllMocks();
});

// Same convention as collapsible.test.ts / seams.test.ts: the mock Component's
// self-referencing generics don't structurally satisfy the real `obsidian` Component
// type under tsc; runtime shape (registerDomEvent/register/unload) is what matters.
function fakeOwner(): any {
	return new Component();
}

describe('Plan 08 Task 2: kit/iconButton (D2 §2.1)', () => {
	test('renders a real <button type="button"> with .dse-btn and the required aria-label', () => {
		const parent = document.createElement('div');
		const { buttonEl } = iconButton(
			parent,
			{ icon: 'plus', label: 'Add condition', onClick: () => {} },
			fakeOwner(),
		);

		expect(buttonEl.tagName).toBe('BUTTON');
		expect(buttonEl.parentElement).toBe(parent);
		expect(buttonEl.hasClass('dse-btn')).toBe(true);
		expect(buttonEl.getAttribute('type')).toBe('button'); // never an implicit submit
		expect(buttonEl.getAttribute('aria-label')).toBe('Add condition');
	});

	test('renders the icon via setIcon into .dse-btn__icon', () => {
		const parent = document.createElement('div');
		iconButton(parent, { icon: 'plus', label: 'Add', onClick: () => {} }, fakeOwner());

		const iconEl = parent.querySelector('.dse-btn__icon');
		expect(iconEl).not.toBeNull();
		// The obsidian mock's setIcon records the lucide name as data-icon.
		expect(iconEl!.getAttribute('data-icon')).toBe('plus');
	});

	test('renders visible text into .dse-btn__text; icon-only buttons have no text span', () => {
		const parent = document.createElement('div');
		iconButton(parent, { label: 'Apply changes', text: 'Apply', onClick: () => {} }, fakeOwner());
		const textEl = parent.querySelector('.dse-btn__text');
		expect(textEl).not.toBeNull();
		expect(textEl!.textContent).toBe('Apply');
		expect(parent.querySelector('.dse-btn__icon')).toBeNull(); // no icon requested

		const iconOnly = document.createElement('div');
		iconButton(iconOnly, { icon: 'x', label: 'Close', onClick: () => {} }, fakeOwner());
		expect(iconOnly.querySelector('.dse-btn__text')).toBeNull();
	});

	describe('variants (§2.1 classes)', () => {
		test.each(['accent', 'ghost', 'danger'] as const)('variant %s adds .dse-btn--%s', (variant) => {
			const parent = document.createElement('div');
			const { buttonEl } = iconButton(parent, { label: 'x', variant, onClick: () => {} }, fakeOwner());
			expect(buttonEl.hasClass(`dse-btn--${variant}`)).toBe(true);
		});

		test('default variant adds no modifier class', () => {
			const parent = document.createElement('div');
			const { buttonEl } = iconButton(parent, { label: 'x', onClick: () => {} }, fakeOwner());
			expect(buttonEl.className).toBe('dse-btn');
			const explicit = iconButton(parent, { label: 'y', variant: 'default', onClick: () => {} }, fakeOwner());
			expect(explicit.buttonEl.className).toBe('dse-btn');
		});
	});

	test('click invokes onClick with the mouse event', () => {
		const parent = document.createElement('div');
		const onClick = jest.fn();
		const { buttonEl } = iconButton(parent, { label: 'x', onClick }, fakeOwner());

		buttonEl.click();

		expect(onClick).toHaveBeenCalledTimes(1);
		expect(onClick.mock.calls[0][0]).toBeInstanceOf(MouseEvent);
	});

	describe('disabled is the REAL property (CB-8)', () => {
		test('disabled: true sets the real disabled property, not a class', () => {
			const parent = document.createElement('div');
			const { buttonEl } = iconButton(
				parent,
				{ label: 'x', disabled: true, onClick: () => {} },
				fakeOwner(),
			);
			expect(buttonEl.disabled).toBe(true); // the real HTMLButtonElement property
			expect(buttonEl.hasClass('disabled')).toBe(false); // NOT the CB-8 class mechanism
		});

		test('disabled blocks onClick for click(), synthetic click dispatch, AND Enter', () => {
			const parent = document.createElement('div');
			const onClick = jest.fn();
			const { buttonEl } = iconButton(parent, { label: 'x', disabled: true, onClick }, fakeOwner());

			buttonEl.click(); // native activation — suppressed by the real property
			// Synthetic dispatches bypass the native disabled suppression; the kit's own
			// guard must still swallow them (this is what a bare class never did).
			buttonEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
			buttonEl.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
			);
			buttonEl.dispatchEvent(
				new KeyboardEvent('keyup', { key: 'Enter', bubbles: true, cancelable: true }),
			);

			expect(onClick).not.toHaveBeenCalled();
		});

		test('setDisabled toggles the real property in place', () => {
			const parent = document.createElement('div');
			const onClick = jest.fn();
			const handle = iconButton(parent, { label: 'x', disabled: true, onClick }, fakeOwner());

			handle.setDisabled(false);
			expect(handle.buttonEl.disabled).toBe(false);
			handle.buttonEl.click();
			expect(onClick).toHaveBeenCalledTimes(1);

			handle.setDisabled(true);
			handle.buttonEl.click();
			expect(onClick).toHaveBeenCalledTimes(1); // still 1 — re-disabled
		});
	});

	describe('aria-pressed toggles (§4.3)', () => {
		test('pressed: true renders aria-pressed="true" + [data-pressed] for CSS', () => {
			const parent = document.createElement('div');
			const { buttonEl } = iconButton(
				parent,
				{ label: 'x', pressed: true, onClick: () => {} },
				fakeOwner(),
			);
			expect(buttonEl.getAttribute('aria-pressed')).toBe('true');
			expect(buttonEl.hasAttribute('data-pressed')).toBe(true);
		});

		test('setPressed(false) flips aria-pressed to "false" and drops [data-pressed]', () => {
			const parent = document.createElement('div');
			const handle = iconButton(parent, { label: 'x', pressed: true, onClick: () => {} }, fakeOwner());
			handle.setPressed(false);
			expect(handle.buttonEl.getAttribute('aria-pressed')).toBe('false');
			expect(handle.buttonEl.hasAttribute('data-pressed')).toBe(false);
		});

		test('omitting pressed renders NO aria-pressed (a plain button, not a toggle)', () => {
			const parent = document.createElement('div');
			const { buttonEl } = iconButton(parent, { label: 'x', onClick: () => {} }, fakeOwner());
			expect(buttonEl.hasAttribute('aria-pressed')).toBe(false);
		});
	});

	test('tooltip option routes through the kit tooltip() → Obsidian setTooltip, WITHOUT clobbering the required aria-label', () => {
		const parent = document.createElement('div');
		const spy = jest.spyOn(obsidian, 'setTooltip');
		const { buttonEl } = iconButton(
			parent,
			{ icon: 'copy', label: 'Copy link', tooltip: 'Copy the SCC link', onClick: () => {} },
			fakeOwner(),
		);
		// Native setTooltip really was called with the hover text...
		expect(spy).toHaveBeenCalledWith(buttonEl, 'Copy the SCC link', undefined);
		// ...but real Obsidian's setTooltip ALSO stamps aria-label as a side effect
		// (the obsidian mock mirrors that, FOLLOWUPS #27-fix-round finding 1), so
		// iconButton asserts the REQUIRED accessible name (§4.2) — which here
		// deliberately differs from the tooltip text — LAST, so it always wins.
		expect(buttonEl.getAttribute('aria-label')).toBe('Copy link');
	});

	test('setLabel updates the accessible name in place', () => {
		const parent = document.createElement('div');
		const handle = iconButton(parent, { label: 'Play', onClick: () => {} }, fakeOwner());
		handle.setLabel('Pause');
		expect(handle.buttonEl.getAttribute('aria-label')).toBe('Pause');
	});

	test('lifecycle: owner.unload() detaches the click listener (F1 §4.5)', () => {
		const parent = document.createElement('div');
		const onClick = jest.fn();
		const owner = fakeOwner();
		const { buttonEl } = iconButton(parent, { label: 'x', onClick }, owner);

		owner.unload();
		buttonEl.click();

		expect(onClick).not.toHaveBeenCalled();
	});
});

describe('Plan 08 Task 2: kit/buttonRow (D2 §2.1)', () => {
	test('renders .dse-btn-row with the buttons in order and returns their handles', () => {
		const parent = document.createElement('div');
		const first = jest.fn();
		const second = jest.fn();
		const { rowEl, buttons } = buttonRow(
			parent,
			[
				{ label: 'Cancel', text: 'Cancel', variant: 'ghost', onClick: first },
				{ label: 'Apply', text: 'Apply', variant: 'accent', onClick: second },
			],
			fakeOwner(),
		);

		expect(rowEl.hasClass('dse-btn-row')).toBe(true);
		expect(rowEl.parentElement).toBe(parent);
		const rendered = rowEl.querySelectorAll('button.dse-btn');
		expect(rendered).toHaveLength(2);
		expect(buttons).toHaveLength(2);
		expect(buttons[0].buttonEl).toBe(rendered[0]);
		expect(buttons[1].buttonEl).toBe(rendered[1]);

		buttons[1].buttonEl.click();
		expect(second).toHaveBeenCalledTimes(1);
		expect(first).not.toHaveBeenCalled();
	});
});

describe('Plan 08 Task 2: kit hygiene guard (D2 §5 — no inline color, tokens only)', () => {
	const kitDir = path.join(__dirname, '../../../src/framework/kit');
	const taskFiles = ['iconButton.ts', 'stepper.ts', 'tooltip.ts', 'divider.ts'];

	test.each(taskFiles)('%s: inline color banned; --dse-* geometry setProperty allowed', (file) => {
		const src = fs.readFileSync(path.join(kitDir, file), 'utf8');
		// The reconciled SC-5 rule (Plan 09 Task 0): inline COLOR + color literals are
		// banned, but the D2 Global Constraint's dynamic-geometry escape hatch —
		// el.style.setProperty('--dse-*', …) — is allowed. See ./styleGuard.ts
		// (proof tests live in cardHead.test.ts).
		expect(styleGuardFindings(src)).toEqual([]);
	});

	test('.dse-btn CSS derives its ≥44px hit area from var(--dse-touch-min) (§4.6)', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		const block = sheet.match(/\.dse-btn\s*\{([^}]*)\}/);
		expect(block).not.toBeNull();
		expect(block![1]).toMatch(/min-width:\s*var\(--dse-touch-min\)/);
		expect(block![1]).toMatch(/min-height:\s*var\(--dse-touch-min\)/);
	});
});
