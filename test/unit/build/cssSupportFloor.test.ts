import { readFileSync } from 'fs';
import path from 'path';

// SC-121 batch 3 — the BROWSER SUPPORT FLOOR guard, sibling of cssNesting.test.ts.
//
// The plugin's floor is Chromium 106: the oldest Electron a supported Obsidian desktop
// install still ships, and the target SC-122 pinned esbuild's CSS pipeline to. A CSS
// feature newer than that floor does not "degrade" — an unsupported function makes the
// whole DECLARATION invalid at parse time, so the property silently falls back to its
// inherited/initial value. That is precisely how SC-122's unflattened nesting shipped
// unnoticed: the visual harness runs a modern Chromium where everything resolves, so no
// gate ever saw it. `color-mix()` (Chromium 111) was a second, independent instance of the
// same class — 7 declarations, all silently dropped in the app.
//
// The house rule this guard enforces is PROGRESSIVE ENHANCEMENT: every `color-mix()`
// declaration must be immediately preceded, inside the same rule, by a declaration of the
// SAME property carrying a static value the floor engine can parse. A floor engine keeps
// the static one and drops the enhanced one; a modern engine parses both and the later one
// wins, so behaviour on modern engines is unchanged.
//
// ── WHAT THIS GUARD CANNOT SEE (stated honestly) ────────────────────────────────────
//  1. It is a SOURCE-TEXT scan of styles-source.css, not a parse of the built CSS against
//     a real Chromium 106. It proves the fallback declaration is authored; it cannot prove
//     the fallback renders acceptably. Judging "acceptably" is a human review job — see the
//     role-band fallbacks, which deliberately drop the role HUE (--dse-role is set inline
//     at runtime, so no literal can be baked) and keep only the band structure + edge.
//  2. It checks textual ADJACENCY within a rule, not the cascade. A fallback supplied from
//     a different rule, a different specificity, or a later @media block would be
//     invisible here and would fail this test even if it worked. That is deliberate:
//     same-rule adjacency is the only form that is obviously correct at a glance.
//  3. [SC-121 Batch 3 limit, SUPERSEDED by Batch 4] The guard used to know about
//     `color-mix()` and nothing else — a pure FUNCTION-TOKEN scan, so a bare property/value
//     pair like `text-wrap: balance` slipped through. Batch 4 (catalog D-5..D-8 sweep) added
//     the second scan below: a CURATED deny-list of above-floor PROPERTIES, AT-RULES and
//     value keywords (`ABOVE_FLOOR_TOKENS`). It is deliberately curated, not derived — this
//     repo is not going to grow a caniuse-data engine — so its honest limit is that it
//     catches what someone thought to list. Adding a row is the maintenance cost of using a
//     new CSS feature; the list documents each entry's Chromium version and its remediation.
//     CSS NESTING is still deliberately NOT covered here: cssNesting.test.ts already guards
//     it against the BUILT styles.css, which is the stronger check for that feature.
//  4. Custom-property declarations (`--x: color-mix(…)`) are exempt: a custom property's
//     value is not parsed as a property value at declaration time, so an unsupported
//     function inside one does not invalidate anything until it is substituted. There are
//     none today; the exemption is documented so a future one is not mis-flagged.
//  5. [Batch 4] The deny-list scan splits a comment-masked copy of the file into
//     declaration-sized SEGMENTS on `;`/`{`/`}` — so it is insensitive to how many
//     declarations share a line — and reads `prop:` at a segment's start, `@name` at an
//     at-rule prelude's start, and listed function/keyword tokens in a value (at an
//     identifier boundary, so `lch(` does not match inside `oklch(`). What it still does
//     NOT understand: the cascade, `@supports` (a feature correctly wrapped in
//     `@supports` would still be flagged — tag it `floor-ok(...)` and say so), or which
//     rules actually apply to any element.

const repoRoot = path.resolve(__dirname, '../../..');
const SOURCE = path.join(repoRoot, 'styles-source.css');

/** Functions/at-rules that are ABOVE the Chromium 106 floor and therefore need a fallback. */
const ABOVE_FLOOR_FUNCS = ['color-mix('];

export interface FloorViolation {
	prop: string;
	decl: string;
	reason: string;
}

