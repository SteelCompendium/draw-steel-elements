// Plan 09 Task 6a (D2 §3.7) — the Featureblock element re-cast onto the D2 kit card
// grammar: kit cardHead (§3.7 fill: left-eyebrow = kind-noun, name heading, Level →
// right eyebrow chip, role/category → right primary, EV → right deck) + role tint via
// [data-dse-role] (the element maps --dse-role: var(--dse-role-<role>) from the SDK
// featureblock_type; unmapped → NO attribute/alias, fails safe to monochrome) +
// .dse-fb__flavor + the .dse-fb__stats loose-stat header ([data-dse-fb-stats]) +
// .dse-fb__band--adv (Level>0 advancement band, mirrors the site) + the feature list
// through Task 5's renderFeatureList (shared .dse-feature/.dse-pr grammar).
//
// These tests replace Plan 07 Task 2's golden-DOM pin (which froze the legacy
// FeatureblockView wrapper byte-for-byte) with kit-DOM + a11y + no-content-loss
// assertions. The legacy sub-view tree (FeatureblockView -> HeaderView /
// FeatureblockStatsView / FeaturesView) stays in the codebase UNTOUCHED — Statblock
// (T6b) still constructs several of those builders — but featureblock no longer
// renders through it.
import * as fs from 'fs';
import * as path from 'path';
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { createElementRegistry } from '../../../src/framework/registry';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { FeatureblockConfig } from '@model/FeatureblockConfig';
import { App, Plugin, MarkdownRenderer, makeFakeContext } from '../../mocks/obsidian';
import { featureblockElement } from '../../../src/elements/featureblock/definition';
import { FeatureblockElementView } from '../../../src/elements/featureblock/view';
import { styleGuardFindings } from '../kit/styleGuard';
import DrawSteelAdmonitionPlugin, { registerFrameworkElementDefinitions } from 'main';
import angulotlMalice from '../../fixtures/featureblock/angulotl-malice.yaml';

const FB_ALIASES = ['ds-fb', 'ds-featureblock'] as const;

/** A featureblock with the full stat surface (level/ev in the head, stamina/size +
 *  named stats in the .dse-fb__stats header) — the angulotl fixture has none of these,
 *  so this pins the stats path too. */
const WITH_STATS = `type: featureblock
featureblock_type: Fixture
name: Bloodstone of Yendral
level: 2
ev: "6"
stamina: "30"
size: "2"
stats:
  - name: Speed
    value: "0"
  - name: Stability
    value: "3"
  - name: Free Strike
    value: "2"
features:
  - type: feature
    feature_type: trait
    name: Hungering Pulse
    effects:
      - effect: Each enemy within 2 squares takes 2 corruption damage.
`;

/** A role-carrying featureblock_type ("Hazard Hexer" → hexer) — the [data-dse-role]
 *  tint path + the §3.7 right-primary role/category slot. */
const WITH_ROLE = `type: featureblock
featureblock_type: Hazard Hexer
name: Corrosive Pit
level: 2
ev: "6"
features:
  - type: feature
    feature_type: trait
    name: Dissolve
    effects:
      - effect: Acid sprays each adjacent creature.
`;

/** Features carrying a Level > 0 group into the .dse-fb__band--adv advancement band
 *  (mirrors the site's fixture/retainer advancement tiers). `level` is an untyped
 *  extra field the SDK reader preserves on the Feature object. */
