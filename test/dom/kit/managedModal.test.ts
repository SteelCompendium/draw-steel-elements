// Plan 08 Task 3 (D2 §2.6) — kit/managedModal: DseModal (extends Obsidian Modal) with
// setDseTitle → aria-labelledby, a scrollable .dse-modal__body, a footer of Task-2
// iconButtons (REAL <button>s with the REAL disabled property — CB-8 in modals), and
// initial focus to the first control; plus openManagedModal(owner, factory) which
// registers the F1 §4.5 view-unload-closes-modal contract via owner.register().
// Escape-close + focus trap stay Obsidian Modal defaults (not reimplemented here).
import { DseModal, openManagedModal } from '../../../src/framework/kit/managedModal';
import { App, Component } from '../../mocks/obsidian';

function fakeOwner(): any {
	return new Component();
}

function makeModal(): DseModal {
	return new DseModal(new App() as any);
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('Plan 08 Task 3: kit/managedModal (D2 §2.6)', () => {
	describe('structure', () => {
		test('the dialog root gains .dse-modal and the body is a .dse-modal__body inside contentEl', () => {
			const modal = makeModal();
			expect(modal.containerEl.hasClass('dse-modal')).toBe(true);
			expect(modal.body.hasClass('dse-modal__body')).toBe(true);
			expect(modal.contentEl.contains(modal.body)).toBe(true);
		});

		test('section() creates a .dse-modal__section panel inside the body', () => {
			const modal = makeModal();
			const section = modal.section();
			expect(section.hasClass('dse-modal__section')).toBe(true);
			expect(modal.body.contains(section)).toBe(true);
		});
	});

	describe('setDseTitle — aria-labelledby → the title (§4.3)', () => {
		test('sets the title text, ids it, and points aria-labelledby at it', () => {
			const modal = makeModal();
			modal.setDseTitle('Edit Stamina');

			expect(modal.titleEl.textContent).toBe('Edit Stamina');
			expect(modal.titleEl.hasClass('dse-modal__title')).toBe(true);
			expect(modal.titleEl.id).not.toBe('');
			expect(modal.containerEl.getAttribute('aria-labelledby')).toBe(modal.titleEl.id);
		});

		test('re-titling updates the text but keeps the SAME id (aria wiring stays valid)', () => {
			const modal = makeModal();
			modal.setDseTitle('First');
			const id = modal.titleEl.id;
			modal.setDseTitle('Second');
			expect(modal.titleEl.textContent).toBe('Second');
			expect(modal.titleEl.id).toBe(id);
			expect(modal.containerEl.getAttribute('aria-labelledby')).toBe(id);
		});

		test('two modals get DISTINCT title ids', () => {
			const a = makeModal();
			const b = makeModal();
			a.setDseTitle('A');
			b.setDseTitle('B');
			expect(a.titleEl.id).not.toBe(b.titleEl.id);
		});
	});

	describe('footer — Task-2 iconButtons: REAL <button>s with REAL disabled (CB-8)', () => {
		test('builds a .dse-modal__footer of real buttons after the body', () => {
			const modal = makeModal();
			const onCancel = jest.fn();
			const onApply = jest.fn();

			const handles = modal.footer([
				{ label: 'Cancel', text: 'Cancel', variant: 'ghost', onClick: onCancel },
				{ label: 'Apply', text: 'Apply', variant: 'accent', onClick: onApply },
			]);

			const footerEl = modal.contentEl.querySelector('.dse-modal__footer')!;
			expect(footerEl).not.toBeNull();
			// Footer follows the body in DOM order.
			expect(modal.body.compareDocumentPosition(footerEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

			const buttons = footerEl.querySelectorAll('button.dse-btn');
			expect(buttons).toHaveLength(2);
			expect(handles).toHaveLength(2);
			expect(handles[0].buttonEl).toBeInstanceOf(HTMLButtonElement);
			expect(handles[1].buttonEl).toBeInstanceOf(HTMLButtonElement);

			handles[1].buttonEl.click();
			expect(onApply).toHaveBeenCalledTimes(1);
			expect(onCancel).not.toHaveBeenCalled();
		});

		test('disabled is the REAL property: a disabled footer button never fires, setDisabled(false) re-arms it', () => {
			const modal = makeModal();
			const onApply = jest.fn();
			const [apply] = modal.footer([
				{ label: 'Apply', text: 'Apply', disabled: true, onClick: onApply },
			]);

			expect(apply.buttonEl.disabled).toBe(true);
			apply.buttonEl.click();
			expect(onApply).not.toHaveBeenCalled();

			apply.setDisabled(false);
			expect(apply.buttonEl.disabled).toBe(false);
			apply.buttonEl.click();
			expect(onApply).toHaveBeenCalledTimes(1);
		});

		test('calling footer() again REBUILDS the row in place (no duplicate footers)', () => {
			const modal = makeModal();
			modal.footer([{ label: 'One', text: 'One', onClick: () => {} }]);
			modal.footer([
				{ label: 'Two', text: 'Two', onClick: () => {} },
				{ label: 'Three', text: 'Three', onClick: () => {} },
			]);

			const footers = modal.contentEl.querySelectorAll('.dse-modal__footer');
			expect(footers).toHaveLength(1);
			expect(footers[0].querySelectorAll('button')).toHaveLength(2);
		});
	});

	describe('open — initial focus to the first control (§2.6)', () => {
		test('open() focuses the first control in the content (body before footer)', () => {
			const modal = makeModal();
			const input = modal.body.createEl('input', { type: 'text' });
			modal.footer([{ label: 'Apply', text: 'Apply', onClick: () => {} }]);

			modal.open();

			expect(document.activeElement).toBe(input);
			modal.close();
		});

		test('with no body controls, the first footer button takes focus', () => {
			const modal = makeModal();
			modal.body.createEl('p', { text: 'Are you sure?' });
			const [cancel] = modal.footer([{ label: 'Cancel', text: 'Cancel', onClick: () => {} }]);

			modal.open();

			expect(document.activeElement).toBe(cancel.buttonEl);
			modal.close();
		});

		test('disabled controls are skipped for initial focus', () => {
			const modal = makeModal();
			const [apply, cancel] = modal.footer([
				{ label: 'Apply', text: 'Apply', disabled: true, onClick: () => {} },
				{ label: 'Cancel', text: 'Cancel', onClick: () => {} },
			]);
			void apply;

			modal.open();

			expect(document.activeElement).toBe(cancel.buttonEl);
			modal.close();
		});
	});

	describe('openManagedModal — the F1 §4.5 view-unload-closes-modal contract', () => {
		test('opens the modal and returns it', () => {
			const owner = fakeOwner();
			const modal = openManagedModal(owner, () => makeModal());
			expect(modal).toBeInstanceOf(DseModal);
			expect(document.body.contains(modal.containerEl)).toBe(true);
			owner.unload();
		});

		test('owner.unload() closes the modal (onClose fires, DOM removed)', () => {
			const owner = fakeOwner();
			const modal = openManagedModal(owner, () => makeModal());
			const onClose = jest.spyOn(modal, 'onClose');

			owner.unload();

			expect(document.body.contains(modal.containerEl)).toBe(false);
			expect(onClose).toHaveBeenCalledTimes(1);
		});

		test('close is idempotent: user-closed first, the unload teardown does NOT re-close', () => {
			const owner = fakeOwner();
			const modal = openManagedModal(owner, () => makeModal());
			const onClose = jest.spyOn(modal, 'onClose');

			modal.close(); // the user dismissed it (Escape / a footer button)
			expect(onClose).toHaveBeenCalledTimes(1);

			owner.unload(); // teardown fires modal.close() again
			expect(onClose).toHaveBeenCalledTimes(1); // STILL once
		});

		test('closing detaches footer button listeners (modal-scoped lifecycle)', () => {
			const owner = fakeOwner();
			const onApply = jest.fn();
			const modal = openManagedModal(owner, () => {
				const m = makeModal();
				m.footer([{ label: 'Apply', text: 'Apply', onClick: onApply }]);
				return m;
			});
			const applyEl = modal.contentEl.querySelector<HTMLButtonElement>('button.dse-btn')!;

			modal.close();
			applyEl.click();

			expect(onApply).not.toHaveBeenCalled();
			owner.unload();
		});
	});
});
