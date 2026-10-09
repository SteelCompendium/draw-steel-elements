// SC-379 — the "Make an Argument" tab. The appeal / mention controls are CHIPS (the kit's
// .dse-optchip pressed grammar: a ◆ / ◇ motivation, an orange warning-triangle pitfall, a
// check once pressed, a struck-through "spent" state) living INSIDE this tab, per Scott's
// "buttons in the tab". They write exactly what the old checkboxes wrote
// (currentArgument.motivationsUsed / pitfallsUsed, with the existing reuse logic), so the
// YAML is unchanged. The three modifiers stay native <input type=checkbox> (the themed Steel
// box) and say WHY when greyed out. ONE kit powerRollPanel(selectable) shows the tiers: a TRUE
// radiogroup (<button role="radio" aria-checked>, exactly one tier, arrow-key roving). The
// Complete button is a kit iconButton with the REAL `disabled` property, armed (and accented)
// only while a tier is chosen.
//
// EVERYTHING IS RECOMPUTED IN PLACE. sync() re-derives the whole tab from the model: chip
// pressed/spent state, the modifiers' checked/disabled/why, the tier rows (the roll lives in
// `.dse-nt__roll-slot` under its OWN child Component and is rebuilt, keeping the chosen tier
// id and recomputing its result from the new table) and the Complete footer. It runs after
// every chip or modifier change, after a Spent toggle on the cards, and after Complete
// Argument — so the tab never goes stale, and nothing relies on the host rebuilding the view
// after our own write (SC-340's view adoption keeps the view across it). Chips and checkboxes
// are updated, never recreated, so keyboard focus stays where the user left it.
//
// An ENDED negotiation (NegotiationData.ending() !== null — the band in view.ts) has no
// argument left to make: the panel renders STATIC (no radios leading nowhere), Complete is
// disabled with an explanatory hint, and moving the standing off the ending re-arms it.
// Complete's results are advanced through NegotiationData.advanceStanding (Number() first, kept
// on the 0..5 scale), so a quoted YAML number or a crit at Interest 4.5 never writes garbage.
//
// Read-only hosts (F1 §4.4): chips and checkboxes are REAL-disabled with no listeners, the
// panel renders STATIC and the Complete footer is omitted entirely — no dead-end affordances.
import { Component, setIcon } from 'obsidian';
import { iconButton, powerRollPanel, tooltip } from '@/framework/kit';
import type { IconButtonHandle, PowerRollPanelHandle, PowerRollTier, RenderMdCallback } from '@/framework/kit';
import { NegotiationData } from '@model/NegotiationData';
import { ArgumentPowerRoll, ArgumentResult } from '@model/ArgumentPowerRolls';

/** The footer hint shown while the negotiation is over (SC-379 §3). */
const OVER_HINT = 'The negotiation is over — use ⋮ → Reset negotiation to start again.';
const PICK_HINT = 'Choose the test result to complete the argument';
const ARMED_HINT = 'Applies the chosen tier to Interest and Patience';

// The Heroes book (Appeal to Motivation): "can make a medium test" — the old tooltip said Easy.
const MOTIVATION_TIP =
	'If the Heroes appeal to a Motivation (w/o a Pitfall): Difficulty of the Argument Test is Medium.';
const PITFALL_TIP = 'If the Heroes mention a Pitfall: Argument fails and the NPC may warn Heroes.';

/** One modifier line: the label wrapping the native checkbox, its text and (disabled) its why. */
interface ModLine {
	line: HTMLElement;
	checkbox: HTMLInputElement;
	whyEl?: HTMLElement;
}

export class ArgumentView {
	/** The chosen tier id (null = none) and the results of the roll currently mounted. */
	private selectedId: PowerRollTier | null = null;
	private byTier?: Record<PowerRollTier, ArgumentResult>;
	private completeButton?: IconButtonHandle;
	private hintEl?: HTMLElement;
	/** The roll slot + the child Component its panel's listeners are bound to. */
	private rollSlot?: HTMLElement;
	private rollOwner?: Component;
	private ended = false;
	private readonly motivationChips = new Map<string, HTMLButtonElement>();
	private readonly pitfallChips = new Map<string, HTMLButtonElement>();
	private reuseLine?: ModLine;
	private lieLine?: ModLine;
	private sameLine?: ModLine;

