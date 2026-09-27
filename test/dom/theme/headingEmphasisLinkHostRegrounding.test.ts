import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * SC-202 r4 — the heading + emphasis + link host re-grounding block (foot of
 * styles-source.css, right after the SC-202 r3 list/blockquote block it mirrors).
 *
 * The BEHAVIOUR is gated by `assertInlineHostLeak`/`assertLinkTokenOverride` in
 * visual-harness/shoot.mjs, which inject the REAL, locally-extracted Obsidian app.css over
 * the gallery's headings/emphasis/links (under the SAME dynamically-added
 * `.markdown-preview-view.markdown-rendered` ancestor `assertTableHostLeak`/
 * `assertListHostLeak` synthesize — `wrapMountInMarkdownRendered`, shared, not forked) and
 * fail if any sampled property moves. That gate self-skips when no local Obsidian asar is
 * installed, so it cannot be trusted as the ONLY protection for this block in every
 * environment — this is a source-text contract for the same reason the sibling
 * `listBlockquoteHostRegrounding.test.ts` (SC-202 r3) is: jsdom cascades no var(), computes
 * no calc(), and lays out nothing, so rule text is what is assertable here, and it runs
 * everywhere the sweep cannot.
 */

const rawCss = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'styles-source.css'), 'utf8');
const blockStart = rawCss.indexOf('SC-202 r4 — HEADING + EMPHASIS + LINK HOST RE-GROUNDING');
/** Bounded at the NEXT round's own opening banner, same reasoning as
 *  `listBlockquoteHostRegrounding.test.ts`'s own note (an unbounded slice broke the moment
 *  a later round's block landed after it) — this stays correct even if nothing is ever
 *  appended after r4 (`indexOf` returns -1, the slice runs to EOF). */
const BANNER = '/* ' + '='.repeat(84) + ' */';
const nextBlockStart = rawCss.indexOf(BANNER, blockStart + BANNER.length);
const css = (nextBlockStart === -1 ? rawCss.slice(blockStart) : rawCss.slice(blockStart, nextBlockStart)).replace(
	/\/\*[\s\S]*?\*\//g,
	'',
);
/** Whitespace-insensitive: the block wraps long selectors across lines. */
const flat = css.replace(/\s+/g, ' ');
const ANCHOR = ':is([data-dse-element], .dse-modal):not([data-dse-print="on"])';

test('the SC-202 r4 block is still in the sheet', () => {
	expect(blockStart).toBeGreaterThan(0);
});

