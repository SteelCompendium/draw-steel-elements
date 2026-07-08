// Plan 08 Task 5 — the D2 kit foundation tie-off:
//   1. the barrel (src/framework/kit/index.ts) exports every D2 widget (the F1-era
//      helpers were retired by Plan 09 Task 10), importable via the `@/` alias
//      (`@/framework/kit`); there is NO `@framework` alias in tsconfig — `@/*` ->
//      `src/*` is the path.
//   2. the ONE framework-default :focus-visible rule (D2 §4.5) covers every kit
//      control class that takes focus.
//   3. the two token gap-closes landed: --dse-page-bg (divider punch-out) and
//      --dse-badge-fg (tier-badge text) — consumers repointed, no fallbacks left.
//   4. the kit CSS SECTION of styles-source.css ships zero color literals
//      (hex / rgb() / hsl() / hwb() / lab() / lch() / oklab() / oklch() / color()
//      / named colors) — the :root token base + legacy CSS are exempt (that's
//      where Legacy literals legitimately live).
//   5. the whole src/framework/kit/ TS ships zero color literals, zero
//      `el.style.color`, and never imports from src/elements/ (F1 OD-8 boundary).
import * as fs from 'fs';
import * as path from 'path';
import * as kit from '@/framework/kit';
import type {
	IconButtonHandle,
	ButtonRowHandle,
	StepperHandle,
	DividerHandle,
	CollapsibleHandle,
	TabsHandle,
	CardHeadHandle,
	PowerRollPanelHandle,
	CrestHandle,
	SessionPersist,
} from '@/framework/kit';

const repoRoot = path.join(__dirname, '../../..');
const sheet = fs.readFileSync(path.join(repoRoot, 'styles-source.css'), 'utf8');
const kitDir = path.join(repoRoot, 'src/framework/kit');

/* ------------------------------------------------------------------ */
/* Section extraction + scanners (shared by the hygiene tests below)  */
/* ------------------------------------------------------------------ */

const KIT_CSS_START = 'framework/kit control primitives';
const KIT_CSS_END = 'END framework/kit';

/** The kit-authored CSS section: first Task-2 kit banner -> the END delimiter. */
function kitCssSection(css: string): string {
	const start = css.indexOf(KIT_CSS_START);
	const end = css.indexOf(KIT_CSS_END);
	if (start === -1 || end === -1 || end <= start) {
		throw new Error('kit CSS banner/delimiter not found — did the section markers move?');
	}
	return css.slice(start, end);
}

