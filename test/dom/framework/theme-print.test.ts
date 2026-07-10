// D3 Plan 10 Task 5 — the print / export value layer + print RULES.
//
// Print is an ink-economy OVERRIDE layer that composes over whichever
// data-dse-theme is active (spec §5.2: the theme axis ⟂ the medium axis). Two
// delivery surfaces share one value block:
//   • @media print            — the real Ctrl-P / Export-to-PDF path
//   • [data-dse-print="on"]    — an on-screen export-PREVIEW twin (D4 toggles it)
//
// jsdom cannot apply @media print, so — following the plan's test focus — we
// assert the DECLARED values of the [data-dse-print="on"] TWIN (which shares the
// exact value block), assert the @media print surface exists in parallel, and
// assert the print RULES (force-open collapsibles, hide interactive chrome,
// break-inside, print-color-adjust) are present with the REAL kit class names.
//
// Scoping (map's Print-layer caveat): the NEUTRAL block (surfaces→white,
// fg→near-black, ornament off, borders→grey, + the always-rendered semantics
// tier-*/stamina-*/encounter) applies to BOTH themes. role-*/act-* spines are
// Steel-only meaning (Legacy draws grey/no spine), so their print values are
// SCOPED to [data-dse-theme="steel"] — a Legacy print stays monochrome.
import * as fs from 'fs';
import * as path from 'path';
import { DSE_TOKEN_NAMES } from '../../../src/framework/tokens';

const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

/** Body of the NEUTRAL preview twin `[data-dse-element][data-dse-print="on"]`. */
function printNeutralBody(): string {
	const m = sheet.match(
		/(?:^|\n)[ \t]*\[data-dse-element\]\[data-dse-print="on"\][ \t]*\{([^}]*)\}/,
	);
	if (!m) throw new Error('neutral print twin [data-dse-print="on"] not found in styles-source.css');
	return m[1];
}

/** Body of the STEEL-scoped preview twin (role/act spines print only under Steel). */
function printSteelBody(): string {
	const m = sheet.match(
		/\[data-dse-element\]\[data-dse-theme="steel"\]\[data-dse-print="on"\][ \t]*\{([^}]*)\}/,
	);
	if (!m) throw new Error('steel-scoped print twin not found in styles-source.css');
	return m[1];
}

/** Body of the @media print NEUTRAL value block `@media print { [data-dse-element] { … } }`. */
function printMediaNeutralBody(): string {
	const m = sheet.match(/@media print\s*\{\s*\[data-dse-element\]\s*\{([^}]*)\}\s*\}/);
	if (!m) throw new Error('@media print { [data-dse-element] } value block not found');
	return m[1];
}

