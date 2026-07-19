// Plan 09 Task 5 (D2 §3.6) — the Feature element re-cast onto the D2 kit card grammar:
// kit cardHead (name heading + cost/ability-type right slots) + .dse-feature__meta +
// .dse-feature__flavor + a STATIC kit powerRollPanel (≤11 / 12-16 / 17+ / crit) + titled
// .dse-section panels + the [data-dse-act] action-type spine (Steel-only accent; the
// Legacy base maps every --dse-act-* to `none`, so the accent fails safe to monochrome).
//
// The renderer is src/elements/feature/renderFeature.ts — the REUSABLE feature grammar
// Task 6 (Statblock/Featureblock) consumes. It takes a caller-supplied renderMd callback
// (the element passes its view-parented this.renderMarkdown — the ML-1 fix) and never
// imports Obsidian's markdown renderer or app surface. The LEGACY sub-view tree
// (Features/FeatureView -> EffectView -> FeaturesView) stays untouched: Statblock +
// Featureblock still construct it directly until Task 6 switches them over.
//
// These tests replace Plan 07 Task 1's golden-DOM pin (which froze the legacy wrapper
// byte-for-byte) with kit-DOM + a11y + no-content-loss assertions.
import * as fs from 'fs';
import * as path from 'path';
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { createElementRegistry } from '../../../src/framework/registry';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { FeatureConfig } from '@model/FeatureConfig';
import { App, Plugin, MarkdownRenderer, makeFakeContext } from '../../mocks/obsidian';
import { featureElement } from '../../../src/elements/feature/definition';
import { FeatureElementView } from '../../../src/elements/feature/view';
import { RefUnwrapView } from '../../../src/elements/shared/RefUnwrapView';
import { styleGuardFindings } from '../kit/styleGuard';
import DrawSteelAdmonitionPlugin, { registerFrameworkElementDefinitions } from 'main';
import magmaTitan from '../../fixtures/feature/magma-titan.yaml';

const FT_ALIASES = ['ds-ft', 'ds-feat', 'ds-feature'] as const;

/** Header-heavy ability: every cardHead slot the feature grammar fills is present. */
const HEADER = `type: feature
feature_type: ability
name: Whip Strike
cost: Signature
ability_type: Villain Action 1
usage: Main action
`;

/** A feature whose effect nests further features — the recursion path the legacy
 *  EffectView -> FeaturesView -> FeatureView tree carried, preserved by renderFeature. */
const NESTED = `type: feature
feature_type: trait
name: Outer Feature
effects:
  - name: Outer Effect
    effect: Outer effect text.
    features:
      - type: feature
        feature_type: trait
        name: Inner Feature
        effects:
          - name: Inner Effect
            effect: Inner effect text.
`;

/** Every field the legacy FeatureView/EffectView rendered, in one block (the
 *  no-content-loss pin): name, cost, ability_type, flavor, keywords, usage, distance,
 *  target, trigger, named effect (+cost), all four power-roll tiers, nested feature. */
const FULL = `type: feature
feature_type: ability
name: Coverage Strike
cost: 5 Malice
ability_type: Villain Action 1
flavor: A sweeping flourish of steel.
keywords:
  - Attack
  - Weapon
usage: Main action
distance: Melee 1
target: One creature
trigger: A creature ends its turn adjacent to the target.
effects:
  - name: Effect
    effect: The primary effect text.
  - roll: Power Roll + Might
    tier1: Tier one outcome.
    tier2: Tier two outcome.
    tier3: Tier three outcome.
    crit: Crit outcome.
  - name: Special
    cost: 2 Malice
    effect: Special clause text.
  - name: Aftermath
    effect: Wrapper text.
    features:
      - type: feature
        feature_type: trait
        name: Inner Feature
        effects:
          - name: Inner Effect
            effect: Inner effect text.
`;

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-ft', lineStart: 0, lineEnd: 40 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-ft::0',
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

