// Plan 09 Task 3 (D2 §3.5b / OD-6) — MinionStaminaPoolModal on the unified stamina-modal
// template: composes the SAME shared primitives as StaminaEditModal (staminaPreviewBar,
// staminaStepperRow, setButtonText — see that file for the template) plus this modal's
// optional minion-list section (.dse-sedit__minions: info text, checkbox rows, condition
// icons). Kit controls throughout — REAL <button>s / REAL `disabled` (CB-8); zero inline
// colors/widths (SC-5): bar geometry via --dse-* custom properties, the checked-minion
// crimson via the `.dse-minion__check:checked ~ *` --dse-danger rule, the healing
// warning via .dse-sedit__warn (--dse-warn) + the `hidden` attribute.
//
// The data-corruption fixes are preserved verbatim:
//   CB-1 — the Apply clamp uses `(aliveCount) * minionMaxStamina` (parenthesized), never
//          the old `len ?? 0 * max` precedence bug;
//   CB-2 — ALL persistence routes through the injected persist callback (the old direct
//          CodeBlocks.updateCodeBlock(app, data, ctx, "") empty-fence write is dead —
//          src/utils/CodeBlocks.ts itself was deleted in SC-454);
//   DC-6 — condition removal AND damage in one session each persist once.
import { setIcon } from 'obsidian';
import type { App } from 'obsidian';
import { Creature, CreatureInstance, EnemyGroup, Condition } from '@drawSteelAdmonition/EncounterData';
// SC-183 r3 / GH #67 — the pool is addressed per SQUAD now (a group may hold several).
// Reading `group.minion_stamina_pool` directly would show squad 2 the squad-1 pool.
// SC-195: `minionPoolMaxOf` is the C1 fix — the persisted, ORIGINAL-count-based max
// (never the alive count this modal used to recompute); `foldedCaptainStaminaBonus`
// (fix round, HIGH-1) is the PERSISTED-flag-driven per-minion Stamina step while
// captained, for the kill-ladder divisor below — never the live `captainStaminaBonus`
// gate, which can disagree with the persisted pool max (see that helper's doc comment).
import { foldedCaptainStaminaBonus, minionCreatures, minionPoolMaxOf, minionPoolOf, setMinionPool } from '@drawSteelAdmonition/EncounterData';
import { ConditionManager } from '@utils/Conditions';
import { applyConditionColor, applyConditionEffect } from '@/elements/conditionColor';
import { FALLBACK_CONDITION_ICON, titleCaseConditionKey } from '@/elements/conditionDisplay';
import { focusControl, isKeyboardClick } from '@/framework/chrome/focusHandoff';
import { DseModal, iconButton, stampControl } from '@/framework/kit';
import type { IconButtonHandle, StepperHandle } from '@/framework/kit';
import { readAmount, staminaPreviewBar, staminaStepperRow, setButtonText } from './StaminaEditModal';
import type { StaminaPreviewBarHandle } from './StaminaEditModal';

/** The comparison form of a squad's creature name (SC-569 r3): case-folded, whitespace collapsed and trimmed. */
const squadNameKey = (name: string): string => name.replace(/\s+/g, ' ').trim().toLocaleLowerCase();

/**
 * SC-569: the pool modal's title. A group holding ONE minion squad keeps `"<group> - Minion Stamina Pool"`.
 * With two or more squads the title also names this squad's creature, so two modals opened from one group
 * can be told apart: `"<group> - <creature> - Minion Stamina Pool"`. When another squad in the group has the
 * SAME creature name (two squads of "Flow of the River" in Delian Tomb W1 group 3 have identical minion rows),
 * the creature gets `(squad N)`, N = 1-based position among the same-named squads in the tracker's order
 * (`group.creatures` order, the order the roster renders them top to bottom).
 *
 * Only `squad_role === 'minion'` creatures are squads (`minionCreatures`); captains and attached creatures are
 * not counted. Only squads the roster DRAWS count (SC-569 r3): the tracker draws a cell per entry of
 * `creature.instances`, so a hand-edited `amount: 0` squad has no cells and is not one the user can tell apart
 * (before parse `instances` is absent and `amount` stands in). The squad is found by identity, the way the
 * modal addresses it (`this.creature`). "Same name" ignores case and surrounding / repeated whitespace
 * (`squadNameKey`), because the Steel theme upper-cases the title and HTML collapses spaces, so two such names
 * would look identical on screen; the title still shows the creature's own name as written.
 */
export function minionPoolModalTitle(group: EnemyGroup, creature: Creature): string {
	const squads = minionCreatures(group).filter((c) => (c.instances?.length ?? c.amount) > 0);
	if (squads.length < 2) return `${group.name} - Minion Stamina Pool`;
	const key = squadNameKey(creature.name);
	const sameName = squads.filter((c) => squadNameKey(c.name) === key);
	const position = sameName.indexOf(creature);
	const label = sameName.length > 1 && position >= 0 ? `${creature.name} (squad ${position + 1})` : creature.name;
	return `${group.name} - ${label} - Minion Stamina Pool`;
}

