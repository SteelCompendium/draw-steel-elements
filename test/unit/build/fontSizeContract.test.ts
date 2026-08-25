import { readFileSync } from 'fs';
import path from 'path';

// SC-185: THE FONT-SIZE CONTRACT.
//
// Documentation asks; a test guarantees. The rule is stated in .repo-docs/font-sizes.md and
// in the ":root" type-scale block at the top of styles-source.css: **a font size in this
// plugin is stated as one of the nine --dse-fs-* ROLE tokens**, never as a bare literal
// (`0.85em`, `0.82rem`, `14px`) and never as one of Obsidian's absolute `--font-ui-*`
// interface sizes. This file is what makes that rule true rather than aspirational.
//
// It is deliberately an ALLOWLIST, not a ban. When SC-185 round 1 landed, the sheet
// carried 106 pre-existing hardcoded sizes across 30 distinct values — the mess the
// ticket was filed about. Deleting them all in one commit would have been an
// undiffable pixel event; the allowlist instead freezes the mess at its current size so
// that:
//
//   • a NEW hardcoded font-size fails immediately (it is not on the list), and
//   • an ADOPTED one must be deleted from the list in the same commit (a list entry
//     that no longer matches anything fails as a DEAD ENTRY — the same anti-rot shape
//     the parity gate's `declaredDeferrals` uses).
//
// So the list can only shrink, and round 2's sweep is measurable: `ALLOWLIST.length` is
// the number of declarations still owing an adoption.
//
// KEYED BY SELECTOR + VALUE, NEVER BY LINE NUMBER. styles-source.css is 11k lines and
// under constant restructuring (SC-183 was rebalancing the tracker layout while this
// landed); a line-anchored list would go red on every unrelated move and train people
// to regenerate it without reading it, which is the failure mode a gate must not have.
//
// PARSES THE SOURCE, NOT THE BUILD. Unlike cssNesting.test.ts — which asserts a
// property of the artifact a real Obsidian loads and therefore must build first — this
// is an AUTHORING rule, so it reads styles-source.css directly and needs no build step.

const repoRoot = path.resolve(__dirname, '../../..');
const SHEET = path.join(repoRoot, 'styles-source.css');

interface Decl {
	/** Full nested rule context, outermost first, joined by ' >> '. */
	selector: string;
	/** The declaration's value text, whitespace-collapsed. */
	value: string;
	/** 1-based line of the declaration — for the failure message only, never a key. */
	line: number;
}

/**
 * Every `font-size` declaration in the sheet, with its enclosing rule context.
 *
 * A brace-depth walk (same methodology as cssNesting.test.ts's `countNestedRuleOccurrences`)
 * rather than a regex over lines: styles-source.css uses native CSS nesting, so a
 * declaration's real subject is the CHAIN of selectors above it, and a flat regex would
 * report `.dse-init__round` for a rule that only ever applies inside
 * `[data-dse-element="initiative"] .dse-init`. At-rule frames (`@media`, `@supports`,
 * `@container`) are tracked so their braces can't desync the walk, but they are left out
 * of the key — a print/narrow variant of the same selector is the same authoring site.
 * Comments and quoted strings are skipped wholesale so braces inside them are inert.
 */
