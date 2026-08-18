// D7 Task 2 (spec §4.4) — ds-conditions ElementDefinition: the single-actor conditions
// strip, the smallest new persisted element (D7 build sequence step D7.1) — proves
// condition-engine reuse (§2.4) standalone, ahead of the ds-hero flagship where
// ConditionsPanel becomes the Conditions slot (§2.3).
import type { ElementDefinition } from '@/framework/registry';
import type { ElementChrome } from '@/framework/chrome/types';
import conditionsSchemaYaml from './schema.yaml';
import conditionsExample from './example.yaml';
import { parse, serialize } from './model';
import type { ConditionsModel } from './model';
import { ConditionsPanelContainer } from './view';

/**
 * SC-169 ROLLOUT wave 2 — the COUNT case. A conditions panel has no name of its own; the
 * one fact worth a folded line is how many conditions are riding on the hero right now
 * ("CONDITIONS (2)"). Zero is reported as `(0)` rather than suppressed: "no conditions" is
 * exactly the state a reader wants confirmed, and a bare "CONDITIONS" would read as an
 * element that failed to summarise itself.
 */
const conditionsChrome: ElementChrome<ConditionsModel> = {
	summary: ({ model }) => ({ label: 'Conditions', detail: String(model.conditions.length) }),
};

export const conditionsElement: ElementDefinition<ConditionsModel> = {
	id: 'conditions',
	name: 'Conditions',
	aliases: ['ds-conditions', 'ds-cond'],
	shape: 'persisted',
	schema: conditionsSchemaYaml,
	autoResolveRefs: false, // condition keys/colors/effects are opaque strings, not refs
	parse,
	serialize,
	createView: (cx) => new ConditionsPanelContainer(cx),
	chrome: conditionsChrome,
	authoring: { example: conditionsExample },
};
