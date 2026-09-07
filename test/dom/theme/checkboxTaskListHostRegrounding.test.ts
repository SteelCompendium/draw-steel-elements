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
 * Two things were WRONG in a first draft and can-fail-PROVEN wrong (a real `npm run shots`
 * run, not review): (1) the task-list checkbox subject needed MORE specificity than a flat
 * `:where(input.task-list-item-checkbox)` gives — Obsidian's own task-list-scoped margin
 * rule is two type selectors deep — so GROUP 2/5b's subject is
 * `:where(li.task-list-item) input.task-list-item-checkbox` (the `input` OUTSIDE
 * `:where()`); (2) the plugin-authored checkbox leaked `position` (SC-121 never declares
 * it) and `:hover`'s `outline` (SC-121 never declares it either — only `border-color` was
 * covered) at every state, live, until GROUP 6 grew two more dedicated rules. This file
 * pins the CORRECTED shape.
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
/** GROUP 2/5b's own corrected subject (task-list checkbox), specificity (0,3,1) — see the
 *  specificity-guard describe block below for the derivation. */
const TL_SUBJECT = `${ANCHOR} :where(li.task-list-item) input.task-list-item-checkbox`;
const SC121_ANCHOR = "[data-dse-theme='steel']:not([data-dse-print=\"on\"]) input[type='checkbox']:not(.task-list-item-checkbox)";

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

	test('transition is killed outright — the block comment names the footgun this avoids', () => {
		expect(group2()).toContain('transition: none;');
	});

	test('cursor/outline/box-shadow are restated even though 0-diff at REST (round-2 MED-1 discipline)', () => {
		expect(group2()).toContain('cursor: default;');
		expect(group2()).toContain('outline: none;');
		expect(group2()).toContain('box-shadow: none;');
	});
});

describe('SC-202 r5 — GROUP 3/4: :hover and :focus-visible', () => {
	test(':hover restates border-color back to REST (a deliberate "hover changes nothing" decision)', () => {
		const m = flat.match(new RegExp(escape(`${ANCHOR} :where(input.task-list-item-checkbox):hover`) + ' \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('border-color: currentcolor;');
	});

	test(':focus-visible restores the native browser focus ring and kills the host box-shadow ring', () => {
		const m = flat.match(new RegExp(escape(`${ANCHOR} :where(input.task-list-item-checkbox):focus-visible`) + ' \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('outline: auto 1px -webkit-focus-ring-color;');
		expect(m![1]).toContain('box-shadow: none;');
	});
});

describe('SC-202 r5 — GROUP 5/5b: :checked and the ::after tick/dash', () => {
	test(':checked restates background/border-color back to REST — no accent fill leaks in', () => {
		const m = flat.match(new RegExp(escape(`${ANCHOR} :where(input.task-list-item-checkbox):checked`) + ' \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('background-color: transparent;');
		expect(m![1]).toContain('border-color: currentcolor;');
	});

	test('the ::after tick/indeterminate-dash pseudo-element is removed entirely, covering BOTH :checked and [data-indeterminate] with one shared companion', () => {
		expect(flat).toContain(
			`${TL_SUBJECT}:is(:checked, [data-indeterminate='true'])::after { content: none; }`,
		);
	});
});

describe("SC-202 r5 — GROUP 6: the plugin-authored checkbox's own missing properties/states", () => {
	test('position is re-grounded to static — SC-121 never declares it at all', () => {
		const m = flat.match(new RegExp(escape(SC121_ANCHOR) + ' \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('position: static;');
	});

	test(":hover's outline is neutralised — SC-121 covers border-color there but never outline", () => {
		const m = flat.match(new RegExp(escape(`${SC121_ANCHOR}:hover`) + ' \\{([^}]*)\\}'));
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
		const m = flat.match(new RegExp(escape(`${SC121_ANCHOR}:focus-visible`) + ' \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('box-shadow: none;');
	});

	test('the ::after tick/indeterminate-dash pseudo-element is removed for every plugin-authored checkbox too', () => {
		expect(flat).toContain(`${SC121_ANCHOR}:is(:checked, [data-indeterminate='true'])::after { content: none; }`);
	});
});

describe('SC-202 r5 — specificity guard (round-4\'s own method, reused verbatim)', () => {
	/** Copied verbatim from `headingEmphasisLinkHostRegrounding.test.ts`'s own GROUP —
	 *  the brief's own instruction: "a specificity guard for any companion rules as
	 *  tableHostRegrounding.test.ts does". */
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

	test("GROUP 2/5b's corrected subject (0,3,1) beats Obsidian's own task-list-scoped margin rule (0,2,2) — the flat (0,2,0) anchor a first draft used did NOT (can-fail-proven, not merely argued)", () => {
		const ours = specificity(TL_SUBJECT);
		const theirsMargin = specificity('ul > li.task-list-item > .task-list-item-checkbox');
		const flatAnchorAlone = specificity(`${ANCHOR} :where(input.task-list-item-checkbox)`);
		expect(theirsMargin).toEqual([0, 2, 2]);
		expect(ours).toEqual([0, 3, 1]);
		expect(cmp(ours, theirsMargin)).toBeGreaterThan(0);
		expect(cmp(flatAnchorAlone, theirsMargin)).toBeLessThan(0);
	});

	test('GROUP 3\'s :hover companion (0,3,0) beats Obsidian\'s own (0,2,1)', () => {
		const ours = specificity(`${ANCHOR} :where(input.task-list-item-checkbox):hover`);
		expect(ours).toEqual([0, 3, 0]);
		expect(cmp(ours, [0, 2, 1])).toBeGreaterThan(0);
	});

	test('GROUP 4\'s :focus-visible companion (0,3,0) beats BOTH Obsidian rules it must outrank (0,2,1 each)', () => {
		const ours = specificity(`${ANCHOR} :where(input.task-list-item-checkbox):focus-visible`);
		expect(ours).toEqual([0, 3, 0]);
		expect(cmp(ours, [0, 2, 1])).toBeGreaterThan(0);
	});

	test('GROUP 5\'s :checked companion (0,3,0) beats Obsidian\'s own (0,2,1)', () => {
		const ours = specificity(`${ANCHOR} :where(input.task-list-item-checkbox):checked`);
		expect(ours).toEqual([0, 3, 0]);
		expect(cmp(ours, [0, 2, 1])).toBeGreaterThan(0);
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

	test("GROUP 6's position/hover-outline companions (0,4,1)/(0,5,1) beat the bare (0,1,1) and hover (0,2,1) Obsidian rules they re-ground", () => {
		const position = specificity(SC121_ANCHOR);
		const hoverOutline = specificity(`${SC121_ANCHOR}:hover`);
		expect(position).toEqual([0, 4, 1]);
		expect(hoverOutline).toEqual([0, 5, 1]);
		expect(cmp(position, [0, 1, 1])).toBeGreaterThan(0);
		expect(cmp(hoverOutline, [0, 2, 1])).toBeGreaterThan(0);
	});

	test("GROUP 6's ::after companion (0,5,2) beats BOTH Obsidian rules it must outrank ((0,2,2) tick, (0,3,2) indeterminate) — safe as ONE shared :is() here because SC-121's own anchor starts five class-columns higher than the task-list one did", () => {
		const ours = specificity(`${SC121_ANCHOR}:is(:checked, [data-indeterminate='true'])::after`);
		expect(ours).toEqual([0, 5, 2]);
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
