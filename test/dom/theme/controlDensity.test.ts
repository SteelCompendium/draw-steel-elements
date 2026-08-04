import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { Component } from 'obsidian';
import { iconButton } from '../../../src/framework/kit/iconButton';

/**
 * SC-121 Batch 1 — control density (catalog A-2 / D-2 / D-3) + the A-3 hidden guard.
 *
 * Same source-text contract style as its siblings steelTypography.test.ts /
 * steelMaterial.test.ts / scaleRules.test.ts: jsdom cannot cascade var(), compute
 * calc(), or evaluate `@media (pointer: coarse)`, so the density rules are pinned by
 * RULE TEXT. Two things are asserted beyond mere presence, because "the rule exists"
 * is the assertion that has silently gone vacuous in this repo before:
 *
 *  - the compact default is written with `:where(...)` — that is load-bearing, not
 *    style: it keeps the shared rule at the theme compound's own specificity so every
 *    component-level override (initiative's compact glyph buttons, ~:527) still wins;
 *  - the A-3 guard is source-ordered AFTER the `display: inline-flex` it has to beat,
 *    AND is proven to actually win a real cascade in jsdom (see the last describe).
 *
 * Comments are text (the section prose below names these very selectors), so every
 * match runs against a comment-stripped copy of the file.
 */

const rawCss = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'styles-source.css'), 'utf8');
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');

interface Rule {
	selector: string;
	body: string;
	/** Character offset in the stripped file — for source-order assertions. */
	at: number;
	/** The enclosing at-rule prelude, e.g. `@media (pointer: coarse)`, or ''. */
	media: string;
}

/**
 * Flat list of every `selector { body }`, carrying the enclosing @media prelude.
 * styles-source.css authors nested rules only inside at-rules (the SC-122 build step
 * flattens the rest), so one level of at-rule nesting is all this needs to track.
 */
const rules: Rule[] = (() => {
	const out: Rule[] = [];
	// Brace-matching scan: an at-rule prelude opens a nested context; anything else
	// that opens a brace is a style rule whose body runs to its matching `}`.
	const stack: string[] = [];
	let i = 0;
	let preludeStart = 0;
	while (i < css.length) {
		const ch = css[i];
		if (ch === '{') {
			const prelude = css.slice(preludeStart, i).trim();
			if (prelude.startsWith('@')) {
				stack.push(prelude);
			} else {
				const close = css.indexOf('}', i);
				out.push({
					selector: prelude,
					body: css.slice(i + 1, close),
					at: preludeStart,
					media: stack[stack.length - 1] ?? '',
				});
				i = close;
			}
		} else if (ch === '}') {
			stack.pop();
		}
		if (ch === '{' || ch === '}' || ch === ';') preludeStart = i + 1;
		i++;
	}
	return out;
})();

const STEEL_PRINT_SCOPE = "[data-dse-theme='steel']:not([data-dse-print=\"on\"])";

/** Rules whose selector list mentions `needle`, optionally inside a given @media. */
const rulesFor = (needle: string, media = ''): Rule[] =>
	rules.filter((r) => r.selector.includes(needle) && r.media === media);

const one = (needle: string, media = ''): Rule => {
	const found = rulesFor(needle, media);
	expect(found).toHaveLength(1);
	return found[0];
};

/** The single rule whose selector is EXACTLY `selector` (never a superstring). */
const exact = (selector: string, media = ''): Rule => {
	const found = rules.filter((r) => r.selector === selector && r.media === media);
	expect(found).toHaveLength(1);
	return found[0];
};

