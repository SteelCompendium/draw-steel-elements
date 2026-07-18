// D7 Task 2 (spec §4.4) — ds-conditions ElementDefinition: the single-actor conditions
// strip, the smallest new persisted element (D7 build sequence step D7.1) — proves
// condition-engine reuse (§2.4) standalone, ahead of the ds-hero flagship where
// ConditionsPanel becomes the Conditions slot (§2.3).
import type { ElementDefinition } from '@/framework/registry';
import conditionsSchemaYaml from './schema.yaml';
import conditionsExample from './example.yaml';
import { parse, serialize } from './model';
import type { ConditionsModel } from './model';
import { ConditionsPanelContainer } from './view';

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
	authoring: { example: conditionsExample },
};
