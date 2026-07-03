import {StatblockProcessor} from "@drawSteelAdmonition/statblock/StatblockProcessor";
import { FeatureProcessor } from "@drawSteelAdmonition/Features/FeatureProcessor";
import { FeatureblockProcessor } from "@drawSteelAdmonition/featureblock/FeatureblockProcessor";
import {CounterProcessor} from "@drawSteelAdmonition/Counter/CounterProcessor";
import {CharacteristicsProcessor} from "@drawSteelAdmonition/Characteristics/CharacteristicsProcessor";
import {ValuesRowProcessor} from "@drawSteelAdmonition/ValuesRow/ValuesRowProcessor";
import {Plugin} from "obsidian";

// `plugin` is the generic Obsidian `Plugin`: every remaining legacy processor here only
// needs `Plugin`/`App`. (It was the concrete DrawSteelAdmonitionPlugin until Plan 06
// Task 5, solely because the since-retired InitiativeProcessor's constructor required it.)
export function registerElements (plugin: Plugin) {

	const abilityProcessor = new FeatureProcessor(plugin);
	plugin.registerMarkdownCodeBlockProcessor("ds-ft", abilityProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-feat", abilityProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-feature", abilityProcessor.handler);

	const fbProcessor = new FeatureblockProcessor(plugin);
	plugin.registerMarkdownCodeBlockProcessor("ds-fb", fbProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-featureblock", fbProcessor.handler);

	// Horizontal Rule migrated to Framework v2 (D1 Task 1, F1 §6 step 1) — registered via
	// registerFrameworkElements(plugin, frameworkV2) in main.ts's onload() instead.

	// Initiative Tracker migrated to Framework v2 (Plan 06, F1 §6 step 9) — registered via
	// registerFrameworkElements(plugin, frameworkV2) in main.ts's onload() instead.

	// Negotiation Tracker migrated to Framework v2 (Plan 05, F1 §6 step 8) — registered via
	// registerFrameworkElements(plugin, frameworkV2) in main.ts's onload() instead.

	let sbProcessor = new StatblockProcessor(plugin);
	plugin.registerMarkdownCodeBlockProcessor("ds-sb", sbProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-statblock", sbProcessor.handler);

	// Stamina Bar migrated to Framework v2 (D1 Task 3, F1 §6 step 4) — registered via
	// registerFrameworkElements(plugin, frameworkV2) in main.ts's onload() instead. Last
	// Vue element migrated; Vue is now unused at runtime.

	let counterProcessor = new CounterProcessor(plugin);
	plugin.registerMarkdownCodeBlockProcessor("ds-ct", counterProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-counter", counterProcessor.handler);

	let charProcessor = new CharacteristicsProcessor(plugin);
	plugin.registerMarkdownCodeBlockProcessor("ds-char", charProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-characteristics", charProcessor.handler);

	// Skills migrated to Framework v2 (D1 Task 2, F1 §6 step 3) — registered via
	// registerFrameworkElements(plugin, frameworkV2) in main.ts's onload() instead.

	let valRowProcessor = new ValuesRowProcessor(plugin);
	plugin.registerMarkdownCodeBlockProcessor("ds-vr", valRowProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-value-row", valRowProcessor.handler);
	plugin.registerMarkdownCodeBlockProcessor("ds-values-row", valRowProcessor.handler);
}
