// Plan 14 Task 3 (D5 §3.5) — the result card: tier/total headline, crit
// treatment, traceable breakdown, Reroll/Clear actions, aria-live announce.
import { rollResultCard } from '../../../src/framework/kit/rollResultCard';
import { resolveRoll } from '../../../src/framework/roll/engine';
import type { DiceSource } from '../../../src/framework/roll/types';
import { Component } from '../../mocks/obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { styleGuardFindings } from './styleGuard';

const seeded = (faces: number[]): DiceSource => {
	let i = 0;
	return { rollDie: () => faces[i++] };
};

function mount(result = resolveRoll({ mode: 'power-roll', characteristic: 2 }, seeded([5, 6]))) {
	// fakeOwner(): any convention (see stepper/iconButton tests) — the mock
	// Component is structurally sufficient for owner-bound listeners.
	const owner: any = new Component();
	owner.load();
	const parent = document.createElement('div');
	const onReroll = jest.fn();
	const onClear = jest.fn();
	const handle = rollResultCard(parent, { result, onReroll, onClear }, owner);
	return { parent, handle, onReroll, onClear };
}

test('hygiene: rollResultCard.ts passes the kit style guard', () => {
	const src = fs.readFileSync(
		path.join(__dirname, '../../../src/framework/kit/rollResultCard.ts'), 'utf8');
	expect(styleGuardFindings(src)).toEqual([]);
});

test('tiered headline: "Tier N · total" + polite live region on the card root', () => {
	const { parent } = mount(); // total 13 → tier 2
	const card = parent.querySelector('.dse-rollcard')!;
	expect(card.getAttribute('aria-live')).toBe('polite');
	expect(card.getAttribute('role')).toBe('status');
	expect(card.querySelector('.dse-rollcard__headline')!.textContent).toBe('Tier 2 · 13');
});

test('crit headline: "Critical!" + the extra-main-action reminder', () => {
	const { parent } = mount(
		resolveRoll({ mode: 'power-roll', isMainActionAbility: true }, seeded([10, 10])),
	);
	expect(parent.querySelector('.dse-rollcard__headline')!.textContent).toBe('Critical! · 20');
	expect(parent.querySelector('.dse-rollcard__crit-note')!.textContent).toContain(
		'additional main action',
	);
});

test('opposed + flat headlines are totals (no tier invented)', () => {
	const opposed = mount(resolveRoll({ mode: 'opposed' }, seeded([5, 6])));
	expect(opposed.parent.querySelector('.dse-rollcard__headline')!.textContent).toBe('Opposed — 11');
	const flat = mount(resolveRoll({ mode: 'flat', flat: { count: 1, sides: 6, bonus: 2 } }, seeded([4])));
	expect(flat.parent.querySelector('.dse-rollcard__headline')!.textContent).toBe('6');
});

test('breakdown renders the engine trace verbatim', () => {
	const { parent } = mount();
	expect(parent.querySelector('.dse-rollcard__breakdown')!.textContent).toBe(
		'2d10 [5, 6] = 11, +2 characteristic → 13',
	);
});

test('Reroll/Clear buttons fire their callbacks', () => {
	const { parent, onReroll, onClear } = mount();
	parent.querySelector<HTMLButtonElement>('button[aria-label="Reroll"]')!.click();
	parent.querySelector<HTMLButtonElement>('button[aria-label="Clear result"]')!.click();
	expect(onReroll).toHaveBeenCalledTimes(1);
	expect(onClear).toHaveBeenCalledTimes(1);
});

test('delegate marker: dice-roller rolls carry a subtle attribution; native none', () => {
	const owner: any = new Component();
	owner.load();
	const parent = document.createElement('div');
	rollResultCard(
		parent,
		{ result: resolveRoll({ mode: 'power-roll' }, seeded([5, 6])), delegate: 'dice-roller' },
		owner,
	);
	expect(parent.querySelector('.dse-rollcard__delegate')!.textContent).toBe('rolled with Dice Roller');
	const { parent: nativeParent } = mount();
	expect(nativeParent.querySelector('.dse-rollcard__delegate')).toBeNull();
});
