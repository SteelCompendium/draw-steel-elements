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
// serialize(model): SC-485 — the "no default keys the user never wrote" boundary. The legacy write
// path (the former CodeBlocks.updateInitiativeTracker -> updateCodeBlock -> updateMarkdownCodeBlock,
// src/utils/CodeBlocks.ts — deleted in SC-454) did `stringifyYaml(data).trim()` on the WHOLE
// materialized EncounterData, so the first click wrote every key parse had filled in (isHero,
// `conditions: []`, per-instance stamina, `malice`, ...). serialize now follows the SC-466 / SC-482
// contract (src/elements/shared/undeclaredDefaults.ts): a key the source left ABSENT whose value
// still equals what parse filled in is omitted; every authored key is written; an absent key whose
// value changed is written whole; key ORDER is unchanged, so a fully-authored block serializes
// byte-identically to the legacy writer. Presence is read per object (top, hero, group, creature,
// authored instance) BEFORE each fill in parse; the values are snapshotted at the end of parse AND
// again at the end of resolveRefs (statblock merges and the stamina fills they unlock land there);
// serialize walks a nested DTO. `.trim()` is still required by ReadingModeBlockHost.replaceSource,
// which does `newSource.split('\n')` — an untrimmed trailing "\n" would splice a spurious blank
// line before the closing fence. Pinned by test/unit/model/initiative-serialize.test.ts (parse
// against the unchanged legacy parseEncounterData; the legacy writer's bytes on a fully-authored
// source) and test/dom/elements/initiative-default-keys.test.ts (the writes through the pipeline).
import { stringifyYaml } from 'obsidian';
import type { Condition, Creature, EncounterData, EnemyGroup } from '@drawSteelAdmonition/EncounterData';
import {
	EMPTY_SQUAD_ACTIONS,
	appendMaliceLogEntry,
	initMinionPool,
	minionPoolOf,
	reconcileOrphanedCaptainBonus,
	validateSquad,
} from '@drawSteelAdmonition/EncounterData';
import { isUntouchedDefault, omitUntouchedDefaults, recordAbsentDefaults } from '../shared/undeclaredDefaults';

export {
	EMPTY_SQUAD_ACTIONS,
	applyCaptainBonusTransition,
	captainOfSquad,
	captainStaminaBonus,
	foldedCaptainStaminaBonus,
	initMinionPool,
	isCaptainDown,
	minionCreatures,
	minionPoolMaxOf,
	minionPoolOf,
	parseWithCaptainStamina,
	promoteCaptain,
	reconcileOrphanedCaptainBonus,
	relieveCaptain,
	setMinionPool,
	squadOfCaptain,
	validateSquad,
	withCaptainStaminaN,
} from '@drawSteelAdmonition/EncounterData';

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
	SquadActions,
} from '@drawSteelAdmonition/EncounterData';
export { resetEncounter } from '@drawSteelAdmonition/EncounterData';

/**
 * Legacy condition normalization: strings become {key} and objects are re-built as
 * key/color/effect/duration. Transcribed once — the three legacy inline copies
 * (EncounterData.ts:137-154 hero, :276-295 minion instance, :321-340 regular instance)
 * differ only in the throw message, injected here as a lazy closure. SC-186: `duration`
 * is additive and passed through the same way as `color`/`effect` (present-or-undefined,
 * never fabricated) — both EncounterData.ts's three legacy copies and this one carry it
 * so the async oracle (`parseEncounterData`) and this sync split stay byte-compat.
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
					duration: undefined,
				};
			} else if (typeof cond === 'object' && cond.key) {
				return {
					key: cond.key,
					icon: cond.icon ?? undefined,
					color: cond.color ?? undefined,
					effect: cond.effect ?? undefined,
					duration: cond.duration ?? undefined,
				};
			} else {
				throw new Error(invalidMessage());
			}
		}) ?? []
	);
}

// ---- SC-485: which keys each parsed object left ABSENT, read before parse fills them ----
const TOP_KEYS = ['malice'] as const;
const HERO_KEYS = [
	'conditions',
	'isHero',
	'has_taken_turn',
	'current_stamina',
	'temp_stamina',
	// merged from a `statblock:` ref by resolveRefs (only-if-unset), so absent here too
	'name',
	'max_stamina',
	'image',
	'with_captain',
] as const;
const GROUP_KEYS = ['has_taken_turn', 'is_squad', 'minion_stamina_pool'] as const;
const POOL_UNIT_KEYS = ['minion_stamina_pool_max', 'captain_bonus_active', 'captain_bonus_n'] as const;
const CREATURE_KEYS = [
	'isHero',
	'instances',
	'name',
	'max_stamina',
	'image',
	'with_captain',
	'minion_stamina_pool',
	...POOL_UNIT_KEYS,
] as const;
const REGULAR_INSTANCE_KEYS = ['current_stamina', 'temp_stamina', 'conditions'] as const;
const MINION_INSTANCE_KEYS = ['conditions'] as const;

/** Per parsed object: the keys the source left absent (`obj[key] === undefined`, SC-466 r2). Module-private
 *  and keyed by object, like the helper's own record — never an own property (stringifyYaml would write it). */
