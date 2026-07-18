// D8 Task 4 (spec §2) — the ds-encounter ElementDefinition.
import type { ElementDefinition } from '@/framework/registry';
import type { EncounterModel } from './model';
import { parse, serialize } from './model';
import { EncounterView } from './view';
import encounterExample from './example.yaml';

export const encounterElement: ElementDefinition<EncounterModel> = {
	id: 'encounter',
	name: 'Encounter builder',
	aliases: ['ds-encounter'],
	shape: 'persisted',
	// Deliberately NO schema (matches initiative/counter/negotiation's convention — parse
	// does its own imperative validation). autoResolveRefs stays OFF: `monsters[].code`
	// is an SCC code the VIEW resolves live via cx.compendium.getStatblock (spec §2.1),
	// never a whole-block/@path/[[wikilink]] reference the pipeline's generic ref
	// resolution machinery would try to deep-resolve.
	autoResolveRefs: false,
	parse,
	serialize,
	createView: (cx) => new EncounterView(cx),
	authoring: { example: encounterExample },
};
