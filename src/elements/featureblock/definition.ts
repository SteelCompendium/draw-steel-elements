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
import type { ElementChrome } from '@/framework/chrome/types';
import { FEATUREBLOCK_TYPE_RE } from '@/services/typeAdapters';
import { FeatureblockConfig } from '@model/FeatureblockConfig';
import { FeatureblockElementView } from './view';
import featureblockExample from './example.yaml';

/**
 * SC-169 ROLLOUT wave 1 — the NAME case with one useful number. A featureblock is a set of
 * features under a title, and the count is the one figure a reader wants from a folded card
 * ("FEATUREBLOCK: Shadow Tricks (4)"); the individual feature names are what the expanded
 * card is for.
 */
const featureblockChrome: ElementChrome<FeatureblockConfig> = {
	summary: ({ model }) => ({
		label: 'Featureblock',
		name: model.featureblock.name || undefined,
		detail: model.featureblock.features?.length ? String(model.featureblock.features.length) : undefined,
	}),
};

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
	chrome: featureblockChrome,
	authoring: { example: featureblockExample, sdkModel: 'featureblock' },
};

// Bare-slug scope (§1.3): THE shared featureblock `type` scope from typeAdapters.ts, not a
// local copy — any `<family>.featureblock` (e.g. monster.angulotl.featureblock) PLUS the
// `dynamic-terrain` family, whose 35 corpus files are ds-fb content that no adapter claimed
// before SC-141's fix round (M2). See FEATUREBLOCK_TYPE_RE's doc comment.
export const featureblockElement = withReference(baseFeatureblockElement, { sccType: FEATUREBLOCK_TYPE_RE });
