// SC-408 P2b — L1 (jsdom) logic matrix for StaminaEditModal: every variant of the
// Apply box / Damage / Healing / Kill / Full Heal / Spend Recovery / Reset logic
// (values x states x host kind), table-driven. Row ids ([A05], [S08], ...) are the S1
// inventory's (.superpowers/sdd/sc408/sc408-s1-stamina-inventory.md section 2).
//
// Expected numbers are spelled out as literals (never recomputed from the modal's own
// formulae), so a regression in the clamp / absorb / floor arithmetic fails here.
//
// Known-bug convention (SC-408 ledger): a test of the CORRECT behaviour that fails today
// because of a filed bug is a `test.failing` with the ticket in its title. It passes while
// the bug exists and FAILS once the bug is fixed, so the marker gets removed then.
import {
	applyBtn,
	applyInput,
	btn,
	expectedApplyLabel,
	openStaminaModal,
	pressDamage,
	pressHealing,
	spendRecoveryBtn,
	staminaInput,
	tempInput,
	typeCommit,
} from '../_staminaHarness';

afterEach(() => {
	document.body.innerHTML = '';
});

// ------------------------------------------------------------------------------------
// Quick-action matrix: Damage / Healing / Kill / Full Heal
//   x state (full / near max / winded / dying-or-near-dead / at the floor)
//   x temp present / absent  x  hero (floor ceil(-max/2) = -10) / creature (floor 0)
// All rows: max 20. [dStamina, dTemp] is the pending change the press must produce.
// ------------------------------------------------------------------------------------

type Kind = 'hero' | 'creature';
type Row = { kind: Kind; state: string; current: number; temp: number; amount?: number; d: [number, number] };

const HERO_STATES: Array<[string, number]> = [['full', 20], ['near max', 17], ['winded', 8], ['dying', -4], ['at floor', -10]];
const CREATURE_STATES: Array<[string, number]> = [['full', 20], ['near max', 17], ['winded', 8], ['near dead', 4], ['dead', 0]];

/** [stamina delta without temp, stamina delta with 5 temp]; temp delta is -5 with temp. */
const DAMAGE_6: Record<Kind, Record<string, [number, number]>> = {
	hero: { full: [-6, -1], 'near max': [-6, -1], winded: [-6, -1], dying: [-6, -1], 'at floor': [0, 0] },
	creature: { full: [-6, -1], 'near max': [-6, -1], winded: [-6, -1], 'near dead': [-4, -1], dead: [0, 0] },
};
/** Healing never touches temp: the same stamina delta with or without temp. */
const HEALING_6: Record<Kind, Record<string, number>> = {
	hero: { full: 0, 'near max': 3, winded: 6, dying: 6, 'at floor': 6 },
	creature: { full: 0, 'near max': 3, winded: 6, 'near dead': 6, dead: 6 },
};
/** Kill: straight to the floor (hero -10 / creature 0); temp always zeroed. */
const KILL: Record<Kind, Record<string, number>> = {
	hero: { full: -30, 'near max': -27, winded: -18, dying: -6, 'at floor': 0 },
	creature: { full: -20, 'near max': -17, winded: -8, 'near dead': -4, dead: 0 },
};
/** Full Heal: straight to max 20; temp always zeroed. */
const FULL_HEAL: Record<Kind, Record<string, number>> = {
	hero: { full: 0, 'near max': 3, winded: 12, dying: 24, 'at floor': 30 },
	creature: { full: 0, 'near max': 3, winded: 12, 'near dead': 16, dead: 20 },
};

function rows(
	states: Record<Kind, Record<string, unknown>>,
	build: (kind: Kind, state: string, current: number, temp: number) => Row,
): Row[] {
	const out: Row[] = [];
	for (const [kind, list] of [['hero', HERO_STATES], ['creature', CREATURE_STATES]] as Array<[Kind, Array<[string, number]>]>) {
		for (const [state, current] of list) {
			if (!(state in states[kind])) continue;
			for (const temp of [0, 5]) out.push(build(kind, state, current, temp));
		}
	}
	return out;
}

/** Press the action, then check: preview (steppers, label, disabled), then Apply. */
function runCase(r: Row, press: (content: HTMLElement) => void): void {
	const { content, bar, updateCallback } = openStaminaModal({ max: 20, current: r.current, temp: r.temp, isHero: r.kind === 'hero' });
	press(content);
	const [dS, dT] = r.d;
	// Preview: both steppers show the pending positions; the label spells the change.
	expect(staminaInput(content).value).toBe(String(r.current + dS));
	expect(tempInput(content).value).toBe(String(r.temp + dT));
	expect(applyBtn(content).textContent).toBe(expectedApplyLabel(dS, dT));
	expect(applyBtn(content).disabled).toBe(dS === 0 && dT === 0);
	// Apply persists exactly that, once.
	applyBtn(content).click();
	if (dS === 0 && dT === 0) {
		expect(updateCallback).not.toHaveBeenCalled();
		expect(bar.current_stamina).toBe(r.current);
		expect(bar.temp_stamina).toBe(r.temp);
	} else {
		expect(updateCallback).toHaveBeenCalledTimes(1);
		expect(bar.current_stamina).toBe(r.current + dS);
		expect(bar.temp_stamina).toBe(r.temp + dT);
	}
}

describe('[A01][A02][A03][A04][A15] Damage 6 matrix (temp absorbs first, capped at the floor)', () => {
	const cases = rows(DAMAGE_6, (kind, state, current, temp) => ({
		kind, state, current, temp, amount: 6, d: [DAMAGE_6[kind][state][temp ? 1 : 0], temp ? -5 : 0],
	}));
	test.each(cases)('$kind $state ($current) temp $temp: Damage 6 -> $d', (r) => {
		runCase(r, (c) => pressDamage(c, 6));
	});
});

describe('[A03][A04] Damage 99: huge hits stop at the floor, temp still absorbed first', () => {
	const cases: Row[] = [
		{ kind: 'hero', state: 'full', current: 20, temp: 0, d: [-30, 0] },
		{ kind: 'hero', state: 'full', current: 20, temp: 5, d: [-30, -5] },
		{ kind: 'hero', state: 'dying', current: -4, temp: 0, d: [-6, 0] },
		{ kind: 'hero', state: 'at floor', current: -10, temp: 5, d: [0, -5] },
		{ kind: 'creature', state: 'full', current: 20, temp: 5, d: [-20, -5] },
		{ kind: 'creature', state: 'winded', current: 8, temp: 0, d: [-8, 0] },
		{ kind: 'creature', state: 'dead', current: 0, temp: 5, d: [0, -5] },
	];
	test.each(cases)('$kind $state ($current) temp $temp: Damage 99 -> $d', (r) => {
		runCase(r, (c) => pressDamage(c, 99));
	});
});

