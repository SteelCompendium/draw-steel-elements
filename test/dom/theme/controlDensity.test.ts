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

// ---------------------------------------------------------------------------
// D-2: negotiation Interest ladder pitch
// ---------------------------------------------------------------------------
describe('D-2: the Interest ladder re-derives from the shared control size', () => {
	const NT_SCOPE = "[data-dse-theme='steel'][data-dse-element='negotiation']:not([data-dse-print=\"on\"])";

	test('the bubble diameter follows --dse-control-min, not the raw touch-min', () => {
		const r = one(`${NT_SCOPE} .dse-nt__bubble`);
		expect(r.body).toMatch(/width:\s*var\(--dse-control-min/);
	});

	test('the rung block margin drops to 0.2em (the inline 0.5em the connector is keyed to stays)', () => {
		const r = one('.dse-nt__interest-row .dse-nt__bubble', '');
		expect(r.selector).toBe(`${NT_SCOPE} .dse-nt__interest-row .dse-nt__bubble`);
		expect(r.body).toMatch(/margin:\s*0\.2em\s+0\.5em/);
	});

	test('the connector line re-derives from the same knob, so both pointer modes stay aligned', () => {
		const r = one(`${NT_SCOPE} .dse-nt__interest-ladder::before`);
		for (const prop of ['height', 'top', 'left']) {
			expect(r.body).toMatch(new RegExp(`${prop}:\\s*calc\\([^;]*--dse-control-min`));
		}
	});
});

// ---------------------------------------------------------------------------
// D-3: themed checkbox
// ---------------------------------------------------------------------------
describe('D-3: negotiation checkboxes wear the plugin mark idiom + a real label gap', () => {
	const boxRules = rules.filter((r) => r.selector.includes("input[type='checkbox']"));

	test('every checkbox rule is Steel-scoped, print-excluded, and skips Obsidian task-list boxes', () => {
		// 3 dedicated rules (base / :checked / :disabled) + the arm inside the kit's
		// shared focus ring. The sheet is loaded app-wide, so an unscoped
		// `input[type='checkbox']` arm would restyle every checkbox in Obsidian.
		expect(boxRules.length).toBe(4);
		for (const r of boxRules) {
			expect(r.selector).toContain(STEEL_PRINT_SCOPE);
			expect(r.selector).toContain(':not(.task-list-item-checkbox)');
		}
	});

	test('the box replaces the OS control and matches .dse-skills__mark (1em, 0.2em radius, muted hairline)', () => {
		const base = boxRules.find((r) => r.body.includes('appearance: none'));
		expect(base).toBeDefined();
		expect(base!.body).toMatch(/width:\s*1em/);
		expect(base!.body).toMatch(/height:\s*1em/);
		expect(base!.body).toMatch(/border-radius:\s*0\.2em/);
		expect(base!.body).toMatch(/border:\s*1px solid var\(--dse-fg-muted\)/);
	});

	test('the label gap the defect was about is a real 0.5em, matching the skills mark', () => {
		const base = boxRules.find((r) => r.body.includes('appearance: none'))!;
		expect(base.body).toMatch(/margin:\s*0\s+0\.5em\s+0\s+0/);
		// The idiom this is copied from carries the same gap — pin it so the two
		// cannot silently drift apart.
		const mark = exact('.dse-skills__mark');
		expect(mark.body).toMatch(/margin-right:\s*0\.5em/);
	});

	test(':checked fills solid --dse-accent (the skills mark\'s [data-on] state)', () => {
		const checked = boxRules.find((r) => r.selector.endsWith(':checked'));
		expect(checked).toBeDefined();
		expect(checked!.body).toMatch(/background-color:\s*var\(--dse-accent\)/);
	});

	test('appearance:none drops the UA ring, so the box JOINS the kit\'s one focus rule', () => {
		// Not a second ring declaration (kit-index.test.ts guards against exactly that):
		// the checkbox is an extra arm on the kit's shared :focus-visible selector list.
		const focusArm = boxRules.filter((r) => r.selector.includes(':focus-visible'));
		expect(focusArm).toHaveLength(1);
		expect(focusArm[0].selector).toContain('.dse-btn:focus-visible');
		expect(focusArm[0].body).toMatch(/outline:\s*2px solid var\(--dse-focus-ring\)/);
		expect(focusArm[0].body).toMatch(/outline-offset:\s*2px/);
	});

	test('disabled rows keep an affordance (the UA graying went with appearance:none)', () => {
		const disabled = boxRules.find((r) => r.selector.endsWith(':disabled'));
		expect(disabled).toBeDefined();
		expect(disabled!.body).toMatch(/opacity:\s*0\.5/);
	});
});

// ---------------------------------------------------------------------------
// A-3: the winded/dying badge hidden-state guard
// ---------------------------------------------------------------------------
describe('A-3: .dse-stamina-rec__status honors [hidden]', () => {
	const base = exact('.dse-stamina-rec__status');
	const guard = exact(`${STEEL_PRINT_SCOPE} .dse-stamina-rec__status[hidden]`);

	test('the base rule STILL declares display: inline-flex — the guard is load-bearing, not vestigial', () => {
		expect(base.body).toMatch(/display:\s*inline-flex/);
	});

	test('the guard exists, is Steel-scoped + print-excluded, and sets display: none', () => {
		expect(guard.body).toMatch(/display:\s*none/);
	});

	test('the guard is source-ordered AFTER the display it has to beat', () => {
		expect(guard.at).toBeGreaterThan(base.at);
	});

	test('the guard matches the two [hidden] guards the codebase already ships', () => {
		expect(exact('.dse-sedit__warn[hidden]').body).toMatch(/display:\s*none/);
		expect(exact('.dse-collapse__region[hidden]').body).toMatch(/display:\s*none/);
	});

	/**
	 * CAN-FAIL PROOF, in a real cascade rather than in rule text: feed jsdom the two
	 * REAL rule bodies extracted above and assert a `hidden` badge under a Steel root
	 * computes to display:none — and that WITHOUT the guard the same DOM computes to
	 * inline-flex (that is the shipped defect: an empty pill on a healthy character).
	 */
	describe('cascade proof (jsdom)', () => {
		function computeDisplay(withGuard: boolean): string {
			const style = document.createElement('style');
			style.textContent =
				`.dse-stamina-rec__status{${base.body}}` +
				(withGuard ? `${guard.selector}{${guard.body}}` : '');
			const root = document.createElement('div');
			root.setAttribute('data-dse-theme', 'steel');
			root.setAttribute('data-dse-element', 'hero');
			const badge = document.createElement('span');
			badge.className = 'dse-stamina-rec__status';
			badge.toggleAttribute('hidden', true);
			root.appendChild(badge);
			document.head.appendChild(style);
			document.body.appendChild(root);
			try {
				return getComputedStyle(badge).display;
			} finally {
				style.remove();
				root.remove();
			}
		}

		test('with the guard, a hidden badge is display:none', () => {
			expect(computeDisplay(true)).toBe('none');
		});

		test('WITHOUT the guard it renders — the empty-pill defect, reproduced', () => {
			expect(computeDisplay(false)).toBe('inline-flex');
		});
	});
});
