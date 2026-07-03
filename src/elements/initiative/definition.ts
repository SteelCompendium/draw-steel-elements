// Plan 06 Task 4 — the Initiative Tracker ElementDefinition on Framework v2.
//
// NOT REGISTERED YET (deliberate): registerFrameworkElementDefinitions (main.ts) does not
// include this definition and RegisterElements.ts still wires the legacy
// InitiativeProcessor for every ds-it* alias. Task 5 flips registration (register here,
// remove the legacy registration, delete initiativeProcessor.ts) — keeping this task free
// of a half-migrated live element.
import type { ElementDefinition } from '@/framework/registry';
import type { EncounterData } from './model';
import { parse, serialize } from './model';
import { resolveInitiativeRefs } from './resolveRefs';
import { InitiativeView } from './view';

export const initiativeElement: ElementDefinition<EncounterData> = {
	id: 'initiative',
	name: 'Initiative tracker',
	aliases: ['ds-it', 'ds-init', 'ds-initiative', 'ds-initiative-tracker'],
	shape: 'persisted',
	// Deliberately NO schema: the legacy element never had one (parseEncounterData did its
	// own imperative validation, ported into parse/resolveRefs) — do not invent one here.
	autoResolveRefs: false, // field-scoped bare-path `statblock` resolution only, via resolveRefs
	parse,
	serialize,
	resolveRefs: resolveInitiativeRefs,
	createView: (cx) => new InitiativeView(cx),
};
