// SC-4: missing-portrait resilience. When BOTH a combatant's image and the vault's
// default token image are absent, Images.resolveImageSourceOrDefault rejects — the
// three portrait render sites previously attached a bare .then() (no .catch), so every
// render of such a tracker fired an UNHANDLED promise rejection. The fix warns once per
// portrait and leaves the slot empty. This suite renders a tracker in a vault with NO
// images seeded (unlike initiative.test.ts's makeEnv, which seeds Media/token_1.png
// per CB-14) and pins: no unhandled rejection, a console.warn per portrait, empty slots.
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

function makeDeps(): ElementPipelineDeps {
	const app = new App(); // NOTHING seeded: no hero images, no default token image
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

describe('SC-4: initiative portraits with no resolvable image', () => {
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

	test('renders without unhandled rejections; warns per missing portrait; slots stay empty', async () => {
		const deps = makeDeps();
		const pipeline = new ElementPipeline(deps);
		const container = document.createElement('div');
		document.body.appendChild(container);

		await pipeline.run(initiativeElement, SOURCE, makeHost(container));
		await flushAsync(5); // let the portrait promises settle (incl. the rejection path)

		expect(rejections).toEqual([]);
		// One warn per portrait render site that failed (hero row + creature cells/rows).
		expect(warnSpy).toHaveBeenCalled();
		for (const call of warnSpy.mock.calls) {
			expect(String(call[0])).toContain('no portrait image found');
		}
		// The portrait slots exist but carry no <img>.
		const portraits = container.querySelectorAll('.dse-init__portrait, .dse-init__cell-portrait');
		expect(portraits.length).toBeGreaterThan(0);
		for (const slot of Array.from(portraits)) {
			expect(slot.querySelector('img')).toBeNull();
		}
		container.remove();
	});
});
