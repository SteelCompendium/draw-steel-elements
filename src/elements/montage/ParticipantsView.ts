// D8 Task 6 (spec §4.2) — per-hero "record test": append the used skill (warn, never
// block, on reuse — AGENT 94/spec §4.1) and tally the result. A skill is OPTIONAL per
// test (Draw Steel tests don't require an applicable skill, only a +2 bonus when one
// applies) — skills_used/reuse tracking only engages when a skill was actually entered.
//
// The optional roller row (spec §4.1's last bullet) invokes RollService.resolve
// SYNCHRONOUSLY (recon §10: service.ts:37/54's injected-DiceSource seam), not the async
// bridge-aware roll() RollView uses — montage has no compendium-resolved characteristic
// to hand the Dice Roller bridge, so a plain native-dice sync roll is the whole surface.
// Tier 1 = failure, tier 2/3 = success: the "Medium" row of the Difficulty Scaling table
// (AGENT lines 66-70) collapsed to the binary total the montage schema tracks — montage
// doesn't carry a per-test difficulty, so this is the only band split that doesn't
// fabricate a rule the reference never states for montage tests specifically.
import type { Component } from 'obsidian';
import { Notice } from 'obsidian';
import { iconButton } from '@/framework/kit';
import type { MontageModel, MontageParticipant } from './model';
import type { RollService } from '@/framework/roll/service';
import type { RollInput } from '@/framework/roll/types';

export class ParticipantsView {
	constructor(
		private readonly model: MontageModel,
		private readonly persist: () => void,
		/** Full-rebuild callback (MontageView.update) — record-test mutations touch both
		 *  this view's chip list AND RoundTrackView's tallies/outcome band, so a rebuild
		 *  (the same shape as the Reset flow) is simpler and safer than cross-wiring two
		 *  sibling sub-views' in-place repaint handles for a comparatively rare action. */
		private readonly refresh: () => void,
		private readonly owner: Component,
		private readonly canPersist: boolean,
		private readonly roll: RollService | undefined,
	) {}

	public build(parent: HTMLElement): void {
		const participants = this.model.participants ?? [];
		if (participants.length === 0) return;

		const container = parent.createDiv({ cls: 'dse-mt__participants' });
		container.createDiv({ cls: 'dse-mt__participants-header', text: 'Participants' });

		for (const participant of participants) {
			this.buildParticipant(container, participant);
		}
	}

	private buildParticipant(parent: HTMLElement, participant: MontageParticipant): void {
		const row = parent.createDiv({ cls: 'dse-mt__participant' });
		row.createDiv({ cls: 'dse-mt__participant-name', text: participant.name });

		const skills = row.createDiv({ cls: 'dse-mt__skills' });
		for (const skill of participant.skills_used) {
			skills.createSpan({ cls: 'dse-mt__skill-chip', text: skill });
		}

		// F1 §4.4: no dead-end write affordance on a read-only host — the chip list above
		// still shows, the record form just never mounts.
		if (!this.canPersist) return;

		const form = row.createDiv({ cls: 'dse-mt__record' });
		const skillInput = form.createEl('input', {
			cls: 'dse-mt__skill-input',
			type: 'text',
		}) as HTMLInputElement;
		skillInput.setAttribute('placeholder', 'Skill used (optional)');
		skillInput.setAttribute('aria-label', `${participant.name}'s skill`);

		let charInput: HTMLInputElement | undefined;
		if (this.roll) {
			charInput = form.createEl('input', {
				cls: 'dse-mt__char-input',
				type: 'number',
				value: '0',
			}) as HTMLInputElement;
			charInput.setAttribute('aria-label', `${participant.name}'s characteristic`);
		}

		iconButton(
			form,
			{
				icon: 'check',
				label: `Record success for ${participant.name}`,
				text: 'Success',
				onClick: () => this.record(participant, skillInput.value, true),
			},
			this.owner,
		);
		iconButton(
			form,
			{
				icon: 'x',
				label: `Record failure for ${participant.name}`,
				text: 'Failure',
				onClick: () => this.record(participant, skillInput.value, false),
			},
			this.owner,
		);

		if (this.roll && charInput) {
			const ch = charInput;
			iconButton(
				form,
				{
					icon: 'dices',
					label: `Roll a test for ${participant.name}`,
					text: 'Roll',
					onClick: () => this.rollTest(participant, skillInput.value, Number(ch.value) || 0),
				},
				this.owner,
			);
		}
	}

	/** Manual (or roll-driven) record: append the skill with a reuse warning, tally the
	 *  result, rebuild, persist. Rendering never writes — this only runs from a click. */
	private record(participant: MontageParticipant, skillRaw: string, success: boolean): void {
		const skill = skillRaw.trim();
		if (skill !== '') {
			if (participant.skills_used.includes(skill)) {
				new Notice(`${participant.name} has already used ${skill} in this montage.`);
			}
			participant.skills_used.push(skill);
		}
		if (success) this.model.successes += 1;
		else this.model.failures += 1;
		this.persist();
		this.refresh();
	}

	private rollTest(participant: MontageParticipant, skillRaw: string, characteristic: number): void {
		if (!this.roll) return;
		const skill = skillRaw.trim();
		const input: RollInput = {
			mode: 'test',
			characteristic,
			skillBonus: skill ? 2 : 0,
		};
		const result = this.roll.resolve(input);
		const success = (result.tier ?? 1) >= 2;
		new Notice(
			`${participant.name} rolled ${result.total} (tier ${result.tier ?? '—'}) — ${success ? 'success' : 'failure'}.`,
		);
		this.record(participant, skillRaw, success);
	}
}
