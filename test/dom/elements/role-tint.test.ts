// Plan 09 Task 6 (D2 §3.7/§3.8, OD-5) — roleTint: the SHARED combat-role tint helper
// (extracted from the T6a featureblock view when T6b statblock needed the identical
// map). P09 review fix: this was the one element-source `.style` writer not covered
// by any styleGuardFindings scan — its only write is the sanctioned --dse-role alias
// (safe by inspection), so the hygiene test here just brings it under the guard.
import * as fs from 'fs';
import * as path from 'path';
import { roleOf, applyRoleTint, DSE_ROLES } from '@/elements/roleTint';
import { styleGuardFindings } from '../kit/styleGuard';

afterEach(() => {
	document.body.innerHTML = '';
});

describe('Task 6: roleOf — the shared role-word extractor', () => {
	test('a mapped role word maps to itself', () => {
		expect(roleOf('leader')).toBe('leader');
	});

	test('an unmapped word yields undefined (the tint fails safe to monochrome)', () => {
		expect(roleOf('Boss')).toBeUndefined();
	});

	test('multi-word SDK text: "Horde, Harrier" → harrier, "Hazard Hexer" → hexer', () => {
		expect(roleOf('Horde, Harrier')).toBe('harrier');
		expect(roleOf('Hazard Hexer')).toBe('hexer');
	});

	test('absent/empty input yields undefined', () => {
		expect(roleOf(undefined)).toBeUndefined();
		expect(roleOf('')).toBeUndefined();
	});

	test('every vocabulary role round-trips through roleOf (case-insensitively)', () => {
		for (const role of DSE_ROLES) {
			expect(roleOf(role.toUpperCase())).toBe(role);
		}
	});
});

describe('Task 6: applyRoleTint — the fails-safe attribute + alias pair', () => {
	test('a mapped role sets BOTH [data-dse-role] and the --dse-role element alias', () => {
		const card = document.createElement('div');
		expect(applyRoleTint(card, 'Horde, Harrier')).toBe('harrier');
		expect(card.getAttribute('data-dse-role')).toBe('harrier');
		expect(card.style.getPropertyValue('--dse-role')).toBe('var(--dse-role-harrier)');
	});

	test('unmapped text sets NEITHER — CSS var(--dse-role, <fallback>) degrades to monochrome', () => {
		const card = document.createElement('div');
		expect(applyRoleTint(card, 'Boss')).toBeUndefined();
		expect(card.hasAttribute('data-dse-role')).toBe(false);
		expect(card.getAttribute('style') ?? '').toBe('');
	});
});

describe('P09 review fix: source hygiene', () => {
	test('roleTint.ts passes the shared style guard (its ONE .style write is the sanctioned --dse-role alias)', () => {
		const src = fs.readFileSync(path.join(__dirname, '../../../src/elements/roleTint.ts'), 'utf8');
		expect(styleGuardFindings(src)).toEqual([]);
	});
});