/** Strip `/* … *\/` comments — the file documents these very declarations in prose. */
function stripComments(css: string): string {
	return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Split a stylesheet into declarations, remembering the rule each one belongs to and the
 * declaration that textually precedes it inside that same rule. Only flat `sel { … }` rules
 * exist in this file (cssNesting.test.ts pins that), plus at-rule wrappers whose bodies are
 * ordinary rules — a brace-depth walk handles both without needing a real parser.
 */
export function findFloorViolations(rawCss: string): FloorViolation[] {
	const css = stripComments(rawCss);
	const violations: FloorViolation[] = [];

	// Walk rule bodies: everything between a `{` and its matching `}` that contains no
	// further `{`. A regex over `\{([^{}]*)\}` yields exactly those innermost bodies.
	const bodyRe = /\{([^{}]*)\}/g;
	let m: RegExpExecArray | null;
	while ((m = bodyRe.exec(css))) {
		const decls = m[1]
			.split(';')
			.map((d) => d.trim())
			.filter(Boolean);

		decls.forEach((decl, i) => {
			const colon = decl.indexOf(':');
			if (colon === -1) return;
			const prop = decl.slice(0, colon).trim();
			const value = decl.slice(colon + 1);
			if (!ABOVE_FLOOR_FUNCS.some((f) => value.includes(f))) return;
			// Limit 4: a custom property's value is not parsed until substitution.
			if (prop.startsWith('--')) return;

			const prev = i > 0 ? decls[i - 1] : undefined;
			const prevProp = prev ? prev.slice(0, prev.indexOf(':')).trim() : undefined;
			const prevValue = prev ? prev.slice(prev.indexOf(':') + 1) : '';

			if (prevProp !== prop) {
				violations.push({
					prop,
					decl: decl.replace(/\s+/g, ' '),
					reason: prev
						? `the preceding declaration is \`${prevProp}\`, not \`${prop}\``
						: 'it is the first declaration in its rule — nothing precedes it',
				});
				return;
			}
			if (ABOVE_FLOOR_FUNCS.some((f) => prevValue.includes(f))) {
				violations.push({
					prop,
					decl: decl.replace(/\s+/g, ' '),
					reason: `the preceding \`${prop}\` declaration is itself above the floor`,
				});
			}
		});
	}

	return violations;
}

// ── SC-121 Batch 4: the curated above-floor token deny-list ─────────────────────────────
//
// The floor is Chromium 106. Each row is a feature ABOVE it whose failure mode is silent:
// the declaration (or the whole at-rule) is dropped at parse time and the layout quietly
// falls back to something nobody designed. `since` is the Chromium version the feature
// shipped in; `why` states the remediation the author must apply. Two remediation shapes
// exist, and the scan below accepts either:
//
//   (a) PROGRESSIVE ENHANCEMENT — an immediately preceding declaration of the same
//       property with a floor-safe value (the rule the color-mix() scan already enforces).
//       Only possible when the PROPERTY itself exists at the floor and only the VALUE is
//       new (e.g. a `oklch()` color: `color: #333; color: oklch(…)`).
//   (b) A DECLARED-ACCEPTABLE DEGRADATION — for a property/at-rule that does not exist at
//       the floor at all there IS no same-property fallback, so the only honest option is
//       to state, in a comment, that the floor rendering is acceptable and why. The tag is
//       `floor-ok(<token>)` in a CSS comment on the same line or in the 4 lines above.
//
// SAFE, deliberately NOT listed (checked, and pinned by the "known-safe" test below so a
// future reader doesn't re-litigate them): `:has()` (105), container SIZE queries —
// `container-type` / `@container (…)` (105) — `@layer` (99), `accent-color` (93),
// `:is()`/`:where()` (88), `@property` (85), `overflow: clip` (90), `aspect-ratio` (88).
// All are at or below the 106 floor.
export interface AboveFloorToken {
	/** Literal to look for. Property rows are matched at a declaration's start. */
	token: string;
	kind: 'property' | 'at-rule' | 'value';
	/** Chromium version the feature shipped in. */
	since: number;
	why: string;
}

export const ABOVE_FLOOR_TOKENS: AboveFloorToken[] = [
	{
		token: 'text-wrap',
		kind: 'property',
		since: 114,
		why: 'no floor equivalent — either author the intent with `white-space` (CSS2.1) or tag floor-ok(text-wrap) explaining why unbalanced/unwrapped text is acceptable. (Batch 3 hit this on .error-message and restructured to `white-space: pre-wrap` rather than exempt it.)',
	},
	{
		token: 'text-wrap-style',
		kind: 'property',
		since: 130,
		why: 'the longhand behind text-wrap — same remediation: express the intent with `white-space`, or tag floor-ok(text-wrap-style)',
	},
	{
		token: 'text-wrap-mode',
		kind: 'property',
		since: 130,
		why: 'the longhand behind text-wrap — `white-space: pre-wrap` / `nowrap` covers every floor case, so this should never be needed',
	},
	{
		token: 'field-sizing',
		kind: 'property',
		since: 123,
		why: 'no floor equivalent — size the control explicitly, or tag floor-ok(field-sizing)',
	},
	{
		token: '@scope',
		kind: 'at-rule',
		since: 118,
		why: 'the ENTIRE block is dropped at the floor — use a descendant selector instead',
	},
	{
		token: 'subgrid',
		kind: 'value',
		since: 117,
		why: 'the grid-template declaration is dropped whole — precede it with a floor-safe explicit track list',
	},
	{
		token: '@container style(',
		kind: 'at-rule',
		since: 111,
		why: 'container STYLE queries are 111 even though SIZE queries are 105 — the whole block is dropped; use a size query or a data-attribute selector',
	},
	{
		token: 'oklch(',
		kind: 'value',
		since: 111,
		why: 'precede with the same property carrying a hex/rgb literal (same shape as color-mix)',
	},
	{
		token: 'oklab(',
		kind: 'value',
		since: 111,
		why: 'same as oklch() — precede with the same property carrying a hex/rgb literal',
	},
	{
		token: 'lch(',
		kind: 'value',
		since: 111,
		why: 'same as oklch() — precede with the same property carrying a hex/rgb literal',
	},
	{
		token: 'light-dark(',
		kind: 'value',
		since: 123,
		why: 'the plugin already branches on body.theme-dark/.theme-light — use that, not light-dark()',
	},
	{
		token: '(from ',
		kind: 'value',
		since: 119,
		why: 'relative color syntax (`rgb(from …)`, `hsl(from …)`, `oklch(from …)`) — precede with a static literal of the same property',
	},
	{
		token: 'anchor(',
		kind: 'value',
		since: 125,
		why: 'CSS anchor positioning — no floor fallback; position explicitly',
	},
	{
		token: 'anchor-size(',
		kind: 'value',
		since: 125,
		why: 'CSS anchor positioning sizing — no floor fallback; size explicitly instead',
	},
];

/** Features verified to be AT OR BELOW the floor — pinned so the list above stays honest. */
export const KNOWN_SAFE_BELOW_FLOOR: { token: string; since: number }[] = [
	{ token: ':has(', since: 105 },
	{ token: 'container-type', since: 105 },
	{ token: '@container', since: 105 },
	{ token: '@layer', since: 99 },
	{ token: 'accent-color', since: 93 },
	{ token: ':where(', since: 88 },
	{ token: '@property', since: 85 },
];

export interface TokenViolation {
	token: string;
	since: number;
	line: number;
	text: string;
	why: string;
}

/**
 * Replace every comment's CONTENT with spaces, preserving line structure and length, so a
 * line scan never trips over the file's own prose (which quotes these very tokens). The
 * ORIGINAL text is still used to find `floor-ok(...)` tags — those live in comments.
 */
export function maskComments(css: string): string {
	let out = '';
	let i = 0;
	while (i < css.length) {
		const start = css.indexOf('/*', i);
		if (start === -1) {
			out += css.slice(i);
			break;
		}
		out += css.slice(i, start);
		const end = css.indexOf('*/', start + 2);
		const stop = end === -1 ? css.length : end + 2;
		// Keep newlines so line numbers (and the floor-ok lookback) stay aligned.
		out += css.slice(start, stop).replace(/[^\n]/g, ' ');
		i = stop;
	}
	return out;
}

/** Does a `floor-ok(<token>)` tag cover this line? Same line, or the 4 lines above it. */
function hasFloorOkTag(rawLines: string[], lineIdx: number, token: string): boolean {
	const tag = `floor-ok(${token})`;
	for (let i = Math.max(0, lineIdx - 4); i <= lineIdx; i++) {
		if (rawLines[i]?.includes(tag)) return true;
	}
	return false;
}

const DECL_PROP = /^(-{0,2}[a-zA-Z-]+)\s*:/;

/**
 * Value tokens must start at an identifier boundary, or `lch(` would match inside
 * `oklch(` (and `anchor(` inside `--my-anchor(`-ish text). Substring matching was the
 * first cut and produced exactly that double-report.
 */
function valueHasToken(value: string, token: string): boolean {
	const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`(^|[^a-zA-Z0-9_-])${escaped}`).test(value);
}

