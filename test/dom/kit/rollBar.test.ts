// Plan 14 Task 3 (D5 §4) — the edge/bane resolver bar: steppers + toggles emit a
// RollBarState; the net-effect label mirrors §1.3 live (single = flat, double =
// shift, cancel); the bar carries NO DS math (it defers to resolveRoll).
import { rollBar } from '../../../src/framework/kit/rollBar';
import type { RollBarState } from '../../../src/framework/kit/rollBar';
import { Component } from '../../mocks/obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { styleGuardFindings } from './styleGuard';

function mount(opts: Partial<Parameters<typeof rollBar>[1]> = {}) {
	// The mock Component is structurally sufficient; kit tests type the owner
	// loosely (the fakeOwner(): any convention — see stepper/iconButton tests).
	const owner: any = new Component();
	owner.load();
	const parent = document.createElement('div');
	const onRoll = jest.fn();
	const handle = rollBar(
		parent,
		{ mode: 'power-roll', characteristicLabel: 'Reason', onRoll, ...opts },
		owner,
	);
	return { parent, owner, handle, onRoll };
}

const netLabel = (parent: HTMLElement): string =>
	parent.querySelector('.dse-rollbar__net')!.textContent ?? '';

test('hygiene: rollBar.ts passes the kit style guard', () => {
	const src = fs.readFileSync(path.join(__dirname, '../../../src/framework/kit/rollBar.ts'), 'utf8');
	expect(styleGuardFindings(src)).toEqual([]);
});

test('mounts characteristic stepper (labelled), skill toggle, edge/bane steppers, Roll + reset', () => {
	const { parent } = mount();
	expect(parent.querySelector('.dse-rollbar')).not.toBeNull();
	expect(parent.querySelectorAll('.dse-stepper').length).toBe(3); // characteristic + edges + banes
	expect(parent.querySelector('button[aria-label="Skill (+2)"]')).not.toBeNull();
	expect(parent.querySelector('button[aria-label="Roll"]')).not.toBeNull();
	expect(parent.querySelector('button[aria-label="Reset modifiers"]')).not.toBeNull();
});

test('no characteristicLabel → no characteristic stepper (flat-mod abilities, §3.3)', () => {
	const { parent } = mount({ characteristicLabel: undefined });
	expect(parent.querySelectorAll('.dse-stepper').length).toBe(2); // edges + banes only
});

test('net label: single edge "+2", single bane "−2"', () => {
	const { parent, handle } = mount();
	handle.setState({ edges: 1 });
	expect(netLabel(parent)).toBe('Edge +2');
	handle.setState({ edges: 0, banes: 1 });
	expect(netLabel(parent)).toBe('Bane −2');
});

test('net label: doubles announce the tier shift; opposed announces ±4', () => {
	const { parent, handle } = mount();
	handle.setState({ edges: 2 });
	expect(netLabel(parent)).toBe('Double edge — tier ↑');
	const opposed = mount({ mode: 'opposed' });
	opposed.handle.setState({ edges: 2 });
	expect(netLabel(opposed.parent)).toBe('Double edge → +4');
});

test('net label: both > 0 netting 0 says they cancel; 0/0 is quiet', () => {
	const { parent, handle } = mount();
	handle.setState({ edges: 2, banes: 2 });
	expect(netLabel(parent)).toBe('Edges & banes cancel');
	handle.setState({ edges: 0, banes: 0 });
	expect(netLabel(parent)).toBe('');
});

test('net label caps BEFORE cancelling (engine parity): 3 edges + 1 bane = single edge', () => {
	// Rulebook §1.3 / engine step 2: each side caps at 2 FIRST, then cancels —
	// min(3,2) − min(1,2) = 1 (single edge). Cancel-then-cap would wrongly say
	// "Double edge — tier ↑" here (3 − 1 = 2). The label must mirror resolveRoll.
	const { parent, handle } = mount();
	handle.setState({ edges: 3, banes: 1 });
	expect(netLabel(parent)).toBe('Edge +2');
});

test('skill toggle flips aria-pressed and adds skillBonus 2 to the emitted state', () => {
	const { parent, handle } = mount();
	const skill = parent.querySelector<HTMLButtonElement>('button[aria-label="Skill (+2)"]')!;
	skill.click();
	expect(skill.getAttribute('aria-pressed')).toBe('true');
	expect(handle.getState().skillBonus).toBe(2);
	skill.click();
	expect(handle.getState().skillBonus).toBe(0);
});

test('Roll emits the CURRENT state once per activation', () => {
	const { parent, handle, onRoll } = mount();
	handle.setState({ edges: 1, characteristic: 3 });
	parent.querySelector<HTMLButtonElement>('button[aria-label="Roll"]')!.click();
	expect(onRoll).toHaveBeenCalledTimes(1);
	const state = onRoll.mock.calls[0][0] as RollBarState;
	expect(state).toEqual({ characteristic: 3, skillBonus: 0, edges: 1, banes: 0, mainAction: false });
});

test('reset clears modifiers but keeps the characteristic value (it is a fact, not a modifier)', () => {
	const { parent, handle } = mount();
	handle.setState({ characteristic: 4, edges: 2, banes: 1, skillBonus: 2 });
	parent.querySelector<HTMLButtonElement>('button[aria-label="Reset modifiers"]')!.click();
	expect(handle.getState()).toEqual({ characteristic: 4, skillBonus: 0, edges: 0, banes: 0, mainAction: false });
});

test('main-action toggle renders only in power-roll mode with showMainAction', () => {
	const withToggle = mount({ showMainAction: true, mainAction: true });
	const toggle = withToggle.parent.querySelector('button[aria-label="Main action (can crit)"]');
	expect(toggle).not.toBeNull();
	expect(toggle!.getAttribute('aria-pressed')).toBe('true');
	const testMode = mount({ mode: 'test', showMainAction: true });
	expect(testMode.parent.querySelector('button[aria-label="Main action (can crit)"]')).toBeNull();
});

test('characteristic provided read-only (bound hero, §3.3): value shown, no stepper', () => {
	const { parent } = mount({ characteristicLabel: 'Reason', characteristicFixed: 2 });
	expect(parent.querySelectorAll('.dse-stepper').length).toBe(2);
	expect(parent.querySelector('.dse-rollbar__char-fixed')!.textContent).toContain('Reason +2');
});
