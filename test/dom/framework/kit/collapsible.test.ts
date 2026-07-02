// D1 Task 2 (Plan 03) — kit/collapsible: mountCollapsibleHeading. Vanilla DOM port of
// Common/CollapsibleHeading.vue + Common/RightArrowToggleIndicator.vue (F1 §6 step
// "Skills"). Session-agnostic: the widget only tracks its OWN visual is-collapsed state
// and reports toggles via onToggle — persistence is the caller's job (see skills.test.ts
// for the SessionStore integration).
import { mountCollapsibleHeading } from '../../../../src/framework/kit/collapsible';
import { Component } from '../../../mocks/obsidian';

// The mock Component's self-referencing generics (addChild<T extends Component>) don't
// structurally satisfy the real `obsidian` package's Component type under tsc (a
// pre-existing test-harness friction — see seams.test.ts's identical `fakeOwner(): any`
// convention); jest itself doesn't type-check (diagnostics: false). `owner` here is only
// ever used for its real runtime shape (registerDomEvent/unload), so `any` is safe.
function fakeOwner(): any {
	return new Component();
}

describe('D1 Task 2: kit/collapsible — mountCollapsibleHeading (F1 §6 step "Skills")', () => {
	test('renders an h1 by default with the indicator preceding the heading text', () => {
		const parent = document.createElement('div');
		const owner = fakeOwner();

		const { headingEl, indicatorEl } = mountCollapsibleHeading(parent, owner, {
			enabled: true,
			text: 'Crafting',
			onToggle: () => {},
		});

		expect(headingEl.tagName).toBe('H1');
		expect(headingEl.parentElement).toBe(parent);
		expect(headingEl.firstElementChild).toBe(indicatorEl);
		expect(headingEl.textContent).toBe('Crafting');
		expect(indicatorEl.hasClass('heading-collapse-indicator')).toBe(true);
		expect(indicatorEl.hasClass('collapse-icon')).toBe(true);
		expect(indicatorEl.getAttribute('data-icon')).toBe('right-triangle');
	});

	test('headerLevel controls the tag (h1-h6) and clamps out-of-range values', () => {
		const owner = fakeOwner();
		expect(mountCollapsibleHeading(document.createElement('div'), owner, {
			headerLevel: 3,
			enabled: true,
			text: 'x',
			onToggle: () => {},
		}).headingEl.tagName).toBe('H3');
		expect(mountCollapsibleHeading(document.createElement('div'), owner, {
			headerLevel: 0,
			enabled: true,
			text: 'x',
			onToggle: () => {},
		}).headingEl.tagName).toBe('H1');
		expect(mountCollapsibleHeading(document.createElement('div'), owner, {
			headerLevel: 9,
			enabled: true,
			text: 'x',
			onToggle: () => {},
		}).headingEl.tagName).toBe('H6');
	});

	describe('enabled/is-collapsed reflection', () => {
		test('enabled: true -> indicator has NO is-collapsed class', () => {
			const owner = fakeOwner();
			const { indicatorEl } = mountCollapsibleHeading(document.createElement('div'), owner, {
				enabled: true,
				text: 'x',
				onToggle: () => {},
			});
			expect(indicatorEl.hasClass('is-collapsed')).toBe(false);
		});

		test('enabled: false -> indicator HAS is-collapsed class', () => {
			const owner = fakeOwner();
			const { indicatorEl } = mountCollapsibleHeading(document.createElement('div'), owner, {
				enabled: false,
				text: 'x',
				onToggle: () => {},
			});
			expect(indicatorEl.hasClass('is-collapsed')).toBe(true);
		});
	});

	describe('click toggling', () => {
		test('clicking the indicator flips is-collapsed and calls onToggle with the NEW enabled value', () => {
			const owner = fakeOwner();
			const onToggle = jest.fn();
			const { indicatorEl } = mountCollapsibleHeading(document.createElement('div'), owner, {
				enabled: true,
				text: 'x',
				onToggle,
			});

			indicatorEl.click();

			expect(indicatorEl.hasClass('is-collapsed')).toBe(true);
			expect(onToggle).toHaveBeenCalledTimes(1);
			expect(onToggle).toHaveBeenCalledWith(false);
		});

		test('a second click toggles back', () => {
			const owner = fakeOwner();
			const onToggle = jest.fn();
			const { indicatorEl } = mountCollapsibleHeading(document.createElement('div'), owner, {
				enabled: true,
				text: 'x',
				onToggle,
			});

			indicatorEl.click();
			indicatorEl.click();

			expect(indicatorEl.hasClass('is-collapsed')).toBe(false);
			expect(onToggle).toHaveBeenCalledTimes(2);
			expect(onToggle).toHaveBeenLastCalledWith(true);
		});

		test('mousedown on the indicator does not bubble to the document (Vue @mousedown.stop parity)', () => {
			const owner = fakeOwner();
			document.body.appendChild(document.createElement('div'));
			const parent = document.body.lastElementChild as HTMLElement;
			const { indicatorEl } = mountCollapsibleHeading(parent, owner, {
				enabled: true,
				text: 'x',
				onToggle: () => {},
			});
			let bubbled = 0;
			const onDocMousedown = () => bubbled++;
			document.addEventListener('mousedown', onDocMousedown);
			try {
				indicatorEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
				expect(bubbled).toBe(0);
			} finally {
				document.removeEventListener('mousedown', onDocMousedown);
				parent.remove();
			}
		});
	});

	describe('setEnabled(enabled) — externally-driven state', () => {
		test('reflects the new state onto the indicator WITHOUT calling onToggle', () => {
			const owner = fakeOwner();
			const onToggle = jest.fn();
			const handle = mountCollapsibleHeading(document.createElement('div'), owner, {
				enabled: true,
				text: 'x',
				onToggle,
			});

			handle.setEnabled(false);
			expect(handle.indicatorEl.hasClass('is-collapsed')).toBe(true);
			handle.setEnabled(true);
			expect(handle.indicatorEl.hasClass('is-collapsed')).toBe(false);
			expect(onToggle).not.toHaveBeenCalled();
		});
	});

	describe('lifecycle cleanup (F1 §4.5 — registerDomEvent via owner)', () => {
		test('owner.unload() detaches the click listener', () => {
			const owner = fakeOwner();
			const onToggle = jest.fn();
			const { indicatorEl } = mountCollapsibleHeading(document.createElement('div'), owner, {
				enabled: true,
				text: 'x',
				onToggle,
			});

			owner.unload();
			indicatorEl.click();

			expect(onToggle).not.toHaveBeenCalled();
		});
	});
});
