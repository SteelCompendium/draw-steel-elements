// test/dom/elements/sccStyleParity.test.ts — SC-149 fix round, H-1 regression.
//
// THE BUG THIS EXISTS FOR. `ds-scc` mounts the REAL statblock/feature/featureblock view
// after it resolves a code, so its inner DOM was already byte-identical to the typed
// element's — every assertion in sccElement.test.ts passed. But the pipeline stamps
// `data-dse-element` with the BLOCK's element id (`scc`) before any resolution can know
// better, and 84 rules in styles-source.css require
// `[data-dse-element='statblock'|'feature'|'featureblock']`. (No md-dse fixture is a
// featureblock, so the two families with one are covered here; the mechanism is shared.)
// Since SC-141 landed, the feature rows run twice: once on a hand-shaped `feature.*` code
// and once on a REAL corpus ability file (`type: ability`), the shape 621 corpus files
// carry and the one users will actually reference. So the card came out with no
// gradient, no block rhythm, no hairline, plan 25's standalone action-spine removal
// silently reverted, and EVERY SC-123/SC-146 statblock/featureblock preference a no-op
// (a pref selector pairs its `data-dse-*` attribute WITH the element id). Identical DOM,
// unstyled output — invisible to any DOM-shape assertion, which is exactly why the first
// round shipped it.
//
// HOW THIS TESTS IT WITHOUT A BROWSER. jsdom can't do layout, so "the grid is 578px" is
// unavailable — but the failure is a SELECTOR-MATCHING failure, and jsdom matches
// selectors properly. So: parse the shipped stylesheet, keep every selector that requires
// one of the element ids, and assert that the set of those selectors matching a
// `ds-scc` render is EXACTLY the set matching the same code through the typed element.
// Before the fix that set is empty for ds-scc and non-empty for ds-sb; after it, identical.
// This is stronger than a `getAttribute` check (which sccElement.test.ts also has): it is
// stated in terms of the CSS that actually pays out, so it keeps holding if the attribute
// mechanism is ever reworked, and it grows automatically with every new element-scoped rule.
import * as fs from 'fs';
import * as path from 'path';
import { ElementPipeline } from '@/framework/pipeline';
import type { ElementDefinition } from '@/framework/registry';
import type { PreferenceStore } from '@/framework/seams/prefs';
import type { ThemeServiceInternal } from '@/framework/seams/theme';
import { sccElement } from '@/elements/scc/definition';
import { statblockElement } from '@/elements/statblock/definition';
import { featureElement } from '@/elements/feature/definition';
import { makeHost, makeCompendiumDeps, loadMdDseFixture } from './_refHarness';

const STYLESHEET = path.join(__dirname, '../../../styles-source.css');

const GOBLIN_CODE = 'mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker';
const GOBLIN_REL = 'monster/goblin/statblock/goblin-stinker.md';
const FEATURE_CODE = 'mcdm.heroes.v1/feature.fury.level-1/growing-ferocity';
const FEATURE_REL = 'feature/fury/level-1/growing-ferocity.md';
// SC-141 (landed): a REAL corpus ability file, whose frontmatter type is the bare leaf
// `ability`. 621 corpus files look like this and ds-scc is now the only public way to
// reference one, so the styling claim has to hold for THIS shape, not just for the
// hand-shaped `feature.*` one — the two reach the view down slightly different paths
// (a widened family regex vs. the original literal).
const ABILITY_CODE = 'mcdm.heroes.v1/feature.ability.fury.level-1/hit-and-run';
const ABILITY_REL = 'feature/ability/fury/level-1/hit-and-run.md';

/**
 * Every selector in the stylesheet, flattened out of at-rules. Brace-depth walk rather
 * than a regex: `@media`/`@supports` blocks nest, and a naive split on `}` mangles them.
 */
function allSelectors(css: string): string[] {
	const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
	const selectors: string[] = [];
	let prelude = '';
	for (const ch of stripped) {
		if (ch === '{') {
			const text = prelude.trim();
			// An at-rule prelude (@media …) is not a selector, but its BODY is walked the
			// same way, so its inner selectors are still collected.
			if (text.length > 0 && !text.startsWith('@')) selectors.push(text);
			prelude = '';
		} else if (ch === '}') {
			prelude = '';
		} else {
			prelude += ch;
		}
	}
	// Selector LISTS ("a, b") are split so one unmatched half can't hide behind a matched one.
	return selectors.flatMap((list) => list.split(',').map((sel) => sel.trim())).filter((sel) => sel.length > 0);
}

/** Selectors that can only ever match inside an element root of `id`. */
function elementScopedSelectors(id: string): string[] {
	const css = fs.readFileSync(STYLESHEET, 'utf8');
	const needle = new RegExp(`\\[data-dse-element=["']${id}["']\\]`);
	return allSelectors(css).filter((sel) => needle.test(sel));
}

