// Plan 09 Task 6b (D2 §3.8) — the Statblock element re-cast onto the D2 kit card
// grammar: kit cardHead (§3.8 fill: left-eyebrow = keywords line, name heading,
// Level → right eyebrow chip, organization+role ("Horde Controller" style) → right
// primary, EV → right deck — F2 §2.1 B1 migrated this off SDK 2.x's `roles`/
// `ancestry` string arrays onto 3.x's `role`/`organization`/`keywords`) + role tint
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
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { createElementRegistry } from '../../../src/framework/registry';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { StatblockConfig } from '@model/StatblockConfig';
import { App, Plugin, MarkdownRenderer, makeFakeContext, flushAsync } from '../../mocks/obsidian';
import { statblockElement } from '../../../src/elements/statblock/definition';
import { StatblockElementView } from '../../../src/elements/statblock/view';
import { RefUnwrapView } from '../../../src/elements/shared/RefUnwrapView';
import { styleGuardFindings } from '../kit/styleGuard';
import DrawSteelAdmonitionPlugin, { registerFrameworkElementDefinitions } from 'main';
import humanBanditChief from '../../fixtures/statblock/human-bandit-chief.yaml';
// SC-102 fix round (task-3 review M-1/H-1): the shape steel-etl actually emits. Shared
// verbatim with the visual harness (visual-harness/entry.ts FIXTURES.statblock
// 'villain-corpus'), so the DOM catcher below and the shots render the same bytes.
import statblockVillainCorpus from '../../fixtures/statblock/villain-corpus.yaml';
// FOLLOWUPS #56 / SC-128: the corpus-shaped ROLELESS statblock. Shared verbatim with the
// visual harness (visual-harness/entry.ts FIXTURES.statblock 'roleless-corpus') so the DOM
// catcher below and the shots render the same bytes.
import statblockRolelessCorpus from '../../fixtures/statblock/roleless-corpus.yaml';

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
role: Boss
organization: Horde
keywords:
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
		roll: createRollService(prefs),
	};
}

