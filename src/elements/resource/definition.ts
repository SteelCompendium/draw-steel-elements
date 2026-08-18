// D7 Task 3 (spec §4.1) — ds-resource ElementDefinition: the class-aware heroic resource
// tracker, the second hero-suite standalone proving-ground (after ds-conditions) — proves
// the static RESOURCE_BY_CLASS class-defaulting seam ahead of the ds-hero flagship where
// ResourcePanel becomes the Heroic Resource slot (spec §2.3).
import type { ElementDefinition } from '@/framework/registry';
import type { ElementChrome } from '@/framework/chrome/types';
import { resolveResource } from './resourceByClass';
import resourceSchemaYaml from './schema.yaml';
import resourceExample from './example.yaml';
import { parse, serialize } from './model';
import type { ResourceModel } from './model';
import { ResourcePanelContainer } from './view';

/**
 * SC-169 ROLLOUT wave 2 — the NAME + KEY-DATA case, and the spec's own worked example
 * ("Resource: Ferocity (4)"). The name is the RESOLVED resource name, not the raw `type:`
 * key: an author who wrote only `class: fury` never typed "Ferocity" anywhere, and the
 * expanded panel titles itself through the same `resolveResource` call, so the folded line
 * and the open one always agree.
 */
const resourceChrome: ElementChrome<ResourceModel> = {
	summary: ({ model }) => ({
		label: 'Resource',
		name: resolveResource(model.class, { type: model.type }).type,
		detail: String(model.current),
	}),
};

export const resourceElement: ElementDefinition<ResourceModel> = {
	id: 'heroic-resource',
	name: 'Heroic resource',
	aliases: ['ds-resource'],
	shape: 'persisted',
	schema: resourceSchemaYaml,
	parse,
	serialize,
	createView: (cx) => new ResourcePanelContainer(cx),
	chrome: resourceChrome,
	authoring: { example: resourceExample },
};
