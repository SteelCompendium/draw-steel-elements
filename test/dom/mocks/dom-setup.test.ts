import { App, Modal, setIcon, setTooltip } from '../../mocks/obsidian';

describe('dom-setup: HTMLElement prototype extensions', () => {
	test('createEl appends a child with cls/text/attr/title', () => {
		const parent = document.createElement('div');
		const child = parent.createEl('span', {
			cls: 'a b',
			text: 'hi',
			attr: { 'data-x': 1 },
			title: 'tip',
		});
		expect(child.parentElement).toBe(parent);
		expect(child.className).toBe('a b');
		expect(child.textContent).toBe('hi');
		expect(child.getAttribute('data-x')).toBe('1');
		expect(child.title).toBe('tip');
	});

	test('createEl supports input type/value and the callback arg', () => {
		const parent = document.createElement('div');
		let seen: HTMLElement | null = null;
		const input = parent.createEl('input', { type: 'number', value: '5' }, (el) => (seen = el));
		expect(input.type).toBe('number');
		expect(input.value).toBe('5');
		expect(seen).toBe(input);
	});

	test('createDiv / createSpan shorthands', () => {
		const parent = document.createElement('div');
		expect(parent.createDiv({ cls: 'd' }).tagName).toBe('DIV');
		expect(parent.createSpan({ cls: 's' }).tagName).toBe('SPAN');
	});

	test('empty / setText / addClass / removeClass / toggleClass / hasClass', () => {
		const el = document.createElement('div');
		el.createEl('span', { text: 'x' });
		el.empty();
		expect(el.childNodes).toHaveLength(0);
		el.setText('new text');
		expect(el.textContent).toBe('new text');
		el.addClass('one', 'two');
		expect(el.className).toBe('one two');
		el.removeClass('one');
		expect(el.hasClass('one')).toBe(false);
		el.toggleClass('flag', true);
		expect(el.hasClass('flag')).toBe(true);
		el.toggleClass('flag', false);
		expect(el.hasClass('flag')).toBe(false);
	});

	test('global createEl exists (CounterView.ts:107 uses it bare)', () => {
		const el = (globalThis as any).createEl('div', { cls: 'floating' });
		expect(el.parentElement).toBeNull();
		expect(el.className).toBe('floating');
	});

	test('Array.prototype.contains polyfill is installed', () => {
		expect((['a', 'b'] as any).contains('a')).toBe(true);
		expect((['a', 'b'] as any).contains('z')).toBe(false);
	});
});

describe('dom-setup: Modal + icon helpers', () => {
	test('Modal has real contentEl/titleEl; open/close drive onOpen/onClose', () => {
		const app = new App();
		const opened = jest.fn();
		const closed = jest.fn();
		class TestModal extends Modal {
			onOpen() { opened(); this.contentEl.createEl('p', { text: 'body' }); }
			onClose() { closed(); }
		}
		const modal = new TestModal(app as any);
		modal.open();
		expect(opened).toHaveBeenCalledTimes(1);
		expect(modal.contentEl.textContent).toBe('body');
		modal.close();
		expect(closed).toHaveBeenCalledTimes(1);
	});

	test('setIcon / setTooltip record onto attributes', () => {
		const el = document.createElement('div');
		setIcon(el, 'chevron-up');
		setTooltip(el, 'a tip');
		expect(el.getAttribute('data-icon')).toBe('chevron-up');
		// Real Obsidian's setTooltip stamps `aria-label` (FOLLOWUPS #27-fix-round
		// finding 1) — the mock mirrors that, not a `data-tooltip` attribute.
		expect(el.getAttribute('aria-label')).toBe('a tip');
	});
});
