import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * SC-366 — the not-installed card's "View on steelcompendium.io" link
 * (`a.dse-ref-web-card__link`, RefUnwrapView.webCard) must stay in the Steel in-card link
 * colour family (SC-10 Task 1: `.dse-card a` / `.dse-feature a` / … → `--dse-accent`), in BOTH
 * the rest rule and the `:hover` rule, with the family's exact steel / not-print gating and
 * the family's `a`-element specificity (so a theme rule written against `.dse-card a` cannot
 * out-rank only this link). Removing the selector passes every other gate (the harness has no
 * fixture of this card), so this source-text contract is the pin — jsdom cascades no var(),
 * so rule text is what is assertable, the same reason
 * `headingEmphasisLinkHostRegrounding.test.ts` is one.
 */

const rawCss = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'styles-source.css'), 'utf8');
const familyStart = rawCss.indexOf('In-card link color (SC-10 Task 1');
const GATE = `[data-dse-theme='steel']:not([data-dse-print="on"])`;

/** The family's rule list (comments stripped, whitespace flattened) from its banner on to
 *  the end of its `:hover` rule — bounded at the next section banner. */
const familyEnd = rawCss.indexOf('Plan 24 / SC-100 Task 3', familyStart);
const family = rawCss
	.slice(familyStart, familyEnd)
	.replace(/\/\*[\s\S]*?\*\//g, '')
	.replace(/^[^{}]*?(?=\[data-dse-theme)/, '')
	.replace(/\s+/g, ' ');

/** Selector list of the single family rule that lists `.dse-card a` (or its `:hover`). */
function selectorsOf(hover: boolean): string[] {
	const anchor = `${GATE} .dse-card a${hover ? ':hover' : ''}`;
	const rules = [...family.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2].trim() }));
	const match = rules.filter((r) => r.sel.split(',').map((s) => s.trim()).includes(anchor));
	expect(match).toHaveLength(1);
	expect(match[0].body).toContain('color: var(--dse-accent);');
	return match[0].sel.split(',').map((s) => s.trim());
}

describe('SC-366 — not-installed card link is in the in-card link colour family', () => {
	test('the family block is still in the sheet', () => {
		expect(familyStart).toBeGreaterThan(0);
		expect(familyEnd).toBeGreaterThan(familyStart);
	});

	test('rest rule carries `a.dse-ref-web-card__link` under the steel / not-print gate', () => {
		expect(selectorsOf(false)).toContain(`${GATE} a.dse-ref-web-card__link`);
	});

	test(':hover rule carries `a.dse-ref-web-card__link:hover` under the steel / not-print gate', () => {
		expect(selectorsOf(true)).toContain(`${GATE} a.dse-ref-web-card__link:hover`);
	});
});

/**
 * SC-366 follow-up — the two ds-scc degrade cards (`.dse-ref-notice`, shared with
 * `.dse-ref-web-card`) carry NO coloured left stripe (DESIGN.md rule 7: borders-all-around).
 * The harness has no fixture of either card (SC-469), so no screenshot gate would notice the
 * stripe coming back — the rule text is the pin.
 */
describe('SC-366 — the ds-scc degrade cards have no left stripe', () => {
	const noComments = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');
	// Every rule whose selector targets either card root (the `__msg`/`__hint`/`__link`/`__cta`
	// children are different classes and are not matched).
	// (`[^{}]*` body: innermost rules only, so a rule nested in an @media block is seen too.)
	const cardRules = [...noComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
		.map((m) => ({ sel: m[1].trim(), body: m[2] }))
		.filter((r) => /\.dse-ref-notice(?![\w-])|\.dse-ref-web-card(?![\w-])/.test(r.sel));

	test('the card root rule is still in the sheet, with a 1px border on all four sides', () => {
		const root = cardRules.filter((r) => r.sel === '.dse-ref-notice');
		expect(root).toHaveLength(1);
		expect(root[0].body).toMatch(/border:\s*1px solid var\(--background-modifier-border\);/);
	});

	test('no rule on the card roots declares a left border or an inline-start border', () => {
		for (const r of cardRules) {
			expect(r.body).not.toMatch(/border-(left|inline-start)\b/);
		}
	});

	test('no rule on the card roots draws a stripe by other means: an inset box-shadow or a ::before / ::after bar', () => {
		for (const r of cardRules) {
			expect(r.body).not.toMatch(/box-shadow:[^;]*\binset\b/);
			expect(r.sel).not.toMatch(/::?(before|after)\b/);
		}
	});
});