	constructor(
		private readonly data: NegotiationData,
		private readonly persist: () => void,
		private readonly refreshStanding: () => void,
		/** Repaints the Motivations/Pitfalls cards (Complete Argument spends motivations). */
		private readonly refreshCards: () => void,
		private readonly owner: Component,
		private readonly renderMd: RenderMdCallback,
		private readonly canPersist: boolean,
	) {}

	public build(parent: HTMLElement): void {
		const body = parent.createDiv({ cls: 'dse-nt__argument' });

		this.buildAppeals(body);
		this.buildMods(body);
		this.rollSlot = body.createDiv({ cls: 'dse-nt__roll-slot' });
		this.ended = this.data.ending() !== null;
		// The Complete footer is a write action — omitted on read-only hosts (F1 §4.4).
		if (this.canPersist) this.buildFooter(body);
		this.sync();
	}

	/** The negotiation ended / was re-opened (view.ts refreshStanding). Re-seats the roll
	 *  (static while ended) and the Complete footer; a no-op while the state is unchanged. */
	public setEnded(ended: boolean): void {
		if (ended === this.ended) return;
		this.ended = ended;
		this.selectedId = null; // a pick belongs to a live roll; the rebuild clears it
		this.mountRoll();
		this.syncFooter();
	}

	/** Re-derives the whole tab from the model, in place (see the header). Also the hook the
	 *  cards call after a Spent toggle, which changes the chips' spent state and the reuse flag. */
	public sync(): void {
		for (const mot of this.data.motivations) {
			const chip = this.motivationChips.get(mot.name);
			if (chip) this.paintMotivationChip(chip, mot.name, mot.hasBeenAppealedTo);
		}
		for (const pit of this.data.pitfalls) {
			const chip = this.pitfallChips.get(pit.name);
			if (chip) this.paintPitfallChip(chip, pit.name);
		}
		this.syncMods();
		this.mountRoll();
		this.syncFooter();
	}

	// -- chips ---------------------------------------------------------------------------

	private buildAppeals(parent: HTMLElement): void {
		if (this.data.motivations.length === 0 && this.data.pitfalls.length === 0) return;
		const appeals = parent.createDiv({ cls: 'dse-nt__appeals' });

		if (this.data.motivations.length > 0) {
			const group = appeals.createDiv({ cls: 'dse-nt__appeals-group' });
			const head = group.createDiv({ cls: 'dse-nt__appeals-head' });
			const glyph = head.createSpan({ cls: 'dse-nt__glyph--mot', text: '◆' });
			glyph.setAttribute('aria-hidden', 'true');
			head.createSpan({ cls: 'dse-nt__label', text: 'Appeals to Motivation' });
			tooltip(head, MOTIVATION_TIP);
			const row = group.createDiv({ cls: 'dse-nt__chiprow' });
			for (const mot of this.data.motivations) {
				const chip = this.makeChip(row, 'motivation', () => this.onMotivationToggled(mot.name));
				this.motivationChips.set(mot.name, chip);
			}
		}

		if (this.data.pitfalls.length > 0) {
			const group = appeals.createDiv({ cls: 'dse-nt__appeals-group' });
			const head = group.createDiv({ cls: 'dse-nt__appeals-head' });
			const icon = head.createSpan({ cls: 'dse-nt__icon dse-nt__glyph--pit' });
			icon.setAttribute('aria-hidden', 'true');
			setIcon(icon, 'triangle-alert');
			head.createSpan({ cls: 'dse-nt__label', text: 'Mentions Pitfall' });
			tooltip(head, PITFALL_TIP);
			const row = group.createDiv({ cls: 'dse-nt__chiprow' });
			for (const pit of this.data.pitfalls) {
				const chip = this.makeChip(row, 'pitfall', () => this.onPitfallToggled(pit.name));
				this.pitfallChips.set(pit.name, chip);
			}
		}
	}

