// SC-502 — in Live Preview the chrome panel hangs above the element's top edge, outside the box of the
// CodeMirror widget Obsidian draws the block in, and Obsidian clips that widget (`contain: paint !important`
// on `.cm-content > [contenteditable="false"]` since 1.15.0; `overflow: hidden` on `.cm-embed-block:hover`).
// A clipped panel is neither painted nor hit-tested, so its buttons could not be clicked.
//
// Whether the panel is really reachable is layout and hit-testing, which jsdom cannot compute: the real gate is
// lifecycle scenario G-S44 (real mouse in a real Obsidian). What this file pins is the CSS contract that scenario
// depends on, so a dropped or weakened rule is named here first.
import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const CSS = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

/** The declaration block of the one rule whose selector is exactly `selector`. */
function ruleBody(selector: string): string {
	const at = CSS.indexOf(`${selector} {`);
	expect(at).toBeGreaterThan(-1);
	const open = CSS.indexOf('{', at);
	return CSS.slice(open + 1, CSS.indexOf('}', open));
}

const WIDGET =
	'.markdown-source-view.mod-cm6 .cm-content > .cm-preview-code-block.cm-embed-block:has([data-dse-chrome])';

describe('SC-502: the Live Preview widget does not clip the chrome panel', () => {
	it('lifts the host paint containment and the hover clip on a widget that holds chrome', () => {
		const body = ruleBody(WIDGET);
		// `!important` because the host's own rule is `!important`; ours wins on specificity ((0,6,0) against (0,4,0)).
		expect(body).toMatch(/contain:\s*none\s*!important/);
		expect(body).toMatch(/overflow:\s*visible/);
	});

	it('keeps the widget a block formatting context, so the block root\'s margins stay inside it (CodeMirror measures the widget)', () => {
		// Without it `contain: none` lets the margins collapse out: CodeMirror undercounts the block (48px for a feature card).
		expect(ruleBody(WIDGET)).toMatch(/display:\s*flow-root/);
	});

	it('opens the clip only above the widget: the other three sides keep the host clip', () => {
		const m = ruleBody(WIDGET).match(/clip-path:\s*inset\(([^)]*)\)/);
		expect(m).not.toBeNull();
		const [top, right, bottom, left] = m![1].trim().split(/\s+/).map((v) => Number.parseFloat(v));
		expect(top).toBeLessThanOrEqual(-86); // tallest panel 73.4px (touch buttons, 140% text, Obsidian font size 30) + 10px shadow + 3px focus ring
		// 1px of slack, not more, so the host's own 1px hover ring is not cut but nothing else spills sideways or down
		for (const side of [right, bottom, left]) expect(side).toBeGreaterThanOrEqual(-1);
		for (const side of [right, bottom, left]) expect(side).toBeLessThanOrEqual(0);
	});

	it('is scoped to Live Preview code-block widgets that contain a chrome-bearing block', () => {
		expect(WIDGET).toContain('.markdown-source-view.mod-cm6');
		expect(WIDGET).toContain(':has([data-dse-chrome])');
		// It must not move the panel or change what reveals it: no placement or reveal property in the rule.
		expect(ruleBody(WIDGET)).not.toMatch(/\b(top|bottom|right|left|margin|padding|opacity|pointer-events|z-index)\s*:/);
	});

	it('keeps the panel revealed over the whole widget (Obsidian\'s `</>` button is a sibling of the block root), screen-only Steel scope', () => {
		const sel =
			".markdown-source-view.mod-cm6 .cm-content > .cm-preview-code-block.cm-embed-block:hover\n\t[data-dse-theme='steel']:not([data-dse-print=\"on\"])[data-dse-chrome] .dse-chrome";
		const body = ruleBody(sel);
		expect(body).toMatch(/opacity:\s*1/);
		expect(body).toMatch(/pointer-events:\s*auto/);
		// the Reading view reveal rule is untouched: still keyed to the root's own :hover / :focus-within
		expect(CSS).toContain("[data-dse-theme='steel']:not([data-dse-print=\"on\"])[data-dse-chrome]:hover .dse-chrome,");
	});

	it('keeps the collapsed one-liner clear of the `</>` button: 4px inset + 28px button + 4px gap = 36px, Live Preview only', () => {
		const body = ruleBody(
			".markdown-source-view.mod-cm6 .cm-content > .cm-preview-code-block.cm-embed-block\n\t[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-chrome-summary",
		);
		expect(body).toMatch(/padding-right:\s*36px/);
		// nothing else about the bar changes in Live Preview
		expect(body.match(/:/g)).toHaveLength(1);
	});
});

