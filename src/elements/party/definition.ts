// D8 Task 8 (spec §6) — Party tracker on Framework v2. Persisted shape; NO schema (a
// brand-new element with no legacy predecessor to match — same convention as
// encounter/montage/project: validation is skipped by the pipeline when schema is
// omitted, F1 §2.4 step 3). NO compendium dep — `hero_ref` is an opaque `[[wikilink]]`
// string the view renders as a link (ElementView.renderMarkdown), never resolved through
// autoResolveRefs (a single inline field the block's own author sets, not a whole-block
// reference — same rationale as encounter's `party.party_ref`/project's `goal_code`).
import type { ElementDefinition } from '@/framework/registry';
import type { PartyModel } from './model';
import { parse, serialize } from './model';
import { PartyView } from './view';
import partyExample from './example.yaml';

export const partyElement: ElementDefinition<PartyModel> = {
	id: 'party',
	name: 'Party tracker',
	aliases: ['ds-party'],
	shape: 'persisted',
	autoResolveRefs: false, // self-contained tracker; hero_ref is opaque, rendered not resolved
	parse,
	serialize,
	createView: (cx) => new PartyView(cx),
	authoring: { example: partyExample },
};