	/** A bare chip button: REAL-disabled with no listener on read-only hosts (F1 §4.4). */
	private makeChip(parent: HTMLElement, kind: 'motivation' | 'pitfall', onClick: () => void): HTMLButtonElement {
		const chip = parent.createEl('button', { cls: 'dse-optchip dse-nt__chip' });
		chip.setAttribute('type', 'button');
		chip.setAttribute('data-kind', kind);
		if (!this.canPersist) chip.disabled = true;
		else this.owner.registerDomEvent(chip, 'click', onClick);
		return chip;
	}

	/** Re-draws a chip's contents in place (the button itself, so focus survives). */
	private paintMotivationChip(chip: HTMLButtonElement, name: string, spent: boolean): void {
		const pressed = this.data.currentArgument.motivationsUsed.includes(name);
		chip.empty();
		chip.setAttribute('aria-pressed', String(pressed));
		chip.toggleClass('is-spent', spent);
		const glyph = chip.createSpan({ cls: 'dse-nt__chip-glyph', text: spent ? '◇' : '◆' });
		glyph.setAttribute('aria-hidden', 'true');
		if (pressed) this.checkIcon(chip);
		chip.createSpan({ cls: 'dse-nt__chip-text', text: name });
		if (spent) chip.createSpan({ cls: 'dse-nt__chip-note', text: 'spent' });
		tooltip(
			chip,
			spent
				? `Appeal to ${name} — this Motivation was used in a previous Argument.`
				: `Appeal to ${name}`,
		);
	}

	private paintPitfallChip(chip: HTMLButtonElement, name: string): void {
		const pressed = this.data.currentArgument.pitfallsUsed.includes(name);
		chip.empty();
		chip.setAttribute('aria-pressed', String(pressed));
		const icon = chip.createSpan({ cls: 'dse-nt__icon dse-nt__chip-icon' });
		icon.setAttribute('aria-hidden', 'true');
		setIcon(icon, 'triangle-alert');
		if (pressed) this.checkIcon(chip);
		chip.createSpan({ cls: 'dse-nt__chip-text', text: name });
		tooltip(chip, `Mention ${name}`);
	}

	private checkIcon(parent: HTMLElement): void {
		const check = parent.createSpan({ cls: 'dse-nt__icon dse-nt__chip-check' });
		check.setAttribute('aria-hidden', 'true');
		setIcon(check, 'check');
	}

	private onMotivationToggled(name: string): void {
		const usedList = this.data.currentArgument.motivationsUsed;
		const used = !usedList.includes(name);
		if (used) {
			usedList.push(name);
			const mot = this.data.motivations.find((m) => m.name === name);
			if (mot?.hasBeenAppealedTo) this.data.currentArgument.reusedMotivation = true;
		} else {
			const index = usedList.indexOf(name);
			if (index > -1) {
				usedList.splice(index, 1);
				// Only recompute on REMOVAL: when adding a previously-appealed motivation
				// the user may deselect the "reused" checkbox and that choice must stick —
				// we may only force reusedMotivation true (known reuse) or false (no
				// appealed-to motivation remains in the argument). Legacy behavior.
				this.data.currentArgument.reusedMotivation = this.data.argumentReusesMotivation();
			}
		}
		this.sync();
		this.persist();
	}

	private onPitfallToggled(name: string): void {
		const usedList = this.data.currentArgument.pitfallsUsed;
		const index = usedList.indexOf(name);
		if (index > -1) usedList.splice(index, 1);
		else usedList.push(name);
		this.sync();
		this.persist();
	}

	// -- modifiers -------------------------------------------------------------------------

