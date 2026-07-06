// Plan 09 Task 3 (D2 §3.5b / OD-6) — StaminaEditModal on the unified managedModal
// template. The behavior nets (T-5: clamp math, hero floor, temp-absorbs-damage) are
// preserved verbatim from the legacy modal — the edit math and the model mutation at
// Apply are byte-compat-load-bearing. New under D2: the modal is a kit DseModal
// (.dse-modal scaffold), every control is a kit iconButton/stepper (REAL <button>s with
// the REAL `disabled` property — CB-8), and the preview bar carries zero inline
// colors/widths (SC-5): fill/delta geometry via --dse-fill/--dse-delta-fill custom
// properties, colors via [data-state]/[data-kind] class rules.
import * as fs from 'fs';
import * as path from 'path';
import { StaminaBar } from '@model/StaminaBar';
import { StaminaEditModal } from '@views/StaminaEditModal';
import { App } from '../../mocks/obsidian';
import { styleGuardFindings } from '../kit/styleGuard';

function makeModal(max: number, current: number, temp: number, isHero = true) {
	const app = new App();
	const bar = new StaminaBar(false, false, max, current, temp, 1);
	const updateCallback = jest.fn();
	const modal = new StaminaEditModal(app as any, bar, isHero, 'Frodo', updateCallback);
	modal.open();
	const content = (modal as any).contentEl as HTMLElement;
	return { modal: modal as any, bar, content, updateCallback };
}

/** The kit iconButton carrying the given accessible name. */
function btn(content: HTMLElement, label: string): HTMLButtonElement {
	const el = content.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
	if (!el) throw new Error(`no button [aria-label="${label}"]`);
	return el;
}

/** The footer's primary (accent) action button — dynamic "Gain N Stamina…" text. */
function actionBtn(content: HTMLElement): HTMLButtonElement {
	const el = content.querySelector<HTMLButtonElement>('.dse-modal__footer .dse-btn--accent');
	if (!el) throw new Error('no footer accent action button');
	return el;
}

function clickDamage(content: HTMLElement, amount: number): void {
	(content.querySelector('.dse-sedit__apply-input') as HTMLInputElement).value = String(amount);
	btn(content, 'Damage').click();
}

function clickHealing(content: HTMLElement, amount: number): void {
	(content.querySelector('.dse-sedit__apply-input') as HTMLInputElement).value = String(amount);
	btn(content, 'Healing').click();
}

