// Plan 09 Task 3 (D2 §3.5b / OD-6) — StaminaEditModal on the unified managedModal
// template. The behavior nets (T-5: clamp math, hero floor, temp-absorbs-damage) are
// preserved verbatim from the legacy modal — the edit math and the model mutation at
// Apply are byte-compat-load-bearing. New under D2: the modal is a kit DseModal
// (.dse-modal scaffold), every control is a kit iconButton/stepper (REAL <button>s with
// the REAL `disabled` property — CB-8), and the preview bar carries zero inline
// colors/widths (SC-5): fill/delta geometry via --dse-fill/--dse-delta-fill custom
// properties, colors via [data-state]/[data-kind] class rules.
import * as fs from 'fs';
import * as path from 'path';
import { StaminaBar } from '@model/StaminaBar';
import { StaminaEditModal } from '@views/StaminaEditModal';
import { FreeHealConfirmModal } from '@views/FreeHealConfirmModal';
import { App } from '../../mocks/obsidian';
import { styleGuardFindings } from '../kit/styleGuard';
import { attachObsidianKeymap, pressEscape } from '../_obsidianKeymap';

function makeModal(max: number, current: number, temp: number, isHero = true) {
	const app = new App();
	const bar = new StaminaBar(false, false, max, current, temp, 1);
	const updateCallback = jest.fn();
	const modal = new StaminaEditModal(app as any, bar, isHero, 'Frodo', updateCallback);
	modal.open();
	const content = (modal as any).contentEl as HTMLElement;
	return { modal: modal as any, bar, content, updateCallback };
}

/** The kit iconButton carrying the given accessible name. */
function btn(content: HTMLElement, label: string): HTMLButtonElement {
	const el = content.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
	if (!el) throw new Error(`no button [aria-label="${label}"]`);
	return el;
}

/** Spend Recovery's aria-label is dynamic (FOLLOWUPS #27-fix-round finding 1: it
 *  becomes the disabled-reason tooltip while no Recoveries remain — including when the
 *  modal MOUNTS already at zero), so it can't be looked up by a fixed aria-label the
 *  way the other quick-action buttons are; its icon is stable. */
function spendRecoveryBtn(content: HTMLElement): HTMLButtonElement {
	const el = content.querySelector<HTMLButtonElement>('button:has([data-icon="syringe"])');
	if (!el) throw new Error('no Spend Recovery button');
	return el;
}

/** The footer's primary (accent) action button — dynamic "Gain N Stamina…" text. */
function actionBtn(content: HTMLElement): HTMLButtonElement {
	const el = content.querySelector<HTMLButtonElement>('.dse-modal__footer .dse-btn--accent');
	if (!el) throw new Error('no footer accent action button');
	return el;
}

function clickDamage(content: HTMLElement, amount: number): void {
	(content.querySelector('.dse-sedit__apply-input') as HTMLInputElement).value = String(amount);
	btn(content, 'Damage').click();
}

function clickHealing(content: HTMLElement, amount: number): void {
	(content.querySelector('.dse-sedit__apply-input') as HTMLInputElement).value = String(amount);
	btn(content, 'Healing').click();
}

function apply(content: HTMLElement): void {
	actionBtn(content).click();
}

/** SC-432: the free-heal confirmation dialog, if one is open (a separate modal over the Stamina modal). */
function freeHealDialog(): { el: HTMLElement; confirm: HTMLButtonElement; cancel: HTMLButtonElement } | null {
	const confirm = document.querySelector<HTMLButtonElement>('[data-dse-control="sedit.free-heal.confirm"]');
	const cancel = document.querySelector<HTMLButtonElement>('[data-dse-control="sedit.free-heal.cancel"]');
	if (!confirm || !cancel) return null;
	return { el: confirm.closest('.modal-container') as HTMLElement, confirm, cancel };
}
const FREE_HEAL_TIP = 'Heal Recovery Value: Spends no Recovery';

afterEach(() => {
	document.body.innerHTML = '';
});

describe('T-5: StaminaEditModal — pure math helpers', () => {
	test('clampStamina clamps to [negativeLimit, max]', () => {
		const { modal } = makeModal(20, 10, 0);
		expect(modal.clampStamina(25, -10, 20)).toBe(20);
		expect(modal.clampStamina(-15, -10, 20)).toBe(-10);
		expect(modal.clampStamina(7, -10, 20)).toBe(7);
	});

	test('amountToDeath / amountToMaxStamina account for pending change', () => {
		const { modal } = makeModal(20, 10, 0);
		expect(modal.amountToDeath(10, -10)).toBe(20);
		expect(modal.amountToMaxStamina(10, 20)).toBe(10);
		modal.pendingStaminaChange = -3;
		expect(modal.amountToDeath(10, -10)).toBe(17);
		expect(modal.amountToMaxStamina(10, 20)).toBe(13);
	});
});

describe('T-5: StaminaEditModal — hero negative floor ceil(-0.5 × max)', () => {
	test('hero with max 15: Kill floors at -7 (ceil(-7.5))', () => {
		const { content, bar } = makeModal(15, 10, 0, true);
		btn(content, 'Kill').click();
		apply(content);
		expect(bar.current_stamina).toBe(-7);
	});

	test('non-hero: Kill floors at 0', () => {
		const { content, bar } = makeModal(15, 10, 0, false);
		btn(content, 'Kill').click();
		apply(content);
		expect(bar.current_stamina).toBe(0);
	});

	test('damage cannot push a hero past the death floor', () => {
		const { content, bar } = makeModal(20, -8, 0, true); // floor is -10
		clickDamage(content, 100);
		apply(content);
		expect(bar.current_stamina).toBe(-10);
	});
});

describe('T-5: StaminaEditModal — temp stamina absorbs damage first', () => {
	test('8 damage against 5 temp: temp → 0, stamina 10 → 7', () => {
		const { modal, content, bar, updateCallback } = makeModal(20, 10, 5);
		clickDamage(content, 8);
		expect(modal.pendingTempStaminaChange).toBe(-5);
		expect(modal.pendingStaminaChange).toBe(-3);
		apply(content);
		expect(bar.current_stamina).toBe(7);
		expect(bar.temp_stamina).toBe(0);
		expect(updateCallback).toHaveBeenCalledTimes(1);
	});

	test('3 damage against 5 temp: only temp is consumed', () => {
		const { modal, content, bar } = makeModal(20, 10, 5);
		clickDamage(content, 3);
		expect(modal.pendingTempStaminaChange).toBe(-3);
		expect(modal.pendingStaminaChange).toBe(0);
		apply(content);
		expect(bar.current_stamina).toBe(10);
		expect(bar.temp_stamina).toBe(2);
	});

	test('healing clamps at max stamina', () => {
		const { content, bar } = makeModal(20, 18, 0);
		clickHealing(content, 10);
		apply(content);
		expect(bar.current_stamina).toBe(20);
	});

	test('Full Heal restores max and zeroes temp', () => {
		const { content, bar } = makeModal(20, 3, 4);
		btn(content, 'Full Heal').click();
		apply(content);
		expect(bar.current_stamina).toBe(20);
		expect(bar.temp_stamina).toBe(0);
	});

	test('a hero with no pool: the relabelled heal button (after its confirmation) heals floor(max/3) (SC-432)', () => {
		const { content, bar } = makeModal(21, 10, 0);
		btn(content, FREE_HEAL_TIP).click();
		freeHealDialog()!.confirm.click();
		apply(content);
		expect(bar.current_stamina).toBe(17); // 10 + floor(21/3)
	});
});