export class MinionStaminaPoolModal extends DseModal {
	private group: EnemyGroup;
	private creature: Creature; // Minion creature
	// Injected persistence: the modal mutates the caller's shared encounter data in
	// place, then persist() writes it back (and rebuilds the caller's UI). The modal
	// never touches the vault/ctx directly (CB-2; the former CodeBlocks, deleted in SC-454, was the old direct writer).
	private persist: () => void;

	// Pending STAMINA change — the legacy bookkeeping, verbatim.
	private pendingStaminaChange: number = 0;
	// SC-430: the pending change a half-typed (uncommitted) pool draft WOULD stage, or null
	// when there is no parseable dirty draft. Read only through effectivePending() by every
	// piece of UI that re-renders at commit and can change size: Apply's label/state, the
	// heal-warning icon beside it, and the info text above it (2 lines -> 1 shifts Apply up by
	// a line). All of them show the post-commit result while the field is still focused, so
	// nothing moves at blur — a button that moves between mousedown (blur) and mouseup loses the
	// click in Chromium. The preview bar is fixed geometry and may lag. The committed truth
	// stays pendingStaminaChange.
	private draftStaminaChange: number | null = null;
	// SC-429: `auto` marks a box the MODAL checked (the "pool at 0 -> every remaining minion
	// dies" rule), as opposed to one the USER ticked. When that rule stops applying, only the
	// auto boxes revert; the user's own ticks keep their state.
	// SC-567: `tick` is the order the USER ticked the box in (a later tick has a larger number; 0 = not a user
	// pick). When the owed kills drop below the ticks, the latest picks are unticked first (updateCheckboxes), so
	// the modal never shows more ticks than owed kills. A modal (auto) tick never carries a number.
	private minionCheckboxes: { instance: CreatureInstance; checkbox: HTMLInputElement; auto: boolean; tick: number }[] = [];
	private tickSeq = 0;

	private bar!: StaminaPreviewBarHandle;
	private poolStepper!: StepperHandle;
	private infoTextEl!: HTMLElement;
	private warningIconEl!: HTMLElement;
	private actionBtn!: IconButtonHandle;
	private damageInput!: HTMLInputElement;

	constructor(
		app: App,
		group: EnemyGroup,
		creature: Creature,
		persist: () => void,
	) {
		super(app);
		this.group = group;
		this.creature = creature;
		this.persist = persist;
	}

	/**
	 * SC-429 / item 2: initial focus. DseModal focuses the FIRST focusable control after
	 * onOpen; StaminaEditModal's first control is its Apply box, but here the stepper row
	 * comes first in the DOM, so a bare open left focus on "Decrease Stamina pool" (Space/Enter
	 * right after opening decremented the pool). Mirror the stamina edit modal: focus the
	 * Apply box (the damage field, the first control of the Apply row).
	 */
	open(): void {
		super.open();
		this.damageInput?.focus();
	}