function valueIn(body: string, name: string): string | undefined {
	const m = body.match(new RegExp(`(?:^|[\\s{;])--dse-${name}\\s*:\\s*([^;]+);`));
	return m ? m[1].trim() : undefined;
}
function defsIn(body: string): string[] {
	const defs: string[] = [];
	for (const d of body.matchAll(/(?:^|[\s{;])--dse-([a-z0-9-]+)\s*:/g)) defs.push(d[1]);
	return defs;
}

/** The 42 NEUTRAL print tokens (both themes) — transcribed from the map's Print column. */
const PRINT_NEUTRAL: Record<string, string> = {
	// surfaces → white
	surface: '#fff',
	'surface-raised': '#fff',
	'surface-sunken': '#fff',
	'page-bg': '#fff',
	// borders → grey hairlines, shape flat
	border: '#ccc',
	'border-strong': '#999',
	radius: '0',
	pad: '0.4em',
	hover: 'transparent',
	'hairline-fade': 'none',
	// text → near-black grades
	heading: '#000',
	fg: '#000',
	'fg-muted': '#333',
	'fg-faint': '#666',
	'chip-bg': 'transparent',
	// accent → ink
	accent: '#000',
	'accent-fg': '#fff',
	'focus-ring': '#333',
	select: '#000',
	// ornament → OFF
	'metal-grad': 'none',
	'metal-line': 'none',
	'metal-faint': 'none',
	bevel: 'none',
	emboss: 'none',
	'card-bg': 'none',
	'crest-shape': 'none',
	rule: '#bbb',
	// tiers (meaning-bearing → darkened legible)
	'tier-low': '#c0392b',
	'tier-mid': '#b9770e',
	'tier-high': '#1e8449',
	'tier-crit': '#8a6a00',
	// stamina
	'stamina-healthy': '#1a7a3a',
	'stamina-winded': '#8a6a00',
	'stamina-dying': '#a11',
	'stamina-temp': '#555',
	'stamina-track': '#fff',
	// encounter
	'turn-done': '#1a7a3a',
	malice: '#a11',
	vp: '#8a6a00',
	warn: '#8a5a00',
	danger: '#a11',
};

/** The 6 STEEL-scoped print tokens (act spines darkened, Steel-composed). */
const PRINT_STEEL: Record<string, string> = {
	'act-main': '#c0392b',
	'act-maneuver': '#7d3c98',
	'act-triggered': '#b9770e',
	'act-move': '#2874a6',
	'act-none': '#148f77',
	'act-trait': '#7b8a8b',
};

/** Tokens intentionally NOT overridden in print (= Legacy / = active theme / = Steel exact). */
const PRINT_INVARIANT = [
	'touch-min', // = Legacy (print rules hide the controls it sizes)
	'font-display', // = active theme (no font override in print)
	'font-mono', // = Legacy
	'rule-fade', // = Legacy (theme-invariant)
	'badge-fg', // = Legacy ink-on-surface (hollow frame; print --dse-fg is #000) — SC-10
	// role-* (12): "= Steel (exact)" — keep the Steel hue, no darkening (added below)
	...DSE_TOKEN_NAMES.filter((n) => n.startsWith('role-')),
] as const;

describe('D3 Task 5: print / export value layer', () => {
	test('BOTH delivery surfaces exist: @media print AND the [data-dse-print="on"] twin', () => {
		expect(sheet).toMatch(/@media print\s*\{/);
		expect(sheet).toMatch(/\[data-dse-element\]\[data-dse-print="on"\]\s*\{/);
	});

	test('the neutral twin carries the Print column values VERBATIM', () => {
		const body = printNeutralBody();
		for (const [name, expected] of Object.entries(PRINT_NEUTRAL)) {
			expect(valueIn(body, name)).toBe(expected);
		}
	});

	test('the neutral twin defines EXACTLY the 41 neutral tokens (none invariant, none act)', () => {
		const defs = defsIn(printNeutralBody());
		expect(new Set(defs)).toEqual(new Set(Object.keys(PRINT_NEUTRAL)));
		expect(defs.length).toBe(41); // SC-10: badge-fg no longer print-overridden
		// The Steel-scoped act tokens are NOT in the neutral block…
		for (const act of Object.keys(PRINT_STEEL)) expect(defs).not.toContain(act);
		// …nor are the print-invariant tokens.
		for (const inv of PRINT_INVARIANT) expect(defs).not.toContain(inv);
	});

	test('the Steel-scoped twin darkens the 6 act spines (Steel-composed, exact)', () => {
		const body = printSteelBody();
		for (const [name, expected] of Object.entries(PRINT_STEEL)) {
			expect(valueIn(body, name)).toBe(expected);
		}
		expect(defsIn(body).length).toBe(6);
	});

	test('the @media print neutral block MIRRORS the twin (representative decls)', () => {
		const media = printMediaNeutralBody();
		for (const name of ['surface', 'fg', 'border', 'radius', 'hover', 'metal-grad', 'tier-low', 'stamina-dying']) {
			expect(valueIn(media, name)).toBe(PRINT_NEUTRAL[name]);
		}
	});

	test('representative ink-economy values: surfaces white, fg black, ornament off, borders grey', () => {
		const body = printNeutralBody();
		expect(valueIn(body, 'surface')).toBe('#fff');
		expect(valueIn(body, 'fg')).toBe('#000');
		expect(valueIn(body, 'metal-grad')).toBe('none');
		expect(valueIn(body, 'bevel')).toBe('none');
		expect(valueIn(body, 'emboss')).toBe('none');
		expect(valueIn(body, 'hover')).toBe('transparent');
		expect(valueIn(body, 'radius')).toBe('0');
		expect(valueIn(body, 'border')).toBe('#ccc');
	});
});

describe('D3 Task 5: print RULES (real kit class names, verified by grep)', () => {
	test('collapsibles are FORCE-OPEN and their chevron hidden', () => {
		// The base kit hides `.dse-collapse__region[hidden]`; print overrides it open.
		expect(sheet).toMatch(/\.dse-collapse__region\[hidden\]\s*\{\s*display:\s*block\s*!important/);
		expect(sheet).toMatch(/\.dse-collapse__chevron\s*\{\s*display:\s*none/);
	});

	test('interactive-only chrome is hidden (.dse-btn / tab bar / add-condition / toggles)', () => {
		// A single display:none rule-list containing every interactive-only kit class.
		const rule = sheet.match(/@media print\s*\{[\s\S]*?\}\s*\}/g)?.join('\n') ?? sheet;
		for (const cls of ['.dse-btn', '.dse-tabs__list', '.dse-cond--add', '.dse-cond-item__toggle', '.dse-cond-item__cog']) {
			expect(sheet.includes(cls)).toBe(true);
		}
		// …grouped into a display:none block (real classes present in a hide rule).
		expect(sheet).toMatch(/\.dse-btn[\s\S]{0,200}display:\s*none/);
	});

	test('page-break hygiene: break-inside avoid on element roots + cards / rolls / char rows', () => {
		expect(sheet).toMatch(/break-inside:\s*avoid/);
		for (const cls of ['[data-dse-element]', '.dse-feature', '.dse-pr', '.dse-statgrid']) {
			// each appears in a break-inside rule (loosely — same declaration block)
			expect(sheet).toContain(cls);
		}
		const breakRule = sheet.match(/[^}]*break-inside:\s*avoid[^}]*\}/)?.[0] ?? '';
		expect(breakRule).toContain('[data-dse-element]');
		expect(breakRule).toMatch(/\.dse-feature|\.dse-pr|\.dse-statgrid/);
	});

	test('meaning-bearing color prints exactly (tier badges + stamina fills + steel spines)', () => {
		expect(sheet).toMatch(/print-color-adjust:\s*exact/);
		// tier badges + stamina fills in the neutral exact rule
		const exactRules = sheet.match(/[^}]*print-color-adjust:\s*exact[^}]*\}/g)?.join('\n') ?? '';
		expect(exactRules).toContain('.dse-pr__badge');
		expect(exactRules).toContain('.dse-stamina__fill');
		// act/role spines print exactly ONLY under Steel (scoping caveat)
		expect(exactRules).toContain('[data-dse-theme="steel"]');
		expect(exactRules).toMatch(/\.dse-feature\[data-dse-act\]::before|\.dse-fb/);
	});
});