function apply(content: HTMLElement): void {
	actionBtn(content).click();
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('T-5: StaminaEditModal — pure math helpers', () => {
	test('clampStamina clamps to [negativeLimit, max]', () => {
		const { modal } = makeModal(20, 10, 0);
		expect(modal.clampStamina(25, -10, 20)).toBe(20);
		expect(modal.clampStamina(-15, -10, 20)).toBe(-10);
		expect(modal.clampStamina(7, -10, 20)).toBe(7);
	});

	test('amountToDeath / amountToMaxStamina account for pending change', () => {
		const { modal } = makeModal(20, 10, 0);
		expect(modal.amountToDeath(10, -10)).toBe(20);
		expect(modal.amountToMaxStamina(10, 20)).toBe(10);
		modal.pendingStaminaChange = -3;
		expect(modal.amountToDeath(10, -10)).toBe(17);
		expect(modal.amountToMaxStamina(10, 20)).toBe(13);
	});
});

describe('T-5: StaminaEditModal — hero negative floor ceil(-0.5 × max)', () => {
	test('hero with max 15: Kill floors at -7 (ceil(-7.5))', () => {
		const { content, bar } = makeModal(15, 10, 0, true);
		btn(content, 'Kill').click();
		apply(content);
		expect(bar.current_stamina).toBe(-7);
	});

	test('non-hero: Kill floors at 0', () => {
		const { content, bar } = makeModal(15, 10, 0, false);
		btn(content, 'Kill').click();
		apply(content);
		expect(bar.current_stamina).toBe(0);
	});

	test('damage cannot push a hero past the death floor', () => {
		const { content, bar } = makeModal(20, -8, 0, true); // floor is -10
		clickDamage(content, 100);
		apply(content);
		expect(bar.current_stamina).toBe(-10);
	});
});

describe('T-5: StaminaEditModal — temp stamina absorbs damage first', () => {
	test('8 damage against 5 temp: temp → 0, stamina 10 → 7', () => {
		const { modal, content, bar, updateCallback } = makeModal(20, 10, 5);
		clickDamage(content, 8);
		expect(modal.pendingTempStaminaChange).toBe(-5);
		expect(modal.pendingStaminaChange).toBe(-3);
		apply(content);
		expect(bar.current_stamina).toBe(7);
		expect(bar.temp_stamina).toBe(0);
		expect(updateCallback).toHaveBeenCalledTimes(1);
	});

	test('3 damage against 5 temp: only temp is consumed', () => {
		const { modal, content, bar } = makeModal(20, 10, 5);
		clickDamage(content, 3);
		expect(modal.pendingTempStaminaChange).toBe(-3);
		expect(modal.pendingStaminaChange).toBe(0);
		apply(content);
		expect(bar.current_stamina).toBe(10);
		expect(bar.temp_stamina).toBe(2);
	});

	test('healing clamps at max stamina', () => {
		const { content, bar } = makeModal(20, 18, 0);
		clickHealing(content, 10);
		apply(content);
		expect(bar.current_stamina).toBe(20);
	});

	test('Full Heal restores max and zeroes temp', () => {
		const { content, bar } = makeModal(20, 3, 4);
		btn(content, 'Full Heal').click();
		apply(content);
		expect(bar.current_stamina).toBe(20);
		expect(bar.temp_stamina).toBe(0);
	});

	test('Spend Recovery heals floor(max/3)', () => {
		const { content, bar } = makeModal(21, 10, 0);
		btn(content, 'Spend Recovery').click();
		apply(content);
		expect(bar.current_stamina).toBe(17); // 10 + floor(21/3)
	});
});

describe('D2 §3.5b: the managedModal template (kit scaffold, CB-8, SC-5)', () => {
	test('modal is a kit DseModal: .dse-modal on the dialog, the "<name> Stamina" title wired via aria-labelledby, sections in .dse-modal__body', () => {
		const { modal } = makeModal(20, 10, 0);
		const containerEl = (modal as any).containerEl as HTMLElement;
		expect(containerEl.classList.contains('dse-modal')).toBe(true);
		const titleEl = (modal as any).titleEl as HTMLElement;
		expect(titleEl.textContent).toBe('Frodo Stamina');
		expect(containerEl.getAttribute('aria-labelledby')).toBe(titleEl.id);
		const body = containerEl.querySelector('.dse-modal__body') as HTMLElement;
		expect(body.querySelector('.dse-sedit__apply')).not.toBeNull();
		expect(body.querySelector('.dse-sedit__quick')).not.toBeNull();
		expect(body.querySelector('.dse-sedit__temp')).not.toBeNull();
		// The minion-list section is the POOL modal's optional extra — absent here.
		expect(body.querySelector('.dse-sedit__minions')).toBeNull();
	});

	test('every control is a real <button> (kit iconButton/stepper) — no click-handling divs', () => {
		const { content } = makeModal(20, 10, 0);
		for (const label of ['Damage', 'Healing', 'Kill', 'Full Heal', 'Spend Recovery', 'Reset']) {
			expect(btn(content, label).tagName).toBe('BUTTON');
		}
		// The two steppers (Stamina + Temporary Stamina) are kit steppers with editable inputs.
		const steppers = content.querySelectorAll('.dse-stepper');
		expect(steppers).toHaveLength(2);
		expect(steppers[0].querySelectorAll('button.dse-stepper__btn')).toHaveLength(2);
		expect(content.querySelectorAll('input.dse-stepper__input')).toHaveLength(2);
	});

	test('CB-8: the apply button uses the REAL disabled property — disabled at "No Stamina Change", enabled on a pending change, re-disabled by Reset', () => {
		const { content } = makeModal(20, 10, 0);
		const action = actionBtn(content);
		expect(action.disabled).toBe(true);
		expect(action.textContent).toContain('No Stamina Change');

		clickDamage(content, 3);
		expect(action.disabled).toBe(false);
		expect(action.textContent).toContain('Lose 3 Stamina');

		btn(content, 'Reset').click();
		expect(action.disabled).toBe(true);
		expect(action.textContent).toContain('No Stamina Change');
	});

	test('a disabled apply button swallows synthetic clicks (no model mutation, no callback)', () => {
		const { content, bar, updateCallback } = makeModal(20, 10, 0);
		actionBtn(content).click(); // no pending change -> disabled
		expect(bar.current_stamina).toBe(10);
		expect(updateCallback).not.toHaveBeenCalled();
	});

	test('the stamina stepper edits pending stamina: ± steps and a typed commit (Enter) both update the action label', () => {
		const { modal, content } = makeModal(20, 10, 0);
		const stamina = content.querySelectorAll('.dse-stepper')[0] as HTMLElement;
		(stamina.querySelector('button[aria-label="Increase Stamina"]') as HTMLButtonElement).click();
		expect(modal.pendingStaminaChange).toBe(1);
		expect(actionBtn(content).textContent).toContain('Gain 1 Stamina');

		const input = stamina.querySelector('.dse-stepper__input') as HTMLInputElement;
		input.value = '17';
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		expect(modal.pendingStaminaChange).toBe(7);
		expect(actionBtn(content).textContent).toContain('Gain 7 Stamina');
	});

	test('typed decimals integer-coerce (legacy parseInt semantics): Apply persists INTEGERS, never floats', () => {
		const { modal, content, bar } = makeModal(20, 10, 0);
		const [staminaEl, tempEl] = Array.from(content.querySelectorAll<HTMLElement>('.dse-stepper'));

		const staminaInput = staminaEl.querySelector('.dse-stepper__input') as HTMLInputElement;
		staminaInput.value = '17.5'; // type="number" step="1" still accepts decimals
		staminaInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		expect(modal.pendingStaminaChange).toBe(7); // trunc(17.5) = 17 → +7

		const tempInput = tempEl.querySelector('.dse-stepper__input') as HTMLInputElement;
		tempInput.value = '2.5';
		tempInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		expect(modal.pendingTempStaminaChange).toBe(2);

		apply(content);
		expect(bar.current_stamina).toBe(17); // an INTEGER — legacy persisted parseInt('17.5') = 17
		expect(bar.temp_stamina).toBe(2);
		expect(Number.isInteger(bar.current_stamina)).toBe(true);
		expect(Number.isInteger(bar.temp_stamina)).toBe(true);
	});

	test('the temp stepper is floored at 0 (real disabled minus at the floor — legacy was a silent no-op)', () => {
		const { modal, content } = makeModal(20, 10, 0);
		const minus = btn(content, 'Decrease Temporary Stamina');
		expect(minus.disabled).toBe(true); // temp 0: cannot go negative
		btn(content, 'Increase Temporary Stamina').click();
		expect(modal.pendingTempStaminaChange).toBe(1);
		expect(minus.disabled).toBe(false);
		expect(actionBtn(content).textContent).toContain('Gain 1 Temp Stamina');
	});

	test('SC-5: the preview bar has NO inline colors/widths — geometry via --dse-fill/--dse-delta-fill, damage/heal color via [data-kind]', () => {
		const { content } = makeModal(20, 10, 0, true);
		const barEl = content.querySelector('.dse-stamina--modal') as HTMLElement;
		expect(barEl).not.toBeNull();
		const fill = barEl.querySelector('.dse-stamina__fill') as HTMLElement;
		const delta = barEl.querySelector('.dse-stamina__delta') as HTMLElement;
		// hero max 20: floor -10 -> barLength 30, adjusted 10+10=20 -> 66.67%
		expect(parseFloat(fill.style.getPropertyValue('--dse-fill'))).toBeCloseTo((20 / 30) * 100, 2);
		expect(fill.getAttribute('data-state')).toBe('healthy');
		expect(delta.getAttribute('data-kind')).toBe('none');

		clickDamage(content, 6);
		expect(delta.getAttribute('data-kind')).toBe('damage');
		expect(parseFloat(delta.style.getPropertyValue('--dse-delta-fill'))).toBeCloseTo(20, 2); // 6/30
		expect(parseFloat(fill.style.getPropertyValue('--dse-fill'))).toBeCloseTo((14 / 30) * 100, 2);

		clickHealing(content, 12); // net pending +6
		expect(delta.getAttribute('data-kind')).toBe('heal');

		// The only .style writes anywhere in the modal are --dse-* custom properties.
		for (const el of Array.from(content.querySelectorAll<HTMLElement>('[style]'))) {
			for (const decl of el.getAttribute('style')!.split(';')) {
				if (decl.trim() === '') continue;
				expect(decl.trim()).toMatch(/^--dse-/);
			}
		}
	});

	test('the hero preview bar renders the "Dying" threshold zone; a non-hero bar does not', () => {
		const hero = makeModal(20, 10, 0, true);
		expect(hero.content.querySelector('.dse-stamina__threshold--dying')).not.toBeNull();
		expect(hero.content.querySelector('.dse-stamina__threshold--dying')!.textContent).toBe('Dying');
		document.body.innerHTML = '';
		const creature = makeModal(20, 10, 0, false);
		expect(creature.content.querySelector('.dse-stamina__threshold--dying')).toBeNull();
	});

	test('source hygiene: both stamina modals import the kit from @/framework/kit and pass the style guard (zero color literals, zero el.style.color)', () => {
		for (const file of ['StaminaEditModal.ts', 'MinionStaminaPoolModal.ts']) {
			const src = fs.readFileSync(path.join(__dirname, '../../../src/views', file), 'utf8');
			expect(src).toMatch(/from '@\/framework\/kit'/);
			expect(styleGuardFindings(src)).toEqual([]);
		}
	});

	test('CSS contract: .dse-stamina fill/delta colors come from [data-state]/[data-kind] token rules; the legacy modal blocks are gone', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		expect(sheet).toMatch(/\.dse-stamina__fill\[data-state="healthy"\][^}]*var\(--dse-stamina-healthy\)/);
		expect(sheet).toMatch(/\.dse-stamina__delta\[data-kind="heal"\][^}]*var\(--dse-stamina-temp\)/);
		expect(sheet).toMatch(/\.dse-stamina__delta\[data-kind="damage"\][^}]*var\(--dse-danger\)/);
		// The old hand-rolled modal chrome (its classes carried the inline-style look) is evicted.
		expect(sheet).not.toMatch(/\.minion-stamina-modal/);
		expect(sheet).not.toMatch(/\.quick-mod-btn/);
		// The legacy :root globals are FORMALIZED onto the tokens, not deleted.
		expect(sheet).toMatch(/--stamina-bar-color:\s*var\(--dse-stamina-healthy\)/);
		expect(sheet).toMatch(/--stamina-bar-color-winded:\s*var\(--dse-stamina-winded\)/);
		expect(sheet).toMatch(/--stamina-bar-color-dying:\s*var\(--dse-stamina-dying\)/);
	});
});
