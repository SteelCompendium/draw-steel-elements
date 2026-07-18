// Plan 06 Task 1 — initiative element model: the SYNC parse split + byte-compat serialize.
//
// parse(data, raw) is the sync body of the legacy async parseEncounterData
// (src/drawSteelAdmonition/EncounterData.ts:82) — which is async ONLY because it resolves
// `statblock` references inline — MINUS exactly three things:
//   1. its own parseYaml + "Invalid YAML format" wrapper: the pipeline YAML-parses the block
//      source before calling def.parse (pipeline.ts step 2), so `data` is already parsed;
//   2. the two `await resolver.resolveReferences(...)` statblock-merge blocks
//      (EncounterData.ts:110-128 hero, :211-228 creature) — Task 2's resolveRefs;
//   3. the four validations that consume MERGED statblock values and therefore ran only
//      after the merge: hero name (:130), hero max_stamina (:133), creature name (:230),
//      creature max_stamina (:240). Deferred to Task 2 so a statblock-sourced name /
//      max_stamina is filled before it is validated.
// Everything else is transcribed VERBATIM and in the same statement order — key INSERTION
// order is the serialized YAML key order, so reordering assignments would break byte-compat.
// `statblock` strings are left in place (legacy kept them on the object after merging too);
// name/max_stamina — and the stamina values derived from max_stamina — may legitimately be
// unset after parse when a statblock will supply them; resolveRefs re-applies the same
// `?? max_stamina` fills post-merge. Like legacy, parse mutates the parsed data in place and
// returns it (safe: the pipeline parses a fresh object per run).
//
// The EncounterData interfaces + resetEncounter live in EncounterData.ts and are re-exported
// below (never duplicated). D8 Task 5 (Malice panel) added `round` + `Malice.round_gain`/`log`
// there as additive optional fields (and taught resetEncounter to clear the runtime ones,
// `round`/`log` — `round_gain` is a configured default and survives a reset); Task 9 (turn/
// round economy, spec §7) added `ActorActions` + `Hero.actions`/`CreatureInstance.actions`
// the same way, and taught resetEncounter to clear `Hero.actions` (enemy-side `actions`
// dies with the instances it lives on). parse()/serialize() below needed NO changes for
// either: unset optional fields simply pass through untouched — the additive contract holds
// because nothing here ever reads or writes `round`/`actions`/`malice.round_gain`/`.log`.
// Task 9 DOES add one new export below: `advanceRound()`, the round-boundary transition
// that both the round display and the per-actor `actions` reset share (moved out of
// InitiativeView, which previously held an equivalent private method for `round`/
// `has_taken_turn` only — see advanceRound's own doc comment for the full contract).
//
// serialize(model): the BYTE-COMPAT boundary. The legacy write path
// (CodeBlocks.updateInitiativeTracker -> updateCodeBlock -> updateMarkdownCodeBlock,
// src/utils/CodeBlocks.ts:102; canvas :79) does exactly `stringifyYaml(data).trim()` on the
// WHOLE materialized EncounterData the processor holds — this is the same expression on the
// same object shape. `.trim()` matches the legacy writer exactly and is also required by
// ReadingModeBlockHost.replaceSource, which does `newSource.split('\n')` — an untrimmed
// trailing "\n" from stringifyYaml would splice a spurious blank line before the closing
// fence. Byte-compat is pinned by test/unit/model/initiative-serialize.test.ts against the
// unchanged legacy parseEncounterData on ref-free inputs.
import { stringifyYaml } from 'obsidian';
import type { Condition, EncounterData } from '@drawSteelAdmonition/EncounterData';

export type {
	ActorActions,
	Condition,
	Creature,
	CreatureInstance,
	EncounterData,
	EnemyGroup,
	Hero,
	Malice,
	MaliceLogEntry,
} from '@drawSteelAdmonition/EncounterData';
export { resetEncounter } from '@drawSteelAdmonition/EncounterData';

/**
 * Legacy condition normalization: strings become {key} and objects are re-built as
 * key/color/effect. Transcribed once — the three legacy inline copies
 * (EncounterData.ts:137-154 hero, :276-295 minion instance, :321-340 regular instance)
 * differ only in the throw message, injected here as a lazy closure.
 */
function normalizeConditions(
	conditions: (string | Condition)[] | undefined,
	invalidMessage: () => string,
): Condition[] {
	return (
		conditions?.map((cond) => {
			if (typeof cond === 'string') {
				return {
					key: cond,
					color: undefined,
					effect: undefined,
				};
			} else if (typeof cond === 'object' && cond.key) {
				return {
					key: cond.key,
					color: cond.color ?? undefined,
					effect: cond.effect ?? undefined,
				};
			} else {
				throw new Error(invalidMessage());
			}
		}) ?? []
	);
}

