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
// Steel-only meaning (the unscoped base draws grey/no spine), so their print values are
// SCOPED to [data-dse-theme="steel"]. SC-144 left that split in place deliberately: print
// is an ORTHOGONAL axis, not a theme, and the neutral arm is what a print root gets with
// no theme attribute at all — see the neutral-twin test below.
import * as fs from 'fs';
import * as path from 'path';
import { DSE_TOKEN_NAMES } from '../../../src/framework/tokens';

const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

// SC-170: every print SELECTOR below repeats an attribute on purpose — it is padded to
// specificity (0,4,0) so it outranks both Steel token blocks (see the "SPECIFICITY" suite
// at the bottom of this file, and the long comment on the print layer in
// styles-source.css). The regexes therefore match the padded spellings; a rebuild that
// drops a repeat fails here AND in the arithmetic suite.
const NEUTRAL_TWIN_SELECTOR =
	'[data-dse-element][data-dse-print="on"][data-dse-print="on"][data-dse-print="on"]';
const NEUTRAL_MEDIA_SELECTOR =
	'[data-dse-element][data-dse-element][data-dse-element][data-dse-element]';
const STEEL_TWIN_SELECTOR =
	':is([data-dse-element], .dse-modal)[data-dse-theme="steel"][data-dse-print="on"][data-dse-print]';
const STEEL_MEDIA_SELECTOR =
	':is([data-dse-element], .dse-modal)[data-dse-theme="steel"][data-dse-theme][data-dse-theme]';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Body of the NEUTRAL preview twin (the `[data-dse-print="on"]` surface). */
function printNeutralBody(): string {
	// FOOTGUN: `[^}]*` stops at the FIRST brace, so a CSS COMMENT containing `{` or `}`
	// inside any token block silently truncates that block's body (values → undefined).
	const m = sheet.match(new RegExp(`(?:^|\\n)[ \\t]*${esc(NEUTRAL_TWIN_SELECTOR)}[ \\t]*\\{([^}]*)\\}`));
	if (!m) throw new Error('neutral print twin [data-dse-print="on"] not found in styles-source.css');
	return m[1];
}

/** Body of the STEEL-scoped preview twin (role/act spines print only under Steel).
 *  Selector widened by SC-104 / FOLLOWUPS #31 (from the bare-presence
 *  `[data-dse-element]`) so modals also resolve these Steel print values. */
function printSteelBody(): string {
	const m = sheet.match(new RegExp(`${esc(STEEL_TWIN_SELECTOR)}[ \\t]*\\{([^}]*)\\}`));
	if (!m) throw new Error('steel-scoped print twin not found in styles-source.css');
	return m[1];
}

/** Body of the @media print NEUTRAL value block. */
function printMediaNeutralBody(): string {
	const m = sheet.match(new RegExp(`@media print\\s*\\{\\s*${esc(NEUTRAL_MEDIA_SELECTOR)}\\s*\\{([^}]*)\\}\\s*\\}`));
	if (!m) throw new Error('@media print neutral value block not found');
	return m[1];
}

/** Body of the @media print STEEL-scoped (act spine) value block. Unlike the neutral one,
 *  a block comment sits between `@media print {` and the selector, so the pattern allows
 *  it. */
function printMediaSteelBody(): string {
	const m = sheet.match(
		new RegExp(`@media print\\s*\\{(?:\\s*/\\*[\\s\\S]*?\\*/)?\\s*${esc(STEEL_MEDIA_SELECTOR)}\\s*\\{([^}]*)\\}\\s*\\}`),
	);
	if (!m) throw new Error('@media print Steel act value block not found');
	return m[1];
}

/** property → value for every custom property declared in a rule body, comments stripped
 *  (a comment quoting a declaration must not count as one). */
