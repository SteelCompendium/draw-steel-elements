// D1 Task 3 (Plan 03) / F1 §6 step "Stamina Bar" — the first *persisted* element on
// Framework v2 and the LAST Vue element (unblocks Vue teardown, D1 step 4).
import type { ElementDefinition } from '@/framework/registry';
import { StaminaBar } from '@model/StaminaBar';
import staminaBarSchemaYaml from '@model/schemas/StaminaBarSchema.yaml';
import { parse, serialize } from './model';
import { StaminaBarView } from './view';
import staminaExample from './example.yaml';
import type { ElementChrome } from '@/framework/chrome/types';

/**
 * SC-169 prototype element #3 — the KEY-DATA case from Scott's description
 * ("Stamina: Frodo Baggins (22/48)"). A standalone `ds-stamina` block carries no name of
 * its own (the model is max/current/temp/recoveries), so the collapsed line reads
 * "Stamina (31/48)": label + the two numbers that are the whole point of the element.
 * Temp stamina is deliberately NOT folded in — it is a third number and the one-line form
 * has room for the pair a reader actually scans for.
 */
const staminaBarChrome: ElementChrome<StaminaBar> = {
	summary: ({ model }) => ({
		label: 'Stamina',
		detail: `${model.current_stamina ?? 0}/${model.max_stamina ?? 0}`,
	}),
};

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
	chrome: staminaBarChrome,
	// SC-169 round 2 (Scott's ruling 2, backward compatibility): `collapsible:` and
	// `collapse_default:` are ComponentWrapper MODEL fields on this element — in the schema,
	// on the model, re-emitted by its own serializer. The framework reads them as the
	// authored collapse contract but must not pop them off the block body. See
	// framework/chrome/collapsedKey.ts.
	collapseKeysOwnedByModel: true,
	authoring: { example: staminaExample },
};
