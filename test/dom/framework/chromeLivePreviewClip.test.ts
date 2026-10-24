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

	it('opens the clip only above the widget: the other three sides keep the host clip', () => {
		const m = ruleBody(WIDGET).match(/clip-path:\s*inset\(([^)]*)\)/);
		expect(m).not.toBeNull();
		const [top, right, bottom, left] = m![1].trim().split(/\s+/).map((v) => Number.parseFloat(v));
		expect(top).toBeLessThanOrEqual(-54); // tallest panel 40.1px (touch buttons, 140% text) + 10px shadow + 3px focus ring
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
