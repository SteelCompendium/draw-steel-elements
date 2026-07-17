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
import { withReference } from '@/elements/shared/withReference';
import { FeatureblockConfig } from '@model/FeatureblockConfig';
import { FeatureblockElementView } from './view';
import featureblockExample from './example.yaml';

// D6 Task 4 (spec §1, §7) — the block body may be inline YAML (unchanged, below) OR a
// whole-block reference (scc:/scc.v1:/bare-slug/@path/[[wikilink]]) to a compendium
// featureblock file, resolved by withReference/RefUnwrapView. This base def is
// UNTOUCHED from the pre-D6 shape; only the exported `featureblockElement` changes.
const baseFeatureblockElement: ElementDefinition<FeatureblockConfig> = {
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
	authoring: { example: featureblockExample, sdkModel: 'featureblock' },
};

// Bare-slug scope (§1.3): any `<family>.featureblock` type (e.g.
// monster.angulotl.featureblock), matching TYPE_ADAPTERS' featureblock entry.
export const featureblockElement = withReference(baseFeatureblockElement, { sccType: /featureblock$/ });
