// D1 Task 3 (Plan 03) / F1 §6 step "Stamina Bar" — the first *persisted* element on
// Framework v2 and the LAST Vue element (unblocks Vue teardown, D1 step 4).
import type { ElementDefinition } from '@/framework/registry';
import { StaminaBar } from '@model/StaminaBar';
import staminaBarSchemaYaml from '@model/schemas/StaminaBarSchema.yaml';
import { parse, serialize } from './model';
import { StaminaBarView } from './view';
import staminaExample from './example.yaml';

export const staminaBarElement: ElementDefinition<StaminaBar> = {
	id: 'stamina-bar',
	name: 'Stamina bar',
	aliases: ['ds-stam', 'ds-stamina', 'ds-stamina-bar'],
	shape: 'persisted',
	schema: staminaBarSchemaYaml,
	autoResolveRefs: false,
	parse,
	serialize,
	createView: (cx) => new StaminaBarView(cx),
	authoring: { example: staminaExample },
};
