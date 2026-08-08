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
 * The dark Steel token block. `:is([data-dse-element], .dse-modal)[data-dse-theme="steel"]`
 * appears again in the print `@media` override (where every ornament token is reset to
 * `none`/`inherit`), so the FIRST textual occurrence — the live definitions — is the one
 * under contract. Selector widened by SC-104 / FOLLOWUPS #31 (from the bare-presence
 * `[data-dse-element]`) so modals, which never carry data-dse-element, also resolve
 * Steel token values now that DseModal.open() stamps data-dse-theme on the dialog root.
 */
const steelTokenBlock = (): string => {
	const rule = rules.find(
		(r) => r.selector === ':is([data-dse-element], .dse-modal)[data-dse-theme="steel"]',
	);
	expect(rule).toBeDefined();
	return (rule as Rule).body;
};

const lightSteelTokenBlock = (): string => {
	const rule = rules.find(
		(r) => r.selector === '.theme-light :is([data-dse-element], .dse-modal)[data-dse-theme="steel"]',
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

	describe('plates', () => {
		// The site forges the statblock/featureblock plate HEAVIER than the ability card:
		// `.65rem` + `0 10px 26px rgba(0,0,0,.36)` (steel-statblock.css `.md-typeset.sb`,
		// steel-featureblock.css `.md-typeset.fb`) against the card's `0 8px 22px
		// rgba(0,0,0,.34)`. Both are non-flat, so `npm run parity` cannot see the difference
		// (README "Known blind spots" 3) — this is the mechanism that holds it.
		const plateBlocks = (): string[] =>
			rules
				.filter(
					(r) =>
						STEEL_SCOPE.test(r.selector) &&
						/\[data-dse-element='featureblock'\]/.test(r.selector) &&
						/\.dse-sb(?![\w-])/.test(r.selector),
				)
				.map((r) => r.body);

		it('the sb/fb plate takes the site’s heavier lift, not the card’s', () => {
			const blocks = plateBlocks();
			expect(blocks.length).toBeGreaterThan(0);
			expect(
				blocks.some((b) =>
					/box-shadow:\s*var\(--dse-bevel\),\s*0 10px 26px rgba\(0,\s*0,\s*0,\s*0?\.36\)/.test(b),
				),
			).toBe(true);
		});

		it('the sb/fb plate keeps a light-scheme lift of its own', () => {
			const blocks = rules
				.filter(
					(r) =>
						STEEL_SCOPE.test(r.selector) &&
						/body\.theme-light/.test(r.selector) &&
						/\.dse-sb(?![\w-])/.test(r.selector),
				)
				.map((r) => r.body);
			expect(blocks.length).toBeGreaterThan(0);
			expect(
				blocks.some((b) =>
					/box-shadow:\s*var\(--dse-bevel\),\s*0 5px 14px rgba\(0,\s*0,\s*0,\s*0?\.09\)/.test(b),
				),
			).toBe(true);
		});

		it('the sb/fb plate rounds at the site’s .65rem', () => {
			expect(plateBlocks().some((b) => /border-radius:\s*0?\.65rem/.test(b))).toBe(true);
		});

		// The sidebar initiative mount drops the OUTER lift (plate-inside-a-plate) and keeps
		// only the bevel. It needs a rule per scheme: the dark override is (0,5,0), which beats
		// the dark shared ground (0,4,0) but LOSES to the light shared ground's (0,5,1) — so
		// without a `body.theme-light` twin the override is dead in light mode.
		const sidebarBlocks = (light: boolean): string[] =>
			rules
				.filter(
					(r) =>
						STEEL_SCOPE.test(r.selector) &&
						/\.dse-sidebar/.test(r.selector) &&
						/body\.theme-light/.test(r.selector) === light,
				)
				.map((r) => r.body);

		it.each([
			['dark', false],
			['light', true],
		])('the sidebar plate drops the outer lift in %s', (_scheme, light) => {
			const blocks = sidebarBlocks(light as boolean);
			expect(blocks.length).toBeGreaterThan(0);
			expect(blocks.some((b) => /box-shadow:\s*var\(--dse-bevel\)\s*;/.test(b))).toBe(true);
			// bevel ONLY — any second shadow layer is the lift this rule exists to remove.
			for (const b of blocks) expect(b).not.toMatch(/box-shadow:[^;]*rgba\([^;]*\)\s*;/);
		});
	});

	describe('statblock notch (SC-103)', () => {
		// D4: the ◆ divider (kit/divider.ts) is a real DOM node mounted unconditionally by
		// statblock/view.ts:272 and asserted by three other test files (statblock.test.ts,
		// kit/divider.test.ts, kit/kit-index.test.ts). It cannot move in TS without breaking
		// Legacy, so Steel hides the node here and paints the site's role-hued notch
		// (steel-statblock.css:97-103) as a ::after on the head band instead.

		it('suppresses .dse-hr EXACTLY under .dse-sb, and nowhere else in the sheet', () => {
			// A whole-file scan (not merely a Steel-scoped one) so a stray legacy/global
			// suppression — which would break the three divider-asserting test files — fails
			// this test too, not just the wrong one. Scoped to .dse-sb specifically: the
			// SC-101 fix round (M-1) added the featureblock's OWN `.dse-fb > .dse-hr`
			// suppression (asserted in its own describe block below), so an unscoped filter
			// now matches two rules.
			const suppressions = rules.filter(
				(r) =>
					/display:\s*none\s*;/.test(r.body) &&
					/\.dse-hr\b/.test(r.selector) &&
					r.selector.includes('.dse-sb'),
			);
			expect(suppressions).toHaveLength(1);
			const [rule] = suppressions;
			// FOLLOWUPS #56 (candidate A): [data-dse-role]-GATED, matching the notch below.
			expect(rule.selector.replace(/\s+/g, ' ').trim()).toBe(
				"[data-dse-theme='steel'] .dse-sb[data-dse-role] > .dse-hr",
			);
			expect(STEEL_SCOPE.test(rule.selector)).toBe(true);
		});

		// FOLLOWUPS #56 — THE STRUCTURAL INVARIANT. SC-103 shipped a suppression and a
		// replacement for the SAME visual job (the statblock's section break) with DIFFERENT
		// conditions: the suppression fired always, the replacement only under
		// [data-dse-role]. A roleless statblock therefore satisfied the "hide" arm and not
		// the "paint" arm, and its section break vanished — band, notch and ◆ all absent, the
		// chars→features gap collapsing 28px → 8px. Nothing could fail; there was no roleless
		// fixture (there is now: test/fixtures/statblock/roleless-corpus.yaml). The general
		// rule this locks is cheap and total: a suppression and its replacement must agree
		// on WHEN they apply, per family. The two families legitimately choose DIFFERENT
		// gates (the sb band is role-gated, the fb band is unconditional and hue-chains to
		// the malice grey) — what may never differ is the two halves within one family.
		/** Does this selector's `.dse-sb`/`.dse-fb` compound carry the [data-dse-role] gate? */
		function roleGate(selector: string, family: 'sb' | 'fb'): boolean {
			// `(?![\w-])` keeps `.dse-sb__item` / `.dse-fb__stats` from matching the family
			// compound — without it a BEM sibling would silently read as "ungated".
			const re = new RegExp(`\\.dse-${family}(?![\\w-])((?:\\[[^\\]]+\\])*)`);
			const m = re.exec(selector);
			if (!m) throw new Error(`selector never mentions .dse-${family}: ${selector}`);
			return m[1].includes('[data-dse-role]');
		}

		const selectorOf = (needle: string): string => {
			const found = rules.filter((r) => r.selector.replace(/\s+/g, ' ').trim() === needle);
			expect(found).toHaveLength(1);
			return found[0].selector.replace(/\s+/g, ' ').trim();
		};

		it('FOLLOWUPS #56: within each family the .dse-hr suppression and the replacement notch carry the SAME [data-dse-role] gate', () => {
			const sbSuppression = selectorOf("[data-dse-theme='steel'] .dse-sb[data-dse-role] > .dse-hr");
			const sbNotch = selectorOf(
				"[data-dse-theme='steel'] .dse-sb[data-dse-role] > .dse-head::after",
			);
			expect(roleGate(sbSuppression, 'sb')).toBe(roleGate(sbNotch, 'sb'));
			// …and specifically GATED for the statblock, whose band is itself gated.
			expect(roleGate(sbSuppression, 'sb')).toBe(true);

			const fbSuppression = selectorOf("[data-dse-theme='steel'] .dse-fb > .dse-hr");
			const fbNotch = selectorOf("[data-dse-theme='steel'] .dse-fb > .dse-head::after");
			expect(roleGate(fbSuppression, 'fb')).toBe(roleGate(fbNotch, 'fb'));
			// …and specifically UNGATED for the featureblock, whose band is unconditional.
			expect(roleGate(fbSuppression, 'fb')).toBe(false);
		});

		it('the gate-symmetry detector HAS TEETH: it reports the exact pre-#56 asymmetry, and is not fooled by BEM siblings', () => {
			// The shipped-and-broken pair SC-103 landed: hide always, paint only when roled.
			expect(roleGate("[data-dse-theme='steel'] .dse-sb > .dse-hr", 'sb')).toBe(false);
			expect(
				roleGate("[data-dse-theme='steel'] .dse-sb[data-dse-role] > .dse-head::after", 'sb'),
			).toBe(true);
			// A `.dse-sb__*` descendant must not be mistaken for the family compound.
			expect(roleGate("[data-dse-theme='steel'] .dse-sb[data-dse-role] .dse-sb__item", 'sb')).toBe(
				true,
			);
			// And a selector that never names the family is a loud error, never a silent false.
			expect(() => roleGate("[data-dse-theme='steel'] .dse-fb > .dse-hr", 'sb')).toThrow();
		});

		it('leaves the shared .dse-hr kit primitive\'s base rule alone — Legacy stays display:flex', () => {
			const base = rules.find((r) => r.selector.trim() === '.dse-hr');
			expect(base).toBeDefined();
			expect(base!.body).toMatch(/display:\s*flex\s*;/);
		});

		it('gives the head band position:relative on a structure-tier twin (S-1(a): reaches print)', () => {
			const twin = rules.find(
				(r) =>
					r.selector.trim() === "[data-dse-theme='steel'] .dse-sb[data-dse-role] > .dse-head",
			);
			expect(twin).toBeDefined();
			expect(twin!.body).toMatch(/position:\s*relative\s*;/);

			// the pre-existing MATERIAL twin (background/border) keeps its print exclusion —
			// this notch work must not loosen that rule's tier.
			const material = rules.find(
				(r) =>
					r.selector.trim() ===
					'[data-dse-theme=\'steel\']:not([data-dse-print="on"]) .dse-sb[data-dse-role] > .dse-head',
			);
			expect(material).toBeDefined();
			expect(material!.body).not.toMatch(/position:\s*relative/);
		});

		it('paints a 9px role-hued ::after notch, structure tier, under Steel only', () => {
			// Scoped to .dse-sb specifically: the SC-101 fix round (M-1) gave the featureblock
			// its own twin (`.dse-fb > .dse-head::after`, below), so a bare '.dse-head::after'
			// filter now matches two rules — one per family.
			const afters = rules.filter(
				(r) => r.selector.includes('.dse-sb') && r.selector.includes('.dse-head::after'),
			);
			expect(afters).toHaveLength(1);
			const [rule] = afters;
			expect(rule.selector.replace(/\s+/g, ' ').trim()).toBe(
				"[data-dse-theme='steel'] .dse-sb[data-dse-role] > .dse-head::after",
			);
			expect(STEEL_SCOPE.test(rule.selector)).toBe(true);

			const body = rule.body;
			expect(body).toMatch(/content:\s*''\s*;/);
			expect(body).toMatch(/position:\s*absolute\s*;/);
			expect(body).toMatch(/width:\s*9px\s*;/);
			expect(body).toMatch(/height:\s*9px\s*;/);
			expect(body).toMatch(/rotate\(45deg\)/);
			// role-hued (S-2(a) full site fidelity) — not the neutral --dse-rule the old
			// .dse-hr diamond used.
			expect(body).toMatch(/background:\s*var\(--dse-role\)\s*;/);
			expect(body).not.toMatch(/var\(--dse-rule\)/);
		});

		it('the notch halo carries a flat fallback before its color-mix() enhancement (support floor, SC-121 M-1)', () => {
			const rule = rules.find(
				(r) =>
					r.selector.trim() ===
					"[data-dse-theme='steel'] .dse-sb[data-dse-role] > .dse-head::after",
			);
			expect(rule).toBeDefined();
			const boxShadows = Array.from(rule!.body.matchAll(/box-shadow:[^;]+;/g)).map((m) => m[0]);
			expect(boxShadows).toHaveLength(2);
			expect(boxShadows[0]).not.toMatch(/color-mix/);
			expect(boxShadows[1]).toMatch(
				/color-mix\(in srgb, var\(--dse-role\) 40%, var\(--dse-surface\)\)/,
			);
		});
	});

	describe('featureblock notch twin (SC-101 fix round, M-1)', () => {
		// Task 2 deferred this twin to "if S-4 = (a)"; Task 5 made S-4 = (a) (the nested-card
		// frame is SHARED) but shipped without it — closed here. Unlike the statblock twin,
		// the fb band is UNCONDITIONAL (no [data-dse-role] gate, unmapped types still band via
		// the var(--dse-role, var(--dse-role-leader)) fallback), so the suppression/notch here
		// must NOT be gated on [data-dse-role] either — gating it would silently drop the notch
		// on every malice/unmapped-type block.

		it('suppresses .dse-hr EXACTLY under .dse-fb, and nowhere else in the sheet', () => {
			const suppressions = rules.filter(
				(r) => /display:\s*none\s*;/.test(r.body) && /\.dse-hr\b/.test(r.selector),
			);
			// Exactly two suppressions in the whole sheet: the statblock's (above) and this one.
			expect(suppressions).toHaveLength(2);
			const fb = suppressions.find((r) => r.selector.includes('.dse-fb'));
			expect(fb).toBeDefined();
			expect(fb!.selector.replace(/\s+/g, ' ').trim()).toBe(
				"[data-dse-theme='steel'] .dse-fb > .dse-hr",
			);
			expect(STEEL_SCOPE.test(fb!.selector)).toBe(true);
		});

		it('gives the fb head band position:relative on a structure-tier twin, UNGATED on [data-dse-role]', () => {
			const twin = rules.find(
				(r) => r.selector.trim() === "[data-dse-theme='steel'] .dse-fb > .dse-head",
			);
			expect(twin).toBeDefined();
			expect(twin!.body).toMatch(/position:\s*relative\s*;/);

			// the pre-existing MATERIAL twin (background/border) keeps its print exclusion.
			const material = rules.find(
				(r) =>
					r.selector.trim() ===
					'[data-dse-theme=\'steel\']:not([data-dse-print="on"]) .dse-fb > .dse-head',
			);
			expect(material).toBeDefined();
			expect(material!.body).not.toMatch(/position:\s*relative/);
		});

		it('paints a 9px notch on .dse-fb, hue-chained to the same fallback as the band, structure tier', () => {
			// Exactly two `.dse-head::after` rules total: the statblock's (role-gated) and this
			// one (ungated) — a future per-family fork or a third copy fails here.
			const afters = rules.filter((r) => r.selector.includes('.dse-head::after'));
			expect(afters).toHaveLength(2);

			const fb = afters.find((r) => r.selector.includes('.dse-fb'));
			expect(fb).toBeDefined();
			expect(fb!.selector.replace(/\s+/g, ' ').trim()).toBe(
				"[data-dse-theme='steel'] .dse-fb > .dse-head::after",
			);
			expect(STEEL_SCOPE.test(fb!.selector)).toBe(true);
			// NOT gated on [data-dse-role] — the fb band isn't either.
			expect(fb!.selector).not.toContain('[data-dse-role]');

			const body = fb!.body;
			expect(body).toMatch(/content:\s*''\s*;/);
			expect(body).toMatch(/position:\s*absolute\s*;/);
			expect(body).toMatch(/width:\s*9px\s*;/);
			expect(body).toMatch(/height:\s*9px\s*;/);
			expect(body).toMatch(/rotate\(45deg\)/);
			// Same hue fallback chain as the band above it, not the statblock's bare --dse-role.
			expect(body).toMatch(/background:\s*var\(--dse-role,\s*var\(--dse-role-leader\)\)\s*;/);
			expect(body).not.toMatch(/var\(--dse-rule\)/);

			const boxShadows = Array.from(body.matchAll(/box-shadow:[^;]+;/g)).map((m) => m[0]);
			expect(boxShadows).toHaveLength(2);
			expect(boxShadows[0]).not.toMatch(/color-mix/);
			expect(boxShadows[1]).toMatch(
				/color-mix\(in srgb, var\(--dse-role,\s*var\(--dse-role-leader\)\) 40%, var\(--dse-surface\)\)/,
			);
		});

		it('no rule reaches print (S-1(a): structure tier, no print exclusion needed)', () => {
			const fbNotchRules = rules.filter(
				(r) =>
					STEEL_SCOPE.test(r.selector) &&
					(r.selector.trim() === "[data-dse-theme='steel'] .dse-fb > .dse-hr" ||
						r.selector.trim() === "[data-dse-theme='steel'] .dse-fb > .dse-head" ||
						r.selector.trim() === "[data-dse-theme='steel'] .dse-fb > .dse-head::after"),
			);
			expect(fbNotchRules).toHaveLength(3);
			for (const r of fbNotchRules) {
				expect(r.selector).not.toMatch(/:not\(\[data-dse-print="on"\]\)/);
			}
		});
	});

	describe('standalone ornate horizontal rule (SC-128 variant 1)', () => {
		// The site ships TWO ◆ rules. Variant 2 (the 9px ◆ on a solid line, no dots/fade) is
		// the statblock head band's bottom edge and is ALREADY shipped verbatim by SC-103's
		// notch above — the block here is variant 1 only: the ornate content rule the site
		// gives a bare markdown `---` (`.md-typeset hr`, steel-redesign.css:356-379), ported
		// onto the standalone ds-hr / ds-horizontal-rule element.
		const SCOPE = "[data-dse-theme='steel'][data-dse-element='horizontal-rule']:not([data-dse-print=\"on\"])";
		const ornate = rules.filter((r) =>
			r.selector.replace(/\s+/g, ' ').trim().startsWith(SCOPE),
		);
		const bodyOf = (suffix: string): string => {
			const found = ornate.filter(
				(r) => r.selector.replace(/\s+/g, ' ').trim() === `${SCOPE} ${suffix}`,
			);
			expect(found).toHaveLength(1);
			return found[0].body;
		};

		it('is HOST-scoped to the horizontal-rule element, never to the bare .dse-hr kit primitive', () => {
			// `.dse-hr` is shared by FOUR surfaces (this element, .dse-sb, .dse-fb and the
			// ConditionSelectModal's .dse-cond-list), three of which the site draws
			// differently or not at all — and FOLLOWUPS #56's roleless statblock now keeps a
			// `.dse-sb > .dse-hr` that must stay a plain section break, not become an
			// ornament. A bare `.dse-hr` rule would reach all four and move frozen shots.
			expect(ornate.length).toBeGreaterThan(0);
			for (const r of ornate) {
				expect(STEEL_SCOPE.test(r.selector)).toBe(true);
				expect(r.selector).toContain("[data-dse-element='horizontal-rule']");
				// Material tier: the whole rule is colour/ornament, so it stays out of print.
				expect(r.selector).toContain(':not([data-dse-print="on"])');
			}
			// No OTHER Steel rule anywhere in the sheet paints the kit rule's parts, which is
			// what keeps the other three surfaces (and their frozen shots) untouched.
			const unscopedOrnament = rules.filter(
				(r) =>
					STEEL_SCOPE.test(r.selector) &&
					/\.dse-hr(__line|__diamond|::before)/.test(r.selector) &&
					!r.selector.includes("[data-dse-element='horizontal-rule']"),
			);
			expect(unscopedOrnament).toEqual([]);
		});

		it('the ◆ is the site 9px haloed diamond, and clears every Legacy base declaration it must', () => {
			const body = bodyOf('.dse-hr__diamond');
			expect(body).toMatch(/width:\s*9px\s*;/);
			expect(body).toMatch(/height:\s*9px\s*;/);
			// The site's own redesign rule resets these for the same reason: the Legacy base
			// declares 2px bottom/right borders that would snag the new diamond's edges.
			expect(body).toMatch(/border:\s*none\s*;/);
			// A bare rotate — the base's translateZ/translateY nudge must not survive.
			expect(body).toMatch(/transform:\s*rotate\(45deg\)\s*;/);
			expect(body).not.toMatch(/translateZ|translateY/);
			expect(body).toMatch(/background-color:\s*var\(--dse-metal\)\s*;/);
			// Two OUTER rings replacing the base's inset punch-out: 4px of page background,
			// then the 1px --dse-metal-faint edge that makes it read as "bordered".
			expect(body).toMatch(/0 0 0 4px var\(--dse-page-bg, var\(--dse-surface\)\)/);
			expect(body).toMatch(/0 0 0 5px var\(--dse-metal-faint\)/);
			expect(body).not.toMatch(/inset/);
		});

		it('the two seed dots are a verbatim port of the site\'s hr::before (48×4 box, r1.4/1.9 at ±22px)', () => {
			const body = bodyOf('.dse-hr::before');
			expect(body).toMatch(/content:\s*''\s*;/);
			expect(body).toMatch(/position:\s*absolute\s*;/);
			expect(body).toMatch(/width:\s*48px\s*;/);
			expect(body).toMatch(/height:\s*4px\s*;/);
			expect(body).toMatch(/transform:\s*translate\(-50%, -50%\)\s*;/);
			const dots = Array.from(
				body.matchAll(/radial-gradient\(circle, var\(--dse-metal\) 1\.4px, transparent 1\.9px\)/g),
			);
			expect(dots).toHaveLength(2);
			expect(body).toMatch(/no-repeat left center/);
			expect(body).toMatch(/no-repeat right center/);
		});

		it('the lines are the site\'s 1px outward fade ending 30px short of centre', () => {
			expect(bodyOf('.dse-hr__line')).toMatch(/height:\s*1px\s*;/);
			// transparent OUTWARD, --dse-metal-line inward — the site's exact gradient.
			expect(bodyOf('.dse-hr__line--left')).toMatch(
				/background:\s*linear-gradient\(to right, transparent, var\(--dse-metal-line\)\)\s*;/,
			);
			expect(bodyOf('.dse-hr__line--right')).toMatch(
				/background:\s*linear-gradient\(to left, transparent, var\(--dse-metal-line\)\)\s*;/,
			);
			// The site sizes both halves `calc(50% - 30px)` on one node; the kit DOM has two
			// flex children, so the same 30px gap is 4.5px (half the ◆) + 25.5px of margin.
			expect(bodyOf('.dse-hr__line--left')).toMatch(/margin-right:\s*25\.5px\s*;/);
			expect(bodyOf('.dse-hr__line--right')).toMatch(/margin-left:\s*25\.5px\s*;/);
		});

		it('reserves the halo\'s own extent so a code block need not borrow prose margins', () => {
			// 9px rotated (half-diagonal 6.364px) + the 5px outer ring = 11.364px each side.
			expect(bodyOf('.dse-hr')).toMatch(/height:\s*23px\s*;/);
		});

		it('leaves the kit primitive\'s Legacy base geometry untouched (14px ◆, 2px lines)', () => {
			const base = rules.find((r) => r.selector.trim() === '.dse-hr__diamond');
			expect(base).toBeDefined();
			expect(base!.body).toMatch(/width:\s*14px\s*;/);
			expect(base!.body).toMatch(/inset 0 0 0 3px var\(--dse-page-bg\)/);
			const line = rules.find((r) => r.selector.trim() === '.dse-hr__line');
			expect(line!.body).toMatch(/height:\s*2px\s*;/);
		});
	});

	describe('standalone spine removed (SC-102 part 2)', () => {
		// D3: the site draws the accent spine ONLY inside a nested statblock/featureblock
		// feature list (.sb__feat / .fb__feat) — the standalone ability page (.sc-ability)
		// has NO border-left anywhere. The plugin's discriminator is the pipeline-root
		// attribute [data-dse-element='feature'], present ONLY on the standalone Feature
		// element's mount and never on a card nested under .dse-sb/.dse-fb (those pipeline
		// roots carry data-dse-element="statblock"/"featureblock" instead — see
		// renderFeature.ts's header comment and statblock/featureblock view.ts's
		// renderFeatureList calls).

		it('suppresses the spine bar EXACTLY under the standalone pipeline root, and nowhere else in the sheet', () => {
			// A whole-file scan (not merely Steel-scoped), so a stray suppression that
			// ALSO reached the nested/nested-list context — which would break Task 3's
			// villain statblock spines — fails this test too, not just the wrong one.
			const suppressions = rules.filter(
				(r) =>
					/display:\s*none\s*;/.test(r.body) &&
					/\.dse-feature\[data-dse-act\]::before/.test(r.selector),
			);
			expect(suppressions).toHaveLength(1);
			const [rule] = suppressions;
			// COMPOUND, no space, between the theme and element attribute selectors — the
			// pipeline stamps data-dse-theme AND data-dse-element on the SAME root node
			// (pipeline.ts), never on ancestor/descendant nodes. A descendant-combinator
			// form (a space there) asks the root to be its own descendant and matches
			// NOTHING — a real regression this repo hit once already (ground-truth
			// verified with a live Playwright DOM dump, not assumed).
			expect(rule.selector.replace(/\s+/g, ' ').trim()).toBe(
				"[data-dse-theme='steel'][data-dse-element='feature'] .dse-feature[data-dse-act]::before",
			);
			expect(STEEL_SCOPE.test(rule.selector)).toBe(true);
		});

		it('never regresses to the descendant-combinator form (theme/element attrs share ONE node, not two)', () => {
			// The footgun this guards: pipeline.ts stamps data-dse-theme and
			// data-dse-element on the same createDiv() root, so
			// "[data-dse-theme='steel'] [data-dse-element='feature']" (WITH a space) is
			// syntactically valid CSS that silently matches zero elements — the freeze
			// check would report NO mismatch (the rule is a no-op), not a failure, so this
			// must be asserted directly rather than left to visual review.
			const broken = rules.filter((r) =>
				/\[data-dse-theme=['"]steel['"]\]\s+\[data-dse-element=['"]feature['"]\]/.test(
					r.selector,
				),
			);
			expect(broken).toHaveLength(0);
		});

		it('leaves the shared spine base rule alone — nested cards (statblock/featureblock) still draw it', () => {
			const base = rules.find(
				(r) => r.selector.trim() === '.dse-feature[data-dse-act]::before',
			);
			expect(base).toBeDefined();
			expect(base!.body).toMatch(/background:\s*var\(--dse-act,\s*none\)\s*;/);
			// The base rule itself carries no display suppression — only the
			// standalone-scoped twin (asserted above) does.
			expect(base!.body).not.toMatch(/display:\s*none/);
		});

		it('drops the reserved lane for the standalone card ONLY — the general nested-lane rule is untouched', () => {
			const nestedLane = rules.find(
				(r) => r.selector.trim() === "[data-dse-theme='steel'] .dse-feature[data-dse-act]",
			);
			expect(nestedLane).toBeDefined();
			expect(nestedLane!.body).toMatch(/padding-left:\s*calc\(3px \+ 0\.55em\)\s*;/);

			const standaloneLane = rules.find(
				(r) =>
					r.selector.trim() ===
					"[data-dse-theme='steel'][data-dse-element='feature'] .dse-feature[data-dse-act]",
			);
			expect(standaloneLane).toBeDefined();
			expect(standaloneLane!.body).toMatch(/padding-left:\s*0\s*;/);
		});

		it('is structure tier — no print exclusion, so it reaches print (S-1(a))', () => {
			const standalone = rules.filter(
				(r) =>
					r.selector.includes("[data-dse-element='feature']") &&
					/\.dse-feature\[data-dse-act\]/.test(r.selector),
			);
			expect(standalone.length).toBeGreaterThan(0);
			for (const r of standalone) {
				expect(r.selector).not.toMatch(/:not\(\[data-dse-print="on"\]\)/);
			}
		});

		it('the --dse-act alias itself is untouched — only the bar is removed, not the tint', () => {
			// Nothing in this change may set --dse-act to none/unset under the standalone
			// scope; the crest glyph (styles-source.css ~4112) still keys off it.
			const standaloneRules = rules.filter((r) =>
				r.selector.includes("[data-dse-element='feature']"),
			);
			for (const r of standaloneRules) {
				expect(r.body).not.toMatch(/--dse-act\s*:/);
			}
		});
	});

	/**
	 * SC-101 — the nested-card FRAME (S-4 = SHARED) and the featureblock option COST.
	 *
	 * Two halves of one site look, both reachable as Steel-scoped CSS (plan-25 D2):
	 *  • every statblock/featureblock option is its own card (`[data-sb-featstyle="card"]
	 *    .sb__feat` / `[data-fb-featstyle="card"] .fb__feat` — byte-identical recipes,
	 *    `card` is the shipped default for both), separated by a real `gap` on the list;
	 *  • a FEATUREBLOCK option's cost is display text on the name's row (`hMini`), where a
	 *    STATBLOCK option's cost is a chip (`hChip`) — a per-family split the site makes in
	 *    its generator, so the plugin must not "unify" it.
	 *
	 * These assertions exist because the earlier plugin look (one continuous accent rail,
	 * costs in outlined pills) was structurally wrong in a way no gate could see: N discrete
	 * per-option spines fused by padding-only rhythm read as a single bar, and the freeze
	 * gate is byte-comparison, so it cannot tell "correct" from "plausible".
	 */
	describe('nested-card frame + featureblock option cost (SC-101)', () => {
		const FRAME_ANCHOR = ":is(.dse-sb, .dse-fb) .dse-feature__nested > .dse-feature";
		/** Every rule whose selector targets a nested option card (any family shape). */
		const nestedOptionRules = rules.filter((r) =>
			/\.dse-feature__nested\s*>\s*\.dse-feature/.test(r.selector),
		);

		it('draws the frame with ONE shared mechanism naming BOTH families (S-4)', () => {
			// The frame's geometry lives in exactly one rule, and that rule's anchor is the
			// two-family :is() — not a per-family copy. A future fork ("just add a
			// .dse-fb-only frame") produces either two rules or a single-family anchor, and
			// fails here.
			const frame = rules.filter(
				(r) =>
					STEEL_SCOPE.test(r.selector) &&
					r.selector.includes(FRAME_ANCHOR) &&
					/border-radius:\s*9px/.test(r.body),
			);
			expect(frame).toHaveLength(1);
			expect(frame[0].selector).toContain(':is(.dse-sb, .dse-fb)');
			// site: padding .7rem .85rem .78rem (written as longhands here so the act-lane
			// and flat-mode overrides can each move one side without order fragility).
			expect(frame[0].body).toMatch(/padding-top:\s*0\.7rem/);
			expect(frame[0].body).toMatch(/padding-right:\s*0\.85rem/);
			expect(frame[0].body).toMatch(/padding-bottom:\s*0\.78rem/);
		});

		it('never forks the frame into a single-family rule', () => {
			// Any Steel rule that paints frame geometry/fill on a nested option must go
			// through the shared :is() anchor. A `.dse-fb .dse-feature__nested > .dse-feature`
			// (or `.dse-sb …`) rule carrying the recipe is the fork this pins against.
			const forks = nestedOptionRules.filter(
				(r) =>
					STEEL_SCOPE.test(r.selector) &&
					!r.selector.includes(':is(.dse-sb, .dse-fb)') &&
					/(border-radius:\s*9px|background:\s*rgba\(0,\s*0,\s*0,\s*0\.(16|022)\))/.test(r.body),
			);
			expect(forks).toHaveLength(0);
		});

		it('separates consecutive options with a REAL gap on the list, not padding rhythm', () => {
			const list = rules.filter(
				(r) =>
					STEEL_SCOPE.test(r.selector) &&
					/:is\(\.dse-sb, \.dse-fb\) \.dse-feature__nested$/.test(r.selector.trim()),
			);
			expect(list).toHaveLength(1);
			expect(list[0].body).toMatch(/display:\s*flex/);
			expect(list[0].body).toMatch(/gap:\s*0\.65rem/); // site .sb__features/.fb__feats
		});

		it('frames on .dse-feature but bars on [data-dse-act] — an unmapped option still gets its card', () => {
			// renderFeature.ts sets neither attribute nor --dse-act alias when the action type
			// does not map, so keying the FRAME on [data-dse-act] would silently un-card those
			// options. The site always frames and lets --act fall back.
			const frame = rules.find(
				(r) =>
					STEEL_SCOPE.test(r.selector) &&
					r.selector.includes(FRAME_ANCHOR) &&
					/border-radius:\s*9px/.test(r.body),
			);
			expect(frame!.selector).not.toContain('.dse-feature[data-dse-act]');
			// …while the bar's own radius (so it hugs the rounded corner) IS act-keyed.
			const bar = rules.find(
				(r) =>
					STEEL_SCOPE.test(r.selector) &&
					r.selector.includes('.dse-feature[data-dse-act]::before') &&
					/border-top-left-radius:\s*9px/.test(r.body),
			);
			expect(bar).toBeDefined();
			expect(bar!.selector).toContain(':is(.dse-sb, .dse-fb)');
		});

		it('fills with translucent BLACK (the bleed-through material), never --dse-surface-sunken', () => {
			const fill = rules.filter(
				(r) =>
					STEEL_SCOPE.test(r.selector) &&
					r.selector.includes(FRAME_ANCHOR) &&
					/^\s*background:/m.test(r.body),
			);
			// dark + the body.theme-light twin
			expect(fill).toHaveLength(2);
			const dark = fill.find((r) => !r.selector.includes('theme-light'))!;
			const light = fill.find((r) => r.selector.includes('theme-light'))!;
			expect(dark.body).toMatch(/background:\s*rgba\(0,\s*0,\s*0,\s*0\.16\)/);
			expect(light.body).toMatch(/background:\s*rgba\(0,\s*0,\s*0,\s*0\.022\)/);
			// SC-100's dark-mode material finding: the sunken WHITE wash occludes the parent
			// card's gradient, which is the whole point of the translucent-black fill.
			for (const r of fill) expect(r.body).not.toContain('--dse-surface-sunken');
		});

		it('tiers correctly: fill is screen-only, geometry reaches print (S-1(a))', () => {
			const PRINT_GUARD = /:not\(\[data-dse-print="on"\]\)/;
			const frameRules = nestedOptionRules.filter(
				(r) => STEEL_SCOPE.test(r.selector) && r.selector.includes(':is(.dse-sb, .dse-fb)'),
			);
			expect(frameRules.length).toBeGreaterThan(2);
			for (const r of frameRules) {
				const paintsFill = /^\s*background:/m.test(r.body);
				expect(PRINT_GUARD.test(r.selector)).toBe(paintsFill);
			}
		});

		it('does not reach the kit / display card family or the standalone Feature element', () => {
			// CardLayout.ts:382 + layouts.ts:235 mount the SAME renderFeatureList into a
			// `.dse-card`; the standalone element root wears neither .dse-sb nor .dse-fb.
			// Both must miss the frame by construction — this is what keeps
			// kit--steel-print.png frozen.
			// Rules that PAINT a frame — the `flat` mode rules below cancel one
			// (background: none / border-radius: 0) and are deliberately not in scope.
			const frameRules = nestedOptionRules.filter(
				(r) =>
					STEEL_SCOPE.test(r.selector) &&
					/border-radius:\s*9px|background:\s*rgba\(/.test(r.body),
			);
			expect(frameRules.length).toBeGreaterThan(0);
			for (const r of frameRules) {
				expect(r.selector).toContain(':is(.dse-sb, .dse-fb)');
				expect(r.selector).not.toContain('.dse-card');
				expect(r.selector).not.toContain("[data-dse-element='feature']");
			}
		});

		it("the statblock 'flat' feature-style pref still flattens (no frame, no gap)", () => {
			const flat = rules.filter(
				(r) =>
					STEEL_SCOPE.test(r.selector) && r.selector.includes("[data-dse-sb-featstyle='flat']"),
			);
			expect(flat.length).toBeGreaterThanOrEqual(3);
			expect(flat.some((r) => /gap:\s*0\s*;/.test(r.body))).toBe(true);
			const card = flat.find((r) => /background:\s*none/.test(r.body));
			expect(card).toBeDefined();
			expect(card!.body).toMatch(/border-radius:\s*0\s*;/);
			// …and the light twin is restated, because the frame's own light rule
			// out-specifies a plain mode rule.
			expect(card!.selector).toContain('body.theme-light');
			// The act lane needs the SAME light arm for the SAME reason — a single-arm
			// restore is out-specified by the light twin above and the spine lands on top
			// of the first character in light + flat. (Found by a live computed-style
			// probe; this assertion is what keeps it found.)
			const lane = flat.find((r) => /padding-left:\s*calc\(3px \+ 0\.55em\)/.test(r.body));
			expect(lane).toBeDefined();
			expect(lane!.selector).toContain('body.theme-light');
			// Sheet convention (pref-reflection.test.ts): the DEFAULT value is never named.
			expect(css).not.toContain("data-dse-sb-featstyle='card'");
		});

		it('flat mode also cancels the BAR\'s card-only left radius (fix round, L-1)', () => {
			const barReset = rules.find(
				(r) =>
					STEEL_SCOPE.test(r.selector) &&
					r.selector.includes("[data-dse-sb-featstyle='flat']") &&
					r.selector.includes('[data-dse-act]') &&
					r.selector.trim().endsWith('::before'),
			);
			expect(barReset).toBeDefined();
			expect(barReset!.body).toMatch(/border-top-left-radius:\s*0\s*;/);
			expect(barReset!.body).toMatch(/border-bottom-left-radius:\s*0\s*;/);
		});

		it("flat mode stops at the statblock's OWN options — a nested featureblock keeps its card frame (fix round, L-2)", () => {
			// Every sb `flat` mode rule that reaches into `.dse-feature__nested` must exclude
			// anything with a `.dse-fb` ancestor, or a nested fb's own options (a real
			// composition — a villain action containing a Malice Features block, per the
			// frame rule's own comment above) lose their card frame to the OUTER statblock's
			// pref, even though the site keys sb/fb featstyle independently
			// (settings-panel.js:44-45, fb default `card`).
			const flatOptionRules = rules.filter(
				(r) =>
					STEEL_SCOPE.test(r.selector) &&
					r.selector.includes("[data-dse-sb-featstyle='flat']") &&
					r.selector.includes('.dse-feature__nested'),
			);
			expect(flatOptionRules.length).toBeGreaterThanOrEqual(4); // gap, card+light, act-lane+light, bar radius
			for (const r of flatOptionRules) {
				expect(r.selector).toMatch(/:not\(\.dse-fb \*\)/);
			}
		});

		it("a featureblock option's cost moves to the name's row and loses the chip box", () => {
			const cost = rules.find(
				(r) =>
					STEEL_SCOPE.test(r.selector) &&
					r.selector.includes(
						".dse-fb .dse-feature > .dse-head > .dse-head__eyebrow--right",
					) &&
					/grid-area:/.test(r.body),
			);
			expect(cost).toBeDefined();
			expect(cost!.body).toMatch(/grid-area:\s*2 \/ 3/); // primary lane, right column
			// un-boxed: every piece of the base --chip chrome is cancelled
			expect(cost!.body).toMatch(/background:\s*none/);
			expect(cost!.body).toMatch(/border:\s*none/);
			expect(cost!.body).toMatch(/box-shadow:\s*none/);
			expect(cost!.body).toMatch(/padding:\s*0\s*;/);
			// Structure tier — the re-placement and the un-boxing reach print together;
			// a lane-moved cost still wearing a box is a half-state the site has no version of.
			expect(cost!.selector).not.toMatch(/:not\(\[data-dse-print="on"\]\)/);

			// …and the descriptor it displaced drops to the deck lane.
			const descriptor = rules.find(
				(r) =>
					STEEL_SCOPE.test(r.selector) &&
					r.selector.includes(".dse-fb .dse-feature > .dse-head > .dse-head__primary--right"),
			);
			expect(descriptor).toBeDefined();
			expect(descriptor!.body).toMatch(/grid-area:\s*3 \/ 3/);
		});

		it("renders that cost as the site's --mini display text (uppercase title face, role-tinted)", () => {
			const mini = rules.find(
				(r) =>
					STEEL_SCOPE.test(r.selector) &&
					r.selector.includes(
						".dse-fb .dse-feature > .dse-head > .dse-head__eyebrow--right",
					) &&
					/text-transform:/.test(r.body),
			);
			expect(mini).toBeDefined();
			// The site's mini rides the LARGE-HEADER face. In the plugin that is the Title
			// slot, and SC-112 Task 5's Legacy font-slot gate requires every Title consumer
			// to be theme-agnostic — so the face is routed from the consolidated block, not
			// declared here. (steelTypography.test.ts fails if this ever moves back inline.)
			expect(mini!.body).not.toMatch(/font-family:/);
			const titleRouting = rules.find(
				(r) =>
					/font-family:\s*var\(--dse-font-title\)\s*;/.test(r.body) &&
					r.selector.includes(
						'.dse-fb .dse-feature > .dse-head > .dse-head__eyebrow--right',
					),
			);
			expect(titleRouting).toBeDefined();
			expect(STEEL_SCOPE.test(titleRouting!.selector)).toBe(false);
			expect(mini!.body).toMatch(/text-transform:\s*uppercase/);
			expect(mini!.body).toMatch(/line-height:\s*1\.04/);
			expect(mini!.body).toMatch(/color:\s*var\(--dse-role,\s*var\(--dse-heading\)\)/);
			// em, not the site's rem literal — the site's rem base is 20px, the plugin's 16px
			// (gap inventory §A); 1.35em holds the site's mini/name RATIO at the plugin's scale.
			expect(mini!.body).toMatch(/font-size:\s*1\.35em/);
			// The Steel flat-chip block small-caps + tracks every --chip slot; the mini is neither.
			expect(mini!.body).toMatch(/font-variant:\s*normal/);
			expect(mini!.body).toMatch(/letter-spacing:\s*normal/);
			// Display tier: screen-only, like every other Steel display-face treatment.
			expect(mini!.selector).toMatch(/:not\(\[data-dse-print="on"\]\)/);
		});

		it('leaves the STATBLOCK and standalone cost on the site\'s forged pill', () => {
			// The site splits this per family in its generator (statblock_card.go hChip vs
			// featureblock_page.go hMini), so the cost-as-text rules must name .dse-fb ONLY…
			const costRules = rules.filter(
				(r) => STEEL_SCOPE.test(r.selector) && r.selector.includes('.dse-head__eyebrow--right'),
			);
			expect(costRules.length).toBeGreaterThan(0);
			for (const r of costRules) {
				expect(r.selector).toContain('.dse-fb ');
				expect(r.selector).not.toContain('.dse-sb');
			}
			// …and the forged pill itself must survive untouched for everyone else.
			const pill = rules.find(
				(r) =>
					r.selector.trim() ===
					'[data-dse-theme=\'steel\']:not([data-dse-print="on"]) .dse-feature .dse-head__eyebrow--chip',
			);
			expect(pill).toBeDefined();
			expect(pill!.body).toMatch(/background-image:\s*var\(--dse-sheen\)/);
			expect(pill!.body).toMatch(/box-shadow:\s*var\(--dse-chip-bevel\)/);
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
