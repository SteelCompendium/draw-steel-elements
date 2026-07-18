// D7 Task 9 (spec §3.2/§3.3, OD-5/6/8, recon delta 1/5/7) — HeroSheetView through the
// REAL ElementPipeline: every region mounts, the stamina/conditions cross-refresh, the
// existing setCharacteristicProvider roll bridge (feature/view.ts) drives an ability
// card's roll and the sheet reacts (a hit nudges Surges), [respite] resets play state,
// "Edit definition" reuses D9's openFormEditor with the play surface hidden from the
// form, and read-only mounts real-disable every write affordance (F1 §4.4).
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import { PERSIST_DEBOUNCE_MS } from '../../../src/framework/view';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { heroElement } from '../../../src/elements/hero/definition';
import { registerFrameworkElementDefinitions } from 'main';
import { createElementRegistry } from '../../../src/framework/registry';
import { makeCompendiumDeps, loadMdDseFixture } from './_refHarness';
import { stubService } from './rollTestHelpers';
import { flushAsync } from '../../mocks/obsidian';
// jest.mock hoists above these imports; the mocked binding is used by every test below
// that cares about the "Edit definition" wiring (OD-5's D9 reuse, recon delta 5).
import { openFormEditor } from '../../../src/authoring/FormModal';

jest.mock('../../../src/authoring/FormModal', () => ({ openFormEditor: jest.fn() }));

const HERO_SOURCE = `name: Torin Stonefist
level: 3
ancestry: scc.v1:mcdm.heroes.v1/ancestry/dwarf
class: scc.v1:mcdm.heroes.v1/class/fury
kits: [scc.v1:mcdm.heroes.v1/kit/mountain]
characteristics: { might: 2, agility: 2, reason: -1, intuition: 0, presence: 1 }
skills: [Endurance, Intimidate, Nature]
abilities:
  - name: Brute Strike
    ability_type: Main action
    usage: Main action
    effects:
      - name: Effect
        effect: Deal damage equal to might.
  - name: Into the Fray
    cost: 3 Ferocity
    ability_type: Main action
    usage: Main action
    effects:
      - roll: Power Roll + Might
        tier1: Tier one outcome.
        tier2: Tier two outcome.
        tier3: Tier three outcome.
state:
  stamina: { current: 31, temp: 0 }
  resource: 4
  surges: 1
  recoveries: 6
  victories: 2
  conditions:
    - { key: bleeding, effect: "save ends" }
`;

function makeHost(overrides: Partial<BlockHost> = {}) {
	const replaceSource = jest.fn(async (_newSource: string) => true);
	const containerEl = document.createElement('div');
	const host = {
		mode: 'reading' as RenderMode,
		sourcePath: 'Hero.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-hero', lineStart: 0, lineEnd: 20 }),
		replaceSource,
		blockKey: () => 'Hero.md::ds-hero::0',
		...overrides,
	};
	return host as BlockHost & { containerEl: HTMLElement; replaceSource: typeof replaceSource };
}

/** Real compendium (fury/mountain/dwarf, matching heroResolve.test.ts's fixture set) +
 *  a deterministic dice source ([5,6] -> natural 11 -> +2 Might = 13 -> tier 2, the same
 *  convention rollTestHelpers.ts / feature-roll.test.ts use). */
function makeDeps(): ElementPipelineDeps {
	const { deps, vault } = makeCompendiumDeps();
	loadMdDseFixture(vault, 'class/fury.md');
	loadMdDseFixture(vault, 'kit/mountain.md');
	loadMdDseFixture(vault, 'ancestry/dwarf.md');
	return { ...deps, roll: stubService([5, 6]) };
}