// FOLLOWUPS #27b — Spend Recovery synced with the D7 `recoveries` model: the heal
// amount comes from StaminaBar.recoveryValue (RR §8's derived "1/3 of Stamina max",
// floor(max/3) — the same math, now sourced from the model instead of re-derived
// inline), the recoveries counter decrements per press, and the button real-disables
// (CB-8) at zero remaining, with a visible reason tooltip (house rule: never silent —
// see stamina-bar/view.ts's Catch Breath, the other consumer of `recoveries`). A block
// that never declares `recoveries`/`recoveries_max` (legacy shape) is unaffected: the
// button never disables and `recoveries` stays undefined through Apply.
describe('FOLLOWUPS #27b: StaminaEditModal — Spend Recovery synced with recoveries', () => {
	function makeRecoveryModal(max: number, current: number, recoveries: number, recoveriesMax: number) {
		const app = new App();
		const bar = new StaminaBar(false, false, max, current, 0, 1, 'default', recoveries, recoveriesMax);
		const updateCallback = jest.fn();
		const modal = new StaminaEditModal(app as any, bar, true, 'Frodo', updateCallback);
		modal.open();
		const content = (modal as any).contentEl as HTMLElement;
		return { modal: modal as any, bar, content, updateCallback };
	}

	test('heal amount is the model\'s derived recoveryValue (RR §8: floor(max/3))', () => {
		const { content, bar } = makeRecoveryModal(21, 10, 3, 5);
		btn(content, 'Spend Recovery').click();
		apply(content);
		expect(bar.current_stamina).toBe(17); // 10 + floor(21/3)=7
	});

	test('decrements the recoveries counter on Apply when the model carries one', () => {
		const { content, bar } = makeRecoveryModal(21, 10, 3, 5);
		btn(content, 'Spend Recovery').click();
		apply(content);
		expect(bar.recoveries).toBe(2);
	});

	test('two presses before Apply: heals twice, decrements recoveries twice', () => {
		const { content, bar } = makeRecoveryModal(21, 0, 3, 5);
		btn(content, 'Spend Recovery').click();
		btn(content, 'Spend Recovery').click();
		apply(content);
		expect(bar.current_stamina).toBe(14); // 0 + 7 + 7
		expect(bar.recoveries).toBe(1);
	});

	test('real-disables at zero remaining recoveries, with a visible reason tooltip', () => {
		const { content } = makeRecoveryModal(21, 0, 1, 5);
		const spend = btn(content, 'Spend Recovery');
		expect(spend.disabled).toBe(false);
		spend.click(); // remaining 1 -> 0
		expect(spend.disabled).toBe(true);
		// Real Obsidian's setTooltip stamps `aria-label` (not `data-tooltip` — see the
		// aria-label-lifecycle test below for why that distinction is load-bearing).
		expect(spend.getAttribute('aria-label')).toMatch(/no recoveries/i);
	});

	test('mounts already at 0 recoveries: Spend Recovery starts disabled', () => {
		const { content } = makeRecoveryModal(21, 10, 0, 5);
		expect(spendRecoveryBtn(content).disabled).toBe(true);
	});

	test('a disabled button swallows further clicks (CB-8): no extra heal, recoveries never negative', () => {
		const { content, bar } = makeRecoveryModal(21, 0, 1, 5);
		const spend = btn(content, 'Spend Recovery');
		spend.click(); // 1 -> 0, heals 7
		spend.click(); // disabled: no-op
		apply(content);
		expect(bar.current_stamina).toBe(7);
		expect(bar.recoveries).toBe(0);
	});

	test('Reset restores the pending recoveries change and re-enables the button (restores the accessible name)', () => {
		const { content } = makeRecoveryModal(21, 0, 1, 5);
		const spend = btn(content, 'Spend Recovery');
		spend.click();
		expect(spend.disabled).toBe(true);
		btn(content, 'Reset').click();
		expect(spend.disabled).toBe(false);
		expect(spend.getAttribute('aria-label')).toBe('Spend Recovery');
	});

	// FOLLOWUPS #27-fix-round finding 1 (MUST-FIX): pins the actual bug — the disabled
	// path sets the button's aria-label to the reason (native setTooltip's OWN side
	// effect, §2.5), so re-enabling must explicitly RE-ASSERT the button's own label,
	// not remove an attribute (`data-tooltip`) that real Obsidian never wrote. Before
	// the fix, this stuck the "No Recoveries remaining" name on the button forever
	// after the first disable — the jest mock's pre-fix divergence (it wrote
	// `data-tooltip`, not `aria-label`) hid exactly this.
	test('aria-label lifecycle: mounted → "Spend Recovery", disabled → "Spend Recovery: No Recoveries remaining" (the action name is kept), re-enabled → "Spend Recovery" again', () => {
		const { content } = makeRecoveryModal(21, 0, 1, 5);
		const spend = btn(content, 'Spend Recovery');
		expect(spend.getAttribute('aria-label')).toBe('Spend Recovery');

		spend.click(); // remaining 1 -> 0
		expect(spend.disabled).toBe(true);
		expect(spend.getAttribute('aria-label')).toBe('Spend Recovery: No Recoveries remaining');

		btn(content, 'Reset').click(); // remaining back to 1
		expect(spend.disabled).toBe(false);
		expect(spend.getAttribute('aria-label')).toBe('Spend Recovery');
	});

	// fix-round-2 item 1: this test previously pinned "never disables" for a legacy
	// (untracked) block — that WAS the CB-8 violation the review found (a legacy bar
	// could still hit zero true gain at max Stamina, but the disable gate lived
	// entirely inside `if (recoveriesTracked)`, so the button stayed enabled while
	// onClick silently swallowed every further press). Recoveries-tracking is
	// orthogonal to "is there anything left to heal" — a legacy block now real-
	// disables too, once a press would heal 0, with the same reason a tracked block
	// gets. What's unchanged and still asserted: `recoveries` never gets written for
	// an untracked block (no counter to decrement in the first place).
	test('legacy block (no recoveries field): the relabelled heal still real-disables at zero true gain (no gain != no tracking), recoveries stays undefined through Apply (SC-432)', () => {
		const { content, bar } = makeModal(21, 10, 0);
		const spend = btn(content, FREE_HEAL_TIP);
		spend.click();
		freeHealDialog()!.confirm.click();
		for (let i = 0; i < 5; i++) spend.click(); // only the first 2 succeed (10 -> 17 -> 21); the rest are swallowed once real-disabled
		expect(spend.disabled).toBe(true);
		expect(spend.getAttribute('aria-label')).toBe('Heal Recovery Value: Already at maximum Stamina');
		apply(content);
		expect(bar.current_stamina).toBe(21);
		expect(bar.recoveries).toBeUndefined();
	});

	// fix-round-2 item 1 (required): the exact case the review named — an untracked
	// bar already AT full Stamina before the first press.
	test('untracked bar already at max Stamina: Spend Recovery starts real-disabled with the max-gain reason', () => {
		const { content } = makeModal(20, 20, 0); // no recoveries fields -> untracked
		// aria-label is already the disabled reason by mount time (not 'Spend
		// Recovery') — same reason spendRecoveryBtn's icon-based lookup exists.
		const spend = spendRecoveryBtn(content);
		expect(spend.disabled).toBe(true);
		expect(spend.getAttribute('aria-label')).toBe('Heal Recovery Value: Already at maximum Stamina');
	});

	// FOLLOWUPS #27-fix-round finding 2 (HIGH): `recoveries_max` — not `recoveries` — is
	// the single source of truth for "recoveries tracked" (docs/stamina-bar.md, the
	// StaminaBar field comment, stamina-bar/view.ts's own `recoveries_max !== undefined`
	// gate). `recoveries_max` set with `recoveries` omitted is schema-legal and must be
	// treated as 0 remaining — matching the bar's own `model.recoveries ?? 0` — so the
	// modal agrees with what the bar element itself would render (an empty pip row, a
	// disabled Catch Breath) instead of silently never disabling and never writing
	// `recoveries` back.
	test('recoveries_max set, recoveries omitted: treated as 0 remaining (agrees with the bar\'s `?? 0`), disabled with reason', () => {
		const app = new App();
		// Positional: (..., height, style, recoveries, recoveries_max) — recoveries
		// deliberately omitted (undefined), recoveries_max=5.
		const bar = new StaminaBar(false, false, 21, 10, 0, 1, 'default', undefined, 5);
		expect(bar.recoveries).toBeUndefined();
		const updateCallback = jest.fn();
		const modal = new StaminaEditModal(app as any, bar, true, 'Frodo', updateCallback);
		modal.open();
		const content = (modal as any).contentEl as HTMLElement;

		const spend = spendRecoveryBtn(content);
		expect(spend.disabled).toBe(true);
		expect(spend.getAttribute('aria-label')).toMatch(/no recoveries/i);

		// A disabled Spend Recovery click is a no-op. Force a real (unrelated) edit so
		// the footer Apply button enables, then confirm Apply still materializes the
		// tracked block's `recoveries` at 0 (never leaves it `undefined` once the block
		// IS tracked) alongside the ordinary stamina write.
		spend.click(); // no-op: already disabled
		clickHealing(content, 1);
		apply(content);
		expect(bar.current_stamina).toBe(11);
		expect(bar.recoveries).toBe(0);
	});
});

