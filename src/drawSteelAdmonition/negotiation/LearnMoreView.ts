// Plan 09 Task 7 (D2 §3.10) — the "Learn Motivation/Pitfall" tab on the D2 kit: the
// legacy hand-rolled tier lines (EffectView.tierNKey) become ONE STATIC kit
// powerRollPanel (this panel was never clickable — it renders rules text only, three
// tiers, no crit row). Markdown goes through the caller-supplied renderMd callback
// (the owning view's this.renderMarkdown — ML-1); this module never touches Obsidian's
// renderer. No data, no persistence — nothing to gate on canPersist.
import type { Component } from 'obsidian';
import { powerRollPanel } from '@/framework/kit';
import type { RenderMdCallback } from '@/framework/kit';

const INTRO =
	'If the heroes want to learn one of the NPC’s motivations or pitfalls, a hero can make the following test while interacting with the NPC during the negotiation. After this test is made, the heroes can’t make another test to determine the same NPC’s motivations or pitfalls until they make an argument to the NPC or the negotiation ends.';

const TIER_1 =
	'The hero learns no information regarding the NPC’s motivations or pitfalls, and the NPC realizes the hero is trying to read them and becomes annoyed. As a consequence, the NPC’s patience is reduced by 1.';
const TIER_2 = 'The hero learns no information regarding the NPC’s motivations or pitfalls.';
const TIER_3 = 'The hero learns one of the NPC’s motivations or pitfalls (their choice).';

export class LearnMoreView {
	constructor(
		private readonly owner: Component,
		private readonly renderMd: RenderMdCallback,
	) {}

	public build(parent: HTMLElement): void {
		const body = parent.createDiv({ cls: 'dse-nt__learn-more' });
		body.createEl('p', { text: INTRO });
		powerRollPanel(
			body,
			{
				chars: 'Reason, Intuition, or Presence',
				rows: [
					{ tier: 'low', md: TIER_1 },
					{ tier: 'mid', md: TIER_2 },
					{ tier: 'high', md: TIER_3 },
				],
				renderMd: this.renderMd,
			},
			this.owner,
		);
	}
}
