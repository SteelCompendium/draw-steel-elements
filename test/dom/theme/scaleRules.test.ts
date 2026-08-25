import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * The SC-112 Task 7 size-scale CONSUMER contract (source-text, like its siblings
 * steelTypography.test.ts / steelMaterial.test.ts — jsdom cannot cascade var()
 * or compute calc(), so this suite pins the RULE TEXT of styles-source.css):
 *
 *  - the TEXT rule (`font-size: calc(1em * var(--dse-text-scale))`) exists on the
 *    element-root compound and is print-excluded;
 *  - the CARD rule (`zoom: var(--dse-card-scale)`) exists on the card hosts
 *    (.dse-sb/.dse-card descendants + the feature/featureblock root-compound)
 *    and is print-excluded;
 *  - BOTH nested resets exist (a nested element root resets font-size to
 *    var(--dse-fs-body), the role-scale token for "1em" since SC-185 round 2; a
 *    card host under a second element root resets zoom to 1) and are
 *    source-ordered AFTER their scale rule — a referenced card (by-SCC kit
 *    mounting a real nested feature) scales exactly once, like the site's
 *    zoom-one-wrapper rule (v2 extra.css:61).
 *
 * Comments are text (the section prose names these very selectors), so every
 * match runs against a comment-stripped copy of the file.
 */

const rawCss = fs.readFileSync(
	path.join(__dirname, '..', '..', '..', 'styles-source.css'),
	'utf8',
);
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');

interface Rule {
	selector: string;
	body: string;
	/** Character offset in the stripped file — for source-order assertions. */
	at: number;
}

const rules: Rule[] = (() => {
	const out: Rule[] = [];
	const re = /([^{}]+)\{([^{}]*)\}/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(css))) out.push({ selector: m[1].trim(), body: m[2], at: m.index });
	return out;
})();

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const PRINT_GUARD = ':not([data-dse-print="on"])';

function only(predicate: (r: Rule) => boolean, what: string): Rule {
	const hits = rules.filter(predicate);
	if (hits.length !== 1) {
		throw new Error(`expected exactly one ${what}, found ${hits.length}`);
	}
	return hits[0];
}

const textRule = only(
	(r) => r.body.includes('var(--dse-text-scale)'),
	'rule consuming var(--dse-text-scale)',
);
const zoomRule = only(
	(r) => r.body.includes('var(--dse-card-scale)'),
	'rule consuming var(--dse-card-scale)',
);

describe('SC-112 Task 7: text-scale consumer', () => {
	test('the element-root rule multiplies font-size by the token, print-excluded', () => {
		expect(norm(textRule.selector)).toBe(`[data-dse-element]${PRINT_GUARD}`);
		expect(norm(textRule.body)).toContain('font-size: calc(1em * var(--dse-text-scale))');
	});

	test('the nested-root reset exists (font-size: var(--dse-fs-body)), print-guarded, ordered AFTER', () => {
		const reset = only(
			(r) =>
				/\[data-dse-element\]\s+\[data-dse-element\]/.test(r.selector) &&
				norm(r.body).includes('font-size: var(--dse-fs-body)'),
			'nested element-root font-size reset',
		);
		expect(reset.selector).toContain(PRINT_GUARD);
		expect(reset.at).toBeGreaterThan(textRule.at);
	});
});

describe('SC-112 Task 7: card-scale consumer', () => {
	test('the card hosts zoom by the token, print-excluded on every arm', () => {
		expect(norm(zoomRule.body)).toContain('zoom: var(--dse-card-scale)');
		const sel = norm(zoomRule.selector);
		// Arm 1: .dse-sb/.dse-card descendants of an element root or modal.
		expect(sel).toContain(`:is([data-dse-element], .dse-modal)${PRINT_GUARD} :is(.dse-sb, .dse-card)`);
		// Arm 2: the feature/featureblock ROOT-compound (Task 4's card-host set).
		expect(sel).toMatch(/:not\(\[data-dse-print="on"\]\):is\(\s*\[data-dse-element='feature'\],\s*\[data-dse-element='featureblock'\]\s*\):not\(\[data-dse-error-stage\]\)/);
	});

	test('the nested reset exists (zoom: 1) covering BOTH host forms, ordered AFTER', () => {
		const reset = only(
			(r) => norm(r.body).includes('zoom: 1'),
			'nested card-host zoom reset',
		);
		const sel = norm(reset.selector);
		// A card host under a SECOND element root…
		expect(sel).toContain(`[data-dse-element] [data-dse-element]${PRINT_GUARD} :is(.dse-sb, .dse-card)`);
		// …and a feature/featureblock root nested inside another element root.
		expect(sel).toMatch(/\[data-dse-element\]\s+:is\(\s*\[data-dse-element='feature'\],\s*\[data-dse-element='featureblock'\]\s*\):not\(\[data-dse-print="on"\]\)/);
		expect(reset.at).toBeGreaterThan(zoomRule.at);
	});
});

describe('SC-112 Task 7: the :root defaults are the inert 1', () => {
	test('--dse-text-scale / --dse-card-scale default to 1 in the Legacy base', () => {
		const roots = css.match(/:root\s*\{[^}]*\}/g)?.join('\n') ?? '';
		expect(roots).toMatch(/--dse-text-scale:\s*1;/);
		expect(roots).toMatch(/--dse-card-scale:\s*1;/);
	});
});