// SC-520 — a chrome block that is the FIRST thing in a callout has its panel over the callout's title row, and Obsidian's
// `.callout-content { overflow-x: auto }` (a scroll container, so it clips on both axes) cut it off in Live Preview and Reading view alike:
// a click at a button's centre landed on `div.callout-title`. The real gate is lifecycle G-S49; this pins the CSS it depends on.
const CH = "[data-dse-theme='steel']:not([data-dse-print=\"on\"])[data-dse-chrome]";
// Only a callout whose FIRST content child is the chrome block has the panel over its title; a block with something above it was never clipped.
const CALLOUT_CONTENT = `.callout-content:has(> :first-child > ${CH})`;
const CALLOUT = `.callout:has(> .callout-content > :first-child > ${CH})`;
const CALLOUT_INSET = `.markdown-source-view.mod-cm6 .cm-callout .callout-content:has(> :first-child > ${CH}) .dse-chrome-anchor`;

describe('SC-520: a callout does not clip the chrome panel of a block at its top', () => {
	it('lifts the callout content clip, and keeps its box a block formatting context', () => {
		const body = ruleBody(CALLOUT_CONTENT);
		expect(body).toMatch(/overflow:\s*visible/);
		// flow-root keeps `.callout-content`'s own box where the scroll container had it (the block's top margin would otherwise collapse out
		// through it and move the box down, and with it a theme's content background). It is NOT what keeps CodeMirror's widget height
		// right: those margins stop at `.callout`'s 12px padding either way (measured, SC-520 review LOW-2).
		expect(body).toMatch(/display:\s*flow-root/);
	});

	it('makes the CALLOUT the sideways scroller, so wide content in the same callout (a table, a long code line) stays reachable', () => {
		const body = ruleBody(CALLOUT);
		expect(body).toMatch(/overflow-x:\s*auto/);
		// y stays clipped: the callout's rounded corners, and nothing may scroll vertically inside it
		expect(body).toMatch(/overflow-y:\s*hidden/);
		expect(body).not.toMatch(/\b(top|bottom|right|left|margin|padding|width|height|display|position)\s*:/);
	});

	it('is scoped to a callout whose first content child is a Steel screen chrome block, and moves nothing', () => {
		// screen-only Steel scope like every chrome rule: print and the frozen print shots never match
		for (const sel of [CALLOUT_CONTENT, CALLOUT, CALLOUT_INSET]) {
			expect(sel).toContain(CH);
			expect(sel).toContain('> :first-child >');
		}
		// placement, size and reveal are untouched: no property that could move or resize anything
		expect(ruleBody(CALLOUT_CONTENT)).not.toMatch(/\b(top|bottom|right|left|margin|padding|width|height|opacity|pointer-events|z-index|clip-path|contain)\s*:/);
	});

	it('in Live Preview only, keeps the panel 36px clear of the widget edge so Obsidian\'s `</>` button does not cover Collapse', () => {
		// 36px = 4px (`</>`'s inset from the widget edge) + 28px (its width) + 4px gap, the SC-502 one-liner figure; the card sits 12px inside the
		// widget (the callout's padding), so the panel's own inset from the card edge is 24px (the default is 10px)
		expect(ruleBody(CALLOUT_INSET)).toMatch(/--dse-chrome-inset:\s*24px/);
		expect(CALLOUT_INSET).toContain('.markdown-source-view.mod-cm6 .cm-callout');
		expect(ruleBody(CALLOUT_INSET).match(/:/g)).toHaveLength(1); // that one declaration only
	});
});
