// D7 Task 5 (spec §4.3) — ds-surges ElementDefinition: the trivial surge tracker, the
// smallest hero-suite standalone proving-ground — proves the surge slice the flagship
// ds-hero sheet and D5's roll bridge share (spec §2.3's composition table: "Surges |
// SurgePanel (from ds-surges, §4.3) | {surges, highestCharacteristic}").
import type { ElementDefinition } from '@/framework/registry';
import surgesSchemaYaml from './schema.yaml';
import surgesExample from './example.yaml';
import { parse, serialize } from './model';
import type { SurgeModel } from './model';
import { SurgePanelContainer } from './view';

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
	authoring: { example: surgesExample },
};
