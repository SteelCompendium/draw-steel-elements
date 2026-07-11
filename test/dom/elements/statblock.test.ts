// Plan 09 Task 6b (D2 §3.8) — the Statblock element re-cast onto the D2 kit card
// grammar: kit cardHead (§3.8 fill: left-eyebrow = ancestry line, name heading,
// Level → right eyebrow chip, roles → right primary, EV → right deck) + role tint
// via [data-dse-role] (the element maps --dse-role: var(--dse-role-<role>) from the
// SDK combat role; unmapped → NO attribute/alias, fails safe to monochrome) + the
// .dse-sb__meta info grid (Size/Speed/Stamina/Stability/Free Strike items +
// Immunity/Weakness/Movement/With Captain kv cells) + the .dse-sb__chars
// characteristics row + the D4 (Plan 13 Task 3) pref-attr hooks (data-dse-density /
// data-dse-sb-featstyle / data-dse-sb-columns / data-dse-sb-stats), REFLECTED onto
// the element ROOT by prefs.reflect() rather than stamped by this view, + the
// feature list through Task 5's renderFeatureList (shared .dse-feature/.dse-pr
// grammar).
//
// COMMUNITY-CONTROVERSIAL CONSTRAINT (§3.8): NO word/number changes — every label,
// value, and fallback string the legacy HeaderView/StatsView emitted appears
// VERBATIM; only the design changed. These tests replace Plan 07 Task 3's
// golden-DOM pin (which froze the legacy buildUI fold byte-for-byte). The legacy
// builders (HeaderView/StatsView/FeaturesView/HorizontalRuleProcessor) stay in the
// codebase UNTOUCHED — statblock was their LAST element consumer, so they are now
// element-dead; Task 10 retires them.
import * as fs from 'fs';
import * as path from 'path';
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { createElementRegistry } from '../../../src/framework/registry';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { StatblockConfig } from '@model/StatblockConfig';
import { App, Plugin, MarkdownRenderer, makeFakeContext } from '../../mocks/obsidian';
import { statblockElement } from '../../../src/elements/statblock/definition';
import { StatblockElementView } from '../../../src/elements/statblock/view';
import { styleGuardFindings } from '../kit/styleGuard';
import DrawSteelAdmonitionPlugin, { registerFrameworkElementDefinitions } from 'main';
import humanBanditChief from '../../fixtures/statblock/human-bandit-chief.yaml';

const SB_ALIASES = ['ds-sb', 'ds-statblock'] as const;

/** A statblock with NO features (and no level/roles/ancestry/ev either) — exercises
 *  the skipped features branch (no divider, no feature list) AND the legacy header's
 *  N/A fallback strings, which must survive the redesign VERBATIM. */
const NO_FEATURES = `type: statblock
name: Bare Creature
stamina: "10"
`;

/** The stat surface the bandit-chief fixture lacks: movement, with_captain,
 *  weaknesses, a negative/zero/missing characteristic — plus an UNMAPPED role word
 *  ("Boss"), pinning the grey/monochrome fails-safe. */
