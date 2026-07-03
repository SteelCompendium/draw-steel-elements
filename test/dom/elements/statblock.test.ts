// Plan 07 Task 3 (F1 §6 step 6) — the Statblock element on Framework v2:
// statblockElement definition + StatblockElementView, driven through the REAL
// ElementPipeline (same static-element harness as feature.test.ts / featureblock.test.ts,
// which this file mirrors). Statblock had NO legacy view class — its render lived in
// StatblockProcessor.buildUI — so the element view folds those sub-view calls in
// directly (Common/HeaderView -> statblock/StatsView -> [HorizontalRuleProcessor.build +
// Features/FeaturesView via FeatureConfig]). The golden tests below pin the fold
// byte-for-byte against a direct replay of those same sub-view calls rather than
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
import { StatblockConfig } from '@model/StatblockConfig';
import { FeatureConfig } from '@model/FeatureConfig';
import { HeaderView } from '@drawSteelAdmonition/Common/HeaderView';
import { StatsView } from '@drawSteelAdmonition/statblock/StatsView';
import { FeaturesView } from '@drawSteelAdmonition/Features/FeaturesView';
import { HorizontalRuleProcessor } from '@drawSteelAdmonition/Common/horizontalRuleProcessor';
import { App, Plugin, makeFakeContext } from '../../mocks/obsidian';
import { statblockElement } from '../../../src/elements/statblock/definition';
import { StatblockElementView } from '../../../src/elements/statblock/view';
import DrawSteelAdmonitionPlugin, { registerFrameworkElementDefinitions } from 'main';
import humanBanditChief from '../../fixtures/statblock/human-bandit-chief.yaml';

const SB_ALIASES = ['ds-sb', 'ds-statblock'] as const;

/** A statblock with NO features (and no level/roles/ancestry/ev either) — exercises the
 *  skipped `features?.length > 0` branch (no HR, no FeaturesView) AND the legacy
 *  buildUI's N/A fallback strings in the header. */