describe('[A11][A12][A15] Healing 6 matrix (capped at max, never touches temp)', () => {
	const cases = rows(HEALING_6, (kind, state, current, temp) => ({
		kind, state, current, temp, amount: 6, d: [HEALING_6[kind][state], 0],
	}));
	test.each(cases)('$kind $state ($current) temp $temp: Healing 6 -> $d', (r) => {
		runCase(r, (c) => pressHealing(c, 6));
	});
});

describe('[A11][A15] Healing 99: huge heals stop at max, from any depth', () => {
	const cases: Row[] = [
		{ kind: 'hero', state: 'at floor', current: -10, temp: 0, d: [30, 0] },
		{ kind: 'hero', state: 'dying', current: -4, temp: 5, d: [24, 0] },
		{ kind: 'creature', state: 'dead', current: 0, temp: 0, d: [20, 0] },
		{ kind: 'creature', state: 'winded', current: 8, temp: 5, d: [12, 0] },
		{ kind: 'creature', state: 'full', current: 20, temp: 0, d: [0, 0] },
	];
	test.each(cases)('$kind $state ($current) temp $temp: Healing 99 -> $d', (r) => {
		runCase(r, (c) => pressHealing(c, 99));
	});
});

describe('[Q01][Q02] Kill matrix (to the floor, temp zeroed)', () => {
	const cases = rows(KILL, (kind, state, current, temp) => ({
		kind, state, current, temp, d: [KILL[kind][state], -temp],
	}));
	test.each(cases)('$kind $state ($current) temp $temp: Kill -> $d', (r) => {
		runCase(r, (c) => btn(c, 'Kill').click());
	});
});

describe('[Q04] Full Heal matrix (to max 20, temp zeroed)', () => {
	const cases = rows(FULL_HEAL, (kind, state, current, temp) => ({
		kind, state, current, temp, d: [FULL_HEAL[kind][state], -temp],
	}));
	test.each(cases)('$kind $state ($current) temp $temp: Full Heal -> $d', (r) => {
		runCase(r, (c) => btn(c, 'Full Heal').click());
	});
});

// ------------------------------------------------------------------------------------
// Apply box parsing
// ------------------------------------------------------------------------------------

describe('[A05] repeated Damage / Healing presses accumulate (and stay clamped)', () => {
	test('creature 20/20: Damage 3 x3 -> -9, one Apply persists 11', () => {
		const { content, bar } = openStaminaModal({ max: 20, current: 20, isHero: false });
		pressDamage(content, 3);
		pressDamage(content, 3);
		pressDamage(content, 3);
		expect(applyBtn(content).textContent).toBe('Lose 9 Stamina');
		applyBtn(content).click();
		expect(bar.current_stamina).toBe(11);
	});

	test('creature 20/20 + 5 temp: Damage 4 x2 -> temp absorbs 5, stamina loses 3', () => {
		const { content, bar } = openStaminaModal({ max: 20, current: 20, temp: 5, isHero: false });
		pressDamage(content, 4);
		pressDamage(content, 4);
		expect(applyBtn(content).textContent).toBe('Lose 3 Stamina and Lose 5 Temp Stamina');
		applyBtn(content).click();
		expect({ cur: bar.current_stamina, temp: bar.temp_stamina }).toEqual({ cur: 17, temp: 0 });
	});

	test('hero 5/20: Damage 10 x3 stops at the floor (-10), so -15 pending, not -30', () => {
		const { content, bar } = openStaminaModal({ max: 20, current: 5, isHero: true });
		pressDamage(content, 10);
		pressDamage(content, 10);
		pressDamage(content, 10);
		expect(applyBtn(content).textContent).toBe('Lose 15 Stamina');
		applyBtn(content).click();
		expect(bar.current_stamina).toBe(-10);
	});

	test('creature 5/20: Healing 4 x5 stops at max, so +15 pending, not +20', () => {
		const { content, bar } = openStaminaModal({ max: 20, current: 5, isHero: false });
		for (let i = 0; i < 5; i++) pressHealing(content, 4);
		expect(applyBtn(content).textContent).toBe('Gain 15 Stamina');
		applyBtn(content).click();
		expect(bar.current_stamina).toBe(20);
	});

	test('Damage then Healing then Damage nets out (pending is a running sum)', () => {
		const { content, bar } = openStaminaModal({ max: 20, current: 12, isHero: false });
		pressDamage(content, 5);
		pressHealing(content, 2);
		pressDamage(content, 1);
		expect(applyBtn(content).textContent).toBe('Lose 4 Stamina');
		applyBtn(content).click();
		expect(bar.current_stamina).toBe(8);
	});
});

describe('[A07] Damage / Healing with an empty or non-numeric Apply box is a silent no-op', () => {
	// jsdom sanitises a type=number input: "abc" and "--" both read back as "".
	const boxes = ['', 'abc', '--', 'e'];
	test.each(boxes.flatMap((v) => ['Damage', 'Healing'].map((action) => ({ v, action }))))(
		'box "$v" + $action: nothing pending, Apply stays disabled',
		({ v, action }) => {
			const { content, updateCallback } = openStaminaModal({ max: 20, current: 10, temp: 3, isHero: false });
			applyInput(content).value = v;
			btn(content, action).click();
			expect(applyBtn(content).textContent).toBe('No Stamina Change');
			expect(applyBtn(content).disabled).toBe(true);
			expect(staminaInput(content).value).toBe('10');
			expect(tempInput(content).value).toBe('3');
			expect(updateCallback).not.toHaveBeenCalled();
		},
	);
});

