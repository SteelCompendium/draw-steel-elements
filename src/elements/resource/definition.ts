// D7 Task 3 (spec §4.1) — ds-resource ElementDefinition: the class-aware heroic resource
// tracker, the second hero-suite standalone proving-ground (after ds-conditions) — proves
// the static RESOURCE_BY_CLASS class-defaulting seam ahead of the ds-hero flagship where
// ResourcePanel becomes the Heroic Resource slot (spec §2.3).
import type { ElementDefinition } from '@/framework/registry';
import resourceSchemaYaml from './schema.yaml';
import resourceExample from './example.yaml';
import { parse, serialize } from './model';
import type { ResourceModel } from './model';
import { ResourcePanelContainer } from './view';

export const resourceElement: ElementDefinition<ResourceModel> = {
	id: 'heroic-resource',
	name: 'Heroic resource',
	aliases: ['ds-resource'],
	shape: 'persisted',
	schema: resourceSchemaYaml,
	parse,
	serialize,
	createView: (cx) => new ResourcePanelContainer(cx),
	authoring: { example: resourceExample },
};