function stripComments(src: string): string {
	return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

// The CSS named-color keywords (Color Module L4 extended keywords + rebeccapurple).
const NAMED_COLORS = new Set([
	'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque',
	'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood',
	'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk',
	'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray',
	'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen',
	'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
	'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise',
	'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue',
	'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro',
	'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey',
	'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender',
	'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral',
	'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey',
	'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
	'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen',
	'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue',
	'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue',
	'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue',
	'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace',
	'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod',
	'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff',
	'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red',
	'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen',
	'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray',
	'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle',
	'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow',
	'yellowgreen',
]);

// Non-color paint keywords that are always fine (D2 §5 whitelist).
const ALLOWED_KEYWORDS = new Set(['transparent', 'inherit', 'currentcolor', 'none']);

/**
 * Scans (comment-stripped) CSS declarations for color LITERALS: hex, the color
 * functions (rgb()/hsl()/hwb()/lab()/lch()/oklab()/oklch()/color() — Plan 09
 * Task 0 widened past rgb/hsl), and named-color keywords. Standalone alphabetic
 * value tokens only — pieces of hyphenated identifiers (linear-gradient,
 * tabular-nums) and function names (polygon(, calc(), color-mix() via its own
 * literal args) never match, and var(--dse-*) references pass untouched.
 */
function cssColorLiteralFindings(css: string): string[] {
	const findings: string[] = [];
	for (const m of stripComments(css).matchAll(/([-\w]+)\s*:\s*([^;{}]+)/g)) {
		const prop = m[1];
		const value = m[2].trim();
		const at = `${prop}: ${value}`;
		if (/#[0-9a-fA-F]{3,8}\b/.test(value)) findings.push(`${at}  <- hex literal`);
		if (/\b(?:(?:rgb|hsl)a?|hwb|lab|lch|oklab|oklch|color)\s*\(/i.test(value)) {
			findings.push(`${at}  <- color-function literal`);
		}
		for (const tok of value.matchAll(/(?<![\w-])[a-zA-Z]+(?![\w(-])/g)) {
			const word = tok[0].toLowerCase();
			if (ALLOWED_KEYWORDS.has(word)) continue;
			if (NAMED_COLORS.has(word)) findings.push(`${at}  <- named color '${word}'`);
		}
	}
	return findings;
}

/** Color-literal + inline-style-color findings in kit TypeScript source. */
function tsColorFindings(src: string): string[] {
	const findings: string[] = [];
	const code = stripComments(src).replace(/\/\/[^\n]*/g, '');
	if (/#[0-9a-fA-F]{3,8}\b/.test(code)) findings.push('hex color literal');
	// Mirror the CSS scanner's color-function coverage (the modern families too) so a
	// kit TS literal can't slip a color the CSS scan would have caught.
	if (/\b(?:(?:rgb|hsl)a?|hwb|lab|lch|oklab|oklch|color)\s*\(/i.test(code)) {
		findings.push('color-function literal');
	}
	if (/\.style\.color\b/.test(code)) findings.push('el.style.color inline style');
	if (/\.style\.(?:background|backgroundColor|borderColor|fill|outline)\b/.test(code)) {
		findings.push('inline color-ish style assignment');
	}
	return findings;
}

/* ------------------------------------------------------------------ */
/* 1. The barrel                                                       */
/* ------------------------------------------------------------------ */

describe('Plan 08 Task 5: kit barrel (@/framework/kit)', () => {
	test('exports every D2 widget mount; the retired F1 helpers are GONE (Task 10)', () => {
		// D2 §2 widgets (Tasks 2-4)…
		expect(typeof kit.iconButton).toBe('function');
		expect(typeof kit.buttonRow).toBe('function');
		expect(typeof kit.stepper).toBe('function');
		expect(typeof kit.tooltip).toBe('function');
		expect(typeof kit.divider).toBe('function');
		expect(typeof kit.collapsible).toBe('function');
		expect(typeof kit.tabs).toBe('function');
		expect(typeof kit.DseModal).toBe('function'); // class
		expect(typeof kit.openManagedModal).toBe('function');
		expect(typeof kit.cardHead).toBe('function');
		expect(typeof kit.powerRollPanel).toBe('function');
		expect(typeof kit.tierBadge).toBe('function');
		expect(typeof kit.crest).toBe('function');
		// …and the retired F1 helpers are no longer on the barrel (Plan 09 Task 10).
		expect((kit as Record<string, unknown>).mountCollapsibleHeading).toBeUndefined();
		expect((kit as Record<string, unknown>).mountComponentWrapper).toBeUndefined();
	});

	test('exports the Handle types (compile-time — the real gate is `npx tsc --noEmit`)', () => {
		// Using every imported Handle type in a type position proves the type
		// re-exports resolve; ts-jest runs diagnostics:false so tsc is the enforcer.
		const probe: {
			a?: IconButtonHandle; b?: ButtonRowHandle; c?: StepperHandle;
			d?: DividerHandle; e?: CollapsibleHandle; f?: TabsHandle;
			g?: CardHeadHandle; h?: PowerRollPanelHandle; i?: CrestHandle;
			// SessionPersist stays a barrel export after its move to framework/session
			// (Plan 09 Task 0 — neutral home; it survived the Task 10 widget rename).
			l?: SessionPersist;
		} = {};
		expect(probe).toEqual({});
	});
});

/* ------------------------------------------------------------------ */
/* 2. The framework-default :focus-visible rule (D2 §4.5)              */
/* ------------------------------------------------------------------ */

describe('Plan 08 Task 5: framework-default :focus-visible (D2 §4.5)', () => {
	// The one shared rule: every kit control class that takes focus, one ring.
	const FOCUSABLE_KIT_CONTROLS = [
		'.dse-btn:focus-visible',
		'.dse-stepper__btn:focus-visible',
		'.dse-stepper__input:focus-visible',
		'.dse-collapse__header:focus-visible',
		'.dse-tabs__tab:focus-visible',
		'.dse-pr__row[aria-checked]:focus-visible',
	];

	function focusRule(): { selector: string; body: string } | undefined {
		for (const m of stripComments(sheet).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
			if (m[1].includes(':focus-visible') && m[2].includes('--dse-focus-ring')) {
				return { selector: m[1], body: m[2] };
			}
		}
		return undefined;
	}

	test('one rule covers every focusable kit control with the token ring', () => {
		const rule = focusRule();
		expect(rule).toBeDefined();
		for (const sel of FOCUSABLE_KIT_CONTROLS) {
			expect(rule!.selector).toContain(sel);
		}
		expect(rule!.body).toMatch(/outline:\s*2px solid var\(--dse-focus-ring\)/);
		expect(rule!.body).toMatch(/outline-offset:\s*2px/);
	});

	test('the standalone Task-4 .dse-pr__row focus rule was consolidated (no duplicate ring)', () => {
		const rings = stripComments(sheet).match(/outline:\s*2px solid var\(--dse-focus-ring\)/g) ?? [];
		expect(rings).toHaveLength(1);
	});
});

/* ------------------------------------------------------------------ */
/* 3. Token gap-closes: --dse-page-bg + --dse-badge-fg repoints         */
/* ------------------------------------------------------------------ */

describe('Plan 08 Task 5: token gap-close repoints', () => {
	test('divider diamond punch-out keys off --dse-page-bg (not bare --background-primary)', () => {
		const kitCss = kitCssSection(sheet);
		const diamond = kitCss.match(/\.dse-hr__diamond\s*\{([^}]*)\}/);
		expect(diamond).not.toBeNull();
		expect(diamond![1]).toContain('var(--dse-page-bg)');
		// The Obsidian variable now enters ONLY via the :root token base.
		expect(stripComments(kitCss)).not.toContain('--background-primary');
	});

	test('tier-badge text color is var(--dse-badge-fg) — the fallback is gone', () => {
		const kitCss = kitCssSection(sheet);
		const badge = kitCss.match(/\.dse-pr__badge\s*\{([^}]*)\}/);
		expect(badge).not.toBeNull();
		expect(badge![1]).toMatch(/color:\s*var\(--dse-badge-fg\);/);
		expect(kitCss).not.toContain('var(--dse-badge-fg,');
	});
});

/* ------------------------------------------------------------------ */
/* 4. Kit CSS section: zero color literals (D2 §5)                     */
/* ------------------------------------------------------------------ */

describe('Plan 08 Task 5: kit CSS section literal-scan (D2 §5)', () => {
	test('the kit CSS section (Task-2 banner -> END delimiter) has zero color literals', () => {
		expect(cssColorLiteralFindings(kitCssSection(sheet))).toEqual([]);
	});

	// Discrimination proofs — the scanner CATCHES each literal family…
	test.each([
		['hex', '.dse-x { color: #ff0000; }'],
		['hex shorthand', '.dse-x { border: 1px solid #f00; }'],
		['rgb()', '.dse-x { background: rgb(10, 20, 30); }'],
		['rgba()', '.dse-x { background: rgba(0,0,0,.2); }'],
		['hsl()', '.dse-x { color: hsl(120 50% 50%); }'],
		// The modern color-function families (Plan 09 Task 0 widening):
		['hwb()', '.dse-x { color: hwb(120 10% 10%); }'],
		['lab()', '.dse-x { color: lab(52% 40 59); }'],
		['lch()', '.dse-x { color: lch(52% 72 50); }'],
		['oklab()', '.dse-x { color: oklab(0.7 0.1 0.1); }'],
		['oklch()', '.dse-x { color: oklch(0.7 0.1 200); }'],
		['color()', '.dse-x { background: color(display-p3 1 0 0); }'],
		['named color', '.dse-x { background: red; }'],
		['named color in shorthand', '.dse-x { border: 2px solid limegreen; }'],
	])('catches an injected %s literal', (_family, css) => {
		expect(cssColorLiteralFindings(css)).not.toEqual([]);
	});

	// …and PASSES the whitelisted keywords + token references.
	test.each([
		['transparent', '.dse-x { background: transparent; }'],
		['inherit', '.dse-x { color: inherit; }'],
		['currentColor', '.dse-x { border-color: currentColor; }'],
		['none', '.dse-x { background: none; }'],
		['var(--dse-*) reference', '.dse-x { color: var(--dse-fg); outline: 2px solid var(--dse-focus-ring); }'],
		['hyphenated identifiers / functions', '.dse-x { background: linear-gradient(to right, var(--dse-rule), transparent); clip-path: polygon(0 0, 1px 50%); font-variant-numeric: tabular-nums; }'],
	])('passes whitelisted %s', (_family, css) => {
		expect(cssColorLiteralFindings(css)).toEqual([]);
	});

	test('the scanner is NOT run against the :root token base (Legacy literals live there)', () => {
		// Sanity: the full sheet DOES contain literals (limegreen etc. in :root +
		// legacy CSS) — proving the section scoping is what keeps the scan green.
		expect(cssColorLiteralFindings(sheet)).not.toEqual([]);
	});
});

/* ------------------------------------------------------------------ */
/* 5. Whole-kit TS hygiene + the F1 OD-8 import boundary               */
/* ------------------------------------------------------------------ */

describe('Plan 08 Task 5: kit TS hygiene + import boundary', () => {
	const kitFiles = fs.readdirSync(kitDir).filter((f) => f.endsWith('.ts'));

	test('kit dir contains the expected modules (barrel included)', () => {
		expect(kitFiles).toContain('index.ts');
		// 11 = 10 widget modules + the barrel (the two F1-era helpers were deleted
		// by Plan 09 Task 10).
		expect(kitFiles.length).toBeGreaterThanOrEqual(11);
	});

	test.each(kitFiles)('%s: zero color literals, zero el.style.color', (file) => {
		const src = fs.readFileSync(path.join(kitDir, file), 'utf8');
		expect(tsColorFindings(src)).toEqual([]);
	});

	test('the TS scanner discriminates (catches hex / rgb( / modern color-fns / .style.color)', () => {
		expect(tsColorFindings('el.style.color = "red";')).not.toEqual([]);
		expect(tsColorFindings('const c = "#ff0000";')).not.toEqual([]);
		expect(tsColorFindings('const c = `rgb(1,2,3)`;')).not.toEqual([]);
		// The modern color-function families, now scanned symmetrically with the CSS scan:
		expect(tsColorFindings('const c = `oklch(0.7 0.1 200)`;')).not.toEqual([]);
		expect(tsColorFindings('const c = `color(display-p3 1 0 0)`;')).not.toEqual([]);
		expect(tsColorFindings('el.addClass("dse-btn"); // #hexy comment is stripped')).toEqual([]);
	});

	test.each(kitFiles)('%s: never imports from src/elements/ (F1 OD-8)', (file) => {
		const src = fs.readFileSync(path.join(kitDir, file), 'utf8');
		expect(src).not.toMatch(/from\s+['"][^'"]*elements/);
	});
});
