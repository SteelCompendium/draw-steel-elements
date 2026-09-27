import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * SC-318 round 2 — the h1-h6 HEADING SCALE tokens.
 *
 * jsdom cascades no `var()` and resolves no `calc()` out of a stylesheet (the same
 * limitation every source-text suite in this repo works around — see
 * `test/dom/theme/steelTypography.test.ts`'s own note), so this file asserts on the
 * `styles-source.css` SOURCE TEXT: the six `--dse-fs-h1`..`--dse-fs-h6` tokens are minted
 * in `:root` with Obsidian's own `h1`-`h6` ratios, and GROUP 1 (the screen-only h1-h6
 * base-typography block) uses them instead of the bare UA literals it used to restate.
 *
 * Every test here is proven to fail on `develop` (`5a20d5f`) and pass on this branch —
 * the tokens/rule text these tests match do not exist pre-SC-318 at all, so a match
 * returns `null`/fails a numeric comparison rather than merely reading a different value.
 * Verified live: reverting `styles-source.css`'s GROUP 1 + `:root` heading-scale edits and
 * re-running this file reproduces every failure below; restoring the edit turns the suite
 * green again (see `sc318-r2-implement-report.md`, "can-fail proof").
 */

const rawCss = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'styles-source.css'), 'utf8');
/** Strips block comments before any matching — several of this file's own comments name
 *  the exact selectors/values a naive matcher would otherwise bind to. */
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');
const flat = css.replace(/\s+/g, ' ');
const ANCHOR = ':is([data-dse-element], .dse-modal):not([data-dse-print="on"])';

/** The declared value of `--dse-<name>` in the FIRST `:root { … }` block that defines it. */
function rootValue(name: string): string | undefined {
	for (const block of css.matchAll(/:root\s*\{([^}]*)\}/g)) {
		const m = block[1].match(new RegExp(`(?:^|[\\s{;])--dse-${name}\\s*:\\s*([^;]+);`));
		if (m) return m[1].trim();
	}
	return undefined;
}

/** The leading `em` coefficient of a `calc(<N>em * var(--dse-fs-large-scale))` token value
 *  (or of a bare `<N>em`/`1em` token) — the number that ends up on the page at the default
 *  text size, when the large-scale knob is 1. */
function emCoefficient(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const m = value.match(/([\d.]+)em/);
	return m ? parseFloat(m[1]) : undefined;
}

describe('SC-318: the --dse-fs-h1..h6 heading-scale tokens exist in :root with Obsidian\'s own ratios', () => {
	it.each([
		['h1', 'calc(1.618em * var(--dse-fs-large-scale))'],
		['h2', 'calc(1.462em * var(--dse-fs-large-scale))'],
		['h3', 'calc(1.318em * var(--dse-fs-large-scale))'],
		['h4', 'calc(1.188em * var(--dse-fs-large-scale))'],
		['h5', 'calc(1.076em * var(--dse-fs-large-scale))'],
		['h6', 'calc(1em * var(--dse-fs-large-scale))'],
	])('--dse-fs-%s is exactly %s', (level, expected) => {
		expect(rootValue(`fs-${level}`)).toBe(expected);
	});
});

describe('SC-318: GROUP 1 h1-h6 font-size reads from the token, not a bare UA literal', () => {
	it.each(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])('%s', (tag) => {
		const m = flat.match(new RegExp(escape(`${ANCHOR} :where(${tag})`) + ' \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain(`font-size: var(--dse-fs-${tag});`);
	});
});

describe('SC-318: h6 in a card body is never smaller than body text (the UA literal it replaces, 0.67em, was)', () => {
	it('the h6 token\'s own em ratio is >= the body token\'s (1 >= 1), unlike the pre-SC-318 0.67em UA literal', () => {
		const h6 = emCoefficient(rootValue('fs-h6'));
		const body = emCoefficient(rootValue('fs-body'));
		expect(h6).toBeDefined();
		expect(body).toBeDefined();
		expect(h6!).toBeGreaterThanOrEqual(body!);
	});

	it('every level h1..h6 is a monotonically NON-increasing em ratio (h1 the largest, h6 the smallest/floor)', () => {
		const ratios = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((l) => emCoefficient(rootValue(`fs-${l}`))!);
		expect(ratios.every((r) => r !== undefined)).toBe(true);
		for (let i = 1; i < ratios.length; i++) {
			expect(ratios[i]).toBeLessThanOrEqual(ratios[i - 1]);
		}
	});
});

describe('SC-318: .dse-hero__name (h2) is pinned, not moved onto the h2 token', () => {
	it('carries its own explicit font-size, literally 1.5em — never var(--dse-fs-h2)', () => {
		const m = flat.match(new RegExp(escape(`${ANCHOR} .dse-hero__name`) + ' \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('font-size: 1.5em;');
		expect(m![1]).not.toMatch(/font-size:\s*var\(--dse-fs-h2\)/);
	});
});

/** Escapes regex metacharacters in a literal selector string. */
function escape(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