// SC-133 RC-3: a negative Apply amount is a magnitude input, not a signed one — it
// must never invert Damage into a temp-stamina mint or Healing into damage. RAW
// baseline: reference/draw-steel-reference.md:279 (temp absorbs damage first,
// doesn't stack — unrelated to this RC, but the same modal). The bug: Damage read
// the Apply box with parseInt and did no sign check, so `Math.min(adjustment,
// tempAvailable)` with a negative adjustment flipped the temp subtraction into an
// addition; Healing symmetrically applied a negative heal (net damage).
describe('SC-133 RC-3: negative Apply input is clamped to a magnitude (0), never inverts the operation', () => {
	test('Damage with a negative input is a no-op (does NOT mint temp stamina)', () => {
		const { modal, content, bar } = makeModal(20, 20, 0);
		clickDamage(content, -3);
		expect(modal.pendingStaminaChange).toBe(0);
		expect(modal.pendingTempStaminaChange).toBe(0);
		apply(content);
		expect(bar.current_stamina).toBe(20);
		expect(bar.temp_stamina).toBe(0);
	});

	test('Damage with a negative input against existing temp does not drain or grant temp', () => {
		const { modal, content, bar } = makeModal(20, 20, 5);
		clickDamage(content, -3);
		expect(modal.pendingTempStaminaChange).toBe(0);
		apply(content);
		expect(bar.temp_stamina).toBe(5);
	});

	test('Healing with a negative input is a no-op (does NOT apply damage)', () => {
		const { modal, content, bar } = makeModal(20, 10, 0);
		clickHealing(content, -3);
		expect(modal.pendingStaminaChange).toBe(0);
		apply(content);
		expect(bar.current_stamina).toBe(10);
	});

	test('the Apply input carries min="0" (the same clamp-to-0 idiom as the temp stepper)', () => {
		const { content } = makeModal(20, 20, 0);
		const input = content.querySelector('.dse-sedit__apply-input') as HTMLInputElement;
		expect(input.getAttribute('min')).toBe('0');
	});

	// M6 (fix-round-1): this test previously claimed to cover both Damage AND
	// Healing but never invoked Healing — two independent modal sessions (apply()
	// closes the modal) now actually exercise both buttons with a positive input.
	test('a positive Apply input still works normally for both Damage and Healing', () => {
		{
			const { content, bar } = makeModal(20, 10, 0);
			clickDamage(content, 4);
			apply(content);
			expect(bar.current_stamina).toBe(6);
		}
		document.body.innerHTML = '';
		{
			const { content, bar } = makeModal(20, 10, 0);
			clickHealing(content, 4);
			apply(content);
			expect(bar.current_stamina).toBe(14);
		}
	});
});

// SC-133 RC-4 / I2 / I3 (fix-round-1): Spend Recovery must never burn a Recovery
// for zero additional Stamina, and the preview (pendingStaminaChange, which drives
// both the action-button text and the preview bar) must always equal what Apply
// will actually persist. Fix: each press heals from the REBASED (clamped)
// position — see StaminaEditModal.recoverySpendResult — checked against BOTH the
// max and the negative death floor, not just headroom to max (the RC-4 first
// pass's gap, closed by I2: a raw pending sum already sitting deep past the floor
// could report a nonzero "gain" that didn't match what Apply would actually
// persist). I3: a press that would heal 0 (only reachable at the max-side cap
// under the rebased calc) real-disables the button (CB-8) with a visible reason,
// instead of being a silent no-op.
describe('SC-133 RC-4: Spend Recovery never over-burns Recoveries, and the preview is never a lie', () => {
	function makeRecoveryModal(max: number, current: number, recoveries: number, recoveriesMax: number, isHero = true) {
		const app = new App();
		const bar = new StaminaBar(false, false, max, current, 0, 1, 'default', recoveries, recoveriesMax);
		const updateCallback = jest.fn();
		const modal = new StaminaEditModal(app as any, bar, isHero, 'Frodo', updateCallback);
		modal.open();
		const content = (modal as any).contentEl as HTMLElement;
		return { modal: modal as any, bar, content, updateCallback };
	}

	/** Types an absolute value into the (deliberately unbounded) STAMINA stepper's
	 *  input and commits via Enter — the same idiom as RC-5's typeTemp below, for
	 *  the other stepper. */
	function typeStamina(content: HTMLElement, v: string): void {
		const input = content.querySelectorAll<HTMLElement>('.dse-stepper')[0].querySelector('.dse-stepper__input') as HTMLInputElement;
		input.value = v;
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
	}

	test('18/20, recoveryValue 6: x3 presses only consume 1 Recovery (2nd/3rd heal 0)', () => {
		const { modal, content, bar } = makeRecoveryModal(20, 18, 8, 8);
		const spend = spendRecoveryBtn(content);
		spend.click(); // heals min(6, 2) = 2 -> 20/20
		spend.click(); // headroom 0 -> no-op
		spend.click(); // headroom 0 -> no-op
		expect(modal.pendingStaminaChange).toBe(2); // the ACTUAL capped gain, not 18
		apply(content);
		expect(bar.current_stamina).toBe(20);
		expect(bar.recoveries).toBe(7); // only 1 Recovery actually spent
	});

	test('the preview (action button text) always matches what Apply persists', () => {
		const { content, bar } = makeRecoveryModal(20, 18, 8, 8);
		const spend = spendRecoveryBtn(content);
		spend.click();
		spend.click();
		spend.click();
		expect(actionBtn(content).textContent).toContain('Gain 2 Stamina'); // not "Gain 18"
		const before = bar.current_stamina;
		apply(content);
		expect(bar.current_stamina - before).toBe(2);
	});

	test('a press with full headroom still heals the full recoveryValue and spends exactly one Recovery', () => {
		const { content, bar } = makeRecoveryModal(21, 10, 3, 5);
		spendRecoveryBtn(content).click();
		apply(content);
		expect(bar.current_stamina).toBe(17); // 10 + floor(21/3)=7
		expect(bar.recoveries).toBe(2);
	});

	// I3: the button real-disables (CB-8) — not just a silent onClick no-op — the
	// instant a further press would heal 0, with a visible reason distinct from
	// "no Recoveries remain".
	test('I3: real-disables with "Already at maximum Stamina" once a press would heal 0, even with Recoveries still remaining', () => {
		const { content } = makeRecoveryModal(20, 18, 8, 8);
		const spend = spendRecoveryBtn(content);
		expect(spend.disabled).toBe(false);
		spend.click(); // 18 -> 20 (full heal), 7 Recoveries left
		expect(spend.disabled).toBe(true); // disabled: NOT because Recoveries ran out
		expect(spend.getAttribute('aria-label')).toBe('Spend Recovery: Already at maximum Stamina');
	});

	test('I3: a click on the auto-disabled button is a no-op (CB-8) — no further heal, no further Recovery spent', () => {
		const { content, bar } = makeRecoveryModal(20, 18, 8, 8);
		const spend = spendRecoveryBtn(content);
		spend.click(); // 18 -> 20, disables
		spend.click(); // disabled: swallowed
		apply(content);
		expect(bar.current_stamina).toBe(20);
		expect(bar.recoveries).toBe(7);
	});

	// I2: a raw pending sum can already sit deep past the NEGATIVE floor before
	// Spend Recovery is ever pressed (here, via the stamina stepper's own
	// deliberately-unbounded typed path — see the KNOWN DEVIATION comment in the
	// source). The press must heal from the REBASED (clamped-at-the-floor)
	// position, honestly, rather than reporting a gain the raw sum's arithmetic
	// doesn't back up once Apply's own single clamp runs.
	test('I2: Spend Recovery after a deep negative overshoot heals honestly from the clamped floor — preview matches Apply exactly', () => {
		const { modal, content, bar } = makeRecoveryModal(20, 10, 8, 8); // hero: floor = ceil(-10) = -10
		typeStamina(content, '-50'); // pendingStaminaChange = -50-10 = -60; raw = 10-60 = -50, far past floor -10
		const spend = spendRecoveryBtn(content);
		spend.click();
		const promisedFinal = 10 + modal.pendingStaminaChange; // what the preview claims Apply will persist
		apply(content);
		expect(bar.current_stamina).toBe(promisedFinal); // preview and Apply agree EXACTLY
		expect(bar.current_stamina).toBe(-10 + 6); // floor -10, + recoveryValue floor(20/3)=6 -> -4
		expect(bar.recoveries).toBe(7); // exactly one Recovery spent, for a REAL gain
	});

	test('I2: a second press after the floor-rebase heals normally from the new (rebased) position', () => {
		const { content, bar } = makeRecoveryModal(20, 10, 8, 8);
		typeStamina(content, '-50');
		const spend = spendRecoveryBtn(content);
		spend.click(); // rebases to -10, heals to -4
		spend.click(); // heals normally from -4 -> 2
		apply(content);
		expect(bar.current_stamina).toBe(2);
		expect(bar.recoveries).toBe(6);
	});
});

