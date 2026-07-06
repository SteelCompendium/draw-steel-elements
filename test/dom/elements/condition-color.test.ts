// Plan 09 Task 8 (D2 §3.x / OD-8 / SD-2) — applyConditionColor: the ONE validated
// write of the --dse-condition-color scoped custom property. User-supplied condition
// colors are validated via CSS.supports('color', v); valid → setProperty on the
// element, invalid/absent → the property is CLEARED so CSS falls back to
// var(--dse-condition-color, var(--dse-fg-muted)). NEVER el.style.color (SC-5).
// applyConditionEffect is the shared condition-effect class toggle (the duplicated
// updateIconPreview effect block from both condition modals, consolidated).
import * as fs from 'fs';
import * as path from 'path';
import { applyConditionColor, applyConditionEffect, CONDITION_EFFECTS } from '@/elements/conditionColor';
import { styleGuardFindings } from '../kit/styleGuard';

function el(): HTMLElement {
	const e = document.createElement('div');
	document.body.appendChild(e);
	return e;
}

afterEach(() => {
	document.body.innerHTML = '';
	jest.restoreAllMocks();
});

describe('Task 8 (OD-8/SD-2): applyConditionColor — validated --dse-condition-color', () => {
	test('a valid color sets --dse-condition-color (and ONLY that property)', () => {
		const icon = el();
		applyConditionColor(icon, 'red');
		expect(icon.style.getPropertyValue('--dse-condition-color')).toBe('red');
		// the style attribute carries nothing but the sanctioned custom property
		for (const decl of (icon.getAttribute('style') ?? '').split(';')) {
			if (decl.trim() === '') continue;
			expect(decl.trim()).toMatch(/^--dse-condition-color:/);
		}
	});

	test('hex and rgb() colors are valid', () => {
		const icon = el();
		applyConditionColor(icon, '#ff0000');
		expect(icon.style.getPropertyValue('--dse-condition-color')).toBe('#ff0000');
		applyConditionColor(icon, 'rgb(1, 2, 3)');
		expect(icon.style.getPropertyValue('--dse-condition-color')).toBe('rgb(1, 2, 3)');
	});

	test('validation goes through CSS.supports("color", v)', () => {
		const spy = jest.spyOn(CSS as any, 'supports');
		applyConditionColor(el(), 'red');
		expect(spy).toHaveBeenCalledWith('color', 'red');
	});

	test.each(['not a color', '; }', 'expression(alert(1))', 'url(javascript:alert(1))'])(
		'invalid input %j is NOT set — the icon falls back to the CSS var() default',
		(bad) => {
			const icon = el();
			applyConditionColor(icon, bad);
			expect(icon.style.getPropertyValue('--dse-condition-color')).toBe('');
			expect(icon.getAttribute('style') ?? '').toBe('');
		},
	);

	test('absent color CLEARS a previously set property (customization removed)', () => {
		const icon = el();
		applyConditionColor(icon, 'red');
		applyConditionColor(icon, undefined);
		expect(icon.style.getPropertyValue('--dse-condition-color')).toBe('');
	});

	test('an invalid color also CLEARS a previously valid one (no stale customization)', () => {
		const icon = el();
		applyConditionColor(icon, 'red');
		applyConditionColor(icon, 'not a color');
		expect(icon.style.getPropertyValue('--dse-condition-color')).toBe('');
	});

	test('NEVER writes el.style.color (SC-5)', () => {
		const icon = el();
		applyConditionColor(icon, 'red');
		expect(icon.style.color).toBe('');
	});
});

describe('Task 8: applyConditionEffect — the shared condition-effect class toggle', () => {
	test('a known effect adds its class; switching effects swaps classes', () => {
		const icon = el();
		applyConditionEffect(icon, 'glow');
		expect(icon.classList.contains('condition-effect-glow')).toBe(true);
		applyConditionEffect(icon, 'blink');
		expect(icon.classList.contains('condition-effect-glow')).toBe(false);
		expect(icon.classList.contains('condition-effect-blink')).toBe(true);
	});

	test('"static" and undefined clear every effect class', () => {
		const icon = el();
		applyConditionEffect(icon, 'blur-pulse');
		applyConditionEffect(icon, 'static');
		expect(icon.className).toBe('');
		applyConditionEffect(icon, 'breathing');
		applyConditionEffect(icon, undefined);
		expect(icon.className).toBe('');
	});

	test('unknown / malicious effect strings add NO class and do not throw', () => {
		const icon = el();
		applyConditionEffect(icon, 'sparkle');
		expect(icon.className).toBe('');
		// classList.add('condition-effect-x y') would throw InvalidCharacterError —
		// the legacy modals passed user data straight in; the helper filters it.
		expect(() => applyConditionEffect(icon, 'x y')).not.toThrow();
		expect(icon.className).toBe('');
	});

	test('CONDITION_EFFECTS is the customize dropdown vocabulary (5 effects)', () => {
		expect(CONDITION_EFFECTS).toEqual(['blink', 'glow', 'glow-pulse', 'breathing', 'blur-pulse']);
	});
});

describe('Task 8: source hygiene', () => {
	test('conditionColor.ts validates via CSS.supports and passes the style guard', () => {
		const src = fs.readFileSync(
			path.join(__dirname, '../../../src/elements/conditionColor.ts'),
			'utf8',
		);
		expect(src).toMatch(/CSS\.supports\(\s*'color'/);
		// comment-stripped like the guard itself (the header COMMENT names the ban)
		const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
		expect(code).not.toMatch(/\.style\.color/);
		expect(styleGuardFindings(src)).toEqual([]);
	});
});