	onOpen() {
		this.setDseTitle(minionPoolModalTitle(this.group, this.creature));

		// SC-195 / C1: the pool's max is the persisted, ORIGINAL-count-based value (never
		// recomputed from the alive count — that was the pre-existing divergence from the
		// row bar/print readout, which always used the original `amount`).
		const poolMaxStamina = minionPoolMaxOf(this.creature);
		const poolCurrentStamina = this.currentPool();

		// -- The preview bar (shared template) with a tick at each minion death point --
		// Evenly divides the bar into `amount` segments (the ORIGINAL squad size, C1)
		// rather than deriving a per-minion step from `poolMaxStamina`, which may no
		// longer be an even multiple of any single per-minion value once a captain-bonus
		// crossing has happened mid-fight (SC-195).
		const ticks: number[] = [];
		for (let i = 1; i < this.creature.amount; i++) {
			ticks.push(i / this.creature.amount);
		}
		this.bar = staminaPreviewBar(this.body, { ticks });

		// -- Numeric adjust (kit stepper) ---------------------------------------------
		// Bounded [0, poolMax] — exactly the legacy ± behavior (its in/decrement already
		// clamped the step to those value bounds); the Apply-time CB-1 clamp below stays
		// the authoritative gate for the persisted value. KNOWN DEVIATION: a TYPED draft
		// past poolMax is clamped at commit here, where legacy carried the raw overshoot
		// pending until Apply — so the type-past-max-then-decrement corridor persists a
		// different in-range value (same pending maintainer sign-off as the single-stamina
		// stepper's overshoot note in StaminaEditModal).
		const adjustSection = this.body.createDiv({ cls: 'dse-sedit__adjust' });
		this.poolStepper = staminaStepperRow(
			adjustSection,
			{
				value: poolCurrentStamina,
				min: 0,
				max: poolMaxStamina,
				label: 'Stamina pool',
				control: 'pool.stamina', // SC-435: pool.stamina.dec / .input / .inc
				displayMax: poolMaxStamina,
				onChange: (value) => {
					this.pendingStaminaChange = value - poolCurrentStamina;
					this.refresh();
				},
				onDraftInput: (draft) => {
					this.draftStaminaChange =
						draft === null || draft === this.poolStepper.getValue() ? null : draft - poolCurrentStamina;
					this.updateInfoText();
					this.updateActionButton();
				},
			},
			this.lifecycle,
		);

		// -- Apply damage row -----------------------------------------------------------
		const applySection = this.body.createDiv({ cls: 'dse-sedit__apply' });
		const applyRow = applySection.createDiv({ cls: 'dse-sedit__apply-row' });
		applyRow.createSpan({ text: 'Apply' });
		const damageInput = applyRow.createEl('input', {
			type: 'number',
			cls: 'dse-sedit__apply-input',
			attr: { size: 3 },
		});
		this.damageInput = damageInput;
		damageInput.value = '0';
		damageInput.setAttribute('aria-label', 'Damage per minion');
		stampControl(damageInput, 'pool.damage-amount'); // SC-435
		// SC-241: the Apply box is a MAGNITUDE, not a signed delta — `min="0"` mirrors
		// the exact idiom SC-133 RC-3 already uses for StaminaEditModal's Apply box.
		damageInput.setAttribute('min', '0');
		applyRow.createSpan({ text: 'damage to' });
		const minionCountInput = applyRow.createEl('input', {
			type: 'number',
			cls: 'dse-sedit__apply-input',
			attr: { size: 3 },
		});
		minionCountInput.value = '1';
		// SC-429: the cap is the LIVING minions (the same `!isDead` rule the list and the kill
		// math use), not every instance the squad ever had.
		minionCountInput.max =
			this.creature.instances?.filter((inst) => !inst.isDead).length.toString() ?? '';
		minionCountInput.min = '0';
		minionCountInput.setAttribute('aria-label', 'Number of minions hit');
		stampControl(minionCountInput, 'pool.minion-count'); // SC-435
		applyRow.createSpan({ text: 'minions' });

		iconButton(
			applyRow,
			{
				icon: 'sword',
				label: 'Apply Damage',
				text: 'Apply Damage',
				control: 'pool.apply-damage', // SC-435
				onClick: () => {
					// SC-427: readAmount (Number + trunc), not parseInt — a number input may hold
					// "1e3" (= 1000), which parseInt read as 1.
					const damage = readAmount(damageInput.value);
					const minions = readAmount(minionCountInput.value);
					if (!isNaN(damage) && !isNaN(minions)) {
						// SC-241: clamp BOTH parsed values to a magnitude — the same class of
						// bug SC-133 RC-3 fixed in StaminaEditModal's Apply box. Either box
						// going negative (or both, which would otherwise cancel back out to a
						// positive `totalDamage`) must never flip this into a heal.
						const clampedDamage = Math.max(0, damage);
						// SC-429: ...and cap the count at the LIVING minions. The box's `max` only bounds
						// the spinner; a typed or pasted number goes straight through, and the rules
						// cannot hit more minions than are alive. Show the cap in the box.
						const alive = this.creature.instances?.filter((inst) => !inst.isDead).length ?? 0;
						const clampedMinions = Math.min(alive, Math.max(0, minions));
						minionCountInput.value = String(clampedMinions);
						const totalDamage = clampedDamage * clampedMinions;
						this.pendingStaminaChange -= totalDamage;
						this.refresh();
					}
				},
			},
			this.lifecycle,
		);

		// -- Minion list (the OPTIONAL section that distinguishes this modal) -----------
		const minionSection = this.body.createDiv({ cls: 'dse-sedit__minions' });
		this.infoTextEl = minionSection.createDiv({ cls: 'dse-sedit__info' });

		this.creature.instances?.forEach((instance) => {
			if (instance.isDead) return; // Skip dead minions

			const minionRow = minionSection.createDiv({ cls: 'dse-minion' });

			// The checkbox comes FIRST in the row: the `.dse-minion__check:checked ~ *`
			// CSS rule colors the name/conditions with --dse-danger (the old inline
			// crimson, evicted — SC-5).
			const checkbox = minionRow.createEl('input', { type: 'checkbox', cls: 'dse-minion__check' });
			checkbox.setAttribute('aria-label', `Kill ${this.creature.name} #${instance.id}`);
			stampControl(checkbox, 'pool.kill'); // SC-435 (one per living minion: nth)
			const entry = { instance, checkbox, auto: false, tick: 0 };
			// A hand toggle always makes the box the user's own (SC-429); a fresh tick is the latest pick
			// (SC-567), an untick drops the box out of the order (a re-tick later gets a later number).
			const handToggled = () => {
				entry.auto = false;
				entry.tick = checkbox.checked ? ++this.tickSeq : 0;
			};
			this.lifecycle.registerDomEvent(checkbox, 'change', () => {
				handToggled();
				this.updateCheckboxes();
				this.updateActionButton();
			});
			this.minionCheckboxes.push(entry);

			const minionName = minionRow.createSpan({
				text: `${this.creature.name} #${instance.id}`,
				cls: 'dse-minion__name',
			});
			stampControl(minionName, 'pool.minion-name'); // SC-435 (a click toggles the checkbox)
			// Toggle the checkbox when clicking the minion's name (legacy affordance).
			this.lifecycle.registerDomEvent(minionName, 'click', () => {
				if (!checkbox.disabled) {
					checkbox.checked = !checkbox.checked;
					handToggled(); // SC-429 / SC-567: as the change handler above
					this.updateCheckboxes();
					this.updateActionButton();
				}
			});

			const conditionsEl = minionRow.createDiv({ cls: 'dse-minion__conditions' });
			this.buildConditionIcons(conditionsEl, instance);
		});

		// -- Footer: Reset + healing warning + the dynamic apply button (accent) --------
		const [, actionBtn] = this.footer([
			{
				icon: 'undo',
				label: 'Reset',
				text: 'Reset',
				control: 'pool.reset', // SC-435
				onClick: () => {
					this.pendingStaminaChange = 0;
					damageInput.value = '0';
					minionCountInput.value = '1';
					// Uncheck all checkboxes (updateCheckboxes/refresh re-derive enablement).
					this.minionCheckboxes.forEach((item) => {
						item.checkbox.checked = false;
						item.checkbox.disabled = true;
						item.auto = false;
						item.tick = 0;
					});
					this.refresh();
				},
			},
			{
				label: 'No Stamina Change',
				text: 'No Stamina Change',
				control: 'pool.apply', // SC-435
				variant: 'accent',
				disabled: true,
				onClick: () => {
					// SC-430: a still-typed pool draft lands first, through the same path blur
					// uses (a no-op when blur already committed it).
					this.poolStepper.commitDraft();
					const newStamina = poolCurrentStamina + this.pendingStaminaChange;
					// CB-1's original fix (the `len ?? 0 * max` precedence bug, clamping the
					// pool to the alive-minion COUNT instead of count * max) is superseded by
					// SC-195's C1 fix: the clamp ceiling is now the persisted/original-count
					// max (`minionPoolMaxOf`), never a live alive-count recompute, so the
					// parenthesization footgun this comment used to warn about no longer has
					// anything to bite — there is no `len ?? 0 * max`-shaped expression left.
					const maxStamina = minionPoolMaxOf(this.creature);
					setMinionPool(this.group, this.creature, Math.min(maxStamina, Math.max(0, newStamina)));

					// Update the minion instances based on the selected checkboxes
					const checkedMinions = this.minionCheckboxes.filter((item) => item.checkbox.checked);
					checkedMinions.forEach((item) => {
						item.instance.isDead = true;
					});

					// Persist the mutated encounter data via the injected callback (CB-2)
					this.persist();
					this.close();
				},
			},
		]);
		this.actionBtn = actionBtn;

		// The "minions cannot regain stamina" warning sits between Reset and Apply;
		// shown/hidden via the `hidden` ATTRIBUTE (never inline display — D2 §5),
		// colored by the .dse-sedit__warn rule (--dse-warn).
		const footerEl = actionBtn.buttonEl.parentElement as HTMLElement;
		footerEl.classList.add('dse-sedit__footer'); // Reset left / warning + apply right
		this.warningIconEl = footerEl.createSpan({ cls: 'dse-sedit__warn' });
		setIcon(this.warningIconEl, 'alert-circle');
		this.warningIconEl.hidden = true;
		footerEl.insertBefore(this.warningIconEl, actionBtn.buttonEl);

		this.refresh();
	}

