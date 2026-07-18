// Plan 09 Task 7 (D2 §3.10) — the "Make an Argument" tab on the D2 kit. The legacy
// hand-rolled tier lines (EffectView.tierNKey + click-<div> selection) become ONE kit
// powerRollPanel in `selectable` mode: a TRUE radiogroup (<button role="radio"
// aria-checked>, exactly one tier, arrow-key roving — Plan 09 Task 0). The Complete
// button is a kit iconButton with the REAL `disabled` property, armed only while a
// tier is checked. Modifier checkboxes stay native <input type=checkbox> (real
// controls already); their listeners are owner-bound (F1 §4.5), and their titles moved
// onto the kit tooltip (§4.2).
//
// Tier values are computed ONCE at mount from the current argument state (legacy
// parity): a modifier change persists, and the echo-rebuild re-renders the panel with
// the recomputed tiers. Completing an argument likewise leaves the checked radio for
// the echo-rebuild to clear (legacy left its .active class the same way).
//
// Read-only hosts (F1 §4.4): the panel renders STATIC (no radios), checkboxes are
// REAL-disabled with no listeners, and the Complete footer is omitted entirely — no
// dead-end write affordances.
import type { Component } from 'obsidian';
import { iconButton, powerRollPanel, tooltip } from '@/framework/kit';
import type { IconButtonHandle, PowerRollTier, RenderMdCallback } from '@/framework/kit';
import { NegotiationData } from '@model/NegotiationData';
import { ArgumentPowerRoll, ArgumentResult } from '@model/ArgumentPowerRolls';

export class ArgumentView {
	private selectedTier: ArgumentResult | null = null;
	private completeButton?: IconButtonHandle;

	constructor(
		private readonly data: NegotiationData,
		private readonly persist: () => void,
		private readonly owner: Component,
		private readonly renderMd: RenderMdCallback,
		private readonly canPersist: boolean,
	) {}

	public build(parent: HTMLElement): void {
		const body = parent.createDiv({ cls: 'dse-nt__argument' });

		const modifiers = body.createDiv({ cls: 'dse-nt__argument-modifiers' });
		this.buildMotivations(modifiers);
		this.buildPitfalls(modifiers);
		this.buildOtherMods(body);
		this.buildPowerRoll(body);

		// The Complete footer is a write action — omitted on read-only hosts (F1 §4.4).
		if (this.canPersist) this.buildFooter(body);
	}

	/** A modifier line: <label> wrapping a native checkbox + its text (a real control). */
	private checkboxLine(
		parent: HTMLElement,
		text: string,
		init: (cb: HTMLInputElement) => void,
		onChange: (cb: HTMLInputElement) => void,
	): { line: HTMLElement; checkbox: HTMLInputElement } {
		const line = parent.createEl('label', { cls: 'dse-nt__argument-item' });
		const checkbox = line.createEl('input', { type: 'checkbox' });
		init(checkbox);
		if (!this.canPersist) checkbox.disabled = true;
		line.createSpan({ text });
		// Read-only: no listener at all — there is no write path to reach (§4.4).
		if (this.canPersist) {
			this.owner.registerDomEvent(checkbox, 'change', () => onChange(checkbox));
		}
		return { line, checkbox };
	}

	private buildMotivations(parent: HTMLElement): void {
		const container = parent.createDiv({ cls: 'dse-nt__argument-motivations' });
		if (this.data.motivations.length === 0) return;

		const header = container.createDiv({
			cls: 'dse-nt__argument-header',
			text: 'Appeals to Motivation',
		});
		tooltip(
			header,
			'If the Heroes appeal to a Motivation (w/o a Pitfall): Difficulty of the Argument Test is Easy.',
		);

		for (const mot of this.data.motivations) {
			const { line } = this.checkboxLine(
				container,
				mot.name,
				(cb) => {
					cb.checked = this.data.currentArgument.motivationsUsed.includes(mot.name);
				},
				(cb) => this.onMotivationToggled(mot.name, cb.checked),
			);
			if (mot.hasBeenAppealedTo) {
				line.addClass('dse-nt__argument-item--used');
				tooltip(line, 'This Motivation was used in a previous Argument.');
			}
		}
	}

