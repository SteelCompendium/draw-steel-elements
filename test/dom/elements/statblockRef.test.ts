// test/dom/elements/statblockRef.test.ts — D6 Task 4 (spec §1, §7): ds-statblock /
// ds-feature / ds-featureblock wrapped with withReference at registration. The core
// claim under test: a by-SCC statblock renders BYTE-IDENTICAL DOM to the equivalent
// inline block, because CompendiumIndex.getEntity().model() dispatches through the
// SAME TYPE_ADAPTERS entry (StatblockConfig.readYaml over the extracted ds-sb block
// TEXT) that the inline path already used. Bare-slug sugar is scoped per element by
// its `sccType` (statblock: /statblock$/, feature: /^feature($|\.)/, featureblock:
// /featureblock$/), and the legacy `@path`/`[[wikilink]]` whole-block forms must
// still resolve exactly as before wrapping.
import { ElementPipeline } from '@/framework/pipeline';
import { statblockElement } from '@/elements/statblock/definition';
import { featureElement } from '@/elements/feature/definition';
import { featureblockElement } from '@/elements/featureblock/definition';
import { makeHost, makeCompendiumDeps, loadMdDseFixture, extractDsBlockText } from './_refHarness';

const GOBLIN_CODE = 'mcdm.monsters.v1/monster.goblin.statblock/goblin-stinker';
const GOBLIN_REL = 'monster/goblin/statblock/goblin-stinker.md';
const FEATURE_CODE = 'mcdm.heroes.v1/feature.fury.level-1/growing-ferocity';
const FEATURE_REL = 'feature/fury/level-1/growing-ferocity.md';
const KIT_REL = 'kit/panther.md';

/** Power-roll views mint `dse-pr-<N>-head` ids off a MODULE-LEVEL counter (unrelated
 *  to D6/Task 4) — rendering the same fixture twice in one test via two separate
 *  pipeline.run() calls advances that counter between the two renders, so a raw
 *  innerHTML diff would spuriously fail on the id suffix alone. Normalize it away
 *  before comparing; every other byte is asserted verbatim. */
function normalizeIds(html: string): string {
	return html.replace(/dse-pr-\d+-head/g, 'dse-pr-N-head');
}

/** Structural fingerprint of a rendered `.dse-sb` card — title, org/role line, EV,
 *  feature count — used to compare the by-SCC render against the inline one without
 *  relying on full-innerHTML byte equality (both DO happen to match byte-for-byte
 *  here since both paths run the exact same StatblockConfig.readYaml + view, but the
 *  brief's own key-structure list is the more resilient assertion). */
function sbFingerprint(root: HTMLElement) {
	const card = root.querySelector('.dse-sb') as HTMLElement;
	const head = card.querySelector('.dse-head') as HTMLElement;
	return {
		errorCards: root.querySelectorAll('.dse-error-card').length,
		title: head.querySelector('.dse-head__primary--left')!.textContent,
		orgRole: head.querySelector('.dse-head__primary--right')!.textContent,
		ev: head.querySelector('.dse-head__deck--right')!.textContent,
		featureCount: card.querySelectorAll('.dse-feature__nested > .dse-feature').length,
	};
}

