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
	/**
	 * SC-171: true when this rule lives inside an `@supports (… color-mix …)` block — the
	 * ENHANCEMENT layer. Every enhanced twin repeats its base rule's selector verbatim, so
	 * without this flag a plain `rules.filter(...)` count doubles for every gated surface
	 * and the structural assertions below would read a gate as a duplicate rule.
	 */
	gated: boolean;
}

/**
 * Character ranges of the sheet's `@supports (… color-mix …)` blocks, in the
 * comment-stripped copy. Brace-matched, so a nested at-rule inside one is still inside.
 */
const colorMixGateRanges: [number, number][] = (() => {
	const out: [number, number][] = [];
	const re = /@supports\s*\([^{]*color-mix\([^{]*\{/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(css))) {
		let depth = 1;
		let i = re.lastIndex;
		for (; i < css.length && depth > 0; i++) {
			if (css[i] === '{') depth += 1;
			else if (css[i] === '}') depth -= 1;
		}
		out.push([m.index, i]);
	}
	return out;
})();

const insideColorMixGate = (at: number): boolean =>
	colorMixGateRanges.some(([start, end]) => at > start && at < end);

/** Flat list of every `selector { body }` in the file (no nested-brace constructs are used). */
const rules: Rule[] = (() => {
	const out: Rule[] = [];
	const re = /([^{}]+)\{([^{}]*)\}/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(css)))
		out.push({ selector: m[1].trim(), body: m[2], gated: insideColorMixGate(m.index) });
	return out;
})();

/** The BASE layer — everything a Chromium 106 engine actually applies. */
const baseRules: Rule[] = rules.filter((r) => !r.gated);

/**
 * Every BASE rule body whose selector list mentions `selector` AND is scoped to Steel.
 *
 * SC-171 review L-3: this used to read `rules`, which silently included the `@supports`
 * enhancement twins — so a "this surface carries X" assertion could pass off the GATED body
 * and say nothing at all about what a Chromium 106 engine paints. Base layer only; the gated
 * layer has its own accessor below, so a contract has to name which one it means.
 */
const steelBlocksFor = (selector: string): string[] =>
	baseRules
		.filter((r) => r.selector.includes(selector) && STEEL_SCOPE.test(r.selector))
		.map((r) => r.body);

/** The @supports-gated ENHANCEMENT twins for `selector` (SC-171). */
const steelGatedBlocksFor = (selector: string): string[] =>
	rules
		.filter((r) => r.gated && r.selector.includes(selector) && STEEL_SCOPE.test(r.selector))
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
		// SC-171 review L-3 — the same two-part contract the notch families carry, for the
		// surface that had the most rows broken on the floor engine. This assertion used to be
		// a single `some(... color-mix ...)` over ALL rules, which after SC-171 passed off the
		// gated twin's body and said nothing about the base layer. Both halves, named.
		it('tier rows carry a FLAT wash in the base rule and the color-mix wash only behind the gate (SC-171)', () => {
			const base = steelBlocksFor('.dse-pr__row');
			expect(base.length).toBeGreaterThan(0);
			// The floor engine's layer: the static `--tw` wash, and NO color-mix anywhere in it.
			const withWash = base.filter((b) =>
				/background-image:\s*linear-gradient\(90deg,\s*var\(--tw\),\s*transparent 60%\)/.test(b),
			);
			expect(withWash).toHaveLength(1);
			for (const b of base) expect(b).not.toMatch(/color-mix/);

			// The enhancement layer: exactly one gated twin, and it is where color-mix lives.
			const gated = steelGatedBlocksFor('.dse-pr__row');
			expect(gated).toHaveLength(1);
			expect(gated[0]).toMatch(
				/background-image:\s*linear-gradient\([^;]*color-mix\(in srgb, var\(--t\) 8%, transparent\)/,
			);
			// Static twin repeated first inside the block, for cssSupportFloor's adjacency scan.
			const gatedWashes = Array.from(gated[0].matchAll(/background-image:[^;]+;/g)).map(
				(m) => m[0],
			);
			expect(gatedWashes).toHaveLength(2);
			expect(gatedWashes[0]).not.toMatch(/color-mix/);
			expect(gatedWashes[1]).toMatch(/color-mix/);
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

		// SC-171: BASE layer only. An `@supports` twin repeats the selector verbatim, and the
		// gate is exactly what makes the base declaration authoritative on the floor engine —
		// counting it as a second rule would misread the fix as a duplicate.
		const selectorOf = (needle: string): string => {
			const found = baseRules.filter((r) => r.selector.replace(/\s+/g, ' ').trim() === needle);
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
			// filter now matches two rules — one per family. BASE layer only (SC-171): the
			// color-mix halo now lives in an @supports twin under the same selector.
			const afters = baseRules.filter(
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

		// SC-121 M-1 authored this as a same-rule fallback PAIR. SC-171 measured that shape
		// failing on the real floor engine (`box-shadow: none` — no halo at all), because a
		// `var()`-bearing color-mix() parses and then fails at computed-value time, after the
		// cascade has already dropped the static twin. The contract is now two-part: the base
		// rule holds the flat halo ALONE, and the color-mix halo lives only behind the gate.
		it('the notch halo is flat in the base rule and color-mix-enhanced only behind the @supports gate (SC-121 M-1, SC-171)', () => {
			const sel = "[data-dse-theme='steel'] .dse-sb[data-dse-role] > .dse-head::after";
			const base = baseRules.find((r) => r.selector.trim() === sel);
			expect(base).toBeDefined();
			const baseShadows = Array.from(base!.body.matchAll(/box-shadow:[^;]+;/g)).map((m) => m[0]);
			expect(baseShadows).toHaveLength(1);
			expect(baseShadows[0]).not.toMatch(/color-mix/);
			expect(baseShadows[0]).toMatch(/0 0 0 5px var\(--dse-role\)/);

			const gated = rules.filter((r) => r.gated && r.selector.trim() === sel);
			expect(gated).toHaveLength(1);
			const gatedShadows = Array.from(gated[0].body.matchAll(/box-shadow:[^;]+;/g)).map(
				(m) => m[0],
			);
			// Static twin repeated first inside the block — cssSupportFloor.test.ts's adjacency
			// scan reads source text and does not model @supports.
			expect(gatedShadows).toHaveLength(2);
			expect(gatedShadows[0]).not.toMatch(/color-mix/);
			expect(gatedShadows[1]).toMatch(
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
			// Exactly two BASE `.dse-head::after` rules total: the statblock's (role-gated) and
			// this one (ungated) — a future per-family fork or a third copy fails here. The
			// @supports enhancement twins (SC-171) are counted separately below.
			const afters = baseRules.filter((r) => r.selector.includes('.dse-head::after'));
			expect(afters).toHaveLength(2);
			// …and each has exactly one gated twin, no more.
			expect(rules.filter((r) => r.gated && r.selector.includes('.dse-head::after'))).toHaveLength(
				2,
			);

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

			// SC-171: the base rule carries the flat halo ALONE; the color-mix halo lives only
			// behind the @supports gate (ungated it computed to `box-shadow: none` on the
			// Chromium 106 floor — measured in-app).
			const baseShadows = Array.from(body.matchAll(/box-shadow:[^;]+;/g)).map((m) => m[0]);
			expect(baseShadows).toHaveLength(1);
			expect(baseShadows[0]).not.toMatch(/color-mix/);

			const gated = rules.filter(
				(r) =>
					r.gated &&
					r.selector.trim() === "[data-dse-theme='steel'] .dse-fb > .dse-head::after",
			);
			expect(gated).toHaveLength(1);
			const gatedShadows = Array.from(gated[0].body.matchAll(/box-shadow:[^;]+;/g)).map(
				(m) => m[0],
			);
			expect(gatedShadows).toHaveLength(2);
			expect(gatedShadows[0]).not.toMatch(/color-mix/);
			expect(gatedShadows[1]).toMatch(
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
			// 4 since SC-171: the three base rules plus the notch's @supports twin. The point of
			// the assertion is the loop below — every one of them, gated or not, is structure
			// tier and therefore carries no print exclusion.
			expect(fbNotchRules).toHaveLength(4);
			expect(fbNotchRules.filter((r) => r.gated)).toHaveLength(1);
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
			// SC-168 carve-out: the NESTED-card restore rules (`.dse-feature__nested > …`)
			// are deliberately screen-only (they keep feature print shots frozen), so this
			// structure-tier pin covers only the top-level suppression rules.
			const standalone = rules.filter(
				(r) =>
					r.selector.includes("[data-dse-element='feature']") &&
					/\.dse-feature\[data-dse-act\]/.test(r.selector) &&
					!r.selector.includes('.dse-feature__nested'),
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
			// ONE sanctioned second anchor since SC-168: the standalone feature element's
			// nested cards (`[data-dse-element='feature'] …`, screen-only) — that arm cannot
			// share the :is() block because its tier differs (print-guarded, where the sb/fb
			// geometry reaches print), and its own describe below pins its recipe to this
			// block's values so the two cannot drift.
			const forks = nestedOptionRules.filter(
				(r) =>
					STEEL_SCOPE.test(r.selector) &&
					!r.selector.includes(':is(.dse-sb, .dse-fb)') &&
					!/\[data-dse-element=['"]feature['"]\]/.test(r.selector) &&
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

		it('does not reach the kit / display card family; reaches the standalone Feature element only for NESTED cards, screen-only (SC-168)', () => {
			// CardLayout.ts:382 + layouts.ts:235 mount the SAME renderFeatureList into a
			// `.dse-card`; the standalone element root wears neither .dse-sb nor .dse-fb.
			// The kit family must miss the frame by construction — this is what keeps
			// kit--steel-print.png frozen. Since SC-168 the standalone feature element's
			// nested cards DO wear the frame, but (a) only through the nested combinator
			// (the TOP-LEVEL standalone card stays frameless, per SC-102 part 2) and
			// (b) only behind the print guard — which is what keeps feature--steel-print.png
			// (and the other feature-family print twins) frozen.
			// Rules that PAINT a frame — the `flat` mode rules below cancel one
			// (background: none / border-radius: 0) and are deliberately not in scope.
			const frameRules = nestedOptionRules.filter(
				(r) =>
					STEEL_SCOPE.test(r.selector) &&
					/border-radius:\s*9px|background:\s*rgba\(/.test(r.body),
			);
			expect(frameRules.length).toBeGreaterThan(0);
			for (const r of frameRules) {
				expect(r.selector).not.toContain('.dse-card');
				if (/\[data-dse-element=['"]feature['"]\]/.test(r.selector)) {
					expect(r.selector).toContain('.dse-feature__nested > .dse-feature');
					expect(r.selector).toMatch(/:not\(\[data-dse-print="on"\]\)/);
				} else {
					expect(r.selector).toContain(':is(.dse-sb, .dse-fb)');
				}
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

	/**
	 * SC-168 — the standalone Feature element's NESTED cards join the S-4 frame.
	 *
	 * The defect: a `.dse-feature__nested > .dse-feature` under the standalone pipeline
	 * root ([data-dse-element='feature'] — the effect.features recursion) got NO frame
	 * (the SC-101 anchor names only .dse-sb/.dse-fb), no fill, and 0 left/right padding —
	 * SC-102's standalone suppression (`padding-left: 0` on `.dse-feature[data-dse-act]`)
	 * reaches nested cards too, because its comment's premise ("a nested card is always
	 * under .dse-sb/.dse-fb") was wrong. Result: the inner feature rendered flush against
	 * its parent card's content edges (Scott's screenshot on the ticket).
	 *
	 * The fix joins the existing nested-card convention instead of inventing a margin:
	 * the same recipe as the sb/fb frame (gap / 9px radius / .7 .85 .78 .85rem padding /
	 * translucent-black fill / act lane + spine as the card's left edge), as a SEPARATE
	 * screen-only arm — it cannot share the :is() block because the sb/fb geometry is
	 * structure tier (reaches print) while this arm is print-guarded on purpose: the
	 * feature-family `*--steel-print.png` bytes are frozen, and the report is a screen
	 * defect. The recipe-identity test below is what keeps the two arms from drifting.
	 */
	describe('standalone-feature nested cards join the frame (SC-168)', () => {
		const NESTED_ANCHOR =
			'[data-dse-theme=\'steel\']:not([data-dse-print="on"])[data-dse-element=\'feature\']';
		const exactRule = (selector: string) => {
			const r = rules.find((x) => x.selector.replace(/\s+/g, ' ').trim() === selector);
			expect(r).toBeDefined();
			return r!;
		};

		const listRule = () =>
			exactRule(`${NESTED_ANCHOR} .dse-feature__nested`);
		const frameRule = () =>
			exactRule(`${NESTED_ANCHOR} .dse-feature__nested > .dse-feature`);
		const lightRule = () =>
			exactRule(`body.theme-light ${NESTED_ANCHOR} .dse-feature__nested > .dse-feature`);
		const laneRule = () =>
			exactRule(`${NESTED_ANCHOR} .dse-feature__nested > .dse-feature[data-dse-act]`);
		const barRule = () =>
			exactRule(`${NESTED_ANCHOR} .dse-feature__nested > .dse-feature[data-dse-act]::before`);

		it('separates nested cards with the real list gap (flex column, not padding rhythm)', () => {
			const r = listRule();
			expect(r.body).toMatch(/display:\s*flex/);
			expect(r.body).toMatch(/flex-direction:\s*column/);
			expect(r.body).toMatch(/gap:\s*0\.65rem/);
		});

		it('carries the EXACT sb/fb frame recipe — the anti-drift pin the fork exemption relies on', () => {
			const shared = rules.find(
				(r) =>
					STEEL_SCOPE.test(r.selector) &&
					r.selector.includes(':is(.dse-sb, .dse-fb) .dse-feature__nested > .dse-feature') &&
					/border-radius:\s*9px/.test(r.body),
			);
			expect(shared).toBeDefined();
			const arm = frameRule();
			// Same longhand geometry, value for value.
			for (const decl of [
				/border-radius:\s*9px/,
				/padding-top:\s*0\.7rem/,
				/padding-right:\s*0\.85rem/,
				/padding-bottom:\s*0\.78rem/,
				/padding-left:\s*0\.85rem/,
			]) {
				expect(shared!.body).toMatch(decl);
				expect(arm.body).toMatch(decl);
			}
			// Same material: translucent BLACK (bleed-through), never --dse-surface-sunken,
			// with the same light twin.
			expect(arm.body).toMatch(/background:\s*rgba\(0,\s*0,\s*0,\s*0\.16\)/);
			expect(arm.body).not.toContain('--dse-surface-sunken');
			expect(lightRule().body).toMatch(/background:\s*rgba\(0,\s*0,\s*0,\s*0\.022\)/);
		});

		it('restores the act lane and the spine as the card\'s rounded left edge (sb/fb values)', () => {
			expect(laneRule().body).toMatch(/padding-left:\s*calc\(3px \+ 0\.85rem\)/);
			const bar = barRule();
			expect(bar.body).toMatch(/display:\s*block/);
			expect(bar.body).toMatch(/border-top-left-radius:\s*9px/);
			expect(bar.body).toMatch(/border-bottom-left-radius:\s*9px/);
		});

		it('every arm is screen-only AND compound on the pipeline root (no descendant-form footgun)', () => {
			for (const r of [listRule(), frameRule(), lightRule(), laneRule(), barRule()]) {
				// The guard is what keeps feature-family *--steel-print.png bytes frozen.
				expect(r.selector).toMatch(/:not\(\[data-dse-print="on"\]\)/);
				// theme + print-guard + element attrs share ONE root node (pipeline.ts) —
				// a space between them matches nothing (the trap SC-102's tests document).
				expect(r.selector.replace(/\s+/g, ' ')).toMatch(
					/\[data-dse-theme='steel'\]:not\(\[data-dse-print="on"\]\)\[data-dse-element='feature'\]/,
				);
			}
		});

		it('leaves the TOP-LEVEL standalone card frameless — SC-102 part 2 is untouched', () => {
			// The suppression pair must survive verbatim (the standalone ability card has no
			// spine and no lane, matching the site's .sc-ability)…
			exactRule("[data-dse-theme='steel'][data-dse-element='feature'] .dse-feature[data-dse-act]::before");
			exactRule("[data-dse-theme='steel'][data-dse-element='feature'] .dse-feature[data-dse-act]");
			// …and every SC-168 arm reaches ONLY nested cards.
			for (const r of [frameRule(), lightRule(), laneRule(), barRule()]) {
				expect(r.selector).toContain('.dse-feature__nested > .dse-feature');
			}
		});

		/**
		 * CAN-FAIL PROOF, in a real cascade rather than in rule text: feed jsdom the REAL
		 * extracted rule bodies and assert a nested card under the standalone root computes
		 * the frame's insets — and that WITHOUT the SC-168 arms the same DOM computes
		 * padding-left 0 (the SC-102 suppression reaching the nested card) and no
		 * padding-right at all. That flush state IS the shipped defect.
		 */
		describe('cascade proof (jsdom)', () => {
			function computePadding(withFix: boolean): { left: string; right: string } {
				const baseNested = rules.find(
					(r) => r.selector.trim() === '.dse-feature__nested > .dse-feature',
				)!;
				const steelLane = rules.find(
					(r) =>
						r.selector.trim() === "[data-dse-theme='steel'] .dse-feature[data-dse-act]",
				)!;
				const suppression = rules.find(
					(r) =>
						r.selector.replace(/\s+/g, ' ').trim() ===
						"[data-dse-theme='steel'][data-dse-element='feature'] .dse-feature[data-dse-act]",
				)!;
				const style = document.createElement('style');
				style.textContent =
					`${baseNested.selector}{${baseNested.body}}` +
					`${steelLane.selector}{${steelLane.body}}` +
					`${suppression.selector}{${suppression.body}}` +
					(withFix
						? `${frameRule().selector}{${frameRule().body}}` +
							`${laneRule().selector}{${laneRule().body}}`
						: '');
				const root = document.createElement('div');
				root.setAttribute('data-dse-theme', 'steel');
				root.setAttribute('data-dse-element', 'feature');
				const outer = document.createElement('div');
				outer.className = 'dse-feature';
				const section = document.createElement('div');
				section.className = 'dse-section';
				const list = document.createElement('div');
				list.className = 'dse-feature__nested';
				const inner = document.createElement('div');
				inner.className = 'dse-feature';
				inner.setAttribute('data-dse-act', 'trait');
				list.appendChild(inner);
				section.appendChild(list);
				outer.appendChild(section);
				root.appendChild(outer);
				document.head.appendChild(style);
				document.body.appendChild(root);
				try {
					const cs = getComputedStyle(inner);
					return { left: cs.paddingLeft, right: cs.paddingRight };
				} finally {
					style.remove();
					root.remove();
				}
			}

			it('with the fix, the nested card computes the lane + frame insets', () => {
				const { left, right } = computePadding(true);
				expect(left).toBe('calc(3px + 0.85rem)');
				expect(right).toBe('0.85rem');
			});

			it('without the fix, the same DOM computes flush insets (the shipped defect)', () => {
				const { left, right } = computePadding(false);
				expect(left).toMatch(/^0(px)?$/);
				expect(['', '0', '0px']).toContain(right);
			});
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

	// ================================================================
	//   SC-152 — the character-sheet panels are members of the plate
	// ================================================================
	// Scott, SC-152: "The pre-existing elements that were designed to be included in a
	// character sheet are lacking the 'high fantasy steel' stylizing. Some seem to be
	// stylized (ex: ds-counter) while others are not (ex: ds-char). At the very least
	// they should get the stylized card container."
	//
	// These panels are plugin-only surfaces with no site counterpart, so the parity gate
	// structurally cannot see them and the freeze gate only watches print — which is
	// exactly how they stayed flat while the tracker family got the material. This block
	// is the mechanism that notices if they fall back out.
	describe('character-sheet panels (SC-152)', () => {
		/** The ONE shared card-ground rule — identified by what it paints, not by its
		 *  selector text, so reformatting the selector list cannot make this vacuous. */
		const plateDark = (): Rule => {
			const r = rules.find((x) => /background:\s*var\(--dse-card-bg\)/.test(x.body));
			expect(r).toBeDefined();
			return r as Rule;
		};
		const plateLight = (): Rule => {
			const r = rules.find(
				(x) =>
					x.selector.includes('body.theme-light') &&
					/box-shadow:\s*var\(--dse-bevel\),\s*0 4px 12px/.test(x.body),
			);
			expect(r).toBeDefined();
			return r as Rule;
		};
		/** The tracker/sheet root-padding rule (rule 1 of the plugin-only surfaces block). */
		const rootPadding = (): Rule => {
			const r = rules.find(
				(x) =>
					x.selector.includes("[data-dse-element='counter']") &&
					/^\s*padding:\s*var\(--dse-pad\);\s*$/.test(x.body),
			);
			expect(r).toBeDefined();
			return r as Rule;
		};

		/** The eight panels SC-152 brought into the family. */
		const SHEET_PANELS = [
			'characteristics',
			'values-row',
			'skills',
			'heroic-resource',
			'surges',
			'hero-tokens',
			'conditions',
			'hero',
		];

		it.each(SHEET_PANELS)(
			'ds-%s is a member of the shared card-ground plate, in BOTH schemes',
			(id) => {
				expect(plateDark().selector).toContain(`[data-dse-element='${id}']`);
				expect(plateLight().selector).toContain(`[data-dse-element='${id}']`);
			},
		);

		/** Split a selector list on TOP-LEVEL commas only. A naive `.split(',')` shreds the
		 *  `:is(a, b, c)` group these rules are built from, leaving fragments like
		 *  `[data-dse-element='skills']` that carry none of their own compound's prefix —
		 *  which would make the print-exclusion check below assert against nothing real. */
		const topLevelArms = (selector: string): string[] => {
			const out: string[] = [];
			let depth = 0;
			let cur = '';
			for (const ch of selector) {
				if (ch === '(') depth++;
				else if (ch === ')') depth--;
				if (ch === ',' && depth === 0) {
					out.push(cur);
					cur = '';
				} else cur += ch;
			}
			if (cur.trim()) out.push(cur);
			return out;
		};

		it('the arm carrying them is print-excluded — paper keeps the plain rendering', () => {
			// The whole freeze story of this ticket: every SC-152 selector sits behind
			// :not([data-dse-print="on"]), so not one *--steel-print.png moves. If someone
			// drops the exclusion, 10+ frozen shots start failing and this fails first,
			// with a reason attached.
			let checked = 0;
			for (const rule of [plateDark(), plateLight(), rootPadding()]) {
				for (const arm of topLevelArms(rule.selector)) {
					if (!SHEET_PANELS.some((id) => arm.includes(`[data-dse-element='${id}']`))) continue;
					expect(arm).toContain(':not([data-dse-print="on"])');
					checked++;
				}
			}
			// Guard the guard: if the splitter or the rule finders ever stop producing an
			// arm that mentions a sheet panel, the loop above passes by doing nothing.
			expect(checked).toBe(3);
		});

		it('stamina-bar and roll are deliberately NOT plated', () => {
			// stamina-bar renders its SC-132 interior inside its own collapsible region
			// frame — a root plate would DOUBLE-frame it. roll is already plated: it
			// renders an inner `.dse-card`, which the plate rule already matches. Both
			// exclusions are judgement calls, so they get a test rather than a comment
			// alone: re-adding either should be a decision, not a drive-by.
			for (const id of ['stamina-bar', 'roll']) {
				expect(plateDark().selector).not.toContain(`[data-dse-element='${id}']`);
				expect(plateLight().selector).not.toContain(`[data-dse-element='${id}']`);
			}
		});

		it('only the panels whose inner wrapper does NOT already pad get root padding', () => {
			// The double-padding trap: .dse-res / .dse-surge / .dse-tokens carry
			// `padding: var(--dse-pad)` themselves, so adding it to their roots too would
			// double the inset on exactly those three and nothing else would look wrong.
			for (const id of ['characteristics', 'values-row', 'skills', 'conditions', 'hero']) {
				expect(rootPadding().selector).toContain(`[data-dse-element='${id}']`);
			}
			for (const id of ['heroic-resource', 'surges', 'hero-tokens']) {
				expect(rootPadding().selector).not.toContain(`[data-dse-element='${id}']`);
			}
		});

		it('the stat row reuses the shipped boxed-cell grammar, not a bespoke one', () => {
			// ds-characteristics / ds-values-row / the hero sheet's Characteristics region
			// all render the same `.dse-statgrid`, which is the statblock primary row's
			// value-over-label shape — so the cell joins the existing sunken-cell list and
			// the label takes `.dse-sb__item-l`'s small-caps + tracking.
			const sunken = rules.find((r) =>
				/background:\s*var\(--dse-surface-sunken\)/.test(r.body) &&
				r.selector.includes('.dse-init__cell'),
			);
			expect(sunken).toBeDefined();
			expect(sunken!.selector).toContain('.dse-statgrid__cell');

			const label = steelBlocksFor('.dse-statgrid__label').join('\n');
			expect(label).toMatch(/font-variant:\s*small-caps/);
			expect(label).toMatch(/letter-spacing:\s*0\.04em/);
		});
	});
});
