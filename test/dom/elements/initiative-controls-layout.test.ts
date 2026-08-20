// SC-154 — the initiative tracker's round/Malice COMMAND BAR (round 3's Option 1,
// Scott's pick 2026-08-20: "Option 1, sanctioned").
//
// Round 3 built three candidate layouts behind a hidden `initControls` preference; the
// promotion round made the bar THE layout and deleted the losing candidates, the old
// stacked cluster (the Malice panel hanging off the enemies heading) and the preference
// itself. What stays pinned here:
//   1. The bar is a single full-width band between the two rosters — the exact placement
//      Scott picked — and the stacked layout's containers are gone, not merely emptied.
//   2. No control was lost or duplicated in the promotion: exactly one round row, one
//      pool, one quick-add and one log, with the log's entries intact.
//   3. The log is a kit collapsible (closed at rest, count in the header) — the shape the
//      print layer force-opens (styles-source.css print Rule 3), which is what makes a
//      printed handout show the log. The native-<details> form round 3 shipped could not
//      be opened by CSS at the repo's Chromium floor.
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
import { App, Plugin } from '../../mocks/obsidian';
import { DSE_PREF_DESCRIPTORS } from '../../../src/prefs/catalog';
import { initiativeElement } from '../../../src/elements/initiative/definition';

const SOURCE = `heroes:
  - name: "Frodo Baggins"
    max_stamina: 80
enemy_groups:
  - name: "Mordor Forces"
    creatures:
      - name: "Orc"
        max_stamina: 40
        amount: 2
round: 3
malice:
  value: 7
  log:
    - round: 1
      amount: 3
      label: "Round gain"
    - round: 2
      amount: -5
      label: "Troll: Sweeping Club"
`;

function makeHost(): BlockHost & { containerEl: HTMLElement } {
	const containerEl = document.createElement('div');
	return {
		mode: 'reading' as RenderMode,
		sourcePath: 'Encounter.md',
		containerEl,
		canPersist: true,
		addChild: (child: unknown) => child,
		getBlockInfo: () => ({ language: 'ds-initiative', lineStart: 0, lineEnd: 30 }),
		replaceSource: async () => true,
		blockKey: () => 'Encounter.md::ds-initiative::0',
	} as unknown as BlockHost & { containerEl: HTMLElement };
}

async function render(): Promise<HTMLElement> {
	const app = new App();
	app.vault.setFile('Media/token_1.png', '');
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	prefs.describe(DSE_PREF_DESCRIPTORS);
	const deps: ElementPipelineDeps = {
		app: app as never,
		plugin: plugin as never,
		settings: DEFAULT_SETTINGS,
		theme: createThemeService(prefs, plugin as never),
		prefs,
		refs: createReferenceService(app as never, DEFAULT_SETTINGS),
		validation: createValidationService(),
		session: createSessionStore(),
		roll: createRollService(prefs),
	};
	const host = makeHost();
	await new ElementPipeline(deps).run(initiativeElement, SOURCE, host);
	return host.containerEl.querySelector('.dse-init') as HTMLElement;
}

describe('SC-154: the round/Malice command bar', () => {
	test('ONE full-width bar between the two rosters; the stacked-era containers are gone', async () => {
		const root = await render();
		const bands = root.querySelectorAll('.dse-init__controls');
		expect(bands).toHaveLength(1);
		expect(bands[0].classList.contains('dse-init__controls--bar')).toBe(true);
		// A direct child of the tracker root, sitting between the heroes group and the
		// enemies group — the "full-width strip between the rosters" Scott picked.
		const kids = [...root.children];
		const heroes = kids.findIndex((c) => c.classList.contains('dse-init__group--heroes'));
		const enemies = kids.findIndex((c) => c.classList.contains('dse-init__group--enemies'));
		const band = kids.indexOf(bands[0]);
		expect(heroes).toBeGreaterThanOrEqual(0);
		expect(band).toBe(heroes + 1);
		expect(enemies).toBe(band + 1);
		// The stacked layout's own containers are gone, not merely emptied — and no
		// review-switch attribute is stamped anywhere.
		expect(root.querySelector('.dse-init__malice-panel')).toBeNull();
		expect(root.querySelector('.dse-init__enemies-head')).toBeNull();
		expect(root.hasAttribute('data-dse-init-controls')).toBe(false);
	});

	test('exactly one of every control — nothing dropped, nothing duplicated in the promotion', async () => {
		const root = await render();
		for (const sel of [
			'.dse-init__round',
			'.dse-init__round-value',
			'.dse-init__round-reset',
			'.dse-init__round-advance',
			'.dse-init__malice',
			'.dse-init__malice-log',
			'.dse-init__malice-log-list',
			'.dse-init__malice-quickadd',
			'.dse-init__malice-quickadd-amount',
			'.dse-init__malice-quickadd-label',
			'.dse-init__malice-quickadd-btn',
		]) {
			expect([sel, root.querySelectorAll(sel).length]).toEqual([sel, 1]);
		}
		// The log's two entries survive.
		expect(root.querySelectorAll('.dse-init__malice-log-entry')).toHaveLength(2);
	});

	test('the log is a kit collapsible: closed at rest, count in the header, region force-openable', async () => {
		const root = await render();
		const log = root.querySelector('.dse-init__malice-log')!;
		// The kit shape — root carries .dse-collapse, header is a real button, region
		// hides via the `hidden` ATTRIBUTE. That attribute is the whole print story:
		// print Rule 3 (`.dse-collapse__region[hidden] { display: block !important }`,
		// both print classes) is what puts the log on a printed handout, and it can
		// only match this shape — a native <details>' closed content is unreachable
		// from CSS at the repo's Chromium floor.
		expect(log.classList.contains('dse-collapse')).toBe(true);
		const header = log.querySelector<HTMLButtonElement>('button.dse-init__malice-log-heading')!;
		expect(header).not.toBeNull();
		expect(header.textContent).toContain('Malice log · 2 entries');
		expect(header.getAttribute('aria-expanded')).toBe('false');
		const region = log.querySelector<HTMLElement>('.dse-collapse__region')!;
		expect(region.hidden).toBe(true);
		// A real toggle opens it.
		header.click();
		expect(header.getAttribute('aria-expanded')).toBe('true');
		expect(region.hidden).toBe(false);
		expect(region.querySelectorAll('.dse-init__malice-log-entry')).toHaveLength(2);
	});
});
