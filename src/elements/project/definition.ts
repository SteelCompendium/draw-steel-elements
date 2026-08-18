// D8 Task 7 (spec §5) — Project/Downtime tracker on Framework v2. Persisted shape; NO
// schema (a brand-new element with no legacy predecessor to match — same convention as
// encounter/montage/negotiation/counter: validation is skipped by the pipeline when
// schema is omitted, F1 §2.4 step 3). Optional D6 dep is resolved live by the VIEW
// (goal_code -> CompendiumIndex.getEntity), never by autoResolveRefs — this is a single
// inline field the block's own author sets, not a whole-block reference.
import type { ElementDefinition } from '@/framework/registry';
import type { ElementChrome } from '@/framework/chrome/types';
import type { ProjectModel } from './model';
import { parse, serialize } from './model';
import { ProjectView } from './view';
import projectExample from './example.yaml';

/**
 * SC-169 ROLLOUT wave 2 — a progress bar in one line: points accrued against the goal
 * ("PROJECT: Forge the Blade (12/40)"). A project with no authored `goal_points` reports
 * the accrued total alone rather than an `x/undefined`.
 */
const projectChrome: ElementChrome<ProjectModel> = {
	summary: ({ model }) => ({
		label: 'Project',
		name: model.goal_name || undefined,
		detail: model.goal_points === undefined ? String(model.accrued) : `${model.accrued}/${model.goal_points}`,
	}),
};

export const projectElement: ElementDefinition<ProjectModel> = {
	id: 'project',
	name: 'Project / Downtime tracker',
	aliases: ['ds-project'],
	shape: 'persisted',
	autoResolveRefs: false, // self-contained tracker; goal_code is resolved live by the view
	parse,
	serialize,
	createView: (cx) => new ProjectView(cx),
	chrome: projectChrome,
	authoring: { example: projectExample },
};
