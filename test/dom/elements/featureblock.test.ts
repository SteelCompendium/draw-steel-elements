// Plan 07 Task 2 (F1 §6 step 6) — the Featureblock element on Framework v2:
// featureblockElement definition + FeatureblockElementView, driven through the REAL
// ElementPipeline (same static-element harness as feature.test.ts, which this file
// mirrors). The element view is a thin wrapper: it recreates the legacy
// FeatureblockProcessor's `.ds-fb-container.ds-container` root and delegates ALL
// rendering to the KEPT legacy sub-view tree (featureblock/FeatureblockView ->
// FeatureblockStatsView + Common/HeaderView/BoldKeyWithValueView/
// HorizontalRuleProcessor -> Features/FeaturesView -> FeatureView) — Statblock (the
// next migration) reuses several of those same sub-views, so the golden test below pins
// the wrapper byte-for-byte against a direct FeatureblockView.build() call rather than
// duplicating structure assertions.
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
import { FeatureblockView } from '@drawSteelAdmonition/featureblock/FeatureblockView';
import { App, Plugin, makeFakeContext } from '../../mocks/obsidian';
import { featureblockElement } from '../../../src/elements/featureblock/definition';
import { FeatureblockElementView } from '../../../src/elements/featureblock/view';
import DrawSteelAdmonitionPlugin, { registerFrameworkElementDefinitions } from 'main';
import angulotlMalice from '../../fixtures/featureblock/angulotl-malice.yaml';

const FB_ALIASES = ['ds-fb', 'ds-featureblock'] as const;

/** A featureblock with the full stat surface (level/ev in the header, stamina/size +
 *  named stats in FeatureblockStatsView -> BoldKeyWithValueView) — the angulotl fixture
 *  has none of these, so this pins the stats-row path too. */
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

