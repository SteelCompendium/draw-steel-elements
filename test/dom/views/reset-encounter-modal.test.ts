// Plan 09 Task 8 (D2 §3.x) — ResetEncounterModal on the kit managedModal: a DseModal
// confirm (title via aria-labelledby, message body, Cancel / "Yes, Reset" footer of
// REAL kit <button>s — CB-8) that auto-closes with its owner via openManagedModal.
// The constructor signature (app, onConfirm) is unchanged — Initiative (T9) keeps
// opening it the same way.
import * as fs from 'fs';
import * as path from 'path';
import { ResetEncounterModal } from '@views/ResetEncounterModal';
import { openManagedModal } from '@/framework/kit';
import { App, Component } from '../../mocks/obsidian';
import { styleGuardFindings } from '../kit/styleGuard';

function makeModal() {
	const onConfirm = jest.fn();
	const modal = new ResetEncounterModal(new App() as any, onConfirm);
	modal.open();
	const container = (modal as any).containerEl as HTMLElement;
	return { modal, onConfirm, container };
}

function footerBtn(container: HTMLElement, label: string): HTMLButtonElement {
	const el = container.querySelector<HTMLButtonElement>(
		`.dse-modal__footer button[aria-label="${label}"]`,
	);
	if (!el) throw new Error(`no footer button [aria-label="${label}"]`);
	return el;
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('Task 8 (D2 §3.x): ResetEncounterModal — managedModal confirm', () => {
	test('is a kit DseModal: .dse-modal scaffold, title wired via aria-labelledby, message in .dse-modal__body', () => {
		const { container } = makeModal();
		expect(container.classList.contains('dse-modal')).toBe(true);

		const titleEl = container.querySelector('.dse-modal__title') as HTMLElement;
		expect(titleEl.textContent).toBe('Confirm Encounter Reset');
		expect(titleEl.id).not.toBe('');
		expect(container.getAttribute('aria-labelledby')).toBe(titleEl.id);

		const body = container.querySelector('.dse-modal__body') as HTMLElement;
		expect(body.textContent).toContain('Are you sure you want to reset the encounter data?');
		expect(body.textContent).toContain('stamina, conditions, turn tracker, and villain power');
	});

	test('footer holds REAL <button>s: Cancel and a danger-variant "Yes, Reset" (CB-8)', () => {
		const { container } = makeModal();
		const cancel = footerBtn(container, 'Cancel');
		const reset = footerBtn(container, 'Yes, Reset');
		expect(cancel.tagName).toBe('BUTTON');
		expect(reset.tagName).toBe('BUTTON');
		expect(reset.classList.contains('dse-btn--danger')).toBe(true);
		expect(cancel.disabled).toBe(false);
	});

	test('initial focus lands on Cancel (the first control — safe default for a destructive confirm)', () => {
		const { container } = makeModal();
		expect(document.activeElement).toBe(footerBtn(container, 'Cancel'));
	});

	test('"Yes, Reset" fires onConfirm exactly once and closes the modal', () => {
		const { container, onConfirm } = makeModal();
		footerBtn(container, 'Yes, Reset').click();
		expect(onConfirm).toHaveBeenCalledTimes(1);
		expect(document.body.contains(container)).toBe(false);
	});

	test('Cancel closes WITHOUT confirming', () => {
		const { container, onConfirm } = makeModal();
		footerBtn(container, 'Cancel').click();
		expect(onConfirm).not.toHaveBeenCalled();
		expect(document.body.contains(container)).toBe(false);
	});

	test('openManagedModal: owner unload auto-closes the modal without confirming (F1 §4.5)', () => {
		const owner = new Component();
		const onConfirm = jest.fn();
		const modal = openManagedModal(
			owner as any,
			() => new ResetEncounterModal(new App() as any, onConfirm),
		);
		const container = (modal as any).containerEl as HTMLElement;
		expect(document.body.contains(container)).toBe(true);

		owner.unload();
		expect(document.body.contains(container)).toBe(false);
		expect(onConfirm).not.toHaveBeenCalled();
	});

	test('source hygiene: imports the kit and passes the style guard (zero literals, zero el.style.color)', () => {
		const src = fs.readFileSync(
			path.join(__dirname, '../../../src/views/ResetEncounterModal.ts'),
			'utf8',
		);
		expect(src).toMatch(/from '@\/framework\/kit'/);
		expect(styleGuardFindings(src)).toEqual([]);
	});
});
