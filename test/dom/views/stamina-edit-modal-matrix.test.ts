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

describe('[A09] "1e3" is a valid number-input value and means 1000 [known bug SC-427]', () => {
	// parseInt("1e3") === 1, so today Damage deals 1 and Healing heals 1. The correct
	// behaviour is 1000 (then capped at the floor / max).
	test.failing('[A09] Damage "1e3" on a creature 20/20 is capped at 20 [known bug SC-427]', () => {
		const { content } = openStaminaModal({ max: 20, current: 20, isHero: false });
		pressDamage(content, '1e3');
		expect(applyInput(content).value).toBe('1e3'); // jsdom keeps the valid exponent form
		expect(applyBtn(content).textContent).toBe('Lose 20 Stamina');
	});

	test.failing('[A09] Healing "1e3" on a creature 5/20 is capped at max (+15) [known bug SC-427]', () => {
		const { content } = openStaminaModal({ max: 20, current: 5, isHero: false });
		pressHealing(content, '1e3');
		expect(applyInput(content).value).toBe('1e3');
		expect(applyBtn(content).textContent).toBe('Gain 15 Stamina');
	});
});

describe('[A10][A14][Q03] out-of-range current (hand-edited YAML) must not invert the controls [known bug SC-427]', () => {
	test.failing('[A10] Damage on a creature already at -3 never heals [known bug SC-427]', () => {
		const { modal, content } = openStaminaModal({ max: 20, current: -3, isHero: false });
		pressDamage(content, 5);
		expect(modal.pendingStaminaChange).toBeLessThanOrEqual(0);
	});

	test.failing('[A14] Healing on a bar at 25/20 never damages [known bug SC-427]', () => {
		const { modal, content } = openStaminaModal({ max: 20, current: 25, isHero: false });
		pressHealing(content, 5);
		expect(modal.pendingStaminaChange).toBeGreaterThanOrEqual(0);
	});

	test.failing('[Q03] Kill on a hero below the death floor (-10, max 15, floor -7) does not say "Gain" [known bug SC-427]', () => {
		const { content } = openStaminaModal({ max: 15, current: -10, isHero: true });
		btn(content, 'Kill').click();
		expect(applyBtn(content).textContent).not.toMatch(/^Gain/);
	});

	test.failing('[Q03] Kill on a creature already at -3 does not say "Gain" [known bug SC-427]', () => {
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

describe('[S08][S09] typed values outside [floor, max]: the Apply label must equal the applied change [known bug SC-427]', () => {
	// The modal clamps at Apply (the persisted value is right), but the preview / label is
	// computed from the RAW typed value, so it promises a change that is not applied.
	const out = [
		{ id: 'S08', kind: 'creature', cur: 10, typed: '30', persisted: 20 },
		{ id: 'S08', kind: 'hero', cur: 10, typed: '99', persisted: 20 },
		{ id: 'S09', kind: 'creature', cur: 10, typed: '-5', persisted: 0 },
		{ id: 'S09', kind: 'hero', cur: 10, typed: '-50', persisted: -10 },
	] as const;
	test.failing.each(out)(
		'[$id] $kind 10/20: typed $typed -> label matches the persisted change [known bug SC-427]',
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

describe('[S10] typed overshoot then "+" (documented KNOWN DEVIATION, StaminaEditModal.ts:383-392)', () => {
	test('max 20, current 10: type 22, press + -> the stepper shows 23 but Apply persists 20', () => {
		const { content, bar } = openStaminaModal({ max: 20, current: 10, isHero: false });
		typeCommit(staminaInput(content), '22');
		btn(content, 'Increase Stamina').click();
		expect(staminaInput(content).value).toBe('23');
		applyBtn(content).click();
		expect(bar.current_stamina).toBe(20);
	});

	test('max 20, current 10 creature: type -3, press - -> shows -4 but Apply persists 0', () => {
		const { content, bar } = openStaminaModal({ max: 20, current: 10, isHero: false });
		typeCommit(staminaInput(content), '-3');
		btn(content, 'Decrease Stamina').click();
		expect(staminaInput(content).value).toBe('-4');
		applyBtn(content).click();
		expect(bar.current_stamina).toBe(0);
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

	test.failing('[Q05] Full Heal on 31 does not write 0 [known bug SC-425]', () => {
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

describe('[Q06][Q07][Q09][Q10][Q15] Spend Recovery across positions (tracked pool, recoveryValue = floor(30/3) = 10)', () => {
	const REASON_MAX = 'Spend Recovery: Already at maximum Stamina';
	const REASON_NONE = 'Spend Recovery: No Recoveries remaining';
	type SR = {
		name: string; kind: Kind; cur: number; rec: number; presses: number;
		/** pending stamina change, pending recoveries spent, enabled afterwards, reason when disabled */
		dS: number; spent: number; enabled: boolean; reason?: string;
	};
	const cases: SR[] = [
		{ name: 'full: starts disabled (max reason)', kind: 'creature', cur: 30, rec: 3, presses: 0, dS: 0, spent: 0, enabled: false, reason: REASON_MAX },
		{ name: 'one short of max: heals only the gap, then disabled (max reason) [current behaviour — SC-432 changes this]', kind: 'creature', cur: 25, rec: 3, presses: 1, dS: 5, spent: 1, enabled: false, reason: REASON_MAX },
		{ name: 'mid: one press heals 10, still enabled [current behaviour — SC-432 changes this]', kind: 'creature', cur: 10, rec: 3, presses: 1, dS: 10, spent: 1, enabled: true },
		{ name: 'mid: two presses heal 20, still enabled [current behaviour — SC-432 changes this]', kind: 'creature', cur: 5, rec: 3, presses: 2, dS: 20, spent: 2, enabled: true },
		{ name: 'mid: presses stop at the last Recovery (none-left reason wins) [current behaviour — SC-432 changes this]', kind: 'creature', cur: 0, rec: 2, presses: 2, dS: 20, spent: 2, enabled: false, reason: REASON_NONE },
		{ name: 'last Recovery that also reaches max: none-left reason wins over max reason [current behaviour — SC-432 changes this]', kind: 'creature', cur: 20, rec: 1, presses: 1, dS: 10, spent: 1, enabled: false, reason: REASON_NONE },
		{ name: 'zero Recoveries: starts disabled (none-left reason)', kind: 'creature', cur: 10, rec: 0, presses: 0, dS: 0, spent: 0, enabled: false, reason: REASON_NONE },
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

// B5 / SC-432 (Scott, 2026-10-18: "disable Spend Recovery for creatures"): a creature has no Recoveries
// to spend, yet today the button heals it for free. These assert the RULED behaviour and fail today, so
// they are `test.failing` markers; the SC-432 fixer removes the `.failing`. (The `kind: 'creature'` rows
// of the position matrix above exercise the same code path with a pool a shipped creature never has;
// SC-432 rewrites them with the fix: those five rows and the `[Q16] max 3` test carry the title suffix
// "[current behaviour — SC-432 changes this]" so the fixer finds them.) The hero with no pool is a plain pin in stamina-edit-modal.test.ts
// until SC-432 designs the relabel + confirmation.
describe('[Q13] Spend Recovery is disabled for a creature [known bug SC-432]', () => {
	test.failing.each([
		{ name: 'no pool (how every initiative creature is)', rec: undefined },
		{ name: 'with a tracked pool', rec: 3 },
	])('creature 10/30, $name: the Spend Recovery button is disabled', ({ rec }) => {
		const { content } = openStaminaModal({
			max: 30, current: 10, isHero: false, ...(rec === undefined ? {} : { recoveries: rec, recoveries_max: 6 }),
		});
		expect(spendRecoveryBtn(content)!.disabled).toBe(true);
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
		const { content, updateCallback } = openStaminaModal({ max, current: 0, isHero: false, recoveries: 3, recoveries_max: 3 });
		const sr = spendRecoveryBtn(content)!;
		expect(sr.disabled).toBe(true);
		sr.click();
		expect(applyBtn(content).textContent).toBe('No Stamina Change');
		expect(updateCallback).not.toHaveBeenCalled();
	});

	test('max 3 (floor(3/3) = 1) is the smallest bar where it works [current behaviour — SC-432 changes this]', () => {
		const { content } = openStaminaModal({ max: 3, current: 0, isHero: false, recoveries: 3, recoveries_max: 3 });
		const sr = spendRecoveryBtn(content)!;
		expect(sr.disabled).toBe(false);
		sr.click();
		expect(applyBtn(content).textContent).toBe('Gain 1 Stamina');
	});

	test('[Q16] the disabled reason for a zero recovery value says so, not "Already at maximum Stamina" (SC-428)', () => {
		// 0/2 is nowhere near max: the recovery value (floor(2/3)) is what is 0.
		const { content } = openStaminaModal({ max: 2, current: 0, isHero: false, recoveries: 3, recoveries_max: 3 });
		expect(spendRecoveryBtn(content)!.disabled).toBe(true);
		expect(spendRecoveryBtn(content)!.getAttribute('aria-label')).toBe('Spend Recovery: Recovery value is 0');
	});

	test('[Q16] a zero recovery value with no Recoveries left still reports the Recoveries first (precedence), and at max 2 / current 2 still says the value is 0 (SC-428)', () => {
		const none = openStaminaModal({ max: 2, current: 0, isHero: false, recoveries: 0, recoveries_max: 3 });
		expect(spendRecoveryBtn(none.content)!.getAttribute('aria-label')).toBe('Spend Recovery: No Recoveries remaining');
		const full = openStaminaModal({ max: 2, current: 2, isHero: false, recoveries: 3, recoveries_max: 3 });
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

	test.failing('[F06] Reset clears the Apply box too (as the pool modal does) [known bug SC-427]', () => {
		const { content } = openStaminaModal({ max: 20, current: 20, isHero: false });
		pressDamage(content, 7);
		btn(content, 'Reset').click();
		expect(applyInput(content).value).toBe('0');
	});
});