// SC-433 (Scott, 2026-10-18, ruling on SC-408 B6): the temp field is a DIRECT edit, like the Stamina
// field — "+" / "-" step the running temp by one and a typed number sets it exactly (floor 0). The
// modal has no "gain temp from an effect" path, so SC-133 RC-5's keep-the-higher (RAW: temp doesn't
// stack) no longer applies anywhere in it. "Running" below is currentTempStamina +
// pendingTempStaminaChange: Damage absorption / Kill / Full Heal move it DOWN mid-session, and the
// field edits THAT position (SC-133 fix-round-1 C1's damage-then-stepper tests still hold).
describe('SC-433: the temp field is a direct edit — stepper and typed value set temp exactly', () => {
	function tempInput(content: HTMLElement): HTMLInputElement {
		return content.querySelectorAll<HTMLElement>('.dse-stepper')[1].querySelector('.dse-stepper__input') as HTMLInputElement;
	}
	function typeTemp(content: HTMLElement, v: string): void {
		const input = tempInput(content);
		input.value = v;
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
	}

	test('typing a temp value lower than the current one applies it as typed: 3 over 5 is a loss of 2', () => {
		const { modal, content, bar } = makeModal(20, 20, 5);
		typeTemp(content, '3');
		expect(modal.pendingTempStaminaChange).toBe(-2);
		apply(content);
		expect(bar.temp_stamina).toBe(3);
	});

	test('typing a value higher than current temp raises temp to it', () => {
		const { modal, content, bar } = makeModal(20, 20, 5);
		typeTemp(content, '9');
		expect(modal.pendingTempStaminaChange).toBe(4);
		apply(content);
		expect(bar.temp_stamina).toBe(9);
	});

	test('typing a value equal to current temp is a no-op', () => {
		const { modal, content } = makeModal(20, 20, 5);
		typeTemp(content, '5');
		expect(modal.pendingTempStaminaChange).toBe(0);
	});

	test('the minus button lowers temp by one: at temp 5 Apply writes 4, and the minus stays enabled', () => {
		const { modal, content, bar } = makeModal(20, 20, 5);
		const minus = content.querySelectorAll<HTMLElement>('.dse-stepper')[1]
			.querySelector('button[aria-label="Decrease Temporary Stamina"]') as HTMLButtonElement;
		expect(minus.disabled).toBe(false);
		minus.click();
		expect(modal.pendingTempStaminaChange).toBe(-1);
		expect(tempInput(content).value).toBe('4');
		expect(minus.disabled).toBe(false);
		expect(actionBtn(content).textContent).toContain('Lose 1 Temp Stamina');
		apply(content);
		expect(bar.temp_stamina).toBe(4);
	});

	test('CB-8: the minus button is disabled exactly at temp 0 and enabled above it — never a silent no-op', () => {
		const { modal, content, bar } = makeModal(20, 20, 1);
		const minus = content.querySelectorAll<HTMLElement>('.dse-stepper')[1]
			.querySelector('button[aria-label="Decrease Temporary Stamina"]') as HTMLButtonElement;
		expect(minus.disabled).toBe(false);
		minus.click(); // 1 -> 0
		expect(modal.pendingTempStaminaChange).toBe(-1);
		expect(minus.disabled).toBe(true);
		minus.click(); // disabled: nothing happens, and nothing was promised
		expect(modal.pendingTempStaminaChange).toBe(-1);
		apply(content);
		expect(bar.temp_stamina).toBe(0);
		// A block that opens at 0 starts with the minus already disabled.
		const zero = makeModal(20, 20, 0);
		expect((zero.content.querySelectorAll<HTMLElement>('.dse-stepper')[1]
			.querySelector('button[aria-label="Decrease Temporary Stamina"]') as HTMLButtonElement).disabled).toBe(true);
	});

	// Review LOW-1: a hand-edited NEGATIVE stored temp counts as 0 for all the modal's math.
	describe('a hand-edited negative stored temp (-3) counts as 0', () => {
		const minusOf = (content: HTMLElement) => content.querySelectorAll<HTMLElement>('.dse-stepper')[1]
			.querySelector('button[aria-label="Decrease Temporary Stamina"]') as HTMLButtonElement;

		test('the field shows 0, the minus is disabled, and opening stages nothing', () => {
			const { modal, content, bar, updateCallback } = makeModal(20, 15, -3);
			expect(tempInput(content).value).toBe('0');
			expect(minusOf(content).disabled).toBe(true);
			expect(modal.pendingTempStaminaChange).toBe(0);
			expect(actionBtn(content).disabled).toBe(true);
			expect(bar.temp_stamina).toBe(-3); // untouched until the user acts
			expect(updateCallback).not.toHaveBeenCalled();
		});

		test('Damage 5 takes 5 Stamina, with no temp gain in the label; Apply writes temp 0', () => {
			const { content, bar } = makeModal(20, 15, -3);
			clickDamage(content, 5);
			expect(actionBtn(content).textContent).toBe('Lose 5 Stamina');
			apply(content);
			expect(bar.current_stamina).toBe(10);
			expect(bar.temp_stamina).toBe(0);
		});

		test('Full Heal labels only the Stamina gain, no temp gain', () => {
			const { content, bar } = makeModal(20, 15, -3);
			btn(content, 'Full Heal').click();
			expect(actionBtn(content).textContent).toBe('Gain 5 Stamina');
			apply(content);
			expect(bar.current_stamina).toBe(20);
			expect(bar.temp_stamina).toBe(0);
		});

		test('Kill labels only the Stamina loss, no temp change', () => {
			const { content } = makeModal(20, 15, -3);
			btn(content, 'Kill').click();
			expect(actionBtn(content).textContent).not.toContain('Temp');
		});

		test('"+" then "-" returns to 0 with nothing staged', () => {
			const { modal, content } = makeModal(20, 15, -3);
			const plus = content.querySelectorAll<HTMLElement>('.dse-stepper')[1]
				.querySelector('button[aria-label="Increase Temporary Stamina"]') as HTMLButtonElement;
			plus.click();
			expect(modal.pendingTempStaminaChange).toBe(1);
			minusOf(content).click();
			expect(modal.pendingTempStaminaChange).toBe(0);
			expect(actionBtn(content).disabled).toBe(true);
		});
	});

	test('the ticket repro: temp 5, "+" twice gives 7, "-" gives 6, Apply writes 6', () => {
		const { modal, content, bar } = makeModal(20, 20, 5);
		const stepperEl = content.querySelectorAll<HTMLElement>('.dse-stepper')[1];
		const plus = stepperEl.querySelector('button[aria-label="Increase Temporary Stamina"]') as HTMLButtonElement;
		const minus = stepperEl.querySelector('button[aria-label="Decrease Temporary Stamina"]') as HTMLButtonElement;
		plus.click();
		plus.click();
		expect(tempInput(content).value).toBe('7');
		minus.click();
		expect(tempInput(content).value).toBe('6');
		expect(modal.pendingTempStaminaChange).toBe(1);
		apply(content);
		expect(bar.temp_stamina).toBe(6);
	});

	test('a mistyped 50 is fixable after Apply: reopen on 50, type 5, Apply writes 5', () => {
		const first = makeModal(20, 20, 5);
		typeTemp(first.content, '50');
		apply(first.content);
		expect(first.bar.temp_stamina).toBe(50);
		const app = new App();
		const reopened = new StaminaEditModal(app as any, first.bar, true, 'Frodo', jest.fn());
		reopened.open();
		const content = (reopened as any).contentEl as HTMLElement;
		typeTemp(content, '5');
		expect((reopened as any).pendingTempStaminaChange).toBe(-45);
		expect(actionBtn(content).textContent).toContain('Lose 45 Temp Stamina');
		apply(content);
		expect(first.bar.temp_stamina).toBe(5);
	});

	test('a typed negative temp clamps to 0 and is applied as 0', () => {
		const { modal, content, bar } = makeModal(20, 20, 5);
		typeTemp(content, '-3');
		expect(modal.pendingTempStaminaChange).toBe(-5);
		apply(content);
		expect(bar.temp_stamina).toBe(0);
	});

	test('typing a value from a temp of 0 raises it as typed', () => {
		const { modal, content, bar } = makeModal(20, 20, 0);
		typeTemp(content, '4');
		expect(modal.pendingTempStaminaChange).toBe(4);
		apply(content);
		expect(bar.temp_stamina).toBe(4);
	});

	test('a typed temp value after an earlier typed value is applied as typed (9 then 3 gives 3)', () => {
		const { modal, content, bar } = makeModal(20, 20, 5);
		typeTemp(content, '9'); // 9 > 5 -> running becomes 9
		expect(modal.pendingTempStaminaChange).toBe(4);
		typeTemp(content, '3'); // a direct edit: 3, not "blocked at the running 9"
		expect(modal.pendingTempStaminaChange).toBe(-2);
		apply(content);
		expect(bar.temp_stamina).toBe(3);
	});

	// C1 (CRITICAL, fix-round-1): the floor must track the RUNNING session
	// position, not the stale onOpen snapshot — damage absorption, Kill, and Full
	// Heal all move pendingTempStaminaChange DOWN mid-session, and a later grant
	// must floor against THAT, not snap back up to a value already spent.
	describe('C1: the temp floor tracks the running position, not the stale onOpen snapshot', () => {
		function clickDamageHere(content: HTMLElement, amount: number): void {
			(content.querySelector('.dse-sedit__apply-input') as HTMLInputElement).value = String(amount);
			(content.querySelector('button[aria-label="Damage"]') as HTMLButtonElement).click();
		}

		test('A1: Damage absorbs 3 of 5 temp (running -> 2), then one "+" raises it to 3, not back to 5', () => {
			const { modal, content, bar } = makeModal(20, 20, 5);
			clickDamageHere(content, 3); // temp absorbs 3: running 5 -> 2
			expect(modal.pendingTempStaminaChange).toBe(-3);
			const plus = content.querySelectorAll<HTMLElement>('.dse-stepper')[1]
				.querySelector('button[aria-label="Increase Temporary Stamina"]') as HTMLButtonElement;
			plus.click(); // running 2 -> 3, NOT a snap back to 5
			expect(modal.pendingTempStaminaChange).toBe(-2);
			apply(content);
			expect(bar.temp_stamina).toBe(3);
		});

		test('A2: Damage absorbs 3 of 5 temp (running -> 2), then minus lowers the running position to 1', () => {
			const { modal, content, bar } = makeModal(20, 20, 5);
			clickDamageHere(content, 3); // running 5 -> 2
			const minus = content.querySelectorAll<HTMLElement>('.dse-stepper')[1]
				.querySelector('button[aria-label="Decrease Temporary Stamina"]') as HTMLButtonElement;
			minus.click(); // a direct edit: 2 -> 1 (never a jump back up to the stale 5)
			expect(modal.pendingTempStaminaChange).toBe(-4);
			apply(content);
			expect(bar.temp_stamina).toBe(1);
		});

		test('A4: Damage absorbs 3 of 5 temp (running -> 2), then typing 4 sets it to 4, not the stale 5', () => {
			const { modal, content, bar } = makeModal(20, 20, 5);
			clickDamageHere(content, 3); // running 5 -> 2
			typeTemp(content, '4'); // a direct edit from the running 2 -> 4
			expect(modal.pendingTempStaminaChange).toBe(-1);
			apply(content);
			expect(bar.temp_stamina).toBe(4);
		});

		// fix-round-2 item 4: the comment names all three down-movers (Damage, Kill,
		// Full Heal) but only Damage was tested — Kill and Full Heal also zero temp.
		test('Kill zeroes temp (running -> 0), then one "+" raises it to 1, not back to 5', () => {
			const { modal, content, bar } = makeModal(20, 20, 5);
			btn(content, 'Kill').click(); // running 5 -> 0
			const plus = content.querySelectorAll<HTMLElement>('.dse-stepper')[1]
				.querySelector('button[aria-label="Increase Temporary Stamina"]') as HTMLButtonElement;
			plus.click(); // running 0 -> 1, NOT a snap back to 5
			expect(modal.pendingTempStaminaChange).toBe(-4);
			apply(content);
			expect(bar.temp_stamina).toBe(1);
		});

		test('Full Heal zeroes temp (running -> 0), then one "+" raises it to 1, not back to 5', () => {
			const { modal, content, bar } = makeModal(20, 20, 5);
			btn(content, 'Full Heal').click(); // running 5 -> 0
			const plus = content.querySelectorAll<HTMLElement>('.dse-stepper')[1]
				.querySelector('button[aria-label="Increase Temporary Stamina"]') as HTMLButtonElement;
			plus.click(); // running 0 -> 1, NOT a snap back to 5
			expect(modal.pendingTempStaminaChange).toBe(-4);
			apply(content);
			expect(bar.temp_stamina).toBe(1);
		});
	});

	// I4 (fix-round-1) pinned a run of "+" clicks walking past a higher existing value as an open gap;
	// under SC-433's direct edit that is simply how a stepper behaves, so it is now the spec.
	test('I4: "+" x3 from a temp of 5 steps one at a time to 8', () => {
		const { modal, content, bar } = makeModal(20, 20, 5);
		const plus = content.querySelectorAll<HTMLElement>('.dse-stepper')[1]
			.querySelector('button[aria-label="Increase Temporary Stamina"]') as HTMLButtonElement;
		plus.click();
		plus.click();
		plus.click();
		expect(modal.pendingTempStaminaChange).toBe(3);
		apply(content);
		expect(bar.temp_stamina).toBe(8);
	});
});

