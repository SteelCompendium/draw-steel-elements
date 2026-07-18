// D7 Task 8 (spec §3.5, recon d7-recon.md §6) — resolveHeroDefinition's VIEW-level
// resolution + per-ref degrade, driven through a thin harness ElementView (this task ships
// no real HeroSheetView — that's Task 9) mounted with a REAL CompendiumIndex over the
// copied real class/kit/ancestry fixtures (test/fixtures/md-dse/{class,kit,ancestry}) —
// same fixture-loading convention as test/unit/services/compendiumIndex.test.ts, not a
// hand-stubbed fake, per the Task 8 brief's "real fixture models" mandate.
import * as path from 'path';
import { ElementView } from '@/framework/view';
import { createRenderContext } from '@/framework/context';
import type { RenderContext } from '@/framework/context';
import type { BlockHost, RenderMode } from '@/framework/host/BlockHost';
import { createThemeService } from '@/framework/seams/theme';
import { createPreferenceStore } from '@/framework/seams/prefs';
import type { PrefsStorage } from '@/framework/seams/prefs';
import { createReferenceService } from '@/framework/seams/refs';
import { createSessionStore } from '@/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { App, Plugin } from '../../mocks/obsidian';
import { createCompendiumIndex } from '@/services/CompendiumIndex';
import type { CompendiumIndex } from '@/services/CompendiumIndex';
import { SccResolver } from '@/refs/SccResolver';
import { makeFakeApp, loadFixtureIntoVault } from '../../fakes/fakeObsidian';
import { resolveHeroDefinition } from '@/elements/hero/resolve';
import { deriveHeroStats } from '@/elements/hero/deriveHeroStats';
import type { HeroDefn } from '@/elements/hero/model';

const F = path.join(__dirname, '../../fixtures/md-dse');
const FURY_REF = 'scc.v1:mcdm.heroes.v1/class/fury';
const MOUNTAIN_REF = 'scc.v1:mcdm.heroes.v1/kit/mountain';
const DWARF_REF = 'scc.v1:mcdm.heroes.v1/ancestry/dwarf';

/** Thin harness view (this task's deliverable is resolve.ts/deriveHeroStats.ts, not a
 *  real HeroSheetView — Task 9 builds that). Resolves + derives on mount, renders the
 *  results as data attributes/text nodes a test can assert against — exercising the exact
 *  call shape Task 9's real view will use (`resolveHeroDefinition` then `deriveHeroStats`,
 *  both against `this.cx.compendium`). */
class HeroResolveHarnessView extends ElementView<HeroDefn> {
	protected async onMount(root: HTMLElement, defn: HeroDefn): Promise<void> {
		const resolved = await resolveHeroDefinition(defn, this.cx.compendium);
		const stats = deriveHeroStats(defn, resolved);

		const stamina = root.createDiv({ cls: 'test-max-stamina' });
		stamina.setAttribute('data-value', String(stats.maxStamina.value));
		stamina.setAttribute('data-source', stats.maxStamina.source);

		const resource = root.createDiv({ cls: 'test-resource' });
		resource.setAttribute('data-type', stats.resource.value.type);
		resource.setAttribute('data-source', stats.resource.source);

		// Per-ref degrade notice (spec §3.5: "unresolved — sync compendium"), one per issue.
		for (const issue of resolved.issues) {
			const notice = root.createDiv({ cls: 'dse-hero-ref-issue', text: issue.reason });
			notice.setAttribute('data-field', issue.field);
			notice.setAttribute('data-code', issue.code);
		}
	}
}

function makeHost(): BlockHost & { containerEl: HTMLElement } {
	const containerEl = document.createElement('div');
	return {
		mode: 'reading' as RenderMode,
		sourcePath: 'Hero.md',
		containerEl,
		canPersist: true,
		addChild: (child) => child,
		getBlockInfo: () => ({ language: 'ds-hero', lineStart: 0, lineEnd: 1 }),
		replaceSource: async () => true,
		blockKey: () => 'Hero.md::ds-hero::0',
	};
}

function makeContext(compendium?: CompendiumIndex): RenderContext {
	const app = new App();
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	const theme = createThemeService(prefs, plugin as any);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	const session = createSessionStore();
	return createRenderContext({
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		host: makeHost(),
		theme,
		prefs,
		refs,
		session,
		compendium,
	});
}

/** Real CompendiumIndex over the copied real fixtures (fury/mountain/dwarf), same
 *  fixture-loading convention as compendiumIndex.test.ts. */
function realCompendium(): CompendiumIndex {
	const { app, vault, metadataCache } = makeFakeApp();
	loadFixtureIntoVault(vault, metadataCache, path.join(F, 'class/fury.md'), 'DS Compendium/class/fury.md');
	loadFixtureIntoVault(vault, metadataCache, path.join(F, 'kit/mountain.md'), 'DS Compendium/kit/mountain.md');
	loadFixtureIntoVault(vault, metadataCache, path.join(F, 'ancestry/dwarf.md'), 'DS Compendium/ancestry/dwarf.md');
	const resolver = new SccResolver(app, DEFAULT_SETTINGS);
	return createCompendiumIndex(app, resolver);
}