async function renderHero(
	source: string = HERO_SOURCE,
	hostOverrides: Partial<BlockHost> = {},
	deps: ElementPipelineDeps = makeDeps(),
) {
	const pipeline = new ElementPipeline(deps);
	const host = makeHost(hostOverrides);
	await pipeline.run(heroElement, source, host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { host, root, deps };
}

function region(root: HTMLElement, id: string): HTMLElement | null {
	return root.querySelector(`[data-dse-hero-region="${id}"]`);
}

/** Everything before the top-level `state:` key, trailing-whitespace trimmed — the
 *  state-scoped splice's own byte-stability contract (Task 7 spec §3.4). */
function defnPortion(source: string): string {
	const idx = source.search(/^state:/m);
	return (idx === -1 ? source : source.slice(0, idx)).replace(/\s+$/u, '');
}

describe('D7 Task 9: ds-hero registration', () => {
	test('registered by the framework registry; the canonical alias resolves to it', () => {
		const registry = createElementRegistry();
		registerFrameworkElementDefinitions(registry);
		expect(registry.get('hero')?.id).toBe('hero');
		expect(registry.get('ds-hero')?.id).toBe('hero');
	});

	test('suppresses the pipeline\'s generic authoringControls pencil (its own header affordance instead)', () => {
		expect(heroElement.noAuthoringButton).toBe(true);
	});
});

describe('D7 Task 9: all seven regions mount', () => {
	test('characteristics, stamina, resource, surges, conditions, skills, abilities', async () => {
		const { root } = await renderHero();
		expect(root.getAttribute('data-dse-element')).toBe('hero');

		expect(region(root, 'characteristics')?.querySelector('.dse-statgrid')).not.toBeNull();
		expect(region(root, 'stamina')?.querySelector('.dse-stamina')).not.toBeNull();
		expect(region(root, 'resource')?.querySelector('.dse-res__stepper')).not.toBeNull();
		expect(region(root, 'surges')?.querySelector('.dse-surge__stepper')).not.toBeNull();
		expect(region(root, 'conditions')?.querySelector('.dse-cond-strip')).not.toBeNull();
		expect(region(root, 'skills')?.querySelectorAll('.dse-hero__skill-chip').length).toBe(3);
		expect(region(root, 'abilities')?.querySelectorAll('.dse-hero__ability-row').length).toBe(2);

		// resolved class/kit/ancestry feed the derived Stamina (RR §4: 21 + 9*2 + 9*1 = 48).
		expect(root.querySelector('.dse-stamina__num')?.textContent).toContain('31/48');
		expect(root.querySelectorAll('.dse-hero-ref-issue').length).toBe(0);
	});
});

describe('D7 Task 9: a stamina change re-derives winded + refreshes conditions + persists', () => {
	test('dropping stamina to <= 24 (windedThreshold) shows Winded and the persisted hero: region is byte-identical', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderHero();

		const minus = region(root, 'stamina')!.querySelector<HTMLButtonElement>('button[aria-label="Decrease Stamina"]')!;
		for (let i = 0; i < 8; i++) minus.click(); // 31 -> 23 (<= 24 windedThreshold)

		expect(region(root, 'stamina')!.querySelector('.dse-stamina-rec__status')?.textContent).toBe('Winded');
		const badge = region(root, 'conditions')!.querySelector('.dse-hero__wound-badge')!;
		expect(badge.textContent).toBe('Winded');

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		expect(host.replaceSource).toHaveBeenCalledTimes(1);
		const written = host.replaceSource.mock.calls[0][0] as string;
		expect(written).toContain('current: 23');
		expect(defnPortion(written)).toBe(defnPortion(HERO_SOURCE));
		jest.useRealTimers();
	});
});

describe('D7 Task 9: ability roll bridge (recon delta 1) — expand, roll, react', () => {
	// Real timers throughout: flushAsync (feature-roll.test.ts's own convention) drains
	// the click -> async roll() microtask chain via a real setTimeout(…,0), which a
	// jest.useFakeTimers() clock never advances on its own — the persist debounce below
	// is instead awaited with a real wait, not jest.advanceTimersByTimeAsync.
	test('expanding "Into the Fray" and rolling uses the hero\'s Might via the provider; a tier-2 hit nudges Surges down', async () => {
		const deps = makeDeps();
		await deps.prefs.set('rollingEnabled', true);
		const { root, host } = await renderHero(HERO_SOURCE, {}, deps);

		const rows = region(root, 'abilities')!.querySelectorAll('.dse-hero__ability-row');
		const intoTheFrayRow = Array.from(rows).find((r) => r.textContent?.includes('Into the Fray'))!;
		intoTheFrayRow.querySelector<HTMLButtonElement>('.dse-hero__ability-toggle')!.click();
		await flushAsync(2);

		const rollBtn = intoTheFrayRow.querySelector<HTMLButtonElement>('button[aria-label^="Roll "]');
		expect(rollBtn).not.toBeNull();
		rollBtn!.click();
		await flushAsync(2);

		// [5,6] -> natural 11 + Might(+2) = 13 -> tier 2 (12-16).
		expect(intoTheFrayRow.querySelector('.dse-rollcard__headline')?.textContent).toBe('Tier 2 · 13');

		const surgeValue = region(root, 'surges')!.querySelector<HTMLInputElement>('.dse-surge__stepper .dse-stepper__input')!;
		expect(surgeValue.value).toBe('0'); // 1 -> 0

		await new Promise((resolve) => setTimeout(resolve, PERSIST_DEBOUNCE_MS + 50));
		const lastCall = host.replaceSource.mock.calls[host.replaceSource.mock.calls.length - 1];
		expect(lastCall?.[0]).toContain('surges: 0');
	}, 10000);
});

