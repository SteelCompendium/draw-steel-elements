// Plan 14 Task 4 (D5 §3) — the feature roller. Fine-grained behavior drives
// attachRollControls directly (seeded RollService stub; full control over rows/
// crit); integration mounts the REAL pipeline over the known-good harness
// fixtures (visual-harness/entry FIXTURES — already validity-gated by
// fixtures.test.ts) and pins the fidelity bar: at catalog defaults the roller
// leaves NO trace in the DOM.
import { ElementPipeline } from '../../../src/framework/pipeline';
import { createElementRegistry } from '../../../src/framework/registry';
import { registerFrameworkElementDefinitions } from 'main';
import { createSessionStore } from '../../../src/framework/session';
import type { SessionStore } from '../../../src/framework/session';
import { attachRollControls } from '../../../src/elements/feature/rollController';
import type { FeatureRollHooks } from '../../../src/elements/feature/rollController';
import { powerRollPanel } from '../../../src/framework/kit';
import { FIXTURES } from '../../../visual-harness/entry';
// stubService/makeDeps/makeHost extracted to rollTestHelpers.ts (Plan 14 Task 5)
// so roll.test.ts shares them — same code, no test-behavior change.
import { stubService, makeDeps, makeHost } from './rollTestHelpers';
import { Component, flushAsync } from '../../mocks/obsidian';

// ---- controller harness (no pipeline; full row control) ----
function mountController(opts: {
	faces: number[];
	rollExpr?: string;
	mainActionDefault?: boolean;
	clickToRoll?: boolean;
	crit?: boolean;
	session?: SessionStore;
	blockKey?: string;
}) {
	// The mock Component is structurally sufficient; typed `any` at the obsidian
	// type boundary (the same convention as rollBar.test.ts).
	const owner: any = new Component();
	owner.load();
	const hostEl = document.createElement('div');
	const rows = [
		{ tier: 'low' as const, md: 'a' },
		{ tier: 'mid' as const, md: 'b' },
		{ tier: 'high' as const, md: 'c' },
		...(opts.crit ? [{ tier: 'crit' as const, md: 'd' }] : []),
	];
	const panel = powerRollPanel(hostEl, { rows, head: 'Power Roll + Might' }, owner);
	const session = opts.session ?? createSessionStore();
	const hooks: FeatureRollHooks = {
		service: stubService(opts.faces),
		clickToRoll: opts.clickToRoll ?? false,
		session,
		blockKey: opts.blockKey ?? 'k',
	};
	attachRollControls({
		hostEl,
		panel,
		rollExpr: opts.rollExpr ?? 'Power Roll + Might',
		mainActionDefault: opts.mainActionDefault ?? true,
		abilityName: 'Gouge',
		effectIndex: 0,
		hooks,
		owner,
	});
	const launch = hostEl.querySelector<HTMLButtonElement>('button[aria-label="Roll Gouge"]')!;
	return { hostEl, panel, launch, session, owner };
}