describe('D6 Task 4: ds-statblock wrapped with withReference (spec §1, §7)', () => {
	test('by-SCC ref renders the SAME DOM as the equivalent inline ds-statblock (byte-identical innerHTML)', async () => {
		const { vault, deps } = makeCompendiumDeps();
		const content = loadMdDseFixture(vault, GOBLIN_REL);
		const inlineBody = extractDsBlockText(content);

		const refHost = makeHost();
		await new ElementPipeline(deps).run(statblockElement, `scc.v1:${GOBLIN_CODE}`, refHost);
		const refRoot = refHost.containerEl.firstElementChild as HTMLElement;

		const inlineHost = makeHost();
		await new ElementPipeline(deps).run(statblockElement, inlineBody, inlineHost);
		const inlineRoot = inlineHost.containerEl.firstElementChild as HTMLElement;

		expect(refRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(inlineRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(normalizeIds(refRoot.querySelector('.dse-sb')!.innerHTML)).toBe(
			normalizeIds(inlineRoot.querySelector('.dse-sb')!.innerHTML),
		);

		const fp = sbFingerprint(refRoot);
		expect(fp.title).toBe('Goblin Stinker');
		expect(fp.orgRole).toBe('Horde Controller');
		expect(fp.ev).toBe('EV 3');
		expect(fp.featureCount).toBe(3);
		expect(fp).toEqual(sbFingerprint(inlineRoot));
	});

	test('bare slug scoped to the statblock family: "goblin-stinker" resolves the same as the full code', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, GOBLIN_REL);

		const host = makeHost();
		await new ElementPipeline(deps).run(statblockElement, 'goblin-stinker', host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(sbFingerprint(root).title).toBe('Goblin Stinker');
	});

	test('a bare slug scoped to a DIFFERENT type family (feature, not statblock) does not match under ds-statblock', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, GOBLIN_REL);
		loadMdDseFixture(vault, FEATURE_REL);

		const host = makeHost();
		await new ElementPipeline(deps).run(statblockElement, 'growing-ferocity', host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		const card = root.querySelector('.dse-error-card-message');
		expect(card?.textContent).toContain('No compendium entry matches');
		expect(card?.textContent).toContain('growing-ferocity');
	});

	// Fix round 1 (Low-Medium, task-4-review.md finding 2): strengthened from a coarse
	// sbFingerprint-only compare to the SAME full innerHTML byte-equality the by-SCC test
	// above uses — goblin-stinker.md is the richest real statblock fixture (quoted
	// numeric strings `ev: "3"`/`stamina: "10"`, emoji icons, apostrophes inside a
	// smart-quoted effect string, markdown links), so this is the strongest available
	// regression guard against `resolveLegacyRef`'s YAML round-trip corrupting content
	// the coarse fingerprint (title/org-role/EV/feature-count) would never catch.
	test('@path whole-block ref still resolves (legacy form unchanged by wrapping)', async () => {
		const { vault, deps } = makeCompendiumDeps();
		const content = loadMdDseFixture(vault, GOBLIN_REL, 'Homebrew/GoblinStinker.md');
		const inlineBody = extractDsBlockText(content);

		const refHost = makeHost();
		await new ElementPipeline(deps).run(statblockElement, '@Homebrew/GoblinStinker', refHost);
		const refRoot = refHost.containerEl.firstElementChild as HTMLElement;

		const inlineHost = makeHost();
		await new ElementPipeline(deps).run(statblockElement, inlineBody, inlineHost);
		const inlineRoot = inlineHost.containerEl.firstElementChild as HTMLElement;

		expect(refRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(normalizeIds(refRoot.querySelector('.dse-sb')!.innerHTML)).toBe(
			normalizeIds(inlineRoot.querySelector('.dse-sb')!.innerHTML),
		);
		expect(sbFingerprint(refRoot)).toEqual(sbFingerprint(inlineRoot));
	});

	test('[[wikilink]] whole-block ref still resolves (legacy form unchanged by wrapping)', async () => {
		const { vault, deps } = makeCompendiumDeps();
		const content = loadMdDseFixture(vault, GOBLIN_REL, 'Bestiary/Goblin Stinker.md');
		const inlineBody = extractDsBlockText(content);

		const refHost = makeHost();
		await new ElementPipeline(deps).run(statblockElement, '[[Goblin Stinker]]', refHost);
		const refRoot = refHost.containerEl.firstElementChild as HTMLElement;

		const inlineHost = makeHost();
		await new ElementPipeline(deps).run(statblockElement, inlineBody, inlineHost);
		const inlineRoot = inlineHost.containerEl.firstElementChild as HTMLElement;

		expect(refRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(normalizeIds(refRoot.querySelector('.dse-sb')!.innerHTML)).toBe(
			normalizeIds(inlineRoot.querySelector('.dse-sb')!.innerHTML),
		);
		expect(sbFingerprint(refRoot)).toEqual(sbFingerprint(inlineRoot));
	});
});

describe('D6 Task 4: ds-feature wrapped with withReference (spec §1, §7)', () => {
	test('by-SCC ref renders the same DOM as the equivalent inline ds-feature', async () => {
		const { vault, deps } = makeCompendiumDeps();
		const content = loadMdDseFixture(vault, FEATURE_REL);
		const inlineBody = extractDsBlockText(content);

		const refHost = makeHost('ds-feature');
		await new ElementPipeline(deps).run(featureElement, `scc.v1:${FEATURE_CODE}`, refHost);
		const refRoot = refHost.containerEl.firstElementChild as HTMLElement;

		const inlineHost = makeHost('ds-feature');
		await new ElementPipeline(deps).run(featureElement, inlineBody, inlineHost);
		const inlineRoot = inlineHost.containerEl.firstElementChild as HTMLElement;

		expect(refRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(normalizeIds(refRoot.querySelector('.dse-feature')!.innerHTML)).toBe(
			normalizeIds(inlineRoot.querySelector('.dse-feature')!.innerHTML),
		);
		expect(refRoot.querySelector('.dse-head__primary--left')!.textContent).toBe('Growing Ferocity');
	});

	test('a bare slug scoped to a DIFFERENT type family (kit, not feature) does not match under ds-feature', async () => {
		const { vault, deps } = makeCompendiumDeps();
		loadMdDseFixture(vault, KIT_REL);
		loadMdDseFixture(vault, FEATURE_REL);

		const host = makeHost('ds-feature');
		await new ElementPipeline(deps).run(featureElement, 'panther', host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		const card = root.querySelector('.dse-error-card-message');
		expect(card?.textContent).toContain('No compendium entry matches');
		expect(card?.textContent).toContain('panther');
	});

	// Fix round 1 (Medium, task-4-review.md finding 1): closes the gap the review
	// flagged — `FeatureConfig.readYaml` routes through the SDK's own `YamlReader`
	// (unlike `StatblockConfig.readYaml`'s direct `parseYaml`), so it is the path most
	// exposed to `resolveLegacyRef`'s round-trip and was previously unverified
	// end-to-end. growing-ferocity.md is the richest real feature fixture: a
	// multi-paragraph literal-block-scalar (`|-`) effect containing TWO full embedded
	// markdown tables plus inline scc.v1: links — exactly the shape most likely to be
	// mangled by a lossy re-serialization.
	test('@path whole-block ref still resolves (legacy form unchanged by wrapping)', async () => {
		const { vault, deps } = makeCompendiumDeps();
		const content = loadMdDseFixture(vault, FEATURE_REL, 'Homebrew/GrowingFerocity.md');
		const inlineBody = extractDsBlockText(content);

		const refHost = makeHost('ds-feature');
		await new ElementPipeline(deps).run(featureElement, '@Homebrew/GrowingFerocity', refHost);
		const refRoot = refHost.containerEl.firstElementChild as HTMLElement;

		const inlineHost = makeHost('ds-feature');
		await new ElementPipeline(deps).run(featureElement, inlineBody, inlineHost);
		const inlineRoot = inlineHost.containerEl.firstElementChild as HTMLElement;

		expect(refRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(normalizeIds(refRoot.querySelector('.dse-feature')!.innerHTML)).toBe(
			normalizeIds(inlineRoot.querySelector('.dse-feature')!.innerHTML),
		);
		expect(refRoot.querySelector('.dse-head__primary--left')!.textContent).toBe('Growing Ferocity');
	});

	test('[[wikilink]] whole-block ref still resolves (legacy form unchanged by wrapping)', async () => {
		const { vault, deps } = makeCompendiumDeps();
		const content = loadMdDseFixture(vault, FEATURE_REL, 'Bestiary/Growing Ferocity.md');
		const inlineBody = extractDsBlockText(content);

		const refHost = makeHost('ds-feature');
		await new ElementPipeline(deps).run(featureElement, '[[Growing Ferocity]]', refHost);
		const refRoot = refHost.containerEl.firstElementChild as HTMLElement;

		const inlineHost = makeHost('ds-feature');
		await new ElementPipeline(deps).run(featureElement, inlineBody, inlineHost);
		const inlineRoot = inlineHost.containerEl.firstElementChild as HTMLElement;

		expect(refRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(normalizeIds(refRoot.querySelector('.dse-feature')!.innerHTML)).toBe(
			normalizeIds(inlineRoot.querySelector('.dse-feature')!.innerHTML),
		);
		expect(refRoot.querySelector('.dse-head__primary--left')!.textContent).toBe('Growing Ferocity');
	});
});

describe('D6 Task 4: ds-featureblock wrapped with withReference (spec §1, §7)', () => {
	const FB_CODE = 'mcdm.monsters.v1/monster.angulotl.featureblock/angulotl-malice';
	const FB_PATH = 'DS Compendium/monster/angulotl/featureblock/angulotl-malice.md';
	// Synthetic fixture (no md-dse fixture file ships for featureblock yet): a
	// minimal but real frontmatter + ds-fb block, structurally identical to what a
	// synced compendium file looks like (F2 OD-1 shape) for the other two families.
	// Fix round 1 (Medium, finding 1): enriched to mirror the SAME fidelity-risk shapes
	// the reviewer's throwaway checks exercised on goblin-stinker.md/growing-ferocity.md
	// — a quoted numeric string (`ev: "3"`), an emoji icon, an apostrophe inside a
	// single-quoted YAML scalar, and a multi-paragraph literal-block-scalar (`|-`) effect
	// with an embedded markdown table — since no real md-dse featureblock fixture exists
	// on disk to reuse directly.
	const FB_CONTENT = `---
scc: ${FB_CODE}
type: monster.angulotl.featureblock
source: mcdm.monsters.v1
item_name: Angulotl Malice
name: Angulotl Malice
---

\`\`\`ds-featureblock
type: featureblock
featureblock_type: Malice Features
name: Angulotl Malice
ev: "3"
features:
  - type: feature
    feature_type: trait
    name: Leapfrog
    icon: ⭐️
    cost: 3 Malice
    effects:
      - effect: 'The angulotl doesn''t provoke [opportunity attacks](scc.v1:mcdm.heroes.v1/rule.combat/opportunity-attack) by moving through the swamp''s murk.'
  - type: feature
    feature_type: ability
    name: Swamp's Grasp
    icon: 🐸
    cost: 5 Malice
    effects:
      - effect: |-
          The angulotl's tongue lashes out, dragging a foe through the mire. This benefit lasts until the end of the angulotl's next turn.

          | Distance | Benefit |
          |----------|---------|
          | 1        | The target is [slid](scc.v1:mcdm.heroes.v1/movement/forced-movement) 1 square. |
          | 3        | The target is [slid](scc.v1:mcdm.heroes.v1/movement/forced-movement) 3 squares and knocked [prone](scc.v1:mcdm.heroes.v1/condition/prone). |
\`\`\`
`;

	test('by-SCC ref renders the same DOM as the equivalent inline ds-featureblock', async () => {
		const { vault, deps } = makeCompendiumDeps();
		(vault as any).setFile(FB_PATH, FB_CONTENT);
		const inlineBody = extractDsBlockText(FB_CONTENT);

		const refHost = makeHost('ds-featureblock');
		await new ElementPipeline(deps).run(featureblockElement, `scc.v1:${FB_CODE}`, refHost);
		const refRoot = refHost.containerEl.firstElementChild as HTMLElement;

		const inlineHost = makeHost('ds-featureblock');
		await new ElementPipeline(deps).run(featureblockElement, inlineBody, inlineHost);
		const inlineRoot = inlineHost.containerEl.firstElementChild as HTMLElement;

		expect(refRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(normalizeIds(refRoot.querySelector('.dse-fb')!.innerHTML)).toBe(
			normalizeIds(inlineRoot.querySelector('.dse-fb')!.innerHTML),
		);
		expect(refRoot.querySelector('.dse-head__primary--left')!.textContent).toBe('Angulotl Malice');
	});

	test('bare slug scoped to the featureblock family resolves the full code', async () => {
		const { vault, deps } = makeCompendiumDeps();
		(vault as any).setFile(FB_PATH, FB_CONTENT);

		const host = makeHost('ds-featureblock');
		await new ElementPipeline(deps).run(featureblockElement, 'angulotl-malice', host);
		const root = host.containerEl.firstElementChild as HTMLElement;

		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(root.querySelector('.dse-head__primary--left')!.textContent).toBe('Angulotl Malice');
	});

	// Fix round 1 (Medium, task-4-review.md finding 1): closes the same gap as the
	// ds-feature block above — `FeatureblockConfig.readYaml` also routes through the
	// SDK's `YamlReader`, not `StatblockConfig.readYaml`'s direct `parseYaml`, and was
	// previously unverified end-to-end for the legacy `@path`/`[[wikilink]]` forms.
	// FB_CONTENT above carries the same fidelity-risk shapes (quoted numeric string,
	// emoji, apostrophes, multi-paragraph literal-block effect with an embedded table).
	test('@path whole-block ref still resolves (legacy form unchanged by wrapping)', async () => {
		const { vault, deps } = makeCompendiumDeps();
		(vault as any).setFile('Homebrew/AngulotlMalice.md', FB_CONTENT);
		const inlineBody = extractDsBlockText(FB_CONTENT);

		const refHost = makeHost('ds-featureblock');
		await new ElementPipeline(deps).run(featureblockElement, '@Homebrew/AngulotlMalice', refHost);
		const refRoot = refHost.containerEl.firstElementChild as HTMLElement;

		const inlineHost = makeHost('ds-featureblock');
		await new ElementPipeline(deps).run(featureblockElement, inlineBody, inlineHost);
		const inlineRoot = inlineHost.containerEl.firstElementChild as HTMLElement;

		expect(refRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(normalizeIds(refRoot.querySelector('.dse-fb')!.innerHTML)).toBe(
			normalizeIds(inlineRoot.querySelector('.dse-fb')!.innerHTML),
		);
		expect(refRoot.querySelector('.dse-head__primary--left')!.textContent).toBe('Angulotl Malice');
	});

	test('[[wikilink]] whole-block ref still resolves (legacy form unchanged by wrapping)', async () => {
		const { vault, deps } = makeCompendiumDeps();
		(vault as any).setFile('Bestiary/Angulotl Malice.md', FB_CONTENT);
		const inlineBody = extractDsBlockText(FB_CONTENT);

		const refHost = makeHost('ds-featureblock');
		await new ElementPipeline(deps).run(featureblockElement, '[[Angulotl Malice]]', refHost);
		const refRoot = refHost.containerEl.firstElementChild as HTMLElement;

		const inlineHost = makeHost('ds-featureblock');
		await new ElementPipeline(deps).run(featureblockElement, inlineBody, inlineHost);
		const inlineRoot = inlineHost.containerEl.firstElementChild as HTMLElement;

		expect(refRoot.querySelectorAll('.dse-error-card')).toHaveLength(0);
		expect(normalizeIds(refRoot.querySelector('.dse-fb')!.innerHTML)).toBe(
			normalizeIds(inlineRoot.querySelector('.dse-fb')!.innerHTML),
		);
		expect(refRoot.querySelector('.dse-head__primary--left')!.textContent).toBe('Angulotl Malice');
	});
});
