import { StaminaBar } from '@model/StaminaBar';
import { StaminaEditModal } from '@views/StaminaEditModal';
import { App } from '../../mocks/obsidian';

function makeModal(max: number, current: number, temp: number, isHero = true) {
	const app = new App();
	const bar = new StaminaBar(false, false, max, current, temp, 1);
	const updateCallback = jest.fn();
	const modal = new StaminaEditModal(app as any, bar, isHero, 'Frodo', updateCallback);
	modal.open();
	const content = (modal as any).contentEl as HTMLElement;
	return { modal: modal as any, bar, content, updateCallback };
}

function clickDamage(content: HTMLElement, amount: number): void {
	(content.querySelector('.apply-input') as HTMLInputElement).value = String(amount);
	(content.querySelectorAll('.apply-btn')[0] as HTMLElement).click(); // [0]=Damage, [1]=Healing
}

function clickHealing(content: HTMLElement, amount: number): void {
	(content.querySelector('.apply-input') as HTMLInputElement).value = String(amount);
	(content.querySelectorAll('.apply-btn')[1] as HTMLElement).click();
}

function apply(content: HTMLElement): void {
	(content.querySelector('.action-button') as HTMLElement).click();
}

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
		(content.querySelectorAll('.quick-mod-btn')[0] as HTMLElement).click(); // Kill
		apply(content);
		expect(bar.current_stamina).toBe(-7);
	});

	test('non-hero: Kill floors at 0', () => {
		const { content, bar } = makeModal(15, 10, 0, false);
		(content.querySelectorAll('.quick-mod-btn')[0] as HTMLElement).click(); // Kill
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
		(content.querySelectorAll('.quick-mod-btn')[1] as HTMLElement).click(); // Full Heal
		apply(content);
		expect(bar.current_stamina).toBe(20);
		expect(bar.temp_stamina).toBe(0);
	});

	test('Spend Recovery heals floor(max/3)', () => {
		const { content, bar } = makeModal(21, 10, 0);
		(content.querySelectorAll('.quick-mod-btn')[2] as HTMLElement).click(); // Spend Recovery
		apply(content);
		expect(bar.current_stamina).toBe(17); // 10 + floor(21/3)
	});
});
