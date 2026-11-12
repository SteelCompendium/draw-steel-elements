import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * SC-563 (option I1): the Steel action crest draws its icon from the site's DrawSteelGlyphs font.
 *
 * Built like `steelMaterial.test.ts`: jsdom cannot resolve `::before` content or a loaded font, so
 * this asserts on the RULE TEXT of `styles-source.css` (comment-stripped, both quoting styles of the
 * Steel scope), and uses jsdom's `matches()` on the selector text for the scope questions a string
 * match gets wrong (does the villain crest match? does an unmapped act?). `crestGlyphProblems()` is
 * the whole contract as a function so the "gate HAS TEETH" test can feed it mutated CSS.
 */

const root = path.join(__dirname, '..', '..', '..');
const rawCss = fs.readFileSync(path.join(root, 'styles-source.css'), 'utf8');

/** Comments are text: strip them before matching (the SC-563 block names every value below). */
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '');

/** The codepoints the site emits (steel-etl/internal/site/ability_cards.go actionInfo). */
const SITE_CODEPOINTS: Record<string, string> = {
	main: 'l',
	maneuver: 'f',
	triggered: ')',
	move: 'o',
	none: '*',
	trait: '*',
};

interface Rule {
	selector: string;
	body: string;
}

const rulesOf = (css: string): Rule[] => {
	const out: Rule[] = [];
	const re = /([^{}]+)\{([^{}]*)\}/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(css))) out.push({ selector: m[1].trim(), body: m[2] });
	return out;
};

