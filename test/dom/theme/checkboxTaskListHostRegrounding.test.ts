import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * SC-202 r5 — the checkbox + task-list host re-grounding block (foot of styles-source.css,
 * the LAST leak family, right after the SC-202 r4 heading/emphasis/link block).
 *
 * The BEHAVIOUR is gated by `assertCheckboxHostLeak` in visual-harness/shoot.mjs, which
 * injects the REAL, locally-extracted Obsidian app.css over the gallery's plugin-authored
 * checkboxes AND a synthetic `li.task-list-item`/`input.task-list-item-checkbox` node (no
 * gallery fixture can produce that shape — `marked`, the harness's markdown shim, does not
 * emit Obsidian's task-list classes/attributes) and fails if any sampled property moves.
 * That gate self-skips when no local Obsidian asar is installed, so it cannot be trusted as
 * the ONLY protection for this block in every environment — this is a source-text contract
 * for the same reason the sibling `headingEmphasisLinkHostRegrounding.test.ts` (SC-202 r4)
 * is: jsdom cascades no var(), computes no calc(), and lays out nothing, so rule text is
 * what is assertable here, and it runs everywhere the sweep cannot.
 *
 * Two things were WRONG in the FIRST draft and can-fail-PROVEN wrong (a real `npm run
 * shots` run, not review): (1) the task-list checkbox subject needed MORE specificity than
 * a flat `:where(input.task-list-item-checkbox)` gives; (2) the plugin-authored checkbox
 * leaked `position` and `:hover`'s `outline` at every state, live.
 *
 * FIX ROUND (independent review of `fe69d37`, `sc202-r5-review.md`) — ONE more thing was
 * wrong, and it was HIGH: GROUP 2's own subject fix (item 1 above) silently raised GROUP 2
 * to a HIGHER specificity than its own GROUP 3/4/5 state companions, which were never
 * updated to match — so GROUP 2's `outline: none` was outranking GROUP 4's focus-visible
 * ring, and a real vault's task-list checkbox had NO focus indicator at all (a verbatim
 * repeat of round 4's MED-1, invisible to the bare-vs-host sweep for the SAME reason LOW-4
 * predicts: the property is identically wrong on both sides). GROUP 3/4/5 now share GROUP
 * 2's own subject. The fix round also closed MED-1 (the same subject fix; `:checked:hover`
 * was tied, not beaten, before), MED-2 (`top`/`flex-shrink` never re-grounded), LOW-1 (a
 * stale contradictory comment), LOW-2 (a 6th checkbox surface — Obsidian's OWN
 * `Setting.addToggle()` toggle, now excluded from GROUP 6) and LOW-3 (a dead
 * `.dse-minion__check` declaration + a false "not styling" comment). This file pins the
 * fix-round shape.
 */

const rawCss = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'styles-source.css'), 'utf8');
const blockStart = rawCss.indexOf('SC-202 r5 — CHECKBOX + TASK-LIST HOST RE-GROUNDING');
/** Bounded at the NEXT round's own opening banner, same reasoning as every sibling
 *  round-block test — an unbounded slice breaks the moment a later round's block lands
 *  after it. This is currently the LAST leak family, so `nextBlockStart` is expected to be
 *  -1 (slice runs to EOF) until/unless a "turn the sheet on" round appends its own banner
 *  after this one — either way the fallback keeps this test correct. */
const BANNER = '/* ' + '='.repeat(84) + ' */';
const nextBlockStart = rawCss.indexOf(BANNER, blockStart + BANNER.length);
const css = (nextBlockStart === -1 ? rawCss.slice(blockStart) : rawCss.slice(blockStart, nextBlockStart)).replace(
	/\/\*[\s\S]*?\*\//g,
	'',
);
/** Whitespace-insensitive: the block wraps long selectors across lines. */
const flat = css.replace(/\s+/g, ' ');
const ANCHOR = ':is([data-dse-element], .dse-modal):not([data-dse-print="on"])';
/** GROUP 2's own subject (task-list checkbox), specificity (0,3,1) — see the
 *  specificity-guard describe block below for the derivation. FIX ROUND — GROUP 3/4/5 now
 *  share this SAME subject (previously a flat, lower-specificity `:where(input.task-list-
 *  item-checkbox)`, the HIGH-1/MED-1 bug). */