export function parse(input: unknown, _raw: string): EncounterData {
	// Validate that data is an object (EncounterData.ts:95-107).
	if (typeof input !== 'object' || input === null) {
		throw new Error('The input must be a YAML object.');
	}
	const data = input as EncounterData;

	if (!data.heroes || !Array.isArray(data.heroes)) {
		throw new Error("Invalid data: 'heroes' field is missing or is not a list.");
	}
	if (!data.enemy_groups || !Array.isArray(data.enemy_groups)) {
		throw new Error("Invalid data: 'enemy_groups' field is missing or is not a list.");
	}

	// Initialize heroes (:109-160, minus the statblock merge and the name/max_stamina
	// checks — see header). A statblock-sourced max_stamina is still unset here, so
	// `current_stamina ?? max_stamina` may leave current_stamina undefined; resolveRefs
	// (Task 2) re-applies the same ?? fill once max_stamina is known.
	for (const hero of data.heroes) {
		hero.conditions = normalizeConditions(
			hero.conditions,
			() => `Invalid condition format for hero '${hero.name}'.`,
		);

		hero.isHero = true;
		hero.has_taken_turn = hero.has_taken_turn ?? false;
		hero.current_stamina = hero.current_stamina ?? hero.max_stamina;
		hero.temp_stamina = hero.temp_stamina ?? 0;
	}

	// Initialize enemy groups and creatures (:162-345, minus merge + name/max checks).
	for (const [groupIndex, group] of data.enemy_groups.entries()) {
		if (!group.name) {
			throw new Error(`Enemy group at index ${groupIndex} is missing the 'name' field.`);
		}
		if (!group.creatures || !Array.isArray(group.creatures)) {
			throw new Error(`Enemy group '${group.name}' has an invalid or missing 'creatures' field.`);
		}

		group.has_taken_turn = group.has_taken_turn ?? false;
		group.is_squad = group.is_squad ?? false;

		if (group.is_squad) {
			// Squad-specific validation (:174-208) — merge-independent (squad_role is never
			// statblock-sourced) and, exactly like legacy, it runs BEFORE the creature loop
			// (i.e. before the merge even in legacy), so its creature.name interpolation
			// matches legacy byte-for-byte too.
			if (group.creatures.length > 2) {
				throw new Error(
					`Squad '${group.name}' can have at most two creatures (minions and an optional captain).`,
				);
			}
			let minionCount = 0;
			let captainCount = 0;
			group.creatures.forEach((creature) => {
				if (!creature.squad_role) {
					throw new Error(
						`Creature '${creature.name}' in squad '${group.name}' must have a 'squad_role' of 'minion' or 'captain'.`,
					);
				}
				if (creature.squad_role === 'minion') {
					minionCount += 1;
				} else if (creature.squad_role === 'captain') {
					captainCount += 1;
				} else {
					throw new Error(
						`Creature '${creature.name}' in squad '${group.name}' has an invalid 'squad_role' value.`,
					);
				}
			});
			if (minionCount === 0) {
				throw new Error(`Squad '${group.name}' must have at least one minion creature.`);
			}
			if (minionCount > 1) {
				throw new Error(`Squad '${group.name}' can have only one minion creature type.`);
			}
			if (captainCount > 1) {
				throw new Error(`Squad '${group.name}' can have at most one captain creature.`);
			}
		}

		for (const creature of group.creatures) {
			// (Statblock merge :211-228 and the name :230 / max_stamina :240 checks are
			// deferred to resolveRefs — Task 2.) The amount check STAYS: `amount` is never
			// statblock-sourced, so its predicate is merge-independent, and the instance
			// materialization below depends on it being numeric. (Known edge: a creature
			// with a statblock AND a missing amount interpolates creature.name below as
			// undefined where legacy showed the merged name — accepted, doubly-broken input.)
			if (typeof creature.amount !== 'number') {
				throw new Error(
					`Creature '${creature.name}' in group '${group.name}' is missing or has an invalid 'amount' field.`,
				);
			}

			creature.isHero = false;

			// Initialize instances (:249-343).
			if (group.is_squad && creature.squad_role === 'minion') {
				// Minions in a squad share a stamina pool. GUARD (new in the split): legacy
				// could never reach this line with a non-number max_stamina (its :240 check
				// threw first). After the split a statblock-sourced max_stamina is still
				// unset here, and `undefined * amount` would poison the pool with NaN —
				// defeating the `== null` re-init check forever. Leaving the pool unset
				// defers its initialization to Task 2's post-merge pass. Unreachable for
				// ref-free input, so byte-compat is unaffected.
				if (group.minion_stamina_pool == null && typeof creature.max_stamina === 'number') {
					// Initialize the pool to total stamina (max_stamina * amount).
					group.minion_stamina_pool = creature.max_stamina * creature.amount;
				}
				// Initialize instances for minions (for conditions only).
				if (!creature.instances || creature.instances.length !== creature.amount) {
					creature.instances = [];
					for (let i = 0; i < creature.amount; i++) {
						creature.instances.push({
							id: i + 1,
							conditions: [],
							// current_stamina and temp_stamina are not used for minions in squads
						});
					}
				} else {
					// Validate existing instances.
					creature.instances.forEach((instance, instanceIndex) => {
						if (typeof instance.id !== 'number') {
							throw new Error(
								`Instance at index ${instanceIndex} of creature '${creature.name}' in group '${group.name}' is missing or has an invalid 'id' field.`,
							);
						}
						// For minions, we don't need to set current_stamina or temp_stamina.
						instance.conditions = normalizeConditions(
							instance.conditions,
							() => `Invalid condition format for instance '${instance.id}' of creature '${creature.name}'.`,
						);
					});
				}
			} else {
				// Regular creatures and captains. A statblock-sourced max_stamina is unset
				// here, so current_stamina may be materialized as undefined — resolveRefs
				// (Task 2) re-applies the same `?? max_stamina` fill after the merge.
				if (!creature.instances || creature.instances.length !== creature.amount) {
					creature.instances = [];
					for (let i = 0; i < creature.amount; i++) {
						creature.instances.push({
							id: i + 1,
							current_stamina: creature.max_stamina,
							temp_stamina: 0,
							conditions: [],
						});
					}
				} else {
					// Validate existing instances.
					creature.instances.forEach((instance, instanceIndex) => {
						if (typeof instance.id !== 'number') {
							throw new Error(
								`Instance at index ${instanceIndex} of creature '${creature.name}' in group '${group.name}' is missing or has an invalid 'id' field.`,
							);
						}
						instance.current_stamina = instance.current_stamina ?? creature.max_stamina;
						instance.temp_stamina = instance.temp_stamina ?? 0;
						instance.conditions = normalizeConditions(
							instance.conditions,
							() => `Invalid condition format for instance '${instance.id}' of creature '${creature.name}'.`,
						);
					});
				}
			}
		}
	}

	data.malice = data.malice ?? { value: 0 };
	if (typeof data.malice.value !== 'number') {
		throw new Error("Invalid data: 'malice.value' must be a number.");
	}

	return data;
}

