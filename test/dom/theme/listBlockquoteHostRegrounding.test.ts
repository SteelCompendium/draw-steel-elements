import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * SC-202 r3 — the list + blockquote host re-grounding block (foot of styles-source.css,
 * right after the SC-202 r2 table block it mirrors).
 *
 * The BEHAVIOUR is gated by `assertListHostLeak` in visual-harness/shoot.mjs, which injects
 * the REAL, locally-extracted Obsidian app.css over the gallery's lists/blockquotes (under
 * the SAME dynamically-added `.markdown-preview-view.markdown-rendered` ancestor
 * `assertTableHostLeak` synthesizes — `wrapMountInMarkdownRendered`, shared, not forked) and
 * fails if any sampled ul/ol/li/li::marker/blockquote/hr property moves. That gate self-skips
 * when no local Obsidian asar is installed, so it cannot be trusted as the ONLY protection
 * for this block in every environment — these are source-text contracts for the same reason
 * the sibling `tableHostRegrounding.test.ts` (SC-202 r2) is: jsdom cascades no var(), computes
 * no calc(), and lays out nothing, so rule text is what is assertable here, and it runs
 * everywhere the sweep cannot.
 *
 * FIX ROUND (2026-09-05, review of `a7820c1`): GROUP 4's shape changed (MED-2 — the
 * original `li > p` never matched Obsidian's own descendant rule and so could never fire);
 * GROUP 5 gained a child-margin sub-rule (MED-1); GROUP 1/2 gained `list-style-type`/
 * `text-align` (LOW-2); GROUP 6 (nested lists, HIGH-1a/MED-3) and GROUP 7 (`hr`, MED-4) are
 * new.
 */

const rawCss = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'styles-source.css'), 'utf8');
const blockStart = rawCss.indexOf('SC-202 r3 — LIST + BLOCKQUOTE HOST RE-GROUNDING');
/** Bounded at the NEXT round's own opening banner (if one ever lands after this block) —
 *  the sibling `tableHostRegrounding.test.ts` shipped an unbounded `slice(blockStart)` and
 *  it broke the moment THIS block was appended after it (its own "never touches
 *  list/blockquote" scope-fence test started reading past its own end). Every one of these
 *  round blocks opens with the same 84-`=` banner; this stays correct even if nothing ever
 *  gets appended after r3 (the `indexOf` then returns -1 and the slice runs to EOF, same as
 *  before). */
const BANNER = '/* ' + '='.repeat(84) + ' */';
const nextBlockStart = rawCss.indexOf(BANNER, blockStart + BANNER.length);
const css = (nextBlockStart === -1 ? rawCss.slice(blockStart) : rawCss.slice(blockStart, nextBlockStart)).replace(
	/\/\*[\s\S]*?\*\//g,
	'',
);
/** Whitespace-insensitive: the block wraps long selectors across lines. */
const flat = css.replace(/\s+/g, ' ');
const ANCHOR = ':is([data-dse-element], .dse-modal):not([data-dse-print="on"])';

test('the SC-202 r3 block is still in the sheet', () => {
	expect(blockStart).toBeGreaterThan(0);
});

describe('SC-202 r3 — GROUP 1: ul/ol top-level box', () => {
	test('padding-inline-start and margin-block-start/end are restated on both ul and ol', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(ul, ol\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('padding-inline-start: 40px;');
		expect(m![1]).toContain('margin-block-start: 1em;');
		expect(m![1]).toContain('margin-block-end: 1em;');
	});
	test('FIX ROUND (LOW-2) — list-style-type is restated per tag, disc for ul and decimal for ol', () => {
		const ulM = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(ul\\) \\{([^}]*)\\}'));
		expect(ulM).not.toBeNull();
		expect(ulM![1]).toContain('list-style-type: disc;');
		const olM = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(ol\\) \\{([^}]*)\\}'));
		expect(olM).not.toBeNull();
		expect(olM![1]).toContain('list-style-type: decimal;');
	});
});

describe('SC-202 r3 — GROUP 2: li (any ul > li / ol > li, classed or not)', () => {
	test('padding-top/-bottom, position, margin-inline-start and text-align are restated', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(ul > li, ol > li\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		for (const decl of ['padding-top: 0;', 'padding-bottom: 0;', 'position: static;', 'margin-inline-start: 0;', 'text-align: start;']) {
			expect(m![1]).toContain(decl);
		}
	});
});

describe('SC-202 r3 — GROUP 3: li::marker', () => {
	test('marker colour is restated to inherit, via :where(li)::marker (the pseudo-element chains AFTER :where(), never inside its argument list)', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(li\\)::marker \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('color: inherit;');
		// Every re-grounding subject in this file must start with `:where(` — the SC-203
		// block's own whole-file invariant (hostRegrounding.test.ts) — so this can never
		// regress to a bare `li::marker` right after the anchor.
		expect(flat).not.toMatch(new RegExp(escape(ANCHOR) + ' li::marker'));
	});
});

