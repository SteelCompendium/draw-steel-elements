// F2 Task 10 (OD-6) — LegacyCompendiumModal on the kit managedModal: a DseModal
// confirm (title via aria-labelledby, message body, "Keep everything" / "Move old
// compendium to trash" footer of REAL kit <button>s — CB-8), modeled directly on
// ResetEncounterModal's test shape.
import * as fs from 'fs';
import * as path from 'path';
import { LegacyCompendiumModal } from '@views/LegacyCompendiumModal';
import { App } from '../../mocks/obsidian';
import { styleGuardFindings } from '../kit/styleGuard';

function makeModal(onChoice = jest.fn()) {
	const modal = new LegacyCompendiumModal(new App() as any, 'DS Compendium', onChoice);
	modal.open();
	const container = (modal as any).containerEl as HTMLElement;
	return { modal, onChoice, container };
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

describe('LegacyCompendiumModal (OD-6)', () => {
	test('is a kit DseModal: .dse-modal scaffold, title wired via aria-labelledby, root path + "never" in the message', () => {
		const { container } = makeModal();
		expect(container.classList.contains('dse-modal')).toBe(true);

		const titleEl = container.querySelector('.dse-modal__title') as HTMLElement;
		expect(titleEl.textContent).toBe('Existing compendium folder found');
		expect(titleEl.id).not.toBe('');
		expect(container.getAttribute('aria-labelledby')).toBe(titleEl.id);

		const body = container.querySelector('.dse-modal__body') as HTMLElement;
		expect(body.textContent).toContain('DS Compendium');
		expect(body.textContent).toContain('never');
	});

	test('footer holds REAL <button>s: "Keep everything" and "Move old compendium to trash" (danger variant)', () => {
		const { container } = makeModal();
		const keep = footerBtn(container, 'Keep everything');
		const trash = footerBtn(container, 'Move old compendium to trash');
		expect(keep.tagName).toBe('BUTTON');
		expect(trash.tagName).toBe('BUTTON');
		expect(trash.classList.contains('dse-btn--danger')).toBe(true);
	});

	test('initial focus lands on "Keep everything" — the safe default', () => {
		const { container } = makeModal();
		expect(document.activeElement).toBe(footerBtn(container, 'Keep everything'));
	});

	test('"Keep everything" calls onChoice(false) and closes', () => {
		const { container, onChoice } = makeModal();
		footerBtn(container, 'Keep everything').click();
		expect(onChoice).toHaveBeenCalledWith(false);
		expect(document.body.contains(container)).toBe(false);
	});

	test('"Move old compendium to trash" calls onChoice(true) and closes', () => {
		const { container, onChoice } = makeModal();
		footerBtn(container, 'Move old compendium to trash').click();
		expect(onChoice).toHaveBeenCalledWith(true);
		expect(document.body.contains(container)).toBe(false);
	});

	test('source hygiene: imports the kit and passes the style guard (zero literals, zero el.style.color)', () => {
		const src = fs.readFileSync(
			path.join(__dirname, '../../../src/views/LegacyCompendiumModal.ts'),
			'utf8',
		);
		expect(src).toMatch(/from '@\/framework\/kit'/);
		expect(styleGuardFindings(src)).toEqual([]);
	});
});