// SC-133 fix-round-1 I5: pinning the two behaviors the diagnosis verified as
// already RAW-correct and explicitly out of scope to "fix" — regression coverage
// so a future change to this file can't silently break them.
describe('SC-133 fix-round-1 I5: pinning must-not-change behaviors', () => {
	test('healing never touches temp stamina', () => {
		const { content, bar } = makeModal(20, 10, 5);
		clickHealing(content, 6);
		apply(content);
		expect(bar.current_stamina).toBe(16);
		expect(bar.temp_stamina).toBe(5);
	});

	test('winded/dying/deathThreshold are computed off REAL max and ignore temp entirely', () => {
		const b = new StaminaBar(false, false, 20, 3, 15, 1);
		expect(b.isWinded).toBe(true);
		expect(b.isDying).toBe(false);
		expect(b.deathThreshold).toBe(-10);
	});
});

describe('D2 §3.5b: the managedModal template (kit scaffold, CB-8, SC-5)', () => {
	test('modal is a kit DseModal: .dse-modal on the dialog, the "<name> Stamina" title wired via aria-labelledby, sections in .dse-modal__body', () => {
		const { modal } = makeModal(20, 10, 0);
		const containerEl = (modal as any).containerEl as HTMLElement;
		expect(containerEl.classList.contains('dse-modal')).toBe(true);
		const titleEl = (modal as any).titleEl as HTMLElement;
		expect(titleEl.textContent).toBe('Frodo Stamina');
		expect(containerEl.getAttribute('aria-labelledby')).toBe(titleEl.id);
		const body = containerEl.querySelector('.dse-modal__body') as HTMLElement;
		expect(body.querySelector('.dse-sedit__apply')).not.toBeNull();
		expect(body.querySelector('.dse-sedit__quick')).not.toBeNull();
		expect(body.querySelector('.dse-sedit__temp')).not.toBeNull();
		// The minion-list section is the POOL modal's optional extra — absent here.
		expect(body.querySelector('.dse-sedit__minions')).toBeNull();
	});

	test('every control is a real <button> (kit iconButton/stepper) — no click-handling divs', () => {
		const { content } = makeModal(20, 10, 0);
		for (const label of ['Damage', 'Healing', 'Kill', 'Full Heal', FREE_HEAL_TIP, 'Reset']) {
			expect(btn(content, label).tagName).toBe('BUTTON');
		}
		// The two steppers (Stamina + Temporary Stamina) are kit steppers with editable inputs.
		const steppers = content.querySelectorAll('.dse-stepper');
		expect(steppers).toHaveLength(2);
		expect(steppers[0].querySelectorAll('button.dse-stepper__btn')).toHaveLength(2);
		expect(content.querySelectorAll('input.dse-stepper__input')).toHaveLength(2);
	});

	test('CB-8: the apply button uses the REAL disabled property — disabled at "No Stamina Change", enabled on a pending change, re-disabled by Reset', () => {
		const { content } = makeModal(20, 10, 0);
		const action = actionBtn(content);
		expect(action.disabled).toBe(true);
		expect(action.textContent).toContain('No Stamina Change');

		clickDamage(content, 3);
		expect(action.disabled).toBe(false);
		expect(action.textContent).toContain('Lose 3 Stamina');

		btn(content, 'Reset').click();
		expect(action.disabled).toBe(true);
		expect(action.textContent).toContain('No Stamina Change');
	});

	test('a disabled apply button swallows synthetic clicks (no model mutation, no callback)', () => {
		const { content, bar, updateCallback } = makeModal(20, 10, 0);
		actionBtn(content).click(); // no pending change -> disabled
		expect(bar.current_stamina).toBe(10);
		expect(updateCallback).not.toHaveBeenCalled();
	});

	test('the stamina stepper edits pending stamina: ± steps and a typed commit (Enter) both update the action label', () => {
		const { modal, content } = makeModal(20, 10, 0);
		const stamina = content.querySelectorAll('.dse-stepper')[0] as HTMLElement;
		(stamina.querySelector('button[aria-label="Increase Stamina"]') as HTMLButtonElement).click();
		expect(modal.pendingStaminaChange).toBe(1);
		expect(actionBtn(content).textContent).toContain('Gain 1 Stamina');

		const input = stamina.querySelector('.dse-stepper__input') as HTMLInputElement;
		input.value = '17';
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		expect(modal.pendingStaminaChange).toBe(7);
		expect(actionBtn(content).textContent).toContain('Gain 7 Stamina');
	});

	test('typed decimals integer-coerce (legacy parseInt semantics): Apply persists INTEGERS, never floats', () => {
		const { modal, content, bar } = makeModal(20, 10, 0);
		const [staminaEl, tempEl] = Array.from(content.querySelectorAll<HTMLElement>('.dse-stepper'));

		const staminaInput = staminaEl.querySelector('.dse-stepper__input') as HTMLInputElement;
		staminaInput.value = '17.5'; // type="number" step="1" still accepts decimals
		staminaInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		expect(modal.pendingStaminaChange).toBe(7); // trunc(17.5) = 17 → +7

		const tempInput = tempEl.querySelector('.dse-stepper__input') as HTMLInputElement;
		tempInput.value = '2.5';
		tempInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		expect(modal.pendingTempStaminaChange).toBe(2);

		apply(content);
		expect(bar.current_stamina).toBe(17); // an INTEGER — legacy persisted parseInt('17.5') = 17
		expect(bar.temp_stamina).toBe(2);
		expect(Number.isInteger(bar.current_stamina)).toBe(true);
		expect(Number.isInteger(bar.temp_stamina)).toBe(true);
	});

	test('the temp stepper is floored at 0 (real disabled minus at the floor — legacy was a silent no-op)', () => {
		const { modal, content } = makeModal(20, 10, 0);
		const minus = btn(content, 'Decrease Temporary Stamina');
		expect(minus.disabled).toBe(true); // temp 0: cannot go negative
		btn(content, 'Increase Temporary Stamina').click();
		expect(modal.pendingTempStaminaChange).toBe(1);
		expect(minus.disabled).toBe(false);
		expect(actionBtn(content).textContent).toContain('Gain 1 Temp Stamina');
	});

	test('SC-5: the preview bar has NO inline colors/widths — geometry via --dse-fill/--dse-delta-fill, damage/heal color via [data-kind]', () => {
		const { content } = makeModal(20, 10, 0, true);
		const barEl = content.querySelector('.dse-stamina--modal') as HTMLElement;
		expect(barEl).not.toBeNull();
		const fill = barEl.querySelector('.dse-stamina__fill') as HTMLElement;
		const delta = barEl.querySelector('.dse-stamina__delta') as HTMLElement;
		// hero max 20: floor -10 -> barLength 30, adjusted 10+10=20 -> 66.67%
		expect(parseFloat(fill.style.getPropertyValue('--dse-fill'))).toBeCloseTo((20 / 30) * 100, 2);
		expect(fill.getAttribute('data-state')).toBe('healthy');
		expect(delta.getAttribute('data-kind')).toBe('none');

		clickDamage(content, 6);
		expect(delta.getAttribute('data-kind')).toBe('damage');
		expect(parseFloat(delta.style.getPropertyValue('--dse-delta-fill'))).toBeCloseTo(20, 2); // 6/30
		expect(parseFloat(fill.style.getPropertyValue('--dse-fill'))).toBeCloseTo((14 / 30) * 100, 2);

		clickHealing(content, 12); // net pending +6
		expect(delta.getAttribute('data-kind')).toBe('heal');

		// The only .style writes anywhere in the modal are --dse-* custom properties.
		for (const el of Array.from(content.querySelectorAll<HTMLElement>('[style]'))) {
			for (const decl of el.getAttribute('style')!.split(';')) {
				if (decl.trim() === '') continue;
				expect(decl.trim()).toMatch(/^--dse-/);
			}
		}
	});

	test('the hero preview bar renders the "Dying" threshold zone; a non-hero bar does not', () => {
		const hero = makeModal(20, 10, 0, true);
		expect(hero.content.querySelector('.dse-stamina__threshold--dying')).not.toBeNull();
		expect(hero.content.querySelector('.dse-stamina__threshold--dying')!.textContent).toBe('Dying');
		document.body.innerHTML = '';
		const creature = makeModal(20, 10, 0, false);
		expect(creature.content.querySelector('.dse-stamina__threshold--dying')).toBeNull();
	});

	test('source hygiene: both stamina modals import the kit from @/framework/kit and pass the style guard (zero color literals, zero el.style.color)', () => {
		for (const file of ['StaminaEditModal.ts', 'MinionStaminaPoolModal.ts']) {
			const src = fs.readFileSync(path.join(__dirname, '../../../src/views', file), 'utf8');
			expect(src).toMatch(/from '@\/framework\/kit'/);
			expect(styleGuardFindings(src)).toEqual([]);
		}
	});

	test('CSS contract: .dse-stamina fill/delta colors come from [data-state]/[data-kind] token rules; the legacy modal blocks are gone', () => {
		const sheet = fs.readFileSync(path.join(__dirname, '../../../styles-source.css'), 'utf8');
		expect(sheet).toMatch(/\.dse-stamina__fill\[data-state="healthy"\][^}]*var\(--dse-stamina-healthy\)/);
		expect(sheet).toMatch(/\.dse-stamina__delta\[data-kind="heal"\][^}]*var\(--dse-stamina-temp\)/);
		expect(sheet).toMatch(/\.dse-stamina__delta\[data-kind="damage"\][^}]*var\(--dse-danger\)/);
		// The old hand-rolled modal chrome (its classes carried the inline-style look) is evicted.
		expect(sheet).not.toMatch(/\.minion-stamina-modal/);
		expect(sheet).not.toMatch(/\.quick-mod-btn/);
		// The legacy :root globals are FORMALIZED onto the tokens, not deleted.
		expect(sheet).toMatch(/--stamina-bar-color:\s*var\(--dse-stamina-healthy\)/);
		expect(sheet).toMatch(/--stamina-bar-color-winded:\s*var\(--dse-stamina-winded\)/);
		expect(sheet).toMatch(/--stamina-bar-color-dying:\s*var\(--dse-stamina-dying\)/);
	});
});

