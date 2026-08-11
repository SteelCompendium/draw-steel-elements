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
const FEATURE_CODE = 'mcdm.heroes.v1/feature.fury.level-1/growing-ferocity';
const FEATURE_REL = 'feature/fury/level-1/growing-ferocity.md';
// SC-141 (landed): a REAL corpus ability file. Its frontmatter `type` is the LEAF of the
// SCC segment — `ability`, not `feature.ability.*` — which is the shape 621 of the corpus's
// files actually carry, and which no adapter claimed until SC-141 widened FEATURE_TYPE_RE.
const ABILITY_CODE = 'mcdm.heroes.v1/feature.ability.fury.level-1/hit-and-run';
const ABILITY_REL = 'feature/ability/fury/level-1/hit-and-run.md';
// SC-141 fix round (M2): a real dynamic-terrain file — ds-featureblock content whose
// frontmatter `type` is the ROOT of its segment (`dynamic-terrain`).
const TERRAIN_CODE = 'mcdm.monsters.v1/dynamic-terrain.mechanisms/pillar';
const TERRAIN_REL = 'dynamic-terrain/mechanisms/pillar.md';

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

/** SC-149 fix round (L-1): ds-scc presents refusals/unresolved references in the friendly
 *  `.dse-ref-notice` frame, never the framework's `<name>: failed to render (<stage>)`
 *  error card — so a test that still looked for `.dse-error-card` would silently pass on
 *  an empty string. Both are checked. */
