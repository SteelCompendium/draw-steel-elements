// Plan 07 Task 2 / F1 §6 step 6 — Featureblock: second of the Plan 07 static batch,
// retiring the legacy FeatureblockProcessor. The migration deleted ONLY that processor
// at the time; the featureblock sub-views (FeatureblockView, FeatureblockStatsView) and
// everything they composed (Common/HeaderView, Common/BoldKeyWithValueView,
// Common/horizontalRuleProcessor's static build, Features/FeaturesView -> FeatureView)
// were later retired too — Plan 09 Task 6 moved the last consumers onto the kit
// grammar and Task 10 deleted them.
//
// Static + SDK-backed: no schema (the SDK reader is the validator, same as legacy), no
// serialize (nothing persists), no ref resolution (autoResolveRefs stays false — the
// block body is self-contained YAML). The pipeline's default click shield replaces the
// processor's manual capture-phase mousedown/pointerdown stop, so noClickShield stays
// unset.
import type { ElementDefinition } from '@/framework/registry';
import { FeatureblockConfig } from '@model/FeatureblockConfig';
import { FeatureblockElementView } from './view';

export const featureblockElement: ElementDefinition<FeatureblockConfig> = {
	id: 'featureblock',
	name: 'Featureblock',
	aliases: ['ds-fb', 'ds-featureblock'],
	shape: 'static',
	// RAW-text parse, NOT the pipeline's pre-parsed `data`: FeatureblockConfig.readYaml
	// runs the SDK's Featureblock.read(new YamlReader(...), raw) — exactly the SDK-reader
	// case ElementDefinition.parse's `raw` parameter exists for. Reused verbatim from the
	// legacy processor.
	parse: (_data, raw) => FeatureblockConfig.readYaml(raw),
	autoResolveRefs: false,
	createView: (cx) => new FeatureblockElementView(cx),
};
