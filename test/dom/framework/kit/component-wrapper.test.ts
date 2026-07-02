// D1 Task 2 (Plan 03) — kit/componentWrapper: mountComponentWrapper. Vanilla DOM port of
// Common/ComponentWrapper.vue + Common/ComponentHideIndicator.vue + the collapsed-state
// rail from VerticalRule.vue (F1 §6 step "Skills"). Session-agnostic: the widget only
// tracks its OWN collapsed state and reports toggles via onToggle — persistence is the
// caller's job (see skills.test.ts for the SessionStore integration). Reused by Stamina
// Bar in D1 step 3, so this widget is tested independent of any one element.
import { mountComponentWrapper } from '../../../../src/framework/kit/componentWrapper';
import { Component } from '../../../mocks/obsidian';

// The mock Component's self-referencing generics (addChild<T extends Component>) don't
// structurally satisfy the real `obsidian` package's Component type under tsc (a
// pre-existing test-harness friction — see seams.test.ts's identical `fakeOwner(): any`
// convention); jest itself doesn't type-check (diagnostics: false). `owner` here is only
// ever used for its real runtime shape (registerDomEvent/unload), so `any` is safe.
function fakeOwner(): any {
	return new Component();
}

describe('D1 Task 2: kit/componentWrapper — mountComponentWrapper (F1 §6 step "Skills")', () => {
	describe('collapsible: true, collapsed: false (expanded, default matrix)', () => {
		test('renders the eye indicator + the rendered content; renderContent is invoked once', () => {
			const parent = document.createElement('div');
			const owner = fakeOwner();
			const renderContent = jest.fn((contentEl: HTMLElement) => {
				contentEl.createEl('div', { cls: 'payload', text: 'hello' });
			});

			const handle = mountComponentWrapper(parent, owner, {
				componentName: 'Skill List',
				collapsible: true,
				collapsed: false,
				renderContent,
				onToggle: () => {},
			});

			expect(renderContent).toHaveBeenCalledTimes(1);
			expect(handle.wrapperEl.querySelector('.ds-kit-eye-container')).not.toBeNull();
			expect(handle.wrapperEl.querySelector('.ds-kit-eye-indicator')?.getAttribute('data-icon')).toBe('eye');
			expect(handle.wrapperEl.querySelector('.payload')?.textContent).toBe('hello');
			expect(handle.wrapperEl.querySelector('.ds-kit-collapsed-wrapper')).toBeNull();
			expect(handle.isCollapsed()).toBe(false);
		});
	});

	describe('collapsible: true, collapsed: true (starts collapsed)', () => {
		test('renders the collapsed rail (vertical rule + componentName); renderContent is NOT invoked', () => {
			const parent = document.createElement('div');
			const owner = fakeOwner();
			const renderContent = jest.fn();

			const handle = mountComponentWrapper(parent, owner, {
				componentName: 'Skill List',
				collapsible: true,
				collapsed: true,
				renderContent,
				onToggle: () => {},
			});

			expect(renderContent).not.toHaveBeenCalled();
			const rail = handle.wrapperEl.querySelector('.ds-kit-collapsed-wrapper');
			expect(rail).not.toBeNull();
			expect(rail?.querySelector('.ds-kit-v-rule-container')).not.toBeNull();
			expect(rail?.querySelector('strong')?.textContent).toBe('Skill List');
			expect(handle.wrapperEl.querySelector('.ds-kit-eye-indicator')?.getAttribute('data-icon')).toBe('eye-off');
			expect(handle.isCollapsed()).toBe(true);
		});
	});

	describe('collapsible: false — hides the toggle (preserved YAML contract)', () => {
		test('no eye indicator renders at all, regardless of collapsed', () => {
			const owner = fakeOwner();
			const expanded = mountComponentWrapper(document.createElement('div'), owner, {
				componentName: 'Skill List',
				collapsible: false,
				collapsed: false,
				renderContent: () => {},
				onToggle: () => {},
			});
			expect(expanded.wrapperEl.querySelector('.ds-kit-eye-container')).toBeNull();

			const collapsed = mountComponentWrapper(document.createElement('div'), owner, {
				componentName: 'Skill List',
				collapsible: false,
				collapsed: true,
				renderContent: () => {},
				onToggle: () => {},
			});
			expect(collapsed.wrapperEl.querySelector('.ds-kit-eye-container')).toBeNull();
			expect(collapsed.wrapperEl.querySelector('.ds-kit-collapsed-wrapper')).not.toBeNull();
		});
	});

	describe('toggling the eye indicator', () => {
		test('click collapses: content removed, rail shown, icon flips, onToggle(true) fires', () => {
			const parent = document.createElement('div');
			const owner = fakeOwner();
			const onToggle = jest.fn();
			const renderContent = jest.fn((contentEl: HTMLElement) => {
				contentEl.createEl('div', { cls: 'payload' });
			});

			const handle = mountComponentWrapper(parent, owner, {
				componentName: 'Skill List',
				collapsible: true,
				collapsed: false,
				renderContent,
				onToggle,
			});
			const eyeIndicator = handle.wrapperEl.querySelector('.ds-kit-eye-indicator') as HTMLElement;

			eyeIndicator.click();

			expect(handle.isCollapsed()).toBe(true);
			expect(onToggle).toHaveBeenCalledTimes(1);
			expect(onToggle).toHaveBeenCalledWith(true);
			expect(handle.wrapperEl.querySelector('.payload')).toBeNull();
			expect(handle.wrapperEl.querySelector('.ds-kit-collapsed-wrapper')).not.toBeNull();
			expect(eyeIndicator.getAttribute('data-icon')).toBe('eye-off');
		});

		test('a second click re-expands: rail removed, renderContent invoked AGAIN, onToggle(false) fires', () => {
			const parent = document.createElement('div');
			const owner = fakeOwner();
			const onToggle = jest.fn();
			const renderContent = jest.fn((contentEl: HTMLElement) => {
				contentEl.createEl('div', { cls: 'payload' });
			});

			const handle = mountComponentWrapper(parent, owner, {
				componentName: 'Skill List',
				collapsible: true,
				collapsed: false,
				renderContent,
				onToggle,
			});
			const eyeIndicator = handle.wrapperEl.querySelector('.ds-kit-eye-indicator') as HTMLElement;

			eyeIndicator.click();
			eyeIndicator.click();

			expect(handle.isCollapsed()).toBe(false);
			expect(renderContent).toHaveBeenCalledTimes(2);
			expect(onToggle).toHaveBeenLastCalledWith(false);
			expect(handle.wrapperEl.querySelector('.payload')).not.toBeNull();
			expect(handle.wrapperEl.querySelector('.ds-kit-collapsed-wrapper')).toBeNull();
		});
	});

	describe('lifecycle cleanup (F1 §4.5 — registerDomEvent via owner)', () => {
		test('owner.unload() detaches the eye indicator click listener', () => {
			const parent = document.createElement('div');
			const owner = fakeOwner();
			const onToggle = jest.fn();
			const handle = mountComponentWrapper(parent, owner, {
				componentName: 'Skill List',
				collapsible: true,
				collapsed: false,
				renderContent: () => {},
				onToggle,
			});
			const eyeIndicator = handle.wrapperEl.querySelector('.ds-kit-eye-indicator') as HTMLElement;

			owner.unload();
			eyeIndicator.click();

			expect(onToggle).not.toHaveBeenCalled();
		});
	});
});
