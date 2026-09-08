import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * SC-202 r6b fix round (independent review HIGH-2) — the PROSE (bare <p>/<img>/
 * caret-color) host re-grounding block, added right after the r3 list/blockquote block
 * in styles-source.css.
 *
 * The BEHAVIOUR is gated by `assertProseHostLeak` in visual-harness/shoot.mjs, which
 * toggles the REAL, pinned Obsidian app.css over the gallery's bare <p>/<img> and every
 * plugin root's caret-color and fails if any sampled property moves (rest only, dark +
 * light). That gate self-skips when no resolved sheet is available, so it cannot be
 * trusted as the ONLY protection in every environment — this is a source-text contract
 * for the same reason every sibling `*HostRegrounding.test.ts` is: jsdom cascades no
 * var(), computes no calc(), and lays out nothing, so rule text is what is assertable
 * here, and it runs everywhere the sweep cannot.
 */

const rawCss = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'styles-source.css'), 'utf8');
const blockStart = rawCss.indexOf('SC-202 r6b fix round — PROSE (p/img/caret-color) HOST RE-GROUNDING');
const BANNER = '/* ' + '='.repeat(84) + ' */';
const nextBlockStart = rawCss.indexOf(BANNER, blockStart + BANNER.length);
const css = (nextBlockStart === -1 ? rawCss.slice(blockStart) : rawCss.slice(blockStart, nextBlockStart)).replace(
	/\/\*[\s\S]*?\*\//g,
	'',
);
/** Whitespace-insensitive: the block wraps long selectors/comments across lines. */
const flat = css.replace(/\s+/g, ' ');
const ANCHOR = ':is([data-dse-element], .dse-modal):not([data-dse-print="on"])';

function escape(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('the SC-202 r6b PROSE block is still in the sheet', () => {
	expect(blockStart).toBeGreaterThan(0);
});

describe('caret-color — restated at the plugin root', () => {
	test('the root rule sets caret-color: auto (matches the UA default, not Obsidian\'s inherited token)', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('caret-color: auto;');
	});
});

describe('bare <p> — margin restated to the UA default', () => {
	test(':where(p) restates 1em margin-block, not a bare zero (that is .dse-md-inline > p\'s own job)', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(p\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('margin-block-start: 1em;');
		expect(m![1]).toContain('margin-block-end: 1em;');
	});

	test('.dse-md-inline > p is [data-dse-element]-prefixed, at higher specificity than the new bare rule', () => {
		expect(rawCss).toContain('[data-dse-element] .dse-md-inline > p {');
		// The bare, unprefixed form must be gone — it would tie the new (0,2,0) rule's
		// class count and lose the specificity race this fix depends on.
		expect(rawCss).not.toMatch(/[^\]] \.dse-md-inline > p \{/);
	});
});

describe('<img> — box/paint restated to the UA default', () => {
	test(':where(img) restates max-width: none and image-rendering: auto', () => {
		const m = flat.match(new RegExp(escape(ANCHOR) + ' :where\\(img\\) \\{([^}]*)\\}'));
		expect(m).not.toBeNull();
		expect(m![1]).toContain('max-width: none;');
		expect(m![1]).toContain('image-rendering: auto;');
	});
});
