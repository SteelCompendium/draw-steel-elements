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
 * NOTE (SC-105): Plan 21/22 originally routed body/label `font-family` directly to the single
 * "font-display" token (C6: `--dse-font-body` couldn't be registered without a
 * `src/framework/tokens.ts` edit those plans forbade). SC-105 replaced that one token with a
 * six-slot vocabulary (title/body/card-body/label/controls/mono) and Task 2 re-pointed every
 * consumer to its classified slot, retiring "font-display" entirely. This suite now asserts
 * the real, post-retirement implementation: the bare element-root Body rule targets
 * `--dse-font-body`, a separate higher-specificity Card-body rule targets
 * `--dse-font-card-body`, and a dedicated slot-chain contract locks the "Card-body = same as
 * Body" / "Label = same as Title" `var()`-chain default the SC-112 prefs UI depends on.
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
// card families are subsumed, not parallel-ruled). SC-105 Task 2 re-pointed this rule from the
// old "font-display" token to `--dse-font-body` — it's now the Body rule specifically, with a
// separate, higher-specificity Card-body rule (matched via CARD_HOST below) layered on top for
// the card-shaped hosts. CARD_HOST's literal `='feature'` substring does not appear in this
// rule's selector list, so the Body-font-identity assertion below looks it up via the
// broadened selector text instead.
const BODY_FONT_HOST = '[data-dse-element]:not([data-dse-error-stage])';

