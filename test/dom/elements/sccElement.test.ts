// test/dom/elements/sccElement.test.ts — SC-149: `ds-scc`, the one public catch-all
// compendium-reference element. Two halves:
//
//   1. STRICT BODY (`parseSccBody`). The element accepts an SCC code and nothing else.
//      Every other body shape — inline YAML, a wikilink, an `@path`, a bare slug, an
//      empty block — is a plain error card naming the one accepted form. That strictness
//      IS the public contract (Scott's ruling: "the only content that is allowed is an
//      scc code and thats it"), so the messages are pinned here, not just the throw.
//   2. TYPE DISPATCH. One element renders every family: the resolved entity's SCC `type`
//      picks which existing card view mounts, through the SAME TYPE_ADAPTERS ordering
//      CompendiumIndex used to build the model. Proven against the REAL md-dse fixtures
//      via _refHarness (the same harness statblockRef.test.ts/displayFamily.test.ts use)
//      — a kit renders the kit card, a statblock the statblock card, a rule the
//      model-less generic card, with no error card anywhere.
//
// The degrade ladder itself (unsynced compendium / unknown code / web fallback) is
// RefUnwrapView's, already covered by refUnwrapView.test.ts; the two cases asserted here
// are the ones a `ds-scc` user hits first, so they are pinned at this element's own level.
import { ElementPipeline } from '@/framework/pipeline';
import { parseSccBody, sccElement, baseForSccType, SCC_ELEMENT_NAME } from '@/elements/scc/definition';
import sccExample from '@/elements/scc/example.yaml';
import type { ThemeServiceInternal } from '@/framework/seams/theme';
import { makeHost, makeCompendiumDeps, loadMdDseFixture } from './_refHarness';

const KIT_CODE = 'mcdm.heroes.v1/kit/panther';
const KIT_REL = 'kit/panther.md';
const CONDITION_CODE = 'mcdm.heroes.v1/condition/bleeding';
const CONDITION_REL = 'condition/bleeding.md';
const RULE_CODE = 'mcdm.heroes.v1/rule.combat/turn';
const RULE_REL = 'rule/combat/turn.md';
const GOBLIN_CODE = 'mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker';
const GOBLIN_REL = 'monster/goblin/statblock/goblin-stinker.md';

/** Render a ds-scc block and hand back its root element. `theme` follows
 *  displayFamily.test.ts's convention: the kit card has a Steel-only composition (SC-100)
 *  with its own DOM, so kit assertions pin the legacy row-list card the other families
 *  still render in either theme. */
async function render(body: string, seed: string[] = [], theme?: 'legacy'): Promise<HTMLElement> {
	const { vault, deps } = makeCompendiumDeps();
	for (const rel of seed) loadMdDseFixture(vault, rel);
	if (theme) (deps.theme as ThemeServiceInternal).setActive(theme);
	const host = makeHost('ds-scc');
	await new ElementPipeline(deps).run(sccElement, body, host);
	return host.containerEl.firstElementChild as HTMLElement;
}

function errorText(root: HTMLElement): string {
	const card = root.querySelector('.dse-error-card');
	return card === null ? '' : (card.textContent ?? '');
}

describe('SC-149 parseSccBody — an SCC code and nothing else', () => {
	test('a bare full code passes through verbatim', () => {
		expect(parseSccBody(KIT_CODE)).toBe(KIT_CODE);
		expect(parseSccBody(`  ${GOBLIN_CODE}\n`)).toBe(GOBLIN_CODE);
	});

	test('the scc:/scc.v1: prefixed forms are normalized to the bare code', () => {
		expect(parseSccBody(`scc:${KIT_CODE}`)).toBe(KIT_CODE);
		expect(parseSccBody(`scc.v1:${KIT_CODE}`)).toBe(KIT_CODE);
		// normalizeSccTarget's own #fragment handling, reused rather than reimplemented.
		expect(parseSccBody(`scc.v1:${KIT_CODE}#kit-bonuses`)).toBe(KIT_CODE);
	});

	test('a future scc.vN: version is refused, never silently bound to v1 content', () => {
		expect(() => parseSccBody(`scc.v2:${KIT_CODE}`)).toThrow(/not a supported SCC reference/);
	});

	test('inline YAML (a mapping) is refused with the one-accepted-form message', () => {
		expect(() => parseSccBody('name: Panther\nstamina_bonus: 6')).toThrow(/more than one line/);
		expect(() => parseSccBody('name: Panther\nstamina_bonus: 6')).toThrow(/must be a single SCC code/);
	});

	test('a single-line YAML mapping is refused too (it is not a code)', () => {
		expect(() => parseSccBody('name: Panther')).toThrow(/is not a full SCC code/);
	});

	test('an empty or whitespace-only body is refused', () => {
		expect(() => parseSccBody('')).toThrow(/Empty block/);
		expect(() => parseSccBody('   \n  ')).toThrow(/Empty block/);
	});

	test('[[wikilink]] and @path get a message that says where to go instead', () => {
		for (const body of ['[[Panther]]', '@DS Compendium/kit/panther.md']) {
			expect(() => parseSccBody(body)).toThrow(/not supported here/);
			expect(() => parseSccBody(body)).toThrow(/Insert compendium reference/);
		}
	});

	test('a bare slug is refused — ds-scc takes full codes only (no cross-family guessing)', () => {
		expect(() => parseSccBody('panther')).toThrow(/`panther` is not a full SCC code/);
	});

	test('the D9 authoring example is itself a valid body (the insert command must not scaffold an error)', () => {
		expect(parseSccBody(sccExample)).toBe(KIT_CODE);
	});
});