const NO_FEATURES = `type: statblock
name: Bare Creature
stamina: "10"
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
		getBlockInfo: () => ({ language: 'ds-sb', lineStart: 0, lineEnd: 140 }),
		replaceSource,
		blockKey: () => 'Note.md::ds-sb::0',
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

/** Real service instances, same convention as feature/featureblock.test.ts's makeDeps(). */
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

async function renderStatblock(source: string, hostOverrides: Partial<BlockHost> = {}) {
	const deps = makeDeps();
	const pipeline = new ElementPipeline(deps);
	const host = makeHost(hostOverrides);
	await pipeline.run(statblockElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { pipeline, host, root, deps };
}

/** Direct replay of the deleted StatblockProcessor.buildUI (verbatim sub-view calls),
 *  wrapped in its `.ds-sb-container.ds-container` root — the golden the element view's
 *  onMount must match byte-for-byte. */
function buildGolden(plugin: unknown, source: string): HTMLElement {
	const golden = document.createElement('div');
	const container = golden.createEl('div', { cls: 'ds-sb-container ds-container' });
	const ctx = { sourcePath: 'Note.md' } as any;
	const data = StatblockConfig.readYaml(source);
	const level = data.statblock.level !== undefined ? `Level ${data.statblock.level}` : 'Level N/A';
	const roles = data.statblock.roles?.join(', ') ?? 'No Role';
	new HeaderView(
		plugin as any,
		ctx,
		data.statblock.name ?? 'Unnamed Creature',
		`${level} ${roles}`,
		data.statblock.ancestry?.join(', ') ?? 'Unknown Ancestry',
		data.statblock.ev !== undefined ? `EV ${data.statblock.ev}` : 'EV N/A',
	).build(container);
	new StatsView(plugin as any, data, ctx).build(container);
	if (data.statblock.features?.length > 0) {
		HorizontalRuleProcessor.build(container);
		const featureConfigs = data.statblock.features.map((f) => new FeatureConfig(f));
		new FeaturesView(plugin as any, featureConfigs, ctx).build(container);
	}
	return golden;
}

describe('Plan 07 Task 3: statblock ElementDefinition (F1 §6 step 6)', () => {
	test('id/name/aliases/shape match the preserved ds-sb/ds-statblock contract; static, NO schema/serialize/resolveRefs', () => {
		expect(statblockElement.id).toBe('statblock');
		expect(statblockElement.name).toBe('Statblock');
		expect(statblockElement.aliases).toEqual([...SB_ALIASES]);
		expect(statblockElement.shape).toBe('static');
		expect(statblockElement.schema).toBeUndefined();
		expect(statblockElement.serialize).toBeUndefined();
		expect(statblockElement.resolveRefs).toBeUndefined();
		expect(statblockElement.autoResolveRefs).toBe(false);
		// The legacy StatblockProcessor armed a manual click shield — the pipeline's
		// default shield replaces it, so the definition must NOT opt out.
		expect(statblockElement.noClickShield).toBeUndefined();
	});

	test('parse consumes the RAW block text (SDK YamlReader), NOT the pipeline pre-parsed data', () => {
		// `data` is deliberately garbage: only `raw` carries the block. StatblockConfig
		// .readYaml = Statblock.read(new YamlReader(...), raw) — an SDK text reader.
		const model = statblockElement.parse(undefined, humanBanditChief);
		expect(model).toBeInstanceOf(StatblockConfig);
		expect(model.statblock.name).toBe('Human Bandit Chief');
		expect(model.statblock.level).toBe(3);
		expect(model.statblock.roles).toEqual(['Leader']);
		expect(model.statblock.ancestry).toEqual(['Human', 'Humanoid']);
		expect(model.statblock.ev).toBe('20');
		expect(model.statblock.features).toHaveLength(8);
		expect(model.statblock.features[0].name).toBe('Whip and Magic Longsword');
	});

	test('createView returns a StatblockElementView', () => {
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
		expect(statblockElement.createView(cx)).toBeInstanceOf(StatblockElementView);
	});
});

describe('Plan 07 Task 3: statblock rendered through the REAL ElementPipeline', () => {
	test('golden render: byte-identical to the legacy buildUI replay (HeaderView + StatsView + HR + FeaturesView)', async () => {
		const { root, deps } = await renderStatblock(humanBanditChief);
		const golden = buildGolden(deps.plugin, humanBanditChief);
		expect(root.innerHTML).toBe(golden.innerHTML);
	});

	test('golden render holds for the featureless fixture too (skipped HR/FeaturesView branch)', async () => {
		const { root, deps } = await renderStatblock(NO_FEATURES);
		const golden = buildGolden(deps.plugin, NO_FEATURES);
		expect(root.innerHTML).toBe(golden.innerHTML);
	});

	test('root carries data-dse-element="statblock" + data-dse-theme; container classes match the legacy processor', async () => {
		const { root } = await renderStatblock(humanBanditChief);

		expect(root.getAttribute('data-dse-element')).toBe('statblock');
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
		const container = root.querySelector(':scope > .ds-sb-container');
		expect(container).not.toBeNull();
		expect(container!.classList.contains('ds-container')).toBe(true);
		expect(container!.querySelector(':scope > .ds-header-container')).not.toBeNull();
	});

	test('header (Common/HeaderView): name, "Level N roles", ancestry, and "EV N" render', async () => {
		const { root } = await renderStatblock(humanBanditChief);

		const header = root.querySelector('.ds-sb-container > .ds-header-container') as HTMLElement;
		expect(header).not.toBeNull();
		expect(header.querySelector('.ds-header-title-left')!.textContent).toBe('Human Bandit Chief');
		expect(header.querySelector('.ds-header-title-right')!.textContent).toBe('Level 3 Leader');
		expect(header.querySelector('.ds-sb-header-left')!.textContent).toBe('Human, Humanoid');
		expect(header.querySelector('.ds-sb-header-right')!.textContent).toBe('EV 20');
	});

	test('header fallbacks: missing level/roles/ancestry/ev render the legacy N/A strings', async () => {
		const { root } = await renderStatblock(NO_FEATURES);

		const header = root.querySelector('.ds-sb-container > .ds-header-container') as HTMLElement;
		expect(header.querySelector('.ds-header-title-left')!.textContent).toBe('Bare Creature');
		expect(header.querySelector('.ds-header-title-right')!.textContent).toBe('Level N/A No Role');
		expect(header.querySelector('.ds-sb-header-left')!.textContent).toBe('Unknown Ancestry');
		expect(header.querySelector('.ds-sb-header-right')!.textContent).toBe('EV N/A');
	});

	test('stats (statblock/StatsView): stat items, immunity/weakness line, characteristics line', async () => {
		const { root } = await renderStatblock(humanBanditChief);

		const stats = root.querySelector('.ds-sb-container > .ds-sb-stats') as HTMLElement;
		expect(stats).not.toBeNull();
		const itemTops = Array.from(stats.querySelectorAll('.ds-sb-stats-item-top')).map(
			(el) => el.textContent,
		);
		const itemBottoms = Array.from(stats.querySelectorAll('.ds-sb-stats-item-bottom')).map(
			(el) => el.textContent,
		);
		expect(itemBottoms).toEqual(['Size', 'Speed', 'Stamina', 'Stability', 'Free Strike']);
		expect(itemTops).toEqual(['1M', '5', '120', '2', '5']);
		const lines = stats.querySelectorAll(':scope > .ds-sb-stats-line');
		expect(lines[0].querySelector('.ds-sb-stats-left')!.textContent).toBe(
			'Immunity: Corruption 4, psychic 4',
		);
		expect(lines[0].querySelector('.ds-sb-stats-right')!.textContent).toBe('Weakness: -');
		const chars = Array.from(root.querySelectorAll('.ds-sb-characteristics-pair')).map(
			(el) => el.textContent,
		);
		expect(chars).toEqual(['Might +2', 'Agility +3', 'Reason +2', 'Intuition +3', 'Presence +2']);
	});

	test('features: HR separator (Common/horizontalRuleProcessor) then .ds-sb-features with the nested feature tree', async () => {
		const { root } = await renderStatblock(humanBanditChief);

		// HorizontalRuleProcessor.build is called directly by the element view — the kept
		// static builder, NOT the migrated horizontal-rule element.
		expect(root.querySelector('.ds-sb-container > .ds-hr-container')).not.toBeNull();

		const featuresEl = root.querySelector('.ds-sb-features') as HTMLElement;
		expect(featuresEl).not.toBeNull();
		expect(featuresEl.classList.contains('ds-features')).toBe(true);

		const features = featuresEl.querySelectorAll(':scope > .ds-feature-container');
		expect(features).toHaveLength(8);
		expect(features[0].querySelector('.ds-feature-name-value')!.textContent).toBe(
			'Whip and Magic Longsword',
		);
		expect(features[0].querySelectorAll('.ds-pr-tier-line').length).toBeGreaterThan(0);
	});

	test('no features -> no HR and no .ds-sb-features (features?.length > 0 guard)', async () => {
		const { root } = await renderStatblock(NO_FEATURES);
		expect(root.querySelector('.ds-hr-container')).toBeNull();
		expect(root.querySelector('.ds-sb-features')).toBeNull();
		// The header + stats still render.
		expect(root.querySelector('.ds-header-container')).not.toBeNull();
		expect(root.querySelector('.ds-sb-stats')).not.toBeNull();
	});

	test('static: rendering never writes back (no replaceSource) and no error card renders', async () => {
		const { root, host } = await renderStatblock(humanBanditChief);
		expect(host.replaceSource).not.toHaveBeenCalled();
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
	});

	test('ties StatblockElementView to host.addChild (block lifecycle)', async () => {
		const addChild = jest.fn((child: unknown) => child);
		await renderStatblock(humanBanditChief, { addChild } as Partial<BlockHost>);
		expect(addChild).toHaveBeenCalledTimes(1);
		expect(addChild.mock.calls[0][0]).toBeInstanceOf(StatblockElementView);
	});

	test('pipeline default click shield replaces the legacy manual mousedown/pointerdown stop', async () => {
		const { root, host } = await renderStatblock(humanBanditChief);
		document.body.appendChild(host.containerEl);
		try {
			let bubbledToDocument = 0;
			const onDocMousedown = () => bubbledToDocument++;
			document.addEventListener('mousedown', onDocMousedown);
			try {
				const container = root.querySelector('.ds-sb-container') as HTMLElement;
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
		const { root } = await renderStatblock('name: [unclosed');
		expect(root.getAttribute('data-dse-error-stage')).toBe('parse');
		expect(root.querySelector('.dse-error-card')).not.toBeNull();
		expect(root.querySelector('.dse-error-card-title')!.textContent).toContain(
			'Statblock: failed to render',
		);
		expect(root.querySelector('.ds-header-container')).toBeNull();
	});
});

describe('T-5: registered EXACTLY ONCE — framework registry owns ds-sb*, RegisterElements.ts does not', () => {
	test('registerFrameworkElementDefinitions registers statblock; every alias resolves to it', () => {
		const registry = createElementRegistry();
		registerFrameworkElementDefinitions(registry);

		expect(registry.get('statblock')?.id).toBe('statblock');
		for (const alias of SB_ALIASES) {
			expect(registry.get(alias)?.id).toBe('statblock');
		}
	});

	test('through the REAL onload(): each ds-sb* alias gets exactly one registerMarkdownCodeBlockProcessor call (no legacy double-registration)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		const registerSpy = jest.spyOn(plugin, 'registerMarkdownCodeBlockProcessor');

		await plugin.onload();

		for (const alias of SB_ALIASES) {
			const calls = registerSpy.mock.calls.filter(([language]: [string]) => language === alias);
			expect(calls).toHaveLength(1);
		}
		expect(plugin.frameworkV2!.registry.get('ds-sb')?.id).toBe('statblock');

		registerSpy.mockRestore();
	});

	test('rendering a ds-sb block through the wired processor produces the statblock DOM (end-to-end)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		await plugin.onload();

		app.vault.setFile('Note.md', '```ds-sb\n' + humanBanditChief.trimEnd() + '\n```\n');
		const ctx = makeFakeContext(app, 'Note.md');
		const handler = (plugin as any).registeredProcessors.get('ds-sb');

		await handler(humanBanditChief, ctx.el, ctx);

		const root = ctx.el.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('statblock');
		expect(root.querySelector('.ds-sb-container > .ds-header-container')).not.toBeNull();
		expect(root.querySelector('.ds-sb-features .ds-feature-container')).not.toBeNull();
	});
});
