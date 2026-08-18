// D8 Task 4 (spec §2) — the ds-encounter ElementDefinition.
import type { ElementDefinition } from '@/framework/registry';
import type { ElementChrome } from '@/framework/chrome/types';
import type { EncounterModel } from './model';
import { parse, serialize } from './model';
import { EncounterView } from './view';
import encounterExample from './example.yaml';

/**
 * SC-169 ROLLOUT wave 2 — the spec's worked example ("Encounter: Mordor Forces (EV 42)").
 * `_computed` is a DISPLAY CACHE the view writes (model.ts §2.5), so it is present for any
 * encounter that has rendered — which is every encounter a reader can collapse. It is
 * nonetheless optional by type, and the fallback is the honest one: the number of monster
 * groups, which is readable straight off the authored body.
 */
const encounterChrome: ElementChrome<EncounterModel> = {
	summary: ({ model }) => ({
		label: 'Encounter',
		name: model.label || undefined,
		detail: model._computed ? `EV ${model._computed.spent_ev}` : `${model.monsters.length} groups`,
	}),
};

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
	chrome: encounterChrome,
	authoring: { example: encounterExample },
};
