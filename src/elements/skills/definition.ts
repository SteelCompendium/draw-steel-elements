// D1 Task 2 (Plan 03) / F1 §6 step "Skills" — the second element migrated onto Framework
// v2 and the first *interactive* one (F1 §1.3): collapse state (whole-element wrapper +
// per-group) lives in SessionStore, never written back to the note — Skills has no
// `serialize`, matching the legacy Vue element's "no writeback" contract exactly.
import type { ElementDefinition } from '@/framework/registry';
import type { ElementChrome } from '@/framework/chrome/types';
import { Skills } from '@model/Skills';
import skillsSchemaYaml from '@model/schemas/SkillsSchema.yaml';
import { parse } from './model';
import { SkillsView } from './view';
import skillsExample from './example.yaml';

/**
 * SC-169 ROLLOUT wave 2 — the COUNT case, worded because the bare number would be
 * ambiguous: a skills list shows both the skills the hero HAS and (unless
 * `only_show_selected`) the ones they do not, so "SKILLS (12)" could mean either.
 * "(12 selected)" cannot. Custom skills count when they are marked as had, exactly as the
 * rendered list marks them.
 */
const skillsChrome: ElementChrome<Skills> = {
	summary: ({ model }) => {
		const selected = model.skills.length + model.custom_skills.filter((s) => s.has_skill).length;
		return { label: 'Skills', detail: `${selected} selected` };
	},
};

export const skillsElement: ElementDefinition<Skills> = {
	id: 'skills',
	name: 'Skills',
	aliases: ['ds-skills'],
	shape: 'interactive',
	schema: skillsSchemaYaml,
	autoResolveRefs: false,
	parse,
	createView: (cx) => new SkillsView(cx),
	chrome: skillsChrome,
	// SC-169 ROLLOUT — the SECOND definition to set this (with `ds-stamina`), for exactly the
	// reason registry.ts's field doc predicted: `collapsible:` / `collapse_default:` are
	// ComponentWrapper MODEL fields here (SkillsSchema.yaml `$ref`s component-wrapper-1.0.0,
	// `Skills extends ComponentWrapper`, and `SkillsView` reads them for its own wrapper). The
	// framework READS them as the authored collapse contract for the panel, but popping them
	// off the body would hide them from `def.parse` and let ComponentWrapper substitute its own
	// `?? true` / `?? false`.
	collapseKeysOwnedByModel: true,
	authoring: { example: skillsExample },
};
