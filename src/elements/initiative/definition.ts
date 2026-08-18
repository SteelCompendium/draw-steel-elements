// Plan 06 (F1 §6 step 9) — the Initiative Tracker ElementDefinition on Framework v2,
// retiring the legacy InitiativeProcessor. Registered via
// registerFrameworkElementDefinitions (main.ts) since Task 5, which also deleted
// initiativeProcessor.ts and its RegisterElements.ts ds-it* wiring.
import type { ElementDefinition } from '@/framework/registry';
import type { ElementChrome } from '@/framework/chrome/types';
import type { EncounterData } from './model';
import { parse, serialize } from './model';
import { resolveInitiativeRefs } from './resolveRefs';
import { InitiativeView } from './view';
import initiativeExample from './example.yaml';

/**
 * SC-169 ROLLOUT wave 2 — the spec's worked example ("Initiative: Round 3"), rendered
 * through the standard grammar as "INITIATIVE (round 3 \u00b7 4v3)". The combatant split is
 * worth the six characters: an initiative tracker folded mid-fight is being asked "is this
 * still the encounter I think it is", and the round alone does not answer that. An absent
 * `round` is round 1 (model contract, EncounterData.ts).
 */
const initiativeChrome: ElementChrome<EncounterData> = {
	summary: ({ model }) => ({
		label: 'Initiative',
		detail: `round ${model.round ?? 1} \u00b7 ${model.heroes.length}v${model.enemy_groups.length}`,
	}),
};

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
	chrome: initiativeChrome,
	authoring: { example: initiativeExample },
};
