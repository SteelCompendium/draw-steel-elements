// SC-141 — `ds-hero` abilities that are authored as SCC codes.
//
// Regression origin (Scott's report): a VALID full code
// (`scc.v1:mcdm.heroes.v1/feature.ability.shadow.level-1/coat-the-blade`) rendered as an
// error row reading `"Coat the Blade" found but is not an ability entry.` The file was
// found, and it does carry a ```ds-feature block — but the frontmatter `type:` steel-etl
// writes for an ability is `ability`, not `feature`, and TYPE_ADAPTERS' ds-feature entry
// was scoped `/^feature($|\.)/`, so `getEntity().model()` returned `undefined` for all 621
// ability files (and all 95 `type: trait` files) in the real corpus.
//
// The fixture here (`feature/ability/shadow/level-1/coat-the-blade.md`) is copied VERBATIM
// from data-unified's md-dse output — the exact bytes a real `Sync compendium` installs —
// precisely because every pre-existing feature fixture was a `type: feature` file, which is
// how the gap stayed invisible.
//
// Also pinned here: per-entry error isolation. One bad ability entry must cost exactly one
// row; it must never take down the abilities section or the sheet.
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import type { CompendiumIndex } from '@/services/CompendiumIndex';
import { heroElement } from '../../../src/elements/hero/definition';
import { featureElement } from '../../../src/elements/feature/definition';
import { makeCompendiumDeps, loadMdDseFixture } from './_refHarness';

const COAT_THE_BLADE = 'scc.v1:mcdm.heroes.v1/feature.ability.shadow.level-1/coat-the-blade';
/** Scott's second entry, verbatim: a literal `...` ellipsis left in from template text —
 *  invalid by construction, and the corpus has no "Into the Fray" ability at all. */
const PLACEHOLDER = 'scc.v1:mcdm.heroes.v1/.../into-the-fray';

function heroSource(abilities: string[]): string {
	return `name: Torin Stonefist
level: 3
ancestry: scc.v1:mcdm.heroes.v1/ancestry/dwarf
class:   scc.v1:mcdm.heroes.v1/class/fury
subclass: berserker
kits:    [scc.v1:mcdm.heroes.v1/kit/mountain]
characteristics: { might: 2, agility: 2, reason: -1, intuition: 0, presence: 1 }
skills:  [Endurance, Intimidate, Nature]
abilities:
${abilities.map((a) => `  - ${a}`).join('\n')}
state:
  stamina: { current: 38, temp: 0 }
  resource: 4
  surges: 1
  recoveries: 3
  victories: 2
`;
}

function makeHost(): BlockHost & { containerEl: HTMLElement } {
	const containerEl = document.createElement('div');
	return {
		mode: 'reading' as RenderMode,
		sourcePath: 'Hero.md',
		containerEl,
		canPersist: true,
		addChild: (child) => child,
		getBlockInfo: () => ({ language: 'ds-hero', lineStart: 0, lineEnd: 20 }),
		replaceSource: async () => true,
		blockKey: () => 'Hero.md::ds-hero::0',
	};
}

/** Real CompendiumIndex over the real synced md-dse bytes, including the ability file. */
function makeDeps(): ElementPipelineDeps {
	const { deps, vault } = makeCompendiumDeps();
	loadMdDseFixture(vault, 'class/fury.md');
	loadMdDseFixture(vault, 'kit/mountain.md');
	loadMdDseFixture(vault, 'ancestry/dwarf.md');
	loadMdDseFixture(vault, 'feature/ability/shadow/level-1/coat-the-blade.md');
	return deps;
}

async function renderHero(abilities: string[], deps: ElementPipelineDeps = makeDeps()) {
	const pipeline = new ElementPipeline(deps);
	const host = makeHost();
	await pipeline.run(heroElement, heroSource(abilities), host);
	const root = host.containerEl.firstElementChild as HTMLElement;
	return { root, host };
}

function abilityRows(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>('.dse-hero__ability-row'));
}

function rowName(row: HTMLElement): string {
	return row.querySelector('.dse-hero__ability-name')?.textContent ?? '';
}

function rowIssue(row: HTMLElement): string | null {
	return row.querySelector('.dse-hero__ability-issue')?.textContent ?? null;
}

describe('SC-141: a valid full SCC ability code resolves in the hero sheet', () => {
	test('`feature.ability.*` (frontmatter `type: ability`) renders the real ability, not an error row', async () => {
		const { root } = await renderHero([COAT_THE_BLADE]);

		const rows = abilityRows(root);
		expect(rows).toHaveLength(1);
		expect(rowName(rows[0])).toBe('Coat the Blade');
		expect(rowIssue(rows[0])).toBeNull();
		// The regression's exact words — never again for a code that resolves.
		expect(root.textContent).not.toContain('is not an ability entry');
		// A resolved row is expandable; an issue row is not (it has no card to open).
		expect(rows[0].querySelector('.dse-hero__ability-toggle')).not.toBeNull();
	});

	test('the row expands into the REAL migrated Feature card (the resolved model, not a stub)', async () => {
		const { root } = await renderHero([COAT_THE_BLADE]);
		const row = abilityRows(root)[0];

		row.querySelector<HTMLButtonElement>('.dse-hero__ability-toggle')!.click();
		await new Promise((r) => setTimeout(r, 0));

		const body = row.querySelector<HTMLElement>('.dse-hero__ability-body')!;
		expect(body.hidden).toBe(false);
		expect(body.querySelector('.dse-feature')).not.toBeNull();
		expect(body.textContent).toContain('A little poison goes a long way.');
	});

	test('a resolved ability is classifiable by the tabs filter (signature — no cost)', async () => {
		const { root } = await renderHero([COAT_THE_BLADE]);
		const region = root.querySelector<HTMLElement>('[data-dse-hero-region="abilities"]')!;
		const signature = Array.from(region.querySelectorAll<HTMLElement>('button, [role="tab"]'))
			.find((b) => b.textContent?.trim() === 'Signature');
		expect(signature).toBeDefined();

		signature!.click();
		expect(abilityRows(root)[0].hidden).toBe(false);
	});
});