/* ==================================================================== */
/*  SC-132 / SC-133 RC-1+RC-2 — the preview carries the STEEL GAUGE      */
/* ==================================================================== */
/*
   The fold SC-133 left open: the preview bar computed its own geometry and had no temp
   segment at all, so a temp-only operation — the common one, since damage consumes temp
   FIRST — looked like nothing had happened. The preview now mounts the same gauge the
   element and the hero sheet draw (framework/kit/staminaGauge.ts), so the two cannot
   disagree by construction.

   The modal's MATH is untouched by this (SC-133's suite above still pins it); what these
   tests pin is that the gauge is fed the pending state and reports it.
*/

/** Numeric value of a --dse-* percentage on the preview gauge. */
function gaugeVar(content: HTMLElement, prop: string): number {
	const gauge = content.querySelector<HTMLElement>('.dse-stamina__cluster--preview .dse-stamina__gauge');
	if (!gauge) throw new Error('no preview gauge');
	const raw = gauge.style.getPropertyValue(prop);
	if (raw === '') throw new Error(`no ${prop} on the preview gauge`);
	return parseFloat(raw);
}

describe('SC-133 RC-1/RC-2: the modal preview shows temp stamina and shares the bar\'s scale', () => {
	test('the preview mounts the production gauge, not a modal-shaped approximation', () => {
		const { content } = makeModal(30, 20, 0);
		expect(content.querySelector('.dse-stamina__cluster--preview .dse-stamina__gchannel')).not.toBeNull();
		expect(content.querySelector('.dse-stamina__cluster--preview .dse-stamina__gshield')).not.toBeNull();
		// …and it is gauge-only: the modal's own steppers already say the numbers.
		expect(content.querySelector('.dse-stamina__cluster--preview .dse-stamina__cnums')).toBeNull();
	});

	test('temp stamina is DRAWN — a bar with temp has a non-zero plate, one without has none', () => {
		expect(gaugeVar(makeModal(30, 20, 4).content, '--dse-cap-w')).toBeGreaterThan(0);
		expect(gaugeVar(makeModal(30, 20, 0).content, '--dse-cap-w')).toBe(0);
	});

	test('a TEMP-ONLY damage press moves the preview (the regression this closes)', () => {
		const { content } = makeModal(30, 20, 5);
		const before = gaugeVar(content, '--dse-cap-w');
		clickDamage(content, 3); // consumed entirely by temp: current_stamina does not move
		const after = gaugeVar(content, '--dse-cap-w');
		expect(after).toBeLessThan(before);
		expect(after).toBeGreaterThan(0);
	});

	test('the pending delta band names its direction, and collapses to zero when there is none', () => {
		const { content } = makeModal(30, 20, 0);
		const delta = content.querySelector<HTMLElement>('.dse-stamina__gdelta')!;
		expect(delta.getAttribute('data-kind')).toBe('none');
		expect(delta.style.getPropertyValue('--dse-delta-fill')).toBe('0%');

		clickDamage(content, 5);
		expect(delta.getAttribute('data-kind')).toBe('damage');
		expect(parseFloat(delta.style.getPropertyValue('--dse-delta-fill'))).toBeGreaterThan(0);

		clickHealing(content, 12); // net +7 against the committed value
		expect(delta.getAttribute('data-kind')).toBe('heal');
	});

	test('the temp plate always starts exactly where the pour ends (one origin, one scale)', () => {
		const { content } = makeModal(30, 11, 4);
		const zone = gaugeVar(content, '--dse-zone');
		const pour = gaugeVar(content, '--dse-pour-w');
		expect(gaugeVar(content, '--dse-cap-x')).toBeCloseTo(zone + pour, 6);
	});

	test('a CREATURE modal (isHero false) has no dying reserve, so the pour starts at the channel edge', () => {
		const { content } = makeModal(30, 20, 0, false);
		expect(gaugeVar(content, '--dse-zone')).toBe(0);
		const gauge = content.querySelector<HTMLElement>('.dse-stamina__gauge')!;
		expect(gauge.getAttribute('data-zone')).toBe('off');
	});
});

