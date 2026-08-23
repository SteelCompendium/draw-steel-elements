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
//     identifier boundary, so `lch(` does not match inside `oklch(`). A row whose token can
//     never sit at that boundary (relative-color syntax's `(from `, always glued to a
//     function name's last letter) instead carries an explicit `pattern` that matches the
//     whole function-call shape (`[a-zA-Z-]+\(\s*from\s`) — see `AboveFloorToken.pattern`.
//     What it still does NOT understand: the cascade, `@supports` (a feature correctly
//     wrapped in `@supports` would still be flagged — tag it `floor-ok(...)` and say so), or
//     which rules actually apply to any element.
//
// ── SC-171: THE THIRD SCAN — adjacency is NOT enough for a `var()`-bearing color-mix ──
// The two scans above were both satisfied by the whole sheet and the sheet was still broken
// in the app. `findFloorViolations` enforces "static declaration first, enhanced declaration
// immediately after", an idiom that rests on the enhanced declaration being invalid at PARSE
// time. That is true only for LITERAL values. A declaration whose value contains `var()`
// parses fine — substitution happens later — and fails at COMPUTED-VALUE time, AFTER the
// cascade has already discarded the static twin beneath it, so the property lands on `unset`
// rather than on the fallback. Measured in real Obsidian (Chromium 106.0.5249.199 / Electron
// 21.4.1, SC-160 then SC-171): the statblock head band computed `background-image: none`,
// `background-color: rgba(0, 0, 0, 0)` and `border-bottom: 0px none`, and every tier row lost
// its wash. Every color-mix() declaration in this sheet contains a `var()`.
//
// `findUngatedColorMixViolations` is therefore the gate that can actually see the failure.
// Unlike the two scans above, this one DOES model `@supports` — it walks brace depth and keeps
// the at-rule prelude stack. It is TWO-SIDED (SC-171 review M-1), because gating is only half
// of the fix:
//
//   1. `ungated`      — a `var()`-bearing `color-mix()` declaration MUST sit inside an
//                       `@supports` block that really keeps a floor engine out.
//   2. `no-base-twin` — and the property it enhances MUST also be declared statically OUTSIDE
//                       that gate, in the same selector context. Gate the enhancement but
//                       forget the base declaration and the floor engine gets NOTHING for that
//                       property — the same bug, reached from the other side. Proven live
//                       during the SC-171 review: deleting `.dse-pr__row`'s base
//                       `background-image` and leaving its gate intact passed tsc, lint and all
//                       2825 tests while every tier row rendered washless on Chromium 106.
//
// What counts as a gate is deliberately narrow (`isColorMixGatePrelude`, SC-171 review M-2):
// `@supports not (… color-mix …)` applies ONLY on the floor engine, and
// `@supports (display: grid) or (… color-mix …)` lets it in through the other arm — neither is
// a gate. `and`-conjunctions are fine (one false conjunct fails the term).
//
// KNOWN LIMIT, accepted (SC-171 review N-6): the scan is order-blind. The doctrine also
// requires the gate block to sit AFTER the rule it enhances — equal specificity means source
// order decides the winner on a modern engine — and nothing here checks that.

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
	/**
	 * Value rows only. Overrides `valueHasToken`'s identifier-boundary match when a row's
	 * `token` can never sit at an identifier boundary in real syntax — e.g. relative-color
	 * syntax's `(from `, which is always immediately preceded by a function name's last
	 * letter (`rgb(from …`), so the boundary check rejects every real instance. Match the
	 * whole function-call shape instead.
	 */
	pattern?: RegExp;
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
		// The bare `(from ` token can never sit at an identifier boundary — in real syntax
		// it is always glued to the preceding function name's last letter (`rgb(from …`).
		// Match the whole `<func>(from ` shape instead.
		pattern: /[a-zA-Z-]+\(\s*from\s/,
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
			else if (entry.pattern) hit = declProp !== undefined && entry.pattern.test(valuePart);
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

// ── SC-171: the @supports-gate scan ─────────────────────────────────────────────────────
/**
 * `ungated`      — a `var()`-bearing color-mix() declaration with no gate around it. The
 *                  original SC-171 failure: the floor engine parses it, fails at
 *                  computed-value time, and the property lands on `unset`.
 * `no-base-twin` — a GATED color-mix() declaration with no static declaration of the same
 *                  property, in the same selector context, OUTSIDE the gate. The same
 *                  failure from the other side: the floor engine never enters the block,
 *                  so it gets no declaration of that property at all (SC-171 review M-1).
 */
export type ColorMixViolationKind = 'ungated' | 'no-base-twin';

export interface UngatedColorMixViolation {
	/** 1-based source line of the offending declaration. */
	line: number;
	prop: string;
	decl: string;
	reason: string;
	kind: ColorMixViolationKind;
	/** Enclosing preludes with any color-mix gate removed — the layer a floor engine sees. */
	context: string;
}

/** The literal gate the sheet uses everywhere. Any EQUIVALENT condition is accepted too. */
export const COLOR_MIX_GATE = '@supports (background: color-mix(in srgb, red 14%, blue))';

const norm = (s: string): string => s.trim().replace(/\s+/g, ' ');

/**
 * Split an `@supports` condition on TOP-LEVEL `or`, respecting parentheses.
 * `(a) or (b)` → ['(a)', '(b)']; `(background: color-mix(in srgb, red, blue))` → one term
 * (the inner `color-mix(...)` parens keep its contents at depth > 0).
 */
function splitTopLevelOr(cond: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let cur = '';
	for (let i = 0; i < cond.length; i++) {
		const ch = cond[i];
		if (ch === '(') depth += 1;
		else if (ch === ')') depth -= 1;
		const atWordStart = i === 0 || /[\s)]/.test(cond[i - 1]);
		if (depth === 0 && atWordStart && /^or\b/i.test(cond.slice(i))) {
			out.push(cur);
			cur = '';
			i += 1; // consume the 'r' as well
			continue;
		}
		cur += ch;
	}
	out.push(cur);
	return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * Does this enclosing prelude actually keep a floor engine OUT?
 *
 * SC-171 review M-2 — the first version of this asked only "is it an `@supports` whose text
 * mentions color-mix", which accepted two conditions that a Chromium 106 engine happily
 * enters:
 *
 *   • `@supports not (background: color-mix(…))` — the block applies ONLY where color-mix is
 *     unsupported, i.e. exactly on the floor engine. The worst possible place to put a
 *     color-mix() declaration, and the shape someone reaches for when writing a floor-only
 *     fallback block. Any `not` in the condition is therefore disqualifying.
 *   • `@supports (display: grid) or (background: color-mix(…))` — a floor engine enters
 *     through the `display: grid` arm. So EVERY top-level disjunct must itself test
 *     color-mix. `and` needs no such care: one false conjunct fails the whole term, so
 *     `(display: grid) and (background: color-mix(…))` is safe and is accepted.
 */
export function isColorMixGatePrelude(prelude: string): boolean {
	const p = norm(prelude);
	if (!/^@supports\b/i.test(p)) return false;
	const cond = p.replace(/^@supports\b/i, '').trim();
	if (!cond) return false;
	if (/\bnot\b/i.test(cond)) return false;
	return splitTopLevelOr(cond).every((d) => d.includes('color-mix('));
}

/**
 * Rewrite every ACCEPTED color-mix gate in `css` into an `@supports` that is not a gate.
 *
 * SC-171 review L-4: the in-repo can-fail control used to neuter gates by string-replacing
 * the exact `COLOR_MIX_GATE` literal, so an eleventh declaration behind a differently-worded
 * but perfectly valid gate (e.g. `@supports (color: color-mix(in srgb, red, blue))`) was left
 * gated — the control's count stayed at 10 and it passed while the inventory was stale.
 * Neutering by the same predicate the scan uses closes that.
 */
export function neuterColorMixGates(css: string): string {
	// Match against a comment-MASKED copy (same length, so offsets carry over) and splice the
	// original by index. Matching the raw text instead lets a prelude quoted in the sheet's own
	// prose start a match that runs through the comment and swallows the next REAL gate, which
	// then survives the neutering — the first cut of this did exactly that.
	const masked = maskComments(css);
	const hits: { start: number; end: number }[] = [];
	const re = /@supports[^{}]*\{/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(masked))) {
		if (isColorMixGatePrelude(m[0].slice(0, -1))) {
			hits.push({ start: m.index, end: m.index + m[0].length });
		}
	}
	let out = css;
	for (const h of hits.reverse()) {
		out = out.slice(0, h.start) + '@supports (background: red) {' + out.slice(h.end);
	}
	return out;
}

