// SC-4 + SC-162 + SC-240: missing/broken-portrait resilience.
//
// SC-4 (original): when BOTH a combatant's image and the vault's default token image
// are absent, Images.resolveImageSourceOrDefault rejects — the three portrait render
// sites previously attached a bare .then() (no .catch), so every render of such a
// tracker fired an UNHANDLED promise rejection. Fixed: the fallback path always mounts.
//
// SC-162: the rejection path used to just leave the slot empty — and a RESOLVED-but-
// unloadable src (a moved/renamed vault file, a dead URL) had no handler at all, so the
// browser's own broken-image glyph showed instead. Both paths now render
// InitiativeView.renderPortraitFallback: a themed shield (hero) / skull (enemy) glyph,
// distinguished by SHAPE not color (the mock setIcon stamps `data-icon` — see
// test/mocks/obsidian-core.ts — so assertions read the icon id directly rather than
// inspecting real Lucide SVG markup).
//
// SC-240 (deliberate contract update — was "warn once per portrait" on EVERY rejection):
// the console.warn now fires ONLY when an image WAS specified (non-empty `imgSrcRaw`)
// and still couldn't be resolved. Every builder-created tracker used to log one warning
// per creature purely because md-dse statblocks carry no `image` key at all — a handled,
// expected state since SC-162 gave it the same themed fallback glyph either way, not a
// warning-worthy one. This suite renders a tracker in a vault with NO images seeded
// (unlike initiative.test.ts's makeEnv, which seeds Media/token_1.png per CB-14) and
// pins: no unhandled rejection, ZERO console.warn calls when no `image:` field is set,
// the correct fallback glyph per hero/enemy slot regardless — plus (below) that a warn
// STILL fires (hero AND enemy sites) when an image was specified but can't be resolved,
// that a whitespace-only `image:` value is treated the same as absent (round 1, INFO-1),
// that a real resolvable image still wins over the fallback, and that a load failure on
// an already-mounted <img> swaps to the same fallback.
import { ElementPipeline } from '../../../src/framework/pipeline';
import type { ElementPipelineDeps } from '../../../src/framework/pipeline';
import type { BlockHost, RenderMode } from '../../../src/framework/host/BlockHost';
import { createThemeService } from '../../../src/framework/seams/theme';
import { createPreferenceStore } from '../../../src/framework/seams/prefs';
import { createRollService } from '../../../src/framework/roll/service';
import type { PrefsStorage } from '../../../src/framework/seams/prefs';
import { createReferenceService } from '../../../src/framework/seams/refs';
import { createValidationService } from '../../../src/framework/validation';
import { createSessionStore } from '../../../src/framework/session';
import { DEFAULT_SETTINGS } from '@model/Settings';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { initiativeElement } from '../../../src/elements/initiative/definition';
import { App, Plugin, flushAsync } from '../../mocks/obsidian';

const SOURCE = `heroes:
  - name: Frodo Baggins
    initiative: 1
    max_stamina: 20
enemy_groups:
  - name: Goblin Squad
    creatures:
      - name: Goblin
        initiative: 1
        max_stamina: 10
        amount: 2
`;

function makeDeps(app: App): ElementPipelineDeps {
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	prefs.describe(DSE_PREF_DESCRIPTORS);
	const theme = createThemeService(prefs, plugin as any);
	const refs = createReferenceService(app as any, DEFAULT_SETTINGS);
	return {
		app: app as any,
		plugin: plugin as any,
		settings: DEFAULT_SETTINGS,
		theme,
		prefs,
		refs,
		validation: createValidationService(),
		session: createSessionStore(),
		roll: createRollService(prefs),
	};
}

function makeHost(containerEl: HTMLElement): BlockHost {
	return {
		mode: 'reading' as RenderMode,
		sourcePath: 'Note.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-it', lineStart: 0, lineEnd: 10 }),
		replaceSource: async () => true,
		blockKey: () => 'Note.md::ds-it::0',
	} as BlockHost;
}