const WITH_ADVANCEMENT = `type: featureblock
featureblock_type: Fixture
name: Tiered Idol
features:
  - type: feature
    feature_type: trait
    name: Base Glow
    effects:
      - effect: Sheds light 2.
  - type: feature
    feature_type: trait
    name: Blinding Flare
    level: 3
    effects:
      - effect: Each enemy within 3 squares is dazzled.
  - type: feature
    feature_type: trait
    name: Searing Beam
    level: 3
    effects:
      - effect: One enemy within 5 squares takes 5 fire damage.
  - type: feature
    feature_type: trait
    name: Solar Crown
    level: 6
    effects:
      - effect: Allies within 2 squares gain an edge.
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
		getBlockInfo: () => ({ language: 'ds-fb', lineStart: 0, lineEnd: 40 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-fb::0',
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

/** Real service instances, same convention as feature.test.ts's makeDeps(). */
function makeDeps(): ElementPipelineDeps {
	const app = new App();
	const plugin = new Plugin(app);
	const theme = createThemeService();
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
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
	};
}

async function renderFeatureblock(source: string, hostOverrides: Partial<BlockHost> = {}) {
	const deps = makeDeps();
	const pipeline = new ElementPipeline(deps);
	const host = makeHost(hostOverrides);
	await pipeline.run(featureblockElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { pipeline, host, root, deps };
}

describe('featureblock ElementDefinition (contract unchanged by the D2 redesign)', () => {
	test('id/name/aliases/shape match the preserved ds-fb/ds-featureblock contract; static, NO schema/serialize/resolveRefs', () => {
		expect(featureblockElement.id).toBe('featureblock');
		expect(featureblockElement.name).toBe('Featureblock');
		expect(featureblockElement.aliases).toEqual([...FB_ALIASES]);
		expect(featureblockElement.shape).toBe('static');
		expect(featureblockElement.schema).toBeUndefined();
		expect(featureblockElement.serialize).toBeUndefined();
		expect(featureblockElement.resolveRefs).toBeUndefined();
		expect(featureblockElement.autoResolveRefs).toBe(false);
		// The legacy FeatureblockProcessor armed a manual click shield — the pipeline's
		// default shield replaces it, so the definition must NOT opt out.
		expect(featureblockElement.noClickShield).toBeUndefined();
	});

	test('parse consumes the RAW block text (SDK YamlReader), NOT the pipeline pre-parsed data', () => {
		// `data` is deliberately garbage: only `raw` carries the block. FeatureblockConfig
		// .readYaml = Featureblock.read(new YamlReader(...), raw) — an SDK text reader.
		const model = featureblockElement.parse(undefined, angulotlMalice);
		expect(model).toBeInstanceOf(FeatureblockConfig);
		expect(model.featureblock.name).toBe('Angulotl Malice');
		expect(model.featureblock.featureblock_type).toBe('Malice Features');
		expect(model.featureblock.flavor).toContain('you can spend Malice');
		expect(model.featureblock.features).toHaveLength(3);
		expect(model.featureblock.features.map((f) => f.name)).toEqual([
			'Leapfrog',
			'Resonating Croak',
			'Rainfall',
		]);
	});

	test('createView returns a FeatureblockElementView', () => {
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
		expect(featureblockElement.createView(cx)).toBeInstanceOf(FeatureblockElementView);
	});
});

describe('Plan 09 Task 6a: featureblock re-cast onto the D2 kit card grammar (§3.7)', () => {
	test('root carries data-dse-element="featureblock" + data-dse-theme; the .dse-fb card replaces the legacy wrapper classes', async () => {
		const { root } = await renderFeatureblock(angulotlMalice);

		expect(root.getAttribute('data-dse-element')).toBe('featureblock');
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
		expect(root.querySelector(':scope > .dse-fb')).not.toBeNull();
		// The legacy FeatureblockView DOM is fully retired for this element.
		expect(root.querySelector('.ds-fb-container')).toBeNull();
		expect(root.querySelector('.ds-fb-header')).toBeNull();
		expect(root.querySelector('.ds-header-container')).toBeNull();
		expect(root.querySelector('.ds-fb-stats')).toBeNull();
		expect(root.querySelector('.ds-feature-container')).toBeNull();
	});

	test('cardHead (§3.7): name is the heading (role="heading", aria-level 2); Level → right eyebrow chip; EV → right deck chip', async () => {
		const { root } = await renderFeatureblock(WITH_STATS);

		const head = root.querySelector('.dse-fb > .dse-head') as HTMLElement;
		expect(head).not.toBeNull();

		const name = head.querySelector('.dse-head__primary--left') as HTMLElement;
		expect(name.getAttribute('role')).toBe('heading');
		expect(name.getAttribute('aria-level')).toBe('2');
		expect(name.textContent).toBe('Bloodstone of Yendral');

		expect(head.querySelector('.dse-head__eyebrow--right')!.textContent).toBe('Level 2');
		expect(head.querySelector('.dse-head__deck--right')!.textContent).toBe('EV 6');
	});

	test('cardHead (§3.7): a role-less featureblock_type is the KIND-NOUN → left eyebrow; right primary stays a gap', async () => {
		const { root } = await renderFeatureblock(angulotlMalice);

		const head = root.querySelector('.dse-fb > .dse-head') as HTMLElement;
		expect(head.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('Malice Features');
		expect(head.querySelector('.dse-head__primary--left')!.textContent).toBe('Angulotl Malice');
		// Omitted slots are GAPS (cardHead contract) — no invented placeholder.
		expect(head.querySelector('.dse-head__primary--right')).toBeNull();
		expect(head.querySelector('.dse-head__eyebrow--right')).toBeNull(); // no level
		expect(head.querySelector('.dse-head__deck--right')).toBeNull(); // no EV
	});

	test('cardHead (§3.7): a ROLE-carrying featureblock_type is the role/category → right primary, verbatim; left eyebrow stays a gap', async () => {
		const { root } = await renderFeatureblock(WITH_ROLE);

		const head = root.querySelector('.dse-fb > .dse-head') as HTMLElement;
		expect(head.querySelector('.dse-head__primary--right')!.textContent).toBe('Hazard Hexer');
		expect(head.querySelector('.dse-head__eyebrow--left')).toBeNull();
		expect(head.querySelector('.dse-head__eyebrow--right')!.textContent).toBe('Level 2');
	});

	test('[data-dse-role]: the role word in featureblock_type sets the attribute + the --dse-role element-set alias', async () => {
		const { root } = await renderFeatureblock(WITH_ROLE);

		const card = root.querySelector('.dse-fb') as HTMLElement;
		expect(card.getAttribute('data-dse-role')).toBe('hexer');
		// Element-set alias: --dse-role -> var(--dse-role-<role>). Legacy maps every
		// --dse-role-* token to the muted grey, so the tint fails safe to monochrome.
		expect(card.style.getPropertyValue('--dse-role')).toBe('var(--dse-role-hexer)');
	});

	test('[data-dse-role]: an unmapped featureblock_type sets NOTHING (grey/monochrome fallback, no alias)', async () => {
		const { root } = await renderFeatureblock(angulotlMalice);

		const card = root.querySelector('.dse-fb') as HTMLElement;
		expect(card.hasAttribute('data-dse-role')).toBe(false);
		expect(card.style.getPropertyValue('--dse-role')).toBe('');
	});

	test('.dse-fb__flavor renders the flavor markdown', async () => {
		const { root } = await renderFeatureblock(angulotlMalice);
		expect(root.querySelector('.dse-fb > .dse-fb__flavor')!.textContent).toContain(
			'you can spend Malice to activate',
		);
	});

	test('.dse-fb__stats: stamina/size then the named stats as label/value cells, verbatim, colon CSS-owned; [data-dse-fb-stats="grid"] on the card', async () => {
		const { root } = await renderFeatureblock(WITH_STATS);

		const card = root.querySelector('.dse-fb') as HTMLElement;
		expect(card.getAttribute('data-dse-fb-stats')).toBe('grid');

		const stats = card.querySelector(':scope > .dse-fb__stats') as HTMLElement;
		expect(stats).not.toBeNull();
		const labels = Array.from(stats.querySelectorAll('.dse-fb__stat-l')).map((el) => el.textContent);
		const values = Array.from(stats.querySelectorAll('.dse-fb__stat-v')).map((el) => el.textContent);
		// The legacy "Stamina: " colon is CSS-owned (::after), never baked into the DOM.
		expect(labels).toEqual(['Stamina', 'Size', 'Speed', 'Stability', 'Free Strike']);
		expect(values).toEqual(['30', '2', '0', '3', '2']);
	});

	test('no stamina/size/stats -> no .dse-fb__stats at all', async () => {
		const { root } = await renderFeatureblock(angulotlMalice);
		expect(root.querySelector('.dse-fb__stats')).toBeNull();
	});

	test('features render through Task 5\'s renderFeatureList: ◆ divider, then .dse-feature__nested > .dse-feature cards (shared grammar)', async () => {
		const { root } = await renderFeatureblock(angulotlMalice);

		// The legacy ◆ rule between the stat header and the features survives as the
		// kit divider (ornament) — pixel-faithful to today's .ds-hr-container in Legacy.
		expect(root.querySelector('.dse-fb > .dse-hr .dse-hr__diamond')).not.toBeNull();

		const list = root.querySelector('.dse-fb > .dse-feature__nested') as HTMLElement;
		expect(list).not.toBeNull();
		const cards = list.querySelectorAll(':scope > .dse-feature');
		expect(cards).toHaveLength(3);

		// The shared feature grammar: kit cardHead name + cost chip, kit .dse-pr tiers.
		const names = Array.from(cards).map(
			(c) => c.querySelector('.dse-head__primary--left')!.textContent,
		);
		expect(names).toEqual(['Leapfrog', 'Resonating Croak', 'Rainfall']);
		expect(cards[0].querySelector('.dse-head__eyebrow--right')!.textContent).toBe('3 Malice');
		expect(cards[1].querySelectorAll('.dse-pr .dse-pr__row')).toHaveLength(3);
		// Nested feature headings sit one level under the block heading (aria-level 3).
		expect(cards[0].querySelector('.dse-head__primary--left')!.getAttribute('aria-level')).toBe('3');
	});

	test('no features -> no divider and no feature list (renderFeatures guard)', async () => {
		const { root } = await renderFeatureblock('type: featureblock\nname: Bare Block\n');
		expect(root.querySelector('.dse-hr')).toBeNull();
		expect(root.querySelector('.dse-feature__nested')).toBeNull();
	});

	test('.dse-fb__band--adv: contiguous Level>0 features wrap in an advancement band (data-level + "Level N Advancement" head), level-0 stay in the main flow', async () => {
		const { root } = await renderFeatureblock(WITH_ADVANCEMENT);
		const card = root.querySelector('.dse-fb') as HTMLElement;

		// Base (level-0) feature: directly in the card's main feature flow.
		const mainList = card.querySelector(':scope > .dse-feature__nested') as HTMLElement;
		expect(mainList.querySelector('.dse-head__primary--left')!.textContent).toBe('Base Glow');

		const bands = card.querySelectorAll(':scope > .dse-fb__band--adv');
		expect(bands).toHaveLength(2);

		expect(bands[0].getAttribute('data-level')).toBe('3');
		expect(bands[0].querySelector('.dse-fb__adv-head')!.textContent).toBe('Level 3 Advancement');
		const level3Names = Array.from(bands[0].querySelectorAll('.dse-head__primary--left')).map(
			(el) => el.textContent,
		);
		expect(level3Names).toEqual(['Blinding Flare', 'Searing Beam']);

		expect(bands[1].getAttribute('data-level')).toBe('6');
		expect(bands[1].querySelector('.dse-fb__adv-head')!.textContent).toBe('Level 6 Advancement');
		expect(bands[1].querySelector('.dse-head__primary--left')!.textContent).toBe('Solar Crown');
	});

	test('no advancement levels -> no band (typical blocks are unchanged)', async () => {
		const { root } = await renderFeatureblock(angulotlMalice);
		expect(root.querySelector('.dse-fb__band--adv')).toBeNull();
	});

	test('NO content loss: every field the legacy FeatureblockView tree rendered appears in the new DOM (angulotl)', async () => {
		const { root } = await renderFeatureblock(angulotlMalice);
		const text = root.textContent!;

		for (const expected of [
			'Angulotl Malice', // name
			'Malice Features', // featureblock_type
			'you can spend Malice to activate', // flavor
			'Leapfrog', // feature names
			'Resonating Croak',
			'Rainfall',
			'3 Malice', // feature costs
			'5 Malice',
			'7 Malice',
			'jump 3 squares', // effect text
			'Intuition test', // effect with tiers
			'5 sonic damage; slowed (EoT)', // tier1
			'4 sonic damage', // tier2
			'No effect.', // tier3
			'unleash rain', // plain effect
		]) {
			expect(text).toContain(expected);
		}
	});

	test('NO content loss: level/ev/stamina/size/stats all appear verbatim (stats-bearing block)', async () => {
		const { root } = await renderFeatureblock(WITH_STATS);
		const text = root.textContent!;

		for (const expected of [
			'Bloodstone of Yendral',
			'Fixture',
			'Level 2',
			'EV 6',
			'Stamina',
			'30',
			'Size',
			'Speed',
			'Stability',
			'Free Strike',
			'Hungering Pulse',
			'Each enemy within 2 squares takes 2 corruption damage.',
		]) {
			expect(text).toContain(expected);
		}
	});

	test('ML-1: ALL markdown renders through the view-parented renderMarkdown (component = the view, never the plugin)', async () => {
		const renderSpy = jest.spyOn(MarkdownRenderer, 'render');
		try {
			await renderFeatureblock(angulotlMalice);

			expect(renderSpy.mock.calls.length).toBeGreaterThan(3); // flavor + feature bodies
			for (const call of renderSpy.mock.calls) {
				expect(call[3]).toBe('Note.md'); // host.sourcePath
				expect(call[4]).toBeInstanceOf(FeatureblockElementView); // lifecycle owner (ML-1)
			}
		} finally {
			renderSpy.mockRestore();
		}
	});

	test('static: rendering never writes back (no replaceSource) and mounts NO interactive controls', async () => {
		const { root, host } = await renderFeatureblock(WITH_STATS);
		expect(host.replaceSource).not.toHaveBeenCalled();
		expect(root.querySelector('button, input, select, textarea, [tabindex]')).toBeNull();
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
	});

	test('ties FeatureblockElementView to host.addChild (block lifecycle)', async () => {
		const addChild = jest.fn((child: unknown) => child);
		await renderFeatureblock(angulotlMalice, { addChild } as Partial<BlockHost>);
		expect(addChild).toHaveBeenCalledTimes(1);
		expect(addChild.mock.calls[0][0]).toBeInstanceOf(FeatureblockElementView);
	});

	test('pipeline default click shield replaces the legacy manual mousedown/pointerdown stop', async () => {
		const { root, host } = await renderFeatureblock(angulotlMalice);
		document.body.appendChild(host.containerEl);
		try {
			let bubbledToDocument = 0;
			const onDocMousedown = () => bubbledToDocument++;
			document.addEventListener('mousedown', onDocMousedown);
			try {
				const card = root.querySelector('.dse-fb') as HTMLElement;
				card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
				expect(bubbledToDocument).toBe(0);
			} finally {
				document.removeEventListener('mousedown', onDocMousedown);
			}
		} finally {
			document.body.removeChild(host.containerEl);
		}
	});

	test('malformed YAML renders the framework error card (stage "parse") — replaces the legacy try/catch div', async () => {
		const { root } = await renderFeatureblock('name: [unclosed');
		expect(root.getAttribute('data-dse-error-stage')).toBe('parse');
		expect(root.querySelector('.dse-error-card')).not.toBeNull();
		expect(root.querySelector('.dse-error-card-title')!.textContent).toContain(
			'Featureblock: failed to render',
		);
		expect(root.querySelector('.dse-fb')).toBeNull();
	});
});

describe('Plan 09 Task 6a: source + CSS hygiene', () => {
	/** Comments explain what the code must NOT do — strip them so the negative scans
	 *  below only see real code (same trick styleGuardFindings uses). */
	const stripComments = (src: string) =>
		src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

	test('view.ts: renders via cardHead + renderFeatureList, no longer constructs the legacy FeatureblockView; style guard clean', () => {
		const src = fs.readFileSync(
			path.join(__dirname, '../../../src/elements/featureblock/view.ts'),
			'utf8',
		);
		const code = stripComments(src);
		expect(code).toMatch(/renderFeatureList/);
		expect(code).toMatch(/cardHead/);
		expect(code).not.toMatch(/FeatureblockView\b.*from/);
		expect(code).not.toMatch(/drawSteelAdmonition/);
		expect(styleGuardFindings(src)).toEqual([]);
	});

	test('renderFeature.ts: no .dse-pr__head querySelector reach-in remains (the kit head option owns it)', () => {
		const src = fs.readFileSync(
			path.join(__dirname, '../../../src/elements/feature/renderFeature.ts'),
			'utf8',
		);
		const code = stripComments(src);
		expect(code).not.toMatch(/querySelector/);
	});

	test('legacy FeatureblockView + sub-views are RETIRED (deleted by Task 10; element-dead since T6b)', () => {
		for (const file of [
			'../../../src/drawSteelAdmonition/featureblock/FeatureblockView.ts',
			'../../../src/drawSteelAdmonition/featureblock/FeatureblockStatsView.ts',
		] as const) {
			expect(fs.existsSync(path.join(__dirname, file))).toBe(false);
		}
		// Statblock's T6b redesign dropped the last element import of the legacy tree.
		const statblock = fs.readFileSync(
			path.join(__dirname, '../../../src/elements/statblock/view.ts'),
			'utf8',
		);
		expect(statblock).not.toMatch(/from '@drawSteelAdmonition/);
	});

	test('CSS contract: .dse-fb grammar in styles-source.css; the old .ds-fb-* block is evicted', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

		expect(sheet).toMatch(/\.dse-fb__flavor\s*\{/);
		expect(sheet).toMatch(/\.dse-fb__stat-l::after\s*\{/); // the CSS-owned colon
		expect(sheet).toMatch(/\.dse-fb__band--adv/);
		expect(sheet).toMatch(/\[data-dse-fb-stats='grid'\]/);
		// The adv-head tints via the inherited --dse-role alias, monochrome fallback.
		const advHead = sheet.match(/\.dse-fb__adv-head\s*\{[\s\S]*?\n\}/);
		expect(advHead).not.toBeNull();
		expect(advHead![0]).toMatch(/var\(--dse-role,\s*var\(--dse-heading\)\)/);

		// The legacy featureblock CSS is dead (nothing renders .ds-fb-* anymore).
		expect(sheet).not.toMatch(/\.ds-fb-container/);
		expect(sheet).not.toMatch(/\.ds-fb-stats/);
	});
});

describe('T-5: registered EXACTLY ONCE — framework registry owns ds-fb*, RegisterElements.ts does not', () => {
	test('registerFrameworkElementDefinitions registers featureblock; every alias resolves to it', () => {
		const registry = createElementRegistry();
		registerFrameworkElementDefinitions(registry);

		expect(registry.get('featureblock')?.id).toBe('featureblock');
		for (const alias of FB_ALIASES) {
			expect(registry.get(alias)?.id).toBe('featureblock');
		}
	});

	test('through the REAL onload(): each ds-fb* alias gets exactly one registerMarkdownCodeBlockProcessor call (no legacy double-registration)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		const registerSpy = jest.spyOn(plugin, 'registerMarkdownCodeBlockProcessor');

		await plugin.onload();

		for (const alias of FB_ALIASES) {
			const calls = registerSpy.mock.calls.filter(([language]: [string]) => language === alias);
			expect(calls).toHaveLength(1);
		}
		expect(plugin.frameworkV2!.registry.get('ds-fb')?.id).toBe('featureblock');

		registerSpy.mockRestore();
	});

	test('rendering a ds-fb block through the wired processor produces the kit featureblock DOM (end-to-end)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		await plugin.onload();

		app.vault.setFile('Note.md', '```ds-fb\n' + angulotlMalice.trimEnd() + '\n```\n');
		const ctx = makeFakeContext(app, 'Note.md');
		const handler = (plugin as any).registeredProcessors.get('ds-fb');

		await handler(angulotlMalice, ctx.el, ctx);

		const root = ctx.el.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('featureblock');
		expect(root.querySelector('.dse-fb > .dse-head')).not.toBeNull();
		expect(root.querySelector('.dse-fb .dse-feature__nested .dse-feature')).not.toBeNull();
	});
});