	private onMotivationToggled(name: string, used: boolean): void {
		const usedList = this.data.currentArgument.motivationsUsed;
		if (used) {
			if (!usedList.includes(name)) usedList.push(name);
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
		this.persist();
	}

	private buildPitfalls(parent: HTMLElement): void {
		const container = parent.createDiv({ cls: 'dse-nt__argument-pitfalls' });
		if (this.data.pitfalls.length === 0) return;

		const header = container.createDiv({ cls: 'dse-nt__argument-header', text: 'Mentions Pitfall' });
		tooltip(header, 'If the Heroes mention a Pitfall: Argument fails and the NPC may warn Heroes.');

		for (const pit of this.data.pitfalls) {
			this.checkboxLine(
				container,
				pit.name,
				(cb) => {
					cb.checked = this.data.currentArgument.pitfallsUsed.includes(pit.name);
				},
				(cb) => {
					const usedList = this.data.currentArgument.pitfallsUsed;
					if (cb.checked) {
						if (!usedList.includes(pit.name)) usedList.push(pit.name);
					} else {
						const index = usedList.indexOf(pit.name);
						if (index > -1) usedList.splice(index, 1);
					}
					this.persist();
				},
			);
		}
	}

	private buildOtherMods(parent: HTMLElement): void {
		const container = parent.createDiv({ cls: 'dse-nt__argument-other' });

		// Reused Motivation — enabled only while the argument actually reuses one.
		const reusable = this.data.argumentReusesMotivation();
		const reuse = this.checkboxLine(
			container,
			'Reuses a Motivation that has already been appealed to',
			(cb) => {
				cb.disabled = !reusable;
				cb.checked = reusable && this.data.currentArgument.reusedMotivation;
			},
			(cb) => {
				this.data.currentArgument.reusedMotivation = cb.checked;
				this.persist();
			},
		);
		tooltip(
			reuse.line,
			'If the Heroes try to appeal to a Motivation multiple times: Interest remains and Patience decreases by 1.',
		);

		// Lie caught.
		const lie = this.checkboxLine(
			container,
			'NPC caught a lie and is offended',
			(cb) => {
				cb.checked = this.data.currentArgument.lieUsed;
			},
			(cb) => {
				this.data.currentArgument.lieUsed = cb.checked;
				this.persist();
			},
		);
		tooltip(
			lie.line,
			'If the NPC catches a lie: Arguments that fail to increase Interest will lose an additional Interest.',
		);

		// Same argument (without motivation).
		const sameArg = this.checkboxLine(
			container,
			'Argument has already been made (w/o Motivation)',
			(cb) => {
				cb.disabled = this.data.currentArgument.usesMotivation();
				cb.checked = this.data.currentArgument.sameArgumentUsed;
			},
			(cb) => {
				this.data.currentArgument.sameArgumentUsed = cb.checked;
				this.persist();
			},
		);
		tooltip(
			sameArg.line,
			'If the Heroes try to use the same Argument (w/o Motivation): Test automatically gets tier-1 result.',
		);
	}

	private buildPowerRoll(parent: HTMLElement): void {
		const roll = ArgumentPowerRoll.build(
			this.data.currentArgument.usesMotivation(),
			this.data.currentArgument.usesPitfall(),
			this.data.currentArgument.lieUsed,
			this.data.currentArgument.reusedMotivation,
			this.data.currentArgument.sameArgumentUsed,
		);
		const byTier: Record<PowerRollTier, ArgumentResult> = {
			low: roll.t1,
			mid: roll.t2,
			high: roll.t3,
			crit: roll.crit,
		};

		powerRollPanel(
			parent,
			{
				chars: 'Reason, Intuition, or Presence',
				rows: [
					{ tier: 'low', md: roll.t1.toString() },
					{ tier: 'mid', md: roll.t2.toString() },
					{ tier: 'high', md: roll.t3.toString() },
					{ tier: 'crit', md: roll.crit.toString() },
				],
				// Read-only hosts get the STATIC grammar — no radios to nowhere (§4.4).
				selectable: this.canPersist,
				onSelect: (tier) => {
					this.selectedTier = byTier[tier];
					this.completeButton?.setDisabled(false);
				},
				renderMd: this.renderMd,
			},
			this.owner,
		);
	}

	private buildFooter(parent: HTMLElement): void {
		const footer = parent.createDiv({ cls: 'dse-nt__argument-footer' });
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
	}

	/** Resolve the argument: mark used motivations appealed-to, apply the selected
	 *  tier's interest/patience deltas, reset the current argument, persist ONCE. */
	private completeArgument(): void {
		for (const motName of this.data.currentArgument.motivationsUsed) {
			const mot = this.data.motivations.find((m) => m.name === motName);
			if (mot) mot.hasBeenAppealedTo = true;
		}

		if (this.selectedTier) {
			this.data.current_interest += this.selectedTier.interest;
			this.data.current_patience += this.selectedTier.patience;
		}

		this.selectedTier = null;
		this.completeButton?.setDisabled(true);
		this.data.currentArgument.resetData();

		this.persist();
	}
}