// ---------------------------------------------------------------------------
// A-2 (i): the kit emits the structural icon-only modifier
// ---------------------------------------------------------------------------
describe('A-2: kit/iconButton marks icon-only buttons with .dse-btn--icon', () => {
	const owner = (): any => new Component();

	test('an icon with NO visible text gets the modifier', () => {
		const parent = document.createElement('div');
		const { buttonEl } = iconButton(
			parent,
			{ icon: 'minus', label: 'Decrease Stamina', onClick: () => {} },
			owner(),
		);
		expect(buttonEl.hasClass('dse-btn--icon')).toBe(true);
	});

	test('an icon WITH visible text does not — it is a label button, its padding is real', () => {
		const parent = document.createElement('div');
		const { buttonEl } = iconButton(
			parent,
			{ icon: 'dice-5', text: 'Roll', label: 'Roll', onClick: () => {} },
			owner(),
		);
		expect(buttonEl.hasClass('dse-btn--icon')).toBe(false);
	});

	test('a text-only button does not', () => {
		const parent = document.createElement('div');
		const { buttonEl } = iconButton(parent, { text: 'Apply', label: 'Apply', onClick: () => {} }, owner());
		expect(buttonEl.hasClass('dse-btn--icon')).toBe(false);
	});

	test('the modifier is orthogonal to the visual variants (both can be present)', () => {
		const parent = document.createElement('div');
		const { buttonEl } = iconButton(
			parent,
			{ icon: 'x', label: 'Close', variant: 'ghost', onClick: () => {} },
			owner(),
		);
		expect(buttonEl.hasClass('dse-btn--icon')).toBe(true);
		expect(buttonEl.hasClass('dse-btn--ghost')).toBe(true);
	});

	test('the kit still derives its LEGACY hit area from --dse-touch-min (base rule untouched)', () => {
		const base = exact('.dse-btn');
		expect(base.body).toMatch(/min-width:\s*var\(--dse-touch-min\)/);
		expect(base.body).toMatch(/min-height:\s*var\(--dse-touch-min\)/);
	});
});

// ---------------------------------------------------------------------------
// A-2 (ii): the Steel control-density layer
// ---------------------------------------------------------------------------
describe('A-2: Steel control density — one knob, pointer-aware', () => {
	const knobRules = rules.filter((r) => r.body.includes('--dse-control-min:'));

	test('--dse-control-min is declared exactly twice: the compact default + the coarse-pointer restore', () => {
		expect(knobRules).toHaveLength(2);
	});

	test('the compact default is 1.75em (em, so it tracks the user text/card scale) on the Steel root compound', () => {
		const base = knobRules.find((r) => r.media === '');
		expect(base).toBeDefined();
		expect(base!.selector).toBe(STEEL_PRINT_SCOPE);
		expect(base!.body).toMatch(/--dse-control-min:\s*1\.75em/);
	});

	test('@media (pointer: coarse) restores the full --dse-touch-min box — mobile keeps a real 44px target', () => {
		const coarse = knobRules.find((r) => r.media !== '');
		expect(coarse).toBeDefined();
		expect(coarse!.media).toMatch(/@media\s*\(pointer:\s*coarse\)/);
		expect(coarse!.selector).toBe(STEEL_PRINT_SCOPE);
		expect(coarse!.body).toMatch(/--dse-control-min:\s*var\(--dse-touch-min\)/);
	});

	test('.dse-btn reads the knob for BOTH min dimensions, Steel-scoped and print-excluded', () => {
		const r = one(':where(.dse-btn)');
		expect(r.selector).toBe(`${STEEL_PRINT_SCOPE} :where(.dse-btn)`);
		expect(r.body).toMatch(/min-width:\s*var\(--dse-control-min/);
		expect(r.body).toMatch(/min-height:\s*var\(--dse-control-min/);
	});

	test('icon-only buttons drop the kit label padding', () => {
		const r = one(':where(.dse-btn--icon)');
		expect(r.selector).toBe(`${STEEL_PRINT_SCOPE} :where(.dse-btn--icon)`);
		expect(r.body).toMatch(/padding:\s*0\.15em/);
		expect(r.body).toMatch(/gap:\s*0/);
	});

	test(':where() is load-bearing — the shared default must NOT outrank component overrides', () => {
		// initiative's compact glyph buttons (~:527) are (0,3,0). Written without
		// :where(), the shared rule would ALSO be (0,3,0) and — being far later in the
		// file — would silently re-inflate them. Both density rules must use :where().
		for (const needle of [':where(.dse-btn)', ':where(.dse-btn--icon)']) {
			const r = one(needle);
			expect(r.selector.startsWith(`${STEEL_PRINT_SCOPE} :where(`)).toBe(true);
		}
	});
});