describe('SC-202 r4 / SC-318 r2 — GROUP 1: h1-h6 base typography', () => {
	test('the shared subject-agnostic properties (colour/style/variant/family) are restated once for all six levels', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(h1, h2, h3, h4, h5, h6\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		for (const decl of ['color: inherit;', 'font-style: normal;', 'font-variant: normal;', 'font-family: inherit;']) {
			expect(m![1]).toContain(decl);
		}
		// SC-318 r2: letter-spacing/line-height/font-weight moved OUT of the shared rule —
		// they now differ by level (Obsidian's own per-level literals), so they can no
		// longer be one value shared by all six.
		for (const decl of ['letter-spacing:', 'line-height:', 'font-weight:']) {
			expect(m![1]).not.toContain(decl);
		}
	});

	// SC-318 r2: font-size is now the minted --dse-fs-h1..h6 token (Obsidian's OWN h1-h6
	// ratios), not the bare browser-UA literal SC-202 r4 restated. line-height/font-weight/
	// letter-spacing are Obsidian's own per-level literals (r1-survey/obsidian-installed-
	// app.css); margin-block-start/-end are BOTH `calc(1em / <ratio>)` — 1 BODY em in the
	// heading's own em unit, restating Obsidian's unconditional `h1..h6 { margin-block:
	// var(--p-spacing) }` rather than the old bare UA em ratio.
	test.each([
		['h1', 'var(--dse-fs-h1)', '1.2', '700', '-0.015em', 'calc(1em / 1.618)'],
		['h2', 'var(--dse-fs-h2)', '1.2', '680', '-0.011em', 'calc(1em / 1.462)'],
		['h3', 'var(--dse-fs-h3)', '1.3', '660', '-0.008em', 'calc(1em / 1.318)'],
		['h4', 'var(--dse-fs-h4)', '1.4', '640', '-0.005em', 'calc(1em / 1.188)'],
		['h5', 'var(--dse-fs-h5)', '1.5', '620', '-0.002em', 'calc(1em / 1.076)'],
		['h6', 'var(--dse-fs-h6)', '1.5', '600', '0em', '1em'],
	])('%s restates its own font-size (%s), line-height (%s), font-weight (%s), letter-spacing (%s) and margin-block (%s)', (tag, fontSize, lineHeight, weight, letterSpacing, margin) => {
		const m = flat.match(new RegExp(escape(`${ANCHOR} :where(${tag})`) + ' \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain(`font-size: ${fontSize};`);
		expect(m![1]).toContain(`line-height: ${lineHeight};`);
		expect(m![1]).toContain(`font-weight: ${weight};`);
		expect(m![1]).toContain(`letter-spacing: ${letterSpacing};`);
		expect(m![1]).toContain(`margin-block: ${margin};`);
	});

	// SC-318 r2: the adjacency margin-top bump (Obsidian's OWN `:is(p,pre,table,ul,ol) +
	// heading { margin-top: var(--heading-spacing) }`, 2.5 body-em instead of 1) is
	// restated per level as `margin-block-start` alone, so it overrides only the top side.
	test.each([
		['h1', 'calc(2.5em / 1.618)'],
		['h2', 'calc(2.5em / 1.462)'],
		['h3', 'calc(2.5em / 1.318)'],
		['h4', 'calc(2.5em / 1.188)'],
		['h5', 'calc(2.5em / 1.076)'],
		['h6', '2.5em'],
	])('%s bumps margin-block-start to %s after a p/pre/table/ul/ol sibling', (tag, margin) => {
		const m = flat.match(new RegExp(escape(`${ANCHOR} :is(p, pre, table, ul, ol) + :where(${tag})`) + ' \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain(`margin-block-start: ${margin};`);
	});

	test('the roster heading and hero region title (classed h3 tags) share --dse-fs-h3 explicitly', () => {
		const m = flat.match(new RegExp(escape(`${ANCHOR} :where(.dse-enc__roster-heading, .dse-hero__region-title)`) + ' \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('font-size: var(--dse-fs-h3);');
	});

	test('.dse-hero__name (h2) is pinned to its pre-SC-318 rendered value, not the h2 token', () => {
		const m = flat.match(new RegExp(escape(`${ANCHOR} .dse-hero__name`) + ' \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('font-size: 1.5em;');
		expect(m![1]).toContain('line-height: inherit;');
		expect(m![1]).not.toContain('--dse-fs-h2');
	});
});

describe('SC-202 r4 — GROUP 2: strong/em, joined by b/i (fix round MED-2)', () => {
	test('strong AND b share one rule: font-weight: bold and color: inherit', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(strong, b\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('font-weight: bold;');
		expect(m![1]).toContain('color: inherit;');
	});
	test('em AND i share one rule: font-style: italic and color: inherit', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(em, i\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('font-style: italic;');
		expect(m![1]).toContain('color: inherit;');
	});
});

describe('SC-202 r4 — GROUP 3: mark (needs the .markdown-rendered wrapper — Obsidian scopes it)', () => {
	test('mark restates the browser UA black-on-yellow default, not the theme highlight tokens', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(mark\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('background-color: yellow;');
		expect(m![1]).toContain('color: black;');
	});
});

describe('SC-202 r4 — GROUP 4: code (an inline span; pre code is deliberately deferred)', () => {
	test('code restates the browser UA monospace default and no chip material', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(code\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		for (const decl of ['color: inherit;', 'font-family: monospace;', 'font-size: inherit;', 'background-color: transparent;', 'border-radius: 0;', 'padding: 0;', 'border: none;']) {
			expect(m![1]).toContain(decl);
		}
	});
});

describe('SC-202 r4 — GROUP 5: a (generic — colour deliberately absent, already safe via .dse-card a)', () => {
	test('font-weight/outline/text-decoration/cursor are restated to the browser UA anchor defaults', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(a\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		for (const decl of ['font-weight: inherit;', 'outline: none;', 'text-decoration-line: underline;', 'text-decoration-thickness: auto;', 'cursor: pointer;']) {
			expect(m![1]).toContain(decl);
		}
	});
	test('color is NOT restated here (the pre-existing .dse-card a family already owns it at higher specificity)', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(a\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).not.toMatch(/(?<!background-)color:/);
	});

	// fix round (MED-1) — `outline: none` at rest is an author declaration adopting
	// Obsidian's OWN suppression, not a UA default (Chromium declares none for `a`); the
	// UA's real anchor-focus rule only ever exists at `:focus-visible`, and only a
	// dedicated state rule can restate it. `:focus-visible` sits OUTSIDE `:where()` for
	// the same reason the GROUP 6/7 companions below do — `:where()` contributes zero
	// specificity, and this state needs the third class to beat Obsidian's own
	// `a { outline: none }` (0,0,1).
	test('a :focus-visible restates the UA focus ring Obsidian only ever suppresses at rest', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(a\\):focus-visible \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('outline: auto 1px -webkit-focus-ring-color;');
	});
});

describe('SC-202 r4 — GROUP 6/7: .internal-link / .external-link companions', () => {
	test('.internal-link restates the same three properties as GROUP 5, purely to close the numeric-specificity tie', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(a\\)\\.internal-link \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		for (const decl of ['font-weight: inherit;', 'text-decoration-line: underline;', 'cursor: pointer;']) {
			expect(m![1]).toContain(decl);
		}
	});
	test('.external-link restates only the icon material GROUP 5 does not touch', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(a\\)\\.external-link \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		for (const decl of [
			'background-image: none;',
			'background-position: 0 0;',
			'background-repeat: repeat;',
			'background-size: auto auto;',
			'padding-inline-end: 0;',
			'filter: none;',
		]) {
			expect(m![1]).toContain(decl);
		}
	});
});

describe('SC-317 — GROUP 7 companion: the plugin\'s own external-link icon (fix round 1, MED-1 second pass — inline WORD-JOINER ::after)', () => {
	const glyph = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(a\\)\\.external-link::after \\{([^}]*)\\}'));
	const rtl = flat.match(
		new RegExp('@supports selector\\(:dir\\(rtl\\)\\) \\{ ' + escape(ANCHOR) + ' :where\\(a\\)\\.external-link:dir\\(rtl\\)::after \\{([^}]*)\\}'),
	);

	test('the glyph rule exists, and there is no unscoped duplicate anywhere that could leak into print', () => {
		// FIX ROUND 1 (INFO-3), CORRECTED IN FIX ROUND 2 (N2's own re-review, N3) — the r1
		// version of this test additionally asserted `glyph![0]` (the match's own full text)
		// `.toContain(':not([data-dse-print="on"]'))`, which the re-review correctly flagged
		// as REDUNDANT: the regex that produced `glyph` already REQUIRES that literal text to
		// appear (it is baked into `ANCHOR`, which the pattern is built from), so a non-null
		// match already logically implies it — the assertion could never fail on its own.
		// Replaced with a genuinely INDEPENDENT check instead of dropping the coverage: this
		// searches the WHOLE raw sheet (not the bounded/flat slice the rest of this file
		// works from) for every occurrence of the bare selector fragment. If a second,
		// unscoped copy of this rule existed anywhere else in the file — the actual shape a
		// real print leak would take — it would show up here as more than one match, which
		// the ANCHOR-scoped regex alone could never detect (it only ever looks inside its
		// own bounded slice).
		expect(glyph).not.toBeNull();
		const wholeSheetFlat = rawCss.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
		const occurrences = wholeSheetFlat.match(/:where\(a\)\.external-link::after \{/g) ?? [];
		expect(occurrences).toHaveLength(1);
	});

	test('it draws via mask-image + currentColor, never filter (D2)', () => {
		expect(glyph![1]).toContain('background-color: currentColor;');
		expect(glyph![1]).toMatch(/(?:^|\s)mask-image: url\(/);
		expect(glyph![1]).toMatch(/-webkit-mask-image: url\(/);
		expect(glyph![1]).not.toMatch(/[^-]filter:/);
	});

	test('it opts out of the ancestor\'s underline and is marked unselectable', () => {
		// Unlike an atomic (inline-block/absolute) box, a plain `display: inline` pseudo IS a
		// candidate surface for the ancestor anchor's own `text-decoration-line` paint, so
		// this rule must say so explicitly — the D3 comment's own point.
		expect(glyph![1]).toContain('text-decoration: none;');
		expect(glyph![1]).toContain('user-select: none;');
		expect(glyph![1]).toContain('-webkit-user-select: none;');
	});

	// FIX ROUND 1 (MED-1, SECOND PASS) — orphan + containing-block regression guard. Two
	// prior shapes each broke a different way and must never come back:
	//   - r1 (`display: inline-block`, `content: ''`): an ATOMIC inline box glued after the
	//     text still gave the browser a genuine soft-wrap opportunity before it — orphaned
	//     in 16-46 of 401 widths (independent review, round 1).
	//   - the fix round's FIRST pass ("v4": anchor `padding-inline-end` + an absolutely
	//     positioned `::before`) fixed that, but an absolutely positioned pseudo whose
	//     containing block is a MULTI-LINE `position: relative` inline uses the union of all
	//     that inline's line fragments — verified BROKEN on this plugin's own real
	//     `perk/links` fixture (two links sharing one wrapping paragraph): the glyph landed
	//     on top of unrelated text in a later line, not attached to its own anchor's last
	//     fragment at all (see the CSS comment for the full reproduction).
	// The shipped shape avoids both failure modes by staying a NORMAL, non-atomic, in-flow
	// inline pseudo (`display: inline`, never `inline-block`; no `position: absolute`), with
	// a non-empty zero-width `content` (the WORD JOINER) rather than r1's empty string, and
	// its own padding (not the anchor's, and not a `margin` on the pseudo) as the reserved
	// gutter.
	test('orphan + containing-block regression guard: inline, in-flow, WORD-JOINER content, own padding gutter', () => {
		expect(glyph![1]).toContain("content: '\\2060';");
		expect(glyph![1]).toContain('display: inline;');
		expect(glyph![1]).not.toContain('display: inline-block;');
		// `position:` alone would false-positive on `mask-position`/`-webkit-mask-position`,
		// both legitimately present — anchor the check to the specific declaration.
		expect(glyph![1]).not.toMatch(/(?:^|\s)position:/);
		expect(glyph![1]).toContain('padding-inline-end: 0.8em;');
		expect(glyph![1]).not.toContain('inset-inline-end:');
	});

	test('the glyph sizes to D3\'s 0.75-0.85em target', () => {
		const size = /mask-size: ([\d.]+)em [\d.]+em;/.exec(glyph![1]);
		expect(size).not.toBeNull();
		const em = Number(size![1]);
		expect(em).toBeGreaterThanOrEqual(0.75);
		expect(em).toBeLessThanOrEqual(0.85);
	});

	// INFO-1 (round-1 review) — RTL mirror. `transform` has no effect on a non-atomic
	// `display: inline` box (CSS Transforms only applies to block-level/atomic-inline
	// "transformable" elements) — which is exactly why D3's fix chose `display: inline` in
	// the first place — so the mirror swaps the whole mask-image for Obsidian's own
	// second, pre-mirrored SVG instead of transforming the shared one.
	test('the glyph is mirrored under :dir(rtl) via a swapped mask-image, guarded by @supports selector(:dir(rtl))', () => {
		expect(rtl).not.toBeNull();
		expect(rtl![1]).toMatch(/(?:^|\s)mask-image: url\(/);
		expect(rtl![1]).toMatch(/-webkit-mask-image: url\(/);
		expect(rtl![1]).not.toContain('transform:');
	});
});

describe('SC-202 r4 — specificity guard: the .internal-link tie risk (round-2 MED-1\'s own method)', () => {
	/**
	 * A minimal CSS specificity calculator (a,b,c) — copied verbatim from
	 * `tableHostRegrounding.test.ts`'s own GROUP 4 guard (the brief's own instruction: "a
	 * specificity guard for any companion rules as tableHostRegrounding.test.ts does").
	 * `:where()` contributes nothing; `:is()`/`:not()`/`:has()` contribute the MAX
	 * specificity of their comma-separated arguments (recursively) — the real CSS
	 * Selectors Level 4 rule. jsdom cascades no var() and lays out nothing, so this is a
	 * text-level derivation, not a rendered one — assertable everywhere, including where
	 * the sweep self-skips (no local asar).
	 */
	function specificity(selector: string): [number, number, number] {
		let a = 0;
		let b = 0;
		let c = 0;
		let i = 0;
		const s = selector.trim();
		while (i < s.length) {
			const ch = s[i];
			if (ch === ' ' || ch === '>' || ch === '+' || ch === '~') {
				i += 1;
				continue;
			}
			if (ch === '#') {
				const m = /^#[-\w]+/.exec(s.slice(i));
				a += 1;
				i += m ? m[0].length : 1;
				continue;
			}
			if (ch === '.') {
				const m = /^\.[-\w]+/.exec(s.slice(i));
				b += 1;
				i += m ? m[0].length : 1;
				continue;
			}
			if (ch === '[') {
				const end = s.indexOf(']', i);
				b += 1;
				i = end === -1 ? s.length : end + 1;
				continue;
			}
			if (ch === ':') {
				if (s[i + 1] === ':') {
					const m = /^::[-\w]+/.exec(s.slice(i));
					c += 1;
					i += m ? m[0].length : 2;
					continue;
				}
				const m = /^:([-\w]+)/.exec(s.slice(i));
				const name = m ? m[1] : '';
				i += m ? m[0].length : 1;
				if (s[i] === '(') {
					let depth = 1;
					let j = i + 1;
					while (depth > 0 && j < s.length) {
						if (s[j] === '(') depth += 1;
						else if (s[j] === ')') depth -= 1;
						j += 1;
					}
					const inner = s.slice(i + 1, j - 1);
					i = j;
					if (name === 'where') continue;
					if (name === 'is' || name === 'not' || name === 'has') {
						const args = splitTopLevelCommas(inner);
						let best: [number, number, number] = [0, 0, 0];
						for (const arg of args) {
							const sp = specificity(arg);
							if (cmp(sp, best) > 0) best = sp;
						}
						a += best[0];
						b += best[1];
						c += best[2];
						continue;
					}
					b += 1;
					continue;
				}
				b += 1;
				continue;
			}
			const m = /^[-\w]+/.exec(s.slice(i));
			if (m) {
				c += 1;
				i += m[0].length;
				continue;
			}
			i += 1;
		}
		return [a, b, c];
	}

	function splitTopLevelCommas(s: string): string[] {
		const out: string[] = [];
		let depth = 0;
		let start = 0;
		for (let i = 0; i < s.length; i += 1) {
			if (s[i] === '(') depth += 1;
			else if (s[i] === ')') depth -= 1;
			else if (s[i] === ',' && depth === 0) {
				out.push(s.slice(start, i));
				start = i + 1;
			}
		}
		out.push(s.slice(start));
		return out;
	}

	function cmp(x: [number, number, number], y: [number, number, number]): number {
		for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
		return 0;
	}

	test('the calculator reproduces this round\'s own derived specificities', () => {
		expect(specificity(ANCHOR)).toEqual([0, 2, 0]);
		expect(specificity('.markdown-rendered .internal-link')).toEqual([0, 2, 0]);
		expect(specificity(`${ANCHOR} :where(a).internal-link`)).toEqual([0, 3, 0]);
		expect(specificity('.external-link')).toEqual([0, 1, 0]);
		expect(specificity(`${ANCHOR} :where(a).external-link`)).toEqual([0, 3, 0]);
	});

	test('the .internal-link companion is numerically ABOVE Obsidian\'s own .markdown-rendered .internal-link — never a tie resolved by source order', () => {
		const ours = specificity(`${ANCHOR} :where(a).internal-link`);
		const theirs = specificity('.markdown-rendered .internal-link');
		expect(cmp(ours, theirs)).toBeGreaterThan(0);
	});

	test('the generic :where(a) rule alone (0,2,0) WOULD tie .internal-link\'s own rule (0,2,0) — proving the companion is load-bearing, not decorative', () => {
		const generic = specificity(`${ANCHOR} :where(a)`);
		const theirs = specificity('.markdown-rendered .internal-link');
		expect(cmp(generic, theirs)).toBe(0);
	});

	test('the .external-link companion is comfortably above Obsidian\'s own bare .external-link rule', () => {
		const ours = specificity(`${ANCHOR} :where(a).external-link`);
		const theirs = specificity('.external-link');
		expect(cmp(ours, theirs)).toBeGreaterThan(0);
	});

	test('none of this block is scoped to [data-dse-theme=\'steel\'] — that would protect only one theme', () => {
		expect(flat).not.toContain("[data-dse-theme='steel']");
	});
});

describe('SC-202 r4 — scope fence: checkboxes are a later round, not this one', () => {
	test('the block never touches li.task-list-item or input[type=checkbox]', () => {
		for (const forbidden of ['task-list-item', "input[type='checkbox']", 'input[type="checkbox"]']) {
			expect(flat).not.toContain(forbidden);
		}
	});
});

describe('SC-202 r4 — scope fence: no other leak family\'s SELECTORS creep in (comments are stripped before this check, so citing an earlier round\'s selector in prose is fine — only a real CSS rule matters)', () => {
	test('the block never writes a table/list/blockquote/input CSS rule', () => {
		for (const forbidden of [/:where\(ul/, /:where\(ol/, /:where\(li/, /:where\(blockquote/, /:where\(hr\)/, /:where\(table/, /thead/, /tbody/, /dse-stepper__input/]) {
			expect(flat).not.toMatch(forbidden);
		}
	});
});

function escape(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
