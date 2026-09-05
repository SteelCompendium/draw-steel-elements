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
 * fails if any sampled ul/ol/li/li::marker/blockquote property moves. That gate self-skips
 * when no local Obsidian asar is installed, so it cannot be trusted as the ONLY protection
 * for this block in every environment — these are source-text contracts for the same reason
 * the sibling `tableHostRegrounding.test.ts` (SC-202 r2) is: jsdom cascades no var(), computes
 * no calc(), and lays out nothing, so rule text is what is assertable here, and it runs
 * everywhere the sweep cannot.
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
});

describe('SC-202 r3 — GROUP 2: li (any ul > li / ol > li, classed or not)', () => {
	test('padding-top/-bottom, position and margin-inline-start are restated', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(ul > li, ol > li\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		for (const decl of ['padding-top: 0;', 'padding-bottom: 0;', 'position: static;', 'margin-inline-start: 0;']) {
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

describe("SC-202 r3 — GROUP 4: li > p:first-of-type / :last-of-type (the brief's own \"li > p\")", () => {
	test('the first paragraph in a list item restores its own top margin', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(li > p:first-of-type\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('margin-block-start: 1em;');
	});
	test('the last paragraph in a list item restores its own bottom margin', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(li > p:last-of-type\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('margin-block-end: 1em;');
	});
});

describe('SC-202 r3 — GROUP 5: blockquote', () => {
	test('every property Obsidian sets is restated, including the ones that measure 0 diff today', () => {
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
		// Obsidian's own rule never touches the block axis — verified safe, must stay absent.
		expect(m![1]).not.toContain('margin-top');
		expect(m![1]).not.toContain('margin-bottom');
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