export function findTokenViolations(rawCss: string): TokenViolation[] {
	const rawLines = rawCss.split('\n');
	const masked = maskComments(rawCss);
	const violations: TokenViolation[] = [];

	// Flatten to declaration-sized SEGMENTS carrying their source line, so the scan is
	// insensitive to how many declarations share a line (limit 5). `;`, `{` and `}` are
	// the only separators that matter once comments are masked out.
	const segments: { text: string; line: number }[] = [];
	let line = 1;
	let buf = '';
	const push = () => {
		if (buf.trim()) segments.push({ text: buf.trim().replace(/\s+/g, ' '), line });
		buf = '';
	};
	for (const ch of masked) {
		if (ch === ';' || ch === '{' || ch === '}') {
			// `{` closes the segment it terminates (a selector / at-rule prelude); the
			// line recorded is where that segment STARTED accumulating.
			push();
			if (ch === '{') buf = '';
			continue;
		}
		if (ch === '\n') {
			if (!buf.trim()) line += 1;
			else buf += ch;
			continue;
		}
		if (!buf.trim() && !/\s/.test(ch)) {
			// first real char of a new segment — anchor its line number here
			line += (buf.match(/\n/g) ?? []).length;
			buf = ch;
			continue;
		}
		buf += ch;
	}
	push();

	for (const [i, seg] of segments.entries()) {
		const declProp = DECL_PROP.exec(seg.text)?.[1];
		const valuePart = declProp ? seg.text.slice(seg.text.indexOf(':') + 1) : seg.text;

		for (const entry of ABOVE_FLOOR_TOKENS) {
			let hit = false;
			if (entry.kind === 'property') hit = declProp === entry.token;
			else if (entry.kind === 'at-rule') hit = seg.text.startsWith(entry.token);
			else hit = declProp !== undefined && valueHasToken(valuePart, entry.token);
			if (!hit) continue;
			// Limit 4: a custom property's value isn't parsed until substitution.
			if (entry.kind === 'value' && declProp?.startsWith('--')) continue;
			// Remediation (b): a declared-acceptable degradation, tagged in a comment.
			if (hasFloorOkTag(rawLines, seg.line - 1, entry.token)) continue;
			// Remediation (a): progressive enhancement — only meaningful for VALUE rows,
			// where the property exists at the floor and only the value is new.
			if (entry.kind === 'value' && declProp) {
				const prev = segments[i - 1]?.text ?? '';
				const prevProp = DECL_PROP.exec(prev)?.[1];
				const prevValue = prev.slice(prev.indexOf(':') + 1);
				if (prevProp === declProp && !ABOVE_FLOOR_TOKENS.some((e) => valueHasToken(prevValue, e.token))) {
					continue;
				}
			}
			violations.push({
				token: entry.token,
				since: entry.since,
				line: seg.line,
				text: seg.text,
				why: entry.why,
			});
		}
	}

	return violations;
}