function errorText(root: HTMLElement): string {
	expect(root.querySelector('.dse-error-card')).toBeNull();
	const card = root.querySelector('.dse-ref-notice');
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

	test('an inline SCC link names the code it already contains (fix round M-3)', () => {
		expect(() => parseSccBody(`[Panther](scc.v1:${KIT_CODE})`)).toThrow(/inline link/);
		expect(() => parseSccBody(`[Panther](scc.v1:${KIT_CODE})`)).toThrow(new RegExp(KIT_CODE.replace(/\./g, '\\.')));
	});

	test('a backticked or fenced code says to remove the backticks', () => {
		expect(() => parseSccBody(`\`${KIT_CODE}\``)).toThrow(/Remove the backticks/);
	});

	test('leading/trailing whitespace is tolerated; internal whitespace is not', () => {
		expect(parseSccBody(`\t ${KIT_CODE} \t`)).toBe(KIT_CODE);
		expect(() => parseSccBody('mcdm.heroes.v1/kit/ panther')).toThrow(/is not a full SCC code/);
	});

	// N-1: nothing forbids a one-character code segment (none exist in today's registry).
	test('a one-character trailing segment is a valid code', () => {
		expect(parseSccBody('mcdm.heroes.v1/kit/a')).toBe('mcdm.heroes.v1/kit/a');
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
		// SC-141's widened scopes reach ds-scc's renderer lookup for free — it keys on the
		// adapter alias, so a family that widens carries its view with it.
		['ability', 'feature'],
		['trait', 'feature'],
		['monster.angulotl.featureblock', 'featureblock'],
		['dynamic-terrain.mechanisms', 'featureblock'],
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
		expect(root.querySelector('.dse-card__title')!.textContent).toBe('Panther');
	});

	// SC-149 fix round, H-1: the pipeline stamps the BLOCK's element id before anything is
	// resolved, so ds-scc's output used to claim `data-dse-element="scc"` — which matches
	// none of the 84 element-scoped CSS rules and none of the preference selectors (those
	// pair a pref attribute WITH the element id). The root now names the family that
	// actually rendered. sccStyleParity.test.ts proves the CSS consequence; this pins the
	// mechanism, including that a FAILURE keeps the block's own id.
	test.each([
		[KIT_CODE, KIT_REL, 'kit'],
		[CONDITION_CODE, CONDITION_REL, 'condition'],
		[RULE_CODE, RULE_REL, 'rule'],
		[GOBLIN_CODE, GOBLIN_REL, 'statblock'],
		[ABILITY_CODE, ABILITY_REL, 'feature'],
		[TERRAIN_CODE, TERRAIN_REL, 'featureblock'],
	])('%s re-stamps data-dse-element to the resolved family', async (code, rel, id) => {
		const root = await render(code, [rel], 'legacy');
		expect(root.getAttribute('data-dse-element')).toBe(id);
	});

	test('a refused body keeps data-dse-element="scc" — an error is never styled as a statblock', async () => {
		const root = await render('name: Homebrew Kit\nstamina_bonus: 6', [KIT_REL]);
		expect(root.getAttribute('data-dse-element')).toBe('scc');
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

	// C1: the feature family through ds-scc renders the REAL feature view. Pinned as its
	// own end-to-end case because this family is the one whose scope moves: SC-141 widens
	// FEATURE_TYPE_RE to claim the corpus's `ability`/`trait` types, and every one of those
	// 716 codes reaches a view through exactly this path.
	test('a feature code renders the REAL feature card', async () => {
		const root = await render(FEATURE_CODE, [FEATURE_REL]);
		expect(errorText(root)).toBe('');
		expect(root.getAttribute('data-dse-element')).toBe('feature');
		const card = root.querySelector('.dse-feature') as HTMLElement;
		expect(card).not.toBeNull();
		expect(card.querySelector('.dse-head__primary--left')!.textContent).toBe('Growing Ferocity');
	});

	// SC-141 landed the scopes that make these two reachable AT ALL: before it, an
	// `ability`-typed file (621 in the corpus) and a `dynamic-terrain`-typed one (35) were
	// claimed by no adapter, so `model()` returned undefined and ds-scc would have shown
	// "found but not renderable — re-sync" against a perfectly good compendium. They are
	// pinned here through the PUBLIC element, on the real corpus files, because ds-scc is
	// now the only way a user references either of them.
	test('a real corpus ability file (type: ability) renders the REAL feature card', async () => {
		const root = await render(ABILITY_CODE, [ABILITY_REL]);
		expect(errorText(root)).toBe('');
		expect(root.getAttribute('data-dse-element')).toBe('feature');
		const card = root.querySelector('.dse-feature') as HTMLElement;
		expect(card).not.toBeNull();
		expect(card.querySelector('.dse-head__primary--left')!.textContent).toBe('Hit and Run');
	});

	test('a real dynamic-terrain file (type: dynamic-terrain) renders the REAL featureblock card', async () => {
		const root = await render(TERRAIN_CODE, [TERRAIN_REL]);
		expect(errorText(root)).toBe('');
		expect(root.getAttribute('data-dse-element')).toBe('featureblock');
		expect(root.querySelector('.dse-fb')).not.toBeNull();
		expect(root.textContent).toContain('Pillar');
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

	test('an inline-YAML body shows the notice card, mounts nothing, and names no stage', async () => {
		const root = await render('name: Homebrew Kit\nstamina_bonus: 6', [KIT_REL]);
		expect(errorText(root)).toContain('must be a single SCC code');
		expect(errorText(root)).toContain('Insert Draw Steel: compendium reference');
		expect(root.querySelector('.dse-card')).toBeNull();
		// L-1: no `<name>: failed to render (render)` jargon anywhere in the card.
		expect(errorText(root)).not.toContain('failed to render');
		expect(errorText(root)).not.toContain(SCC_ELEMENT_NAME);
	});

	// SC-149 fix round, M-3: bodies that are not valid YAML never reached the element at
	// all — the pipeline's parse stage error-carded them with the YAML parser's own words
	// ("Unexpected scalar at node end at line 1, column 10"). `parseHandlesRawBody` hands
	// them over. The inline-link case is the one that matters: it is exactly what the
	// insert modal's Shift action writes, one keystroke away.
	test.each([
		[
			'the insert modal\'s own inline-link output',
			`[Panther](scc.v1:${KIT_CODE})`,
			['inline link', KIT_CODE],
		],
		['a backticked code (how it appears in the docs)', `\`${KIT_CODE}\``, ['Remove the backticks']],
		// A pasted fence starts with a backtick, so it lands on the fence/backtick message —
		// which says the right thing for it ("no code fence around the code").
		['a pasted code fence', '```ds-scc\n' + KIT_CODE + '\n```', ['no code fence']],
		['a broken YAML flow sequence', 'name: [Panther', ['is not a full SCC code']],
	])('%s reaches the strict-body contract, not the YAML parser', async (_label, body, expected) => {
		const root = await render(body, [KIT_REL]);
		const text = errorText(root);
		for (const fragment of expected as string[]) expect(text).toContain(fragment);
		expect(text).not.toMatch(/line \d+, column \d+/);
	});

	test('a tab-indented code still resolves (leading whitespace is not a body shape)', async () => {
		const root = await render(`\t${KIT_CODE}`, [KIT_REL], 'legacy');
		expect(errorText(root)).toBe('');
		expect(root.getAttribute('data-dse-element')).toBe('kit');
	});
});
