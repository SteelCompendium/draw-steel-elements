// Plan 06 (F1 §6 step 9) — the Initiative Tracker ElementDefinition on Framework v2,
// retiring the legacy InitiativeProcessor. Registered via
// registerFrameworkElementDefinitions (main.ts) since Task 5, which also deleted
// initiativeProcessor.ts and its RegisterElements.ts ds-it* wiring.
import type { ElementDefinition } from '@/framework/registry';
import type { EncounterData } from './model';
import { parse, serialize } from './model';
import { resolveInitiativeRefs } from './resolveRefs';
import { InitiativeView } from './view';
import initiativeExample from './example.yaml';

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
	authoring: { example: initiativeExample },
};