	private buildMods(parent: HTMLElement): void {
		const mods = parent.createDiv({ cls: 'dse-nt__mods' });
		mods.createDiv({ cls: 'dse-nt__label', text: 'Modifiers' });
		const arg = this.data.currentArgument;

		this.reuseLine = this.modLine(
			mods,
			'Reuses a Motivation that has already been appealed to',
			'If the Heroes try to appeal to a Motivation multiple times: Interest remains and Patience decreases by 1.',
			(cb) => (arg.reusedMotivation = cb.checked),
		);
		this.lieLine = this.modLine(
			mods,
			'NPC caught a lie and is offended',
			'If the NPC catches a lie: Arguments that fail to increase Interest will lose an additional Interest.',
			(cb) => (arg.lieUsed = cb.checked),
		);
		this.sameLine = this.modLine(
			mods,
			'Argument has already been made (w/o Motivation)',
			'If the Heroes try to use the same Argument (w/o Motivation): Test automatically gets tier-1 result.',
			(cb) => (arg.sameArgumentUsed = cb.checked),
		);
	}

	/** A modifier line: <label> wrapping a native checkbox + its text (a real control). */
	private modLine(
		parent: HTMLElement,
		text: string,
		tip: string,
		apply: (cb: HTMLInputElement) => void,
	): ModLine {
		const line = parent.createEl('label', { cls: 'dse-nt__check' });
		const checkbox = line.createEl('input', { type: 'checkbox' });
		line.createSpan({ text });
		tooltip(line, tip);
		if (!this.canPersist) checkbox.disabled = true;
		// Read-only: no listener at all — there is no write path to reach (§4.4).
		else {
			this.owner.registerDomEvent(checkbox, 'change', () => {
				apply(checkbox);
				this.sync();
				this.persist();
			});
		}
		return { line, checkbox };
	}

	/** Re-evaluates the three modifiers from the model: reuse is enabled only when a SPENT
	 *  motivation is appealed to; same-argument is disabled while any motivation is appealed. */
	private syncMods(): void {
		const arg = this.data.currentArgument;
		const reusable = this.data.argumentReusesMotivation();
		if (this.reuseLine) {
			this.paintMod(this.reuseLine, {
				checked: reusable && arg.reusedMotivation,
				disabled: !reusable,
				why: 'only when a spent Motivation is appealed to',
			});
		}
		if (this.lieLine) this.paintMod(this.lieLine, { checked: arg.lieUsed, disabled: false });
		if (this.sameLine) {
			this.paintMod(this.sameLine, {
				checked: arg.sameArgumentUsed,
				disabled: arg.usesMotivation(),
				why: 'not while a Motivation is appealed to',
			});
		}
	}

	private paintMod(m: ModLine, s: { checked: boolean; disabled: boolean; why?: string }): void {
		m.checkbox.checked = s.checked;
		m.checkbox.disabled = !this.canPersist || s.disabled;
		m.line.toggleClass('is-disabled', s.disabled);
		// The reason appears ONLY while the line is greyed out, on its own line under the text.
		if (s.disabled && s.why) {
			if (!m.whyEl) m.whyEl = m.line.createSpan({ cls: 'dse-nt__why' });
			m.whyEl.setText(s.why);
		} else if (m.whyEl) {
			m.whyEl.remove();
			m.whyEl = undefined;
		}
	}

	// -- the roll -------------------------------------------------------------------------

	/** (Re)mounts the tier panel into the roll slot under a fresh child Component, so the
	 *  previous panel's listeners are released with it. The chosen tier id is kept (and its
	 *  result recomputed from the new table) unless the roll is static. */
	private mountRoll(): void {
		const slot = this.rollSlot;
		if (!slot) return;
		if (this.rollOwner) this.owner.removeChild(this.rollOwner);
		slot.empty();
		this.rollOwner = this.owner.addChild(new Component());

		const arg = this.data.currentArgument;
		const roll = ArgumentPowerRoll.build(
			arg.usesMotivation(),
			arg.usesPitfall(),
			arg.lieUsed,
			arg.reusedMotivation,
			arg.sameArgumentUsed,
		);
		const byTier: Record<PowerRollTier, ArgumentResult> = {
			low: roll.t1,
			mid: roll.t2,
			high: roll.t3,
			crit: roll.crit,
		};
		this.byTier = byTier;

		// Read-only hosts get the STATIC grammar — no radios to nowhere (§4.4) — and so does
		// an ended negotiation: Complete cannot fire, so nothing is selectable.
		const selectable = this.canPersist && !this.ended;
		if (!selectable) this.selectedId = null;

		const panel: PowerRollPanelHandle = powerRollPanel(
			slot,
			{
				chars: 'Reason, Intuition, or Presence',
				rows: [
					{ tier: 'low', md: roll.t1.toString() },
					{ tier: 'mid', md: roll.t2.toString() },
					{ tier: 'high', md: roll.t3.toString() },
					{ tier: 'crit', md: roll.crit.toString() },
				],
				selectable,
				selected: this.selectedId ?? undefined,
				onSelect: (tier) => {
					this.selectedId = tier;
					this.markChosen(panel);
					this.syncFooter();
				},
				renderMd: this.renderMd,
			},
			this.rollOwner,
		);
		if (selectable) this.markChosen(panel);
	}

