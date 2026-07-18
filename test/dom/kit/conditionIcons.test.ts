// D7 Task 1 (spec §2.1/§2.3) — kit/conditionIcons: the per-condition icon loop lifted
// from InitiativeView.buildConditionIcons's forEach body (initiative/view.ts:858). This
// test pins the shared core's own DOM/behavior contract (the initiative element test
// suite, test/dom/elements/initiative.test.ts, pins that the ELEMENT still produces the
// exact same DOM through this core — unmodified by this task).
import { buildConditionIcons } from '../../../src/framework/kit/conditionIcons';
import { ConditionManager } from '../../../src/utils/Conditions';
import { Component } from '../../mocks/obsidian';

// Same convention as iconButton.test.ts: the mock Component's runtime shape
// (registerDomEvent/register/unload) is what matters, not structural tsc satisfaction.
function fakeOwner(): any {
	return new Component();
}

/** The Lucide icon of a control: kit iconButtons carry it on the .dse-btn__icon child;
 *  read-only static glyph spans carry it directly (mock setIcon stamps data-icon). */
function iconOf(el: Element): string | null {
	return el.getAttribute('data-icon') ?? el.querySelector('[data-icon]')?.getAttribute('data-icon') ?? null;
}

describe('D7 Task 1: kit/conditionIcons — buildConditionIcons', () => {
	test('renders one icon per condition, using the manager key -> icon/displayName', () => {
		const root = document.createElement('div');
		const mgr = new ConditionManager();

		buildConditionIcons(root, ['grabbed', 'bleeding'], mgr, {
			owner: fakeOwner(),
			canRemove: true,
		});

		const icons = root.querySelectorAll('.dse-cond');
		expect(icons).toHaveLength(2);
		expect(iconOf(icons[0])).toBe('hand'); // grabbed
		expect(icons[0].getAttribute('aria-label')).toBe('Remove condition: Grabbed');
		expect(icons[0].getAttribute('data-tooltip')).toBe('Grabbed');
		expect(iconOf(icons[1])).toBe('droplet'); // bleeding
	});

	test('unrecognized condition keys are skipped', () => {
		const root = document.createElement('div');
		const mgr = new ConditionManager();

		buildConditionIcons(root, ['not-a-real-condition', 'grabbed'], mgr, {
			owner: fakeOwner(),
			canRemove: true,
		});

		expect(root.querySelectorAll('.dse-cond')).toHaveLength(1);
	});

	test('canRemove: true — real iconButtons; click invokes onRemove with the exact entry', () => {
		const root = document.createElement('div');
		const mgr = new ConditionManager();
		const onRemove = jest.fn();

		buildConditionIcons(root, ['grabbed'], mgr, { owner: fakeOwner(), canRemove: true, onRemove });

		const icon = root.querySelector('.dse-cond') as HTMLButtonElement;
		expect(icon.tagName).toBe('BUTTON');
		icon.click();
		expect(onRemove).toHaveBeenCalledWith('grabbed');
	});

	test('canRemove: false — static, non-interactive spans; onRemove never called even if clicked', () => {
		const root = document.createElement('div');
		const mgr = new ConditionManager();
		const onRemove = jest.fn();

		buildConditionIcons(root, ['grabbed'], mgr, { owner: fakeOwner(), canRemove: false, onRemove });

		const icon = root.querySelector('.dse-cond') as HTMLElement;
		expect(icon.tagName).toBe('SPAN');
		icon.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(onRemove).not.toHaveBeenCalled();
	});

	test('color/effect: valid color arrives as the validated --dse-condition-color property (never inline color); unknown effect adds no class', () => {
		const root = document.createElement('div');
		const mgr = new ConditionManager();

		buildConditionIcons(
			root,
			[{ key: 'bleeding', color: 'crimson', effect: 'glow' }, { key: 'grabbed', color: 'not-a-color', effect: 'whatever' }],
			mgr,
			{ owner: fakeOwner(), canRemove: true },
		);

		const icons = root.querySelectorAll('.dse-cond');
		expect((icons[0] as HTMLElement).style.getPropertyValue('--dse-condition-color')).toBe('crimson');
		expect((icons[0] as HTMLElement).style.color).toBe('');
		expect(icons[0].classList.contains('condition-effect-glow')).toBe(true);

		// Invalid color rejected (property cleared); unknown effect -> no class.
		expect((icons[1] as HTMLElement).style.getPropertyValue('--dse-condition-color')).toBe('');
		expect([...icons[1].classList].some((c) => c.startsWith('condition-effect-'))).toBe(false);
	});

	test('string entries and {key} object entries are both accepted', () => {
		const root = document.createElement('div');
		const mgr = new ConditionManager();

		buildConditionIcons(root, ['grabbed', { key: 'bleeding' }], mgr, {
			owner: fakeOwner(),
			canRemove: true,
		});

		expect(root.querySelectorAll('.dse-cond')).toHaveLength(2);
	});
});