	/** One targeted refresh after every edit: stepper, bar, info, checkboxes, apply. */
	private refresh(): void {
		// SC-430: setValue below re-renders the input, discarding any typed draft.
		this.draftStaminaChange = null;
		// Legacy display parity: the pool input always showed the CLAMPED new value.
		this.poolStepper.setValue(this.clampedNewStamina());
		this.updateStaminaBar();
		this.updateInfoText();
		this.updateCheckboxes();
		this.updateActionButton();
	}

	/** Legacy pool math (shared by the bar/info/checkbox/button updates), SC-195-updated:
	 *  `poolMaxStamina` is now the persisted/original-count max (C1, `minionPoolMaxOf`)
	 *  instead of a live alive-count recompute, and the kill-ladder divisor is the
	 *  CURRENT effective per-minion Stamina (`per + the active captain bonus`) — a
	 *  captained squad drops a minion every `per + N` damage, not every `per`, matching
	 *  the pool's own build rule (each minion's Stamina, captain bonus included,
	 *  multiplied by the squad's count). Fix round (HIGH-1): the bonus folded into the
	 *  divisor must be the PERSISTED flag (`foldedCaptainStaminaBonus`), never the live
	 *  gate — a pre-upgrade captained squad (flag absent) or a bound-but-down captain
	 *  (flag true, live gate 0) made the two disagree, corrupting the ladder. */
	private poolNumbers() {
		const minionMaxStamina = this.creature.max_stamina;
		const aliveMinions = this.creature.instances?.filter((inst) => !inst.isDead).length ?? 0;
		const poolMaxStamina = minionPoolMaxOf(this.creature);
		const poolCurrentStamina = this.currentPool();
		const pending = this.effectivePending();
		const newStamina = poolCurrentStamina + pending;
		const effectivePerMinion = minionMaxStamina + foldedCaptainStaminaBonus(this.creature);
		// How many minions this edit kills. DAMAGE uses the death ladder (the boundaries the
		// pending change crosses: `floor((max - new) / per) - floor((max - cur) / per)`,
		// divisor per SC-195), with exactly two clamps (SC-417 MEDIUM-1): the count never
		// exceeds the LIVING minions (overkill, or a pool already below its death ticks,
		// used to ask for more kills than there are minions and lock Apply), and a pool
		// driven to <= 0 kills every living minion. A HEAL never demands a kill (count <= 0,
		// SC-417 MEDIUM-R3); a negative count means the heal would lift the pool past a
		// dead minion's share, which the modal refuses.
		const initialMinionsKilled = Math.floor((poolMaxStamina - poolCurrentStamina) / effectivePerMinion);
		const finalMinionsKilled = Math.floor((poolMaxStamina - newStamina) / effectivePerMinion);
		let minionsToKill = finalMinionsKilled - initialMinionsKilled;
		if (pending > 0) {
			minionsToKill = Math.min(0, minionsToKill);
		} else if (newStamina <= 0) {
			// Here `pending <= 0` (a heal took the branch above). SC-573: `pending === 0` counts: a pool already
			// at 0 with minions still alive owes their deaths with NOTHING staged, so Apply stays reachable.
			// (A pool above 0 never has `pending === 0 && newStamina <= 0`: no behaviour change there.)
			minionsToKill = aliveMinions;
		} else {
			minionsToKill = Math.min(aliveMinions, minionsToKill);
		}
		// The highest pool a heal may reach: the top of the death bracket the pool already
		// sits in. This is the SAME bound the ladder refuses on (`minionsToKill < 0` iff
		// `new > poolMax - initialMinionsKilled * per`), so the message and the refusal can't
		// disagree. It equals the living minions' worth (`alive * per`) on a consistent squad,
		// and sits below it when the pool is underfunded (captain relieved, 6.0.2 damage).
		const healCeiling = poolMaxStamina - initialMinionsKilled * effectivePerMinion;
		// SC-573: the kills owed by a pool that is ALREADY empty (nothing staged, or damage staged on it, which
		// loses nothing): the label, info line and enable state all read this one value. 0 for any pool above 0.
		const emptyPoolKills = pending <= 0 && poolCurrentStamina <= 0 ? minionsToKill : 0;
		return { minionMaxStamina, aliveMinions, poolMaxStamina, poolCurrentStamina, newStamina, minionsToKill, healCeiling, emptyPoolKills };
	}