describe('[A08] a decimal in the Apply box is truncated (parseInt), not rounded', () => {
	test.each([
		{ v: '2.9', action: 'Damage', d: -2 },
		{ v: '2.9', action: 'Healing', d: 2 },
		{ v: '0.9', action: 'Damage', d: 0 },
		{ v: '0.9', action: 'Healing', d: 0 },
		{ v: '7.0', action: 'Damage', d: -7 },
		{ v: '-2.9', action: 'Damage', d: 0 },
		{ v: '-2.9', action: 'Healing', d: 0 },
	])('box "$v" + $action -> pending $d', ({ v, action, d }) => {
		const { content } = openStaminaModal({ max: 20, current: 10, isHero: false });
		applyInput(content).value = v;
		btn(content, action).click();
		expect(applyBtn(content).textContent).toBe(expectedApplyLabel(d, 0));
		expect(staminaInput(content).value).toBe(String(10 + d));
	});
});

describe('[A09] "1e3" is a valid number-input value and means 1000', () => {
	// parseInt("1e3") === 1, so today Damage deals 1 and Healing heals 1. The correct
	// behaviour is 1000 (then capped at the floor / max).
	test('[A09] Damage "1e3" on a creature 20/20 is capped at 20', () => {
		const { content } = openStaminaModal({ max: 20, current: 20, isHero: false });
		pressDamage(content, '1e3');
		expect(applyInput(content).value).toBe('1e3'); // jsdom keeps the valid exponent form
		expect(applyBtn(content).textContent).toBe('Lose 20 Stamina');
	});

	test('[A09] Healing "1e3" on a creature 5/20 is capped at max (+15)', () => {
		const { content } = openStaminaModal({ max: 20, current: 5, isHero: false });
		pressHealing(content, '1e3');
		expect(applyInput(content).value).toBe('1e3');
		expect(applyBtn(content).textContent).toBe('Gain 15 Stamina');
	});
});

describe('[A10][A14][Q03] out-of-range current (hand-edited YAML) must not invert the controls', () => {
	test('[A10] Damage on a creature already at -3 never heals', () => {
		const { modal, content } = openStaminaModal({ max: 20, current: -3, isHero: false });
		pressDamage(content, 5);
		expect(modal.pendingStaminaChange).toBeLessThanOrEqual(0);
	});

	test('[A14] Healing on a bar at 25/20 never damages', () => {
		const { modal, content } = openStaminaModal({ max: 20, current: 25, isHero: false });
		pressHealing(content, 5);
		expect(modal.pendingStaminaChange).toBeGreaterThanOrEqual(0);
	});

	test('[Q03] Kill on a hero below the death floor (-10, max 15, floor -7) does not say "Gain"', () => {
		const { content } = openStaminaModal({ max: 15, current: -10, isHero: true });
		btn(content, 'Kill').click();
		expect(applyBtn(content).textContent).not.toMatch(/^Gain/);
	});

	test('[Q03] Kill on a creature already at -3 does not say "Gain"', () => {
		const { content } = openStaminaModal({ max: 20, current: -3, isHero: false });
		btn(content, 'Kill').click();
		expect(applyBtn(content).textContent).not.toMatch(/^Gain/);
	});
});

describe('[A16] Enter in the Apply box is not wired to anything (characterisation)', () => {
	test('typing 5 and pressing Enter changes nothing pending', () => {
		const { modal, content, updateCallback } = openStaminaModal({ max: 20, current: 20, isHero: false });
		applyInput(content).value = '5';
		applyInput(content).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		expect(modal.pendingStaminaChange).toBe(0);
		expect(modal.pendingTempStaminaChange).toBe(0);
		expect(applyBtn(content).disabled).toBe(true);
		expect(updateCallback).not.toHaveBeenCalled();
	});
});

// ------------------------------------------------------------------------------------
// Stamina stepper: typed values outside [floor, max]
// ------------------------------------------------------------------------------------

describe('[S01][S02][S04] typed in-range values: the label equals the persisted delta', () => {
	test.each([
		{ kind: 'creature', cur: 10, typed: '15', persisted: 15 },
		{ kind: 'creature', cur: 10, typed: '0', persisted: 0 },
		{ kind: 'creature', cur: 10, typed: '20', persisted: 20 },
		{ kind: 'hero', cur: 10, typed: '-10', persisted: -10 },
		{ kind: 'hero', cur: 10, typed: '-3', persisted: -3 },
		{ kind: 'creature', cur: 10, typed: '7.5', persisted: 7 },
	] as const)('$kind 10/20: type $typed -> persists $persisted, label matches', ({ kind, cur, typed, persisted }) => {
		const { content, bar } = openStaminaModal({ max: 20, current: cur, isHero: kind === 'hero' });
		typeCommit(staminaInput(content), typed);
		expect(applyBtn(content).textContent).toBe(expectedApplyLabel(persisted - cur, 0));
		applyBtn(content).click();
		expect(bar.current_stamina).toBe(persisted);
	});
});

describe('[S08][S09] typed values outside [floor, max]: the Apply label must equal the applied change', () => {
	// The modal clamps at Apply (the persisted value is right), but the preview / label is
	// computed from the RAW typed value, so it promises a change that is not applied.
	const out = [
		{ id: 'S08', kind: 'creature', cur: 10, typed: '30', persisted: 20 },
		{ id: 'S08', kind: 'hero', cur: 10, typed: '99', persisted: 20 },
		{ id: 'S09', kind: 'creature', cur: 10, typed: '-5', persisted: 0 },
		{ id: 'S09', kind: 'hero', cur: 10, typed: '-50', persisted: -10 },
	] as const;
	test.each(out)(
		'[$id] $kind 10/20: typed $typed -> label matches the persisted change',
		({ kind, cur, typed, persisted }) => {
			const { content, bar } = openStaminaModal({ max: 20, current: cur, isHero: kind === 'hero' });
			typeCommit(staminaInput(content), typed);
			const label = applyBtn(content).textContent;
			applyBtn(content).click();
			expect(bar.current_stamina).toBe(persisted); // persistence itself is right today
			expect(label).toBe(expectedApplyLabel(persisted - cur, 0));
		},
	);

	test.each(out)('[$id] $kind 10/20: typed $typed -> persistence IS clamped to $persisted (control)', ({ kind, cur, typed, persisted }) => {
		const { content, bar } = openStaminaModal({ max: 20, current: cur, isHero: kind === 'hero' });
		typeCommit(staminaInput(content), typed);
		applyBtn(content).click();
		expect(bar.current_stamina).toBe(persisted);
	});
});