interface ScannedDecl {
	line: number;
	prop: string;
	value: string;
	/** Enclosing preludes, outermost first, whitespace-normalised. */
	stack: string[];
}

/** Every `prop: value` in the file, with the at-rule/selector stack it sits under. */
function scanDeclarations(rawCss: string): ScannedDecl[] {
	const masked = maskComments(rawCss);
	const out: ScannedDecl[] = [];
	const stack: string[] = [];
	let buf = '';
	let line = 1;
	let segLine = 0;

	const flush = () => {
		const text = norm(buf);
		const at = segLine || line;
		buf = '';
		segLine = 0;
		if (!text) return;
		const colon = text.indexOf(':');
		if (colon === -1) return;
		out.push({
			line: at,
			prop: text.slice(0, colon).trim(),
			value: text.slice(colon + 1).trim(),
			stack: [...stack],
		});
	};

	for (const ch of masked) {
		if (ch === '{') {
			stack.push(norm(buf));
			buf = '';
			segLine = 0;
			continue;
		}
		if (ch === '}') {
			flush(); // a final declaration may omit its trailing `;`
			stack.pop();
			continue;
		}
		if (ch === ';') {
			flush();
			continue;
		}
		if (ch === '\n') line += 1;
		if (!buf && /\s/.test(ch)) continue; // skip leading whitespace of a segment
		if (!segLine) segLine = line;
		buf += ch;
	}

	return out;
}

