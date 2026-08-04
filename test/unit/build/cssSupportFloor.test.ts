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
//  3. It knows about `color-mix()` and nothing else. Other above-floor features
//     (`@container` style queries, relative color syntax `rgb(from …)`, `@property`,
//     `text-wrap: balance`, subgrid, `:has()` — note :has() shipped in Chromium 105 and IS
//     below the floor, so it is fine) are not scanned. When one is introduced, add it to
//     ABOVE_FLOOR_FUNCS or write a sibling check. CSS NESTING is deliberately not covered
//     here: cssNesting.test.ts already guards it, and it does so against the BUILT
//     styles.css, which is the stronger check for that particular feature.
//  4. Custom-property declarations (`--x: color-mix(…)`) are exempt: a custom property's
//     value is not parsed as a property value at declaration time, so an unsupported
//     function inside one does not invalidate anything until it is substituted. There are
//     none today; the exemption is documented so a future one is not mis-flagged.

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
