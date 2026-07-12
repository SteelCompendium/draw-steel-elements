// D1 Task 2 (Plan 03) / F1 §6 step "Skills" — the second element migrated onto Framework
// v2 and the first *interactive* one (F1 §1.3): collapse state (whole-element wrapper +
// per-group) lives in SessionStore, never written back to the note — Skills has no
// `serialize`, matching the legacy Vue element's "no writeback" contract exactly.
import type { ElementDefinition } from '@/framework/registry';
import { Skills } from '@model/Skills';
import skillsSchemaYaml from '@model/schemas/SkillsSchema.yaml';
import { parse } from './model';
import { SkillsView } from './view';
import skillsExample from './example.yaml';

export const skillsElement: ElementDefinition<Skills> = {
	id: 'skills',
	name: 'Skills',
	aliases: ['ds-skills'],
	shape: 'interactive',
	schema: skillsSchemaYaml,
	autoResolveRefs: false,
	parse,
	createView: (cx) => new SkillsView(cx),
	authoring: { example: skillsExample },
};
