import {App, MarkdownPostProcessorContext, setTooltip} from "obsidian";
import {NegotiationData} from "../../model/NegotiationData";
import {PowerRollTiers} from "../../model/powerRoll";
import {AbilityProcessor} from "../ability/abilityProcessor";
import {AbilityView} from "../ability/AbilityView";
import {PowerRollEffectView} from "../ability/PowerRollEffectView";

export class LearnMoreView {
	private app: App;
	private data: NegotiationData;
	private ctx: MarkdownPostProcessorContext;

	private static learnMorePowerRoll = new PowerRollTiers(
		"The hero learns no information regarding the NPC’s motivations or pitfalls, and the NPC realizes the hero is trying to read them and becomes annoyed. As a consequence, the NPC’s patience is reduced by 1.",
		"The hero learns no information regarding the NPC’s motivations or pitfalls.",
		"The hero learns one of the NPC’s motivations or pitfalls (their choice).",
		""
	);

	constructor(app: App, data: NegotiationData, ctx: MarkdownPostProcessorContext) {
		this.app = app;
		this.data = data;
		this.ctx = ctx;
	}

	public build(parent: HTMLElement) {
		const learnMoreBody = parent.createEl("div", {cls: "ds-nt-learn-more-body"});
		learnMoreBody.createEl("p", {text: "If the heroes want to learn one of the NPC’s motivations or pitfalls, a hero can make the following test while interacting with the NPC during the negotiation. After this test is made, the heroes can’t make another test to determine the same NPC’s motivations or pitfalls until they make an argument to the NPC or the negotiation ends."});
		this.buildPowerRoll(learnMoreBody);
	}

	private buildPowerRoll(parent: HTMLDivElement) {
		const argPowerRoll = parent.createEl("div", {cls: "ds-nt-argument-power-roll"});

		const typeContainer = argPowerRoll.createEl("div", {cls: "ability-detail-line pr-roll-line"});
		typeContainer.createEl("span", {cls: "ability-roll-value", text: "Power Roll + Reason, Intuition, or Presence"});

		const t1Container = argPowerRoll.createEl("div", {cls: "ability-detail-line pr-tier-line pr-tier-1-line"});
		PowerRollEffectView.tier1Key(t1Container);
		t1Container.createEl("span", {cls: "pr-tier-value pr-tier-1-value", text: LearnMoreView.learnMorePowerRoll.t1});
		const t2Container = argPowerRoll.createEl("div", {cls: "ability-detail-line pr-tier-line pr-tier-2-line"});
		PowerRollEffectView.tier2Key(t2Container);
		t2Container.createEl("span", {cls: "pr-tier-value pr-tier-2-value", text: LearnMoreView.learnMorePowerRoll.t2});
		const t3Container = argPowerRoll.createEl("div", {cls: "ability-detail-line pr-tier-line pr-tier-3-line"});
		PowerRollEffectView.tier3Key(t3Container);
		t3Container.createEl("span", {cls: "pr-tier-value pr-tier-3-value", text: LearnMoreView.learnMorePowerRoll.t3});
	}
}
