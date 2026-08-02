import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * The Steel TYPOGRAPHY & SPACING contract (Plan 21 Tasks 2–3).
 *
 * Sibling of `steelMaterial.test.ts` and built the same way: jsdom does not resolve custom
 * properties or the plugin's 16px→site-20px rem base out of a stylesheet, so this suite
 * asserts on the **rule text** of `styles-source.css` — that the Steel card families carry the
 * body-type identity Task 3 shipped (serif face, no tracking) and the open spacing Task 2
 * shipped (1.7 line-height, ~24px card inset). If a future edit routes the body back to a sans
 * stack, cramps the card, or re-adds the `.03em` tracking, an assertion here fails.
 *
 * The two traps `steelMaterial.test.ts` documents are real here too and handled identically:
 *
 *  1. **Comments are text.** `styles-source.css` documents each of these rules in prose that
 *     names the very selectors and values below, so a naive match binds to a comment. Every
 *     assertion matches against a COMMENT-STRIPPED copy of the file.
 *  2. **The Steel scope is written two ways.** Component rules use single quotes
 *     (`[data-dse-theme='steel']`); a double-quote-only matcher matches almost nothing in this
 *     file and every assertion would pass vacuously. The matcher accepts either quoting style.
 *
 * NOTE (C6 / Plan 21): there is deliberately **no `--dse-font-body` token**. Registering a
 * `--dse-*` token needs a `src/framework/tokens.ts` edit the plan forbids, so Task 3 routed the
 * body `font-family` directly to the existing `--dse-font-display` (which under Steel is the
 * embedded "Source Serif 4"). This suite asserts that real implementation, not a token that
 * does not exist.
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

// The card body node. Plan 21's parity `card` pair maps the site ability card to the plugin's
// `[data-dse-element='feature']` host; Task 2's line-height/padding rules still carry that exact
// per-family selector text (untouched by Plan 22 Task 1), so CARD_HOST stays a literal match for
// them.
const CARD_HOST = "[data-dse-element='feature']";

// Plan 22 Task 1 broadened the Task 3 body-font/ink rule from the four per-family selectors
// (`[data-dse-element='feature']`, `'featureblock'`, `.dse-sb`, `.dse-card`) to a single
// attribute-presence selector covering EVERY Steel element root — `[data-dse-element]` (the
// card families are subsumed, not parallel-ruled). CARD_HOST's literal `='feature'` substring no
// longer appears in that rule's selector list, so the font-identity assertion below looks it up
// via the broadened selector text instead.
const BODY_FONT_HOST = '[data-dse-element]:not([data-dse-error-stage])';

// Plan 22 Task 2 (Step 1): the bare attribute-presence form, with no `='<family>'` value. Used
// by the dedicated element-root contract test below, which locks the SHAPE of the selector
// (every element root, not an allow-list of card families) independently of the font-identity
// test above — a future edit could keep `font-family: var(--dse-font-display)` correct while
// re-scoping it back down to named families (e.g. reintroducing `[data-dse-element='feature']`
// alongside `.dse-sb`/`.dse-card`), which would still satisfy the font-identity assertion but
// silently reintroduce the C1 sans-body regression on every plugin-only family (hero, encounter,
// negotiation, montage, initiative, project, party, …). This test exists to catch that case too.
const ELEMENT_ROOT_SELECTOR = '[data-dse-element]';

