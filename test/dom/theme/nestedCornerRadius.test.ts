// SC-204 — THE `--dse-radius` EM AUDIT.
//
// `--dse-radius` is `0.4em`, and a custom property holding an `em` length re-resolves
// against whichever element USES it. That makes one token produce different geometry in
// different places with nothing to warn you, and it has now produced the same defect twice:
//
//   SC-189  the statblock/featureblock head band read `var(--dse-radius)` in its own font
//           context (6.40px) inside a plate rounded at `--dse-plate-radius` = 0.65rem
//           (10.40px). A tighter arc anchored at the same corner bulges OUTSIDE a looser
//           one, a non-positioned child's background paints AFTER its parent's border, and
//           `.dse-sb` is `overflow: visible` on purpose — so the band painted over the
//           plate's hairline for the whole 90 degrees of both top corners.
//   SC-204  the hero sheet's region header strip, the same mechanism with the sign
//           reversed: an <h3> at fs 18.72 read the same token as 7.488px inside a region
//           rounded at 6.40px with a 1px border (inner 5.40px), so the strip's fill was cut
//           back off both top corners and a ~0.9px wedge of the region's sunken plate
//           showed where the raised strip should be (measured 9-16/255 dark, 1-9/255
//           light, all seven regions, both corners).
//
// The audit swept all 73 `var(--dse-radius)` consumers against every harness capture in
// both schemes. THE VERDICT ON THE TOKEN: `em` STAYS. It is load-bearing for the text-sized
// affordances — the card head's chip slots alone come out 4.76 / 5.60 / 6.30 / 7.00px
// across their four type-scale steps, which a single rem would flatten — and it is a real
// accessibility affordance (the radius follows the reader's font size). What is banned is
// using it on BOTH halves of a flush pair. A plate whose corner a second element has to
// MEET names its own radius in `rem`, and the flush child derives from it with
// `calc(... - 1px)`. This file pins that convention; the LAYOUT gate that catches a new
// violation anywhere in the tree is `assertNestedCornerRadius` in visual-harness/shoot.mjs
// (jsdom computes no layout, so the measurement cannot live here).
import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const CSS = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

/** The declaration block that follows `needle`, up to its closing brace. */
const blockAt = (needle: string): string => {
	const start = CSS.indexOf(needle);
	expect(start).toBeGreaterThan(-1);
	return CSS.slice(start, CSS.indexOf('}', start));
};

describe('SC-204 — the named plate radii are `rem`, and their flush children derive from them', () => {
	const REGION = "[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-hero__region {";
	const STRIP = "[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-hero__region-title {";

	test('the hero region NAMES its radius in `rem` and uses the name', () => {
		// `rem` for the same reason `--dse-plate-radius` is: a `rem` is the same length
		// wherever it is consumed, so the strip below cannot resolve it differently.
		// 0.4rem is the same 6.40px the base rule's `0.4em` already computed at the hero's
		// 16px, so naming it moves nothing — only the strip's corners are repaired.
		const block = blockAt(REGION);
		expect(block).toContain('--dse-region-radius: 0.4rem;');
		expect(block).toContain('border-radius: var(--dse-region-radius);');
	});

	test('the region header strip derives its top corners from that radius, minus the border', () => {
		// Derived, not restated, so the two can never drift apart again.
		const block = blockAt(STRIP);
		expect(block.replace(/\s+/g, ' ')).toContain(
			'border-radius: calc(var(--dse-region-radius) - 1px) calc(var(--dse-region-radius) - 1px) 0 0;',
		);
	});

	test('the strip no longer keys its corners on the em-valued `--dse-radius`', () => {
		expect(blockAt(STRIP)).not.toContain('border-radius: var(--dse-radius)');
	});

	test('both named radii exist, and neither is spelled in `em`', () => {
		// The whole point of naming them. An `em` here would silently reinstate the trap.
		for (const decl of ['--dse-plate-radius: 0.65rem;', '--dse-region-radius: 0.4rem;']) {
			expect(CSS).toContain(decl);
		}
		expect(CSS).not.toMatch(/--dse-(plate|region)-radius:\s*[\d.]+em\b/);
	});

	test('the region fix is Steel-screen-scoped, so no frozen print byte can move', () => {
		// `--dse-region-radius` is declared ONLY inside the print-excluded Steel rule, so in
		// print the strip's `calc()` has no value to read, falls back to 0, and print stays
		// square exactly as `--dse-radius: 0` already made it.
		for (const sel of [REGION, STRIP]) {
			expect(sel).toContain("[data-dse-theme='steel']");
			expect(sel).toContain(':not([data-dse-print="on"])');
		}
		expect(CSS.indexOf('--dse-region-radius: 0.4rem;')).toBeGreaterThan(-1);
		expect(CSS.match(/--dse-region-radius:/g)).toHaveLength(1);
	});
});

describe('SC-204 — the initiative turn box and its button agree at the corner', () => {
	// Not an `em` case: the compact-button reset zeroes `border-radius` along with the rest
	// of the kit chrome, and this button IS the turnbox's padding box (width/height 100%),
	// so at 0 its own gradient covered the box's 1px hairline for the whole of each corner
	// arc. In LIGHT, where that gradient starts at rgba(255,255,255,0.9), the ring read
	// rgb(237,238,238) against a rgb(84,92,97) hairline — 156/255 off the straight edges
	// either side of it. Same defect CLASS, and the same gate catches it.
	test('the button rounds at the box radius minus the box border', () => {
		const box = blockAt('    .dse-init__turnbox {');
		expect(box).toContain('border: 1px solid var(--dse-rule);');
		expect(box).toContain('border-radius: 4px;');
		const btn = blockAt('    .dse-init__turn {\n');
		expect(btn).toContain('border-radius: 3px;');
		// The svg inside is inset a further 1px and has carried the same 3px all along —
		// this is the arithmetic it was already using, applied one box out.
		expect(blockAt('    .dse-init__turn svg {')).toContain('border-radius: 3px;');
	});
});

describe('SC-204 — the token declaration carries the hazard', () => {
	test('`--dse-radius` is still 0.4em and says why, and what the rule is', () => {
		// If a future round converts this to rem it will flatten every text-scaled chip in
		// the sheet. The comment is the deliverable of this audit; this test is what keeps a
		// drive-by from deleting it along with the value.
		expect(CSS).toContain('--dse-radius: 0.4em;');
		const start = CSS.indexOf('--dse-radius: 0.4em;');
		const preamble = CSS.slice(Math.max(0, start - 2200), start);
		expect(preamble).toContain('SC-204');
		expect(preamble).toContain('--dse-plate-radius');
		expect(preamble).toContain('--dse-region-radius');
		expect(preamble).toContain('assertNestedCornerRadius');
	});
});