describe('SC-149 baseForSccType — one element, every family', () => {
	test.each([
		['kit', 'kit'],
		['condition', 'condition'],
		['complication', 'complication'],
		['rule.combat', 'rule'],
		['monster.goblin.statblock', 'statblock'],
		['feature.fury.level-1', 'feature'],
		['monster.angulotl.featureblock', 'featureblock'],
	])('type %s renders through the %s element', (type, id) => {
		expect(baseForSccType(type)!.id).toBe(id);
	});

	test('a type no adapter claims has no renderer (error card, not a half-render)', () => {
		expect(baseForSccType('nonsense.unknown-type')).toBeUndefined();
		expect(baseForSccType('')).toBeUndefined();
	});
});

describe('SC-149 ds-scc end-to-end against real md-dse fixtures', () => {
	test('a kit code renders the kit card', async () => {
		const root = await render(KIT_CODE, [KIT_REL], 'legacy');
		expect(errorText(root)).toBe('');
		expect(root.getAttribute('data-dse-element')).toBe('scc');
		expect(root.querySelector('.dse-card__title')!.textContent).toBe('Panther');
	});

	test('a condition code renders the condition card (same block, different family)', async () => {
		const root = await render(`scc.v1:${CONDITION_CODE}`, [CONDITION_REL]);
		expect(errorText(root)).toBe('');
		expect(root.querySelector('.dse-card__title')!.textContent).toBe('Bleeding');
		expect(root.querySelector('.dse-card__badge--type')!.textContent).toBe('Condition');
	});

	test('a rule code renders the model-less generic card', async () => {
		const root = await render(RULE_CODE, [RULE_REL]);
		expect(errorText(root)).toBe('');
		expect(root.querySelector('.dse-card__title')!.textContent).toBe('Taking a Turn');
	});

	test('a statblock code renders the REAL statblock card, not a downgraded placeholder', async () => {
		const root = await render(GOBLIN_CODE, [GOBLIN_REL]);
		expect(errorText(root)).toBe('');
		const card = root.querySelector('.dse-sb') as HTMLElement;
		expect(card).not.toBeNull();
		expect(card.querySelector('.dse-head__primary--left')!.textContent).toBe('Goblin Stinker');
	});

	// The degrade ladder is RefUnwrapView's, unchanged by SC-149 — but a code that isn't
	// in the vault is the single most likely ds-scc failure, so pin that ds-scc reaches
	// the ladder at all rather than short-circuiting in its own strict parse. With the
	// default web-fallback setting on, an unresolvable-but-well-formed code becomes the
	// "not installed locally / view on steelcompendium.io" card, not an error card.
	test('a well-formed code that is not in the vault reaches the degrade ladder', async () => {
		const root = await render('mcdm.heroes.v1/kit/does-not-exist', [KIT_REL]);
		const web = root.querySelector('.dse-ref-web-card');
		expect(web).not.toBeNull();
		expect(web!.getAttribute('data-scc')).toBe('mcdm.heroes.v1/kit/does-not-exist');
	});

	// The other end of the ladder: no compendium at all (the state a fresh install is in).
	test('with no compendium wired, ds-scc says so instead of failing silently', async () => {
		const { deps } = makeCompendiumDeps();
		const host = makeHost('ds-scc');
		await new ElementPipeline({ ...deps, compendium: undefined }).run(sccElement, KIT_CODE, host);
		const root = host.containerEl.firstElementChild as HTMLElement;
		expect(errorText(root)).toContain('Sync compendium');
	});

	test('an inline-YAML body error-cards under the element name, and mounts no card', async () => {
		const root = await render('name: Homebrew Kit\nstamina_bonus: 6', [KIT_REL]);
		expect(errorText(root)).toContain(SCC_ELEMENT_NAME);
		expect(errorText(root)).toContain('must be a single SCC code');
		expect(root.querySelector('.dse-card')).toBeNull();
	});
});