describe('Steel typography & spacing contract', () => {
	// Sanity: if the parser or the scope matcher ever stops finding Steel rules, every
	// assertion below would pass vacuously. Fail loudly instead. (Mirrors steelMaterial.test.ts.)
	it('parses Steel-scoped rules out of styles-source.css', () => {
		expect(rules.length).toBeGreaterThan(100);
		expect(rules.filter((r) => STEEL_SCOPE.test(r.selector)).length).toBeGreaterThan(20);
		expect(steelBlocksFor(CARD_HOST).length).toBeGreaterThan(0);
	});

	describe('body type identity (Task 3)', () => {
		// (a) The site paints ONE slab face on title AND body; that licensed face can't be
		// bundled, so the plugin routes body/label text to the SAME serif the titles use —
		// --dse-font-display (Steel → embedded "Source Serif 4"). Asserted against the real
		// implementation: NO `--dse-font-body` token exists (C6). If this ever reverts to a sans
		// stack or an Obsidian text var, the card body stops being a serif and this fails.
		// Plan 22 Task 2 (Step 1): lock the CONTRACT that this routing lives on the element-root
		// selector — every `[data-dse-element]` host — not on an allow-list of the four original
		// card families. This is the guard the C1/C2 coherence fix (Plan 22 Task 1) exists to
		// protect: if the selector is ever narrowed back to named families
		// (`[data-dse-element='feature']`, `'featureblock'`, `.dse-sb`, `.dse-card`), the
		// plugin-only families (hero, encounter, negotiation, montage, initiative, project,
		// party, …) silently regress to a sans body again, even though the font-identity test
		// below would still pass for the families that remained covered.
		it('targets the body-font rule at the element-root selector, not an allow-list of card families', () => {
			const rootBlocks = rules.filter(
				(r) =>
					STEEL_SCOPE.test(r.selector) &&
					/:not\(\[data-dse-print="on"\]\)/.test(r.selector) &&
					r.selector.includes(ELEMENT_ROOT_SELECTOR),
			);
			expect(rootBlocks.length).toBeGreaterThan(0);
			expect(
				rootBlocks.some((r) => /font-family:\s*var\(--dse-font-display\)\s*;/.test(r.body)),
			).toBe(true);
		});

		it('routes the Steel card body font to var(--dse-font-display)', () => {
			const blocks = steelBlocksFor(BODY_FONT_HOST);
			expect(blocks.length).toBeGreaterThan(0);
			const withFont = blocks.filter((b) => /font-family:\s*[^;]+;/.test(b));
			expect(withFont.length).toBeGreaterThan(0);
			// The one font-family the Steel card host declares is --dse-font-display, and nothing
			// else (no sans stack, no --font-text/--font-ui override).
			expect(
				withFont.some((b) => /font-family:\s*var\(--dse-font-display\)\s*;/.test(b)),
			).toBe(true);
			for (const b of withFont) {
				const decl = b.match(/font-family:\s*([^;]+);/);
				if (decl) expect(decl[1].trim()).toBe('var(--dse-font-display)');
			}
		});

		// (d) The Legacy base gives .dse-feature `letter-spacing: 0.03em` (:41), which the harness
		// samples as 0.48px of body tracking; the site body is `normal`. Task 3 reset it to
		// `normal` under Steel only (base rule untouched, so Legacy is frozen). If the reset is
		// removed, the card body re-inherits the 0.03em tracking and this fails.
		it('resets the Steel card body letter-spacing to normal', () => {
			const blocks = steelBlocksFor('.dse-feature');
			expect(blocks.length).toBeGreaterThan(0);
			expect(blocks.some((b) => /letter-spacing:\s*normal\s*;/.test(b))).toBe(true);
		});
	});

	describe('body spacing (Task 2)', () => {
		// (b) The site body copy runs a 1.36 ratio on its 20px base = 27.2px computed; the plugin
		// was 24px (1.5). Task 2 wrote `line-height: 1.7` on the plate roots (1.7 × 16px = 27.2px).
		// Contract floor is >= 1.6 — the "open" body rhythm, well clear of the 1.5 it replaced.
		it('opens the Steel card body line-height to >= 1.6 (Task 2 wrote 1.7)', () => {
			const blocks = steelBlocksFor(CARD_HOST);
			expect(blocks.length).toBeGreaterThan(0);
			const found = blocks
				.map((b) => b.match(/line-height:\s*([\d.]+)\s*;/))
				.filter((m): m is RegExpMatchArray => m !== null);
			// Guard against a vacuous pass: a line-height declaration must actually be present.
			expect(found.length).toBeGreaterThan(0);
			expect(found.every((m) => parseFloat(m[1]) >= 1.6)).toBe(true);
		});

		// (c) The site ability card insets its content by a full ~24px (`.sc-ability` padding
		// 1.15rem 1.25rem 1.25rem @20px = 23/25/25/25). Task 2 wrote a single `padding: 1.5rem`
		// (1.5 × 16px = 24px) on the Steel card host — roomier than the 16px --dse-pad default.
		// Contract band is ~1.5rem (1.4–1.6rem). A revert to the cramped default fails this.
		it('opens the Steel card padding to ~1.5rem / 24px', () => {
			const blocks = steelBlocksFor(CARD_HOST);
			expect(blocks.length).toBeGreaterThan(0);
			const found = blocks
				.map((b) => b.match(/padding:\s*([\d.]+)rem\s*;/))
				.filter((m): m is RegExpMatchArray => m !== null);
			expect(found.length).toBeGreaterThan(0);
			expect(
				found.some((m) => {
					const rem = parseFloat(m[1]);
					return rem >= 1.4 && rem <= 1.6;
				}),
			).toBe(true);
		});
	});
});
