import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * SC-203 — the plugin-wide host re-grounding block (foot of styles-source.css).
 *
 * The BEHAVIOUR is gated by `assertBtnHostLeak` in visual-harness/shoot.mjs, which
 * injects Obsidian's real `button` rules over the whole gallery and fails if any
 * sampled property moves. That gate can only see the RESTING state, so it cannot
 * protect the one genuinely fragile thing about this block: it sits at (0,2,0), which
 * is the same specificity as three kit STATE rules that appear EARLIER in the file
 * (`.dse-collapse__header:hover`, `.dse-tabs__tab:hover`,
 * `.dse-tabs__tab[aria-selected='true']`). Source order would hand those ties to the
 * new block and silently kill a hover fill and the selected tab's accent bar.
 *
 * These are source-text contracts for the same reason the sibling suites are
 * (steelTypography / controlDensity / scaleRules): jsdom cascades no var(), computes
 * no calc(), and lays out nothing, so rule text is the only thing assertable here.
 * Comments are text, and the block's own prose names every selector below, so every
 * match runs against a comment-stripped copy.
 */

const rawCss = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'styles-source.css'), 'utf8');
/** Only the SC-203 block. The same anchor is used by the Controls font-family/font-size
 *  rules (~:5717/5738) with a BARE `.dse-btn` subject, and those are a different contract
 *  — a whole-file scan would drag them into the :where() assertion below. */
const blockStart = rawCss.indexOf('SC-203 — PLUGIN-WIDE HOST RE-GROUNDING');
const css = rawCss.slice(blockStart).replace(/\/\*[\s\S]*?\*\//g, '');
/** Whitespace-insensitive: the block wraps long selectors across lines. */
const flat = css.replace(/\s+/g, ' ');
const ANCHOR = ':is([data-dse-element], .dse-modal):not([data-dse-print="on"])';

test('the SC-203 block is still in the sheet', () => {
	expect(blockStart).toBeGreaterThan(0);
});

describe('SC-203 host re-grounding — the block exists and re-grounds what Obsidian sets', () => {
	test('the four button families get `height: auto` — never a pixel figure', () => {
		const m = flat.match(
			new RegExp(
				escape(ANCHOR) +
					' :where\\(\\.dse-btn, \\.dse-tabs__tab, \\.dse-collapse__header, \\.dse-pr__row\\) \\{([^}]*)\\}',
			),
		);
		expect(m).not.toBeNull();
		expect(m![1]).toContain('height: auto;');
		// A px height would freeze the box where the kit's `em` sizing tracks the user's
		// text/card-size prefs — the whole point of SC-189 round 4's `auto`.
		expect(m![1]).not.toMatch(/height:\s*\d/);
	});

	test('`white-space` is re-grounded to `inherit`, not `normal`', () => {
		// `white-space` is INHERITED and no UA rule sets it on <button>, so `normal`
		// would sever a real inheritance: `.dse-init__right` declares `nowrap` so the
		// roster's health readout cannot break mid-phrase, and `.dse-init__stamina`
		// inside it is a `.dse-btn`. Measured: writing `normal` made that one button
		// wrappable, which `inherit` does not.
		const m = flat.match(
			new RegExp(
				escape(ANCHOR) +
					' :where\\(\\.dse-btn, \\.dse-tabs__tab, \\.dse-collapse__header, \\.dse-pr__row\\) \\{([^}]*)\\}',
			),
		);
		expect(m).not.toBeNull();
		expect(m![1]).toContain('white-space: inherit;');
		expect(m![1]).not.toContain('white-space: normal;');
	});

	test('every re-grounding subject is wrapped in :where() — the specificity is the point', () => {
		// The block must stay at exactly the anchor's own (0,2,0): high enough to beat
		// Obsidian's `button` (0,0,1) and `button:not(.clickable-icon)` (0,1,1), low
		// enough that every component-level override in this sheet still wins.
		const anchored = [...flat.matchAll(new RegExp(escape(ANCHOR) + ' ([^{]+)\\{', 'g'))].map((x) =>
			x[1].trim(),
		);
		expect(anchored.length).toBeGreaterThanOrEqual(10);
		for (const sel of anchored) {
			expect(sel.startsWith(':where(')).toBe(true);
		}
	});
});

describe('SC-203 host re-grounding — the (0,2,0) state rules it must not beat', () => {
	test('the collapse header fill is guarded against its own :hover rule', () => {
		expect(flat).toContain(`${ANCHOR} :where(.dse-collapse__header:not(:hover)) { background-color: transparent; }`);
	});

	test('the tab fill is guarded against :hover AND the selected state', () => {
		expect(flat).toContain(
			`${ANCHOR} :where(.dse-tabs__tab:not(:hover):not([aria-selected='true'])) { background-color: var(--dse-surface); }`,
		);
	});

	test("the selected tab's accent bar is restated, not dropped", () => {
		// `box-shadow: none` in section B would otherwise erase it, so the tab is
		// excluded there and its own box-shadow is mirrored here.
		const m = flat.match(
			new RegExp(
				escape(ANCHOR) + " :where\\(\\.dse-tabs__tab\\[aria-selected='true'\\]:not\\(:hover\\)\\) \\{([^}]*)\\}",
			),
		);
		expect(m).not.toBeNull();
		expect(m![1]).toContain('box-shadow: inset 0 2px 0 0 var(--dse-accent);');
		expect(m![1]).toContain('background-color: var(--dse-surface-raised);');
	});

	test('the box-shadow reset excludes the selected tab', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\((.*?)\\) \\{ box-shadow: none; \\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain(".dse-tabs__tab:not([aria-selected='true'])");
		// …and that the reset does reach the other three families.
		for (const f of ['.dse-btn', '.dse-collapse__header', '.dse-pr__row']) {
			expect(m![1]).toContain(f);
		}
	});
});

function escape(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