const STEEL_SCOPE = /\[data-dse-theme=['"]steel['"]\]/;
const SCREEN_ONLY = /:not\(\[data-dse-print=['"]on['"]\]\)/;

/** Rules on the crest glyph that this contract owns: `.dse-crest__glyph` + `[data-dse-act`. */
const glyphRules = (css: string): Rule[] =>
	rulesOf(stripComments(css)).filter(
		(r) => r.selector.includes('.dse-crest__glyph') && r.selector.includes('data-dse-act'),
	);

/** The `::before` rules that carry a `content:` (one per act). */
const contentRules = (css: string): Rule[] =>
	glyphRules(css).filter((r) => r.selector.endsWith('::before') && /content\s*:/.test(r.body));

/** act -> codepoint, from the single-act `content` rules. */
const codepointMap = (css: string): Record<string, string> => {
	const map: Record<string, string> = {};
	for (const r of contentRules(css)) {
		const act = /\[data-dse-act=['"]([a-z]+)['"]\]/.exec(r.selector)?.[1];
		const cp = /content\s*:\s*"([^"]*)"\s*\/\s*""\s*;?/.exec(r.body)?.[1];
		if (act && cp !== undefined) map[act] = cp;
	}
	return map;
};

/** The selector (without `::before`) a jsdom element can be tested against. */
const matchable = (selector: string): string => selector.replace(/::before$/, '');

/** Does `selector` match a crest glyph's svg inside a feature root carrying `act`? */
const matchesAct = (selector: string, act: string | null, tag: 'svg' | 'span'): boolean => {
	// The Steel scope lives on an ancestor (the element root), as in the real DOM.
	const scope = document.createElement('div');
	scope.setAttribute('data-dse-theme', 'steel');
	const rootEl = document.createElement('div');
	rootEl.className = 'dse-feature';
	if (act !== null) rootEl.setAttribute('data-dse-act', act);
	rootEl.innerHTML = `<div class="dse-head"><span class="dse-crest"><span class="dse-crest__glyph">${
		tag === 'svg' ? '<svg></svg>' : ''
	}</span></span></div>`;
	scope.appendChild(rootEl);
	document.body.appendChild(scope);
	try {
		const target = tag === 'svg' ? rootEl.querySelector('svg') : rootEl.querySelector('.dse-crest__glyph');
		return !!target && target.matches(matchable(selector));
	} finally {
		scope.remove();
	}
};

/** The whole contract. Empty array = holds. */
function crestGlyphProblems(css: string): string[] {
	const problems: string[] = [];
	const rules = glyphRules(css);

	// @font-face: present, the right family, display:block, embedded as a data: URI.
	const face = /@font-face\s*\{([^{}]*font-family:\s*"DrawSteelGlyphs"[^{}]*)\}/.exec(stripComments(css));
	if (!face) problems.push('no @font-face for "DrawSteelGlyphs"');
	else {
		if (!/font-display:\s*block/.test(face[1])) problems.push('@font-face is not font-display: block');
		if (!/src:\s*url\("data:font\/otf;base64,[A-Za-z0-9+/=]+"\)/.test(face[1]))
			problems.push('@font-face src is not a data:font/otf base64 URI');
	}

	// Every rule is Steel-scoped and screen-only.
	for (const r of rules) {
		if (!STEEL_SCOPE.test(r.selector)) problems.push(`not Steel-scoped: ${r.selector.slice(0, 80)}`);
		if (!SCREEN_ONLY.test(r.selector)) problems.push(`not screen-only: ${r.selector.slice(0, 80)}`);
		if (/villain/.test(r.selector)) problems.push(`names villain: ${r.selector.slice(0, 80)}`);
	}

	// Exactly the six site codepoints, each with empty alt text.
	const map = codepointMap(css);
	if (!sameMap(map, SITE_CODEPOINTS))
		problems.push(`codepoints ${JSON.stringify(map)} != site ${JSON.stringify(SITE_CODEPOINTS)}`);
	for (const r of contentRules(css))
		if (!/content\s*:\s*"[^"]*"\s*\/\s*""\s*;?\s*$/.test(r.body.trim()))
			problems.push(`content has no empty alt text: ${r.body.trim()}`);

	// The svg is hidden for exactly the six acts, and NOT for villain, an unmapped act or no act.
	const hide = rules.filter((r) => /display\s*:\s*none/.test(r.body) && r.selector.endsWith('svg'));
	if (hide.length !== 1) problems.push(`expected one svg-hide rule, found ${hide.length}`);
	else {
		for (const act of Object.keys(SITE_CODEPOINTS))
			if (!matchesAct(hide[0].selector, act, 'svg')) problems.push(`svg not hidden for ${act}`);
		for (const act of ['villain', 'bogus', null])
			if (matchesAct(hide[0].selector, act, 'svg')) problems.push(`svg hidden for ${String(act)}`);
	}

	// The glyph face rule: DrawSteelGlyphs, 1.25em-of-the-crest size, line-height 1, same six acts.
	const face2 = rules.filter((r) => /font-family\s*:\s*"DrawSteelGlyphs"/.test(r.body));
	if (face2.length !== 1) problems.push(`expected one glyph font-family rule, found ${face2.length}`);
	else {
		if (!/font-size\s*:\s*calc\(\s*var\(--dse-fs-body\)\s*\*\s*1\.25\s*\)/.test(face2[0].body))
			problems.push('glyph font-size is not 1.25 x --dse-fs-body');
		if (!/line-height\s*:\s*1\s*;/.test(face2[0].body)) problems.push('glyph line-height is not 1');
		for (const act of Object.keys(SITE_CODEPOINTS))
			if (!matchesAct(face2[0].selector, act, 'span')) problems.push(`glyph face missing for ${act}`);
		for (const act of ['villain', 'bogus', null])
			if (matchesAct(face2[0].selector, act, 'span')) problems.push(`glyph face applied to ${String(act)}`);
	}
	return problems;
}

const sameMap = (a: Record<string, string>, b: Record<string, string>): boolean => {
	const ka = Object.keys(a).sort();
	const kb = Object.keys(b).sort();
	return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
};

describe('SC-563: Steel action crests draw DrawSteelGlyphs', () => {
	it('the shipped stylesheet satisfies the whole contract', () => {
		expect(crestGlyphProblems(rawCss)).toEqual([]);
	});

	it('covers exactly the six site codepoints (main l, maneuver f, triggered ), move o, none *, trait *)', () => {
		expect(codepointMap(rawCss)).toEqual(SITE_CODEPOINTS);
		expect(contentRules(rawCss)).toHaveLength(6);
	});

	it('every rule is Steel-scoped and screen-only (print hides crests; freeze stays untouched)', () => {
		const rules = glyphRules(rawCss);
		expect(rules.length).toBeGreaterThanOrEqual(8);
		for (const r of rules) {
			expect(r.selector).toMatch(STEEL_SCOPE);
			expect(r.selector).toMatch(SCREEN_ONLY);
		}
	});

	it('excludes villain (it keeps the Lucide skull) and keeps the svg for an unmapped act', () => {
		const hide = glyphRules(rawCss).find((r) => r.selector.endsWith('svg'));
		expect(hide).toBeDefined();
		expect(matchesAct((hide as Rule).selector, 'villain', 'svg')).toBe(false);
		expect(matchesAct((hide as Rule).selector, 'bogus', 'svg')).toBe(false);
		expect(matchesAct((hide as Rule).selector, 'trait', 'svg')).toBe(true);
		expect(rulesOf(stripComments(rawCss)).some((r) => /villain/.test(r.selector) && r.selector.includes('.dse-crest__glyph'))).toBe(
			false,
		);
	});

	it('the glyph is decorative: every content has empty alt text', () => {
		for (const r of contentRules(rawCss)) expect(r.body).toMatch(/content:\s*"[^"]*"\s*\/\s*"";/);
	});

	it('embeds the full, unmodified font as a font-display:block data: URI @font-face', () => {
		const face = /@font-face\s*\{([^{}]*font-family:\s*"DrawSteelGlyphs"[^{}]*)\}/.exec(stripComments(rawCss));
		expect(face).not.toBeNull();
		expect((face as RegExpExecArray)[1]).toMatch(/font-display:\s*block/);
		const b64 = /url\("data:font\/otf;base64,([A-Za-z0-9+/=]+)"\)/.exec((face as RegExpExecArray)[1])?.[1];
		expect(b64).toBeDefined();
		const otf = fs.readFileSync(path.join(root, 'assets', 'fonts', 'DrawSteelGlyphs-Regular.otf'));
		// Byte-for-byte the committed OTF: no subsetting (a subset is arguably an adaptation).
		expect(Buffer.from(b64 as string, 'base64').equals(otf)).toBe(true);
	});

	it('ships the CC BY-SA 4.0 attribution file next to the other font licence', () => {
		const lic = fs.readFileSync(path.join(root, 'assets', 'fonts', 'DrawSteelGlyphs-LICENSE.txt'), 'utf8');
		expect(lic).toMatch(/MCDM Productions/);
		expect(lic).toMatch(/Attribution-ShareAlike 4\.0/);
	});

	it('the gate HAS TEETH: each mutation of the rules is reported', () => {
		const mutate = (from: string | RegExp, to: string): string => {
			const out = rawCss.replace(from, to);
			expect(out).not.toBe(rawCss);
			return out;
		};
		// Drops the print exclusion on the hide rule.
		const unscoped = mutate(
			/(\[data-dse-theme='steel'\])(:not\(\[data-dse-print="on"\]\))( \.dse-feature:is\(\[data-dse-act='main'\])/,
			'$1$3',
		);
		expect(crestGlyphProblems(unscoped).join('\n')).toMatch(/not screen-only/);
		// Adds villain to the hidden set.
		const villain = mutate(
			".dse-feature:is([data-dse-act='main'], [data-dse-act='maneuver']",
			".dse-feature:is([data-dse-act='villain'], [data-dse-act='main'], [data-dse-act='maneuver']",
		);
		expect(crestGlyphProblems(villain).join('\n')).toMatch(/villain/);
		// Loses the alt text on one glyph.
		const noAlt = mutate('content: "o" / "";', 'content: "o";');
		expect(crestGlyphProblems(noAlt).join('\n')).toMatch(/no empty alt text/);
		// Swaps a codepoint.
		const wrongCp = mutate('content: "f" / "";', 'content: "g" / "";');
		expect(crestGlyphProblems(wrongCp).join('\n')).toMatch(/codepoints/);
		// Loses the font-face.
		const noFace = mutate('font-family: "DrawSteelGlyphs";\n\tfont-weight: 400;', 'font-family: "Other";\n\tfont-weight: 400;');
		expect(crestGlyphProblems(noFace).join('\n')).toMatch(/no @font-face/);
	});
});
