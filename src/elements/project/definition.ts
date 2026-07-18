// D8 Task 7 (spec §5) — Project/Downtime tracker on Framework v2. Persisted shape; NO
// schema (a brand-new element with no legacy predecessor to match — same convention as
// encounter/montage/negotiation/counter: validation is skipped by the pipeline when
// schema is omitted, F1 §2.4 step 3). Optional D6 dep is resolved live by the VIEW
// (goal_code -> CompendiumIndex.getEntity), never by autoResolveRefs — this is a single
// inline field the block's own author sets, not a whole-block reference.
import type { ElementDefinition } from '@/framework/registry';
import type { ProjectModel } from './model';
import { parse, serialize } from './model';
import { ProjectView } from './view';
import projectExample from './example.yaml';

export const projectElement: ElementDefinition<ProjectModel> = {
	id: 'project',
	name: 'Project / Downtime tracker',
	aliases: ['ds-project'],
	shape: 'persisted',
	autoResolveRefs: false, // self-contained tracker; goal_code is resolved live by the view
	parse,
	serialize,
	createView: (cx) => new ProjectView(cx),
	authoring: { example: projectExample },
};
