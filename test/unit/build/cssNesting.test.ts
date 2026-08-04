import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

// SC-122: esbuild's CSS pipeline only downlevels/flattens native CSS nesting when it has a
// *browser* target (e.g. "chrome106") — a JS-only target string like "es2018" never engages
// it, so nesting in styles-source.css was passing straight through into the built
// styles.css unflattened. Real Obsidian's bundled Electron/Chromium (as old as 106 on some
// desktop installs) has zero CSS-nesting support and silently drops nested rules at parse
// time, collapsing layout on every tracker family that used nested overrides (initiative,
// negotiation, hero, montage, party, project, encounter — see
// .superpowers/sdd/sc121-audit/nesting-verification.md for the full verification). This
// guard rebuilds the real production artifact and asserts it ships with zero genuine
// rule-in-rule nesting, so a future regression (e.g. someone reverting the browser target,
// or esbuild changing its downleveling behavior) fails loudly here instead of silently in
// the field.
//
// Deliberately reads the BUILT styles.css, not styles-source.css: the assertion is about
// what a real Obsidian install ends up loading, not about authoring style. The build runs
// once in beforeAll — `node esbuild.config.mjs production` is the exact command the repo's
// own `npm run build-no-check` uses to produce main.js/styles.css.

const repoRoot = path.resolve(__dirname, '../../..');

/**
 * Counts genuine CSS rule-in-rule nesting occurrences via a brace-depth walk, distinguishing
 * real nesting (a qualified rule opened directly inside another qualified rule — whether via
 * an explicit `&` selector or a bare nested selector) from at-rule nesting (rules living
 * inside `@media`/`@supports`/`@container`/`@layer`, which is ordinary non-nested CSS and
 * must NOT be flagged). Mirrors the methodology used in the SC-121 verification report.
 *
 * Frames are pushed on every `{` and popped on the matching `}`. A frame's `kind` is
 * "atrule" when the buffered selector text immediately before the `{` starts with `@`,
 * otherwise "rule". An occurrence is counted whenever a "rule" frame is opened while the
 * enclosing frame is also a "rule" frame (an at-rule parent, or the top level, does not
 * count). Comments and quoted strings are skipped so braces inside them can't desync the
 * walk; `:is(...)`/`:not(...)`-style parens are plain text to this walker and never open a
 * frame, so they can't produce false positives either.
 */
function countNestedRuleOccurrences(css: string): number {
	let i = 0;
	const n = css.length;
	let buf = '';
	const stack: Array<'rule' | 'atrule'> = [];
	let occurrences = 0;

	while (i < n) {
		const ch = css[i];

		// Skip /* ... */ comments entirely (don't let their contents affect the selector buffer).
		if (ch === '/' && css[i + 1] === '*') {
			const end = css.indexOf('*/', i + 2);
			i = end === -1 ? n : end + 2;
			continue;
		}

		// Skip quoted strings wholesale (content may contain braces, e.g. content: "{").
		if (ch === '"' || ch === "'") {
			const quote = ch;
			let j = i + 1;
			while (j < n && css[j] !== quote) {
				if (css[j] === '\\') j++; // skip escaped char
				j++;
			}
			i = j + 1;
			continue;
		}

		if (ch === '{') {
			const selector = buf.trim();
			const kind: 'rule' | 'atrule' = selector.startsWith('@') ? 'atrule' : 'rule';
			const parent = stack[stack.length - 1];
			if (kind === 'rule' && parent === 'rule') {
				occurrences++;
			}
			stack.push(kind);
			buf = '';
			i++;
			continue;
		}

		if (ch === '}') {
			stack.pop();
			buf = '';
			i++;
			continue;
		}

		if (ch === ';') {
			// A declaration terminator inside a rule body — nothing to carry into the next
			// selector buffer.
			buf = '';
			i++;
			continue;
		}

		buf += ch;
		i++;
	}

	return occurrences;
}

describe('SC-122: built styles.css ships with CSS nesting fully flattened', () => {
	let builtCss: string;

	beforeAll(() => {
		execFileSync('node', ['esbuild.config.mjs', 'production'], {
			cwd: repoRoot,
			stdio: 'inherit',
		});
		builtCss = readFileSync(path.join(repoRoot, 'styles.css'), 'utf8');
	});

	it('produces non-trivial CSS output', () => {
		expect(builtCss.length).toBeGreaterThan(1000);
	});

	it('contains zero genuine rule-in-rule nesting occurrences', () => {
		const occurrences = countNestedRuleOccurrences(builtCss);
		expect(occurrences).toBe(0);
	});

	it('detector sanity: still flags nesting in a synthetic unflattened sample', () => {
		const sample = `
			[data-dse-element="initiative"] .dse-init {
				position: relative;
				.dse-init__turn, .dse-cond {
					min-width: 0;
					&:hover { color: red; }
				}
			}
			@media (max-width: 600px) {
				.dse-statgrid { flex-direction: column; }
			}
			.foo:is(.bar, .baz) { color: blue; }
		`;
		// Two genuine occurrences: `.dse-init__turn, .dse-cond { ... }` nested inside
		// `.dse-init { ... }`, and `&:hover { ... }` nested inside that. The @media rule and
		// the :is() selector must not contribute any false positives.
		expect(countNestedRuleOccurrences(sample)).toBe(2);
	});
});