export function collectFontSizes(css: string): Decl[] {
	const out: Decl[] = [];
	const stack: { selector: string; atRule: boolean }[] = [];
	let buf = '';
	let line = 1;
	let declLine = 1;
	let i = 0;

	const flush = (): void => {
		const text = buf.trim();
		const m = /(?:^|[\s;{])font-size\s*:\s*([^;}]+)$/i.exec(text);
		if (m) {
			out.push({
				selector: stack
					.filter((f) => !f.atRule)
					.map((f) => f.selector)
					.join(' >> '),
				value: m[1].trim().replace(/\s+/g, ' '),
				line: declLine,
			});
		}
		buf = '';
	};

	while (i < css.length) {
		const ch = css[i];
		if (ch === '\n') line++;

		if (ch === '/' && css[i + 1] === '*') {
			const end = css.indexOf('*/', i + 2);
			const stop = end === -1 ? css.length : end + 2;
			for (let k = i; k < stop; k++) if (css[k] === '\n') line++;
			i = stop;
			continue;
		}
		if (ch === '"' || ch === "'") {
			const quote = ch;
			let j = i + 1;
			while (j < css.length && css[j] !== quote) {
				if (css[j] === '\\') j++;
				j++;
			}
			for (let k = i; k <= j && k < css.length; k++) if (css[k] === '\n') line++;
			buf += css.slice(i, j + 1);
			i = j + 1;
			continue;
		}
		if (ch === '{') {
			const selector = buf.trim().replace(/\s+/g, ' ');
			stack.push({ selector, atRule: selector.startsWith('@') });
			buf = '';
			declLine = line;
			i++;
			continue;
		}
		if (ch === '}') {
			flush();
			stack.pop();
			declLine = line;
			i++;
			continue;
		}
		if (ch === ';') {
			flush();
			declLine = line;
			i++;
			continue;
		}
		if (buf.trim() === '') declLine = line;
		buf += ch;
		i++;
	}
	return out;
}

