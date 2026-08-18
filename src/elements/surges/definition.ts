// D7 Task 5 (spec §4.3) — ds-surges ElementDefinition: the trivial surge tracker, the
// smallest hero-suite standalone proving-ground — proves the surge slice the flagship
// ds-hero sheet and D5's roll bridge share (spec §2.3's composition table: "Surges |
// SurgePanel (from ds-surges, §4.3) | {surges, highestCharacteristic}").
import type { ElementDefinition } from '@/framework/registry';
import type { ElementChrome } from '@/framework/chrome/types';
import surgesSchemaYaml from './schema.yaml';
import surgesExample from './example.yaml';
import { parse, serialize } from './model';
import type { SurgeModel } from './model';
import { SurgePanelContainer } from './view';

/**
 * SC-169 ROLLOUT wave 2 — the COUNT case. A surge pool is one number; that number is the
 * whole element ("SURGES (3)").
 */
const surgesChrome: ElementChrome<SurgeModel> = {
	summary: ({ model }) => ({ label: 'Surges', detail: String(model.surges) }),
};

export const surgesElement: ElementDefinition<SurgeModel> = {
	id: 'surges',
	name: 'Surges',
	aliases: ['ds-surges'],
	shape: 'persisted',
	schema: surgesSchemaYaml,
	autoResolveRefs: false, // surge count / highest-characteristic are plain numbers, no refs
	parse,
	serialize,
	createView: (cx) => new SurgePanelContainer(cx),
	chrome: surgesChrome,
	authoring: { example: surgesExample },
};
