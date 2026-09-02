import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * SC-202 r1 — the input/stepper host re-grounding block (foot of styles-source.css,
 * right after the SC-203 button block it mirrors).
 *
 * The BEHAVIOUR is gated by `assertInputHostLeak` in visual-harness/shoot.mjs, which
 * injects the REAL, locally-extracted Obsidian app.css over the gallery's numeric/text
 * inputs and fails if any sampled property moves (rest + focus-visible, dark + light).
 * That gate self-skips when no local Obsidian asar is installed, so it cannot be
 * trusted as the ONLY protection for this block in every environment — these are
 * source-text contracts for the same reason the sibling `hostRegrounding.test.ts`
 * (SC-203) is: jsdom cascades no var(), computes no calc(), and lays out nothing, so
 * rule text is what is assertable here, and it runs everywhere the sweep cannot.
 */

const rawCss = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'styles-source.css'), 'utf8');
const blockStart = rawCss.indexOf('SC-202 r1 — INPUT/STEPPER HOST RE-GROUNDING');
const css = rawCss.slice(blockStart).replace(/\/\*[\s\S]*?\*\//g, '');
/** Whitespace-insensitive: the block wraps long selectors across lines. */
const flat = css.replace(/\s+/g, ' ');
const ANCHOR = ':is([data-dse-element], .dse-modal):not([data-dse-print="on"])';

const COUSIN_INPUTS = [
	'.dse-init__malice-quickadd-amount',
	'.dse-init__malice-quickadd-label',
	'.dse-mt__skill-input',
	'.dse-mt__char-input',
	'.dse-party__award-input',
	'.dse-prj__roll-input',
	'.dse-prj__points-input',
	'.dse-prj__char-input',
];

test('the SC-202 r1 block is still in the sheet', () => {
	expect(blockStart).toBeGreaterThan(0);
});

describe('SC-202 r1 — GROUP 1: height + box-sizing, all nine input selectors', () => {
	const m = flat.match(
		new RegExp(escape(ANCHOR) + ' :where\\(([^)]*)\\) \\{([^}]*)\\}'),
	);

	test('the shared block exists and names all nine selectors', () => {
		expect(m).not.toBeNull();
		expect(m![1]).toContain('.dse-stepper__input');
		for (const sel of COUSIN_INPUTS) expect(m![1]).toContain(sel);
	});

	test('height is `auto` — never a pixel figure (same lesson as the SC-203 block)', () => {
		expect(m![2]).toContain('height: auto;');
		expect(m![2]).not.toMatch(/height:\s*\d/);
	});

	test('box-sizing is pinned to `content-box` — the UA default these boxes already render at', () => {
		// Obsidian's app.css carries a universal `* { box-sizing: border-box }` reset; without
		// this the height/width comparison keeps failing on every selector that does not
		// already declare its own box-sizing (proven by the can-fail sweep, see the round's
		// report). `content-box` restates today's value, so it moves no pixel on its own.
		expect(m![2]).toContain('box-sizing: content-box;');
	});
});

describe('SC-202 r1 — GROUP 2: the material Obsidian was winning on', () => {
	test("`.dse-stepper__input` restates its own kit-base declarations verbatim", () => {
		const g = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(\\.dse-stepper__input\\) \\{([^}]*)\\}'));
		expect(g).not.toBeNull();
		for (const decl of [
			'padding: 0.25em;',
			'color: var(--dse-fg);',
			'background: var(--dse-surface-sunken);',
			'border: 1px solid var(--dse-border);',
			'border-radius: var(--dse-radius);',
		]) {
			expect(g![1]).toContain(decl);
		}
	});

	test('the malice quick-add pair gets the same plain-field material every sibling input has', () => {
		const g = flat.match(
			new RegExp(
				escape(ANCHOR) +
					' :where\\(\\.dse-init__malice-quickadd-amount, \\.dse-init__malice-quickadd-label\\) \\{([^}]*)\\}',
			),
		);
		expect(g).not.toBeNull();
		for (const decl of [
			'padding: 0.25em 0.4em;',
			'color: var(--dse-fg);',
			'background: var(--dse-surface);',
			'border: 1px solid var(--dse-border);',
			'border-radius: var(--dse-radius);',
		]) {
			expect(g![1]).toContain(decl);
		}
	});
});

describe('SC-202 r1 — GROUP 3: focus-visible border-color + box-shadow, all nine', () => {
	test('`:focus-visible` sits OUTSIDE `:where()` — the third class the state needs', () => {
		// :where() contributes zero specificity; Obsidian's border-color/box-shadow rules at
		// :active/:focus/:focus-visible are (0,0,2,1) and a (0,0,2,0) challenger loses the
		// class-count tie on the type-selector tiebreak — exactly why the shared kit
		// focus-ring rule (outline only) survives while a bare :where()-wrapped box-shadow
		// would not. Appending `:focus-visible` to the compound, not inside :where(), reaches
		// (0,0,3,0), which wins outright.
		const rules = [...flat.matchAll(new RegExp(escape(ANCHOR) + ' :where\\(([^)]*)\\):focus-visible \\{([^}]*)\\}', 'g'))];
		expect(rules.length).toBe(2);
		const allSubjects = rules.map((r) => r[1]).join(', ');
		expect(allSubjects).toContain('.dse-stepper__input');
		for (const sel of COUSIN_INPUTS) expect(allSubjects).toContain(sel);
		for (const r of rules) {
			expect(r[2]).toContain('box-shadow: none;');
			expect(r[2]).toContain('border-color: var(--dse-border);');
		}
	});
});

describe('SC-202 r1 — the counter stepper input keeps its own higher-specificity rule', () => {
	test('`input.dse-counter__value` restates border-radius and box-shadow, not just height', () => {
		const counterBlock = rawCss
			.slice(rawCss.indexOf("input.dse-counter__value {"))
			.split('}')[0];
		expect(counterBlock).toContain('border-radius: 0;');
		expect(counterBlock).toContain('box-shadow: none;');
		// The pre-existing "strip the field chrome" declarations must still be there —
		// this round adds to that rule, it does not replace it.
		expect(counterBlock).toContain('border: none;');
		expect(counterBlock).toContain('background: transparent;');
	});
});

describe('SC-202 r1 — the eight cousins join the Controls font slot and the shared focus ring', () => {
	test('font-family AND font-size (SC-185 twin) both widen to the eight cousins', () => {
		for (const decl of ['font-family: var(--dse-font-controls);', 'font-size: var(--dse-fs-control);']) {
			const idx = rawCss.indexOf(decl);
			expect(idx).toBeGreaterThan(0);
			// The selector LIST immediately preceding the declaration block is what matters —
			// walk back to the nearest '}' (the end of the previous rule) and check every
			// cousin appears in between.
			const priorRuleEnd = rawCss.lastIndexOf('}', idx);
			const selectorList = rawCss.slice(priorRuleEnd, idx);
			for (const sel of COUSIN_INPUTS) expect(selectorList).toContain(sel);
		}
	});

	test('the shared kit focus-ring rule (outline) now names all eight cousins too', () => {
		const ringStart = rawCss.indexOf('.dse-btn:focus-visible,');
		const ringBlock = rawCss.slice(ringStart, rawCss.indexOf('outline: 2px solid var(--dse-focus-ring);', ringStart));
		for (const sel of COUSIN_INPUTS) {
			expect(ringBlock).toContain(`${sel}:focus-visible,`);
		}
	});
});

function escape(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
