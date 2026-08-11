// Plan 07 Task 3 / F1 §6 step 6 — Statblock: third of the Plan 07 static batch, retiring
// the legacy StatblockProcessor. The migration deleted ONLY that processor at the time;
// the sub-views its buildUI composed (Common/HeaderView, statblock/StatsView,
// Common/horizontalRuleProcessor's static build, Features/FeaturesView -> FeatureView)
// were later retired too — Plan 09 Task 6b moved the view onto the kit card grammar and
// Task 10 deleted them (Statblock never had a legacy view class of its own; the
// FeatureConfig model stays).
//
// Static + SDK-backed: no schema (the SDK reader is the validator, same as legacy), no
// serialize (nothing persists), no ref resolution (autoResolveRefs stays false — the
// block body is self-contained YAML; StatblockConfig.readYaml is a pure SDK parse). The
// pipeline's default click shield replaces the processor's manual capture-phase
// mousedown/pointerdown stop, so noClickShield stays unset.
import type { ElementDefinition } from '@/framework/registry';
import { withReference } from '@/elements/shared/withReference';
import { STATBLOCK_TYPE_RE } from '@/services/typeAdapters';
import { StatblockConfig } from '@model/StatblockConfig';
import { StatblockElementView } from './view';
import statblockExample from './example.yaml';

// D6 Task 4 (spec §1, §7) — the block body may be inline YAML (unchanged, below) OR a
// whole-block reference (scc:/scc.v1:/bare-slug/@path/[[wikilink]]) to a compendium
// statblock file, resolved by withReference/RefUnwrapView. This base def is
// UNTOUCHED from the pre-D6 shape; only the exported `statblockElement` changes.
const baseStatblockElement: ElementDefinition<StatblockConfig> = {
	id: 'statblock',
	name: 'Statblock',
	aliases: ['ds-sb', 'ds-statblock'],
	shape: 'static',
	// RAW-text parse, NOT the pipeline's pre-parsed `data`: StatblockConfig.readYaml parses
	// `raw` with Obsidian's `parseYaml`, applies the OD-4 legacy-key shim, then feeds the
	// SDK's Statblock.modelDTOAdapter — exactly the SDK-reader case ElementDefinition.parse's
	// `raw` parameter exists for. Reused verbatim from the legacy processor.
	parse: (_data, raw) => StatblockConfig.readYaml(raw),
	autoResolveRefs: false,
	createView: (cx) => new StatblockElementView(cx),
	authoring: { example: statblockExample, sdkModel: 'statblock' },
};

// Bare-slug scope (§1.3): THE shared statblock `type` scope from typeAdapters.ts — any
// `<family>.statblock` (e.g. monster.goblin.statblock) or a bare `statblock`. SC-141 fix
// round (L1): this used to be a hand-copied `/statblock$/`, which is LOOSER than the
// exported constant it claimed to match (it also accepts `notastatblock`). No corpus type
// exploited the gap, but a local copy claiming in a comment to match TYPE_ADAPTERS while
// quietly differing from it is precisely the setup that produced SC-141.
export const statblockElement = withReference(baseStatblockElement, { sccType: STATBLOCK_TYPE_RE });