const absentKeys = new WeakMap<object, readonly string[]>();

/** Call BEFORE parse fills anything on `obj`. */
function noteAbsent(obj: object, keys: readonly string[]): void {
	absentKeys.set(
		obj,
		keys.filter((key) => (obj as Record<string, unknown>)[key] === undefined),
	);
}

/** Record, on every object `noteAbsent` saw, the value it holds NOW for each key the source left absent.
 *  Called at the end of `parse` and again at the end of `resolveRefs` (which fills statblock-sourced
 *  keys and the stamina derived from them); the helper overwrites, so calling twice is safe. */
export function snapshotFilledDefaults(model: EncounterData): void {
	const snap = (obj: object): void => {
		const keys = absentKeys.get(obj);
		if (keys) recordAbsentDefaults(obj, keys);
	};
	snap(model);
	model.heroes.forEach(snap);
	for (const group of model.enemy_groups) {
		snap(group);
		for (const creature of group.creatures) {
			snap(creature);
			creature.instances?.forEach(snap);
		}
	}
}

export function parse(input: unknown, _raw: string): EncounterData {
	// Validate that data is an object (EncounterData.ts:95-107).
	if (typeof input !== 'object' || input === null) {
		throw new Error('The input must be a YAML object.');
	}
	const data = input as EncounterData;
	noteAbsent(data, TOP_KEYS);

	// SC-377: the optional encounter title. A bare `name:` (YAML null) is "no title". An author
	// writing `name: 1984` or `name: true` gets a number/boolean from YAML, but means the text, so
	// scalars are coerced to String (review LOW-3); only a list or mapping is rejected.
	// Whitespace-only is left as authored here - the view treats it as untitled and the first
	// rename normalizes it.
	if (data.name === null) delete data.name;
	else if (typeof data.name === 'number' || typeof data.name === 'boolean') data.name = String(data.name);
	if (data.name !== undefined && typeof data.name !== 'string') {
		throw new Error("Invalid data: 'name' must be text.");
	}

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
		noteAbsent(hero, HERO_KEYS);
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

		noteAbsent(group, GROUP_KEYS);
		group.has_taken_turn = group.has_taken_turn ?? false;
		group.is_squad = group.is_squad ?? false;

		if (group.is_squad) {
			// Squad-specific validation (:174-208) — merge-independent (squad_role is never
			// statblock-sourced) and, exactly like legacy, it runs BEFORE the creature loop
			// (i.e. before the merge even in legacy), so its creature.name interpolation
			// matches legacy byte-for-byte too. SC-183 r3 / GH #67 lifted the two-creature
			// and one-minion-type caps; the surviving rules live in `validateSquad`, shared
			// verbatim with the async oracle so the split cannot drift from it.
			validateSquad(group);
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

			noteAbsent(creature, CREATURE_KEYS);
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
				// SC-183 r3 / GH #67: resolved and written per SQUAD. `setMinionPool` keeps
				// a one-squad group's pool on the GROUP (its historical home — so an
				// existing block's bytes are untouched) and only materializes per-creature
				// pools for a group that really holds more than one squad.
				if (minionPoolOf(group, creature) == null && typeof creature.max_stamina === 'number') {
					// Initialize the pool to total stamina (max_stamina * amount), folding in
					// the ACTIVE "With Captain" Stamina bonus if the squad is born captained
					// (SC-195).
					initMinionPool(group, creature);
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
						noteAbsent(instance, MINION_INSTANCE_KEYS);
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
				// SC-195 fix round (MEDIUM-1) — for EVERY squad, not only a freshly
				// initialized one: reconcile a persisted bonus flag that has been orphaned
				// by the captain leaving the group through a non-badge route (e.g. a hand
				// edit deleting the captain's creature entry). No-op when the flag is
				// false or a captain is still bound (down or not). MUST run AFTER instance
				// materialization above — the alive-count it needs doesn't exist yet on a
				// fresh squad until that block runs.
				reconcileOrphanedCaptainBonus(group, creature);
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
						noteAbsent(instance, REGULAR_INSTANCE_KEYS);
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

	snapshotFilledDefaults(data);
	return data;
}

/** A squad's shared pool and its "With Captain" bonus trio are co-derived: once the pool is written,
 *  re-parse skips `initMinionPool` (the pool is no longer `== null`), so an omitted trio would never be
 *  re-derived and the bonus would read 0. They are therefore written all-or-nothing: if ANY of the pool on
 *  its live home (creature field first, else group, as `minionPoolOf`) and the three trio keys would be
 *  written, every one of them is. A key holding `undefined` counts as untouched. */
function poolUnitWritten(group: EnemyGroup, minion: Creature): boolean {
	const home: object = minion.minion_stamina_pool != null ? minion : group;
	return (
		!isUntouchedDefault(home, 'minion_stamina_pool') || POOL_UNIT_KEYS.some((key) => !isUntouchedDefault(minion, key))
	);
}

function groupDto(group: EnemyGroup): object {
	const groupKeep = new Set<string>();
	const creatures = group.creatures.map((creature) => {
		const keep = new Set<string>();
		if (group.is_squad && creature.squad_role === 'minion' && poolUnitWritten(group, creature)) {
			for (const key of POOL_UNIT_KEYS) keep.add(key);
			(creature.minion_stamina_pool != null ? keep : groupKeep).add('minion_stamina_pool');
		}
		// A creature whose `instances` was generated carries no per-instance record (the list is compared whole
		// at the creature level), so filtering its instances is a no-op there; authored ones filter per key.
		const dto = creature.instances
			? { ...creature, instances: creature.instances.map((instance) => omitUntouchedDefaults(instance)) }
			: creature;
		return omitUntouchedDefaults(creature, dto, keep);
	});
	return omitUntouchedDefaults(group, { ...group, creatures }, groupKeep);
}

export function serialize(model: EncounterData): string {
	// SC-485: nested DTO walk, innermost first (see the header). A model the plugin built itself has no
	// record, so every level returns its object unchanged and the output is the whole model, as before.
	const heroes = model.heroes.map((hero) => omitUntouchedDefaults(hero));
	const enemy_groups = model.enemy_groups.map(groupDto);
	const dto = omitUntouchedDefaults(model, { ...model, heroes, enemy_groups });
	// SC-377: a title added by the in-card editor lands LAST in key-insertion order; write it
	// first, where an author puts it. No title = the original key order.
	if (dto.name !== undefined) {
		const { name, ...rest } = dto;
		return stringifyYaml({ name, ...rest }).trim();
	}
	return stringifyYaml(dto).trim();
}

/**
 * Shared by `advanceRound` and `resetRound` (D8 Task 9, spec §7.2): clears every actor's
 * `has_taken_turn` and, IF already materialized, resets its per-actor `actions` to
 * all-false. An actor that has never had a slot toggled stays untouched (absent),
 * preserving the additive-optional / never-fabricated contract — see `advanceRound`'s
 * own doc comment for why this specific reset shape (all-false, not deletion) is correct.
 */
function clearTurnState(data: EncounterData): void {
	data.heroes.forEach((hero) => {
		hero.has_taken_turn = false;
		if (hero.actions) {
			hero.actions = { main: false, maneuver: false, move: false, triggered: false };
		}
	});

	data.enemy_groups.forEach((group) => {
		group.has_taken_turn = false;
		group.creatures.forEach((creature) => {
			// SC-278 — the squad's shared checklist, same materialized-only rule.
			if (creature.actions) {
				creature.actions = EMPTY_SQUAD_ACTIONS();
			}
			creature.instances?.forEach((instance) => {
				if (instance.actions) {
					instance.actions = { main: false, maneuver: false, move: false, triggered: false };
				}
			});
		});
	});
}

/**
 * D8 Task 9 (spec §7.2) — the round-boundary transition, shared by the round display,
 * the Malice panel's per-round auto-gain (spec §3.3/OD-3), and the per-actor `actions`
 * checklist reset. Per the brief, this is a SUPERSET of `resetRound` below (round++ +
 * Malice gain, on top of the same turn/action clear) — the two controls are NOT
 * interchangeable: `resetRound` exists precisely for the mid-round correction where
 * bumping `round` / re-granting `malice.round_gain` would be wrong (task-9-review.md HIGH
 * finding).
 *
 * - `round` defaults from absent (treated as 1) so the first press produces 2.
 * - `has_taken_turn` / per-actor `actions` clear via `clearTurnState` (identical to
 *   `resetRound`'s behavior). "Triggered" is per-round (spec §7.1), so this is precisely
 *   where it resets — not on turn end.
 * - `malice.round_gain`, when configured (non-zero), is added to the pool and logged
 *   (`{round, amount, label: 'Round gain'}`) at the NEW round number — same log shape as
 *   the quick-add (spec §3.1/§3.3). Absent/0 stays manual-only (OD-3: never a fabricated
 *   default).
 */
export function advanceRound(data: EncounterData): void {
	data.round = (data.round ?? 1) + 1;
	clearTurnState(data);

	const gain = data.malice.round_gain;
	if (typeof gain === 'number' && gain !== 0) {
		data.malice.value += gain;
		appendMaliceLogEntry(data.malice, { round: data.round, amount: gain, label: 'Round gain' });
	}
}

/**
 * "Reset Round" (pre-D8 affordance, restored per task-9-review.md HIGH finding — the
 * task-9 brief's Interfaces section says verbatim "the existing 'Reset Round' ... stays").
 * A pure turn-only correction: clears `has_taken_turn` and materialized per-actor
 * `actions` exactly like `advanceRound` (via the same `clearTurnState` helper, so the two
 * can never drift on what "clear turn state" means) — but does NOT touch `round` and does
 * NOT apply/log `malice.round_gain`. This is the control a GM reaches for to correct a
 * misclick or re-run the current round from the top without spuriously advancing the
 * round counter or double-dipping the per-round Malice auto-gain.
 */
export function resetRound(data: EncounterData): void {
	clearTurnState(data);
}