describe('SC-141: per-entry error isolation', () => {
	test("Scott's exact input — one valid code + one literal-ellipsis placeholder — renders one good row and one error row", async () => {
		const { root } = await renderHero([COAT_THE_BLADE, PLACEHOLDER]);

		const rows = abilityRows(root);
		expect(rows).toHaveLength(2);

		// The valid entry is unaffected by its broken sibling.
		expect(rowName(rows[0])).toBe('Coat the Blade');
		expect(rowIssue(rows[0])).toBeNull();

		// The broken entry degrades to exactly ONE inline row that names the offending code
		// and both plausible causes (not-synced OR wrong code).
		const issue = rowIssue(rows[1]);
		expect(issue).toContain('mcdm.heroes.v1/.../into-the-fray');
		expect(issue).toContain('Sync compendium');
		expect(issue).toContain('the code may be wrong');

		// ...and the section (and the rest of the sheet) is fully intact.
		expect(root.querySelector('[data-dse-hero-region="abilities"]')).not.toBeNull();
		expect(root.querySelector('.dse-hero__abilities-empty')).toBeNull();
		expect(root.querySelector('.dse-error')).toBeNull();
		expect(root.querySelector('.dse-stamina')).not.toBeNull();
	});

	test('a throwing compendium index costs one row, not the whole sheet', async () => {
		// `resolveSlug` is the one call in the ladder that walks the whole vault index; it
		// used to sit OUTSIDE resolveAbility's try, so a throw rejected the mount's
		// Promise.all and the pipeline replaced the entire sheet with an error card.
		const deps = makeDeps();
		const real = deps.compendium!;
		const exploding: CompendiumIndex = {
			...real,
			available: true,
			getEntry: (c) => real.getEntry(c),
			getEntity: (c) => real.getEntity(c),
			getStatblock: (c) => real.getStatblock(c),
			query: (t, f) => real.query(t, f),
			registerWatchers: (p) => real.registerWatchers(p),
			resolveSlug: () => {
				throw new Error('index exploded');
			},
		};
		const { root } = await renderHero([COAT_THE_BLADE, 'coat the blade'], { ...deps, compendium: exploding });

		const rows = abilityRows(root);
		expect(rows).toHaveLength(2);
		expect(rowName(rows[0])).toBe('Coat the Blade');
		expect(rowIssue(rows[0])).toBeNull();
		expect(rowIssue(rows[1])).toContain('index exploded');
		expect(root.querySelector('.dse-stamina')).not.toBeNull();
	});
});

describe('SC-141: unsynced compendium degrades per entry', () => {
	test('no compendium installed — every ability row says so and the sheet still renders', async () => {
		const { deps } = makeCompendiumDeps(); // nothing loaded -> index.available === false
		const { root } = await renderHero([COAT_THE_BLADE, PLACEHOLDER], deps);

		const rows = abilityRows(root);
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(rowIssue(row)).toContain('Compendium not installed');
		}
		// Definition refs degrade the same way — the sheet is still fully usable.
		expect(root.querySelector('.dse-stamina')).not.toBeNull();
		expect(root.querySelector('.dse-error')).toBeNull();
	});

	test('a full code the synced compendium does not carry names the code and both causes', async () => {
		const { root } = await renderHero(['scc.v1:mcdm.heroes.v1/feature.ability.shadow.level-1/no-such-ability']);
		const issue = rowIssue(abilityRows(root)[0]);
		expect(issue).toContain('mcdm.heroes.v1/feature.ability.shadow.level-1/no-such-ability');
		expect(issue).toContain('Sync compendium');
		expect(issue).toContain('the code may be wrong');
	});
});

describe('SC-141: the same widened scope fixes by-SCC `ds-feature` references', () => {
	test('a `ds-feature` block referencing an ability code renders the card (was "found but not renderable")', async () => {
		const deps = makeDeps();
		const pipeline = new ElementPipeline(deps);
		const containerEl = document.createElement('div');
		const host: BlockHost = {
			mode: 'reading' as RenderMode,
			sourcePath: 'Note.md',
			containerEl,
			canPersist: true,
			addChild: (child) => child,
			getBlockInfo: () => ({ language: 'ds-feature', lineStart: 0, lineEnd: 1 }),
			replaceSource: async () => true,
			blockKey: () => 'Note.md::ds-feature::0',
		};
		await pipeline.run(featureElement, COAT_THE_BLADE, host);

		expect(containerEl.textContent).not.toContain('not renderable');
		expect(containerEl.querySelector('.dse-feature')).not.toBeNull();
		expect(containerEl.textContent).toContain('Coat the Blade');
	});

	test('bare-slug resolution reaches an ability file too (scope shared with TYPE_ADAPTERS)', async () => {
		const { root } = await renderHero(['Coat the Blade']);
		expect(rowName(abilityRows(root)[0])).toBe('Coat the Blade');
		expect(rowIssue(abilityRows(root)[0])).toBeNull();
	});
});