describe('[S10] typed overshoot then ± (SC-427: the field is bounded, so there is no overshoot to walk past)', () => {
	test('max 20, current 10: type 22 -> the field shows 20, "+" is disabled, label and Apply say +10', () => {
		const { content, bar } = openStaminaModal({ max: 20, current: 10, isHero: false });
		typeCommit(staminaInput(content), '22');
		expect(staminaInput(content).value).toBe('20');
		expect(btn(content, 'Increase Stamina').disabled).toBe(true);
		expect(applyBtn(content).textContent).toBe('Gain 10 Stamina');
		btn(content, 'Increase Stamina').click(); // a disabled button: nothing moves
		expect(staminaInput(content).value).toBe('20');
		applyBtn(content).click();
		expect(bar.current_stamina).toBe(20);
	});

	test('max 20, current 10 creature: type -3 -> the field shows 0, "-" is disabled, label and Apply say -10', () => {
		const { content, bar } = openStaminaModal({ max: 20, current: 10, isHero: false });
		typeCommit(staminaInput(content), '-3');
		expect(staminaInput(content).value).toBe('0');
		expect(btn(content, 'Decrease Stamina').disabled).toBe(true);
		expect(applyBtn(content).textContent).toBe('Lose 10 Stamina');
		applyBtn(content).click();
		expect(bar.current_stamina).toBe(0);
	});
});

describe('[S11] the Stamina stepper stops at the bounds: max for both kinds, floor 0 (creature) / ceil(-max/2) (hero)', () => {
	test.each([
		{ kind: 'creature', cur: 19, dir: 'Increase Stamina', stops: 20, label: 'Gain 1 Stamina' },
		{ kind: 'hero', cur: 19, dir: 'Increase Stamina', stops: 20, label: 'Gain 1 Stamina' },
		{ kind: 'creature', cur: 1, dir: 'Decrease Stamina', stops: 0, label: 'Lose 1 Stamina' },
		{ kind: 'hero', cur: -9, dir: 'Decrease Stamina', stops: -10, label: 'Lose 1 Stamina' },
	] as const)('$kind at $cur: one $dir lands on $stops, the next press is disabled and stages nothing more', ({ kind, cur, dir, stops, label }) => {
		const { content, bar } = openStaminaModal({ max: 20, current: cur, isHero: kind === 'hero' });
		btn(content, dir).click();
		expect(staminaInput(content).value).toBe(String(stops));
		expect(btn(content, dir).disabled).toBe(true);
		btn(content, dir).click();
		expect(staminaInput(content).value).toBe(String(stops));
		expect(applyBtn(content).textContent).toBe(label);
		applyBtn(content).click();
		expect(bar.current_stamina).toBe(stops);
	});

	test.each([
		{ kind: 'creature', cur: 20, dir: 'Increase Stamina' },
		{ kind: 'creature', cur: 0, dir: 'Decrease Stamina' },
		{ kind: 'hero', cur: -10, dir: 'Decrease Stamina' },
	] as const)('$kind opened exactly at the bound: $dir starts disabled and Apply stays on "No Stamina Change"', ({ kind, cur, dir }) => {
		const { content } = openStaminaModal({ max: 20, current: cur, isHero: kind === 'hero' });
		expect(btn(content, dir).disabled).toBe(true);
		expect(applyBtn(content).textContent).toBe('No Stamina Change');
		expect(applyBtn(content).disabled).toBe(true);
	});

	test.each([
		{ id: 'creature over max', kind: 'creature', typed: '30', shows: '20' },
		{ id: 'hero over max', kind: 'hero', typed: '99', shows: '20' },
		{ id: 'creature under floor', kind: 'creature', typed: '-5', shows: '0' },
		{ id: 'hero under floor', kind: 'hero', typed: '-50', shows: '-10' },
	] as const)('$id: typed $typed -> the field itself shows $shows', ({ kind, typed, shows }) => {
		const { content } = openStaminaModal({ max: 20, current: 10, isHero: kind === 'hero' });
		typeCommit(staminaInput(content), typed);
		expect(staminaInput(content).value).toBe(shows);
	});

	test('a hero floor is per-hero: a max-15 hero floors at -7 where a creature floors at 0', () => {
		const hero = openStaminaModal({ max: 15, current: 5, isHero: true });
		typeCommit(staminaInput(hero.content), '-50');
		expect(staminaInput(hero.content).value).toBe('-7');
		expect(applyBtn(hero.content).textContent).toBe('Lose 12 Stamina');
		const creature = openStaminaModal({ max: 15, current: 5, isHero: false });
		typeCommit(staminaInput(creature.content), '-50');
		expect(staminaInput(creature.content).value).toBe('0');
		expect(applyBtn(creature.content).textContent).toBe('Lose 5 Stamina');
	});
});

describe('[S12] "1e3" typed into the steppers (the kit stepper reads it with Number(), so it was never affected)', () => {
	test('Stamina: "1e3" is 1000, clamped to max', () => {
		const { content } = openStaminaModal({ max: 20, current: 10, isHero: false });
		typeCommit(staminaInput(content), '1e3');
		expect(staminaInput(content).value).toBe('20');
		expect(applyBtn(content).textContent).toBe('Gain 10 Stamina');
	});

	test('Temporary Stamina: "1e3" is 1000 (temp has no upper bound)', () => {
		const { content } = openStaminaModal({ max: 20, current: 10, isHero: false });
		typeCommit(tempInput(content), '1e3');
		expect(tempInput(content).value).toBe('1000');
		expect(applyBtn(content).textContent).toBe('Gain 1000 Temp Stamina');
	});
});