describe('D3 Task 5: print composes over whichever theme is active (orthogonal axes)', () => {
	test('the neutral twin matches a print root REGARDLESS of theme (both Legacy and Steel)', () => {
		const legacy = document.createElement('div');
		legacy.setAttribute('data-dse-element', 'statblock');
		legacy.dataset.dsePrint = 'on';
		// Legacy print root (no theme attr) matches the neutral twin.
		expect(legacy.matches('[data-dse-element][data-dse-print="on"]')).toBe(true);
		// …but NOT the Steel-scoped one (its roles/acts stay monochrome).
		expect(
			legacy.matches('[data-dse-element][data-dse-theme="steel"][data-dse-print="on"]'),
		).toBe(false);

		const steel = document.createElement('div');
		steel.setAttribute('data-dse-element', 'statblock');
		steel.dataset.dseTheme = 'steel';
		steel.dataset.dsePrint = 'on';
		// A Steel print root matches BOTH the neutral twin AND the Steel-scoped one.
		expect(steel.matches('[data-dse-element][data-dse-print="on"]')).toBe(true);
		expect(
			steel.matches('[data-dse-element][data-dse-theme="steel"][data-dse-print="on"]'),
		).toBe(true);
	});

	test('without data-dse-print, an element matches NEITHER print twin', () => {
		const el = document.createElement('div');
		el.setAttribute('data-dse-element', 'statblock');
		el.dataset.dseTheme = 'steel';
		expect(el.matches('[data-dse-element][data-dse-print="on"]')).toBe(false);
		expect(
			el.matches('[data-dse-element][data-dse-theme="steel"][data-dse-print="on"]'),
		).toBe(false);
	});
});