describe("SC-202 r3 — GROUP 4: li p:first-of-type / :last-of-type (the brief's own \"li > p\")", () => {
	// FIX ROUND (MED-2): the original `li > p:first-of-type` (subject inside :where(), a
	// DIRECT-child combinator) was inert — Obsidian's own rule is a DESCENDANT selector
	// ("li p", not "li > p") at (0,2,3), which always outranked the original (0,2,0). Fixed
	// two ways: the combinator is now a descendant space, and the subject moved OUTSIDE
	// :where() to clear (0,2,3) — `:where(li) p:first-of-type` = (0,3,1).
	test('the first paragraph in a list item restores its own top margin, via a DESCENDANT selector', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(li\\) p:first-of-type \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('margin-block-start: 1em;');
	});
	test('the last paragraph in a list item restores its own bottom margin, via a DESCENDANT selector', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(li\\) p:last-of-type \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('margin-block-end: 1em;');
	});
	test('the subject is genuinely OUTSIDE :where() (a direct-child :where(li > p...) shape could never clear Obsidian\'s (0,2,3))', () => {
		expect(flat).not.toMatch(new RegExp(escape(ANCHOR) + ' :where\\(li > p'));
	});
});

describe('SC-202 r3 — GROUP 5: blockquote', () => {
	test('every property Obsidian sets on the element itself is restated, including the ones that measure 0 diff today', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(blockquote\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		for (const decl of [
			'color: inherit;',
			'font-style: normal;',
			'background-color: transparent;',
			'border-inline-start: none;',
			'padding-top: 0;',
			'padding-bottom: 0;',
			'padding-inline-start: 0;',
			'margin-inline-start: 40px;',
			'margin-inline-end: 40px;',
		]) {
			expect(m![1]).toContain(decl);
		}
		// Obsidian's own rule never touches the block axis ON THE ELEMENT ITSELF — verified
		// safe, must stay absent (the first/last CHILD's own margin is a different rule, see
		// below — MED-1).
		expect(m![1]).not.toContain('margin-top');
		expect(m![1]).not.toContain('margin-bottom');
	});
	test("FIX ROUND (MED-1) — the blockquote's first/last ELEMENT CHILD restores its own top/bottom margin, subject OUTSIDE :where() to clear (0,2,1)", () => {
		const firstM = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(blockquote\\) > :first-child \\{([^}]*)\\}'));
		expect(firstM).not.toBeNull();
		expect(firstM![1]).toContain('margin-top: 1em;');
		const lastM = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(blockquote\\) > :last-child \\{([^}]*)\\}'));
		expect(lastM).not.toBeNull();
		expect(lastM![1]).toContain('margin-bottom: 1em;');
	});
});

describe('SC-202 r3 — GROUP 6: nested lists (FIX ROUND HIGH-1a/MED-3 — live in title/fleet-admiral-shaped content)', () => {
	test('nested ul/ol margin-block collapses to 0 (HIGH-1a)', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(ul ul, ul ol, ol ul, ol ol\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('margin-block-start: 0;');
		expect(m![1]).toContain('margin-block-end: 0;');
	});
	test('nested list-style-type restates the UA cycle (circle at depth 2, square at depth 3+), countering Obsidian\'s flat disc', () => {
		const circleM = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(ul ul, ol ul\\) \\{([^}]*)\\}'));
		expect(circleM).not.toBeNull();
		expect(circleM![1]).toContain('list-style-type: circle;');
		const squareM = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(ul ul ul, ol ul ul, ul ol ul, ol ol ul\\) \\{([^}]*)\\}'));
		expect(squareM).not.toBeNull();
		expect(squareM![1]).toContain('list-style-type: square;');
	});
	test('a nested ul/ol is forced static, at a specificity genuinely above (0,2,2) (the doubled :not() is deliberate)', () => {
		const m = flat.match(
			new RegExp(escape(':is([data-dse-element], .dse-modal):not([data-dse-print="on"]):not([data-dse-print="on"]) li > :is(ul, ol)') + ' \\{([^}]*)\\}'),
		);
		expect(m).not.toBeNull();
		expect(m![1]).toContain('position: static;');
	});
	test('the indentation-guide pseudo-element is neutralised via a token override, not a specificity fight', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' \\{([^}]*--indentation-guide-width[^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('--indentation-guide-width: 0;');
	});
});

describe('SC-202 r3 — GROUP 7: hr (FIX ROUND MED-4 — live in treasure/scorpion-tails-shaped content)', () => {
	test('a bare hr is restated to the browser UA default look', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(hr\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('border: 1px inset;');
		// FIX ROUND 2 (scoped re-review MED-A) — `initial` resolves to `currentcolor`, and
		// the harness and a real vault inherit DIFFERENT colours on a bare `<hr>` (the
		// harness's own UA gives it `color: gray`; a real vault inherits the card's own
		// ink) — the sweep cannot see this (both passes share one browser), so the fix is
		// the LITERAL the harness already computes, `gray`, not a keyword that re-resolves
		// per engine.
		expect(m![1]).toContain('border-color: gray;');
		expect(m![1]).toContain('margin-block-start: 0.5em;');
		expect(m![1]).toContain('margin-block-end: 0.5em;');
	});
});

describe('SC-202 r3 — scope fence: checkboxes are the NEXT round, not this one', () => {
	test('the block never touches li.task-list-item or input[type=checkbox] — three declarations deliberately left', () => {
		for (const forbidden of ['task-list-item', "input[type='checkbox']", 'input[type="checkbox"]']) {
			expect(flat).not.toContain(forbidden);
		}
	});
});

describe('SC-202 r3 — scope fence: no other leak family creeps in', () => {
	test('the block never touches table/heading/emphasis/link selectors', () => {
		for (const forbidden of ['<table', ' table ', 'thead', 'tbody', /\bh[1-6]\b/, 'strong']) {
			if (typeof forbidden === 'string') expect(flat).not.toContain(forbidden);
			else expect(flat).not.toMatch(forbidden);
		}
	});
});

function escape(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
