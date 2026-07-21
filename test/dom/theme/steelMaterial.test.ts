import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * The Steel MATERIAL contract (Plan 20 Task 7).
 *
 * jsdom does not resolve custom properties or compute gradients out of a stylesheet, so
 * this suite asserts on the **rule text** of `styles-source.css`: that the Steel theme's
 * material tokens carry live values and that each primitive that is supposed to be forged
 * actually paints a sheen / bevel / wash — and, just as importantly, that the surfaces the
 * site keeps FLAT stay flat.
 *
 * Why this exists: plan 19 shipped structurally-correct Steel markup with completely flat
 * surfaces and passed human review, because reviewers compared layout to screenshots.
 * Nothing could mechanically fail. These assertions are that mechanism.
 *
 * Two traps this file works around, both real in this repo:
 *
 *  1. **Comments are text.** `styles-source.css` documents its own selectors in prose, so a
 *     naive text match can bind to a comment instead of a rule (this already broke
 *     `test/dom/kit/powerRollPanel.test.ts` once). Everything below matches against a
 *     COMMENT-STRIPPED copy of the file.
 *  2. **The Steel scope is written two ways.** Component rules use single quotes
 *     (`[data-dse-theme='steel']`, usually plus `:not([data-dse-print="on"])`), while the
 *     token blocks use `[data-dse-element][data-dse-theme="steel"]` with double quotes.
 *     The matcher accepts either quoting style; a double-quote-only matcher would silently
 *     match nothing and every assertion would be vacuous.
 */

const rawCss = fs.readFileSync(
	path.join(__dirname, '..', '..', '..', 'styles-source.css'),
	'utf8',
);

/** Trap 1: strip `/* … *\/` comments before any matching. */
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');

/** Trap 2: both quoting styles of the theme scope. */
const STEEL_SCOPE = /\[data-dse-theme=['"]steel['"]\]/;

interface Rule {
	selector: string;
	body: string;
}

/** Flat list of every `selector { body }` in the file (no nested-brace constructs are used). */
const rules: Rule[] = (() => {
	const out: Rule[] = [];
	const re = /([^{}]+)\{([^{}]*)\}/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(css))) out.push({ selector: m[1].trim(), body: m[2] });
	return out;
})();

/** Every rule body whose selector list mentions `selector` AND is scoped to Steel. */
const steelBlocksFor = (selector: string): string[] =>
	rules
		.filter((r) => r.selector.includes(selector) && STEEL_SCOPE.test(r.selector))
		.map((r) => r.body);

/**
 * The dark Steel token block. `[data-dse-element][data-dse-theme="steel"]` appears again in
 * the print `@media` override (where every ornament token is reset to `none`/`inherit`), so
 * the FIRST textual occurrence — the live definitions — is the one under contract.
 */
const steelTokenBlock = (): string => {
	const rule = rules.find((r) => r.selector === '[data-dse-element][data-dse-theme="steel"]');
	expect(rule).toBeDefined();
	return (rule as Rule).body;
};

const lightSteelTokenBlock = (): string => {
	const rule = rules.find(
		(r) => r.selector === '.theme-light [data-dse-element][data-dse-theme="steel"]',
	);
	expect(rule).toBeDefined();
	return (rule as Rule).body;
};

