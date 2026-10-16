// Plan 14 Task 3 (D5 §4) — the edge/bane resolver bar: steppers + toggles emit a
// RollBarState; the net-effect label mirrors §1.3 live (single = flat, double =
// shift, cancel); the bar carries NO DS math (it defers to resolveRoll).
// SC-279 — the "roll strip": Roll first, a collapsed "Modifiers" disclosure with a
// worded summary, captioned steppers, native checkboxes, Reset back to `defaults`.
import { rollBar } from '../../../src/framework/kit/rollBar';
import type { RollBarState } from '../../../src/framework/kit/rollBar';
import { Component } from '../../mocks/obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { styleGuardFindings } from './styleGuard';
import { createSessionStore } from '../../../src/framework/session';

function mount(opts: Partial<Parameters<typeof rollBar>[1]> = {}) {
	// The mock Component is structurally sufficient; kit tests type the owner
	// loosely (the fakeOwner(): any convention — see stepper/iconButton tests).
	const owner: any = new Component();
	owner.load();
	const parent = document.createElement('div');
	// Connected: jsdom fires a checkbox's change event only for an element in the document.
	document.body.appendChild(parent);
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

const summary = (parent: HTMLElement): string =>
	parent.querySelector('.dse-rollbar__summary')!.textContent ?? '';
const skillBox = (parent: HTMLElement): HTMLInputElement =>
	parent.querySelector<HTMLInputElement>('.dse-rollbar__check--skill input')!;
const mainBox = (parent: HTMLElement): HTMLInputElement | null =>
	parent.querySelector<HTMLInputElement>('.dse-rollbar__check--main input');
const resetBtn = (parent: HTMLElement): HTMLButtonElement =>
	parent.querySelector<HTMLButtonElement>('button[aria-label="Reset modifiers"]')!;
const modsHeader = (parent: HTMLElement): HTMLButtonElement =>
	parent.querySelector<HTMLButtonElement>('.dse-rollbar__mods > .dse-collapse__header')!;

test('mounts characteristic stepper (labelled), skill checkbox, edge/bane steppers, Roll + reset', () => {
	const { parent } = mount();
	expect(parent.querySelector('.dse-rollbar')).not.toBeNull();
	expect(parent.querySelectorAll('.dse-stepper').length).toBe(3); // characteristic + edges + banes
	expect(skillBox(parent)).not.toBeNull();
	expect(parent.querySelector('button[aria-label="Roll"]')).not.toBeNull();
	expect(resetBtn(parent)).not.toBeNull();
});

test('Roll is the FIRST control in the strip and the only accent control', () => {
	const { parent } = mount();
	const first = parent.querySelector('.dse-rollbar')!.firstElementChild!;
	expect(first.getAttribute('aria-label')).toBe('Roll');
	expect(parent.querySelectorAll('.dse-btn--accent')).toHaveLength(1);
});

test('the Modifiers disclosure is COLLAPSED by default (aria-expanded=false, region hidden)', () => {
	const { parent } = mount();
	expect(modsHeader(parent).getAttribute('aria-expanded')).toBe('false');
	expect(modsHeader(parent).textContent).toContain('Modifiers');
	expect(parent.querySelector<HTMLElement>('.dse-rollbar__panel')!.hidden).toBe(true);
	modsHeader(parent).click();
	expect(modsHeader(parent).getAttribute('aria-expanded')).toBe('true');
	expect(parent.querySelector<HTMLElement>('.dse-rollbar__panel')!.hidden).toBe(false);
});

test('every stepper has a VISIBLE caption equal to its accessible name (label-in-name)', () => {
	const { parent } = mount();
	const pairs = [...parent.querySelectorAll('.dse-rollbar__field')].map((f) => [
		f.querySelector('.dse-rollbar__label')!.textContent,
		f.querySelector('.dse-stepper')!.getAttribute('aria-label'),
	]);
	expect(pairs).toEqual([['Reason', 'Reason'], ['Edges', 'Edges'], ['Banes', 'Banes']]);
	// Edges + Banes stay together in one non-splitting pair.
	expect(parent.querySelectorAll('.dse-rollbar__pair .dse-stepper')).toHaveLength(2);
});

test('Skill and Main action are native labelled checkboxes with the spec wording', () => {
	const { parent } = mount({ showMainAction: true });
	const labels = [...parent.querySelectorAll('label.dse-rollbar__check')].map((l) => l.textContent);
	expect(labels).toEqual(['Skill applies (+2)', 'Main action — natural 19–20 is a critical hit']);
	expect(skillBox(parent).type).toBe('checkbox');
	expect(mainBox(parent)!.type).toBe('checkbox');
});

test('summary words every fact: characteristic always, then skill / edges / banes', () => {
	const { parent, handle } = mount();
	expect(summary(parent)).toBe('Reason 0');
	handle.setState({ characteristic: 2 });
	expect(summary(parent)).toBe('Reason +2');
	handle.setState({ characteristic: -1, skillBonus: 2, edges: 1, banes: 2 });
	expect(summary(parent)).toBe('Reason −1, skill +2, 1 edge, 2 banes');
});

test('summary: main action appears only when it differs from the default; "none" with no facts', () => {
	const on = mount({ showMainAction: true, mainAction: true });
	expect(summary(on.parent)).toBe('Reason 0'); // default (on) is not news
	on.handle.setState({ mainAction: false });
	expect(summary(on.parent)).toBe('Reason 0, not a main action');
	const off = mount({ characteristicLabel: undefined, showMainAction: true });
	expect(summary(off.parent)).toBe('none');
	off.handle.setState({ mainAction: true });
	expect(summary(off.parent)).toBe('main action');
});

test('summary updates live from the controls (stepper, checkbox)', () => {
	const { parent } = mount();
	parent.querySelector<HTMLButtonElement>('button[aria-label="Increase Edges"]')!.click();
	expect(summary(parent)).toBe('Reason 0, 1 edge');
	skillBox(parent).click();
	expect(summary(parent)).toBe('Reason 0, skill +2, 1 edge');
});

test('the net line is a polite live region and says "No edges or banes" at 0/0', () => {
	const { parent, handle } = mount();
	const net = parent.querySelector('.dse-rollbar__net')!;
	expect(net.getAttribute('aria-live')).toBe('polite');
	expect(net.textContent).toBe('No edges or banes');
	handle.setState({ edges: 1 });
	expect(net.textContent).toBe('Edge +2');
});

test('flat mode omits Edges / Banes / the net line (the engine ignores them) but keeps Skill', () => {
	const { parent } = mount({ mode: 'flat', characteristicLabel: undefined });
	expect(parent.querySelectorAll('.dse-stepper')).toHaveLength(0);
	expect(parent.querySelector('.dse-rollbar__net')).toBeNull();
	expect(skillBox(parent)).not.toBeNull();
	skillBox(parent).click();
	expect(summary(parent)).toBe('skill +2');
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
	expect(netLabel(parent)).toBe('No edges or banes');
});

test('net label caps BEFORE cancelling (engine parity): 3 edges + 1 bane = single edge', () => {
	// Rulebook §1.3 / engine step 2: each side caps at 2 FIRST, then cancels —
	// min(3,2) − min(1,2) = 1 (single edge). Cancel-then-cap would wrongly say
	// "Double edge — tier ↑" here (3 − 1 = 2). The label must mirror resolveRoll.
	const { parent, handle } = mount();
	handle.setState({ edges: 3, banes: 1 });
	expect(netLabel(parent)).toBe('Edge +2');
});

test('skill checkbox toggles skillBonus 2 in the emitted state', () => {
	const { parent, handle } = mount();
	const skill = skillBox(parent);
	skill.click();
	expect(skill.checked).toBe(true);
	expect(handle.getState().skillBonus).toBe(2);
	skill.click();
	expect(skill.checked).toBe(false);
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
	resetBtn(parent).click();
	expect(handle.getState()).toEqual({ characteristic: 4, skillBonus: 0, edges: 0, banes: 0, mainAction: false });
	expect(skillBox(parent).checked).toBe(false);
});

test('reset returns to the AUTHORED defaults, not zero (ds-roll `edges: 1` seed) — characteristic kept', () => {
	const { parent, handle } = mount({
		initial: { skillBonus: 2, edges: 1, banes: 0 },
		defaults: { skillBonus: 2, edges: 1, banes: 0, mainAction: true },
		showMainAction: true,
		mainAction: true,
	});
	handle.setState({ characteristic: 3, skillBonus: 0, edges: 2, banes: 2, mainAction: false });
	resetBtn(parent).click();
	expect(handle.getState()).toEqual({ characteristic: 3, skillBonus: 2, edges: 1, banes: 0, mainAction: true });
	expect(skillBox(parent).checked).toBe(true);
	expect(mainBox(parent)!.checked).toBe(true);
});

test('reset shows its words and is DISABLED at the defaults (enabled once anything differs)', () => {
	const { parent, handle } = mount({ defaults: { edges: 1 }, initial: { edges: 1 } });
	expect(resetBtn(parent).textContent).toContain('Reset modifiers');
	expect(resetBtn(parent).disabled).toBe(true);
	handle.setState({ edges: 0 });
	expect(resetBtn(parent).disabled).toBe(false);
	resetBtn(parent).click();
	expect(handle.getState().edges).toBe(1);
	expect(resetBtn(parent).disabled).toBe(true);
});

test('expansion persists in the SESSION slot only, and is restored by a rebuilt strip', () => {
	const session = createSessionStore();
	const persist = { session, blockKey: 'blk', slot: 'roll.modsOpen.0' };
	const first = mount({ persist });
	expect(session.get('blk', 'roll.modsOpen.0')).toBeUndefined(); // mount writes nothing
	modsHeader(first.parent).click();
	expect(session.get('blk', 'roll.modsOpen.0')).toBe(true);
	const rebuilt = mount({ persist });
	expect(modsHeader(rebuilt.parent).getAttribute('aria-expanded')).toBe('true');
	modsHeader(rebuilt.parent).click();
	expect(session.get('blk', 'roll.modsOpen.0')).toBe(false);
});

test('main-action checkbox renders only in power-roll mode with showMainAction', () => {
	const withToggle = mount({ showMainAction: true, mainAction: true });
	expect(mainBox(withToggle.parent)).not.toBeNull();
	expect(mainBox(withToggle.parent)!.checked).toBe(true);
	mainBox(withToggle.parent)!.click();
	expect(withToggle.handle.getState().mainAction).toBe(false);
	const testMode = mount({ mode: 'test', showMainAction: true });
	expect(mainBox(testMode.parent)).toBeNull();
});

test('characteristic provided read-only (bound hero, §3.3): value shown, no stepper', () => {
	const { parent } = mount({ characteristicLabel: 'Reason', characteristicFixed: 2 });
	expect(parent.querySelectorAll('.dse-stepper').length).toBe(2);
	expect(parent.querySelector('.dse-rollbar__char-fixed')!.textContent).toBe('+2');
	expect(parent.querySelector('.dse-rollbar__label')!.textContent).toBe('Reason'); // caption + read-only value
	expect(summary(parent)).toBe('Reason +2');
});

test('CSS: print hides the WHOLE strip (@media print + the preview twin) and the panel flex is hidden-guarded', () => {
	// Print rule 3 force-opens `.dse-collapse__region[hidden]`, so hiding only the buttons would
	// print the collapsed panel. And an unguarded `display:flex` on the panel would out-rank the
	// kit's `[hidden]{display:none}` and paint it open on screen.
	const css = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
	expect(css).toMatch(/@media print \{[\s\S]*?\[data-dse-element\] \.dse-rollbar \{\s*display: none;/);
	expect(css).toMatch(/\n\[data-dse-print="on"\] \.dse-rollbar \{\s*display: none;/);
	expect(css).toMatch(/\.dse-rollbar__panel:not\(\[hidden\]\) \{\s*flex: 1 1 100%;\s*display: flex;/);
});