describe('attachRollControls — the per-effect roller', () => {
	test('mounts the launch button; bar + result appear on first activation', async () => {
		const { hostEl, launch } = mountController({ faces: [5, 6] });
		expect(hostEl.querySelector('.dse-rollbar')).toBeNull(); // inert until engaged
		launch.click();
		await flushAsync(1);
		expect(hostEl.querySelector('.dse-rollbar')).not.toBeNull();
		expect(hostEl.querySelector('.dse-rollcard')).not.toBeNull();
	});

	test('seeded [5,6] (tier 1) highlights low, dims the rest', async () => {
		const { panel, launch } = mountController({ faces: [5, 6] });
		launch.click();
		await flushAsync(1);
		expect(panel.rowEls.low!.getAttribute('data-dse-roll-result')).toBe('active');
		expect(panel.rowEls.mid!.getAttribute('data-dse-roll-result')).toBe('dimmed');
		expect(panel.rowEls.high!.getAttribute('data-dse-roll-result')).toBe('dimmed');
	});

	test('nat 20 on a main action lights tier 3 AND the crit row', async () => {
		const { panel, launch } = mountController({ faces: [10, 10], crit: true, mainActionDefault: true });
		launch.click();
		await flushAsync(1);
		expect(panel.rowEls.high!.getAttribute('data-dse-roll-result')).toBe('active');
		expect(panel.rowEls.crit!.getAttribute('data-dse-roll-result')).toBe('active');
	});

	test('maneuver default (mainActionDefault false): nat 20 is tier 3 but NOT critical', async () => {
		const { hostEl, panel, launch } = mountController({ faces: [10, 10], crit: true, mainActionDefault: false });
		launch.click();
		await flushAsync(1);
		expect(panel.rowEls.crit!.getAttribute('data-dse-roll-result')).toBe('dimmed');
		expect(hostEl.querySelector('.dse-rollcard__headline')!.textContent).toBe('Tier 3 · 20');
	});

	test('Clear removes highlight + card; the bar stays for the next roll', async () => {
		const { hostEl, panel, launch } = mountController({ faces: [5, 6] });
		launch.click();
		await flushAsync(1);
		hostEl.querySelector<HTMLButtonElement>('button[aria-label="Clear result"]')!.click();
		expect(panel.rowEls.low!.hasAttribute('data-dse-roll-result')).toBe(false);
		expect(hostEl.querySelector('.dse-rollcard')).toBeNull();
		expect(hostEl.querySelector('.dse-rollbar')).not.toBeNull();
	});

	test('Reroll replaces the card; history APPENDS and caps at 10 (OD-8)', async () => {
		const { hostEl, launch, session } = mountController({ faces: [5, 6], blockKey: 'hist' });
		launch.click();
		await flushAsync(1);
		for (let i = 0; i < 12; i++) {
			hostEl.querySelector<HTMLButtonElement>('button[aria-label="Reroll"]')!.click();
			await flushAsync(1);
		}
		expect(hostEl.querySelectorAll('.dse-rollcard')).toHaveLength(1);
		expect(session.get<unknown[]>('hist', 'roll.history.0')).toHaveLength(10);
	});

	test('last-used modifiers persist per block: a NEW controller on the same key restores them', async () => {
		const session = createSessionStore();
		const first = mountController({ faces: [5, 6], session, blockKey: 'same' });
		first.launch.click();
		await flushAsync(1);
		first.hostEl.querySelector<HTMLButtonElement>('button[aria-label="Increase Edges"]')!.click();
		first.hostEl.querySelector<HTMLButtonElement>('button[aria-label="Roll"]')!.click();
		await flushAsync(1);
		const second = mountController({ faces: [5, 6], session, blockKey: 'same' });
		second.launch.click();
		await flushAsync(1);
		// single edge: 11 + 2 = 13 → tier 2 on the restored state
		expect(second.panel.rowEls.mid!.getAttribute('data-dse-roll-result')).toBe('active');
	});

	test('click-to-roll: row click rolls when enabled, does nothing when disabled', async () => {
		const on = mountController({ faces: [5, 6], clickToRoll: true });
		on.panel.rowEls.mid!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await flushAsync(1);
		expect(on.hostEl.querySelector('.dse-rollcard')).not.toBeNull();
		const off = mountController({ faces: [5, 6], clickToRoll: false });
		off.panel.rowEls.mid!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await flushAsync(1);
		expect(off.hostEl.querySelector('.dse-rollcard')).toBeNull();
	});
});