export function serialize(model: EncounterData): string {
	return stringifyYaml(model).trim();
}

/**
 * D8 Task 9 (spec §7.2) — the ONE round-boundary transition, shared by the round display,
 * the Malice panel's per-round auto-gain (spec §3.3/OD-3), and the per-actor `actions`
 * checklist. Supersedes the old turn-only "Reset Round" affordance — Task 5's review
 * flagged the two as overlapping (both cleared `has_taken_turn`), and per spec §7.2
 * "Advance round" is the superset (round++, has_taken_turn clear, actions clear, Malice
 * gain), so InitiativeView now exposes only this control (D8-gm-subsystems-spec.md §7.2).
 *
 * - `round` defaults from absent (treated as 1) so the first press produces 2.
 * - `has_taken_turn` clears on every hero/enemy group, exactly like the old Reset Round.
 * - Per-actor `actions` (Hero + every enemy CreatureInstance) resets to all-false IF
 *   already materialized; an actor that has never had a slot toggled stays untouched
 *   (absent), preserving the additive-optional / never-fabricated contract. "Triggered" is
 *   per-round (spec §7.1), so this is precisely where it resets — not on turn end.
 * - `malice.round_gain`, when configured (non-zero), is added to the pool and logged
 *   (`{round, amount, label: 'Round gain'}`) at the NEW round number — same log shape as
 *   the quick-add (spec §3.1/§3.3). Absent/0 stays manual-only (OD-3: never a fabricated
 *   default).
 */
export function advanceRound(data: EncounterData): void {
	data.round = (data.round ?? 1) + 1;

	data.heroes.forEach((hero) => {
		hero.has_taken_turn = false;
		if (hero.actions) {
			hero.actions = { main: false, maneuver: false, move: false, triggered: false };
		}
	});

	data.enemy_groups.forEach((group) => {
		group.has_taken_turn = false;
		group.creatures.forEach((creature) => {
			creature.instances?.forEach((instance) => {
				if (instance.actions) {
					instance.actions = { main: false, maneuver: false, move: false, triggered: false };
				}
			});
		});
	});

	const gain = data.malice.round_gain;
	if (typeof gain === 'number' && gain !== 0) {
		data.malice.value += gain;
		data.malice.log = data.malice.log ?? [];
		data.malice.log.push({ round: data.round, amount: gain, label: 'Round gain' });
	}
}