	/** The chosen row's own mark: a check + the word "chosen" (the kit's aria-checked wash is
	 *  nearly invisible; the ring lives in CSS). Decorative — aria-checked is the state. */
	private markChosen(panel: PowerRollPanelHandle): void {
		this.rollSlot?.querySelectorAll('.dse-nt__chosen').forEach((el) => el.remove());
		const tier = panel.getSelected();
		const row = tier ? panel.rowEls[tier] : undefined;
		if (!row) return;
		const mark = row.createSpan({ cls: 'dse-nt__chosen' });
		mark.setAttribute('aria-hidden', 'true');
		const icon = mark.createSpan({ cls: 'dse-nt__icon' });
		setIcon(icon, 'check');
		mark.createSpan({ text: 'chosen' });
	}

	// -- the Complete footer ------------------------------------------------------------------

	private buildFooter(parent: HTMLElement): void {
		const footer = parent.createDiv({ cls: 'dse-nt__complete' });
		// The hint sits left of the button and says what to do next (or why it is off).
		this.hintEl = footer.createSpan({ cls: 'dse-nt__complete-hint' });
		this.completeButton = iconButton(
			footer,
			{
				icon: 'messages-square',
				label: 'Complete Argument',
				text: 'Complete Argument',
				disabled: true, // armed by tier selection (a radiogroup pick)
				tooltip:
					'Resolve the Argument using the current state of motivations, pitfalls, etc. \nRequires Power Roll tier to be selected.',
				onClick: () => this.completeArgument(),
			},
			this.owner,
		);
		this.syncFooter();
	}

	/** Complete is armed (and accented) only by a tier pick, and never once the negotiation is over. */
	private syncFooter(): void {
		const armed = this.canPersist && !this.ended && this.selectedId !== null;
		const button = this.completeButton;
		button?.setDisabled(!armed);
		button?.buttonEl.toggleClass('dse-btn--accent', armed);
		this.hintEl?.setText(this.ended ? OVER_HINT : armed ? ARMED_HINT : PICK_HINT);
	}

	/** Resolve the argument: mark used motivations appealed-to, apply the selected
	 *  tier's interest/patience deltas, reset the current argument, then re-derive the whole
	 *  tab and persist ONCE. */
	private completeArgument(): void {
		for (const motName of this.data.currentArgument.motivationsUsed) {
			const mot = this.data.motivations.find((m) => m.name === motName);
			if (mot) mot.hasBeenAppealedTo = true;
		}

		const result = this.selectedId && this.byTier ? this.byTier[this.selectedId] : null;
		if (result) {
			// SC-379: the 0..5 scale is a rule, not a display nicety — never write past it, and
			// do the sum on NUMBERS (a quoted "3" + 1 is 4, not "31"; see advanceStanding).
			this.data.current_interest = NegotiationData.advanceStanding(
				this.data.current_interest,
				result.interest,
			);
			this.data.current_patience = NegotiationData.advanceStanding(
				this.data.current_patience,
				result.patience,
			);
		}

		this.selectedId = null;
		this.data.currentArgument.resetData();

		// The tab (chips, modifiers, a fresh un-chosen roll, Complete disarmed), the cards (the
		// motivations just spent) and the standing region (and the ended band) all repaint in
		// place from the model; then the one write.
		this.refreshCards();
		this.sync();
		this.refreshStanding();
		this.persist();
	}
}
