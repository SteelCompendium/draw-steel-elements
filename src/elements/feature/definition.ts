// Plan 07 Task 1 / F1 §6 step 5 — Feature: first of the Plan 07 static batch, retiring
// the legacy FeatureProcessor. Featureblock + Statblock (F1 §6 step 6) REUSE this
// element's sub-view tree (Features/FeatureView -> EffectView -> FeaturesView), so the
// migration deletes ONLY the processor and keeps those sub-views in place.
//
// Static + SDK-backed: no schema (the SDK reader is the validator, same as legacy), no
// serialize (nothing persists), no ref resolution (autoResolveRefs stays false — the
// block body is self-contained YAML). The pipeline's default click shield replaces the
// processor's manual capture-phase mousedown/pointerdown stop, so noClickShield stays
// unset.
import type { ElementDefinition } from '@/framework/registry';
import { FeatureConfig } from '@model/FeatureConfig';
import { FeatureElementView } from './view';

export const featureElement: ElementDefinition<FeatureConfig> = {
	id: 'feature',
	name: 'Feature',
	aliases: ['ds-ft', 'ds-feat', 'ds-feature'],
	shape: 'static',
	// RAW-text parse, NOT the pipeline's pre-parsed `data`: FeatureConfig.readYaml runs
	// the SDK's Feature.read(new YamlReader(...), raw) PLUS its own second parseYaml(raw)
	// pass for the `indent` key — exactly the SDK-reader case ElementDefinition.parse's
	// `raw` parameter exists for. Reused verbatim from the legacy processor.
	parse: (_data, raw) => FeatureConfig.readYaml(raw),
	autoResolveRefs: false,
	createView: (cx) => new FeatureElementView(cx),
};