// SC-427 review R1-M1: on an out-of-range STORED value a partial Damage / Healing leaves
// stored + pending outside [floor, max]; the label must state what Apply actually WRITES
// (the clamped change), exactly like the field and the persisted value.
describe('[M1] Damage / Healing on an out-of-range stored value: label == field == persisted', () => {
	type Case = { id: string; max: number; cur: number; temp?: number; hero: boolean; presses: Array<['Damage' | 'Healing', number]>; label: string; field: number; persisted: number; temp2?: number };
	const cases: Case[] = [
		{ id: 'creature 25/20, Damage 3', max: 20, cur: 25, hero: false, presses: [['Damage', 3]], label: 'Lose 5 Stamina', field: 20, persisted: 20 },
		{ id: 'hero -14/20 (floor -10), Healing 2', max: 20, cur: -14, hero: true, presses: [['Healing', 2]], label: 'Gain 4 Stamina', field: -10, persisted: -10 },
		{ id: 'creature -3/20, Healing 2', max: 20, cur: -3, hero: false, presses: [['Healing', 2]], label: 'Gain 3 Stamina', field: 0, persisted: 0 },
		{ id: 'hero -10/15 (floor -7), Healing 2', max: 15, cur: -10, hero: true, presses: [['Healing', 2]], label: 'Gain 3 Stamina', field: -7, persisted: -7 },
		{
			id: 'hero 18/15 temp 4, Damage 3 twice', max: 15, cur: 18, temp: 4, hero: true, presses: [['Damage', 3], ['Damage', 3]],
			label: 'Lose 3 Stamina and Lose 4 Temp Stamina', field: 15, persisted: 15, temp2: 0,
		},
	];
	test.each(cases)('$id', ({ max, cur, temp, hero, presses, label, field, persisted, temp2 }) => {
		const { content, bar } = openStaminaModal({ max, current: cur, temp, isHero: hero });
		for (const [action, amount] of presses) (action === 'Damage' ? pressDamage : pressHealing)(content, amount);
		expect(applyBtn(content).textContent).toBe(label);
		expect(applyBtn(content).disabled).toBe(false);
		expect(staminaInput(content).value).toBe(String(field));
		applyBtn(content).click();
		expect(bar.current_stamina).toBe(persisted);
		if (temp2 !== undefined) expect(bar.temp_stamina).toBe(temp2);
	});

	test('in range nothing changes: 10/20 Damage 3 is still "Lose 3 Stamina" (the clamp is the identity)', () => {
		const { content } = openStaminaModal({ max: 20, current: 10, isHero: false });
		pressDamage(content, 3);
		expect(applyBtn(content).textContent).toBe('Lose 3 Stamina');
	});
});

// SC-427 R3-F5: the preview bar draws the position Apply will WRITE (the clamped one), the same value
// the label states, not the raw staged sum. Measured against a second modal OPENED AT the persisted
// value: its (unstaged) bar is the reference for "where the pending marker must sit".
describe('[M1b] the preview bar/gauge draw the clamped pending position', () => {
	const prop = (root: HTMLElement, sel: string, name: string): string =>
		root.querySelector<HTMLElement>(sel)!.style.getPropertyValue(name);
	const gauge = (content: HTMLElement): HTMLElement => content.querySelector<HTMLElement>('.dse-stamina__cluster > *')!;
	const legacyFill = (content: HTMLElement): number => parseFloat(prop(content, '.dse-stamina__fill', '--dse-fill'));
	const legacyDelta = (content: HTMLElement): number => parseFloat(prop(content, '.dse-stamina__delta', '--dse-delta-fill'));

	test.each([
		{ id: 'creature 25/20, Damage 3 (persists 20)', max: 20, cur: 25, hero: false, press: pressDamage, amount: 3, persisted: 20, delta: 25 },
		{ id: 'hero -14/20 (floor -10), Healing 2 (persists -10)', max: 20, cur: -14, hero: true, press: pressHealing, amount: 2, persisted: -10, delta: (4 / 30) * 100 },
	])('$id: pending marker == a modal opened at the persisted value; band width == the clamped change', ({ max, cur, hero, press, amount, persisted, delta }) => {
		const pending = openStaminaModal({ max, current: cur, isHero: hero });
		press(pending.content, amount);
		const ref = openStaminaModal({ max, current: persisted, isHero: hero });
		// legacy track: where the bar ENDS (a heal's band sits after the fill, a damage band inside it) is
		// where the persisted value sits; the delta is the clamped change
		const heal = pending.content.querySelector('.dse-stamina__delta')!.getAttribute('data-kind') === 'heal';
		expect(legacyFill(pending.content) + (heal ? legacyDelta(pending.content) : 0)).toBeCloseTo(legacyFill(ref.content), 6);
		expect(legacyDelta(pending.content)).toBeCloseTo(delta, 6);
		// steel gauge: the same pour / wound / cap position as the persisted value's gauge
		for (const name of ['--dse-pour-w', '--dse-wound-w', '--dse-cap-x']) {
			expect(gauge(pending.content).style.getPropertyValue(name)).toBe(gauge(ref.content).style.getPropertyValue(name));
		}
	});

	test('in range the clamp is the identity: 10/20 Damage 3 draws fill 35 / delta 15', () => {
		const { content } = openStaminaModal({ max: 20, current: 10, isHero: false });
		pressDamage(content, 3);
		expect(legacyFill(content)).toBeCloseTo(35, 6);
		expect(legacyDelta(content)).toBeCloseTo(15, 6);
	});
});