	/**
	 * SC-573 r2: the squad's current pool, floored at 0. A hand-edited negative pool (no write path produces one)
	 * is an empty pool: the stepper shows 0, so every staged change must be measured from 0 too (a +/- press from
	 * -3 used to stage a +3 "heal" against a stepper reading 0). Apply writes the floored value. One read for the
	 * stepper base, `poolNumbers()` and the Apply handler; a pool above 0 is unchanged.
	 */
	private currentPool(): number {
		return Math.max(0, minionPoolOf(this.group, this.creature) ?? minionPoolMaxOf(this.creature));
	}

	/** SC-430: the committed pending change, or the one a dirty typed draft would stage. */
	private effectivePending(): number {
		return this.draftStaminaChange ?? this.pendingStaminaChange;
	}

	/**
	 * SC-566: the pool change Apply will actually WRITE for a raw staged change, as the label and
	 * info line state it (the SC-427 `appliedStaminaChange` shape, StaminaEditModal). It is the one
	 * copy the label and info line share; Apply and the stepper keep their own [0, max] clamp.
	 * Damage never takes more than the pool holds (99 x 5 on a pool of 20 is 20, not 495) and a
	 * heal never lifts it past the max. The sign never flips. The current pool is never negative
	 * here (`currentPool` floors a hand-edited negative at 0), so damage on an empty pool is 0.
	 * The preview bar deliberately keeps the raw damage (updateStaminaBar).
	 */
	private appliedPoolChange(raw: number): number {
		const { poolMaxStamina, poolCurrentStamina } = this.poolNumbers();
		if (raw < 0) return Math.max(raw, -poolCurrentStamina);
		return Math.min(raw, Math.max(0, poolMaxStamina - poolCurrentStamina));
	}

