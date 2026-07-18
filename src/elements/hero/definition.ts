// D7 Task 7/9 (spec §3.1/§3.6, OD-1/OD-2) — ds-hero ElementDefinition: model + schema +
// parse/serialize + the real view (Task 9 replaces Task 7's throwing stub). Deliberately
// no `resolveRefs`/`autoResolveRefs:true` (recon delta 2): Task 8 owns selective
// compendium resolution (class/kit/ancestry) at the VIEW level (resolve.ts), not here.
import type { ElementDefinition } from '@/framework/registry';
import heroSchemaYaml from './schema.yaml';
import heroExample from './example.yaml';
import { parse, serialize } from './model';
import type { HeroModel } from './model';
import { HeroSheetView } from './view';

export const heroElement: ElementDefinition<HeroModel> = {
	id: 'hero',
	name: 'Hero sheet',
	aliases: ['ds-hero'],
	shape: 'persisted',
	schema: heroSchemaYaml,
	autoResolveRefs: false, // selective resolution is Task 8's resolve.ts, not this task
	parse,
	serialize,
	// `heroElement` is passed to the view itself (constructor injection, not an import
	// from view.ts back to this file) so the sheet's own "Edit definition" affordance can
	// call `openFormEditor(this, cx, heroElement, source, cx.validation)` without a
	// definition.ts <-> view.ts import cycle.
	createView: (cx) => new HeroSheetView(cx, heroElement),
	// D7 Task 9: the pipeline's generic authoringControls pencil is suppressed — the
	// sheet mounts its OWN "Edit definition" header affordance instead (spec §3.2
	// placement, next to `[respite]`).
	noAuthoringButton: true,
	authoring: {
		example: heroExample,
		// task-7-review.md's flagged footgun: `state` is a root-level schema sibling of
		// the definition fields (OD-1's "no literal hero: wrapper" — spec §3.1), so
		// fieldsFromSchema would otherwise emit a raw-YAML textarea for the ENTIRE play
		// surface inside the "definition editor" (a naive D9 reuse). Hidden here — NOT
		// stripped from the schema — so AJV validation still sees (and accepts) the
		// untouched `state:` the form's `working` object carries through unedited on
		// every save (FormModal.ts's `working` is seeded from the full parsed source and
		// only fields WITHOUT a rendered widget stay byte-for-byte as parsed); stripping
		// `state` from the schema instead would make `additionalProperties: false` reject
		// any block that already has one, which is every hero after its first play edit.
		fields: { state: { hidden: true } },
	},
};