function declMap(body: string): Record<string, string> {
	const out: Record<string, string> = {};
	const code = body.replace(/\/\*[\s\S]*?\*\//g, '');
	for (const m of code.matchAll(/(?:^|[\s{;])(--dse-[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
	return out;
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
	// SC-112 Task 3: pinned explicitly so the Controls-slot serif flip (Steel
	// screen) can't leak into the frozen *--steel-print.png set — no longer
	// print-invariant (moved out of PRINT_INVARIANT below).
	'font-controls': 'var(--font-text)',
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
	// Plan 20 Task 3 — the material layer is OFF on paper (ink on white).
	metal: 'inherit',
	'metal-bright': 'inherit',
	sheen: 'none',
	'sheen-soft': 'none',
	'chip-bevel': 'none',
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

/** The 7 STEEL-scoped print tokens (act spines darkened, Steel-composed). */
const PRINT_STEEL: Record<string, string> = {
	// SC-10 realignment: print act twins = the site's light --sc-act-* values.
	'act-main': '#c0392b',
	'act-maneuver': '#2874a6',
	'act-triggered': '#1e8449',
	'act-move': '#b9770e',
	'act-none': '#5a6368',
	'act-trait': '#7d3c98',
	// SC-102: the seventh act spine, and the ONE print twin with no site value
	// behind it — the other six copy the site's light --sc-act-* column, but the
	// site's villain red (#e0584b) is scheme-invariant, so there is nothing to
	// copy. #b03a2e is the plugin's own contrast/ink-economy darkening for paper,
	// recorded here as the deliberate divergence it is. In LIGHT the token stays
	// #e0584b (light-stable, like --dse-role-controller) — see theme-steel.test.ts.
	'act-villain': '#b03a2e',
};

/** Tokens intentionally NOT overridden in print (= base / = active theme / = Steel exact). */
const PRINT_INVARIANT = [
	'touch-min', // = base (print rules hide the controls it sizes)
	// SC-105 Task 2: font-display retired — the remaining print-invariant font
	// slots (bar font-mono, listed separately below) stay = active theme, no
	// font override in print. SC-112 Task 3: font-controls LEAVES this set — it
	// now gets an explicit print pin (PRINT_NEUTRAL above) to hold the freeze.
	'font-title', 'font-body', 'font-card-body', 'font-label',
	'font-mono', // = base
	'rule-fade', // = base (theme-invariant)
	'badge-fg', // = base ink-on-surface (hollow frame; print --dse-fg is #000) — SC-10
	// SC-112 Task 7: the scale tokens need no print VALUE override — their
	// consumer rules are print-excluded (:not([data-dse-print="on"])), so print
	// always renders 1:1 whatever the sliders say.
	'text-scale', 'card-scale',
	// role-* (12): "= Steel (exact)" — keep the Steel hue, no darkening (added below)
	...DSE_TOKEN_NAMES.filter((n) => n.startsWith('role-')),
] as const;

describe('D3 Task 5: print / export value layer', () => {
	test('BOTH delivery surfaces exist: @media print AND the [data-dse-print="on"] twin', () => {
		expect(sheet).toMatch(/@media print\s*\{/);
		expect(sheet).toContain(NEUTRAL_TWIN_SELECTOR);
	});

	test('the neutral twin carries the Print column values VERBATIM', () => {
		const body = printNeutralBody();
		for (const [name, expected] of Object.entries(PRINT_NEUTRAL)) {
			expect(valueIn(body, name)).toBe(expected);
		}
	});

	test('the neutral twin defines EXACTLY the 47 neutral tokens (none invariant, none act)', () => {
		const defs = defsIn(printNeutralBody());
		expect(new Set(defs)).toEqual(new Set(Object.keys(PRINT_NEUTRAL)));
		// SC-10: badge-fg no longer print-overridden; Plan 20 Task 3: +5 material;
		// SC-112 Task 3: +1 (font-controls print pin) = 46 → 47.
		expect(defs.length).toBe(47);
		// The Steel-scoped act tokens are NOT in the neutral block…
		for (const act of Object.keys(PRINT_STEEL)) expect(defs).not.toContain(act);
		// …nor are the print-invariant tokens.
		for (const inv of PRINT_INVARIANT) expect(defs).not.toContain(inv);
	});

	test('the Steel-scoped twin darkens the 7 act spines (Steel-composed, exact)', () => {
		const body = printSteelBody();
		for (const [name, expected] of Object.entries(PRINT_STEEL)) {
			expect(valueIn(body, name)).toBe(expected);
		}
		// SC-102: +act-villain (6 → 7).
		expect(defsIn(body).length).toBe(7);
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

// SC-170 — the print layer only neutralizes a token if it OUTRANKS the theme block that
// also declares it. It did not: the neutral @media print block was a bare
// `[data-dse-element]` (0,1,0) against Steel's (0,2,0) / (0,3,0), so every token Steel
// redefines survived into real Ctrl-P / Export-to-PDF (the gradient card plate, the
// border, the radius, the bevel) and the preview twin — (0,2,0), winning over dark Steel
// on source order alone — was ALSO wrong under `.theme-light`.
//
// These are the arithmetic, asserted on the real sheet. They can fail: delete one
// repeated attribute from any print selector in styles-source.css and the matching case
// goes red with the exact numbers.
describe('SC-170: the print layer outranks every theme token block', () => {
	/** CSS specificity of a *simple* selector list entry, as (ids, classes+attrs+pseudos,
	 *  types). Only the shapes this sheet actually uses; `:is(...)` contributes its most
	 *  specific argument (all args here are single attributes/classes → one unit). */
	function specificity(sel: string): [number, number, number] {
		let rest = sel;
		let cls = 0;
		// :is(a, b) → max over args; every arg in this sheet is one attribute or class.
		rest = rest.replace(/:is\([^)]*\)/g, () => {
			cls += 1;
			return '';
		});
		cls += (rest.match(/\[[^\]]*\]/g) ?? []).length;
		rest = rest.replace(/\[[^\]]*\]/g, '');
		cls += (rest.match(/\.[A-Za-z_-][\w-]*/g) ?? []).length;
		const ids = (rest.match(/#[A-Za-z_-][\w-]*/g) ?? []).length;
		return [ids, cls, 0];
	}
	const rank = ([a, b, c]: [number, number, number]) => a * 10000 + b * 100 + c;

	/** The two blocks that declare Steel's token values on an element root. */
	const STEEL_DARK = ':is([data-dse-element], .dse-modal)[data-dse-theme="steel"]';
	const STEEL_LIGHT = '.theme-light :is([data-dse-element], .dse-modal)[data-dse-theme="steel"]';

	test('the sheet still contains both Steel token blocks at the specificities assumed here', () => {
		expect(sheet).toContain(`\n${STEEL_DARK} {`);
		expect(sheet).toContain(`\n${STEEL_LIGHT} {`);
		expect(specificity(STEEL_DARK)).toEqual([0, 2, 0]);
		// The descendant `.theme-light` is what made this the block the print layer lost to.
		expect(specificity(STEEL_LIGHT)).toEqual([0, 3, 0]);
	});

	test.each([
		['neutral @media print', NEUTRAL_MEDIA_SELECTOR],
		['neutral preview twin', NEUTRAL_TWIN_SELECTOR],
		['Steel act @media print', STEEL_MEDIA_SELECTOR],
		['Steel act preview twin', STEEL_TWIN_SELECTOR],
	])('%s outranks BOTH Steel token blocks', (_label, selector) => {
		expect(sheet).toContain(selector);
		// SC-170 review (L-4): the exact tuple, not just the comparison. The realprint shot
		// class resolves through the JS stamp (printMedia.ts), so no PNG anywhere proves the
		// padding is still there — this is the structural pin for fix (a), and the reason a
		// dropped repeat cannot pass unnoticed even though every capture stays green.
		expect(specificity(selector)).toEqual([0, 4, 0]);
		expect(rank(specificity(selector))).toBeGreaterThan(rank(specificity(STEEL_DARK)));
		expect(rank(specificity(selector))).toBeGreaterThan(rank(specificity(STEEL_LIGHT)));
	});

	// SC-170 review fix (M-3). The print scheme is written TWICE in the sheet — once under
	// `@media print` and once for the `[data-dse-print="on"]` twin — and nothing compared
	// them. They had already drifted: the neutral `@media print` copy was missing
	// `--dse-font-controls` (46 declarations vs 47) from SC-112 Task 3 until this fix.
	//
	// Byte gates cannot see this. Once watchPrintMedia stamps the attribute, the twin block
	// wins on source order at equal specificity, so the `@media print` copy no longer
	// paints anything the harness photographs — a wrong value there is invisible to jest,
	// to the freeze check and to the print-twin parity assertion alike (proven: mutating a
	// value in either copy left all three green). These two tests are the only thing
	// standing between the copies and silent divergence, so they compare the FULL
	// declaration map, property and value, not a representative sample.
	test.each([
		['neutral', () => printMediaNeutralBody(), () => printNeutralBody()],
		['Steel act', () => printMediaSteelBody(), () => printSteelBody()],
	])('%s: the @media print copy and the preview twin declare exactly the same thing', (_label, media, twin) => {
		expect(declMap(media())).toEqual(declMap(twin()));
	});

	test('no print value block wins by !important (the font prefs must still apply on paper)', () => {
		// The prefs catalog promises a chosen font "applies everywhere, including print and
		// export"; those are inline custom properties on the root, which an !important
		// print declaration would beat. Specificity is the sanctioned lever here.
		expect(printNeutralBody()).not.toContain('!important');
		expect(printMediaNeutralBody()).not.toContain('!important');
		expect(printSteelBody()).not.toContain('!important');
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
		// SC-146 fix 7 added an UNRELATED `break-inside: avoid` (CSS multi-column
		// break, not print page-break) on the sb-columns='wide' arm, earlier in
		// the sheet than this one — so the print rule must be found INSIDE
		// @media print, not by "first break-inside in the file" (that grabbed
		// the wide-columns rule instead once it existed).
		const printBlock = sheet.match(/@media print\s*\{[\s\S]*?\}\s*\}/g)?.join('\n') ?? '';
		const breakRule = printBlock.match(/[^}]*break-inside:\s*avoid[^}]*\}/)?.[0] ?? '';
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
	test('the neutral twin matches a print root with NO theme attribute, as well as a Steel one', () => {
		const unthemed = document.createElement('div');
		unthemed.setAttribute('data-dse-element', 'statblock');
		unthemed.dataset.dsePrint = 'on';
		// A print root with no theme attribute at all matches the neutral twin.
		expect(unthemed.matches('[data-dse-element][data-dse-print="on"]')).toBe(true);
		// …but NOT the Steel-scoped one (its roles/acts stay monochrome).
		expect(
			unthemed.matches('[data-dse-element][data-dse-theme="steel"][data-dse-print="on"]'),
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
