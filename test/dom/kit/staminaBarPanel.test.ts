// D7 Task 1 (spec §2.1/§2.3) — kit/StaminaBarPanel: the `.dse-stamina` render core
// lifted from stamina-bar/view.ts's private renderBar/updateBarDisplay. This test
// pins the shared core's own DOM/behavior contract (the stamina-bar element test
// suite, test/dom/elements/stamina-bar.test.ts, pins that the ELEMENT still produces
// the exact same DOM through this core — unmodified by this task).
import { renderStaminaBar, updateStaminaBar } from '../../../src/framework/kit/StaminaBarPanel';
import { Component } from '../../mocks/obsidian';

// Same convention as iconButton.test.ts: the mock Component's runtime shape
// (registerDomEvent/register/unload) is what matters, not structural tsc satisfaction.
function fakeOwner(): any {
	return new Component();
}

/** Numeric value of a --dse-* percentage custom property on an element. */
function dseVar(el: HTMLElement, prop: string): number {
	const raw = el.style.getPropertyValue(prop);
	if (raw === '') throw new Error(`no ${prop} custom property set`);
	return parseFloat(raw);
}

describe('D7 Task 1: kit/StaminaBarPanel — renderStaminaBar', () => {
	test('renders .dse-stamina with track/fill/temp/threshold/pill children and correct fill geometry', () => {
		const root = document.createElement('div');
		const bar = renderStaminaBar(
			root,
			{ current: 15, temp: 5, max: 20 },
			{ canPersist: true },
		)!;

		expect(bar).not.toBeNull();
		expect(bar.hasClass('dse-stamina')).toBe(true);
		expect(bar.hasClass('dse-stamina--clickable')).toBe(true);
		expect(bar.style.getPropertyValue('--dse-bar-h')).toBe('1em');

		// max=20, current=15, temp=5 -> dyingStamina=10, totalStamina=30.
		const fill = bar.querySelector('.dse-stamina__fill') as HTMLElement;
		expect(dseVar(fill, '--dse-fill')).toBeCloseTo(((15 + 10) / 30) * 100, 2);
		expect(fill.getAttribute('data-state')).toBe('healthy');

		const temp = bar.querySelector('.dse-stamina__temp') as HTMLElement;
		expect(dseVar(temp, '--dse-temp-fill')).toBeCloseTo((5 / 30) * 100, 2);

		const track = bar.querySelector('.dse-stamina__track') as HTMLElement;
		expect(dseVar(track, '--dse-zone')).toBeCloseTo((10 / 30) * 100, 2);

		const thresholds = bar.querySelectorAll('.dse-stamina__threshold');
		expect(thresholds).toHaveLength(2);
		expect(thresholds[0].textContent).toBe('Dying');
		expect(thresholds[1].textContent).toBe('Winded');

		const pill = bar.querySelector('.dse-stamina__num .dse-stamina__pill') as HTMLElement;
		expect(pill.textContent).toBe('(15/20 + 5)');
	});

	test('height opt feeds --dse-bar-h; omitted defaults to 1', () => {
		const root = document.createElement('div');
		const bar = renderStaminaBar(root, { current: 1, temp: 0, max: 2 }, { canPersist: true, height: 3 })!;
		expect(bar.style.getPropertyValue('--dse-bar-h')).toBe('3em');
	});

	test('temp <= 0: pill omits the "+ N" suffix', () => {
		const root = document.createElement('div');
		const bar = renderStaminaBar(root, { current: 15, temp: 0, max: 20 }, { canPersist: true })!;
		const pill = bar.querySelector('.dse-stamina__num .dse-stamina__pill') as HTMLElement;
		expect(pill.textContent).toBe('(15/20)');
	});

	test('current <= 0: [data-state="dying"]; below half max: [data-state="winded"]', () => {
		const root1 = document.createElement('div');
		const dying = renderStaminaBar(root1, { current: 0, temp: 0, max: 20 }, { canPersist: true })!;
		expect(dying.querySelector('.dse-stamina__fill')!.getAttribute('data-state')).toBe('dying');

		const root2 = document.createElement('div');
		const winded = renderStaminaBar(root2, { current: 5, temp: 0, max: 20 }, { canPersist: true })!;
		expect(winded.querySelector('.dse-stamina__fill')!.getAttribute('data-state')).toBe('winded');
	});

	test('canPersist: false — no clickable modifier, applies the read-only tooltip, no click listener registered', () => {
		const root = document.createElement('div');
		const owner = fakeOwner();
		const registerSpy = jest.spyOn(owner, 'registerDomEvent');
		const onClick = jest.fn();

		const bar = renderStaminaBar(root, { current: 1, temp: 0, max: 2 }, {
			canPersist: false,
			owner,
			onClick,
			readOnlyTooltip: 'Read-only in this context',
		})!;

		expect(bar.hasClass('dse-stamina--clickable')).toBe(false);
		expect(bar.getAttribute('data-tooltip')).toBe('Read-only in this context');
		expect(registerSpy).not.toHaveBeenCalled();
	});

	test('canPersist: true — registers the click listener via the owner Component', () => {
		const root = document.createElement('div');
		const owner = fakeOwner();
		const registerSpy = jest.spyOn(owner, 'registerDomEvent');
		const onClick = jest.fn();

		const bar = renderStaminaBar(root, { current: 1, temp: 0, max: 2 }, {
			canPersist: true,
			owner,
			onClick,
		})!;

		expect(registerSpy).toHaveBeenCalledWith(bar, 'click', onClick);
	});

	test("style: 'sheet' renders the notice instead of the bar, and returns null", () => {
		const root = document.createElement('div');
		const bar = renderStaminaBar(root, { current: 1, temp: 0, max: 2 }, {
			canPersist: true,
			style: 'sheet',
		});

		expect(bar).toBeNull();
		expect(root.querySelector('.dse-stamina')).toBeNull();
		const notice = root.querySelector('.dse-stamina__notice') as HTMLElement;
		expect(notice.textContent).toBe('Sheet style is not implemented, use default style');
	});

	test('SC-5: the only inline styles are --dse-* custom properties', () => {
		const root = document.createElement('div');
		renderStaminaBar(root, { current: 15, temp: 5, max: 20 }, { canPersist: true });

		for (const el of Array.from(root.querySelectorAll<HTMLElement>('[style]'))) {
			for (const decl of el.getAttribute('style')!.split(';')) {
				if (decl.trim() === '') continue;
				expect(decl.trim()).toMatch(/^--dse-/);
			}
		}
	});
});