describe('[O2] opening on a hand-edited out-of-range current stages nothing', () => {
	test.each([
		{ id: 'creature 25/20', max: 20, current: 25, isHero: false },
		{ id: 'creature -3/20', max: 20, current: -3, isHero: false },
		{ id: 'hero -10/15 (floor -7)', max: 15, current: -10, isHero: true },
	])('$id: "No Stamina Change", Apply disabled, nothing pending, nothing written', ({ max, current, isHero }) => {
		const { modal, content, bar, updateCallback } = openStaminaModal({ max, current, isHero });
		expect(applyBtn(content).textContent).toBe('No Stamina Change');
		expect(applyBtn(content).disabled).toBe(true);
		expect(modal.pendingStaminaChange).toBe(0);
		expect(modal.pendingTempStaminaChange).toBe(0);
		applyBtn(content).click();
		expect(updateCallback).not.toHaveBeenCalled();
		expect(bar.current_stamina).toBe(current);
	});

	test('the first real edit stages from the STORED value: 25/20, "-" lands the field on 19 and says -6', () => {
		const { modal, content, bar } = openStaminaModal({ max: 20, current: 25, isHero: false });
		btn(content, 'Decrease Stamina').click();
		expect(staminaInput(content).value).toBe('19');
		expect(modal.pendingStaminaChange).toBe(-6);
		expect(applyBtn(content).textContent).toBe('Lose 6 Stamina');
		applyBtn(content).click();
		expect(bar.current_stamina).toBe(19);
	});

	test('Healing / Damage at the wrong side of the range are no-ops, not inversions', () => {
		const over = openStaminaModal({ max: 20, current: 25, isHero: false });
		pressHealing(over.content, 5);
		expect(applyBtn(over.content).textContent).toBe('No Stamina Change');
		const under = openStaminaModal({ max: 20, current: -3, isHero: false });
		pressDamage(under.content, 5);
		expect(applyBtn(under.content).textContent).toBe('No Stamina Change');
	});

	test('Full Heal at a stored value past max stages no stamina change (never "Lose"), and still clears temp', () => {
		const plain = openStaminaModal({ max: 20, current: 25, isHero: false });
		btn(plain.content, 'Full Heal').click();
		expect(applyBtn(plain.content).textContent).toBe('No Stamina Change');
		expect(applyBtn(plain.content).disabled).toBe(true);
		const withTemp = openStaminaModal({ max: 20, current: 25, temp: 4, isHero: false });
		btn(withTemp.content, 'Full Heal').click();
		expect(applyBtn(withTemp.content).textContent).toBe('Lose 4 Temp Stamina');
	});

	test('Full Heal below the hero floor is still a heal: -10 under a -7 floor, max 15 -> Gain 25', () => {
		const { content, bar } = openStaminaModal({ max: 15, current: -10, isHero: true });
		btn(content, 'Full Heal').click();
		expect(applyBtn(content).textContent).toBe('Gain 25 Stamina');
		applyBtn(content).click();
		expect(bar.current_stamina).toBe(15);
	});

	test.each([
		{ id: 'creature 25/20', max: 20, current: 25, isHero: false },
		{ id: 'creature -3/20', max: 20, current: -3, isHero: false },
		{ id: 'hero -10/15 (floor -7)', max: 15, current: -10, isHero: true },
	])('$id: a Temp-only Apply leaves current Stamina exactly as stored (no silent clamp rewrite)', ({ max, current, isHero }) => {
		const { content, bar, updateCallback } = openStaminaModal({ max, current, temp: 2, isHero });
		btn(content, 'Increase Temporary Stamina').click();
		expect(applyBtn(content).textContent).toBe('Gain 1 Temp Stamina');
		applyBtn(content).click();
		expect(updateCallback).toHaveBeenCalledTimes(1);
		expect(bar.current_stamina).toBe(current);
		expect(bar.temp_stamina).toBe(3);
	});

	test('a REAL Stamina change on an out-of-range stored value still lands in range (clampStamina owns it)', () => {
		const { content, bar } = openStaminaModal({ max: 20, current: -3, isHero: false });
		btn(content, 'Increase Stamina').click(); // shown 0 -> 1: stages +4 from the stored -3
		expect(applyBtn(content).textContent).toBe('Gain 4 Stamina');
		applyBtn(content).click();
		expect(bar.current_stamina).toBe(1);
	});

	test('Kill below the hero floor stages no stamina change (never "Gain"), and still clears temp', () => {
		const { content } = openStaminaModal({ max: 15, current: -10, temp: 4, isHero: true });
		btn(content, 'Kill').click();
		expect(applyBtn(content).textContent).toBe('Lose 4 Temp Stamina');
	});
});

// ------------------------------------------------------------------------------------
// max 0 / unavailable max (ds-hero with an unresolved class bridges max to 0)
// ------------------------------------------------------------------------------------

describe('[Q05] a bar whose max is 0 (unavailable) must not zero current stamina [known bug SC-425]', () => {
	test.failing('[Q05] Damage 5 on 31 persists 26, never 0 [known bug SC-425]', () => {
		const { content, bar } = openStaminaModal({ max: 0, current: 31, isHero: true });
		pressDamage(content, 5);
		applyBtn(content).click();
		expect(bar.current_stamina).toBe(26);
	});

	// SC-427 (F2) side effect: Full Heal is now Math.max(0, max - current), so with max 0 it stages
	// no Stamina change (Apply stays disabled) instead of a "Lose 31" that Apply then wrote as 0.
	// Only the Full Heal half of SC-425's finding is closed by it; the Damage row above is still open.
	test('[Q05] Full Heal on 31 does not write 0 (closed incidentally by SC-427 F2; Apply stays disabled)', () => {
		const { content, bar } = openStaminaModal({ max: 0, current: 31, isHero: true });
		btn(content, 'Full Heal').click();
		applyBtn(content).click();
		expect(bar.current_stamina).not.toBe(0);
	});
});

// ------------------------------------------------------------------------------------
// Spend Recovery
// ------------------------------------------------------------------------------------

describe('[Q14] Spend Recovery is rendered or suppressed by opts.spendRecovery', () => {
	test.each([
		{ opts: undefined, rendered: true },
		{ opts: {}, rendered: true },
		{ opts: { spendRecovery: true }, rendered: true },
		{ opts: { spendRecovery: false }, rendered: false },
	])('opts $opts -> control rendered: $rendered', ({ opts, rendered }) => {
		const { content } = openStaminaModal({ max: 30, current: 10, recoveries: 2, recoveries_max: 6, opts });
		expect(spendRecoveryBtn(content) !== null).toBe(rendered);
	});

	test('suppressed: the rest of the quick actions are all still there and working', () => {
		const { content, bar } = openStaminaModal({ max: 30, current: 10, opts: { spendRecovery: false } });
		for (const label of ['Damage', 'Healing', 'Kill', 'Full Heal', 'Reset']) expect(btn(content, label)).toBeTruthy();
		btn(content, 'Full Heal').click();
		applyBtn(content).click();
		expect(bar.current_stamina).toBe(30);
	});
});

