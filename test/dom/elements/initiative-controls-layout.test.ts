// SC-154 round 3 — the initiative tracker's control-cluster LAYOUT CANDIDATES.
//
// Scott (SC-154, 2026-08-18) asked for options to pick between: the round counter, the two
// turn controls, the Malice pool, its quick-add and its log all hang off the right of the
// "Enemy groups" heading today, leaving the left of that band empty. Three candidates were
// built behind the hidden `initControls` preference — `bar`, `panels`, `rail` — with the
// shipped layout (`stacked`) as its default.
//
// What these tests are FOR, given the candidates are temporary: the two properties that
// must hold no matter which one Scott picks.
//   1. The default is unchanged. A tracker rendered with no preference set builds the
//      exact same cluster in the exact same place as before this key existed — that is
//      what keeps the frozen print shots still, and what makes the losing candidates safe
//      to delete later.
//   2. No candidate loses or duplicates a control. All four layouts are assembled from
//      the same four piece-builders, so the invariant worth pinning is per-layout counts:
//      exactly one round row, one pool, one quick-add and one log, always.
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

async function render(layout?: string): Promise<HTMLElement> {
	const app = new App();
	app.vault.setFile('Media/token_1.png', '');
	const plugin = new Plugin(app);
	const storage: PrefsStorage = { get: async () => undefined, set: async () => {} };
	const prefs = createPreferenceStore(storage);
	prefs.describe(DSE_PREF_DESCRIPTORS);
	if (layout !== undefined) await prefs.set('initControls', layout as never);
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

describe('SC-154 round 3: initiative control-cluster layout candidates', () => {
	test('the DEFAULT is the shipped stacked layout — cluster inside the enemies head, no band', async () => {
		const root = await render();
		expect(root.getAttribute('data-dse-init-controls')).toBe('stacked');
		// The cluster still lives in its historical parent…
		const panel = root.querySelector('.dse-init__enemies-head > .dse-init__malice-panel');
		expect(panel).not.toBeNull();
		// …in its historical order, all four pieces as direct children.
		expect([...panel!.children].map((c) => c.className)).toEqual([
			'dse-init__malice',
			'dse-init__round',
			'dse-init__malice-log',
			'dse-init__malice-quickadd',
		]);
		// …and no candidate band exists at all.
		expect(root.querySelector('.dse-init__controls')).toBeNull();
	});

	test.each([
		['bar', 'dse-init__controls--bar'],
		['panels', 'dse-init__controls--panels'],
		['rail', 'dse-init__controls--rail'],
	])('%s builds ONE full-width band between the two groups, and no stacked panel', async (layout, cls) => {
		const root = await render(layout);
		expect(root.getAttribute('data-dse-init-controls')).toBe(layout);
		const bands = root.querySelectorAll('.dse-init__controls');
		expect(bands).toHaveLength(1);
		expect(bands[0].classList.contains(cls)).toBe(true);
		// A direct child of the tracker root, sitting between the heroes group and the
		// enemies group — the "full-width strip between the rosters" the proposal is.
		const kids = [...root.children];
		const heroes = kids.findIndex((c) => c.classList.contains('dse-init__group--heroes'));
		const enemies = kids.findIndex((c) => c.classList.contains('dse-init__group--enemies'));
		const band = kids.indexOf(bands[0]);
		expect(heroes).toBeGreaterThanOrEqual(0);
		expect(band).toBe(heroes + 1);
		expect(enemies).toBe(band + 1);
		// The stacked layout's own container is gone, not merely emptied.
		expect(root.querySelector('.dse-init__malice-panel')).toBeNull();
	});

	test.each([undefined, 'bar', 'panels', 'rail'])(
		'%s keeps exactly one of every control — nothing dropped, nothing duplicated',
		async (layout) => {
			const root = await render(layout);
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
			// The log's two entries survive every layout.
			expect(root.querySelectorAll('.dse-init__malice-log-entry')).toHaveLength(2);
		},
	);

	test('an unrecognised value falls back to the shipped layout rather than stamping it', async () => {
		const root = await render('no-such-layout');
		expect(root.getAttribute('data-dse-init-controls')).toBe('stacked');
		expect(root.querySelector('.dse-init__controls')).toBeNull();
		expect(root.querySelector('.dse-init__malice-panel')).not.toBeNull();
	});

	test('bar folds the log into a <details> whose summary carries the entry count', async () => {
		const root = await render('bar');
		const log = root.querySelector('.dse-init__malice-log') as HTMLDetailsElement;
		expect(log.tagName).toBe('DETAILS');
		expect(log.open).toBe(false);
		expect(log.querySelector('summary')!.textContent).toBe('Malice log · 2 entries');
	});

	test('rail states round and pool in its summary, and does NOT repeat the round inside', async () => {
		const root = await render('rail');
		const band = root.querySelector('.dse-init__controls--rail') as HTMLDetailsElement;
		expect(band.tagName).toBe('DETAILS');
		expect(band.open).toBe(false);
		const summary = band.querySelector('.dse-init__rail-summary')!;
		expect(summary.textContent).toContain('Round 3');
		expect(summary.textContent).toContain('Malice 7');
		expect(summary.textContent).toContain('2 log entries');
		// The round readout inside the drawer is the same node the other layouts use; it
		// is hidden by CSS, not removed, so the aria-live region survives.
		expect(band.querySelector('.dse-init__rail-body .dse-init__round-value')).not.toBeNull();
	});

	test("rail's summary pool tracks the stepper, which persists WITHOUT a rebuild", async () => {
		const root = await render('rail');
		const stat = root.querySelector('.dse-init__rail-stat--malice')!;
		expect(stat.textContent).toBe('Malice 7');
		const plus = root.querySelectorAll<HTMLElement>('.dse-init__malice .dse-stepper__btn');
		// The stepper renders [−, value, +]; the last button is the increment.
		plus[plus.length - 1].click();
		expect(stat.textContent).toBe('Malice 8');
	});
});
