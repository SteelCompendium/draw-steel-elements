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