describe('Steel material contract', () => {
	// Sanity: if the parser or the scope matcher ever stops finding Steel rules, every
	// assertion below would pass vacuously. Fail loudly instead.
	it('parses Steel-scoped rules out of styles-source.css', () => {
		expect(rules.length).toBeGreaterThan(100);
		expect(rules.filter((r) => STEEL_SCOPE.test(r.selector)).length).toBeGreaterThan(20);
	});

	describe('material tokens', () => {
		it.each([
			['--dse-metal', /--dse-metal:\s*#[0-9a-fA-F]{3,8}\s*;/],
			['--dse-metal-bright', /--dse-metal-bright:\s*#[0-9a-fA-F]{3,8}\s*;/],
			['--dse-sheen', /--dse-sheen:\s*linear-gradient\(/],
			['--dse-sheen-soft', /--dse-sheen-soft:\s*linear-gradient\(/],
			['--dse-chip-bevel', /--dse-chip-bevel:\s*[^;]*inset[^;]*;/],
		])('dark Steel defines %s with a live value (not none/inherit)', (_token, pattern) => {
			expect(pattern.test(steelTokenBlock())).toBe(true);
		});

		it.each([
			['--dse-metal', /--dse-metal:\s*#[0-9a-fA-F]{3,8}\s*;/],
			['--dse-metal-bright', /--dse-metal-bright:\s*#[0-9a-fA-F]{3,8}\s*;/],
			['--dse-sheen', /--dse-sheen:\s*linear-gradient\(/],
		])('light Steel keeps %s live', (_token, pattern) => {
			expect(pattern.test(lightSteelTokenBlock())).toBe(true);
		});
	});

	describe('head strips', () => {
		// `.dse-section__title` IS the section head strip — the plugin emits no
		// `.dse-section__head` node (see the "dead selectors" test below).
		it.each([['.dse-section__title'], ['.dse-pr__head']])(
			'%s carries the soft sheen under Steel',
			(selector) => {
				const blocks = steelBlocksFor(selector);
				expect(blocks.length).toBeGreaterThan(0);
				expect(
					blocks.some((b) => /background-image:\s*var\(--dse-sheen-soft\)/.test(b)),
				).toBe(true);
			},
		);

		it.each([['.dse-section__title'], ['.dse-pr__head']])(
			'%s carries a metal hairline under Steel',
			(selector) => {
				const blocks = steelBlocksFor(selector);
				expect(blocks.length).toBeGreaterThan(0);
				expect(
					blocks.some((b) => /border-bottom:\s*1px solid var\(--dse-metal-faint\)/.test(b)),
				).toBe(true);
			},
		);
	});

	describe('chips', () => {
		// The site has TWO chip surfaces and only one of them is forged. The card-head RAIL
		// chip (`.sc-head__slot--chip`, e.g. "Level 1" / "EV 3") is a flat outlined pill; the
		// ability COST corner (`.sc-ability__cost`) is the forged one. Asserting a sheen on
		// the rail chip would be asserting a divergence from the site.
		it('the forged cost chip carries the sheen and the chip bevel under Steel', () => {
			const blocks = steelBlocksFor('.dse-feature .dse-head__eyebrow--chip');
			expect(blocks.length).toBeGreaterThan(0);
			expect(blocks.some((b) => /background-image:\s*var\(--dse-sheen\)/.test(b))).toBe(true);
			expect(blocks.some((b) => /box-shadow:\s*var\(--dse-chip-bevel\)/.test(b))).toBe(true);
		});

		it('the rail chips stay FLAT and outlined under Steel', () => {
			const blocks = steelBlocksFor('.dse-head__deck--chip');
			expect(blocks.length).toBeGreaterThan(0);
			expect(blocks.some((b) => /background:\s*none/.test(b))).toBe(true);
			expect(blocks.some((b) => /border:\s*1px solid var\(--dse-border\)/.test(b))).toBe(true);
		});

		it('the rail chips are never forged (no sheen, no bevel)', () => {
			const blocks = steelBlocksFor('.dse-head__deck--chip');
			expect(blocks.length).toBeGreaterThan(0);
			for (const body of blocks) {
				expect(body).not.toMatch(/var\(--dse-sheen/);
				expect(body).not.toMatch(/var\(--dse-chip-bevel\)/);
			}
		});
	});

	describe('power-roll tiers', () => {
		it('tier rows carry a tier-coloured wash under Steel', () => {
			const blocks = steelBlocksFor('.dse-pr__row');
			expect(blocks.length).toBeGreaterThan(0);
			expect(
				blocks.some((b) => /background-image:\s*linear-gradient\([^;]*color-mix\(/.test(b)),
			).toBe(true);
		});

		it('the power-roll panel is framed under Steel', () => {
			const blocks = rules
				.filter((r) => STEEL_SCOPE.test(r.selector) && /\.dse-pr(?![\w-])/.test(r.selector))
				.map((r) => r.body);
			expect(blocks.length).toBeGreaterThan(0);
			expect(blocks.some((b) => /border:\s*1px solid var\(--dse-metal-faint\)/.test(b))).toBe(
				true,
			);
		});
	});

	describe('dead selectors', () => {
		// `.dse-section__head` is a plan-draft name that never existed in the DOM
		// (renderFeature.ts emits only `__title` + `__body`). It is named in the CSS prose,
		// which is exactly why this check runs against the comment-stripped copy: a rule for
		// it would be dead weight styling nothing, and would suggest the head-strip material
		// had been moved off the node that actually renders.
		it('styles-source.css defines no rule for the non-existent .dse-section__head', () => {
			expect(css).not.toContain('.dse-section__head');
		});
	});
});
