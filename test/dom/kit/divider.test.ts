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

	test('CSS: the divider BASE rules are authored against --dse-rule / --dse-rule-fade (no literals)', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		// SC-128 anchored these matchers to the BASE (theme-agnostic) rule. They used to be
		// bare `.dse-hr__line--left {` matches, i.e. "the FIRST occurrence in the file" —
		// correct only while the kit primitive had exactly one rule each. SC-128's Steel
		// ornate rule (`[data-dse-theme='steel'][data-dse-element='horizontal-rule']… .dse-hr__line--left`)
		// sits EARLIER in the sheet, so the unanchored form silently retargeted this test at
		// the Steel override — which legitimately uses --dse-metal-line, not --dse-rule, and
		// the test failed for the wrong reason. `^` + multiline pins the base rule (the only
		// one whose selector starts a line at column 0) and keeps this assertion about the
		// Legacy contract it was written for.
		const base = (cls: string): RegExpMatchArray | null =>
			sheet.match(new RegExp(`^\\.${cls}\\s*\\{([^}]*)\\}`, 'm'));
		const left = base('dse-hr__line--left');
		const diamond = base('dse-hr__diamond');
		const vr = base('dse-vr');
		expect(left).not.toBeNull();
		expect(left![1]).toMatch(/var\(--dse-rule\)/);
		expect(left![1]).toMatch(/var\(--dse-rule-fade\)/);
		expect(diamond).not.toBeNull();
		expect(diamond![1]).toMatch(/var\(--dse-rule\)/);
		expect(vr).not.toBeNull();
		expect(vr![1]).toMatch(/var\(--dse-rule\)/);
	});
});
