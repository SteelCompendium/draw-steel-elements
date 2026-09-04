import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * SC-202 r2 — the markdown table host re-grounding block (foot of styles-source.css,
 * right after the SC-202 r1 input block it mirrors).
 *
 * The BEHAVIOUR is gated by `assertTableHostLeak` in visual-harness/shoot.mjs, which
 * injects the REAL, locally-extracted Obsidian app.css over the gallery's tables (under a
 * dynamically-added `.markdown-preview-view.markdown-rendered` ancestor — the one thing
 * this family needs that the input sweep did not) and fails if any sampled table/row/cell
 * property moves. That gate self-skips when no local Obsidian asar is installed, so it
 * cannot be trusted as the ONLY protection for this block in every environment — these are
 * source-text contracts for the same reason the sibling `inputHostRegrounding.test.ts`
 * (SC-202 r1) is: jsdom cascades no var(), computes no calc(), and lays out nothing, so
 * rule text is what is assertable here, and it runs everywhere the sweep cannot.
 */

const rawCss = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'styles-source.css'), 'utf8');
const blockStart = rawCss.indexOf('SC-202 r2 — MARKDOWN TABLE HOST RE-GROUNDING');
const css = rawCss.slice(blockStart).replace(/\/\*[\s\S]*?\*\//g, '');
/** Whitespace-insensitive: the block wraps long selectors across lines. */
const flat = css.replace(/\s+/g, ' ');
const ANCHOR = ':is([data-dse-element], .dse-modal):not([data-dse-print="on"])';

test('the SC-202 r2 block is still in the sheet', () => {
	expect(blockStart).toBeGreaterThan(0);
});

test('the block declares nothing for `caption` — Obsidian ships no caption rule at all', () => {
	// Verified against the extracted sheet (visual-harness/dist/obsidian-app.css): 0
	// `caption` occurrences. The brief's "and caption if Obsidian styles it" is answered.
	expect(flat).not.toMatch(/\bcaption\b/);
});

describe('SC-202 r2 — GROUP 1: min-width/white-space/text-overflow/overflow, both families', () => {
	test('the shared rule names both `.dse-enc__table` and classless `table:not([class])` cells', () => {
		// Non-greedy `[\s\S]*?` up to the literal `) {` — the selector list itself contains
		// nested parens (`:is(th, td)`), so a `[^)]*` capture (the shape the sibling r1 test
		// uses) would stop at the FIRST `)` inside `:is(...)`, not the outer `:where(...)`'s.
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(([\\s\\S]*?)\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('.dse-enc__table :is(th, td)');
		expect(m![1]).toContain('table:not([class]) :is(th, td)');
		for (const decl of ['min-width: 0;', 'white-space: normal;', 'text-overflow: clip;', 'overflow: visible;']) {
			expect(m![2]).toContain(decl);
		}
	});
});

describe("SC-202 r2 — GROUP 2: `.dse-enc__table`'s own box", () => {
	test('table-level margin and line-height are restated', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(\\.dse-enc__table\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('margin: 0;');
		expect(m![1]).toContain('line-height: 1.5;');
	});

	test('cells get border-top/left/right: none, vertical-align: middle, and font-size: var(--dse-fs-body)', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(\\.dse-enc__table :is\\(th, td\\)\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		for (const decl of [
			'border-top: none;',
			'border-left: none;',
			'border-right: none;',
			'vertical-align: middle;',
			'font-size: var(--dse-fs-body);',
		]) {
			expect(m![1]).toContain(decl);
		}
		// The bottom hairline (~:3499) must stay untouched — this block only adds the three
		// sides Obsidian was winning on, never restates border-bottom.
		expect(m![1]).not.toContain('border-bottom');
	});

	test("`.dse-enc__table th` restates line-height directly (Obsidian sets it on `th`, not just the table)", () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(\\.dse-enc__table th\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('line-height: 1.5;');
	});
});

describe('SC-202 r2 — GROUP 3: the classless markdown table', () => {
	test('font-size is restated on both th and td (closes the downstream padding/line-height chain)', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(table:not\\(\\[class\\]\\) :is\\(th, td\\)\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('font-size: var(--dse-fs-body);');
	});

	test('`thead th` restates font-weight and its own line-height', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(table:not\\(\\[class\\]\\) thead th\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('font-weight: bold;');
		expect(m![1]).toContain('line-height: 1.5;');
	});
});

describe('SC-202 r2 fix round — GROUP 4: specificity-equal-or-greater structural companions (MED-1b)', () => {
	/**
	 * A minimal CSS specificity calculator (a,b,c) — ids / classes+attributes+pseudo-classes
	 * / elements+pseudo-elements — good enough for the selector shapes this file and
	 * Obsidian's `app.css` actually use here (no ids anywhere in either sheet's table
	 * rules). `:where()` contributes nothing; `:is()`/`:not()`/`:has()` contribute the
	 * MAX specificity of their comma-separated arguments (recursively) — exactly the CSS
	 * Selectors Level 4 rule. jsdom cascades no var() and lays out nothing, so this is a
	 * text-level derivation, not a rendered one — which is the point: it is assertable
	 * everywhere, including where the `assertTableHostLeak` sweep self-skips (no local
	 * asar).
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
					// :nth-child(...)/:nth-of-type(...)/etc. — one pseudo-class regardless of arg.
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

	// Sanity-check the calculator itself against the review's own derived numbers before
	// trusting it to gate anything (review of `eb54b8d`, MED-1 table).
	test('the calculator reproduces the review\'s own derived specificities', () => {
		expect(specificity(ANCHOR)).toEqual([0, 2, 0]);
		expect(specificity('.markdown-rendered tbody tr > td:first-child')).toEqual([0, 2, 3]);
		expect(specificity('.markdown-rendered tbody tr:nth-child(odd)')).toEqual([0, 2, 2]);
		expect(specificity('.markdown-rendered tbody tr:nth-child(odd):hover')).toEqual([0, 3, 2]);
		expect(specificity('.markdown-rendered thead tr')).toEqual([0, 1, 2]);
		expect(specificity('.markdown-rendered thead tr:hover')).toEqual([0, 2, 2]);
	});

	const FAMILY = ':where(.dse-enc__table, table:not([class]))';

	/** [companion suffix (verbatim, as written after the FAMILY clause), the worst-case real
	 *  Obsidian selector this companion must outrank, the property it restates]. */
	const COMPANIONS: Array<[string, string, string]> = [
		[
			':is(tbody tr > td:first-child, thead tr > th:first-child)',
			'.markdown-rendered tbody tr > td:first-child',
			'border-left-width: 0;',
		],
		[
			':is(tbody tr > td:last-child, thead tr > th:last-child)',
			'.markdown-rendered tbody tr > td:last-child',
			'border-right-width: 0;',
		],
		['tbody tr:last-child > td', '.markdown-rendered tbody tr:last-child > td', 'border-bottom-width: 1px;'],
		[
			':is(tbody tr > td:nth-child(2n+2), thead tr > th:nth-child(2n+2))',
			'.markdown-rendered tbody tr > td:nth-child(2n+2)',
			'background-color: transparent;',
		],
		[':is(tbody, thead) tr', '.markdown-rendered thead tr', 'background-color: transparent;'],
		[':is(tbody, thead) tr:hover', '.markdown-rendered tbody tr:hover', 'background-color: transparent;'],
		['tbody tr:nth-child(odd)', '.markdown-rendered tbody tr:nth-child(odd)', 'background-color: transparent;'],
		[
			'tbody tr:nth-child(odd):hover',
			'.markdown-rendered tbody tr:nth-child(odd):hover',
			'background-color: transparent;',
		],
	];

	test.each(COMPANIONS)('companion %s exists and restates %s at >= Obsidian\'s own specificity', (suffix, obsidianSelector, decl) => {
		const pattern = new RegExp(escape(`${ANCHOR} ${FAMILY} ${suffix}`) + ' \\{([^}]*)\\}');
		const m = flat.match(pattern);
		expect(m).not.toBeNull();
		expect(m![1]).toContain(decl);
		const ours = specificity(`${ANCHOR} ${FAMILY} ${suffix}`);
		const theirs = specificity(obsidianSelector);
		expect(cmp(ours, theirs)).toBeGreaterThanOrEqual(0);
	});

	test('none of GROUP 1-4 is scoped to [data-dse-theme=\'steel\'] — that would protect only one theme', () => {
		expect(flat).not.toContain("[data-dse-theme='steel']");
	});
});

describe('SC-202 r2 — scope fence: no other leak family creeps in', () => {
	test('the block never touches list/blockquote/heading/emphasis/link/checkbox selectors', () => {
		for (const forbidden of ['<li', ' li ', 'blockquote', /\bh[1-6]\b/, 'strong', "input[type='checkbox']", "input[type=\"checkbox\"]"]) {
			if (typeof forbidden === 'string') expect(flat).not.toContain(forbidden);
			else expect(flat).not.toMatch(forbidden);
		}
	});
});

function escape(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