const WITH_META = `type: statblock
name: Goblin Monarch
level: 2
roles:
  - Boss
ancestry:
  - Goblin
ev: "10"
stamina: "40"
speed: 6
movement: climb
size: 1S
stability: 0
free_strike: 2
weaknesses:
  - fire 2
  - holy 1
with_captain: Strike damage +2
might: -1
agility: 2
reason: 0
intuition: 1
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
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
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

describe('statblock ElementDefinition (contract unchanged by the D2 redesign)', () => {
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

describe('Plan 09 Task 6b: statblock re-cast onto the D2 kit card grammar (§3.8)', () => {
	test('root carries data-dse-element="statblock" + data-dse-theme; the .dse-sb card replaces the legacy wrapper classes', async () => {
		const { root } = await renderStatblock(humanBanditChief);

		expect(root.getAttribute('data-dse-element')).toBe('statblock');
		expect(root.getAttribute('data-dse-theme')).toBe('steel');
		expect(root.querySelector(':scope > .dse-sb')).not.toBeNull();
		// The legacy buildUI DOM is fully retired for this element.
		expect(root.querySelector('.ds-sb-container')).toBeNull();
		expect(root.querySelector('.ds-header-container')).toBeNull();
		expect(root.querySelector('.ds-sb-stats')).toBeNull();
		expect(root.querySelector('.ds-hr-container')).toBeNull();
		expect(root.querySelector('.ds-feature-container')).toBeNull();
	});

	test('cardHead (§3.8 fill): ancestry → left eyebrow; name = the heading (aria-level 2); Level → right eyebrow; roles → right primary; EV → right deck — all VERBATIM', async () => {
		const { root } = await renderStatblock(humanBanditChief);

		const head = root.querySelector('.dse-sb > .dse-head') as HTMLElement;
		expect(head).not.toBeNull();

		expect(head.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('Human, Humanoid');

		const name = head.querySelector('.dse-head__primary--left') as HTMLElement;
		expect(name.getAttribute('role')).toBe('heading');
		expect(name.getAttribute('aria-level')).toBe('2');
		expect(name.textContent).toBe('Human Bandit Chief');

		expect(head.querySelector('.dse-head__eyebrow--right')!.textContent).toBe('Level 3');
		expect(head.querySelector('.dse-head__primary--right')!.textContent).toBe('Leader');
		expect(head.querySelector('.dse-head__deck--right')!.textContent).toBe('EV 20');
	});

	test('cardHead fallbacks: missing level/roles/ancestry/ev render the legacy N/A strings VERBATIM (never gaps — legacy always printed them)', async () => {
		const { root } = await renderStatblock(NO_FEATURES);

		const head = root.querySelector('.dse-sb > .dse-head') as HTMLElement;
		expect(head.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('Unknown Ancestry');
		expect(head.querySelector('.dse-head__primary--left')!.textContent).toBe('Bare Creature');
		expect(head.querySelector('.dse-head__eyebrow--right')!.textContent).toBe('Level N/A');
		expect(head.querySelector('.dse-head__primary--right')!.textContent).toBe('No Role');
		expect(head.querySelector('.dse-head__deck--right')!.textContent).toBe('EV N/A');
	});

	test('[data-dse-role]: the SDK combat role sets the attribute + the --dse-role element-set alias', async () => {
		const { root } = await renderStatblock(humanBanditChief);

		const card = root.querySelector('.dse-sb') as HTMLElement;
		expect(card.getAttribute('data-dse-role')).toBe('leader');
		// Element-set alias: --dse-role -> var(--dse-role-<role>). Legacy maps every
		// --dse-role-* token to the muted grey, so the tint fails safe to monochrome.
		expect(card.style.getPropertyValue('--dse-role')).toBe('var(--dse-role-leader)');
	});

	test('[data-dse-role]: an unmapped role word ("Boss") and missing roles both set NOTHING (grey/monochrome fallback, no alias)', async () => {
		for (const source of [WITH_META, NO_FEATURES]) {
			const { root } = await renderStatblock(source);
			const card = root.querySelector('.dse-sb') as HTMLElement;
			expect(card.hasAttribute('data-dse-role')).toBe(false);
			expect(card.style.getPropertyValue('--dse-role')).toBe('');
		}
	});

	test('pref-attr hooks (D4 Plan 13 Task 3): reflected onto the ELEMENT ROOT with catalog defaults; the .dse-sb card carries none of them', async () => {
		const { root } = await renderStatblock(humanBanditChief);
		const card = root.querySelector('.dse-sb') as HTMLElement;
		expect(card.hasAttribute('data-dse-density')).toBe(false);
		expect(card.hasAttribute('data-dse-sb-featstyle')).toBe(false);
		expect(root.getAttribute('data-dse-density')).toBe('comfortable');
		expect(root.getAttribute('data-dse-sb-featstyle')).toBe('card');
		expect(root.getAttribute('data-dse-sb-columns')).toBe('single');
		expect(root.getAttribute('data-dse-sb-stats')).toBe('grid');
	});

	test('.dse-sb__meta items: Size/Speed/Stamina/Stability/Free Strike — labels AND values verbatim, legacy order', async () => {
		const { root } = await renderStatblock(humanBanditChief);

		const items = root.querySelector('.dse-sb__meta > .dse-sb__items') as HTMLElement;
		expect(items).not.toBeNull();
		const labels = Array.from(items.querySelectorAll('.dse-sb__item-l')).map((el) => el.textContent);
		const values = Array.from(items.querySelectorAll('.dse-sb__item-v')).map((el) => el.textContent);
		expect(labels).toEqual(['Size', 'Speed', 'Stamina', 'Stability', 'Free Strike']);
		expect(values).toEqual(['1M', '5', '120', '2', '5']);
	});

	test('.dse-sb__meta kv: Immunity/Weakness/Movement always render (legacy "-" fallbacks verbatim); the ": " colon is CSS-owned; no captain cell when absent', async () => {
		const { root } = await renderStatblock(humanBanditChief);

		const grid = root.querySelector('.dse-sb__meta > .dse-sb__grid') as HTMLElement;
		expect(grid).not.toBeNull();
		const labels = Array.from(grid.querySelectorAll('.dse-sb__kv-l')).map((el) => el.textContent);
		const values = Array.from(grid.querySelectorAll('.dse-sb__kv-v')).map((el) => el.textContent);
		// The legacy "Immunity: …" colon is CSS-owned (::after), never baked into the DOM.
		expect(labels).toEqual(['Immunity', 'Weakness', 'Movement']);
		expect(values).toEqual(['Corruption 4, psychic 4', '-', '-']);
		expect(grid.querySelector('.dse-sb__kv--captain')).toBeNull();
	});

	test('.dse-sb__meta kv: weaknesses/movement/with-captain values verbatim when present (legacy wording, incl. "With Captain")', async () => {
		const { root } = await renderStatblock(WITH_META);

		const grid = root.querySelector('.dse-sb__meta > .dse-sb__grid') as HTMLElement;
		const labels = Array.from(grid.querySelectorAll('.dse-sb__kv-l')).map((el) => el.textContent);
		const values = Array.from(grid.querySelectorAll('.dse-sb__kv-v')).map((el) => el.textContent);
		expect(labels).toEqual(['Immunity', 'Weakness', 'Movement', 'With Captain']);
		expect(values).toEqual(['-', 'fire 2, holy 1', 'climb', 'Strike damage +2']);
	});

	test('.dse-sb__chars: the five characteristics render as verbatim "Name +N" pairs, legacy order', async () => {
		const { root } = await renderStatblock(humanBanditChief);

		const chars = Array.from(root.querySelectorAll('.dse-sb__chars > .dse-sb__char')).map(
			(el) => el.textContent,
		);
		expect(chars).toEqual(['Might +2', 'Agility +3', 'Reason +2', 'Intuition +3', 'Presence +2']);
	});

	test('.dse-sb__chars formatting parity: negative "-N", zero "+0", missing "N/A" — the legacy formatCharacteristic verbatim', async () => {
		const { root } = await renderStatblock(WITH_META);

		const chars = Array.from(root.querySelectorAll('.dse-sb__chars > .dse-sb__char')).map(
			(el) => el.textContent,
		);
		expect(chars).toEqual(['Might -1', 'Agility +2', 'Reason +0', 'Intuition +1', 'Presence N/A']);
	});

	test("features render through Task 5's renderFeatureList: ◆ divider, then .dse-feature__nested > .dse-feature cards (shared grammar)", async () => {
		const { root } = await renderStatblock(humanBanditChief);

		// The legacy ◆ rule between the stats and the features survives as the kit
		// divider (ornament) — pixel-faithful to today's .ds-hr-container in Legacy.
		expect(root.querySelector('.dse-sb > .dse-hr .dse-hr__diamond')).not.toBeNull();

		const list = root.querySelector('.dse-sb > .dse-feature__nested') as HTMLElement;
		expect(list).not.toBeNull();
		const cards = list.querySelectorAll(':scope > .dse-feature');
		expect(cards).toHaveLength(8);

		const names = Array.from(cards).map(
			(c) => c.querySelector('.dse-head__primary--left')!.textContent,
		);
		expect(names).toEqual([
			'Whip and Magic Longsword',
			'Kneel, Peasant!',
			'Bloodstones',
			'End Effect',
			'Supernatural Insight',
			'Shoot!',
			'Form Up!',
			'Lead From the Front',
		]);
		// Feature headings sit one level under the statblock heading (aria-level 3).
		expect(cards[0].querySelector('.dse-head__primary--left')!.getAttribute('aria-level')).toBe('3');
		// The shared power-roll grammar (kit .dse-pr) renders the ability tiers.
		expect(cards[0].querySelectorAll('.dse-pr .dse-pr__row')).toHaveLength(3);
	});

	test('End Effect (trait) renders on the feature grammar: [data-dse-act="trait"] card with a .dse-section body', async () => {
		const { root } = await renderStatblock(humanBanditChief);

		const traits = Array.from(root.querySelectorAll('.dse-feature[data-dse-act="trait"]'));
		const endEffect = traits.find(
			(el) => el.querySelector('.dse-head__primary--left')?.textContent === 'End Effect',
		) as HTMLElement;
		expect(endEffect).toBeDefined();
		expect(endEffect.querySelector('.dse-section')!.textContent).toContain(
			'At the end of each of their turns',
		);
	});

	test('no features -> no divider and no feature list; head + meta + chars still render', async () => {
		const { root } = await renderStatblock(NO_FEATURES);
		expect(root.querySelector('.dse-hr')).toBeNull();
		expect(root.querySelector('.dse-feature__nested')).toBeNull();
		expect(root.querySelector('.dse-sb > .dse-head')).not.toBeNull();
		expect(root.querySelector('.dse-sb__meta')).not.toBeNull();
		expect(root.querySelector('.dse-sb__chars')).not.toBeNull();
	});

	test('NO content loss: every field the legacy HeaderView/StatsView/FeaturesView tree rendered appears verbatim (bandit chief)', async () => {
		const { root } = await renderStatblock(humanBanditChief);
		const text = root.textContent!;

		for (const expected of [
			// header
			'Human Bandit Chief',
			'Human, Humanoid',
			'Level 3',
			'Leader',
			'EV 20',
			// stat items (label + value)
			'Size',
			'1M',
			'Speed',
			'Stamina',
			'120',
			'Stability',
			'Free Strike',
			// info lines
			'Immunity',
			'Corruption 4, psychic 4',
			'Weakness',
			'Movement',
			// characteristics
			'Might +2',
			'Agility +3',
			'Reason +2',
			'Intuition +3',
			'Presence +2',
			// features: names
			'Whip and Magic Longsword',
			'Kneel, Peasant!',
			'Bloodstones',
			'End Effect',
			'Supernatural Insight',
			'Shoot!',
			'Form Up!',
			'Lead From the Front',
			// features: types / costs / meta
			'Signature Ability',
			'Villain Action 1',
			'Villain Action 2',
			'Villain Action 3',
			'Magic, Melee, Strike, Weapon',
			'Main action',
			'Melee 2',
			'Two enemies or objects',
			'2 Malice',
			// features: rolls / tiers / effects / trigger
			'Power Roll + 2',
			'8 damage; pull 1',
			'12 damage; pull 2',
			'15 damage; pull 3',
			'takes 3 corruption damage',
			'The bandit chief makes a power roll.',
			'At the end of each of their turns',
			'Each target makes a ranged free strike.',
		]) {
			expect(text).toContain(expected);
		}
	});

	test('NO content loss: the featureless fixture keeps every fallback string verbatim', async () => {
		const { root } = await renderStatblock(NO_FEATURES);
		const text = root.textContent!;

		for (const expected of [
			'Bare Creature',
			'Unknown Ancestry',
			'Level N/A',
			'No Role',
			'EV N/A',
			'Stamina',
			'10',
			'Immunity',
			'Weakness',
			'Movement',
			'Might N/A',
			'Presence N/A',
		]) {
			expect(text).toContain(expected);
		}
	});

	test('ML-1: ALL markdown renders through the view-parented renderMarkdown (component = the view, never the plugin)', async () => {
		const renderSpy = jest.spyOn(MarkdownRenderer, 'render');
		try {
			await renderStatblock(humanBanditChief);

			expect(renderSpy.mock.calls.length).toBeGreaterThan(8); // feature names/effects/tiers
			for (const call of renderSpy.mock.calls) {
				expect(call[3]).toBe('Note.md'); // host.sourcePath
				expect(call[4]).toBeInstanceOf(StatblockElementView); // lifecycle owner (ML-1)
			}
		} finally {
			renderSpy.mockRestore();
		}
	});

	test('static: rendering never writes back (no replaceSource) and mounts NO interactive controls', async () => {
		const { root, host } = await renderStatblock(humanBanditChief);
		expect(host.replaceSource).not.toHaveBeenCalled();
		expect(root.querySelector('button, input, select, textarea, [tabindex]')).toBeNull();
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
				const card = root.querySelector('.dse-sb') as HTMLElement;
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
		const { root } = await renderStatblock('name: [unclosed');
		expect(root.getAttribute('data-dse-error-stage')).toBe('parse');
		expect(root.querySelector('.dse-error-card')).not.toBeNull();
		expect(root.querySelector('.dse-error-card-title')!.textContent).toContain(
			'Statblock: failed to render',
		);
		expect(root.querySelector('.dse-sb')).toBeNull();
	});
});

describe('Plan 09 Task 6b: source + CSS hygiene', () => {
	/** Comments explain what the code must NOT do — strip them so the negative scans
	 *  below only see real code (same trick styleGuardFindings uses). */
	const stripComments = (src: string) =>
		src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

	test('view.ts: renders via cardHead + renderFeatureList, no longer constructs ANY legacy builder; style guard clean', () => {
		const src = fs.readFileSync(
			path.join(__dirname, '../../../src/elements/statblock/view.ts'),
			'utf8',
		);
		const code = stripComments(src);
		expect(code).toMatch(/cardHead/);
		expect(code).toMatch(/renderFeatureList/);
		expect(code).not.toMatch(/drawSteelAdmonition/);
		expect(styleGuardFindings(src)).toEqual([]);
	});

	test('legacy builders are RETIRED (Task 10 deleted them — statblock was the last consumer)', () => {
		for (const file of [
			'../../../src/drawSteelAdmonition/Common/HeaderView.ts',
			'../../../src/drawSteelAdmonition/statblock/StatsView.ts',
			'../../../src/drawSteelAdmonition/Features/FeaturesView.ts',
			'../../../src/drawSteelAdmonition/Features/FeatureView.ts',
			'../../../src/drawSteelAdmonition/Features/EffectView.ts',
			'../../../src/drawSteelAdmonition/featureblock/FeatureblockView.ts',
			'../../../src/drawSteelAdmonition/featureblock/FeatureblockStatsView.ts',
			'../../../src/drawSteelAdmonition/Common/BoldKeyWithValueView.ts',
			'../../../src/drawSteelAdmonition/Common/horizontalRuleProcessor.ts',
		] as const) {
			expect(fs.existsSync(path.join(__dirname, file))).toBe(false);
		}
		// …and no framework element imports them anymore.
		for (const view of ['statblock', 'featureblock', 'feature'] as const) {
			const src = fs.readFileSync(
				path.join(__dirname, `../../../src/elements/${view}/view.ts`),
				'utf8',
			);
			expect(stripComments(src)).not.toMatch(/drawSteelAdmonition/);
		}
	});

	test('CSS contract: .dse-sb grammar in styles-source.css (meta/chars/kv colon/role spine/pref hooks); the old .ds-sb-* block is evicted', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

		expect(sheet).toMatch(/\.dse-sb__meta\s*\{/);
		expect(sheet).toMatch(/\.dse-sb__items\s*\{/);
		expect(sheet).toMatch(/\.dse-sb__chars\s*\{/);
		expect(sheet).toMatch(/\.dse-sb__kv-l::after\s*\{/); // the CSS-owned ": " colon
		// The role spine consumes the inherited --dse-role alias, token fallback only.
		const spine = sheet.match(/\.dse-sb\[data-dse-role\]\s*\{[\s\S]*?\n\}/);
		expect(spine).not.toBeNull();
		expect(spine![0]).toMatch(/var\(--dse-role,\s*var\(--dse-rule\)\)/);
		// D4 pref hooks have CSS keyed off the reflected attributes.
		expect(sheet).toMatch(/\[data-dse-density='compact'\]/);
		expect(sheet).toMatch(/\[data-dse-sb-featstyle='flat'\]/);

		// The legacy statblock CSS is dead (nothing renders .ds-sb-* anymore).
		expect(sheet).not.toMatch(/\.ds-sb-container/);
		expect(sheet).not.toMatch(/\.ds-sb-stats/);
		expect(sheet).not.toMatch(/\.ds-sb-characteristics/);
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

	test('rendering a ds-sb block through the wired processor produces the kit statblock DOM (end-to-end)', async () => {
		const app = new App();
		const plugin = new (DrawSteelAdmonitionPlugin as any)(app, { id: 'draw-steel-elements', version: 'test' });
		await plugin.onload();

		app.vault.setFile('Note.md', '```ds-sb\n' + humanBanditChief.trimEnd() + '\n```\n');
		const ctx = makeFakeContext(app, 'Note.md');
		const handler = (plugin as any).registeredProcessors.get('ds-sb');

		await handler(humanBanditChief, ctx.el, ctx);

		const root = ctx.el.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-dse-element')).toBe('statblock');
		expect(root.querySelector('.dse-sb > .dse-head')).not.toBeNull();
		expect(root.querySelector('.dse-sb .dse-feature__nested .dse-feature')).not.toBeNull();
	});
});