// Plan 22 Task 2 (Step 1): the bare attribute-presence form, with no `='<family>'` value. Used
// by the dedicated element-root contract test below, which locks the SHAPE of the selector
// (every element root, not an allow-list of card families) independently of the font-identity
// test above — a future edit could keep `font-family: var(--dse-font-body)` correct while
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

	describe('body type identity (Task 3; SC-105 Task 2 re-pointed Body/Card-body)', () => {
		// (a) The site paints ONE slab face on title AND body; that licensed face can't be
		// bundled, so the plugin routes body/label text to the SAME serif the titles use. SC-105
		// Task 2 re-pointed this from the single "font-display" slot to --dse-font-body (the
		// bare element-root Body rule) — asserted against the real implementation. If this ever
		// reverts to a sans stack or an Obsidian text var, the body stops being a serif and this
		// fails.
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
				rootBlocks.some((r) => /font-family:\s*var\(--dse-font-body\)\s*;/.test(r.body)),
			).toBe(true);
		});

		it('routes the Steel Body font (bare element roots) to var(--dse-font-body)', () => {
			const blocks = steelBlocksFor(BODY_FONT_HOST);
			expect(blocks.length).toBeGreaterThan(0);
			const withFont = blocks.filter((b) => /font-family:\s*[^;]+;/.test(b));
			expect(withFont.length).toBeGreaterThan(0);
			// The one font-family the Steel Body rule declares is --dse-font-body, and nothing
			// else (no sans stack, no --font-text/--font-ui override, no font-display).
			expect(
				withFont.some((b) => /font-family:\s*var\(--dse-font-body\)\s*;/.test(b)),
			).toBe(true);
			for (const b of withFont) {
				const decl = b.match(/font-family:\s*([^;]+);/);
				if (decl) expect(decl[1].trim()).toBe('var(--dse-font-body)');
			}
		});

		// SC-105 Task 2: the card-shaped hosts (statblock/feature/featureblock/D6-reference-card)
		// get their OWN, higher-specificity rule pointing at --dse-font-card-body — distinct from
		// the bare element-root Body rule above (see the styles-source.css comment at the Body
		// rule for the specificity nuance this split doesn't yet fully resolve, deferred to
		// SC-112). CARD_HOST (`[data-dse-element='feature']`) appears verbatim inside that rule's
		// `:is(...)` selector list, so steelBlocksFor(CARD_HOST) also picks up the line-height/
		// padding rules from the "body spacing" suite below — filtered out here by requiring a
		// font-family declaration, which only the Card-body rule has.
		it('routes the Steel Card-body font (statblock/feature/featureblock/card hosts) to var(--dse-font-card-body)', () => {
			const blocks = steelBlocksFor(CARD_HOST);
			expect(blocks.length).toBeGreaterThan(0);
			const withFont = blocks.filter((b) => /font-family:\s*[^;]+;/.test(b));
			expect(withFont.length).toBeGreaterThan(0);
			expect(
				withFont.some((b) => /font-family:\s*var\(--dse-font-card-body\)\s*;/.test(b)),
			).toBe(true);
			for (const b of withFont) {
				const decl = b.match(/font-family:\s*([^;]+);/);
				if (decl) expect(decl[1].trim()).toBe('var(--dse-font-card-body)');
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

// SC-105 Task 2 — the slot CHAIN contract. `--dse-font-card-body` and `--dse-font-label` are
// deliberately `var()`-chained to `--dse-font-body`/`--dse-font-title` (Scott's "same as
// Body"/"same as Title" ruling), NOT independent literals, so a future prefs UI (SC-112) can
// offer just 3 user-facing controls (Title/Body/Controls) while Card-body/Label track them
// automatically. This asserts the chain SHAPE directly against the raw CSS text — a future
// edit that accidentally hardcodes Card-body/Label to a literal value (e.g. copy-pasting the
// resolved font stack instead of the var() reference) breaks the "same as X" contract SC-112
// depends on, and this suite fails loudly instead of silently.
describe('font slot chain contract (SC-105 Task 2)', () => {
	const rootBodies = rules.filter((r) => r.selector === ':root').map((r) => r.body);
	const steelDarkBody = rules.find(
		(r) => r.selector === ':is([data-dse-element], .dse-modal)[data-dse-theme="steel"]',
	)?.body;

	const CARD_BODY_CHAIN = /--dse-font-card-body:\s*var\(--dse-font-body\)\s*;/;
	const LABEL_CHAIN = /--dse-font-label:\s*var\(--dse-font-title\)\s*;/;

	it('parses both value blocks (guard against a vacuous pass)', () => {
		expect(rootBodies.length).toBeGreaterThan(0);
		expect(steelDarkBody).toBeDefined();
	});

	it('Legacy root: --dse-font-card-body chains to var(--dse-font-body)', () => {
		expect(rootBodies.some((b) => CARD_BODY_CHAIN.test(b))).toBe(true);
	});

	it('Steel block: --dse-font-card-body chains to var(--dse-font-body)', () => {
		expect(CARD_BODY_CHAIN.test(steelDarkBody ?? '')).toBe(true);
	});

	it('Legacy root: --dse-font-label chains to var(--dse-font-title)', () => {
		expect(rootBodies.some((b) => LABEL_CHAIN.test(b))).toBe(true);
	});

	it('Steel block: --dse-font-label chains to var(--dse-font-title)', () => {
		expect(LABEL_CHAIN.test(steelDarkBody ?? '')).toBe(true);
	});
});

// SC-112 Task 3 — the Controls default flip. `--dse-font-controls` `var()`-chains to
// `--dse-font-body` (Scott's site-consistency ruling: Controls defaults to "same as Body").
// ROOT-CAUSE ADDENDUM: the :root chain ALONE cannot carry the theme swap — var() substitutes
// at computed-value time on the DECLARING element, so a :root chain flattens on <html> (and
// is invalid there: --font-text lives on body) and never sees the Steel block's
// --dse-font-body. The Steel block therefore re-declares the Controls chain itself, exactly
// like Card-body/Label — THAT declaration is what makes the token resolve on Steel roots.
// Print is explicitly pinned back to var(--font-text) in the neutral print block (later at
// equal specificity, so it beats the Steel-block chain) so the frozen *--steel-print.png set
// never moves. This suite locks the ROOT CHAIN + the STEEL CHAIN + the PIN directly against
// the raw CSS text, same "prove it can fail" discipline as the Card-body/Label chains above.
describe('Controls slot chain + print pin contract (SC-112 Task 3)', () => {
	const rootBodies = rules.filter((r) => r.selector === ':root').map((r) => r.body);
	const steelDarkBody = rules.find(
		(r) => r.selector === ':is([data-dse-element], .dse-modal)[data-dse-theme="steel"]',
	)?.body;
	const printNeutralBody = rules.find(
		(r) => r.selector === '[data-dse-element][data-dse-print="on"]',
	)?.body;

	const CONTROLS_CHAIN = /--dse-font-controls:\s*var\(--dse-font-body\)\s*;/;
	const CONTROLS_PRINT_PIN = /--dse-font-controls:\s*var\(--font-text\)\s*;/;

	it('parses all three value blocks (guard against a vacuous pass)', () => {
		expect(rootBodies.length).toBeGreaterThan(0);
		expect(steelDarkBody).toBeDefined();
		expect(printNeutralBody).toBeDefined();
	});

	it(':root — --dse-font-controls chains to var(--dse-font-body)', () => {
		expect(rootBodies.some((b) => CONTROLS_CHAIN.test(b))).toBe(true);
	});

	it('Steel block — --dse-font-controls RE-DECLARES the var(--dse-font-body) chain (the :root chain flattens on <html> and cannot carry the theme swap)', () => {
		expect(CONTROLS_CHAIN.test(steelDarkBody ?? '')).toBe(true);
	});

	it('neutral print block — --dse-font-controls is pinned to var(--font-text)', () => {
		expect(CONTROLS_PRINT_PIN.test(printNeutralBody ?? '')).toBe(true);
	});
});

// SC-112 Task 4 — slot independence. Two CSS debts deferred at SC-105 Task 2, paid off here:
// (a) the Body/Card-body specificity race meant the bare element-root Body rule's (0,4,0)
// compound always beat the Card-body rule's (0,3,0) `:is(...)` descendant form on the
// `[data-dse-element='feature']`/`'featureblock'` ROOTS (a descendant combinator can never
// match a root that carries `data-dse-theme` on itself) — Card-body now carries its own
// root-compound arm, the SAME shape as the Body rule's bare-root arm (including the
// `:not([data-dse-error-stage])` exclusion), placed after Body so it wins the tie; (b) ~9
// Label-shaped nodes (chip/eyebrow, section titles, statgrid labels, the roster header row,
// pr-head, tier-badge text, the EV/cost chip) rode the Body/Card-body ambient by inheritance
// with no explicit `font-family` of their own (sc105-font-tokens-design.md §1.B) — they now
// carry an explicit Steel-scoped `font-family: var(--dse-font-label)` pin. Both are pixel
// no-ops at defaults (the chains resolve identically today) but without them the Task 6
// pickers would silently do nothing for these nodes. Same comment-stripped/quote-tolerant
// source-text assertion style as the suites above.
describe('slot independence — Card-body root compound + Label pins (SC-112 Task 4)', () => {
	// The Card-body rule: the one whose body sets `--dse-font-card-body`'s CONSUMER
	// (font-family: var(--dse-font-card-body)), not the :root/Steel-block VALUE declarations
	// asserted above.
	const cardBodyRule = rules.find(
		(r) =>
			STEEL_SCOPE.test(r.selector) &&
			/font-family:\s*var\(--dse-font-card-body\)\s*;/.test(r.body),
	);

	// The Label rule: the one whose body sets font-family to var(--dse-font-label).
	const labelRule = rules.find(
		(r) =>
			STEEL_SCOPE.test(r.selector) && /font-family:\s*var\(--dse-font-label\)\s*;/.test(r.body),
	);

	it('parses both rules (guard against a vacuous pass)', () => {
		expect(cardBodyRule).toBeDefined();
		expect(labelRule).toBeDefined();
	});

	it('Card-body rule carries a root-compound arm that matches the feature/featureblock ROOTS directly (not just as a descendant)', () => {
		// The old descendant-only form `[data-dse-theme='steel'] :is(...[data-dse-element='feature']...)`
		// requires TWO elements (an ancestor carrying data-dse-theme, a separate descendant
		// carrying data-dse-element) and can never match a node that carries both attributes on
		// itself — which every `[data-dse-element='feature']`/`'featureblock'` root does (theme.ts's
		// apply() and the pipeline both stamp the SAME root). The fix's compound arm has NO space
		// between the theme-scope prefix and `:is(...)`/`[data-dse-element=...]` — same shape as the
		// Body rule's own bare-root arm — so it matches the root directly.
		const selector = cardBodyRule!.selector;
		// The compound form: STEEL_SCOPE immediately followed (no descendant space) by something
		// that names both 'feature' and 'featureblock', and carries the same error-stage exclusion
		// the Body rule's bare-root arm uses.
		expect(/\[data-dse-theme=['"]steel['"]\](?::not\([^)]*\))*:is\(/.test(selector)).toBe(true);
		expect(selector).toMatch(/\[data-dse-element=['"]feature['"]\]/);
		expect(selector).toMatch(/\[data-dse-element=['"]featureblock['"]\]/);
		expect(selector).toMatch(/:not\(\[data-dse-error-stage\]\)/);
	});

	it('Card-body rule still covers .dse-sb/.dse-card via the pre-existing descendant form', () => {
		expect(cardBodyRule!.selector).toMatch(/\.dse-sb/);
		expect(cardBodyRule!.selector).toMatch(/\.dse-card/);
	});

	it('Label rule pins .dse-section__title to var(--dse-font-label)', () => {
		expect(labelRule!.selector).toMatch(/\.dse-section__title/);
	});

	it('Label rule pins at least one statgrid label (.dse-sb__item-l or .dse-sb__kv-l) to var(--dse-font-label)', () => {
		expect(/\.dse-sb__item-l|\.dse-sb__kv-l/.test(labelRule!.selector)).toBe(true);
	});

	it('Label rule is Steel screen-only (excludes print)', () => {
		expect(labelRule!.selector).toMatch(/:not\(\[data-dse-print="on"\]\)/);
	});
});