	private clampedNewStamina(): number {
		const { poolMaxStamina, poolCurrentStamina } = this.poolNumbers();
		return Math.min(poolMaxStamina, Math.max(0, poolCurrentStamina + this.pendingStaminaChange));
	}

	private updateStaminaBar(): void {
		const { poolMaxStamina, poolCurrentStamina } = this.poolNumbers();
		const newStamina = this.clampedNewStamina();

		const currentStaminaPercentage = (poolCurrentStamina / poolMaxStamina) * 100;
		const newStaminaPercentage = (newStamina / poolMaxStamina) * 100;
		const pendingChangePercentage = ((newStamina - poolCurrentStamina) / poolMaxStamina) * 100;

		if (this.pendingStaminaChange > 0) {
			// Healing: the delta rides the current fill's right edge (--dse-stamina-temp blue).
			this.bar.set(currentStaminaPercentage, pendingChangePercentage, 'heal');
		} else if (this.pendingStaminaChange < 0) {
			// Damage: legacy verbatim — the delta width is the FULL pending damage
			// (track overflow clips it), not the clamped remainder.
			this.bar.set(newStaminaPercentage, (this.pendingStaminaChange / poolMaxStamina) * -100, 'damage');
		} else {
			this.bar.set(currentStaminaPercentage, 0, 'none');
		}
		// SC-132: the same edit on the Steel gauge. A squad pool has no negative range —
		// `dyingZone: false` collapses the zero bulkhead onto the channel's left edge, so
		// the pour simply starts there — and no temp stamina, so the gauge degenerates to
		// exactly what this modal has always shown, in the cluster's material. The death
		// ticks come through as graduations (the gauge's own index-mark vocabulary).
		this.bar.setGauge(
			{ current: poolCurrentStamina, temp: 0, max: poolMaxStamina },
			{ current: newStamina, temp: 0, max: poolMaxStamina },
		);
	}

	private updateInfoText(): void {
		const { minionsToKill, healCeiling, emptyPoolKills } = this.poolNumbers();
		const pending = this.effectivePending(); // SC-430: follows a typed draft (see the field comment)
		// SC-429: the `hidden` attribute, never inline display. SC-573: an empty pool with living minions has
		// something to say even with nothing staged.
		this.infoTextEl.hidden = pending === 0 && emptyPoolKills === 0;
		if (emptyPoolKills > 0) {
			// SC-573: the pool is empty, so the squad is dead; staged damage on it would lose nothing, so it is not
			// worded as "0 damage will kill N". The boxes are already ticked and locked: nothing to select.
			this.infoTextEl.textContent = `The pool is at 0, so ${emptyPoolKills} minion(s) die.`;
		} else if (minionsToKill < 0) {
			// A heal past a dead minion's share (SC-417 LOW-1): say the rule, never a
			// negative count.
			this.infoTextEl.textContent = `A heal can't raise the pool above the living minions' share (${healCeiling} stamina).`;
		} else if (pending > 0) {
			this.infoTextEl.textContent = `Heal ${this.appliedPoolChange(pending)} stamina; dead minions stay dead.`;
		} else if (pending === 0) {
			// SC-429: nothing pending (no damage, so no kills to select) — hide the line rather
			// than read "0 damage will kill 0 minion(s). Select 0 minion(s) to kill."
			this.infoTextEl.textContent = '';
		} else {
			// SC-566: the damage the pool actually loses, not the raw staged sum.
			const totalPendingDamage = -this.appliedPoolChange(pending);
			// SC-429: with no kills owed there is nothing to select, so drop that sentence.
			this.infoTextEl.textContent =
				`${totalPendingDamage} damage will kill ${minionsToKill} minion(s).` +
				(minionsToKill > 0 ? ` \nSelect ${minionsToKill} minion(s) to kill.` : '');
		}
	}