describe('SC-4 / SC-162: initiative portraits with no resolvable image', () => {
	let warnSpy: jest.SpyInstance;
	let rejections: unknown[];
	const onRejection = (reason: unknown) => rejections.push(reason);

	beforeEach(() => {
		warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
		rejections = [];
		process.on('unhandledRejection', onRejection);
	});
	afterEach(() => {
		process.off('unhandledRejection', onRejection);
		warnSpy.mockRestore();
	});

	test('renders without unhandled rejections; SC-240: NO warn when no image was specified; each slot gets the themed fallback', async () => {
		const deps = makeDeps(new App()); // NOTHING seeded: no hero images, no default token image
		const pipeline = new ElementPipeline(deps);
		const container = document.createElement('div');
		document.body.appendChild(container);

		await pipeline.run(initiativeElement, SOURCE, makeHost(container));
		await flushAsync(5); // let the portrait promises settle (incl. the rejection path)

		expect(rejections).toEqual([]);
		// SC-240: SOURCE sets no `image:` field anywhere — absence of an optional field
		// is not a warning-worthy state, so zero calls, even though every portrait still
		// fails to resolve (no default token image either) and falls back.
		expect(warnSpy).not.toHaveBeenCalled();
		// No slot ever carries a real <img> in this all-unresolvable vault…
		const portraits = container.querySelectorAll('.dse-init__portrait, .dse-init__cell-portrait');
		expect(portraits.length).toBeGreaterThan(0);
		for (const slot of Array.from(portraits)) {
			expect(slot.querySelector('img')).toBeNull();
		}
		// …but SC-162: every slot now carries the themed fallback instead of nothing.
		const fallbacks = container.querySelectorAll('.dse-init__portrait-fallback');
		expect(fallbacks.length).toBe(portraits.length);
		for (const fb of Array.from(fallbacks)) {
			expect(fb.getAttribute('aria-hidden')).toBe('true');
		}

		// Hero row (Frodo Baggins) gets the shield glyph.
		const heroFallback = container.querySelector(
			'.dse-init__group--heroes .dse-init__portrait .dse-init__portrait-fallback',
		);
		expect(heroFallback?.getAttribute('data-icon')).toBe('shield');

		// Enemy detail row AND every grid cell (Goblin amount:2) get the skull glyph.
		const enemyFallbacks = container.querySelectorAll(
			'.dse-init__group--enemies .dse-init__portrait-fallback',
		);
		expect(enemyFallbacks.length).toBeGreaterThan(0);
		for (const fb of Array.from(enemyFallbacks)) {
			expect(fb.getAttribute('data-icon')).toBe('skull');
		}
	});

	// Review round 1, INFO-1 (folded): a whitespace-only `image:` value is not a real
	// value either — treat it the same as absent (silent), consistent with the ruling.
	test('SC-240: a WHITESPACE-ONLY image value is treated as not specified — no warn', async () => {
		const deps = makeDeps(new App()); // no default token image seeded either
		const pipeline = new ElementPipeline(deps);
		const container = document.createElement('div');
		document.body.appendChild(container);

		const source = `heroes:
  - name: Frodo Baggins
    initiative: 1
    max_stamina: 20
    image: "   "
enemy_groups: []
`;
		await pipeline.run(initiativeElement, source, makeHost(container));
		await flushAsync(5);

		expect(rejections).toEqual([]);
		expect(warnSpy).not.toHaveBeenCalled();
		const portrait = container.querySelector('.dse-init__portrait')!;
		expect(portrait.querySelector('img')).toBeNull();
		const fallback = portrait.querySelector('.dse-init__portrait-fallback');
		expect(fallback).not.toBeNull();
		expect(fallback!.getAttribute('data-icon')).toBe('shield');
	});

	test('SC-240: warn STILL fires when an image WAS specified and could not be resolved (hero AND enemy sites)', async () => {
		const deps = makeDeps(new App()); // no default token image seeded either
		const pipeline = new ElementPipeline(deps);
		const container = document.createElement('div');
		document.body.appendChild(container);

		// Review round 1, LOW-3: the hero row, the enemy detail row, and each instance
		// grid cell all share ONE renderPortrait, but only the hero call site had a
		// positive-warn test — cover the enemy sites too (amount: 2 -> detail row + 2
		// grid cells, all sharing the one unresolvable `image`).
		const source = `heroes:
  - name: Frodo Baggins
    initiative: 1
    max_stamina: 20
    image: images/does-not-exist.png
enemy_groups:
  - name: Goblin Squad
    creatures:
      - name: Goblin
        initiative: 1
        max_stamina: 10
        amount: 2
        image: images/also-does-not-exist.png
`;
		await pipeline.run(initiativeElement, source, makeHost(container));
		await flushAsync(5);

		expect(rejections).toEqual([]);
		// A non-empty imgSrcRaw that fails to resolve (and no default to fall back on
		// either) is still a real problem worth logging — unlike the "no image key at
		// all" case above. 1 hero + (1 enemy detail row + 2 grid cells) = 4.
		expect(warnSpy).toHaveBeenCalledTimes(4);
		for (const call of warnSpy.mock.calls) {
			expect(String(call[0])).toContain('no portrait image found');
		}
		const heroPortrait = container.querySelector('.dse-init__group--heroes .dse-init__portrait')!;
		expect(heroPortrait.querySelector('img')).toBeNull();
		const heroFallback = heroPortrait.querySelector('.dse-init__portrait-fallback');
		expect(heroFallback).not.toBeNull();
		expect(heroFallback!.getAttribute('data-icon')).toBe('shield');

		const enemyPortraits = container.querySelectorAll(
			'.dse-init__group--enemies .dse-init__portrait, .dse-init__group--enemies .dse-init__cell-portrait',
		);
		expect(enemyPortraits.length).toBeGreaterThan(0);
		for (const slot of Array.from(enemyPortraits)) {
			expect(slot.querySelector('img')).toBeNull();
			const fallback = slot.querySelector('.dse-init__portrait-fallback');
			expect(fallback).not.toBeNull();
			expect(fallback!.getAttribute('data-icon')).toBe('skull');
		}
	});

	test('a resolvable image still wins: no fallback when the vault has a real file at the given path', async () => {
		const app = new App();
		app.vault.setFile('images/frodo.png', '');
		const deps = makeDeps(app);
		const pipeline = new ElementPipeline(deps);
		const container = document.createElement('div');
		document.body.appendChild(container);

		const source = `heroes:
  - name: Frodo Baggins
    initiative: 1
    max_stamina: 20
    image: images/frodo.png
enemy_groups: []
`;
		await pipeline.run(initiativeElement, source, makeHost(container));
		await flushAsync(5);

		expect(warnSpy).not.toHaveBeenCalled();
		const portrait = container.querySelector('.dse-init__portrait')!;
		const img = portrait.querySelector('img');
		expect(img).not.toBeNull();
		expect(img!.getAttribute('src')).toBe('app://vault/images/frodo.png');
		expect(portrait.querySelector('.dse-init__portrait-fallback')).toBeNull();
	});

	test('a resolved-but-unloadable image (moved/renamed file, dead URL) swaps to the fallback on load failure', async () => {
		const app = new App();
		app.vault.setFile('images/frodo.png', '');
		const deps = makeDeps(app);
		const pipeline = new ElementPipeline(deps);
		const container = document.createElement('div');
		document.body.appendChild(container);

		const source = `heroes:
  - name: Frodo Baggins
    initiative: 1
    max_stamina: 20
    image: images/frodo.png
enemy_groups: []
`;
		await pipeline.run(initiativeElement, source, makeHost(container));
		await flushAsync(5);

		const portrait = container.querySelector('.dse-init__portrait')!;
		const img = portrait.querySelector('img');
		expect(img).not.toBeNull(); // resolved fine — this is the browser LOAD that fails

		img!.dispatchEvent(new Event('error'));

		expect(portrait.querySelector('img')).toBeNull(); // the broken <img> is gone
		const fallback = portrait.querySelector('.dse-init__portrait-fallback');
		expect(fallback).not.toBeNull();
		expect(fallback!.getAttribute('data-icon')).toBe('shield');
	});
});