describe('D7 Task 1: kit/StaminaBarPanel — updateStaminaBar (targeted, no rebuild)', () => {
	test('mutates the fill/temp/zone/pill nodes IN PLACE — root identity + child identity stable', () => {
		const root = document.createElement('div');
		const bar = renderStaminaBar(root, { current: 15, temp: 5, max: 20 }, { canPersist: true })!;
		const fillBefore = bar.querySelector('.dse-stamina__fill');
		const tempBefore = bar.querySelector('.dse-stamina__temp');
		const pillBefore = bar.querySelector('.dse-stamina__num .dse-stamina__pill');

		updateStaminaBar(bar, { current: 20, temp: 0, max: 20 });

		// Same element identities — no DOM rebuild.
		expect(bar.querySelector('.dse-stamina__fill')).toBe(fillBefore);
		expect(bar.querySelector('.dse-stamina__temp')).toBe(tempBefore);
		expect(bar.querySelector('.dse-stamina__num .dse-stamina__pill')).toBe(pillBefore);

		const fill = bar.querySelector('.dse-stamina__fill') as HTMLElement;
		expect(dseVar(fill, '--dse-fill')).toBeCloseTo(100, 2);
		expect(fill.getAttribute('data-state')).toBe('healthy');
		const pill = bar.querySelector('.dse-stamina__num .dse-stamina__pill') as HTMLElement;
		expect(pill.textContent).toBe('(20/20)');
	});
});
