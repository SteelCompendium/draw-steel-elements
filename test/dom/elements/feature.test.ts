// Plan 07 Task 1 (F1 §6 step 5) — the Feature element on Framework v2: featureElement
// definition + FeatureElementView, driven through the REAL ElementPipeline (static-element
// harness mirroring horizontal-rule.test.ts; T-5 registration blocks mirroring
// negotiation.test.ts). The element view is a thin wrapper: it recreates the legacy
// FeatureProcessor's `.ds-feature-ele-container.ds-container` root and delegates ALL
// rendering to the KEPT legacy sub-view tree (Features/FeatureView -> EffectView ->
// FeaturesView) — Featureblock + Statblock (the next migrations) reuse those same
// sub-views, so the golden test below pins the wrapper byte-for-byte against a direct
// FeatureView.build() call rather than duplicating structure assertions.
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
import { FeatureConfig } from '@model/FeatureConfig';
import { FeatureView } from '@drawSteelAdmonition/Features/FeatureView';
import { App, Plugin, makeFakeContext } from '../../mocks/obsidian';
import { featureElement } from '../../../src/elements/feature/definition';
import { FeatureElementView } from '../../../src/elements/feature/view';
import DrawSteelAdmonitionPlugin, { registerFrameworkElementDefinitions } from 'main';
import magmaTitan from '../../fixtures/feature/magma-titan.yaml';

const FT_ALIASES = ['ds-ft', 'ds-feat', 'ds-feature'] as const;

/** A feature whose effect nests further features (Effect.features) — exercising the
 *  recursion path EffectView -> FeaturesView -> FeatureView that Featureblock/Statblock
 *  also depend on. */
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

