// D1 Task 1 (Plan 03) / F1 §6 step 1 — Horizontal Rule: the FIRST element migrated onto
// Framework v2, proving registry + pipeline + error card end-to-end and killing the first
// Vue component (HorizontalRule.vue).
//
// Static, zero-config: there is nothing to configure, so `parse` ignores its input
// entirely and returns no model (mirrors the legacy Vue SFC, which took no props/data).
// `noClickShield: true` preserves the legacy behavior exactly — HorizontalRule.vue (like
// every Vue-mounted element) never armed a capture-phase mousedown/pointerdown shield; that
// shield is a DOM-processor convention (FeatureProcessor.ts et al., F1 §1.4/§2.4) this
// element never had, so opting out keeps behavior byte-identical rather than introducing a
// new listener no user-facing bug ever required.
import type { ElementDefinition } from '@/framework/registry';
import { HorizontalRuleView } from './view';
import horizontalRuleExample from './example.yaml';

export const horizontalRuleElement: ElementDefinition<void> = {
	id: 'horizontal-rule',
	name: 'Horizontal rule',
	aliases: ['ds-hr', 'ds-horizontal-rule'],
	shape: 'static',
	parse: () => undefined,
	autoResolveRefs: false,
	noClickShield: true,
	createView: (cx) => new HorizontalRuleView(cx),
	authoring: { example: horizontalRuleExample },
};