// ---- pipeline integration over the known-good harness fixtures ----
async function mountFixture(elementId: string, enableRolling: boolean, source?: string) {
	const registry = createElementRegistry();
	registerFrameworkElementDefinitions(registry);
	const { deps, prefs } = makeDeps();
	if (enableRolling) await prefs.set('rollingEnabled', true);
	const owner: any = new Component();
	owner.load();
	const containerEl = document.createElement('div');
	document.body.appendChild(containerEl);
	const pipeline = new ElementPipeline(deps);
	await pipeline.run(registry.get(elementId)!, source ?? FIXTURES[elementId].default, makeHost(containerEl, owner));
	await flushAsync(2);
	return { containerEl, prefs };
}

describe('pipeline integration — the fidelity bar and the opt-in', () => {
	test('FIDELITY: at catalog defaults a feature renders with ZERO roll affordances', async () => {
		const { containerEl } = await mountFixture('feature', false);
		expect(containerEl.querySelector('.dse-pr')).not.toBeNull(); // the fixture does roll…
		expect(containerEl.querySelector('.dse-roll-btn')).toBeNull(); // …but no roller leaks
		expect(containerEl.querySelector('.dse-rollbar')).toBeNull();
		expect(containerEl.querySelector('.dse-roll-area')).toBeNull();
	});

	test('rollingEnabled: every power-roll panel gains exactly one launch button', async () => {
		const { containerEl } = await mountFixture('feature', true);
		const panels = containerEl.querySelectorAll('.dse-pr');
		expect(panels.length).toBeGreaterThan(0);
		expect(containerEl.querySelectorAll('.dse-roll-btn')).toHaveLength(panels.length);
	});

	test('statblock abilities gain the roller too (shared grammar)', async () => {
		const { containerEl } = await mountFixture('statblock', true);
		const panels = containerEl.querySelectorAll('.dse-pr');
		expect(panels.length).toBeGreaterThan(0);
		expect(containerEl.querySelectorAll('.dse-roll-btn')).toHaveLength(panels.length);
	});

	test('nested abilities inherit the roller: a nested power roll gains its own launch button', async () => {
		// The stock fixture's nested feature has no power roll — this source pins
		// renderFeature's `roll: opts.roll` forward on the nested renderFeatureList
		// call (drop that forward and the nested panel silently loses its roller).
		const nestedRollSource = [
			'type: feature',
			'feature_type: ability',
			'name: Outer Strike',
			'usage: Main action',
			'effects:',
			'  - name: Effect',
			'    effect: Wrapper text.',
			'    features:',
			'      - type: feature',
			'        feature_type: ability',
			'        name: Nested Strike',
			'        usage: Main action',
			'        effects:',
			'          - roll: Power Roll + Might',
			'            tier1: Tier one outcome.',
			'            tier2: Tier two outcome.',
			'            tier3: Tier three outcome.',
		].join('\n');
		const { containerEl } = await mountFixture('feature', true, nestedRollSource);
		const nested = containerEl.querySelector('.dse-feature__nested .dse-feature');
		expect(nested).not.toBeNull();
		expect(nested!.querySelector('.dse-pr')).not.toBeNull(); // the nested panel renders…
		expect(nested!.querySelector('.dse-roll-btn')).not.toBeNull(); // …WITH its roll affordance
	});

	test('featureblock abilities gain the roller too', async () => {
		const { containerEl } = await mountFixture('featureblock', true);
		const panels = containerEl.querySelectorAll('.dse-pr');
		expect(panels.length).toBeGreaterThan(0);
		expect(containerEl.querySelectorAll('.dse-roll-btn')).toHaveLength(panels.length);
	});

	test('LIVE: toggling rollingEnabled re-mounts an already-rendered feature', async () => {
		const { containerEl, prefs } = await mountFixture('feature', false);
		expect(containerEl.querySelector('.dse-roll-btn')).toBeNull();
		await prefs.set('rollingEnabled', true);
		await flushAsync(2);
		expect(containerEl.querySelector('.dse-roll-btn')).not.toBeNull();
		await prefs.set('rollingEnabled', false);
		await flushAsync(2);
		expect(containerEl.querySelector('.dse-roll-btn')).toBeNull();
	});
});