describe('D7 Task 9: [respite] (OD-8)', () => {
	test('restores Stamina + Recoveries to derived max, clears Surges/temp/EoE conditions', async () => {
		jest.useFakeTimers();
		const source = HERO_SOURCE.replace(
			'conditions:\n    - { key: bleeding, effect: "save ends" }',
			'conditions:\n    - { key: bleeding, effect: "save ends" }\n    - { key: dazed, effect: "EoE" }',
		).replace('temp: 0', 'temp: 2');
		const { root, host } = await renderHero(source);

		root.querySelector<HTMLButtonElement>('button[aria-label="Respite"]')!.click();

		expect(region(root, 'stamina')!.querySelector('.dse-stamina__num')?.textContent).toContain('48/48');
		const surgeValue = region(root, 'surges')!.querySelector<HTMLInputElement>('.dse-surge__stepper .dse-stepper__input')!;
		expect(surgeValue.value).toBe('0');
		const chipNames = Array.from(region(root, 'conditions')!.querySelectorAll('.dse-cond-chip__name')).map((n) => n.textContent);
		expect(chipNames).toEqual(['Bleeding']); // the EoE "Dazed" chip is cleared; save-ends "Bleeding" survives

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
		const calls = host.replaceSource.mock.calls;
		const written = calls[calls.length - 1][0];
		expect(written).toContain('current: 48');
		expect(written).toContain('recoveries: 10');
		expect(written).toContain('surges: 0');
		expect(written).not.toContain('dazed');
		jest.useRealTimers();
	});
});

describe('D7 Task 9: "Edit definition" (recon delta 5) — reuses D9\'s openFormEditor, gated on authoringControls', () => {
	afterEach(() => jest.mocked(openFormEditor).mockClear());

	test('authoringControls off: no affordance rendered', async () => {
		const { root } = await renderHero();
		expect(root.querySelector('[aria-label="Edit definition"]')).toBeNull();
	});

	test('authoringControls on: the button calls openFormEditor with heroElement + the full current source', async () => {
		const deps = makeDeps();
		await deps.prefs.set('authoringControls', true);
		const { root } = await renderHero(HERO_SOURCE, {}, deps);

		const btn = root.querySelector<HTMLButtonElement>('[aria-label="Edit definition"]');
		expect(btn).not.toBeNull();
		btn!.click();

		expect(openFormEditor).toHaveBeenCalledTimes(1);
		const call = jest.mocked(openFormEditor).mock.calls[0];
		expect(call[2]).toBe(heroElement);
		const source = call[3] as string;
		expect(source).toContain('name: Torin Stonefist');
		expect(source).toContain('state:');
		expect(call[4]).toBe(deps.validation);
	});

	test('the schema hides `state` from the D9 form (definition.ts authoring.fields)', () => {
		expect(heroElement.authoring?.fields?.state?.hidden).toBe(true);
	});
});

describe('D7 Task 9: read-only mount (canPersist=false) disables every write affordance', () => {
	test('stamina stepper, Catch Breath, Respite, resource stepper are real-disabled; no writes occur', async () => {
		jest.useFakeTimers();
		const { root, host } = await renderHero(HERO_SOURCE, { canPersist: false });

		const staminaRegion = region(root, 'stamina')!;
		expect(staminaRegion.querySelector<HTMLButtonElement>('button[aria-label="Decrease Stamina"]')!.disabled).toBe(true);
		expect(staminaRegion.querySelector<HTMLButtonElement>('button[aria-label="Increase Stamina"]')!.disabled).toBe(true);
		expect(staminaRegion.querySelector<HTMLButtonElement>('button[aria-label="Catch Breath"]')!.disabled).toBe(true);

		expect(root.querySelector<HTMLButtonElement>('button[aria-label="Respite"]')!.disabled).toBe(true);

		const resourceRegion = region(root, 'resource')!;
		expect(resourceRegion.querySelector<HTMLButtonElement>('.dse-res__stepper button[aria-label^="Decrease"]')!.disabled).toBe(true);
		expect(resourceRegion.querySelector<HTMLButtonElement>('.dse-res__stepper button[aria-label^="Increase"]')!.disabled).toBe(true);

		const surgeRegion = region(root, 'surges')!;
		expect(surgeRegion.querySelector<HTMLButtonElement>('.dse-surge__stepper button[aria-label^="Decrease"]')!.disabled).toBe(true);

		// ConditionsPanel omits the "+ add condition" affordance entirely when read-only
		// (Task 2's own contract) rather than disabling a dead-end control.
		expect(region(root, 'conditions')!.querySelector('.dse-cond-strip__add')).toBeNull();

		await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
		expect(host.replaceSource).not.toHaveBeenCalled();
		jest.useRealTimers();
	});
});
