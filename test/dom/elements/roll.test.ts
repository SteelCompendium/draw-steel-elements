// Plan 14 Task 5 (D5 §5/§8.6) — the ds-roll element through the REAL pipeline:
// schema gate, empty-block default, expression/structured parsing, tier
// highlight, flat/opposed cards, auto_roll, session recording, aliases, and the
// OD-5 pin (rollingEnabled never gates ds-roll — authoring the block is the
// opt-in; note makeDeps() prefs sit at catalog defaults, rollingEnabled=false,
// so EVERY mount below already exercises the disabled-master-pref state).
import { ElementPipeline } from '../../../src/framework/pipeline';
import { createElementRegistry } from '../../../src/framework/registry';
import { registerFrameworkElementDefinitions } from 'main';
import { rollElement } from '../../../src/elements/roll/definition';
import { stubService, makeDeps, makeHost } from './rollTestHelpers';
import { Component, flushAsync } from '../../mocks/obsidian';

const registry = createElementRegistry();
registerFrameworkElementDefinitions(registry);

async function mountRoll(source: string, faces: number[] = [5, 6], blockKey = 'roll-block') {
	const { deps } = makeDeps();
	deps.roll = stubService(faces);
	const owner = new Component();
	owner.load();
	const containerEl = document.createElement('div');
	document.body.appendChild(containerEl);
	const pipeline = new ElementPipeline(deps);
	await pipeline.run(rollElement, source, makeHost(containerEl, owner, blockKey));
	await flushAsync(2);
	return { containerEl, session: deps.session };
}

test('aliases: ds-roll canonical, ds-r and ds-power-roll registered', () => {
	for (const alias of ['ds-roll', 'ds-r', 'ds-power-roll']) {
		expect(registry.get(alias)?.id).toBe('roll');
	}
});

test('schema hard-fail: an unknown mode renders the schema error card', async () => {
	const { containerEl } = await mountRoll('mode: banana');
	expect(containerEl.querySelector('.dse-error-card')).not.toBeNull();
	expect(containerEl.firstElementChild!.getAttribute('data-dse-error-stage')).toBe('schema');
});

test('an EMPTY block is a bare 2d10 power roll: bar + Roll, no panel, no error', async () => {
	const { containerEl } = await mountRoll('');
	expect(containerEl.querySelector('.dse-error-card')).toBeNull();
	expect(containerEl.querySelector('.dse-rollbar')).not.toBeNull();
	expect(containerEl.querySelector('.dse-pr')).toBeNull();
	expect(containerEl.querySelector('button[aria-label="Roll"]')).not.toBeNull();
});

test('roll string keyword labels the characteristic stepper', async () => {
	const { containerEl } = await mountRoll('roll: "Power Roll + Reason"');
	// Stepper labels are accessible names (kit convention: aria-label, no visible text).
	expect(containerEl.querySelector('.dse-rollbar .dse-stepper[aria-label="Reason"]')).not.toBeNull();
	expect(containerEl.querySelectorAll('.dse-stepper')).toHaveLength(3);
});

test('numeric characteristic is fixed (no stepper for it)', async () => {
	const { containerEl } = await mountRoll('characteristic: 3');
	expect(containerEl.querySelectorAll('.dse-stepper')).toHaveLength(2);
});

test('tiers render a panel; rolling highlights the seeded tier and stores history', async () => {
	const source = 'tiers:\n  t1: "5 fire"\n  t2: "9 fire"\n  t3: "13 fire"';
	const { containerEl, session } = await mountRoll(source, [5, 6], 'fireball');
	containerEl.querySelector<HTMLButtonElement>('button[aria-label="Roll"]')!.click();
	await flushAsync(1);
	expect(
		containerEl.querySelector('.dse-pr__row[data-tier="low"]')!.getAttribute('data-dse-roll-result'),
	).toBe('active');
	expect(session.get<unknown[]>('fireball', 'roll.history.0')).toHaveLength(1);
});

test('mode flat + dice "1d6+2": no panel; seeded [4] rolls a plain 6', async () => {
	const { containerEl } = await mountRoll('mode: flat\ndice: "1d6+2"', [4]);
	expect(containerEl.querySelector('.dse-pr')).toBeNull();
	containerEl.querySelector<HTMLButtonElement>('button[aria-label="Roll"]')!.click();
	await flushAsync(1);
	expect(containerEl.querySelector('.dse-rollcard__headline')!.textContent).toBe('6');
});

test('mode opposed: single-roll total headline (OD-7)', async () => {
	const { containerEl } = await mountRoll('mode: opposed', [5, 6]);
	containerEl.querySelector<HTMLButtonElement>('button[aria-label="Roll"]')!.click();
	await flushAsync(1);
	expect(containerEl.querySelector('.dse-rollcard__headline')!.textContent).toBe('Opposed — 11');
});

test('difficulty renders in the caption (display only — never engine math)', async () => {
	const { containerEl } = await mountRoll('roll: "Might test"\ndifficulty: medium');
	expect(containerEl.querySelector('.dse-roll__expr')!.textContent).toBe(
		'Might test · medium difficulty',
	);
});

test('auto_roll rolls once on mount', async () => {
	const { containerEl } = await mountRoll('auto_roll: true', [8, 9]);
	expect(containerEl.querySelector('.dse-rollcard__headline')!.textContent).toBe('Tier 3 · 17');
});

test('rolling never writes the note: replaceSource is never called', async () => {
	const { deps } = makeDeps();
	deps.roll = stubService([5, 6]);
	const owner = new Component();
	owner.load();
	const containerEl = document.createElement('div');
	document.body.appendChild(containerEl);
	const host = makeHost(containerEl, owner, 'no-writes');
	const spy = jest.spyOn(host, 'replaceSource');
	await new ElementPipeline(deps).run(rollElement, 'auto_roll: true', host);
	await flushAsync(2);
	expect(containerEl.querySelector('.dse-rollcard')).not.toBeNull();
	expect(spy).not.toHaveBeenCalled();
});

test('OD-5 pin: rollingEnabled EXPLICITLY false never gates ds-roll — bar renders, Roll rolls', async () => {
	const { deps, prefs } = makeDeps();
	deps.roll = stubService([5, 6]);
	await prefs.set('rollingEnabled', false);
	const owner = new Component();
	owner.load();
	const containerEl = document.createElement('div');
	document.body.appendChild(containerEl);
	await new ElementPipeline(deps).run(rollElement, 'name: Quick Test', makeHost(containerEl, owner, 'od5'));
	await flushAsync(2);
	expect(containerEl.querySelector('.dse-error-card')).toBeNull();
	expect(containerEl.querySelector('.dse-rollbar')).not.toBeNull();
	containerEl.querySelector<HTMLButtonElement>('button[aria-label="Roll"]')!.click();
	await flushAsync(1);
	expect(containerEl.querySelector('.dse-rollcard')).not.toBeNull();
});
