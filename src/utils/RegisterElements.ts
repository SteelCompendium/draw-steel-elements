import {Plugin} from 'obsidian';

import {InitiativeProcessor} from "@drawSteelAdmonition/initiativeProcessor";
import {NegotiationTrackerProcessor} from "@drawSteelAdmonition/negotiation/NegotiationTrackerProcessor";
import {StatblockProcessor} from "@drawSteelAdmonition/statblock/StatblockProcessor";
import { FeatureProcessor } from "@drawSteelAdmonition/Features/FeatureProcessor";
import { FeatureblockProcessor } from "@drawSteelAdmonition/featureblock/FeatureblockProcessor";
import { StaminaBarProcessor } from "@drawSteelAdmonition/StaminaBar/StaminaBarProcessor";
import {CharacteristicsProcessor} from "@drawSteelAdmonition/Characteristics/CharacteristicsProcessor";
import {ValuesRowProcessor} from "@drawSteelAdmonition/ValuesRow/ValuesRowProcessor";
import { genericComponentProcessor } from "./ComponentProcessor";
import { GenericElementProcessor } from "@drawSteelAdmonition/GenericElementProcessor";
import {CounterView} from "@drawSteelAdmonition/Counter/CounterView";

import HorizontalRule from "@drawSteelComponents/HorizontalRule.vue"
import SkillList from "@drawSteelComponents/SkillList/SkillList.vue";
import StaminaBar from "@drawSteelComponents/StaminaBar/StaminaBar.vue";

import { Skills as SkillsModel } from "@model/Skills";
import { StaminaBar as StaminaBarModel } from '@/model/StaminaBar';
import { Counter as CounterModel } from '@model/Counter';

export function registerElements (plugin: Plugin) {

	const abilityProcessor = new FeatureProcessor(plugin);
	plugin.registerMarkdownCodeBlockProcessor("ds-ft", abilityProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-feat", abilityProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-feature", abilityProcessor.handler);

	const fbProcessor = new FeatureblockProcessor(plugin);
	plugin.registerMarkdownCodeBlockProcessor("ds-fb", fbProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-featureblock", fbProcessor.handler);

	const hrProcessor = new genericComponentProcessor(plugin, HorizontalRule, undefined, "Horizontal Rule", true);
	plugin.registerMarkdownCodeBlockProcessor("ds-hr", hrProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-horizontal-rule", hrProcessor.handler);

	const initProcessor = new InitiativeProcessor(plugin);
	plugin.registerMarkdownCodeBlockProcessor("ds-it", initProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-init", initProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-initiative", initProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-initiative-tracker", initProcessor.handler);

	let ntProcessor = new NegotiationTrackerProcessor(plugin.app);
	plugin.registerMarkdownCodeBlockProcessor("ds-nt", ntProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-negotiation", ntProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-negotiation-tracker", ntProcessor.handler);

	let sbProcessor = new StatblockProcessor(plugin);
	plugin.registerMarkdownCodeBlockProcessor("ds-sb", sbProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-statblock", sbProcessor.handler);

	let staminaBarProcessor = new genericComponentProcessor(plugin, StaminaBar, StaminaBarModel, "Stamina Bar", true);
	plugin.registerMarkdownCodeBlockProcessor("ds-stam", staminaBarProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-stamina", staminaBarProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-stamina-bar", staminaBarProcessor.handler);

	let counterProcessor = new GenericElementProcessor<CounterView>(plugin, CounterView, CounterModel, "Counter Element");
	plugin.registerMarkdownCodeBlockProcessor("ds-ct", counterProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-counter", counterProcessor.handler);

	let charProcessor = new CharacteristicsProcessor(plugin);
	plugin.registerMarkdownCodeBlockProcessor("ds-char", charProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-characteristics", charProcessor.handler);

	let skillListProcessor = new genericComponentProcessor(plugin, SkillList, SkillsModel, "Skill List");
	plugin.registerMarkdownCodeBlockProcessor("ds-skills", skillListProcessor.handler);

	let valRowProcessor = new ValuesRowProcessor(plugin);
	plugin.registerMarkdownCodeBlockProcessor("ds-vr", valRowProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-value-row", valRowProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-values-row", valRowProcessor.handler);
}