describe('SC-430: Apply\'s label follows a half-typed Stamina / Temp draft, so nothing re-lays-out at the blur', () => {
	function stepperInputs(content: HTMLElement): { stamina: HTMLInputElement; temp: HTMLInputElement } {
		const [s, t] = Array.from(content.querySelectorAll<HTMLInputElement>('.dse-stepper__input'));
		return { stamina: s, temp: t };
	}
	/** Type without committing: set the value and fire `input` only (focus stays in the field). */
	function typeDraft(el: HTMLInputElement, v: string): void {
		el.value = v;
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}

	test('typing a new Stamina value enables Apply and labels it, with nothing committed yet', () => {
		const { modal, content } = makeModal(20, 15, 0);
		expect(actionBtn(content).disabled).toBe(true);
		typeDraft(stepperInputs(content).stamina, '12');
		expect(actionBtn(content).disabled).toBe(false);
		expect(actionBtn(content).textContent).toContain('Lose 3 Stamina');
		expect(modal.pendingStaminaChange).toBe(0); // the draft is a preview, not a commit
	});

	test('Apply clicked while the draft is still uncommitted (no blur) commits it and persists', () => {
		const { content, bar, updateCallback } = makeModal(20, 15, 0);
		typeDraft(stepperInputs(content).stamina, '12');
		apply(content);
		expect(bar.current_stamina).toBe(12);
		expect(updateCallback).toHaveBeenCalledTimes(1);
	});

	test('the blur-then-click order is unchanged: the label does not change at blur, and one click applies once', () => {
		const { content, bar, updateCallback } = makeModal(20, 15, 0);
		const { stamina } = stepperInputs(content);
		document.body.appendChild(content);
		typeDraft(stamina, '12');
		const before = actionBtn(content).textContent;
		stamina.dispatchEvent(new FocusEvent('blur'));
		expect(actionBtn(content).textContent).toBe(before);
		expect(actionBtn(content).disabled).toBe(false);
		apply(content);
		expect(bar.current_stamina).toBe(12);
		expect(updateCallback).toHaveBeenCalledTimes(1);
	});

	test('a draft equal to the current value leaves Apply disabled, as it would after blur', () => {
		const { content } = makeModal(20, 15, 0);
		typeDraft(stepperInputs(content).stamina, '15');
		expect(actionBtn(content).disabled).toBe(true);
		expect(actionBtn(content).textContent).toContain('No Stamina Change');
	});

	test('an empty / unparseable draft leaves Apply exactly as it was before typing', () => {
		const { content } = makeModal(20, 15, 0);
		const { stamina } = stepperInputs(content);
		typeDraft(stamina, '');
		expect(actionBtn(content).disabled).toBe(true);
		expect(actionBtn(content).textContent).toContain('No Stamina Change');

		clickDamage(content, 4); // no temp to absorb it: Stamina takes the 4
		const label = actionBtn(content).textContent;
		typeDraft(stepperInputs(content).stamina, '');
		expect(actionBtn(content).disabled).toBe(false);
		expect(actionBtn(content).textContent).toBe(label);
	});

	test('a draft replaces the stamina part of an existing pending edit, as the blur commit would', () => {
		const { content } = makeModal(20, 15, 0);
		clickDamage(content, 4);
		expect(actionBtn(content).textContent).toContain('Lose 4 Stamina');
		typeDraft(stepperInputs(content).stamina, '18');
		expect(actionBtn(content).textContent).toContain('Gain 3 Stamina');
		// and the committed label after the blur is the same text
		const draftLabel = actionBtn(content).textContent;
		document.body.appendChild(content);
		stepperInputs(content).stamina.dispatchEvent(new FocusEvent('blur'));
		expect(actionBtn(content).textContent).toBe(draftLabel);
	});

	test('typing then Escape: the label returns to the committed state and nothing is written', () => {
		const { content, bar, updateCallback } = makeModal(20, 15, 0);
		const { stamina } = stepperInputs(content);
		typeDraft(stamina, '12');
		expect(actionBtn(content).disabled).toBe(false);
		stamina.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
		expect(stamina.value).toBe('15');
		expect(actionBtn(content).disabled).toBe(true);
		expect(actionBtn(content).textContent).toContain('No Stamina Change');
		expect(updateCallback).not.toHaveBeenCalled();
		expect(bar.current_stamina).toBe(15);
	});

	// SC-431: real Obsidian runs the modal's Scope from a window CAPTURE listener, so the stepper's own
	// stopPropagation never kept the modal open. Both fields must now revert only the draft.
	describe.each([
		['Stamina', 'stamina' as const, '12'],
		['Temporary Stamina', 'temp' as const, '9'],
	])('SC-431: Escape in the %s field with a Damage pending', (_name, field, typed) => {
		test('the first Escape reverts only the draft (modal open, Damage still pending, nothing written); the second closes', () => {
			const { modal, content, bar, updateCallback } = makeModal(20, 15, 5);
			attachObsidianKeymap(modal);
			const onClose = jest.spyOn(modal, 'onClose');
			clickDamage(content, 4);
			const pendingLabel = actionBtn(content).textContent;
			expect(pendingLabel).toBe('Lose 4 Temp Stamina');
			const input = stepperInputs(content)[field];
			const shown = input.value;
			input.focus();
			typeDraft(input, typed);

			pressEscape(input);

			expect(input.value).toBe(shown);
			expect(onClose).not.toHaveBeenCalled();
			expect(document.body.contains(modal.containerEl)).toBe(true);
			expect(actionBtn(content).textContent).toBe(pendingLabel);
			expect(updateCallback).not.toHaveBeenCalled();

			pressEscape(input);

			expect(onClose).toHaveBeenCalledTimes(1);
			expect(document.body.contains(modal.containerEl)).toBe(false);
			expect(updateCallback).not.toHaveBeenCalled();
			expect(bar.current_stamina).toBe(15);
		});

		test('Escape with a clean field closes the modal at once', () => {
			const { modal, content } = makeModal(20, 15, 5);
			attachObsidianKeymap(modal);
			const onClose = jest.spyOn(modal, 'onClose');
			const input = stepperInputs(content)[field];
			input.focus();

			pressEscape(input);

			expect(onClose).toHaveBeenCalledTimes(1);
		});
	});

	test('a typed value past max labels the CLAMPED change (what blur lands and Apply persists)', () => {
		const { content, bar } = makeModal(20, 15, 0);
		typeDraft(stepperInputs(content).stamina, '30');
		const draftLabel = actionBtn(content).textContent;
		expect(draftLabel).toContain('Gain 5 Stamina'); // 15 -> max 20, never the typed 30's "Gain 15" (SC-427)
		document.body.appendChild(content);
		stepperInputs(content).stamina.dispatchEvent(new FocusEvent('blur')); // the blur commit lands the same text
		expect(actionBtn(content).textContent).toBe(draftLabel);
		expect(stepperInputs(content).stamina.value).toBe('20');
		apply(content);
		expect(bar.current_stamina).toBe(20);
	});

	test.each([
		{ kind: 'creature', isHero: false, typed: '-5', label: 'Lose 15 Stamina' }, // creature floor 0, from 15
		{ kind: 'hero', isHero: true, typed: '-50', label: 'Lose 25 Stamina' }, // hero floor -10, from 15
	])('a $kind draft below the floor labels the CLAMPED change, never the typed one (SC-427)', ({ isHero, typed, label }) => {
		const { content, bar } = makeModal(20, 15, 0, isHero);
		typeDraft(stepperInputs(content).stamina, typed);
		expect(actionBtn(content).textContent).toBe(label);
		apply(content);
		expect(bar.current_stamina).toBe(isHero ? -10 : 0);
	});

	test('Temp Stamina: a typed grant enables Apply and labels it; clicking Apply with the draft uncommitted persists it', () => {
		const { modal, content, bar } = makeModal(20, 15, 2);
		typeDraft(stepperInputs(content).temp, '6');
		expect(actionBtn(content).disabled).toBe(false);
		expect(actionBtn(content).textContent).toContain('Gain 4 Temp Stamina');
		expect(modal.pendingTempStaminaChange).toBe(0);
		apply(content);
		expect(bar.temp_stamina).toBe(6);
		expect(bar.current_stamina).toBe(15);
	});

	test('Temp Stamina: a lower typed draft previews the loss (SC-433 direct edit) and Apply persists it', () => {
		const { content, bar } = makeModal(20, 15, 5);
		typeDraft(stepperInputs(content).temp, '2'); // lower than the 5 held: a loss of 3
		expect(actionBtn(content).disabled).toBe(false);
		expect(actionBtn(content).textContent).toContain('Lose 3 Temp Stamina');
		apply(content);
		expect(bar.temp_stamina).toBe(2);
	});

	test('a Stamina draft and an already-committed Temp change combine in one label', () => {
		const { content } = makeModal(20, 15, 5);
		const { stamina, temp } = stepperInputs(content);
		typeDraft(temp, '8');
		document.body.appendChild(content);
		temp.dispatchEvent(new FocusEvent('blur'));
		typeDraft(stamina, '12');
		expect(actionBtn(content).textContent).toBe('Lose 3 Stamina and Gain 3 Temp Stamina');
	});
});