describe('Plan 07 Task 2: featureblock ElementDefinition (F1 §6 step 6)', () => {
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

describe('Plan 07 Task 2: featureblock rendered through the REAL ElementPipeline', () => {
	test('golden render: byte-identical to the legacy wrapper (ds-fb-container + FeatureblockView.build)', async () => {
		const { root, deps } = await renderFeatureblock(angulotlMalice);

		// The legacy FeatureblockProcessor DOM, minus the framework-owned root div: a
		// `.ds-fb-container.ds-container` wrapper around FeatureblockView.build().
		const golden = document.createElement('div');
		const goldenContainer = golden.createEl('div', { cls: 'ds-fb-container ds-container' });
		new FeatureblockView(deps.plugin, FeatureblockConfig.readYaml(angulotlMalice), {
			sourcePath: 'Note.md',
		} as any).build(goldenContainer);

		expect(root.innerHTML).toBe(golden.innerHTML);
	});

	test('golden render holds for the stats-bearing fixture too (FeatureblockStatsView path)', async () => {
		const { root, deps } = await renderFeatureblock(WITH_STATS);

		const golden = document.createElement('div');
		const goldenContainer = golden.createEl('div', { cls: 'ds-fb-container ds-container' });
		new FeatureblockView(deps.plugin, FeatureblockConfig.readYaml(WITH_STATS), {
			sourcePath: 'Note.md',
		} as any).build(goldenContainer);

		expect(root.innerHTML).toBe(golden.innerHTML);
	});

	test('root carries data-dse-element="featureblock" + data-dse-theme; container classes match the legacy processor', async () => {
		const { root } = await renderFeatureblock(angulotlMalice);

		expect(root.getAttribute('data-dse-element')).toBe('featureblock');
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
		const container = root.querySelector(':scope > .ds-fb-container');
		expect(container).not.toBeNull();
		expect(container!.classList.contains('ds-container')).toBe(true);
		expect(container!.querySelector(':scope > .ds-fb-header')).not.toBeNull();
	});

	test('header (Common/HeaderView) + flavor: name, type, and flavor text render', async () => {
		const { root } = await renderFeatureblock(angulotlMalice);

		const header = root.querySelector('.ds-fb-header .ds-header-container') as HTMLElement;
		expect(header).not.toBeNull();
		expect(header.querySelector('.ds-header-title-left')!.textContent).toBe('Angulotl Malice');
		expect(header.querySelector('.ds-header-title-right')!.textContent).toContain('Malice Features');
		expect(root.querySelector('.ds-fb-flavor')!.textContent).toContain(
			'you can spend Malice to activate',
		);
	});

	test('level/EV in the header and stamina/size/stats rows (FeatureblockStatsView -> BoldKeyWithValueView)', async () => {
		const { root } = await renderFeatureblock(WITH_STATS);

		const header = root.querySelector('.ds-fb-header .ds-header-container') as HTMLElement;
		expect(header.querySelector('.ds-header-title-right')!.textContent).toBe('Level 2 Fixture');
		expect(header.querySelector('.ds-sb-header-right')!.textContent).toBe('EV 6');

		// Row 1: Stamina/Size. Rows 2-3: the three named stats, two per row.
		const rows = root.querySelectorAll('.ds-fb-stats > .ds-fb-stats-row');
		expect(rows).toHaveLength(3);
		const keys = Array.from(root.querySelectorAll('.ds-bkv-key')).map((el) => el.textContent);
		const values = Array.from(root.querySelectorAll('.ds-bkv-value')).map((el) => el.textContent);
		expect(keys).toEqual(['Stamina: ', 'Size: ', 'Speed: ', 'Stability: ', 'Free Strike: ']);
		expect(values).toEqual(['30', '2', '0', '3', '2']);
		expect(rows[0].querySelector('.ds-bkv-container.ds-fb-stats-left .ds-bkv-key')!.textContent).toBe(
			'Stamina: ',
		);
		expect(rows[0].querySelector('.ds-bkv-container.ds-fb-stats-right .ds-bkv-key')!.textContent).toBe(
			'Size: ',
		);
	});

	test('features: HR separator (Common/horizontalRuleProcessor) then .ds-fb-features with the nested feature tree', async () => {
		const { root } = await renderFeatureblock(angulotlMalice);

		// HorizontalRuleProcessor.build is still called directly by FeatureblockView —
		// the kept builder, NOT the migrated horizontal-rule element.
		expect(root.querySelector('.ds-fb-container > .ds-hr-container')).not.toBeNull();

		const featuresEl = root.querySelector('.ds-fb-features') as HTMLElement;
		expect(featuresEl).not.toBeNull();
		expect(featuresEl.classList.contains('ds-features')).toBe(true);

		const features = featuresEl.querySelectorAll('.ds-feature-container');
		expect(features).toHaveLength(3);
		expect(features[0].querySelector('.ds-feature-name-value')!.textContent).toBe('Leapfrog');
		expect(features[0].querySelector('.ds-feature-cost-value')!.textContent).toBe(' (3 Malice)');
		expect(features[1].querySelector('.ds-feature-name-value')!.textContent).toBe('Resonating Croak');
		expect(features[1].querySelectorAll('.ds-pr-tier-line')).toHaveLength(3);
		expect(features[2].querySelector('.ds-feature-name-value')!.textContent).toBe('Rainfall');
	});

	test('no features -> no HR and no .ds-fb-features (renderFeatures guard)', async () => {
		const { root } = await renderFeatureblock('type: featureblock\nname: Bare Block\n');
		expect(root.querySelector('.ds-hr-container')).toBeNull();
		expect(root.querySelector('.ds-fb-features')).toBeNull();
	});

	test('static: rendering never writes back (no replaceSource) and no error card renders', async () => {
		const { root, host } = await renderFeatureblock(angulotlMalice);
		expect(host.replaceSource).not.toHaveBeenCalled();
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
				const container = root.querySelector('.ds-fb-container') as HTMLElement;
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
		const { root } = await renderFeatureblock('name: [unclosed');
		expect(root.getAttribute('data-dse-error-stage')).toBe('parse');
		expect(root.querySelector('.dse-error-card')).not.toBeNull();
		expect(root.querySelector('.dse-error-card-title')!.textContent).toContain(
			'Featureblock: failed to render',
		);
		expect(root.querySelector('.ds-fb-header')).toBeNull();
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

	test('rendering a ds-fb block through the wired processor produces the featureblock DOM (end-to-end)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		await plugin.onload();

		app.vault.setFile('Note.md', '```ds-fb\n' + angulotlMalice.trimEnd() + '\n```\n');
		const ctx = makeFakeContext(app, 'Note.md');
		const handler = (plugin as any).registeredProcessors.get('ds-fb');

		await handler(angulotlMalice, ctx.el, ctx);

		const root = ctx.el.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('featureblock');
		expect(root.querySelector('.ds-fb-container .ds-fb-header')).not.toBeNull();
		expect(root.querySelector('.ds-fb-features .ds-feature-container')).not.toBeNull();
	});
});