/** Real service instances, same convention as horizontal-rule.test.ts's makeDeps(). */
function makeDeps(): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	// D5 (Plan 14 Task 4): the view reads the Rolling catalog prefs — mount at
	// CATALOG DEFAULTS (rollingEnabled false ⇒ byte-identical DOM), the same
	// convention as statblock.test.ts's makeDeps.
	prefs.describe(DSE_PREF_DESCRIPTORS);
	const theme = createThemeService(prefs, plugin as any);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	const validation = createValidationService();
	const session = createSessionStore();
	return {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme,
		prefs,
		refs,
		validation,
		session,
		roll: createRollService(prefs),
	};
}

async function renderBlock(source: string, hostOverrides: Partial<BlockHost> = {}) {
	const deps = makeDeps();
	const pipeline = new ElementPipeline(deps);
	const host = makeHost(hostOverrides);
	await pipeline.run(featureElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { pipeline, host, root, deps };
}

describe('feature ElementDefinition (contract unchanged by the D2 redesign)', () => {
	test('id/name/aliases/shape match the preserved ds-ft/ds-feat/ds-feature contract; static, NO schema/serialize/resolveRefs', () => {
		expect(featureElement.id).toBe('feature');
		expect(featureElement.name).toBe('Feature');
		expect(featureElement.aliases).toEqual([...FT_ALIASES]);
		expect(featureElement.shape).toBe('static');
		expect(featureElement.schema).toBeUndefined();
		expect(featureElement.serialize).toBeUndefined();
		expect(featureElement.resolveRefs).toBeUndefined();
		expect(featureElement.autoResolveRefs).toBe(false);
		// The legacy FeatureProcessor armed a manual click shield — the pipeline's
		// default shield replaces it, so the definition must NOT opt out.
		expect(featureElement.noClickShield).toBeUndefined();
	});

	// D6 Task 4: featureElement is now withReference-wrapped, so parse() returns
	// RefOrInline<FeatureConfig> — {kind:'inline', model} for an inline YAML mapping
	// body (unchanged from here down: base.parse === FeatureConfig.readYaml still owns
	// the inline path verbatim).
	test('parse consumes the RAW block text (SDK YamlReader), NOT the pipeline pre-parsed data', () => {
		const wrapped = featureElement.parse(undefined, magmaTitan);
		expect(wrapped.kind).toBe('inline');
		if (wrapped.kind !== 'inline') throw new Error('expected inline');
		const model = wrapped.model;
		expect(model).toBeInstanceOf(FeatureConfig);
		expect(model.feature.name).toBe('Magma Titan');
		expect(model.feature.cost).toBe('9 Essence');
		expect(model.feature.keywords).toEqual(['Earth', 'Fire', 'Magic', 'Ranged', 'Void']);
		expect(model.feature.effects).toHaveLength(3);
	});

	test('parse also reads `indent` from the raw YAML (FeatureConfig.readYaml second parseYaml pass)', () => {
		const wrapped = featureElement.parse(undefined, magmaTitan + 'indent: 2\n');
		expect(wrapped.kind).toBe('inline');
		if (wrapped.kind !== 'inline') throw new Error('expected inline');
		expect(wrapped.model.indent).toBe(2);
	});

	// D6 Task 4: createView now returns a RefUnwrapView (the withReference wrapper) —
	// it mounts a REAL FeatureElementView underneath for an inline body (see the
	// "ties FeatureElementView to host.addChild" test below for proof the base view
	// still does the actual rendering).
	test('createView returns a RefUnwrapView (withReference wrapper)', () => {
		const deps = makeDeps();
		const host = makeHost();
		const cx = {
			app: deps.app,
			plugin: deps.plugin,
			settings: deps.settings,
			host,
			mode: host.mode,
			theme: deps.theme,
			prefs: deps.prefs,
			refs: deps.refs,
			session: deps.session,
		};
		expect(featureElement.createView(cx)).toBeInstanceOf(RefUnwrapView);
	});
});

describe('Plan 09 Task 5: feature re-cast onto the D2 kit card grammar (§3.6)', () => {
	test('cardHead: name is the heading (role="heading", aria-level 3); cost -> right eyebrow chip; ability_type -> right primary chip', async () => {
		const { root } = await renderBlock(HEADER);

		const head = root.querySelector('.dse-feature > .dse-head') as HTMLElement;
		expect(head).not.toBeNull();

		const name = head.querySelector('.dse-head__primary--left') as HTMLElement;
		expect(name.getAttribute('role')).toBe('heading');
		expect(name.getAttribute('aria-level')).toBe('3');
		expect(name.textContent).toBe('Whip Strike');

		expect(head.querySelector('.dse-head__eyebrow--right')!.textContent).toBe('Signature');
		expect(head.querySelector('.dse-head__primary--right')!.textContent).toBe('Villain Action 1');
	});

	test('SC-10 Task 2: cardHead left-eyebrow is the "Ability" kind-noun + a crest keyed to the main-action glyph (THEME-AGNOSTIC DOM — present regardless of theme)', async () => {
		const { root } = await renderBlock(HEADER);

		const head = root.querySelector('.dse-feature > .dse-head') as HTMLElement;
		expect(head.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('Ability');

		const crestEl = head.querySelector<HTMLElement>(':scope > .dse-crest');
		expect(crestEl).not.toBeNull();
		expect(crestEl!.hasClass('dse-crest--lg')).toBe(true);
		expect(crestEl!.querySelector('.dse-crest__glyph')!.getAttribute('data-icon')).toBe('sword');
	});

	test('SC-10 Task 2: a trait (no combat rigor) gets the "Trait" kind-noun + the trait crest glyph, matching its [data-dse-act="trait"] spine', async () => {
		const { root } = await renderBlock(NESTED); // outer: feature_type trait, no keywords/usage/distance/target

		const outer = root.querySelector('.dse-feature') as HTMLElement;
		expect(outer.getAttribute('data-dse-act')).toBe('trait');

		const head = outer.querySelector(':scope > .dse-head') as HTMLElement;
		expect(head.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('Trait');
		expect(head.querySelector(':scope > .dse-crest .dse-crest__glyph')!.getAttribute('data-icon')).toBe(
			'star',
		);
	});

	test('cardHead: omitted slots are GAPS — no ability_type means no right-primary element at all', async () => {
		const { root } = await renderBlock(magmaTitan);

		const head = root.querySelector('.dse-feature > .dse-head') as HTMLElement;
		expect(head.querySelector('.dse-head__primary--left')!.textContent).toBe('Magma Titan');
		expect(head.querySelector('.dse-head__eyebrow--right')!.textContent).toBe('9 Essence');
		expect(head.querySelector('.dse-head__primary--right')).toBeNull();
	});

	test('.dse-feature__meta: keyword/type/distance/target grid, labels as key spans, values verbatim', async () => {
		const { root } = await renderBlock(magmaTitan);

		const meta = root.querySelector('.dse-feature__meta') as HTMLElement;
		expect(meta).not.toBeNull();

		const cellText = (mod: string, part: 'key' | 'value') =>
			meta.querySelector(`.dse-feature__meta-cell--${mod} .dse-feature__meta-${part}`)!.textContent;

		expect(cellText('keywords', 'key')).toBe('Keywords');
		expect(cellText('keywords', 'value')).toBe('Earth, Fire, Magic, Ranged, Void');
		expect(cellText('type', 'key')).toBe('Type');
		expect(cellText('type', 'value')).toBe('Main action');
		expect(cellText('distance', 'key')).toBe('Distance');
		expect(cellText('distance', 'value')).toBe('Ranged 10');
		expect(cellText('target', 'key')).toBe('Target');
		expect(cellText('target', 'value')).toBe('One creature or object');
	});

	test('.dse-feature__flavor renders the italic flavor text', async () => {
		const { root } = await renderBlock(magmaTitan);
		expect(root.querySelector('.dse-feature__flavor')!.textContent).toContain(
			'Their body swells with lava, mud, and might',
		);
	});

	test('powerRollPanel: STATIC mode — kit .dse-pr with head + tier rows, NO radiogroup/radios/buttons', async () => {
		const { root } = await renderBlock(magmaTitan);

		const pr = root.querySelector('.dse-feature .dse-pr') as HTMLElement;
		expect(pr).not.toBeNull();
		expect(pr.querySelector('.dse-pr__head')!.textContent).toBe('Power Roll + Reason');

		const rows = pr.querySelectorAll('.dse-pr__row');
		expect(rows).toHaveLength(3);
		expect(rows[0].getAttribute('data-tier')).toBe('low');
		expect(rows[1].getAttribute('data-tier')).toBe('mid');
		expect(rows[2].getAttribute('data-tier')).toBe('high');
		expect(rows[0].querySelector('.dse-pr__badge-text')!.textContent).toBe('≤11');
		expect(rows[1].querySelector('.dse-pr__badge-text')!.textContent).toBe('12-16');
		expect(rows[2].querySelector('.dse-pr__badge-text')!.textContent).toBe('17+');
		expect(rows[0].querySelector('.dse-pr__text')!.textContent).toBe(
			'You teleport the target up to 4 squares.',
		);

		// Static: features are not selectable — no radio semantics, no controls.
		expect(pr.querySelector('[role="radiogroup"]')).toBeNull();
		expect(pr.querySelector('[role="radio"]')).toBeNull();
		expect(pr.querySelector('[aria-checked]')).toBeNull();
		expect(pr.querySelector('button')).toBeNull();
	});

	test('powerRollPanel: all four tiers render when crit is present (≤11 / 12-16 / 17+ / crit)', async () => {
		const { root } = await renderBlock(FULL);

		const pr = root.querySelector('.dse-feature .dse-pr') as HTMLElement;
		const rows = pr.querySelectorAll('.dse-pr__row');
		expect(rows).toHaveLength(4);
		expect(rows[3].getAttribute('data-tier')).toBe('crit');
		expect(rows[3].querySelector('.dse-pr__badge-text')!.textContent).toBe('crit');
		expect(rows[3].querySelector('.dse-pr__text')!.textContent).toBe('Crit outcome.');
	});

	test('powerRollPanel: tiers WITHOUT a roll line render rows but NO invented "Power Roll" head', async () => {
		const source = ['type: feature', 'feature_type: ability', 'name: Tiers Only', 'effects:', '  - tier1: One.', '    tier2: Two.', '    tier3: Three.'].join('\n');
		const { root } = await renderBlock(source);

		const pr = root.querySelector('.dse-pr') as HTMLElement;
		expect(pr.querySelectorAll('.dse-pr__row')).toHaveLength(3);
		expect(pr.querySelector('.dse-pr__head')).toBeNull();
	});

	test('powerRollPanel: a roll line that is not "Power Roll + X" renders VERBATIM in the head (no wording change)', async () => {
		const source = ['type: feature', 'feature_type: ability', 'name: Odd Roll', 'effects:', '  - roll: 2d10 + 3', '    tier1: One.'].join('\n');
		const { root } = await renderBlock(source);

		expect(root.querySelector('.dse-pr__head')!.textContent).toBe('2d10 + 3');
	});

	test('.dse-section: named effects become titled panels — title has NO baked-in colon, cost joins the title, body is the effect text', async () => {
		const { root } = await renderBlock(FULL);

		// :scope keeps the query on the TOP-LEVEL card — the nested inner feature has
		// direct-child sections of its own.
		const card = root.querySelector(':scope > .dse-feature') as HTMLElement;
		const sections = card.querySelectorAll(':scope > .dse-section');
		const titles = Array.from(sections).map((s) => s.querySelector('.dse-section__title')!.textContent);
		expect(titles).toEqual(['Trigger', 'Effect', 'Special (2 Malice)', 'Aftermath']);

		const effect = Array.from(sections).find(
			(s) => s.querySelector('.dse-section__title')!.textContent === 'Effect',
		)!;
		expect(effect.querySelector('.dse-section__body')!.textContent).toBe('The primary effect text.');
	});

	test('.dse-section: feature.trigger renders as a "Trigger" titled section before the effects', async () => {
		const { root } = await renderBlock(FULL);

		const trigger = root.querySelector('.dse-section--trigger') as HTMLElement;
		expect(trigger.querySelector('.dse-section__title')!.textContent).toBe('Trigger');
		expect(trigger.querySelector('.dse-section__body')!.textContent).toBe(
			'A creature ends its turn adjacent to the target.',
		);
	});

	test.each([
		['Main action', 'main'],
		['Maneuver', 'maneuver'],
		['Triggered action', 'triggered'],
		['Free triggered action', 'triggered'],
		['Move action', 'move'],
		['No action', 'none'],
	])('[data-dse-act]: usage %j -> data-dse-act=%j + the --dse-act element-set alias', async (usage, act) => {
		const source = ['type: feature', 'feature_type: ability', 'name: X', `usage: ${usage}`].join('\n');
		const { root } = await renderBlock(source);

		const card = root.querySelector('.dse-feature') as HTMLElement;
		expect(card.getAttribute('data-dse-act')).toBe(act);
		// Element-set alias (Steel-only accent): --dse-act -> var(--dse-act-<type>).
		// Legacy maps every --dse-act-* token to `none`, so the spine fails safe.
		expect(card.style.getPropertyValue('--dse-act')).toBe(`var(--dse-act-${act})`);
	});

	test('[data-dse-act]: a trait (feature_type: trait) maps to "trait"', async () => {
		const { root } = await renderBlock(NESTED);
		expect(root.querySelector('.dse-feature')!.getAttribute('data-dse-act')).toBe('trait');
	});

	test('[data-dse-act]: an unmappable action type sets NOTHING (accent fails safe, no alias); SC-10 Task 2: the crest likewise degrades to nothing (no icon to map), but the "Ability" kind-noun eyebrow still fills — it does not depend on the act spine resolving', async () => {
		const source = ['type: feature', 'feature_type: ability', 'name: X', 'usage: Gibberish ritual'].join('\n');
		const { root } = await renderBlock(source);

		const card = root.querySelector('.dse-feature') as HTMLElement;
		expect(card.hasAttribute('data-dse-act')).toBe(false);
		expect(card.style.getPropertyValue('--dse-act')).toBe('');

		expect(card.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('Ability');
		expect(card.querySelector('.dse-crest')).toBeNull();
	});

	test('nesting: effect.features recurse as .dse-feature cards inside .dse-feature__nested; nested heading aria-level bumps', async () => {
		const { root } = await renderBlock(NESTED);

		const outer = root.querySelector('.dse-feature') as HTMLElement;
		expect(outer.querySelector('.dse-head__primary--left')!.textContent).toBe('Outer Feature');

		// The nested list mounts INSIDE the owning effect's section (the legacy
		// EffectView kept nested features inside its container).
		const nested = outer.querySelector('.dse-section > .dse-feature__nested') as HTMLElement;
		expect(nested).not.toBeNull();

		const inner = nested.querySelector('.dse-feature') as HTMLElement;
		const innerName = inner.querySelector('.dse-head__primary--left') as HTMLElement;
		expect(innerName.textContent).toBe('Inner Feature');
		expect(innerName.getAttribute('aria-level')).toBe('4');
		expect(inner.querySelector('.dse-section__body')!.textContent).toBe('Inner effect text.');
	});

	test('indent: N in the block adds the legacy indent-N class to .dse-feature (F1 preserves it)', async () => {
		const { root } = await renderBlock(magmaTitan + 'indent: 1\n');
		expect(root.querySelector('.dse-feature.indent-1')).not.toBeNull();
	});

	test('NO content loss: every field the legacy FeatureView rendered appears in the new DOM', async () => {
		const { root } = await renderBlock(FULL);
		const text = root.textContent!;

		for (const expected of [
			'Coverage Strike', // name
			'5 Malice', // cost
			'Villain Action 1', // ability_type
			'A sweeping flourish of steel.', // flavor
			'Attack, Weapon', // keywords
			'Main action', // usage
			'Melee 1', // distance
			'One creature', // target
			'A creature ends its turn adjacent to the target.', // trigger
			'The primary effect text.', // named effect
			'Power Roll + Might', // roll
			'Tier one outcome.', // tier1
			'Tier two outcome.', // tier2
			'Tier three outcome.', // tier3
			'Crit outcome.', // crit
			'Special (2 Malice)', // effect name + cost
			'Special clause text.',
			'Inner Feature', // nested feature
			'Inner effect text.',
		]) {
			expect(text).toContain(expected);
		}
	});

	test('ML-1: ALL markdown renders through the view-parented renderMarkdown (component = the view, never the plugin)', async () => {
		const renderSpy = jest.spyOn(MarkdownRenderer, 'render');
		try {
			await renderBlock(FULL);

			expect(renderSpy.mock.calls.length).toBeGreaterThan(10);
			for (const call of renderSpy.mock.calls) {
				expect(call[3]).toBe('Note.md'); // host.sourcePath
				expect(call[4]).toBeInstanceOf(FeatureElementView); // lifecycle owner (ML-1)
			}
		} finally {
			renderSpy.mockRestore();
		}
	});

	test('static: rendering never writes back and mounts NO interactive controls', async () => {
		const { root, host } = await renderBlock(FULL);
		expect(host.replaceSource).not.toHaveBeenCalled();
		expect(root.querySelector('button, input, select, textarea, [tabindex]')).toBeNull();
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
	});

	test('root carries data-dse-element="feature" + data-dse-theme; the legacy wrapper classes are gone', async () => {
		const { root } = await renderBlock(magmaTitan);

		expect(root.getAttribute('data-dse-element')).toBe('feature');
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
		expect(root.querySelector(':scope > .dse-feature')).not.toBeNull();
		expect(root.querySelector('.ds-feature-ele-container')).toBeNull();
		expect(root.querySelector('.ds-feature-container')).toBeNull();
	});

	test('ties the created view to host.addChild (block lifecycle); a real FeatureElementView still renders underneath (D6 Task 4: wrapped in RefUnwrapView)', async () => {
		const addChild = jest.fn((child: unknown) => child);
		const { root } = await renderBlock(magmaTitan, { addChild } as Partial<BlockHost>);
		expect(addChild).toHaveBeenCalledTimes(1);
		expect(addChild.mock.calls[0][0]).toBeInstanceOf(RefUnwrapView);
		expect(root.querySelector(':scope > .dse-feature')).not.toBeNull();
	});

	test('pipeline default click shield replaces the legacy manual mousedown/pointerdown stop', async () => {
		const { root, host } = await renderBlock(magmaTitan);
		document.body.appendChild(host.containerEl);
		try {
			let bubbledToDocument = 0;
			const onDocMousedown = () => bubbledToDocument++;
			document.addEventListener('mousedown', onDocMousedown);
			try {
				const card = root.querySelector('.dse-feature') as HTMLElement;
				card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
				expect(bubbledToDocument).toBe(0);
			} finally {
				document.removeEventListener('mousedown', onDocMousedown);
			}
		} finally {
			document.body.removeChild(host.containerEl);
		}
	});

	test('malformed YAML renders the framework error card (stage "parse")', async () => {
		const { root } = await renderBlock('name: [unclosed');
		expect(root.getAttribute('data-dse-error-stage')).toBe('parse');
		expect(root.querySelector('.dse-error-card')).not.toBeNull();
		expect(root.querySelector('.dse-error-card-title')!.textContent).toContain('Feature: failed to render');
		expect(root.querySelector('.dse-feature')).toBeNull();
	});
});

describe('Plan 09 Task 5: reusable-renderer + CSS hygiene (the grammar Task 6 consumes)', () => {
	/** Comments explain what the code must NOT do — strip them so the negative import
	 *  scans below only see real code (same trick styleGuardFindings uses). */
	const stripComments = (src: string) =>
		src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

	test('renderFeature.ts: NO MarkdownRenderer/app import (markdown flows through the renderMd callback); type-only obsidian import; style guard clean', () => {
		const src = fs.readFileSync(
			path.join(__dirname, '../../../src/elements/feature/renderFeature.ts'),
			'utf8',
		);
		const code = stripComments(src);
		expect(code).not.toMatch(/MarkdownRenderer/);
		expect(code).not.toMatch(/\.app\b/);
		// The only obsidian coupling allowed is the type-only Component import.
		expect(code).toMatch(/import type \{[^}]*Component[^}]*\} from 'obsidian'/);
		expect(code).not.toMatch(/^import \{[^}]*\} from 'obsidian'/m);
		expect(styleGuardFindings(src)).toEqual([]);
	});

	test('view.ts: delegates to renderFeature, no longer constructs the legacy FeatureView; style guard clean', () => {
		const src = fs.readFileSync(path.join(__dirname, '../../../src/elements/feature/view.ts'), 'utf8');
		const code = stripComments(src);
		expect(code).toMatch(/renderFeature/);
		expect(code).not.toMatch(/drawSteelAdmonition\/Features\/FeatureView/);
		expect(styleGuardFindings(src)).toEqual([]);
	});

	test('legacy Features/FeatureView.ts is RETIRED (deleted by Task 10; element-dead since Task 6b)', () => {
		for (const file of [
			'../../../src/drawSteelAdmonition/Features/FeatureView.ts',
			'../../../src/drawSteelAdmonition/Features/FeaturesView.ts',
			'../../../src/drawSteelAdmonition/Features/EffectView.ts',
		] as const) {
			expect(fs.existsSync(path.join(__dirname, file))).toBe(false);
		}
		// Statblock — the legacy tree's last ELEMENT consumer — imports nothing from it.
		const statblock = fs.readFileSync(
			path.join(__dirname, '../../../src/elements/statblock/view.ts'),
			'utf8',
		);
		expect(statblock).not.toMatch(/from '@drawSteelAdmonition/);
	});

	test('CSS contract: .dse-feature grammar in styles-source.css — token-only spine via var(--dse-act), .dse-section title on --dse-heading; the legacy .ds-feature-* block is EVICTED (Task 10)', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

		// The action spine consumes the element-set alias, background-keyed so the
		// Legacy `none` token value fails safe to invisible.
		const spine = sheet.match(/\.dse-feature\[data-dse-act\]::before\s*\{[\s\S]*?\n\}/);
		expect(spine).not.toBeNull();
		expect(spine![0]).toMatch(/background:\s*var\(--dse-act/);

		const sectionTitle = sheet.match(/\.dse-section__title\s*\{[\s\S]*?\n\}/);
		expect(sectionTitle).not.toBeNull();
		expect(sectionTitle![0]).toMatch(/var\(--dse-heading\)/);

		expect(sheet).toMatch(/\.dse-feature__meta\s*\{/);
		expect(sheet).toMatch(/\.dse-feature__flavor\s*\{/);

		// The legacy .ds-feature-* CSS is dead: Task 6 moved its last consumers
		// (Statblock/Featureblock) onto this grammar and Task 10 evicted the block.
		expect(sheet).not.toMatch(/\.ds-feature-container\s*\{/);
	});
});

describe('T-5: registered EXACTLY ONCE — framework registry owns ds-ft*, RegisterElements.ts does not', () => {
	test('registerFrameworkElementDefinitions registers feature; every alias resolves to it', () => {
		const registry = createElementRegistry();
		registerFrameworkElementDefinitions(registry);

		expect(registry.get('feature')?.id).toBe('feature');
		for (const alias of FT_ALIASES) {
			expect(registry.get(alias)?.id).toBe('feature');
		}
	});

	test('through the REAL onload(): each ds-ft* alias gets exactly one registerMarkdownCodeBlockProcessor call (no legacy double-registration)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		const registerSpy = jest.spyOn(plugin, 'registerMarkdownCodeBlockProcessor');

		await plugin.onload();

		for (const alias of FT_ALIASES) {
			const calls = registerSpy.mock.calls.filter(([language]: [string]) => language === alias);
			expect(calls).toHaveLength(1);
		}
		expect(plugin.frameworkV2!.registry.get('ds-ft')?.id).toBe('feature');

		registerSpy.mockRestore();
	});

	test('rendering a ds-ft block through the wired processor produces the kit feature DOM (end-to-end)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		await plugin.onload();

		app.vault.setFile('Note.md', '```ds-ft\n' + magmaTitan.trimEnd() + '\n```\n');
		const ctx = makeFakeContext(app, 'Note.md');
		const handler = (plugin as any).registeredProcessors.get('ds-ft');

		await handler(magmaTitan, ctx.el, ctx);

		const root = ctx.el.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('feature');
		expect(root.querySelector('.dse-feature > .dse-head')).not.toBeNull();
		expect(root.querySelector('.dse-feature .dse-pr')).not.toBeNull();
	});
});
