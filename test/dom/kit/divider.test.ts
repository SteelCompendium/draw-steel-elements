// Plan 08 Task 2 (D2 §2.10) — kit/divider: horizontal / vertical rule. `ornament: true`
// renders the ◆ diamond rule (today's .ds-hr-container fade-line-with-diamond look, kept
// pixel-faithful by the Legacy token values); plain renders a single line. Static —
// no listeners, `owner` optional.
import * as fs from 'fs';
import * as path from 'path';
import { divider } from '../../../src/framework/kit/divider';

describe('Plan 08 Task 2: kit/divider (D2 §2.10)', () => {
	test('axis "h" + ornament renders .dse-hr with left line, ◆ diamond, right line in order', () => {
		const parent = document.createElement('div');
		const { rootEl } = divider(parent, { axis: 'h', ornament: true });

		expect(rootEl.parentElement).toBe(parent);
		expect(rootEl.hasClass('dse-hr')).toBe(true);
		expect(rootEl.getAttribute('role')).toBe('separator');

		const children = Array.from(rootEl.children);
		expect(children).toHaveLength(3);
		expect(children[0].className).toBe('dse-hr__line dse-hr__line--left');
		expect(children[1].className).toBe('dse-hr__diamond');
		expect(children[2].className).toBe('dse-hr__line dse-hr__line--right');
	});

	test('axis "h" without ornament renders a single plain .dse-hr__line', () => {
		const parent = document.createElement('div');
		const { rootEl } = divider(parent, { axis: 'h' });

		const children = Array.from(rootEl.children);
		expect(children).toHaveLength(1);
		expect(children[0].className).toBe('dse-hr__line');
		expect(rootEl.querySelector('.dse-hr__diamond')).toBeNull();
	});

	test('axis "v" renders .dse-vr with aria-orientation="vertical"', () => {
		const parent = document.createElement('div');
		const { rootEl } = divider(parent, { axis: 'v' });

		expect(rootEl.hasClass('dse-vr')).toBe(true);
		expect(rootEl.getAttribute('role')).toBe('separator');
		expect(rootEl.getAttribute('aria-orientation')).toBe('vertical');
		expect(rootEl.childElementCount).toBe(0);
	});

	test('CSS: the divider rules are authored against --dse-rule / --dse-rule-fade (no literals)', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		const left = sheet.match(/\.dse-hr__line--left\s*\{([^}]*)\}/);
		const diamond = sheet.match(/\.dse-hr__diamond\s*\{([^}]*)\}/);
		const vr = sheet.match(/\.dse-vr\s*\{([^}]*)\}/);
		expect(left).not.toBeNull();
		expect(left![1]).toMatch(/var\(--dse-rule\)/);
		expect(left![1]).toMatch(/var\(--dse-rule-fade\)/);
		expect(diamond).not.toBeNull();
		expect(diamond![1]).toMatch(/var\(--dse-rule\)/);
		expect(vr).not.toBeNull();
		expect(vr![1]).toMatch(/var\(--dse-rule\)/);
	});
});