/** The selector context a floor engine sees: the stack with any color-mix gate removed. */
const contextOf = (stack: string[]): string =>
	stack.filter((p) => !isColorMixGatePrelude(p)).join(' | ');

/**
 * The TWO-SIDED gate scan. See the SC-171 note in this file's header for why the adjacency
 * scan above cannot see either half.
 *
 *  1. A `var()`-bearing `color-mix()` declaration must sit inside an `@supports` block that
 *     really does keep a floor engine out (`isColorMixGatePrelude`).
 *  2. …and the property it enhances must ALSO be declared statically OUTSIDE that gate, in
 *     the same selector context — otherwise a floor engine, which never enters the block,
 *     gets no declaration of that property at all. Gating alone is only half the fix.
 *
 * Brace-depth walk over a comment-masked copy carrying the prelude stack, so `@supports`
 * nesting is modelled rather than ignored. Known limit, deliberate (SC-171 review N-6): the
 * scan is order-blind — it does not check that the gate block sits AFTER the rule it
 * enhances, which the doctrine requires because equal specificity makes source order decide.
 */
export function findUngatedColorMixViolations(rawCss: string): UngatedColorMixViolation[] {
	const decls = scanDeclarations(rawCss);
	const violations: UngatedColorMixViolation[] = [];

	// Index of static (non-color-mix) declarations living OUTSIDE every color-mix gate.
	const staticOutsideGate = new Set<string>();
	for (const d of decls) {
		if (d.prop.startsWith('--')) continue;
		if (d.value.includes('color-mix(')) continue;
		if (d.stack.some(isColorMixGatePrelude)) continue;
		staticOutsideGate.add(`${contextOf(d.stack)} ${d.prop}`);
	}

	for (const d of decls) {
		if (!d.value.includes('color-mix(')) continue;
		// Same exemption as the adjacency scan (limit 4): a custom property's value is not
		// parsed as a property value until it is substituted.
		if (d.prop.startsWith('--')) continue;

		const gated = d.stack.some(isColorMixGatePrelude);
		const context = contextOf(d.stack);
		const decl = `${d.prop}: ${d.value}`;

		if (!gated) {
			// A color-mix() with NO var() really is invalid at parse time, so the plain
			// static-first adjacency pair (enforced by findFloorViolations) is sufficient there.
			if (!d.value.includes('var(')) continue;
			violations.push({
				line: d.line,
				prop: d.prop,
				decl,
				kind: 'ungated',
				context,
				reason:
					`it contains \`var()\`, so a Chromium 106 engine parses it and then fails at ` +
					`computed-value time — AFTER the cascade discarded the static \`${d.prop}\` above it, ` +
					`leaving the property \`unset\`. Move it inside \`${COLOR_MIX_GATE}\` (repeating the ` +
					`static twin inside the block) so the static declaration is the only one outside the gate.`,
			});
			continue;
		}

		if (!staticOutsideGate.has(`${context} ${d.prop}`)) {
			violations.push({
				line: d.line,
				prop: d.prop,
				decl,
				kind: 'no-base-twin',
				context,
				reason:
					`it is gated, but there is NO static \`${d.prop}\` declaration outside the gate for ` +
					`\`${context}\`. A floor engine never enters the @supports block, so it gets no ` +
					`\`${d.prop}\` at all — the same failure the gate exists to prevent, arrived at from ` +
					`the other side. Declare the static value in the base rule (and keep the pair inside ` +
					`the block too, for the adjacency scan).`,
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
		// Textual occurrences, not declarations: as of SC-171 the sheet has 10 color-mix()
		// DECLARATIONS (background ×5, border-bottom ×2, box-shadow ×2, background-image ×1),
		// each carrying one or two color-mix() calls, plus one call inside each `@supports`
		// prelude that gates them. Occurrences in prose comments are stripped above. If this
		// number moves, the new declarations must be guarded too — which the two assertions
		// below enforce regardless of the count.
		expect(count).toBeGreaterThanOrEqual(7);
	});

	it('every color-mix() declaration is immediately preceded by a static same-property declaration', () => {
		const violations = findFloorViolations(rawCss);
		expect(
			violations.map((v) => `${v.decl}  <-- ${v.reason}`).join('\n'),
		).toBe('');
	});

	// ── SC-171 ───────────────────────────────────────────────────────────────────────
	it('every var()-bearing color-mix() declaration sits inside an @supports color-mix gate', () => {
		const violations = findUngatedColorMixViolations(rawCss).filter((v) => v.kind === 'ungated');
		expect(
			violations
				.map((v) => `styles-source.css:${v.line}  ${v.decl}\n    <-- ${v.reason}`)
				.join('\n'),
		).toBe('');
	});

	// SC-171 review M-1 — the other half. Gating an enhancement is only correct if the floor
	// engine still has something to fall back ON; a gate with no static twin outside it leaves
	// the property undeclared there, which is the very failure this ticket fixed.
	it('every GATED color-mix() declaration has a static twin of the same property outside the gate', () => {
		const violations = findUngatedColorMixViolations(rawCss).filter(
			(v) => v.kind === 'no-base-twin',
		);
		expect(
			violations
				.map((v) => `styles-source.css:${v.line}  ${v.decl}\n    <-- ${v.reason}`)
				.join('\n'),
		).toBe('');
	});

	it('CAN-FAIL PROOF: neutering the sheet’s own gates makes the scan report every declaration', () => {
		// The assertion above is only meaningful if the scan would fire on THIS file. Rewrite
		// every real gate prelude to one that does not test color-mix and re-run: each of the
		// sheet's 16 declarations must now be reported by name. This is the live proof, run on
		// the shipped stylesheet on every jest run — not a synthetic sample.
		//
		// The inventory is a COUNT OF THE SHEET, so it moves whenever the sheet grows a
		// color-mix() surface. 10 → 16 with SC-189 round 2's four seating candidates: `hush`
		// re-mixes each head band's gradient (2 × background) and `crown` re-mixes the chrome
		// panel's fill and edge on both headered families (2 × background, 2 × border-color).
		// Those six live behind a hidden review pref and go away with the losing branches when
		// Scott picks, which takes this back to 10.
		//
		// SC-171 review L-4: neuter by the SAME predicate the scan uses, not by string-replacing
		// the canonical literal — otherwise a declaration behind a differently-worded but valid
		// gate stays gated, the count stays 10, and the control passes on a stale inventory.
		const gates = rawCss.split(COLOR_MIX_GATE).length - 1;
		expect(gates).toBeGreaterThanOrEqual(7); // the gates the sweep authored
		const ungated = neuterColorMixGates(rawCss);
		// Structural proof that the neuterer actually disarmed everything: no @supports prelude
		// left in the file is still accepted as a gate. (Comment-masked — the doctrine note
		// quotes the canonical prelude in prose, which is not a gate and must not be counted.)
		const stillGates = (maskComments(ungated).match(/@supports[^{}]*\{/g) ?? []).filter((m) =>
			isColorMixGatePrelude(m.slice(0, -1)),
		);
		expect(stillGates).toEqual([]);
		const violations = findUngatedColorMixViolations(ungated);
		expect(violations.length).toBe(16);
		expect(violations.every((v) => v.kind === 'ungated')).toBe(true);
		// …and they are the surfaces SC-171 measured, plus SC-189 round 2's candidates, by
		// property.
		const byProp = violations.reduce<Record<string, number>>((acc, v) => {
			acc[v.prop] = (acc[v.prop] ?? 0) + 1;
			return acc;
		}, {});
		expect(byProp).toEqual({
			background: 9, // 5 SC-171 + 2 SC-189 `hush` bands + 2 SC-189 `crown` panels
			'background-image': 1,
			'border-bottom': 2,
			'border-color': 2, // SC-189 `crown`
			'box-shadow': 2,
		});
	});

	it('CAN-FAIL PROOF (M-1): deleting a base rule’s static twin is reported, by selector and property', () => {
		// The live proof for the second half, run on the shipped stylesheet: take away the tier
		// row's ungated `background-image` and leave its @supports block untouched — the exact
		// shape that passed every gate during the SC-171 review — and the scan must name it.
		const holed = rawCss.replace(
			'\tbackground-image: linear-gradient(90deg, var(--tw), transparent 60%);\n}\n/* SC-171:',
			'\n}\n/* SC-171:',
		);
		expect(holed).not.toBe(rawCss); // the anchor still exists; this control cannot go vacuous
		const violations = findUngatedColorMixViolations(holed);
		expect(violations).toHaveLength(1);
		expect(violations[0].kind).toBe('no-base-twin');
		expect(violations[0].prop).toBe('background-image');
		expect(violations[0].context).toContain('.dse-pr__row');
		expect(violations[0].reason).toContain('NO static `background-image` declaration outside');
	});

	it('CAN-FAIL PROOF (L-4): the neuterer disarms a differently-worded but valid gate too', () => {
		const alt = `@supports (color: color-mix(in srgb, red, blue)) {\n\t.zz { background: #123; background: color-mix(in srgb, var(--x) 4%, blue); }\n}\n`;
		// Gated and twinned in its own right → clean before neutering…
		expect(
			findUngatedColorMixViolations(`.zz { background: #123; }\n${alt}`),
		).toHaveLength(0);
		// …and counted once the control disarms it, which the old literal-replace never did.
		const violations = findUngatedColorMixViolations(
			neuterColorMixGates(`.zz { background: #123; }\n${alt}`),
		);
		expect(violations).toHaveLength(1);
		expect(violations[0].kind).toBe('ungated');
	});

	it('detector sanity: the @supports-gate scan flags exactly the ungated var() cases', () => {
		const gate = COLOR_MIX_GATE;
		const bare = `.a { background: #123456; background: color-mix(in srgb, var(--x) 40%, blue); }`;
		const gated = `.a { background: #123456; }\n${gate} {\n\t.a { background: #123456; background: color-mix(in srgb, var(--x) 40%, blue); }\n}`;
		// A LITERAL color-mix() really is invalid at parse time, so the adjacency pair alone
		// is enough there — this scan must not demand a gate for it.
		const literalPair = `.b { color: #123456; color: color-mix(in srgb, red 40%, blue); }`;
		// A gate that does not actually probe color-mix must NOT count as a gate.
		const wrongGate = `@supports (display: grid) { .c { background: #123; background: color-mix(in srgb, var(--x) 4%, blue); } }`;
		// Nesting: an inner @media inside the real gate is still gated — and its base twin has
		// to live in the SAME context (inside that @media, outside the gate).
		const nested = `@media screen { .d { background: #123; } }\n${gate} { @media screen { .d { background: #123; background: color-mix(in srgb, var(--x) 4%, blue); } } }`;
		// Custom properties are exempt (limit 4).
		const customProp = `.e { --w: color-mix(in srgb, var(--x) 4%, blue); }`;
		// Prose in a comment must never be read as a declaration.
		const inComment = `/* background: color-mix(in srgb, var(--x) 4%, blue); */ .f { color: red; }`;
		// The last declaration in a rule may omit its trailing semicolon.
		const noTrailingSemi = `.g { background: #123; background: color-mix(in srgb, var(--x) 4%, blue) }`;

		expect(findUngatedColorMixViolations(bare)).toHaveLength(1);
		expect(findUngatedColorMixViolations(bare)[0].prop).toBe('background');
		expect(findUngatedColorMixViolations(gated)).toHaveLength(0);
		expect(findUngatedColorMixViolations(literalPair)).toHaveLength(0);
		expect(findUngatedColorMixViolations(wrongGate)).toHaveLength(1);
		expect(findUngatedColorMixViolations(nested)).toHaveLength(0);
		expect(findUngatedColorMixViolations(customProp)).toHaveLength(0);
		expect(findUngatedColorMixViolations(inComment)).toHaveLength(0);
		expect(findUngatedColorMixViolations(noTrailingSemi)).toHaveLength(1);
	});

	// ── SC-171 review M-1: the two-sided half, on synthetic samples ──────────────────
	it('detector sanity: a gate with no static twin outside it is a violation', () => {
		const gate = COLOR_MIX_GATE;
		const orphan = `.a { color: red; }\n${gate} {\n\t.a { background: #123; background: color-mix(in srgb, var(--x) 4%, blue); }\n}`;
		const twinned = `.a { color: red; background: #123; }\n${gate} {\n\t.a { background: #123; background: color-mix(in srgb, var(--x) 4%, blue); }\n}`;
		// A twin of a DIFFERENT property does not count…
		const wrongProp = `.a { background-image: none; }\n${gate} {\n\t.a { background: #123; background: color-mix(in srgb, var(--x) 4%, blue); }\n}`;
		// …nor does one on a different selector…
		const wrongSelector = `.other { background: #123; }\n${gate} {\n\t.a { background: #123; background: color-mix(in srgb, var(--x) 4%, blue); }\n}`;
		// …nor does a "twin" that is itself a color-mix (it fails on the floor engine too).
		const twinIsAlsoMixed = `.a { background: color-mix(in srgb, var(--y) 4%, blue); }\n${gate} {\n\t.a { background: color-mix(in srgb, var(--y) 4%, blue); background: color-mix(in srgb, var(--x) 4%, blue); }\n}`;

		expect(findUngatedColorMixViolations(orphan)).toHaveLength(1);
		expect(findUngatedColorMixViolations(orphan)[0].kind).toBe('no-base-twin');
		expect(findUngatedColorMixViolations(orphan)[0].prop).toBe('background');
		expect(findUngatedColorMixViolations(twinned)).toHaveLength(0);
		expect(findUngatedColorMixViolations(wrongProp)).toHaveLength(1);
		expect(findUngatedColorMixViolations(wrongSelector)).toHaveLength(1);
		// the ungated "twin" is reported as ungated; BOTH gated lines are still twinless
		expect(findUngatedColorMixViolations(twinIsAlsoMixed).map((v) => v.kind).sort()).toEqual([
			'no-base-twin',
			'no-base-twin',
			'ungated',
		]);
	});

	// ── SC-171 review M-2: only a POSITIVE color-mix support test is a gate ──────────
	it('gate acceptance: rejects `not`, rejects an `or` a floor engine can enter, accepts `and`', () => {
		const mix = 'background: color-mix(in srgb, red 14%, blue)';
		expect(isColorMixGatePrelude(COLOR_MIX_GATE)).toBe(true);
		expect(isColorMixGatePrelude(`@supports (color: color-mix(in srgb, red, blue))`)).toBe(true);
		// `and`: one false conjunct fails the whole term, so the floor engine stays out.
		expect(isColorMixGatePrelude(`@supports (display: grid) and (${mix})`)).toBe(true);
		expect(isColorMixGatePrelude(`@supports (${mix}) and (display: grid)`)).toBe(true);
		// every disjunct tests color-mix → still safe
		expect(
			isColorMixGatePrelude(`@supports (${mix}) or (color: color-mix(in srgb, red, blue))`),
		).toBe(true);

		// `not` INVERTS the test: the block applies only where color-mix is missing.
		expect(isColorMixGatePrelude(`@supports not (${mix})`)).toBe(false);
		expect(isColorMixGatePrelude(`@supports (display: grid) and (not (${mix}))`)).toBe(false);
		// `or`: the floor engine walks in through the other arm.
		expect(isColorMixGatePrelude(`@supports (display: grid) or (${mix})`)).toBe(false);
		expect(isColorMixGatePrelude(`@supports (${mix}) or (display: grid)`)).toBe(false);
		// not an @supports at all
		expect(isColorMixGatePrelude('@media screen')).toBe(false);
		expect(isColorMixGatePrelude("[data-dse-theme='steel'] .dse-sb")).toBe(false);
		expect(isColorMixGatePrelude('@supports (display: grid)')).toBe(false);
	});

	it('CAN-FAIL PROOF (M-2): `not(...)` and a permissive `or` are reported, not silently accepted', () => {
		const mix = 'background: color-mix(in srgb, red 14%, blue)';
		const decl = '.a { background: #123; background: color-mix(in srgb, var(--x) 4%, blue); }';
		// Both of these were accepted as gates before the review and are entered by a
		// Chromium 106 engine — `not` EXCLUSIVELY so.
		const notGate = `@supports not (${mix}) {\n\t${decl}\n}`;
		const orGate = `@supports (display: grid) or (${mix}) {\n\t${decl}\n}`;
		const andGate = `.a { background: #123; }\n@supports (display: grid) and (${mix}) {\n\t${decl}\n}`;

		expect(findUngatedColorMixViolations(notGate)).toHaveLength(1);
		expect(findUngatedColorMixViolations(notGate)[0].kind).toBe('ungated');
		expect(findUngatedColorMixViolations(orGate)).toHaveLength(1);
		expect(findUngatedColorMixViolations(orGate)[0].kind).toBe('ungated');
		// the safe conjunction is still accepted, so the rule is not merely "reject anything odd"
		expect(findUngatedColorMixViolations(andGate)).toHaveLength(0);
	});

	it('detector sanity: the gate scan reports a usable source line', () => {
		const css = `.a {\n\tcolor: red;\n}\n\n.b {\n\tbackground: #123;\n\tbackground: color-mix(in srgb, var(--x) 4%, blue);\n}\n`;
		const v = findUngatedColorMixViolations(css);
		expect(v).toHaveLength(1);
		expect(v[0].line).toBe(7);
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

	it('detector sanity: the relative-color row actually fires (review M-1)', () => {
		// The bare `(from ` token can never match at an identifier boundary in real syntax —
		// it is always glued to the preceding function name (`rgb(from …`), so a naive
		// substring/boundary scan reports zero violations on every real instance. This is
		// the can-fail proof for that fix: each of the four relative-color functions must be
		// flagged, and an unrelated `background: rgb(255, 0, 0)` must NOT be a false positive.
		expect(findTokenViolations(`.a { background: rgb(from red r g b); }`)).toHaveLength(1);
		expect(findTokenViolations(`.b { background: hsl(from red h s l); }`)).toHaveLength(1);
		// hwb(), not oklch()/oklab()/lch() — those are separately denied rows and would
		// double-report (correctly — a `oklch(from …)` is above-floor two ways over).
		expect(findTokenViolations(`.c { color: hwb(from red h w b); }`)).toHaveLength(1);
		expect(findTokenViolations(`.d { color: color(from red srgb r g b); }`)).toHaveLength(1);
		expect(findTokenViolations(`.e { background: rgb(255, 0, 0); }`)).toHaveLength(0);
		// A same-property static fallback still clears it (remediation (a)).
		expect(
			findTokenViolations(`.f { background: #ff0000;\n\tbackground: rgb(from red r g b); }`),
		).toHaveLength(0);
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