	/** Legacy wording verbatim; the disabled state is the REAL property (CB-8). */
	private updateActionButton(): void {
		const staminaChange = this.effectivePending();
		// SC-566: the label states the change Apply writes (the clamped one); the enabled state
		// keeps reading the raw staged change.
		const appliedChange = this.appliedPoolChange(staminaChange);
		const { newStamina, minionsToKill, healCeiling, emptyPoolKills } = this.poolNumbers();

		// Count the number of minions selected
		let selectedMinions = this.minionCheckboxes.filter((item) => item.checkbox.checked).length;
		if (this.draftStaminaChange !== null) {
			// SC-430: the boxes are only re-derived when the draft commits (updateCheckboxes);
			// predict that outcome so a draft that empties the pool (all auto-checked) or needs
			// no kills (all cleared) shows the post-commit Apply state now rather than one blur
			// later.
			if (newStamina <= 0) selectedMinions = this.minionCheckboxes.length;
			else if (minionsToKill <= 0) selectedMinions = 0;
			// The commit reverts the boxes the modal ticked itself (SC-429), leaving the user's.
			// SC-567: and trims the user's ticks down to the owed kills (the latest picks go first).
			else {
				const userTicks = this.minionCheckboxes.filter((item) => item.checkbox.checked && !item.auto).length;
				selectedMinions = Math.min(userTicks, minionsToKill);
			}
		}

		// Disable the apply button if the number of selected minions doesn't match minionsToKill
		const disableActionButton = minionsToKill !== selectedMinions;

		let actionText = '';
		if (emptyPoolKills > 0) {
			// SC-573: the applied damage is 0 and the deaths are owed — say the deaths, not "Deal 0 damage".
			actionText = `Kill ${emptyPoolKills} minion(s)`;
		} else if (staminaChange < 0) {
			actionText += `Deal ${Math.abs(appliedChange)} damage`;
			if (minionsToKill > 0) {
				actionText += `, kill ${minionsToKill} minion(s)`;
			}
		} else if (staminaChange > 0) {
			actionText += `Heal ${appliedChange} stamina`;
		} else {
			actionText = 'No Stamina Change';
		}
		setButtonText(this.actionBtn, actionText);

		// Disable the button if no change or kills not accounted for — REAL disabled (CB-8).
		// SC-573: "no change" also needs no kills owed — an empty pool with living minions has something to apply.
		this.actionBtn.setDisabled((staminaChange === 0 && minionsToKill === 0) || disableActionButton);

		// Explain the disabled state (legacy tooltip preserved).
		if (disableActionButton && minionsToKill > 0) {
			this.actionBtn.buttonEl.setAttribute('title', `Select ${minionsToKill} minion(s) to kill`);
		} else if (minionsToKill < 0) {
			// SC-417 LOW-1: the refused heal gets its reason.
			const reason = `Minions can't regain Stamina past a dead minion's share (at most ${healCeiling})`;
			this.actionBtn.buttonEl.setAttribute('title', reason);
			// LOW-R3: the accessible name (aria-label, the hover tooltip) carries it too — the
			// visible text stays the action (house rule: Spend Recovery's disable reason).
			this.actionBtn.setLabel(`${actionText} — ${reason}`);
		} else {
			this.actionBtn.buttonEl.removeAttribute('title');
		}

		// Show the warning icon when healing (hidden attribute — never inline display).
		if (staminaChange > 0) {
			this.warningIconEl.hidden = false;
			this.warningIconEl.setAttribute('title', 'Typically minions are unable to regain stamina');
		} else {
			this.warningIconEl.hidden = true;
		}
	}

	private updateCheckboxes(): void {
		const { newStamina, minionsToKill } = this.poolNumbers();

		// If minion pool stamina reaches 0, auto-select all checkboxes
		if (newStamina <= 0) {
			this.minionCheckboxes.forEach((item) => {
				// Only a box the user had not already ticked becomes the modal's (auto) tick.
				if (!item.checkbox.checked) item.auto = true;
				item.checkbox.checked = true;
				item.checkbox.disabled = true;
			});
			return;
		}

		// SC-429: the 0-pool rule no longer applies — revert what IT checked (the user's own
		// ticks stay; the branches below re-derive availability from them).
		this.minionCheckboxes.forEach((item) => {
			if (item.auto) {
				item.checkbox.checked = false;
				item.auto = false;
			}
		});

		// If no minions need to be killed, disable all checkboxes
		if (minionsToKill <= 0) {
			this.minionCheckboxes.forEach((item) => {
				item.checkbox.checked = false;
				item.tick = 0;
				item.checkbox.disabled = true;
			});
		} else {
			// SC-567: never more ticks than owed kills. Lowering the damage after ticking can leave surplus
			// ticks; undo the latest picks first, so the user's earlier picks stay (a tie keeps DOM order).
			this.minionCheckboxes
				.filter((item) => item.checkbox.checked)
				.sort((a, b) => a.tick - b.tick)
				.slice(minionsToKill)
				.forEach((item) => {
					item.checkbox.checked = false;
					item.tick = 0;
				});
			// Enable checkboxes up to minionsToKill
			const selectedCount = this.minionCheckboxes.filter((item) => item.checkbox.checked).length;
			this.minionCheckboxes.forEach((item) => {
				if (item.checkbox.checked) {
					item.checkbox.disabled = false;
				} else {
					item.checkbox.disabled = selectedCount >= minionsToKill;
				}
			});
		}
	}