/** A declaration honours the contract when its size comes from the role scale. */
export function isOnScale(value: string): boolean {
	return /var\(\s*--dse-fs-/.test(value);
}

export const key = (d: Decl): string => `${d.selector} :: ${d.value}`;

/**
 * THE ALLOWLIST — every font-size that predates the role scale, exactly as it stood when
 * SC-185 round 1 landed (106 entries). Each one is a declaration that still owes an
 * adoption; delete its line in the same commit that adopts it.
 *
 * Do NOT add to this list to make a red run green. A new entry means new hardcoded type,
 * which is the thing this file exists to prevent — put the size on the scale instead, and
 * if no role fits, that is a scale change (a new/retuned --dse-fs-* token, documented in
 * .repo-docs/font-sizes.md and the workspace D3-token-map.md), not an exemption.
 *
 * The four sub-families worth naming, because they are NOT all the same kind of debt:
 *   • plain literals (`0.85em` ×19, `0.8em` ×14, …) — the ordinary case: swap for the
 *     role whose default is that number and the swap is inert.
 *   • absolute `rem`/`px` (the sticky mini-header, `.dse-sb__char-box`, the initiative
 *     stamina cells) — these do NOT track the reader's font size at all; adopting them
 *     is a real rendering change and needs evidence, not a rename.
 *   • Obsidian `--font-ui-*` / `--font-smaller` sizes — absolute px keyed to the
 *     INTERFACE font-size slider, which is a different slider from the one that sizes
 *     note text. Two of them (`--font-ui-smaller`, `--font-ui-medium`) are not even
 *     declared in the harness's vendored vars.css, so those sites render at their
 *     INHERITED size in every shot and at 12/15px in a real vault.
 *   • the two OTHER scale mechanisms — `--dse-text-scale` (whole-element zoom) and the
 *     YAML-driven `--dse-value-scale`/`--dse-label-scale` knobs on counter/values-row/
 *     characteristics. These are deliberate, documented systems; they are listed here
 *     because they are still literal-bearing, not because they are wrong.
 */
export const ALLOWLIST: readonly string[] = [
	"span.dsa, code.dsa :: var(--tag-size)",
	"[data-dse-element=\"initiative\"] .dse-init >> .dse-init__actions :: 0.75em",
	"[data-dse-element=\"initiative\"] .dse-init >> .dse-init__cell-stamina :: 14px",
	"[data-dse-element=\"initiative\"] .dse-init >> .dse-init__cell-stamina :: 12px",
	".dse-sedit__temp-title :: var(--font-ui-small)",
	".dse-sedit__info :: var(--font-ui-large)",
	".dse-condal__tag :: 0.62em",
	".dse-condal__dur :: 0.72em",
	".dse-cond-field__label :: 0.72em",
	".dse-sb__char-box :: 0.82rem",
	":is([data-dse-element='statblock'], [data-dse-element='characteristics'], [data-dse-element='hero']):is([data-dse-sb-charbox='on'], [data-dse-sb-charbox='onword']):not([data-dse-sb-charline='two']) .dse-sb__char-v :: 1.25rem",
	"[data-dse-element='characteristics']:is([data-dse-sb-charbox='on'], [data-dse-sb-charbox='onword']):not([data-dse-sb-charline='two']) .dse-sb__char-v :: calc(1.25rem * var(--dse-value-scale, 1))",
	"[data-dse-element='characteristics'] .dse-sb__char-l :: calc(1em * var(--dse-label-scale, 1))",
	"[data-dse-element=\"counter\"] .dse-counter >> .dse-counter__value :: calc(var(--dse-value-scale, 3) * 1em)",
	"[data-dse-element=\"counter\"] .dse-counter >> .dse-counter__name :: calc(var(--dse-label-scale, 1) * 1em)",
	"[data-dse-element=\"values-row\"] .dse-statgrid >> .dse-statgrid__value :: calc(var(--dse-value-scale, 3) * 1em)",
	"[data-dse-element=\"values-row\"] .dse-statgrid >> .dse-statgrid__label :: calc(var(--dse-label-scale, 1) * 1em)",
	"[data-dse-element=\"skills\"] .dse-skills >> .dse-collapse__title, .dse-skills__group-title :: 1.2em",
	"[data-dse-element=\"skills\"] .dse-skills >> .dse-skills__tally :: 0.75em",
	"[data-dse-element]:not([data-dse-print=\"on\"]) :: calc(1em * var(--dse-text-scale))",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-head__deck--chip :: 1.125em",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) :is(.dse-sb, .dse-fb) > .dse-head > .dse-head__primary--chip :: 1.125em",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-fb .dse-feature > .dse-head > .dse-head__eyebrow--right :: 1.35em",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-head > .dse-fb__feat-icon :: 1.1em",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-kit__equip :: 0.92em",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-feature__meta-cell--keywords, [data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-feature__meta-cell--type :: 1.1em",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-feature__meta-cell--distance .dse-feature__meta-key, [data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-feature__meta-cell--target .dse-feature__meta-key :: 0.78em",
	"[data-dse-theme='steel'][data-dse-kwusage='grid'] .dse-feature__meta-cell--keywords .dse-feature__meta-key, [data-dse-theme='steel'][data-dse-kwusage='grid'] .dse-feature__meta-cell--type .dse-feature__meta-key, [data-dse-theme='steel'][data-dse-kwusage='ledger'] .dse-feature__meta-cell--keywords .dse-feature__meta-key, [data-dse-theme='steel'][data-dse-kwusage='ledger'] .dse-feature__meta-cell--type .dse-feature__meta-key :: 0.78em",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-sb__band .dse-collapse__title :: 1.25rem",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-sb__sticky-name :: 1.28rem",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-sb__sticky-role :: 1rem",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-sb__sticky-m, [data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-sb__sticky-c :: 0.72rem",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-sb__sticky-m b, [data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-sb__sticky-c b :: 0.98rem",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-sb__sticky-c i :: 0.68rem",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-sb__sticky-sm :: 0.82rem",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-sb__sticky-name :: 1rem",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-sb__sticky-m, [data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-sb__sticky-c :: 0.64rem",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-sb__sticky-m b, [data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-sb__sticky-c b :: 0.84rem",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-sb__sticky-role :: 0.85rem",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) table:not([class]) :: 0.92em",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-stamina__clabel :: 0.82em",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-stamina__cnums :: 2.05em",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) :is(.dse-stamina__cslash, .dse-stamina__cmax) :: 0.46em",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-stamina__ctemp :: 0.34em",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-skills[data-skills-style] .dse-collapse__title, [data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-skills[data-skills-style] .dse-skills__group-title :: 0.92em",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-skills[data-skills-style='ledger'] .dse-skills__item :: 0.92em",
	".dse-tiles__label :: 0.68em",
	"[data-dse-theme='steel']:not([data-dse-print=\"on\"]) .dse-chrome-summary__label :: 0.82em",
];

describe('SC-185: font sizes come from the --dse-fs-* role scale', () => {
	const css = readFileSync(SHEET, 'utf8');
	const declarations = collectFontSizes(css);
	const offScale = declarations.filter((d) => !isOnScale(d.value));

	it('finds a plausible number of font-size declarations (the walker still works)', () => {
		// A parser that silently stopped matching would make every assertion below
		// vacuously true, which is the one way this gate could fail open.
		expect(declarations.length).toBeGreaterThan(100);
	});

	it('the allowlist has no duplicate entries', () => {
		const seen = new Set<string>();
		const duplicates = ALLOWLIST.filter((entry) => (seen.has(entry) ? true : (seen.add(entry), false)));
		expect(duplicates).toEqual([]);
	});

	it('declares NO new hardcoded font-size', () => {
		const allowed = new Set(ALLOWLIST);
		const introduced = offScale
			.filter((d) => !allowed.has(key(d)))
			.map((d) => `styles-source.css:${d.line}  ${key(d)}`);
		expect(introduced).toEqual([]);
		// If this failed: put the size on the role scale (.repo-docs/font-sizes.md) —
		// `font-size: var(--dse-fs-label)` and friends. Adding the site to ALLOWLIST
		// is NOT the fix; the list only ever shrinks.
	});

	it('the allowlist has no DEAD entries (adopting one deletes its line)', () => {
		const live = new Set(offScale.map(key));
		const dead = ALLOWLIST.filter((entry) => !live.has(entry));
		expect(dead).toEqual([]);
		// If this failed: the listed declaration was adopted, moved or reworded —
		// delete its line from ALLOWLIST in the same commit. A stale entry is a
		// promise about the sheet that is no longer true.
	});

	it('the gate HAS TEETH: a synthetic hardcoded size is reported, a token one is not', () => {
		const sample = `
			.dse-thing { color: red; font-size: 0.85em; }
			.dse-outer { .dse-inner { font-size: 13px } }
			@media print { .dse-printed { font-size: var(--dse-fs-caption); } }
			.dse-scaled { font-size: calc(var(--dse-fs-label) * 2); }
		`;
		const found = collectFontSizes(sample);
		expect(found.map(key)).toEqual([
			'.dse-thing :: 0.85em',
			'.dse-outer >> .dse-inner :: 13px',
			'.dse-printed :: var(--dse-fs-caption)',
			'.dse-scaled :: calc(var(--dse-fs-label) * 2)',
		]);
		expect(found.filter((d) => !isOnScale(d.value)).map(key)).toEqual([
			'.dse-thing :: 0.85em',
			'.dse-outer >> .dse-inner :: 13px',
		]);
	});

	it('records how much of the sweep is left (SC-185 round 2)', () => {
		// Not a threshold to game — a visible counter, so a round that claims to have
		// adopted N sites has to move this number by N. Round 1 landed 106 outstanding.
		expect(offScale.length).toBe(ALLOWLIST.length);
	});
});

// —— The TS half of the same rule ————————————————————————————————————————
//
// CSS is not the only way to state a size. An inline `el.style.fontSize = …` bypasses the
// sheet entirely, so it bypasses the scale, the settings sliders and the print layer with
// it. The plugin has never done this (three element views carry explicit "zero inline
// font-size" comments and route through --dse-value-scale/--dse-label-scale custom
// properties instead); this pins that as a contract rather than a habit.
describe('SC-185: no inline font-size from TypeScript', () => {
	it('src/ sets no fontSize property and writes no font-size via setProperty', () => {
		const srcFiles = listTs(path.join(repoRoot, 'src'));
		const offenders: string[] = [];
		for (const file of srcFiles) {
			const text = stripComments(readFileSync(file, 'utf8'));
			if (/\.style\s*\.\s*fontSize\s*=/.test(text)) offenders.push(`${rel(file)}: style.fontSize =`);
			if (/setProperty\(\s*['"`]font-size['"`]/.test(text)) offenders.push(`${rel(file)}: setProperty('font-size')`);
		}
		expect(offenders).toEqual([]);
	});
});

function rel(file: string): string {
	return path.relative(repoRoot, file);
}

/** Strips block and line comments so a documented prohibition isn't read as a violation. */
function stripComments(text: string): string {
	return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function listTs(dir: string): string[] {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const fs = require('fs') as typeof import('fs');
	const out: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...listTs(full));
		else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(full);
	}
	return out;
}