/** The subset of `selectors` that actually matches something in `root` (or `root` itself). */
function matching(root: HTMLElement, selectors: string[]): string[] {
	return selectors.filter((sel) => {
		try {
			return root.matches(sel) || root.querySelector(sel) !== null;
		} catch {
			// A selector jsdom can't parse (e.g. an unsupported pseudo) is not evidence
			// either way — excluded from BOTH sides, since both sides run this same filter.
			return false;
		}
	});
}

interface Rendered {
	viaTyped: HTMLElement;
	viaScc: HTMLElement;
}

/** Render the same compendium code twice — once through the typed element, once through
 *  `ds-scc` — into two live roots under `document.body` (selectors are evaluated against a
 *  document, so the roots must be attached). */
async function renderBoth(
	typed: ElementDefinition<unknown>,
	code: string,
	rel: string,
	prefs?: Record<string, unknown>,
): Promise<Rendered> {
	const { vault, deps } = makeCompendiumDeps();
	loadMdDseFixture(vault, rel);
	(deps.theme as ThemeServiceInternal).setActive('steel');
	for (const [key, value] of Object.entries(prefs ?? {})) {
		await (deps.prefs as PreferenceStore).set(key as never, value as never);
	}
	const pipeline = new ElementPipeline(deps);
	const out: HTMLElement[] = [];
	for (const def of [typed, sccElement as ElementDefinition<unknown>]) {
		const host = makeHost('ds-block');
		document.body.appendChild(host.containerEl);
		await pipeline.run(def, code, host);
		out.push(host.containerEl.firstElementChild as HTMLElement);
	}
	return { viaTyped: out[0], viaScc: out[1] };
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('SC-149 H-1 — a ds-scc render is styled identically to the typed element', () => {
	test.each([
		['statblock', statblockElement as ElementDefinition<unknown>, GOBLIN_CODE, GOBLIN_REL],
		['feature', featureElement as ElementDefinition<unknown>, FEATURE_CODE, FEATURE_REL],
		['feature', featureElement as ElementDefinition<unknown>, ABILITY_CODE, ABILITY_REL],
	])('%s: every element-scoped selector that matches via the typed element also matches via ds-scc', async (id, typed, code, rel) => {
		const selectors = elementScopedSelectors(id);
		// Guard the guard: if the stylesheet stops carrying element-scoped rules for this
		// family, an "identical, both empty" pass would be vacuous.
		expect(selectors.length).toBeGreaterThan(5);

		const { viaTyped, viaScc } = await renderBoth(typed, code, rel);
		const typedHits = matching(viaTyped, selectors);
		expect(typedHits.length).toBeGreaterThan(0);
		expect(matching(viaScc, selectors)).toEqual(typedHits);
	});

	// The sharpest single rule: plan 25's standalone action-spine removal, a Scott-approved
	// change that cost a sanctioned five-line freeze rebaseline. Through ds-scc it used to
	// revert silently — a standalone feature rendered with the nested/embedded spine indent.
	test.each([
		['a hand-shaped feature.* code', FEATURE_CODE, FEATURE_REL],
		['a real corpus ability file', ABILITY_CODE, ABILITY_REL],
	])('feature: plan 25\'s standalone action-spine rule reaches ds-scc — %s', async (_label, code, rel) => {
		const SPINE = "[data-dse-theme='steel'][data-dse-element='feature'] .dse-feature[data-dse-act]";
		expect(elementScopedSelectors('feature')).toContain(SPINE);
		const { viaTyped, viaScc } = await renderBoth(featureElement as ElementDefinition<unknown>, code, rel);
		expect(viaTyped.querySelector(SPINE)).not.toBeNull();
		expect(viaScc.querySelector(SPINE)).not.toBeNull();
	});

	// A PREFERENCE, the other half of H-1: pref selectors pair a `data-dse-*` attribute with
	// the element id, so through ds-scc the attribute was stamped and the rule still never
	// matched — the settings panel looked broken for exactly these blocks.
	test.each([
		['sbDensity', 'compact'],
		['sbStats', 'ledger'],
		['sbColumns', 'wide'],
	])('statblock: the %s=%s preference reaches a ds-scc-rendered statblock', async (key, value) => {
		const selectors = elementScopedSelectors('statblock');
		const { viaTyped, viaScc } = await renderBoth(
			statblockElement as ElementDefinition<unknown>,
			GOBLIN_CODE,
			GOBLIN_REL,
			{ [key]: value },
		);
		// Only the rules this preference actually gates — i.e. element-scoped selectors that
		// ALSO name this pref's value — and only those the typed element proves reachable.
		const prefScoped = selectors.filter((sel) => sel.includes(`="${value}"`) || sel.includes(`='${value}'`));
		const typedHits = matching(viaTyped, prefScoped);
		expect(typedHits.length).toBeGreaterThan(0);
		expect(matching(viaScc, prefScoped)).toEqual(typedHits);
	});
});