describe('[Q06][Q07][Q09][Q10][Q15] Spend Recovery across positions (a hero with a tracked pool, recoveryValue = floor(30/3) = 10)', () => {
	const REASON_MAX = 'Spend Recovery: Already at maximum Stamina';
	const REASON_NONE = 'Spend Recovery: No Recoveries remaining';
	type SR = {
		name: string; kind: Kind; cur: number; rec: number; presses: number;
		/** pending stamina change, pending recoveries spent, enabled afterwards, reason when disabled */
		dS: number; spent: number; enabled: boolean; reason?: string;
	};
	const cases: SR[] = [
		{ name: 'full: starts disabled (max reason)', kind: 'hero', cur: 30, rec: 3, presses: 0, dS: 0, spent: 0, enabled: false, reason: REASON_MAX },
		{ name: 'one short of max: heals only the gap, then disabled (max reason)', kind: 'hero', cur: 25, rec: 3, presses: 1, dS: 5, spent: 1, enabled: false, reason: REASON_MAX },
		{ name: 'mid: one press heals 10, still enabled', kind: 'hero', cur: 10, rec: 3, presses: 1, dS: 10, spent: 1, enabled: true },
		{ name: 'mid: two presses heal 20, still enabled', kind: 'hero', cur: 5, rec: 3, presses: 2, dS: 20, spent: 2, enabled: true },
		{ name: 'mid: presses stop at the last Recovery (none-left reason wins)', kind: 'hero', cur: 0, rec: 2, presses: 2, dS: 20, spent: 2, enabled: false, reason: REASON_NONE },
		{ name: 'last Recovery that also reaches max: none-left reason wins over max reason', kind: 'hero', cur: 20, rec: 1, presses: 1, dS: 10, spent: 1, enabled: false, reason: REASON_NONE },
		{ name: 'zero Recoveries: starts disabled (none-left reason)', kind: 'hero', cur: 10, rec: 0, presses: 0, dS: 0, spent: 0, enabled: false, reason: REASON_NONE },
		{ name: '[Q15] hero dying (-4): heals from below zero', kind: 'hero', cur: -4, rec: 2, presses: 1, dS: 10, spent: 1, enabled: true },
		{ name: '[Q15] hero at the floor (-15): heals from the floor', kind: 'hero', cur: -15, rec: 2, presses: 1, dS: 10, spent: 1, enabled: true },
		{ name: '[Q15] hero dying (-4): two presses climb past zero', kind: 'hero', cur: -4, rec: 3, presses: 2, dS: 20, spent: 2, enabled: true },
	];
	test.each(cases)('$name', (c) => {
		const { content, bar } = openStaminaModal({ max: 30, current: c.cur, isHero: c.kind === 'hero', recoveries: c.rec, recoveries_max: 6 });
		const sr = spendRecoveryBtn(content)!;
		for (let i = 0; i < c.presses; i++) sr.click();
		expect(applyBtn(content).textContent).toBe(expectedApplyLabel(c.dS, 0));
		expect(sr.disabled).toBe(!c.enabled);
		if (c.reason) expect(sr.getAttribute('aria-label')).toBe(c.reason);
		else expect(sr.getAttribute('aria-label')).toBe('Spend Recovery');
		if (c.presses > 0) {
			applyBtn(content).click();
			expect(bar.current_stamina).toBe(c.cur + c.dS);
			expect(bar.recoveries).toBe(c.rec - c.spent);
		}
	});
});

// B5 / SC-432 (Scott, 2026-10-18: "disable Spend Recovery for creatures"): a creature has no Recoveries to
// spend, so Spend Recovery stays visible but disabled, whatever its Stamina or pool. (The position matrix
// above is hero-only for that reason: a shipped creature never has a pool.) A hero with no pool gets the
// relabelled, confirmed free heal; its dialog flow is pinned in stamina-edit-modal.test.ts.
describe('[Q13] Spend Recovery is disabled for a creature, whatever its Stamina or pool', () => {
	const REASON_CREATURE = 'Spend Recovery: Creatures have no Recoveries';
	test.each([
		{ name: 'no pool (how every initiative creature is), hurt', cur: 10, rec: undefined },
		{ name: 'no pool, dead (0)', cur: 0, rec: undefined },
		{ name: 'no pool, at max (the max reason must not override)', cur: 30, rec: undefined },
		{ name: 'with a tracked pool, hurt', cur: 10, rec: 3 },
		{ name: 'with a tracked pool, none left (the none-left reason must not override)', cur: 10, rec: 0 },
		{ name: 'with a tracked pool, at max', cur: 30, rec: 3 },
	])('creature $cur/30, $name: the button is disabled with the creature reason', ({ cur, rec }) => {
		const { content } = openStaminaModal({
			max: 30, current: cur, isHero: false, ...(rec === undefined ? {} : { recoveries: rec, recoveries_max: 6 }),
		});
		const sr = spendRecoveryBtn(content)!;
		expect(sr.disabled).toBe(true);
		expect(sr.getAttribute('aria-label')).toBe(REASON_CREATURE);
	});

	test('pressing it (even by a synthetic click) never stages a heal or spends a Recovery', () => {
		const { content, bar, updateCallback } = openStaminaModal({ max: 30, current: 10, isHero: false, recoveries: 3, recoveries_max: 6 });
		spendRecoveryBtn(content)!.click();
		expect(applyBtn(content).textContent).toBe('No Stamina Change');
		expect(updateCallback).not.toHaveBeenCalled();
		expect(bar.recoveries).toBe(3);
	});
});

describe('[Q13] a hero with no pool: the relabelled free heal, across positions (recoveryValue = floor(30/3) = 10)', () => {
	const REASON_MAX = 'Heal Recovery Value: Already at maximum Stamina';
	const TIP = 'Heal Recovery Value: Spends no Recovery';
	const confirmFirstPress = (): void => {
		document.querySelector<HTMLButtonElement>('[data-dse-control="sedit.free-heal.confirm"]')!.click();
	};
	const cases = [
		{ name: 'full: starts disabled (max reason)', cur: 30, presses: 0, dS: 0, enabled: false, reason: REASON_MAX },
		{ name: 'one short of max: heals only the gap, then disabled (max reason)', cur: 25, presses: 1, dS: 5, enabled: false, reason: REASON_MAX },
		{ name: 'mid: one press heals 10, still enabled', cur: 10, presses: 1, dS: 10, enabled: true },
		{ name: 'mid: two presses heal 20 with no limit (no pool to run out of)', cur: 0, presses: 2, dS: 20, enabled: true },
		{ name: 'dying (-4): heals from below zero', cur: -4, presses: 1, dS: 10, enabled: true },
		{ name: 'at the floor (-15): heals from the floor', cur: -15, presses: 1, dS: 10, enabled: true },
		{ name: 'three presses to full (the repro): 0 -> 30, then disabled', cur: 0, presses: 3, dS: 30, enabled: false, reason: REASON_MAX },
	];
	test.each(cases)('$name', (c) => {
		const { content, bar, updateCallback } = openStaminaModal({ max: 30, current: c.cur, isHero: true });
		const sr = spendRecoveryBtn(content)!;
		for (let i = 0; i < c.presses; i++) {
			sr.click();
			if (i === 0) confirmFirstPress();
		}
		expect(applyBtn(content).textContent).toBe(expectedApplyLabel(c.dS, 0));
		expect(sr.disabled).toBe(!c.enabled);
		expect(sr.getAttribute('aria-label')).toBe(c.reason ?? TIP);
		if (c.presses > 0) {
			applyBtn(content).click();
			expect(updateCallback).toHaveBeenCalledTimes(1);
			expect(bar.current_stamina).toBe(c.cur + c.dS);
			expect(bar.recoveries).toBeUndefined();
			expect(bar.recoveries_max).toBeUndefined();
		}
	});
});