async function renderStatblock(
	source: string,
	hostOverrides: Partial<BlockHost> = {},
	/** SC-123: preference values applied BEFORE the mount — the three prefs that
	 *  change this element's DOM SHAPE (sbCharLine/sbCharBox/sbVillain) can only be
	 *  exercised that way, and it mirrors what the visual harness's PREF_SHOTS do. */
	prefValues: Record<string, string> = {},
) {
	const deps = makeDeps();
	for (const [key, value] of Object.entries(prefValues)) {
		await deps.prefs.set(key as never, value as never);
	}
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

	test('parse consumes the RAW block text (parseYaml + shim + SDK adapter), NOT the pipeline pre-parsed data', () => {
		// `data` is deliberately garbage: only `raw` carries the block. StatblockConfig
		// .readYaml = parseYaml(raw) -> applyLegacyStatblockKeys -> Statblock.modelDTOAdapter.
		//
		// D6 Task 4: statblockElement is now withReference-wrapped, so parse() returns
		// RefOrInline<StatblockConfig> — {kind:'inline', model} for an inline YAML
		// mapping body (unchanged from here down: base.parse === StatblockConfig.readYaml
		// still owns the inline path verbatim).
		const wrapped = statblockElement.parse(undefined, humanBanditChief);
		expect(wrapped.kind).toBe('inline');
		if (wrapped.kind !== 'inline') throw new Error('expected inline');
		const model = wrapped.model;
		expect(model).toBeInstanceOf(StatblockConfig);
		expect(model.statblock.name).toBe('Human Bandit Chief');
		expect(model.statblock.level).toBe(3);
		// F2 review fix (task-1-review.md Critical): reshaped to the REAL production
		// shape (data-unified's human-bandit-chief.yaml) — role: "" / organization:
		// Leader, not a synthetic role: Leader / organization: Human. Every real
		// Leader-org statblock carries an empty role; see the role-tint test below.
		expect(model.statblock.role).toBe('');
		expect(model.statblock.organization).toBe('Leader');
		expect(model.statblock.keywords).toEqual(['Human', 'Humanoid']);
		expect(model.statblock.ev).toBe('20');
		expect(model.statblock.features).toHaveLength(8);
		expect(model.statblock.features[0].name).toBe('Whip and Magic Longsword');
	});

	// D6 Task 4: createView now returns a RefUnwrapView (the withReference wrapper) —
	// it mounts a REAL StatblockElementView underneath for an inline body (see the
	// "ties StatblockElementView to host.addChild" / rendered-DOM tests below for
	// proof the base view still does the actual rendering).
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
		expect(statblockElement.createView(cx)).toBeInstanceOf(RefUnwrapView);
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

	test('cardHead (§3.8 fill): keywords → left eyebrow; name = the heading (aria-level 2); Level → right eyebrow; organization+role → right primary; EV → right deck (F2 §2.1 B1: SDK 3.x fields)', async () => {
		const { root } = await renderStatblock(humanBanditChief);

		const head = root.querySelector('.dse-sb > .dse-head') as HTMLElement;
		expect(head).not.toBeNull();

		expect(head.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('Human, Humanoid');

		const name = head.querySelector('.dse-head__primary--left') as HTMLElement;
		expect(name.getAttribute('role')).toBe('heading');
		expect(name.getAttribute('aria-level')).toBe('2');
		expect(name.textContent).toBe('Human Bandit Chief');

		expect(head.querySelector('.dse-head__eyebrow--right')!.textContent).toBe('Level 3');
		// "Horde Controller" style: organization then role. F2 review fix: the fixture
		// now carries the REAL production shape (organization: Leader, role: "") —
		// role is filtered out of the join since it's empty, so right-primary is just
		// the organization word. See the goblin-stinker fixture (statblockHeader.test.ts)
		// for the combined "Horde Controller" org+role case.
		expect(head.querySelector('.dse-head__primary--right')!.textContent).toBe('Leader');
		expect(head.querySelector('.dse-head__deck--right')!.textContent).toBe('EV 20');
	});

	test('cardHead fallbacks: missing level/role/organization/keywords/ev render the legacy N/A strings VERBATIM (never gaps — legacy always printed them)', async () => {
		const { root } = await renderStatblock(NO_FEATURES);

		const head = root.querySelector('.dse-sb > .dse-head') as HTMLElement;
		// F2 golden update: the legacy 'Unknown Ancestry' fallback has no 3.x analog —
		// a keywordless statblock's left-eyebrow slot renders empty (still mounted,
		// never a gap; see statblockHeaderParts in src/elements/statblock/view.ts).
		expect(head.querySelector('.dse-head__eyebrow--left')!.textContent).toBe('');
		expect(head.querySelector('.dse-head__primary--left')!.textContent).toBe('Bare Creature');
		expect(head.querySelector('.dse-head__eyebrow--right')!.textContent).toBe('Level N/A');
		expect(head.querySelector('.dse-head__primary--right')!.textContent).toBe('No Role');
		expect(head.querySelector('.dse-head__deck--right')!.textContent).toBe('EV N/A');
	});

	test('[data-dse-role]: the SDK combat role sets the attribute + the --dse-role element-set alias — via the organization fallback (real Leader shape: role: "")', async () => {
		const { root } = await renderStatblock(humanBanditChief);

		const card = root.querySelector('.dse-sb') as HTMLElement;
		// F2 review fix (task-1-review.md Critical): the fixture's role is empty
		// ("" — the real production shape for every Leader-org statblock), so this
		// now specifically exercises statblockHeaderParts' organization fallback
		// (role || organization), not a direct role match.
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

	test('SC-10 Task 4: cardHead crest is keyed to the SAME resolved role as the tint/band (organization fallback included) — .dse-crest--lg with the role glyph', async () => {
		const { root } = await renderStatblock(humanBanditChief);

		const head = root.querySelector('.dse-sb > .dse-head') as HTMLElement;
		const crestEl = head.querySelector<HTMLElement>(':scope > .dse-crest');
		expect(crestEl).not.toBeNull();
		expect(crestEl!.hasClass('dse-crest--lg')).toBe(true);
		// role: "" / organization: "Leader" -> resolved role "leader" -> 'crown'.
		expect(crestEl!.querySelector('.dse-crest__glyph')!.getAttribute('data-icon')).toBe('crown');
	});

	test('SC-10 Task 4: an unmapped/missing role renders NO crest at all (kit/crest.ts degrades to nothing, same fail-safe as the tint/band)', async () => {
		for (const source of [WITH_META, NO_FEATURES]) {
			const { root } = await renderStatblock(source);
			const head = root.querySelector('.dse-sb > .dse-head') as HTMLElement;
			expect(head.querySelector(':scope > .dse-crest')).toBeNull();
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
		const { root } = await renderStatblock(humanBanditChief, {}, { sbCharLine: 'one' });

		const chars = Array.from(root.querySelectorAll('.dse-sb__chars > .dse-sb__char')).map(
			(el) => el.textContent,
		);
		expect(chars).toEqual(['Might +2', 'Agility +3', 'Reason +2', 'Intuition +3', 'Presence +2']);
	});

	// Pinned to sbCharLine:'one' deliberately: these two assert formatCharacteristic's
	// output as ONE string, which only the merged shape produces. The default (split)
	// form's value parity is asserted separately, per-part, below.
	test('.dse-sb__chars formatting parity: negative "-N", zero "+0", missing "N/A" — the legacy formatCharacteristic verbatim', async () => {
		const { root } = await renderStatblock(WITH_META, {}, { sbCharLine: 'one' });

		const chars = Array.from(root.querySelectorAll('.dse-sb__chars > .dse-sb__char')).map(
			(el) => el.textContent,
		);
		expect(chars).toEqual(['Might -1', 'Agility +2', 'Reason +0', 'Intuition +1', 'Presence N/A']);
	});

	// SC-10 Task 4 tried this split and had to revert it: two inline spans shifted
	// Chromium's sub-pixel text shaping enough to fail the then-byte-identical freeze
	// gate on the SCREEN shots. SC-123 brought it back as an opt-in so the frozen
	// cameras kept shooting the merged node. Scott's 2026-08-12 ruling then made it the
	// DEFAULT ("nobody has this code yet … lets do the correct thing"), and the frozen
	// statblock print shots were rebaselined to match. Both shapes stay reachable and
	// tested; only which one is the default moved.
	test('at the DEFAULT settings .dse-sb__char is SPLIT into box/value/label — the site\'s shape', async () => {
		const { root } = await renderStatblock(humanBanditChief);

		const cell = root.querySelector('.dse-sb__chars > .dse-sb__char') as HTMLElement;
		expect(Array.from(cell.children).map((el) => el.className)).toEqual([
			'dse-sb__char-box', 'dse-sb__char-v', 'dse-sb__char-l',
		]);
		// No content loss against the merged form: same words, same order.
		expect(cell.textContent).toBe('M+2Might');
	});

	test('sbCharLine="one" (opt-in) collapses the cell back to ONE merged text node', async () => {
		const { root } = await renderStatblock(humanBanditChief, {}, { sbCharLine: 'one' });

		const cell = root.querySelector('.dse-sb__chars > .dse-sb__char') as HTMLElement;
		expect(cell.children).toHaveLength(0);
		expect(cell.textContent).toBe('Might +2');
	});

	// —— SC-123: the characteristics split (the default since the 2026-08-12 ruling) ——

	test('sbCharLine="two" splits each cell into box/value/label (the site\'s .sb__char-* DOM), text verbatim', async () => {
		const { root } = await renderStatblock(humanBanditChief, {}, { sbCharLine: 'two' });

		const cells = Array.from(root.querySelectorAll('.dse-sb__chars > .dse-sb__char'));
		expect(cells).toHaveLength(5);
		// DOM order is box, value, label — the site orders them with grid-areas/`order`.
		expect(Array.from(cells[0].children).map((el) => el.className)).toEqual([
			'dse-sb__char-box', 'dse-sb__char-v', 'dse-sb__char-l',
		]);
		expect(cells.map((el) => el.querySelector('.dse-sb__char-box')!.textContent)).toEqual([
			'M', 'A', 'R', 'I', 'P',
		]);
		expect(cells.map((el) => el.querySelector('.dse-sb__char-l')!.textContent)).toEqual([
			'Might', 'Agility', 'Reason', 'Intuition', 'Presence',
		]);
		expect(cells.map((el) => el.querySelector('.dse-sb__char-v')!.textContent)).toEqual([
			'+2', '+3', '+2', '+3', '+2',
		]);
		// NO CONTENT LOSS: the concatenation is still the merged string, word for word.
		expect(cells.map((el) => el.textContent)).toEqual([
			'M+2Might', 'A+3Agility', 'R+2Reason', 'I+3Intuition', 'P+2Presence',
		]);
	});

	test('sbCharBox alone also splits (the box is the reason to split at all); formatCharacteristic parity survives', async () => {
		const { root } = await renderStatblock(WITH_META, {}, { sbCharBox: 'on' });

		const cells = Array.from(root.querySelectorAll('.dse-sb__chars > .dse-sb__char'));
		expect(cells.map((el) => el.querySelector('.dse-sb__char-v')!.textContent)).toEqual([
			'-1', '+2', '+0', '+1', 'N/A',
		]);
		expect(cells[4].querySelector('.dse-sb__char-box')!.textContent).toBe('P');
	});

	test('flipping a characteristics pref REMOUNTS the card (shape, not reflow) and flipping back restores the default split', async () => {
		const { root, deps } = await renderStatblock(humanBanditChief);
		const cellOf = (): HTMLElement =>
			root.querySelector('.dse-sb__chars > .dse-sb__char') as HTMLElement;
		// The default is now the split shape, so the round trip runs the other way.
		expect(cellOf().children).toHaveLength(3);

		await deps.prefs.set('sbCharLine', 'one');
		await flushAsync(2);
		expect(cellOf().children).toHaveLength(0);
		expect(cellOf().textContent).toBe('Might +2');

		await deps.prefs.set('sbCharLine', 'two');
		await flushAsync(2);
		expect(cellOf().children).toHaveLength(3);
		expect(cellOf().textContent).toBe('M+2Might');
	});

	test("features render through Task 5's renderFeatureList: ◆ divider, then .dse-feature__nested > .dse-feature cards (shared grammar)", async () => {
		const { root } = await renderStatblock(humanBanditChief);

		// The legacy ◆ rule between the stats and the features survives as the kit
		// divider (ornament) — pixel-faithful to today's .ds-hr-container in Legacy.
		expect(root.querySelector('.dse-sb > .dse-hr .dse-hr__diamond')).not.toBeNull();

		const list = root.querySelector('.dse-sb > .dse-feature__nested') as HTMLElement;
		expect(list).not.toBeNull();
		const cards = list.querySelectorAll(':scope > .dse-feature');

		// The default bands villain actions since the 2026-08-12 ruling, so the main run
		// holds the five non-villain features and the band holds the three villain ones.
		// Assert the SPLIT explicitly (it is the default's defining shape) and then that
		// nothing was lost across the pair — all eight cards, in source order.
		expect(cards).toHaveLength(5);
		const band = root.querySelector<HTMLElement>('.dse-sb__band--villain')!;
		expect(band.querySelectorAll('.dse-feature')).toHaveLength(3);

		const nameOf = (c: Element): string | null =>
			c.querySelector('.dse-head__primary--left')!.textContent;
		expect(Array.from(cards).map(nameOf)).toEqual([
			'Whip and Magic Longsword',
			'Kneel, Peasant!',
			'Bloodstones',
			'End Effect',
			'Supernatural Insight',
		]);
		expect(Array.from(band.querySelectorAll('.dse-feature')).map(nameOf)).toEqual([
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

	// SC-102: the bandit chief's three villain actions carry `ability_type: Villain
	// Action N` + the lone-dash placeholder `usage: "-"`. Before the fix the truthy
	// dash short-circuited `usage ?? ability_type`, so these three cards resolved to
	// NO action type at all — no spine, no crest. The DOM change is theme-agnostic
	// (Legacy hides .dse-crest and maps --dse-act-villain to `none`, so its shots are
	// byte-identical; only Steel paints it).
	test('SC-102: the three villain actions map to [data-dse-act="villain"] + the skull crest', async () => {
		const { root } = await renderStatblock(humanBanditChief);

		const villains = Array.from(
			root.querySelectorAll<HTMLElement>('.dse-feature[data-dse-act="villain"]'),
		);
		expect(villains.map((el) => el.querySelector('.dse-head__primary--left')!.textContent)).toEqual([
			'Shoot!',
			'Form Up!',
			'Lead From the Front',
		]);
		for (const card of villains) {
			expect(card.style.getPropertyValue('--dse-act')).toBe('var(--dse-act-villain)');
			expect(card.querySelector('.dse-crest__glyph')!.getAttribute('data-icon')).toBe('skull');
		}
	});

	// SC-102 fix round — THE H-1 CATCHER. The test above renders the plugin's
	// hand-authored `ability_type: Villain Action N` shape; steel-etl emits something
	// else entirely: `cost: Villain Action N` + the lone-dash `usage: '-'` and NO
	// ability_type (the string "ability_type: Villain" occurs ZERO times in the whole
	// shipped corpus; all 156 dash-usage features are villain-by-cost). With only the
	// ability_type path implemented, SC-102 was a no-op on every generated statblock
	// while the suite and every screenshot showed it working. This test renders the
	// corpus shape, so that can never silently recur.
	test('SC-102 (H-1): the CORPUS shape — cost + dash usage, no ability_type — maps to villain + skull', async () => {
		// Pin the fixture's own shape first, so this test cannot stop being the catcher:
		// a villain COST, a lone-dash usage, and NOT ONE ability_type villain descriptor.
		expect(statblockVillainCorpus).toMatch(/^\s+cost: Villain Action 1$/m);
		expect(statblockVillainCorpus).toMatch(/^\s+usage: '-'$/m);
		// (anchored: the fixture's own header COMMENT names the shape it is not)
		expect(statblockVillainCorpus).not.toMatch(/^\s*ability_type:.*[Vv]illain/m);

		const { root } = await renderStatblock(statblockVillainCorpus);

		const villains = Array.from(
			root.querySelectorAll<HTMLElement>('.dse-feature[data-dse-act="villain"]'),
		);
		expect(villains.map((el) => el.querySelector('.dse-head__primary--left')!.textContent)).toEqual([
			'Shoot!',
			'Form Up!',
		]);
		for (const card of villains) {
			expect(card.style.getPropertyValue('--dse-act')).toBe('var(--dse-act-villain)');
			expect(card.querySelector('.dse-crest__glyph')!.getAttribute('data-icon')).toBe('skull');
		}
		// …and the ordinary Main-action ability in the same statblock is untouched.
		const main = root.querySelector<HTMLElement>('.dse-feature[data-dse-act="main"]')!;
		expect(main.querySelector('.dse-head__primary--left')!.textContent).toBe(
			'Whip and Magic Longsword',
		);
	});

	// —— SC-123 / FOLLOWUPS #54: villain BANDING, the default since the 2026-08-12 ruling ——

	test('sbVillain default ("banded") lifts the villain actions into a band — the site\'s shape', async () => {
		const { root } = await renderStatblock(statblockVillainCorpus);

		expect(root.querySelector('.dse-sb__band.dse-sb__band--villain')).not.toBeNull();
		// The main run keeps every non-villain feature and loses none to the band.
		const mainRun = root.querySelector<HTMLElement>('.dse-sb > .dse-feature__nested')!;
		expect(mainRun.querySelector('.dse-feature[data-dse-act="villain"]')).toBeNull();
		expect(mainRun.querySelector('.dse-feature[data-dse-act="main"]')).not.toBeNull();
	});

	test('sbVillain="inline" (opt-in) builds NO band — one flat list in source order', async () => {
		const { root } = await renderStatblock(statblockVillainCorpus, {}, { sbVillain: 'inline' });

		expect(root.querySelector('.dse-sb__band')).toBeNull();
		expect(root.querySelectorAll('.dse-sb > .dse-feature__nested')).toHaveLength(1);
	});

	test('sbVillain="banded" lifts the villain actions into one collapsible band below the rest', async () => {
		const { root } = await renderStatblock(statblockVillainCorpus, {}, { sbVillain: 'banded' });

		const band = root.querySelector<HTMLElement>('.dse-sb__band.dse-sb__band--villain')!;
		expect(band).not.toBeNull();
		// The kit collapsible supplies the affordance: a real button, expanded, wired to
		// its region — the plugin never hand-rolls a <details>.
		const header = band.querySelector<HTMLElement>('.dse-collapse__header')!;
		expect(header.tagName).toBe('BUTTON');
		expect(header.getAttribute('aria-expanded')).toBe('true');
		expect(band.querySelector('.dse-collapse__title')!.textContent).toBe('Villain Actions');
		// Crest before the title (chevron, crest, title), keyed to the same skull the
		// villain cards themselves carry. The band's tint comes from the `--villain`
		// modifier in the sheet, not an inline alias — nothing here is dynamic.
		expect(band.querySelector('.dse-sb__band-crest')!.getAttribute('data-icon')).toBe('skull');
		expect(Array.from(header.children).map((el) => el.className)).toEqual([
			'dse-collapse__chevron', 'dse-sb__band-crest', 'dse-collapse__title',
		]);
		expect(band.getAttribute('style')).toBeNull();

		// Exactly the villain actions inside, in source order…
		const inBand = Array.from(
			band.querySelectorAll<HTMLElement>('.dse-collapse__region .dse-feature'),
		);
		expect(inBand.map((el) => el.getAttribute('data-dse-act'))).toEqual(['villain', 'villain']);
		expect(inBand.map((el) => el.querySelector('.dse-head__primary--left')!.textContent)).toEqual([
			'Shoot!',
			'Form Up!',
		]);
		// …and NOTHING else: the main run keeps every non-villain feature and loses none.
		const mainRun = root.querySelector<HTMLElement>('.dse-sb > .dse-feature__nested')!;
		expect(mainRun.querySelector('.dse-feature[data-dse-act="villain"]')).toBeNull();
		expect(mainRun.querySelector('.dse-feature[data-dse-act="main"]')).not.toBeNull();
	});

	test('sbVillain="banded" on a statblock with NO villain action builds no band at all', async () => {
		const { root } = await renderStatblock(humanBanditChief, {}, { sbVillain: 'banded' });

		// human-bandit-chief's villain actions are the ability_type shape, so they DO
		// classify — the no-band case is the roleless corpus fixture, which has none.
		const { root: roleless } = await renderStatblock(
			statblockRolelessCorpus,
			{},
			{ sbVillain: 'banded' },
		);
		expect(roleless.querySelector('.dse-feature[data-dse-act="villain"]')).toBeNull();
		expect(roleless.querySelector('.dse-sb__band')).toBeNull();
		expect(root.querySelector('.dse-sb__band')).not.toBeNull();
	});

	// FOLLOWUPS #56 — THE ROLELESS CATCHER. #56 existed for one reason: no fixture
	// anywhere rendered a statblock whose role maps to nothing, so the Steel rule pair that
	// erased its section break (an UNGATED `.dse-hr` suppression against a
	// [data-dse-role]-GATED replacement notch) could not be seen by any camera, freeze line
	// or assertion. This test makes the roleless card permanently expressible; the gate
	// symmetry itself is asserted in test/dom/theme/steelMaterial.test.ts.
	test('FOLLOWUPS #56: the CORPUS roleless shape — role "" + a non-role organization — sets NO data-dse-role, and still mounts its ◆ divider node', async () => {
		// Pin the fixture's own shape first, so this test cannot stop being the catcher.
		expect(statblockRolelessCorpus).toMatch(/^role: ""$/m);
		expect(statblockRolelessCorpus).toMatch(/^organization: Champion$/m);

		const { root } = await renderStatblock(statblockRolelessCorpus);
		const card = root.querySelector('.dse-sb') as HTMLElement;

		// The fail-safe tint pair: unmapped role sets NEITHER the attribute nor the alias.
		// ("champion" is not in DSE_ROLES, and statblockHeaderParts' role||organization
		// fallback therefore finds nothing either — that fallback is why `role: ""` alone
		// is NOT enough to produce a roleless card, and why this fixture needs the
		// organization to be a non-role word.)
		expect(card.hasAttribute('data-dse-role')).toBe(false);
		expect(card.style.getPropertyValue('--dse-role')).toBe('');

		// The divider node is mounted regardless of theme (kit/divider.ts, view.ts:272);
		// what changed in #56 is only whether Steel CSS hides it.
		expect(root.querySelector('.dse-sb > .dse-hr .dse-hr__diamond')).not.toBeNull();

		// Contrast: the role-mapped fixture DOES carry the pair, so the assertion above is
		// about this fixture's shape and not about the selector being wrong everywhere.
		const { root: mapped } = await renderStatblock(humanBanditChief);
		expect(mapped.querySelector('.dse-sb')!.getAttribute('data-dse-role')).toBe('leader');
	});

	test('no features -> no divider and no feature list; head + meta + chars still render', async () => {
		const { root } = await renderStatblock(NO_FEATURES);
		expect(root.querySelector('.dse-hr')).toBeNull();
		expect(root.querySelector('.dse-feature__nested')).toBeNull();
		expect(root.querySelector('.dse-sb > .dse-head')).not.toBeNull();
		expect(root.querySelector('.dse-sb__meta')).not.toBeNull();
		expect(root.querySelector('.dse-sb__chars')).not.toBeNull();
	});

	// Both content-loss tests run at sbCharLine:'one'. They compare against the legacy
	// view tree's output as VERBATIM strings ("Might +2"), which only the merged cell
	// produces — the default split spells the same words as "M+2Might". The default
	// shape's own no-loss claim is asserted per-part in the characteristics tests above.
	test('NO content loss: every field the legacy HeaderView/StatsView/FeaturesView tree rendered appears verbatim (bandit chief)', async () => {
		const { root } = await renderStatblock(humanBanditChief, {}, { sbCharLine: 'one' });
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
		const { root } = await renderStatblock(NO_FEATURES, {}, { sbCharLine: 'one' });
		const text = root.textContent!;

		for (const expected of [
			'Bare Creature',
			// F2 golden update: 'Unknown Ancestry' has no 3.x analog — a keywordless
			// statblock's left-eyebrow slot now renders empty (see the cardHead
			// fallbacks test above), so it is deliberately absent from this list.
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

	// Split in two by the 2026-08-12 default flip. The statblock is still a read-only
	// render — it never writes back and mounts no EDITING affordance — but the banded
	// villain default now ships one disclosure button (the kit collapsible's header).
	// A disclosure is not an edit, so the claim is narrowed rather than dropped, and the
	// absolute no-controls form is kept against the un-banded shape.
	//
	// SC-169 widened both claims by exactly two buttons: the statblock opted into the
	// framework element chrome, which always mounts a collapse toggle (in the hover panel)
	// and its twin expand affordance (on the collapsed one-line bar). Both are
	// FRAMEWORK-owned disclosures carrying `data-dse-chrome-item`, so the tests below
	// filter them out by that attribute rather than by count — the point being defended is
	// that the statblock's OWN rendering still mounts no control beyond the villain band.
	const nonChromeControls = (root: HTMLElement): Element[] =>
		Array.from(root.querySelectorAll('button, input, select, textarea, [tabindex]')).filter(
			(el) => !el.hasAttribute('data-dse-chrome-item'),
		);

	test('static: rendering never writes back, and the only control is the villain band\'s disclosure', async () => {
		const { root, host } = await renderStatblock(humanBanditChief);
		expect(host.replaceSource).not.toHaveBeenCalled();

		const controls = nonChromeControls(root);
		expect(controls).toHaveLength(1);
		expect(controls[0].className).toBe('dse-collapse__header');
		// A disclosure, not an input: it toggles visibility and nothing else.
		expect(controls[0].getAttribute('aria-expanded')).toBe('true');
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
	});

	test('static: with villain banding off, the card mounts NO interactive control of its own', async () => {
		const { root, host } = await renderStatblock(humanBanditChief, {}, { sbVillain: 'inline' });
		expect(host.replaceSource).not.toHaveBeenCalled();
		expect(nonChromeControls(root)).toHaveLength(0);
		expect(root.querySelectorAll('.dse-error-card')).toHaveLength(0);
	});

	test('SC-169/SC-184: the only controls the FRAMEWORK adds are collapse/expand + pin', async () => {
		const { root } = await renderStatblock(humanBanditChief, {}, { sbVillain: 'inline' });
		const chrome = Array.from(root.querySelectorAll('[data-dse-chrome-item]')).map((el) =>
			el.getAttribute('data-dse-chrome-item'),
		);
		// SC-184: a reading-mode, persistable host (this harness's default) also gets "Pin to
		// sidebar" now — gated the same way the edit pencil is (canPersist).
		expect(chrome.sort()).toEqual(['collapse', 'expand', 'pin']);
	});

	test('ties the created view to host.addChild (block lifecycle); a real StatblockElementView still renders underneath (D6 Task 4: wrapped in RefUnwrapView)', async () => {
		const addChild = jest.fn((child: unknown) => child);
		const { root } = await renderStatblock(humanBanditChief, { addChild } as Partial<BlockHost>);
		expect(addChild).toHaveBeenCalledTimes(1);
		expect(addChild.mock.calls[0][0]).toBeInstanceOf(RefUnwrapView);
		// StatblockElementView is not lost — it's mounted as RefUnwrapView's own child
		// (Component.addChild, tracked for teardown) and does the actual rendering.
		expect(root.querySelector(':scope > .dse-sb')).not.toBeNull();
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

	test('SC-10 Task 4: forged-plate CSS (role band, boxed item/kv/chars cells) is entirely Steel-scoped + screen-only, so Legacy/print never see it', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');

		// Role-tinted header band: only fires with a mapped role, print-excluded.
		expect(sheet).toMatch(
			/\[data-dse-theme='steel'\]:not\(\[data-dse-print="on"\]\) \.dse-sb\[data-dse-role\] > \.dse-head\s*\{/,
		);
		// Boxed stat/kv/chars cells, all Steel + screen-only scoped.
		for (const selector of [
			".dse-sb__item {",
			".dse-sb__kv {",
			".dse-sb__chars {",
			".dse-sb__char {",
		]) {
			const scopedRule = `[data-dse-theme='steel']:not([data-dse-print="on"]) ${selector}`;
			expect(sheet).toContain(scopedRule);
		}
		// The shared emboss rule now also covers the statblock's own big 5-stat
		// numeral and the (merged-text) characteristics cell (SC-10 Task 7 further
		// extends the same shared rule to the D6 reference-card family's own
		// title, .dse-card__title — the last selector in the list).
		const emboss = sheet.match(/text-shadow: var\(--dse-emboss\);\s*\}/);
		expect(emboss).not.toBeNull();
		expect(sheet).toMatch(
			/\[data-dse-theme='steel'\] \.dse-sb__item-v,\s*\n\[data-dse-theme='steel'\] \.dse-sb__char,\s*\n\[data-dse-theme='steel'\] \.dse-card__title\s*\{/,
		);
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
