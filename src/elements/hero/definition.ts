// D7 Task 7 (spec §3.1/§3.6, OD-1/OD-2) — ds-hero ElementDefinition: model + schema +
// parse/serialize wiring only. No view yet (Task 9 replaces the stub below) and NOT
// registered anywhere (plan-18 Task 7 brief: "the element is not registered until Task
// 9") — main.ts's registerFrameworkElementDefinitions() intentionally does not import
// this file. Deliberately no `resolveRefs`/`autoResolveRefs:true` (recon delta 2): Task 8
// owns selective compendium resolution (class/kit/ancestry) at the view level.
import type { ElementDefinition } from '@/framework/registry';
import heroSchemaYaml from './schema.yaml';
import heroExample from './example.yaml';
import { parse, serialize } from './model';
import type { HeroModel } from './model';

export const heroElement: ElementDefinition<HeroModel> = {
	id: 'hero',
	name: 'Hero sheet',
	aliases: ['ds-hero'],
	shape: 'persisted',
	schema: heroSchemaYaml,
	autoResolveRefs: false, // selective resolution is Task 8's resolveRefs, not this task
	parse,
	serialize,
	createView: () => {
		throw new Error('ds-hero view not yet implemented — see D7 plan-18 Task 9.');
	},
	authoring: { example: heroExample },
};