function heroDefn(overrides: Partial<HeroDefn> = {}): HeroDefn {
	return {
		name: 'Torin Stonefist',
		level: 3,
		characteristics: { might: 2, agility: 2, reason: -1, intuition: 0, presence: 1 },
		class: FURY_REF,
		ancestry: DWARF_REF,
		kits: [MOUNTAIN_REF],
		...overrides,
	};
}

describe('D7 Task 8: hero view-level compendium resolution + degrade (spec §3.5)', () => {
	test('class/kits refs resolve against the real compendium and feed derived stats', async () => {
		const cx = makeContext(realCompendium());
		const view = new HeroResolveHarnessView(cx);
		const root = document.createElement('div');

		await view.mount(root, heroDefn());

		expect(root.querySelectorAll('.dse-hero-ref-issue')).toHaveLength(0);
		const stamina = root.querySelector('.test-max-stamina')!;
		// 21 + 9*(3-1) + 9*echelon(1) = 48 (same build as deriveHeroStats.test.ts / spec §3.2 mockup).
		expect(stamina.getAttribute('data-value')).toBe('48');
		expect(stamina.getAttribute('data-source')).toBe('derived');
		const resource = root.querySelector('.test-resource')!;
		expect(resource.getAttribute('data-type')).toBe('Ferocity');
		expect(resource.getAttribute('data-source')).toBe('derived');
	});

	test('an unresolvable ancestry code surfaces a per-ref degrade notice (class/kits still resolve)', async () => {
		const cx = makeContext(realCompendium());
		const view = new HeroResolveHarnessView(cx);
		const root = document.createElement('div');

		await view.mount(root, heroDefn({ ancestry: 'scc.v1:mcdm.heroes.v1/ancestry/nonesuch' }));

		const notices = root.querySelectorAll('.dse-hero-ref-issue');
		expect(notices).toHaveLength(1);
		expect(notices[0].getAttribute('data-field')).toBe('ancestry');
		expect(notices[0].textContent).toContain('not found in compendium');
		// class/kits were unaffected by the ancestry ref failing (per-ref isolation).
		const stamina = root.querySelector('.test-max-stamina')!;
		expect(stamina.getAttribute('data-value')).toBe('48');
		expect(stamina.getAttribute('data-source')).toBe('derived');
	});

	test('no compendium at all: falls back to inline overrides + shows notices, still fully functional', async () => {
		const cx = makeContext(undefined);
		const view = new HeroResolveHarnessView(cx);
		const root = document.createElement('div');

		await view.mount(
			root,
			heroDefn({
				max_stamina: 48,
				recoveries_max: 10,
				resource: { type: 'Ferocity', min: 0 },
			}),
		);

		// class + ancestry + the one kit ref all degrade — 3 notices, all "not installed".
		const notices = root.querySelectorAll('.dse-hero-ref-issue');
		expect(notices).toHaveLength(3);
		for (const notice of Array.from(notices)) {
			expect(notice.textContent).toContain('Compendium not installed');
		}
		// But the sheet is still fully functional off the inline overrides.
		const stamina = root.querySelector('.test-max-stamina')!;
		expect(stamina.getAttribute('data-value')).toBe('48');
		expect(stamina.getAttribute('data-source')).toBe('authored');
		const resource = root.querySelector('.test-resource')!;
		expect(resource.getAttribute('data-type')).toBe('Ferocity');
		expect(resource.getAttribute('data-source')).toBe('authored');
	});

	test('a bare slug ref resolves via resolveSlug (author convenience — not just full scc.vN: codes)', async () => {
		const cx = makeContext(realCompendium());
		const view = new HeroResolveHarnessView(cx);
		const root = document.createElement('div');

		await view.mount(root, heroDefn({ class: 'fury', kits: ['mountain'], ancestry: 'dwarf' }));

		expect(root.querySelectorAll('.dse-hero-ref-issue')).toHaveLength(0);
		expect(root.querySelector('.test-max-stamina')!.getAttribute('data-value')).toBe('48');
	});

	test('an inline object class (no compendium ref) is left unresolved with no issue — inline definitions are out of scope here', async () => {
		const cx = makeContext(realCompendium());
		const view = new HeroResolveHarnessView(cx);
		const root = document.createElement('div');

		await view.mount(root, heroDefn({ class: { name: 'Homebrew Class' }, kits: [], ancestry: undefined }));

		expect(root.querySelectorAll('.dse-hero-ref-issue')).toHaveLength(0);
		expect(root.querySelector('.test-max-stamina')!.getAttribute('data-source')).toBe('unavailable');
	});
});
