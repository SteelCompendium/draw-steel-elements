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
import { withReference } from '@/elements/shared/withReference';
import { FEATURE_TYPE_RE } from '@/services/typeAdapters';
import { FeatureConfig } from '@model/FeatureConfig';
import { FeatureElementView } from './view';
import featureExample from './example.yaml';

// D6 Task 4 (spec §1, §7) — the block body may be inline YAML (unchanged, below) OR a
// whole-block reference (scc:/scc.v1:/bare-slug/@path/[[wikilink]]) to a compendium
// feature file, resolved by withReference/RefUnwrapView. This base def is UNTOUCHED
// from the pre-D6 shape; only the exported `featureElement` changes.
const baseFeatureElement: ElementDefinition<FeatureConfig> = {
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
	authoring: { example: featureExample, sdkModel: 'feature' },
};

// Bare-slug scope (§1.3): THE shared ds-feature `type` scope from typeAdapters.ts, not a
// local copy — SC-141 (a local `/^feature($|\.)/` here excluded the `type: ability` and
// `type: trait` files that make up most of the family; see FEATURE_TYPE_RE's doc comment).
// TYPE_ADAPTERS' statblock/featureblock entries precede the feature entry there, so this
// never shadows them.
export const featureElement = withReference(baseFeatureElement, { sccType: FEATURE_TYPE_RE });
