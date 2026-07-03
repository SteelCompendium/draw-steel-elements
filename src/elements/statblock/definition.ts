// Plan 07 Task 3 / F1 §6 step 6 — Statblock: third of the Plan 07 static batch, retiring
// the legacy StatblockProcessor. The migration deletes ONLY that processor: the sub-views
// its buildUI composed (Common/HeaderView, statblock/StatsView,
// Common/horizontalRuleProcessor's static build, Features/FeaturesView -> FeatureView,
// plus the FeatureConfig model) all stay in place — the element view constructs them
// directly (see view.ts; Statblock never had a legacy view class of its own).
//
// Static + SDK-backed: no schema (the SDK reader is the validator, same as legacy), no
// serialize (nothing persists), no ref resolution (autoResolveRefs stays false — the
// block body is self-contained YAML; StatblockConfig.readYaml is a pure SDK parse). The
// pipeline's default click shield replaces the processor's manual capture-phase
// mousedown/pointerdown stop, so noClickShield stays unset.
import type { ElementDefinition } from '@/framework/registry';
import { StatblockConfig } from '@model/StatblockConfig';
import { StatblockElementView } from './view';

export const statblockElement: ElementDefinition<StatblockConfig> = {
	id: 'statblock',
	name: 'Statblock',
	aliases: ['ds-sb', 'ds-statblock'],
	shape: 'static',
	// RAW-text parse, NOT the pipeline's pre-parsed `data`: StatblockConfig.readYaml runs
	// the SDK's Statblock.read(new YamlReader(...), raw) — exactly the SDK-reader case
	// ElementDefinition.parse's `raw` parameter exists for. Reused verbatim from the
	// legacy processor.
	parse: (_data, raw) => StatblockConfig.readYaml(raw),
	autoResolveRefs: false,
	createView: (cx) => new StatblockElementView(cx),
};