describe('SC-121: above-floor CSS features carry a static fallback (Chromium 106 floor)', () => {
	const rawCss = readFileSync(SOURCE, 'utf8');

	it('reads a non-trivial stylesheet (guard against a vacuous pass)', () => {
		expect(rawCss.length).toBeGreaterThan(10000);
	});

	it('finds the color-mix() declarations it is meant to be checking (no vacuous pass)', () => {
		const css = stripComments(rawCss);
		const count = css.split('color-mix(').length - 1;
		// 7 real declarations today: the tier-row wash (1) plus the statblock and
		// featureblock role bands (3 each: two gradient stops + the bottom edge). An 8th
		// textual occurrence lives in a comment quoting the site's source and is stripped
		// above. If this number moves, the new declarations must be fallback-guarded too —
		// which the assertion below enforces regardless of the count.
		expect(count).toBeGreaterThanOrEqual(7);
	});

	it('every color-mix() declaration is immediately preceded by a static same-property declaration', () => {
		const violations = findFloorViolations(rawCss);
		expect(
			violations.map((v) => `${v.decl}  <-- ${v.reason}`).join('\n'),
		).toBe('');
	});

	// ── SC-121 Batch 4: the curated deny-list scan ───────────────────────────────────
	it('styles-source.css uses no above-floor property/at-rule/keyword from the deny-list', () => {
		const violations = findTokenViolations(rawCss);
		expect(
			violations
				.map((v) => `styles-source.css:${v.line}  ${v.token} (Chromium ${v.since}) — ${v.text}\n    fix: ${v.why}`)
				.join('\n'),
		).toBe('');
	});

	it('the deny-list is non-trivial and every row is genuinely above the 106 floor', () => {
		expect(ABOVE_FLOOR_TOKENS.length).toBeGreaterThanOrEqual(10);
		for (const entry of ABOVE_FLOOR_TOKENS) {
			expect(entry.since).toBeGreaterThan(106);
			expect(entry.why.length).toBeGreaterThan(20); // a real remediation, not a stub
		}
	});

	it('the known-safe list stays at or below the floor (so nobody re-litigates :has())', () => {
		for (const entry of KNOWN_SAFE_BELOW_FLOOR) {
			expect(entry.since).toBeLessThanOrEqual(106);
			// A safe feature must never also be denied — that would be a contradiction.
			expect(ABOVE_FLOOR_TOKENS.some((e) => e.token === entry.token)).toBe(false);
		}
	});

	it('the safe features it names really are in the file (so the list is about THIS sheet)', () => {
		// `:has()` and container size queries are both used today (feature indent rules,
		// the hero sheet's responsive grid) — the two the reviewer questioned in batch 1
		// (M-1) and batch 3. Pinning their presence keeps the "checked, and safe" claim
		// above from silently becoming hypothetical.
		expect(rawCss).toContain(':has(');
		expect(rawCss).toContain('container-type: inline-size');
	});

	it('detector sanity: the deny-list scan flags, and its two remediations clear it', () => {
		const bare = `.a { text-wrap: balance; }`;
		const tagged = `.a { /* floor-ok(text-wrap): headline balance is cosmetic */ text-wrap: balance; }`;
		const taggedAbove = `.a {\n\t/* floor-ok(text-wrap): cosmetic */\n\ttext-wrap: balance;\n}`;
		const valueBare = `.b { color: oklch(0.5 0.1 200); }`;
		const valueGuarded = `.b { color: #445566;\n\tcolor: oklch(0.5 0.1 200); }`;
		const inComment = `/* never use text-wrap: balance here */\n.c { color: red; }`;
		const customProp = `.d { --x: oklch(0.5 0.1 200); }`;
		const atRule = `@scope (.a) { .b { color: red; } }`;
		const safeContainer = `.e { container-type: inline-size; }\n@container (max-width: 480px) { .f { color: red; } }`;

		expect(findTokenViolations(bare)).toHaveLength(1);
		expect(findTokenViolations(bare)[0].since).toBe(114);
		expect(findTokenViolations(tagged)).toHaveLength(0);
		expect(findTokenViolations(taggedAbove)).toHaveLength(0);
		expect(findTokenViolations(valueBare)).toHaveLength(1);
		expect(findTokenViolations(valueGuarded)).toHaveLength(0);
		expect(findTokenViolations(inComment)).toHaveLength(0);
		expect(findTokenViolations(customProp)).toHaveLength(0);
		expect(findTokenViolations(atRule)).toHaveLength(1);
		// The SAFE pair must not be flagged — this is the borderline the brief called out.
		expect(findTokenViolations(safeContainer)).toHaveLength(0);
	});

	it('detector sanity: flags an unguarded color-mix() in a synthetic sample', () => {
		const guarded = `.a { color: #123456; color: color-mix(in srgb, red 40%, blue); }`;
		const unguarded = `.b { background: color-mix(in srgb, red 40%, blue); }`;
		const wrongProp = `.c { color: #123456; background: color-mix(in srgb, red 40%, blue); }`;
		const doubled = `.d { color: color-mix(in srgb, red 1%, blue); color: color-mix(in srgb, red 40%, blue); }`;
		const inComment = `/* background: color-mix(in srgb, red 40%, blue); */ .e { color: red; }`;

		expect(findFloorViolations(guarded)).toHaveLength(0);
		expect(findFloorViolations(unguarded)).toHaveLength(1);
		expect(findFloorViolations(wrongProp)).toHaveLength(1);
		// Two, not one: the first color-mix() is unguarded in its own right (nothing
		// precedes it) AND the second one's "fallback" is itself above the floor.
		expect(findFloorViolations(doubled)).toHaveLength(2);
		expect(findFloorViolations(inComment)).toHaveLength(0);
	});
});
