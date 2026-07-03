import {Plugin} from "obsidian";

// The signature keeps the generic Obsidian `Plugin` parameter (unused now — see below)
// so main.ts's call site stays untouched until the whole file is deleted.
export function registerElements (_plugin: Plugin) {

	// EMPTY ON PURPOSE — the D-wave element migration is complete (Plan 07 Task 5): all
	// 11 elements (Horizontal Rule, Values Row, Characteristics, Skills, Stamina Bar,
	// Feature, Featureblock, Statblock, Counter, Negotiation Tracker, Initiative Tracker)
	// are registered onto Framework v2 via registerFrameworkElementDefinitions +
	// registerFrameworkElements in main.ts's onload(). This function registers NOTHING;
	// it (and its onload() call) are kept only until the F1 §6 step-10 cleanup deletes
	// the legacy registration path entirely.

	// Feature migrated to Framework v2 (Plan 07 Task 1, F1 §6 step 5). Its sub-views
	// (Features/FeatureView et al.) stay put: the Featureblock/Statblock element views
	// still construct them directly.

	// Featureblock migrated to Framework v2 (Plan 07 Task 2, F1 §6 step 6). Its sub-views
	// (featureblock/FeatureblockView et al.) stay put: the Statblock element view still
	// constructs several of the shared ones directly.

	// Horizontal Rule migrated to Framework v2 (D1 Task 1, F1 §6 step 1).

	// Initiative Tracker migrated to Framework v2 (Plan 06, F1 §6 step 9).

	// Negotiation Tracker migrated to Framework v2 (Plan 05, F1 §6 step 8).

	// Statblock migrated to Framework v2 (Plan 07 Task 3, F1 §6 step 6). The sub-views its
	// buildUI composed (Common/HeaderView, statblock/StatsView, Features/FeaturesView,
	// horizontalRuleProcessor) stay put — the statblock element view constructs them
	// directly.

	// Stamina Bar migrated to Framework v2 (D1 Task 3, F1 §6 step 4). Last Vue element
	// migrated; Vue is now unused at runtime.

	// Counter migrated to Framework v2 (Plan 07 Task 4, F1 §6 step 7). The legacy
	// Counter/CounterProcessor.ts and Counter/CounterView.ts are deleted (logic ported
	// into src/elements/counter/view.ts).

	// Characteristics migrated to Framework v2 (Plan 07 Task 5, F1 §6 step 2). The legacy
	// CharacteristicsProcessor is deleted; Characteristics/CharacteristicsView stays,
	// reused by src/elements/characteristics/view.ts.

	// Skills migrated to Framework v2 (D1 Task 2, F1 §6 step 3).

	// Values Row migrated to Framework v2 (Plan 07 Task 5, F1 §6 step 2). The legacy
	// ValuesRowProcessor is deleted; ValuesRow/ValuesRowView stays, reused by
	// src/elements/values-row/view.ts.
}