// SC-432 (Scott, 2026-10-18: "I agree with your recommendation. Maybe make a confirmation dialog for the
// hero without a pool to ensure the user understands"): a creature has no Recoveries, so its Spend Recovery
// is disabled; a hero with no pool keeps a plain "heal one Recovery's worth" shortcut, relabelled, that asks
// once per modal session before it heals; a hero WITH a pool is unchanged.
describe('SC-432: Spend Recovery for creatures and heroes without a pool', () => {
	function makePoolModal(max: number, current: number, recoveries: number, recoveriesMax: number, isHero: boolean) {
		const app = new App();
		const bar = new StaminaBar(false, false, max, current, 0, 1, 'default', recoveries, recoveriesMax);
		const updateCallback = jest.fn();
		const modal = new StaminaEditModal(app as any, bar, isHero, 'Frodo', updateCallback);
		modal.open();
		return { modal: modal as any, bar, content: (modal as any).contentEl as HTMLElement, updateCallback };
	}

	describe('a creature', () => {
		test.each([
			{ id: 'no pool, hurt', current: 10, pool: false },
			{ id: 'no pool, at zero', current: 0, pool: false },
			{ id: 'no pool, at max (the max reason must not win)', current: 30, pool: false },
			{ id: 'with a pool, hurt', current: 10, pool: true },
			{ id: 'with a pool, none left (the none-left reason must not win)', current: 10, pool: 'empty' as const },
		])('$id: Spend Recovery stays, disabled, naming the creature reason', ({ current, pool }) => {
			const { content } = pool === false
				? makeModal(30, current, 0, false)
				: makePoolModal(30, current, pool === 'empty' ? 0 : 3, 6, false);
			const spend = spendRecoveryBtn(content);
			expect(spend.disabled).toBe(true);
			expect(spend.textContent).toBe('Spend Recovery');
			expect(spend.getAttribute('aria-label')).toBe('Spend Recovery: Creatures have no Recoveries');
		});

		test('a click on it changes nothing and opens no dialog', () => {
			const { content, updateCallback } = makeModal(30, 10, 0, false);
			spendRecoveryBtn(content).click();
			expect(actionBtn(content).textContent).toBe('No Stamina Change');
			expect(freeHealDialog()).toBeNull();
			expect(updateCallback).not.toHaveBeenCalled();
		});

		test('Reset does not re-enable it', () => {
			const { content } = makeModal(30, 10, 0, false);
			btn(content, 'Reset').click();
			expect(spendRecoveryBtn(content).disabled).toBe(true);
			expect(spendRecoveryBtn(content).getAttribute('aria-label')).toBe('Spend Recovery: Creatures have no Recoveries');
		});
	});

	describe('a hero with no Recoveries pool', () => {
		test('the button says it heals, not spends, and its tooltip says no Recovery is spent', () => {
			const { content } = makeModal(30, 10, 0);
			const heal = spendRecoveryBtn(content);
			expect(heal.textContent).toBe('Heal Recovery Value');
			expect(heal.getAttribute('aria-label')).toBe('Heal Recovery Value: Spends no Recovery');
			expect(content.textContent).not.toContain('Spend Recovery');
			expect(heal.disabled).toBe(false);
		});

		test('the first press opens the confirmation and stages nothing yet; the dialog says no Recovery is tracked or spent', () => {
			const { content } = makeModal(30, 10, 0);
			spendRecoveryBtn(content).click();
			const dialog = freeHealDialog()!;
			expect(dialog).not.toBeNull();
			expect(dialog.el.textContent).toContain('Heal without spending a Recovery?');
			expect(dialog.el.textContent).toContain('no Recovery to spend');
			expect(dialog.el.textContent).toContain("one Recovery's worth of Stamina (10)");
			expect(dialog.el.textContent).toContain('stopping at maximum Stamina');
			expect(dialog.el.textContent).toContain('does not track or spend a Recovery');
			expect(actionBtn(content).textContent).toBe('No Stamina Change');
			expect(content.querySelector<HTMLInputElement>('.dse-stepper__input')!.value).toBe('10');
		});

		test('Confirm stages the heal exactly as before (Apply writes it, recoveries untouched) and closes only the dialog', () => {
			const { content, bar, updateCallback } = makeModal(30, 10, 0);
			spendRecoveryBtn(content).click();
			freeHealDialog()!.confirm.click();
			expect(freeHealDialog()).toBeNull();
			expect(document.body.contains(content)).toBe(true);
			expect(actionBtn(content).textContent).toBe('Gain 10 Stamina');
			apply(content);
			expect(updateCallback).toHaveBeenCalledTimes(1);
			expect(bar.current_stamina).toBe(20);
			expect(bar.recoveries).toBeUndefined();
			expect(bar.recoveries_max).toBeUndefined();
		});

		test('later presses in the same session do not ask again, and neither does one after Reset', () => {
			const { content } = makeModal(30, 0, 0);
			spendRecoveryBtn(content).click();
			freeHealDialog()!.confirm.click();
			spendRecoveryBtn(content).click();
			expect(freeHealDialog()).toBeNull();
			expect(actionBtn(content).textContent).toBe('Gain 20 Stamina');
			btn(content, 'Reset').click();
			spendRecoveryBtn(content).click();
			expect(freeHealDialog()).toBeNull();
			expect(actionBtn(content).textContent).toBe('Gain 10 Stamina');
		});

		test('Cancel adds nothing, leaves the Stamina modal open with its pending state intact, and the next press asks again', () => {
			const { content, bar, updateCallback } = makeModal(30, 20, 5);
			clickDamage(content, 8);
			const pending = actionBtn(content).textContent;
			expect(pending).toBe('Lose 3 Stamina and Lose 5 Temp Stamina');
			spendRecoveryBtn(content).click();
			freeHealDialog()!.cancel.click();
			expect(freeHealDialog()).toBeNull();
			expect(document.body.contains(content)).toBe(true);
			expect(actionBtn(content).textContent).toBe(pending);
			expect(updateCallback).not.toHaveBeenCalled();
			expect(bar.current_stamina).toBe(20);
			spendRecoveryBtn(content).click();
			expect(freeHealDialog()).not.toBeNull();
		});

		test('Escape in the dialog closes only the dialog; the Stamina modal stays open with its pending state', () => {
			const onOpen = jest.spyOn(FreeHealConfirmModal.prototype, 'onOpen');
			try {
				const { modal, content } = makeModal(30, 20, 0);
				clickDamage(content, 4);
				const pending = actionBtn(content).textContent;
				spendRecoveryBtn(content).click();
				const dialog = freeHealDialog()!;
				attachObsidianKeymap(onOpen.mock.contexts[0] as FreeHealConfirmModal);
				pressEscape(dialog.cancel);
				expect(freeHealDialog()).toBeNull();
				expect(document.body.contains(modal.containerEl)).toBe(true);
				expect(actionBtn(content).textContent).toBe(pending);
			} finally {
				onOpen.mockRestore();
			}
		});

		test('closing the Stamina modal (view unload) closes an open dialog with it', () => {
			const { modal, content } = makeModal(30, 10, 0);
			spendRecoveryBtn(content).click();
			expect(freeHealDialog()).not.toBeNull();
			modal.close();
			expect(freeHealDialog()).toBeNull();
		});

		test('at max Stamina the button starts disabled with the max reason and never opens the dialog', () => {
			const { content } = makeModal(30, 30, 0);
			const heal = spendRecoveryBtn(content);
			expect(heal.disabled).toBe(true);
			heal.click();
			expect(freeHealDialog()).toBeNull();
		});

		test('a fresh modal asks again (the session is the modal instance)', () => {
			const first = makeModal(30, 10, 0);
			spendRecoveryBtn(first.content).click();
			freeHealDialog()!.confirm.click();
			first.modal.close();
			const second = makeModal(30, 10, 0);
			spendRecoveryBtn(second.content).click();
			expect(freeHealDialog()).not.toBeNull();
		});
	});

	describe('a hero WITH a pool is unchanged', () => {
		test('Spend Recovery keeps its name and heals + spends on the first press with no dialog', () => {
			const { content, bar } = makePoolModal(30, 10, 3, 6, true);
			const spend = spendRecoveryBtn(content);
			expect(spend.textContent).toBe('Spend Recovery');
			expect(spend.getAttribute('aria-label')).toBe('Spend Recovery');
			spend.click();
			expect(freeHealDialog()).toBeNull();
			expect(actionBtn(content).textContent).toBe('Gain 10 Stamina');
			apply(content);
			expect(bar.current_stamina).toBe(20);
			expect(bar.recoveries).toBe(2);
		});
	});
});