	/** SC-572 r3: after a keyboard removal, focus the icon that shifted into the removed one's slot (the previous
	 *  one if it was last). With none left (r5, INFO-1): the damage field, a harmless place to land (a footer button
	 *  would let a second Enter throw away the staged damage and ticks); failing that, the next focusable control
	 *  after the row that is not a footer action, else the first such control — never <body>. */
	private handOffConditionFocus(container: HTMLElement, index: number): void {
		const icons = Array.from(container.querySelectorAll<HTMLElement>('.condition-icon'));
		if (icons.length > 0 && focusControl(icons[Math.min(index, icons.length - 1)])) return;
		const damage = this.contentEl.querySelector<HTMLInputElement>('[data-dse-control="pool.damage-amount"]');
		if (damage && !damage.disabled && focusControl(damage)) return;
		const focusable = Array.from(
			this.contentEl.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'),
		).filter((el) => !container.contains(el) && !el.closest('.dse-sedit__footer'));
		const after = focusable.find((el) => container.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
		focusControl(after ?? focusable[0]);
	}

	private buildConditionIcons(container: HTMLElement, character: CreatureInstance): void {
		const conditions = character.conditions || [];

		const conditionManager = new ConditionManager();

		conditions.forEach((conditionEntry, entryIndex) => {
			let conditionKey: string;
			let conditionData: Condition | null = null;
			if (typeof conditionEntry === 'string') {
				conditionKey = conditionEntry;
			} else if (typeof conditionEntry === 'object' && conditionEntry.key) {
				conditionKey = conditionEntry.key;
				conditionData = conditionEntry;
			} else {
				return;
			}

			// SC-574: a key the registry does not know (a custom condition) still gets its button, with
			// the tracker's fallback glyph and title-cased name (SC-186; same as ConditionsModal), so it
			// can be seen and removed here.
			const condition = conditionManager.getAnyConditionByKey(conditionKey);
			const displayName = condition?.displayName ?? titleCaseConditionKey(conditionKey);
			// SC-572: a REAL <button> (Tab stop; Enter and Space activate it natively), named
			// "Remove <condition>" — the same name the Conditions modal's remove button carries.
			// aria-label is also the hover tooltip (Obsidian reads it), so there is no `title`:
			// a second, native tooltip would double it. Bare <button>, not a kit `.dse-btn`: the
			// icon keeps its legacy chrome-free look (the reset lives with `.condition-icon`).
			const iconEl = container.createEl('button', { cls: 'condition-icon' });
			iconEl.setAttribute('type', 'button'); // never an implicit form submit
			iconEl.setAttribute('aria-label', `Remove ${displayName}`);
			setIcon(iconEl, conditionData?.icon?.trim() || condition?.iconName || FALLBACK_CONDITION_ICON);
			stampControl(iconEl, 'pool.condition'); // SC-435 (a click removes the condition)

			// Apply color and effect customizations through the SHARED Task 8
			// helpers (SC-5/SD-2): the user-supplied color rides the sanctioned
			// --dse-condition-color custom property only after CSS.supports
			// validation, and the effect class only toggles for the known
			// vocabulary (raw classList.add throws on whitespace).
			if (conditionData) {
				applyConditionColor(iconEl, conditionData.color);
				applyConditionEffect(iconEl, conditionData.effect);
			}

			this.lifecycle.registerDomEvent(iconEl, 'click', (evt: MouseEvent) => {
				// Where this icon sits among its siblings, read before the rebuild destroys it.
				const index = Array.from(container.querySelectorAll('.condition-icon')).indexOf(iconEl);
				// SC-574: remove THIS entry by position — a value filter would drop every identical
				// string ("grabbed", "grabbed") with one click.
				character.conditions = conditions.filter((_, i) => i !== entryIndex);
				container.empty();
				this.buildConditionIcons(container, character);
				// SC-572 r3: a keyboard removal must not strand focus on <body> (the rebuild destroyed
				// the focused button). Same rule as ConditionsModal.removeAt (MED-3); a pointer click
				// keeps today's behaviour (SC-518: no focus move, no ring).
				if (isKeyboardClick(evt)) this.handOffConditionFocus(container, index);
				// Route through the injected callback — never a direct vault write.
				// The old direct CodeBlocks.updateCodeBlock(app, data, ctx, "") call (src/utils/CodeBlocks.ts, deleted in SC-454)
				// rewrote the fence with an EMPTY language, corrupting the block (CB-2).
				this.persist();
			});
		});

		// TODO - Add-condition UI stayed disabled after the original "saving condition
		// changes prevents the damage from saving" bug (DC-6, now fixed by routing all
		// persistence through this.persist()). Re-enabling is a feature decision.
	}
}