describe('[Q06] opts.recoveryValue overrides the derived floor(max/3)', () => {
	test.each([
		{ override: 7, dS: 7 },
		{ override: 25, dS: 20 }, // capped at the gap to max (30 - 10)
		{ override: 1, dS: 1 },
	])('override $override from 10/30 -> pending +$dS', ({ override, dS }) => {
		const { content } = openStaminaModal({ max: 30, current: 10, recoveries: 3, recoveries_max: 6, opts: { recoveryValue: override } });
		spendRecoveryBtn(content)!.click();
		expect(applyBtn(content).textContent).toBe(expectedApplyLabel(dS, 0));
	});
});

describe('[Q16] recoveryValue 0 (max <= 2): Spend Recovery can never gain, so it is disabled', () => {
	test.each([{ max: 1 }, { max: 2 }])('max $max (floor(max/3) = 0) with Recoveries left: disabled from the start, a press does nothing', ({ max }) => {
		const { content, updateCallback } = openStaminaModal({ max, current: 0, isHero: true, recoveries: 3, recoveries_max: 3 });
		const sr = spendRecoveryBtn(content)!;
		expect(sr.disabled).toBe(true);
		sr.click();
		expect(applyBtn(content).textContent).toBe('No Stamina Change');
		expect(updateCallback).not.toHaveBeenCalled();
	});

	test('max 3 (floor(3/3) = 1) is the smallest bar where it works', () => {
		const { content } = openStaminaModal({ max: 3, current: 0, isHero: true, recoveries: 3, recoveries_max: 3 });
		const sr = spendRecoveryBtn(content)!;
		expect(sr.disabled).toBe(false);
		sr.click();
		expect(applyBtn(content).textContent).toBe('Gain 1 Stamina');
	});

	test('[Q16] the disabled reason for a zero recovery value says so, not "Already at maximum Stamina" (SC-428)', () => {
		// 0/2 is nowhere near max: the recovery value (floor(2/3)) is what is 0.
		const { content } = openStaminaModal({ max: 2, current: 0, isHero: true, recoveries: 3, recoveries_max: 3 });
		expect(spendRecoveryBtn(content)!.disabled).toBe(true);
		expect(spendRecoveryBtn(content)!.getAttribute('aria-label')).toBe('Spend Recovery: Recovery value is 0');
	});

	test('[Q16] a zero recovery value with no Recoveries left still reports the Recoveries first (precedence), and at max 2 / current 2 still says the value is 0 (SC-428)', () => {
		const none = openStaminaModal({ max: 2, current: 0, isHero: true, recoveries: 0, recoveries_max: 3 });
		expect(spendRecoveryBtn(none.content)!.getAttribute('aria-label')).toBe('Spend Recovery: No Recoveries remaining');
		const full = openStaminaModal({ max: 2, current: 2, isHero: true, recoveries: 3, recoveries_max: 3 });
		expect(spendRecoveryBtn(full.content)!.getAttribute('aria-label')).toBe('Spend Recovery: Recovery value is 0');
	});
});

// ------------------------------------------------------------------------------------
// Footer: Reset
// ------------------------------------------------------------------------------------

describe('[F05][F06] Reset', () => {
	test('[F05] Reset returns every pending change to 0: label, both steppers, Apply disabled, Spend Recovery live again', () => {
		const { content, updateCallback } = openStaminaModal({ max: 30, current: 10, temp: 4, isHero: true, recoveries: 1, recoveries_max: 6 });
		pressDamage(content, 6);
		spendRecoveryBtn(content)!.click(); // spends the last Recovery -> disabled
		expect(spendRecoveryBtn(content)!.disabled).toBe(true);
		btn(content, 'Reset').click();
		expect(applyBtn(content).textContent).toBe('No Stamina Change');
		expect(applyBtn(content).disabled).toBe(true);
		expect(staminaInput(content).value).toBe('10');
		expect(tempInput(content).value).toBe('4');
		expect(spendRecoveryBtn(content)!.disabled).toBe(false);
		expect(spendRecoveryBtn(content)!.getAttribute('aria-label')).toBe('Spend Recovery');
		expect(updateCallback).not.toHaveBeenCalled();
	});

	test('[F06] Reset clears the Apply box too (as the pool modal does)', () => {
		const { content } = openStaminaModal({ max: 20, current: 20, isHero: false });
		pressDamage(content, 7);
		btn(content, 'Reset').click();
		expect(applyInput(content).value).toBe('0');
	});

	test('[F06] Reset also drops a half-typed Stamina / Temp draft: the label and both fields go back to the opening state', () => {
		const { content } = openStaminaModal({ max: 20, current: 10, temp: 2, isHero: false });
		for (const [input, v] of [[staminaInput(content), '15'], [tempInput(content), '6']] as const) {
			input.value = v;
			input.dispatchEvent(new Event('input', { bubbles: true }));
		}
		expect(applyBtn(content).textContent).toBe('Gain 5 Stamina and Gain 4 Temp Stamina');
		btn(content, 'Reset').click();
		expect(applyBtn(content).textContent).toBe('No Stamina Change');
		expect(applyBtn(content).disabled).toBe(true);
		expect(staminaInput(content).value).toBe('10');
		expect(tempInput(content).value).toBe('2');
	});

	test('[F06] Reset leaves the Apply box at the opening 0 even after a Healing press, and Damage then does nothing', () => {
		const { content } = openStaminaModal({ max: 20, current: 10, isHero: false });
		pressHealing(content, 4);
		btn(content, 'Reset').click();
		expect(applyInput(content).value).toBe('0');
		btn(content, 'Damage').click();
		expect(applyBtn(content).textContent).toBe('No Stamina Change');
	});
});