async function renderFeature(source: string, hostOverrides: Partial<BlockHost> = {}) {
	const deps = makeDeps();
	const pipeline = new ElementPipeline(deps);
	const host = makeHost(hostOverrides);
	await pipeline.run(featureElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { pipeline, host, root, deps };
}

describe('Plan 07 Task 1: feature ElementDefinition (F1 §6 step 5)', () => {
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

	test('parse consumes the RAW block text (SDK YamlReader), NOT the pipeline pre-parsed data', () => {
		// `data` is deliberately garbage: only `raw` carries the block. FeatureConfig
		// .readYaml = Feature.read(new YamlReader(...), raw) — an SDK text reader.
		const model = featureElement.parse(undefined, magmaTitan);
		expect(model).toBeInstanceOf(FeatureConfig);
		expect(model.feature.name).toBe('Magma Titan');
		expect(model.feature.cost).toBe('9 Essence');
		expect(model.feature.keywords).toEqual(['Earth', 'Fire', 'Magic', 'Ranged', 'Void']);
		expect(model.feature.effects).toHaveLength(3);
	});

	test('parse also reads `indent` from the raw YAML (FeatureConfig.readYaml second parseYaml pass)', () => {
		const model = featureElement.parse(undefined, magmaTitan + 'indent: 2\n');
		expect(model.indent).toBe(2);
	});

	test('createView returns a FeatureElementView', () => {
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
		expect(featureElement.createView(cx)).toBeInstanceOf(FeatureElementView);
	});
});

describe('Plan 07 Task 1: feature rendered through the REAL ElementPipeline', () => {
	test('golden render: byte-identical to the legacy wrapper (ds-feature-ele-container + FeatureView.build)', async () => {
		const { root, deps } = await renderFeature(magmaTitan);

		// The legacy FeatureProcessor DOM, minus the framework-owned root div: a
		// `.ds-feature-ele-container.ds-container` wrapper around FeatureView.build().
		const golden = document.createElement('div');
		const goldenContainer = golden.createEl('div', { cls: 'ds-feature-ele-container ds-container' });
		new FeatureView(deps.plugin, FeatureConfig.readYaml(magmaTitan), { sourcePath: 'Note.md' } as any).build(
			goldenContainer,
		);

		expect(root.innerHTML).toBe(golden.innerHTML);
	});

	test('root carries data-dse-element="feature" + data-dse-theme; container classes match the legacy processor', async () => {
		const { root } = await renderFeature(magmaTitan);

		expect(root.getAttribute('data-dse-element')).toBe('feature');
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
		const container = root.querySelector(':scope > .ds-feature-ele-container');
		expect(container).not.toBeNull();
		expect(container!.classList.contains('ds-container')).toBe(true);
		expect(container!.querySelector(':scope > .ds-feature-container')).not.toBeNull();
	});

	test('header/flavor/detail rows: name, cost, flavor, keywords, usage, distance, target', async () => {
		const { root } = await renderFeature(magmaTitan);

		expect(root.querySelector('.ds-feature-name-value')!.textContent).toBe('Magma Titan');
		expect(root.querySelector('.ds-feature-cost-value')!.textContent).toBe(' (9 Essence)');
		expect(root.querySelector('.ds-feature-flavor-value')!.textContent).toContain(
			'Their body swells with lava, mud, and might',
		);
		expect(root.querySelector('.pr-keyword-value')!.textContent).toBe('Earth, Fire, Magic, Ranged, Void');
		expect(root.querySelector('.pr-type-value')!.textContent).toBe('Main action');
		expect(root.querySelector('.ds-feature-distance-value')!.textContent).toBe('Ranged 10');
		expect(root.querySelector('.ds-feature-target-value')!.textContent).toBe('One creature or object');
	});

	test('effects: three .ds-effect-container blocks — named effect, power roll with three tiers, persistent', async () => {
		const { root } = await renderFeature(magmaTitan);

		const effects = root.querySelectorAll('.ds-effects-container > .ds-effect-container');
		expect(effects).toHaveLength(3);

		expect(effects[0].querySelector('.ds-pr-effect-key')!.textContent).toBe('Effect: ');
		expect(effects[0].querySelector('.ds-pr-effect-value')!.textContent).toContain(
			'Their size and stability increase by 2',
		);

		expect(effects[1].querySelector('.ds-pr-roll-line .ds-feature-roll-value')!.textContent).toBe(
			'Power Roll + Reason',
		);
		expect(effects[1].querySelectorAll('.ds-pr-tier-line')).toHaveLength(3);
		expect(effects[1].querySelector('.ds-pr-tier-1-value')!.textContent).toBe(
			'You teleport the target up to 4 squares.',
		);
		expect(effects[1].querySelector('.ds-pr-tier-2-value')!.textContent).toBe(
			'You teleport the target up to 6 squares.',
		);
		expect(effects[1].querySelector('.ds-pr-tier-3-value')!.textContent).toBe(
			'You teleport the target up to 8 squares.',
		);
		expect(effects[1].querySelector('.t1-key-body-text')!.textContent).toBe('≤11');
		expect(effects[1].querySelector('.t2-key-body-text')!.textContent).toBe('12-16');
		expect(effects[1].querySelector('.t3-key-body-text')!.textContent).toBe('17+');

		expect(effects[2].querySelector('.ds-pr-effect-key')!.textContent).toBe('Persistent 2: ');
	});

	test('nested effect.features recurse (EffectView -> FeaturesView -> FeatureView)', async () => {
		const { root } = await renderFeature(NESTED);

		const outer = root.querySelector('.ds-feature-container') as HTMLElement;
		expect(outer.querySelector('.ds-feature-name-value')!.textContent).toBe('Outer Feature');

		const nested = outer.querySelector('.ds-effect-container > .ds-features') as HTMLElement;
		expect(nested).not.toBeNull();
		const inner = nested.querySelector('.ds-feature-container') as HTMLElement;
		expect(inner.querySelector('.ds-feature-name-value')!.textContent).toBe('Inner Feature');
		expect(inner.querySelector('.ds-pr-effect-value')!.textContent).toBe('Inner effect text.');
	});

	test('indent: N in the block adds the legacy indent-N class to .ds-feature-container', async () => {
		const { root } = await renderFeature(magmaTitan + 'indent: 1\n');
		expect(root.querySelector('.ds-feature-container.indent-1')).not.toBeNull();
	});

	test('static: rendering never writes back (no replaceSource) and no error card renders', async () => {
		const { root, host } = await renderFeature(magmaTitan);
		expect(host.replaceSource).not.toHaveBeenCalled();
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
	});

	test('ties FeatureElementView to host.addChild (block lifecycle)', async () => {
		const addChild = jest.fn((child: unknown) => child);
		await renderFeature(magmaTitan, { addChild } as Partial<BlockHost>);
		expect(addChild).toHaveBeenCalledTimes(1);
		expect(addChild.mock.calls[0][0]).toBeInstanceOf(FeatureElementView);
	});

	test('pipeline default click shield replaces the legacy manual mousedown/pointerdown stop', async () => {
		const { root, host } = await renderFeature(magmaTitan);
		document.body.appendChild(host.containerEl);
		try {
			let bubbledToDocument = 0;
			const onDocMousedown = () => bubbledToDocument++;
			document.addEventListener('mousedown', onDocMousedown);
			try {
				const container = root.querySelector('.ds-feature-container') as HTMLElement;
				container.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
				expect(bubbledToDocument).toBe(0);
			} finally {
				document.removeEventListener('mousedown', onDocMousedown);
			}
		} finally {
			document.body.removeChild(host.containerEl);
		}
	});

	test('malformed YAML renders the framework error card (stage "parse") — replaces the legacy try/catch div', async () => {
		const { root } = await renderFeature('name: [unclosed');
		expect(root.getAttribute('data-dse-error-stage')).toBe('parse');
		expect(root.querySelector('.dse-error-card')).not.toBeNull();
		expect(root.querySelector('.dse-error-card-title')!.textContent).toContain('Feature: failed to render');
		expect(root.querySelector('.ds-feature-container')).toBeNull();
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

	test('rendering a ds-ft block through the wired processor produces the feature DOM (end-to-end)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		await plugin.onload();

		app.vault.setFile('Note.md', '```ds-ft\n' + magmaTitan.trimEnd() + '\n```\n');
		const ctx = makeFakeContext(app, 'Note.md');
		const handler = (plugin as any).registeredProcessors.get('ds-ft');

		await handler(magmaTitan, ctx.el, ctx);

		const root = ctx.el.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('feature');
		expect(root.querySelector('.ds-feature-ele-container .ds-feature-container')).not.toBeNull();
	});
});
