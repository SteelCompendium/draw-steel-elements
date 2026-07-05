// Plan 08 Task 1 (D2 §6) — the --dse-* token vocabulary + Legacy defaults.
//
// Layering contract (D2↔D3 reconciliation): Legacy = TODAY'S look, authored as the
// unscoped :root BASE block in styles-source.css — NOT scoped under a
// data-dse-theme="legacy" selector. D3 owns the token values long-term and adds the
// [data-dse-theme="steel"] override layer on top (closest scoped definition wins
// within a steel element root); until then the default (theme "steel") renders the
// Legacy base = today's look. No kit widget or element consumes the tokens yet
// (Plan 08 Tasks 2-4 do).
import * as fs from 'fs';
import * as path from 'path';
import { DSE_TOKEN_NAMES } from '../../../src/framework/tokens';
import { createThemeService, type DseTokenName } from '../../../src/framework/seams/theme';

const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

/**
 * All --dse-* custom-property DEFINITIONS (not `var(--dse-*)` references) inside
 * top-level :root blocks. The leading [\s{;] guard excludes var() references (which
 * are preceded by "("); :root blocks in this sheet contain flat declarations only
 * (no nested braces), so the non-greedy [^}]* body capture is sound.
 */
function rootDseDefinitions(css: string): string[] {
	const defs: string[] = [];
	for (const block of css.matchAll(/:root\s*\{([^}]*)\}/g)) {
		for (const d of block[1].matchAll(/(?:^|[\s{;])--dse-([a-z0-9-]+)\s*:/g)) {
			defs.push(d[1]);
		}
	}
	return defs;
}

/** Trimmed value of a --dse-<name> definition inside the :root base (or undefined). */
function rootValue(name: string): string | undefined {
	for (const block of sheet.matchAll(/:root\s*\{([^}]*)\}/g)) {
		const m = block[1].match(new RegExp(`(?:^|[\\s{;])--dse-${name}\\s*:\\s*([^;]+);`));
		if (m) return m[1].trim();
	}
	return undefined;
}

describe('Plan 08 Task 1: --dse-* token vocabulary + Legacy defaults (D2 §6)', () => {
	test('every DseTokenName in the union has a --dse-<name> definition in the :root base', () => {
		const defined = new Set(rootDseDefinitions(sheet));
		const missing = DSE_TOKEN_NAMES.filter((n) => !defined.has(n));
		expect(missing).toEqual([]);
	});

	test('no duplicate --dse-* definitions in the :root base', () => {
		const defs = rootDseDefinitions(sheet);
		const seen = new Set<string>();
		const dups = defs.filter((n) => (seen.has(n) ? true : (seen.add(n), false)));
		expect(dups).toEqual([]);
	});

	test('no stray --dse-* definition in :root that the union does not know about', () => {
		const union = new Set<string>(DSE_TOKEN_NAMES);
		const stray = rootDseDefinitions(sheet).filter((n) => !union.has(n));
		expect(stray).toEqual([]);
	});

	test('Legacy is the BASE — no [data-dse-theme="legacy"] scope exists', () => {
		expect(sheet).not.toMatch(/\[data-dse-theme="legacy"\]/);
	});

	test('the union covers the full D2 §6 sheet (64 tokens: ~47 core + 12 roles + 6 actions)', () => {
		// 62 from Task 1 + the two Task-5 gap-closes (page-bg, badge-fg).
		expect(DSE_TOKEN_NAMES.length).toBe(64);
		// One representative per §6 group, so a whole group can't silently vanish.
		for (const key of [
			'surface', // structure / surface
			'fg', // text
			'accent', // accent / interaction
			'metal-grad', // steel ornament
			'tier-crit', // power-roll tiers
			'stamina-track', // stamina
			'malice', // encounter
			'role-leader', // combat-role accents
			'act-main', // action-type accents
		] as const) {
			expect(DSE_TOKEN_NAMES).toContain(key);
		}
	});

	test('key tokens pin their Legacy value verbatim (D2 §6 Legacy column)', () => {
		expect(rootValue('surface')).toBe('var(--code-background)');
		expect(rootValue('surface-raised')).toBe('var(--color-base-25)');
		expect(rootValue('fg')).toBe('var(--text-normal)');
		expect(rootValue('font-display')).toBe('var(--font-text)');
		expect(rootValue('accent')).toBe('var(--interactive-accent)');
		expect(rootValue('select')).toBe('#D50000');
		expect(rootValue('radius')).toBe('5px');
		expect(rootValue('touch-min')).toBe('44px');
		// Steel ornament: Legacy = flat/none (except the rule hairline color).
		expect(rootValue('metal-grad')).toBe('none');
		expect(rootValue('rule')).toBe('var(--icon-color)');
		// Semantic-game literals (the SC-5 colors, now named — the ONE place literals live).
		expect(rootValue('stamina-healthy')).toBe('limegreen');
		expect(rootValue('stamina-temp')).toBe('deepskyblue');
		expect(rootValue('stamina-track')).toBe('var(--code-background)');
		expect(rootValue('turn-done')).toBe('limegreen');
		expect(rootValue('danger')).toBe('crimson');
	});

	test('Task-5 gap-close tokens carry their Legacy values (page-bg, badge-fg)', () => {
		// The divider diamond punch-out must match the HOST PAGE background —
		// previously a bare var(--background-primary) in the kit CSS, now tokenized.
		expect(rootValue('page-bg')).toBe('var(--background-primary)');
		// Tier-badge text: Legacy .tN-key-body-text sets no color (inherits
		// --text-normal) — so badge-fg = the normal foreground token.
		expect(rootValue('badge-fg')).toBe('var(--dse-fg)');
	});

	test('role/action accents are monochrome in Legacy (OD-2: Steel-only color)', () => {
		for (const role of DSE_TOKEN_NAMES.filter((n) => n.startsWith('role-'))) {
			expect(rootValue(role)).toBe('var(--dse-fg-muted)');
		}
		for (const act of DSE_TOKEN_NAMES.filter((n) => n.startsWith('act-'))) {
			expect(rootValue(act)).toBe('none');
		}
	});

	test('ThemeService.cssVar resolves against the narrowed union', () => {
		const theme = createThemeService();
		// DseTokenName re-exported from seams/theme keeps the F1 import surface intact.
		const name: DseTokenName = 'accent';
		expect(theme.cssVar(name)).toBe('var(--dse-accent)');
		expect(theme.cssVar('stamina-healthy')).toBe('var(--dse-stamina-healthy)');
		// Validated by the real tsc gate (`npx tsc --noEmit`; ts-jest runs diagnostics:false).
		// @ts-expect-error — 'not-a-token' is not a DseTokenName
		theme.cssVar('not-a-token');
	});
});