const TL_SUBJECT = `${ANCHOR} :where(li.task-list-item) input.task-list-item-checkbox`;
const SC121_ANCHOR = "[data-dse-theme='steel']:not([data-dse-print=\"on\"]) input[type='checkbox']:not(.task-list-item-checkbox)";
/** FIX ROUND (LOW-2) — GROUP 6's own subject, excluding Obsidian's OWN `.checkbox-
 *  container input` (the `Setting.addToggle()` toggle widget) from every rule in the
 *  group. */
const GROUP6_SUBJECT = `${SC121_ANCHOR}:not(.checkbox-container input)`;

test('the SC-202 r5 block is still in the sheet', () => {
	expect(blockStart).toBeGreaterThan(0);
});

describe('SC-202 r5 — GROUP 1: the task-list <li> itself', () => {
	test('list-style: none is restated as OUR OWN default (deliberate agreement with Obsidian, not a fight)', () => {
		const m = flat.match(new RegExp(escape(`${ANCHOR} :where(li.task-list-item)`) + ' \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('list-style: none;');
	});

	test('the data-task="x"/"X" decoration is neutralised (no strikethrough, inherited colour)', () => {
		const m = flat.match(
			new RegExp(escape(`${ANCHOR} :where(li.task-list-item):is([data-task='x'], [data-task='X'])`) + ' \\{([^}]*)\\}'),
		);
		expect(m).not.toBeNull();
		expect(m![1]).toContain('text-decoration: none;');
		expect(m![1]).toContain('color: inherit;');
	});
});

describe('SC-202 r5 — GROUP 2: the task-list checkbox control, rest state', () => {
	function group2(): string {
		const m = flat.match(new RegExp(escape(TL_SUBJECT) + ' \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		return m![1];
	}

	test('hands rendering back to the native browser widget', () => {
		expect(group2()).toContain('appearance: auto;');
		expect(group2()).toContain('-webkit-appearance: auto;');
	});

	test('the border is neutralised (no material of its own)', () => {
		expect(group2()).toContain('border: 0 none;');
		expect(group2()).toContain('border-color: currentcolor;');
		expect(group2()).toContain('border-radius: 0;');
	});

	test('size/position/margin restate the browser UA default, not a design figure', () => {
		expect(group2()).toContain('width: 13px;');
		expect(group2()).toContain('height: 13px;');
		expect(group2()).toContain('position: static;');
		expect(group2()).toContain('margin: 3px 3px 3px 4px;');
	});

	test('FIX ROUND (MED-2) — top/flex-shrink are re-grounded too, not just position', () => {
		expect(group2()).toContain('top: auto;');
		expect(group2()).toContain('flex-shrink: 1;');
	});

	test('transition is killed outright — the block comment names the footgun this avoids', () => {
		expect(group2()).toContain('transition: none;');
	});

	test('cursor/outline/box-shadow are restated even though 0-diff at REST (round-2 MED-1 discipline)', () => {
		expect(group2()).toContain('cursor: default;');
		expect(group2()).toContain('outline: none;');
		expect(group2()).toContain('box-shadow: none;');
	});
});

describe('SC-202 r5 — GROUP 3/4: :hover and :focus-visible (FIX ROUND — now GROUP 2\'s own subject, not a flat one)', () => {
	test(':hover restates border-color back to REST (a deliberate "hover changes nothing" decision)', () => {
		const m = flat.match(new RegExp(escape(`${TL_SUBJECT}:hover`) + ' \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('border-color: currentcolor;');
	});

	test(':focus-visible restores the native browser focus ring and kills the host box-shadow ring — the HIGH-1 fix', () => {
		const m = flat.match(new RegExp(escape(`${TL_SUBJECT}:focus-visible`) + ' \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('outline: auto 1px -webkit-focus-ring-color;');
		expect(m![1]).toContain('box-shadow: none;');
	});

	test('the OLD, under-specific flat subject is gone — a regression guard for HIGH-1 itself', () => {
		expect(flat).not.toMatch(/:where\(input\.task-list-item-checkbox\):hover/);
		expect(flat).not.toMatch(/:where\(input\.task-list-item-checkbox\):focus-visible/);
		expect(flat).not.toMatch(/:where\(input\.task-list-item-checkbox\):checked(?!\))/);
	});
});

describe('SC-202 r5 — GROUP 5/5b: :checked and the ::after tick/dash (FIX ROUND — GROUP 5 also shares GROUP 2\'s subject, closing MED-1)', () => {
	test(':checked restates background/border-color back to REST — no accent fill leaks in', () => {
		const m = flat.match(new RegExp(escape(`${TL_SUBJECT}:checked`) + ' \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('background-color: transparent;');
		expect(m![1]).toContain('border-color: currentcolor;');
	});

	test('the ::after tick/indeterminate-dash pseudo-element is removed entirely, covering BOTH :checked and [data-indeterminate] with one shared companion', () => {
		expect(flat).toContain(`${TL_SUBJECT}:is(:checked, [data-indeterminate='true'])::after { content: none; }`);
	});
});

describe("SC-202 r5 — GROUP 6: the plugin-authored checkbox's own missing properties/states", () => {
	test('position is re-grounded to static — SC-121 never declares it at all', () => {
		const m = flat.match(new RegExp(escape(GROUP6_SUBJECT) + ' \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('position: static;');
	});

	test(":hover's outline is neutralised — SC-121 covers border-color there but never outline", () => {
		const m = flat.match(new RegExp(escape(`${GROUP6_SUBJECT}:hover`) + ' \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('outline: none;');
	});

	test('SC-121\'s own selector (base) is untouched — this round only ADDS companions, never edits it', () => {
		// The pre-existing "Themed checkbox" block (SC-121 Batch 1) stays out of this
		// round's own block entirely (it lives far earlier in the file) — this guard
		// checks the round-5 block itself never re-declares the base rule's own REST
		// properties (appearance/border/background), which would be a sign this round
		// edited SC-121 instead of adding beside it.
		expect(flat).not.toMatch(/:not\(\.task-list-item-checkbox\)\s*\{\s*appearance/);
	});

	test(':focus-visible box-shadow is neutralised for every plugin-authored checkbox', () => {
		const m = flat.match(new RegExp(escape(`${GROUP6_SUBJECT}:focus-visible`) + ' \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('box-shadow: none;');
	});

	test('the ::after tick/indeterminate-dash pseudo-element is removed for every plugin-authored checkbox too', () => {
		expect(flat).toContain(`${GROUP6_SUBJECT}:is(:checked, [data-indeterminate='true'])::after { content: none; }`);
	});

	test('FIX ROUND (LOW-2) — every GROUP 6 rule excludes .checkbox-container input, so Obsidian\'s OWN Setting.addToggle() widget keeps its own layout', () => {
		// The four GROUP 6 subjects (position, :hover, :focus-visible, ::after) must ALL
		// carry the exclusion — a regression here would silently re-reach the toggle.
		const group6Rules = [...flat.matchAll(new RegExp(escape(SC121_ANCHOR) + '([^{]*)\\{', 'g'))].map((m) => m[1].trim());
		expect(group6Rules.length).toBeGreaterThanOrEqual(4);
		for (const sel of group6Rules) {
			expect(sel).toContain(':not(.checkbox-container input)');
		}
	});
});

describe('SC-202 r5 — FIX ROUND LOW-1: the GROUP 6 comment no longer contradicts GROUP 5b', () => {
	test('the stale "UNSAFE for the task-list subject" claim is gone', () => {
		expect(flat).not.toContain('UNSAFE for the task-list subject');
	});
});

describe('SC-202 r5 — FIX ROUND LOW-3: .dse-minion__check no longer declares a dead margin-right, outside this block\'s own slice', () => {
	test('the dead declaration is gone from the whole file (comments stripped — the removal note itself quotes the old rule verbatim)', () => {
		const rawNoComments = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');
		expect(rawNoComments).not.toMatch(/\.dse-minion__check\s*\{\s*margin-right:\s*10px;\s*\}/);
	});

	test('the class itself is untouched on the element (JS query selection survives)', () => {
		const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src', 'views', 'MinionStaminaPoolModal.ts'), 'utf8');
		expect(src).toContain('dse-minion__check');
	});
});

describe('SC-202 r5 — specificity guard (round-4\'s own method, reused verbatim)', () => {
	/** Copied verbatim from `headingEmphasisLinkHostRegrounding.test.ts`'s own GROUP —
	 *  the brief's own instruction: "a specificity guard for any companion rules as
	 *  tableHostRegrounding.test.ts does". Handles `:not()`/`:is()` with a COMPLEX
	 *  (multi-compound, descendant-combinator) argument the same way real browsers do —
	 *  each compound in the argument contributes its own specificity, summed — needed for
	 *  GROUP 6's own `:not(.checkbox-container input)` (FIX ROUND, LOW-2). */
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

	test('GROUP 1\'s data-task companion (0,3,0) beats Obsidian\'s own ul > li.task-list-item[data-task="x"] (0,2,2)', () => {
		const ours = specificity(`${ANCHOR} :where(li.task-list-item):is([data-task='x'], [data-task='X'])`);
		const theirs = specificity('ul > li.task-list-item[data-task="x"]');
		expect(theirs).toEqual([0, 2, 2]);
		expect(ours).toEqual([0, 3, 0]);
		expect(cmp(ours, theirs)).toBeGreaterThan(0);
	});

	test("GROUP 2's subject (0,3,1) beats Obsidian's own task-list-scoped margin rule (0,2,2) — the flat (0,2,0) anchor a first draft used did NOT (can-fail-proven, not merely argued)", () => {
		const ours = specificity(TL_SUBJECT);
		const theirsMargin = specificity('ul > li.task-list-item > .task-list-item-checkbox');
		const flatAnchorAlone = specificity(`${ANCHOR} :where(input.task-list-item-checkbox)`);
		expect(theirsMargin).toEqual([0, 2, 2]);
		expect(ours).toEqual([0, 3, 1]);
		expect(cmp(ours, theirsMargin)).toBeGreaterThan(0);
		expect(cmp(flatAnchorAlone, theirsMargin)).toBeLessThan(0);
	});

	test("FIX ROUND (HIGH-1) — EVERY GROUP 3/4/5 state companion strictly outranks GROUP 2's OWN subject (0,3,1), not just Obsidian's rules — the exact comparison the original draft never made, and the reason GROUP 2's outline:none was winning at :focus-visible", () => {
		const group2 = specificity(TL_SUBJECT);
		expect(group2).toEqual([0, 3, 1]);
		for (const pseudo of [':hover', ':focus-visible', ':checked']) {
			const companion = specificity(`${TL_SUBJECT}${pseudo}`);
			expect(cmp(companion, group2)).toBeGreaterThan(0);
		}
	});

	test('GROUP 3\'s :hover companion (0,4,1) beats Obsidian\'s own (0,2,1)', () => {
		const ours = specificity(`${TL_SUBJECT}:hover`);
		expect(ours).toEqual([0, 4, 1]);
		expect(cmp(ours, [0, 2, 1])).toBeGreaterThan(0);
	});

	test('GROUP 4\'s :focus-visible companion (0,4,1) beats BOTH Obsidian rules it must outrank (0,2,1 each)', () => {
		const ours = specificity(`${TL_SUBJECT}:focus-visible`);
		expect(ours).toEqual([0, 4, 1]);
		expect(cmp(ours, [0, 2, 1])).toBeGreaterThan(0);
	});

	test("GROUP 5's :checked companion (0,4,1) beats Obsidian's own :checked (0,2,1) AND the combined :checked:hover rule (0,3,1) — closing MED-1, which the old (0,3,0) subject only TIED (held by document order alone)", () => {
		const ours = specificity(`${TL_SUBJECT}:checked`);
		const theirsCheckedHover = specificity('input[type=checkbox]:checked:hover');
		expect(theirsCheckedHover).toEqual([0, 3, 1]);
		expect(ours).toEqual([0, 4, 1]);
		expect(cmp(ours, [0, 2, 1])).toBeGreaterThan(0);
		expect(cmp(ours, theirsCheckedHover)).toBeGreaterThan(0);
	});

	// NOTE on "theirs" below: Obsidian's real CSS uses the LEGACY single-colon `:after`,
	// which — per this calculator's own `:name(` branch (only a DOUBLE colon takes the
	// pseudo-ELEMENT path that adds to the "c" column, copied verbatim from
	// `headingEmphasisLinkHostRegrounding.test.ts`) — is counted as an ordinary pseudo-
	// CLASS (the "b" column), not a pseudo-element. That is NOT how a real browser scores
	// it (Chromium correctly treats `:after` as `::after`'s alias, "c" column) — the
	// can-fail sweep is what proves the real cascade order in a real browser
	// (`assertCheckboxHostLeak`); this calculator is a same-convention TEXT contract, and
	// its own numbers for legacy single-colon selectors read one column lower than the real
	// browser's. Our OWN companion uses genuine `::after` (double colon), which DOES take
	// this calculator's pseudo-element path.
	test("GROUP 5b's shared ::after companion (0,4,2) beats BOTH Obsidian rules it must outrank — the corrected (0,3,1) subject (GROUP 2's own margin fix) is what makes ONE companion enough; a first draft's flat (0,2,0)-anchor subject gave the equivalent companion only (0,3,1), which genuinely lost to the indeterminate rule", () => {
		const ours = specificity(`${TL_SUBJECT}:is(:checked, [data-indeterminate='true'])::after`);
		const theirsChecked = specificity('input[type=checkbox]:checked:after');
		const theirsIndeterminate = specificity('input[type=checkbox][data-indeterminate="true"]:not(:checked):after');
		const flatAnchorEquivalent = specificity(`${ANCHOR} :where(input.task-list-item-checkbox):is(:checked, [data-indeterminate='true'])::after`);
		expect(theirsChecked).toEqual([0, 3, 1]);
		expect(theirsIndeterminate).toEqual([0, 4, 1]);
		expect(ours).toEqual([0, 4, 2]);
		expect(cmp(ours, theirsChecked)).toBeGreaterThan(0);
		expect(cmp(ours, theirsIndeterminate)).toBeGreaterThan(0);
		expect(flatAnchorEquivalent).toEqual([0, 3, 1]);
		expect(cmp(flatAnchorEquivalent, theirsIndeterminate)).toBeLessThan(0);
	});

	test("SC-121's own base selector (0,4,1) already beats every bare Obsidian checkbox rule this family enumerates for the properties it declares", () => {
		const base = specificity(SC121_ANCHOR);
		expect(base).toEqual([0, 4, 1]);
		expect(cmp(base, [0, 2, 1])).toBeGreaterThan(0);
	});

	test("FIX ROUND (LOW-2) — GROUP 6's own subject (0,5,2), WITH the .checkbox-container exclusion, still beats every Obsidian rule it must outrank", () => {
		const base = specificity(GROUP6_SUBJECT);
		expect(base).toEqual([0, 5, 2]);
		expect(cmp(base, [0, 2, 1])).toBeGreaterThan(0);
	});

	test("GROUP 6's position/hover-outline companions beat the bare (0,1,1) and hover (0,2,1) Obsidian rules they re-ground", () => {
		const position = specificity(GROUP6_SUBJECT);
		const hoverOutline = specificity(`${GROUP6_SUBJECT}:hover`);
		expect(cmp(position, [0, 1, 1])).toBeGreaterThan(0);
		expect(cmp(hoverOutline, [0, 2, 1])).toBeGreaterThan(0);
	});

	test("GROUP 6's ::after companion beats BOTH Obsidian rules it must outrank ((0,2,2) tick, (0,3,2) indeterminate) — safe as ONE shared :is() here because SC-121's own anchor starts well clear of Obsidian's highest competing rule", () => {
		const ours = specificity(`${GROUP6_SUBJECT}:is(:checked, [data-indeterminate='true'])::after`);
		expect(cmp(ours, [0, 2, 2])).toBeGreaterThan(0);
		expect(cmp(ours, [0, 3, 2])).toBeGreaterThan(0);
	});
});

describe('SC-202 r5 — scope fence: only the checkbox/task-list family', () => {
	test('the block never writes a table/list/blockquote/heading/link/input CSS rule of its own', () => {
		for (const forbidden of [
			/:where\(ul(?!\.)/,
			/:where\(ol(?!\.)/,
			/:where\(blockquote/,
			/:where\(hr\)/,
			/:where\(table/,
			/:where\(h[1-6]/,
			/:where\(strong/,
			/:where\(em/,
			/:where\(a\)/,
			/thead/,
			/tbody/,
			/dse-stepper__input/,
		]) {
			expect(flat).not.toMatch(forbidden);
		}
	});

	test('the fetch/pin recipe and turning the host sheet on stay untouched — no obsidian-host-pin.mjs rewrite, no host-copy pin change in this block', () => {
		expect(flat).not.toContain('OBSIDIAN_HOST_BUTTON_CSS');
	});
});

function escape(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
