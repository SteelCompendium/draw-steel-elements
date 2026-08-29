import {App, parseYaml} from "obsidian";
import {DSESettings} from "@model/Settings";
import {ReferenceResolver} from "@utils/ReferenceResolver";

/** Narrow an unknown `catch` binding down to a displayable message without assuming
 *  it's an `Error` (thrown values aren't guaranteed to be). Mirrors
 *  JsonSchemaValidator.ts's helper of the same name (kept file-local, not shared,
 *  matching wave 1's convention). */
function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** The fields parseEncounterData reads off a resolved statblock reference payload —
 *  mirrors resolveInitiativeRefs' StatblockFields (src/elements/initiative/resolveRefs.ts),
 *  same fallback contract, just still inline here in the legacy sync parse path. */
interface StatblockFields {
    name?: unknown;
    stamina?: unknown;
    image?: unknown;
}

/** Per-turn action checklist (D8 spec §7.2/§7.3, additive). "Triggered" is per ROUND
 *  (spec §7.1 — one triggered action per round, AGENT line 780), so it resets on round
 *  advance, not on turn end like the other three. ABSENT on a Hero/CreatureInstance means
 *  "nothing tracked yet" — the view reads `?? false` per slot and materializes this object
 *  onto the actor only on the first user toggle (never during parse). */
export interface ActorActions {
    main: boolean;
    maneuver: boolean;
    move: boolean;
    triggered: boolean;
}

export interface Hero {
    name: string;
    max_stamina: number;
    current_stamina?: number;
    temp_stamina?: number;
    image?: string;
    isHero: boolean;
    has_taken_turn?: boolean;
    /** Per-turn action checklist (D8 spec §7.2, additive). ABSENT → all-false render-time
     *  default; never fabricated during parse. */
    actions?: ActorActions;
    conditions: (string | Condition)[];
    /** SC-195 — merged only-if-unset from a referenced statblock, symmetric with
     *  Creature's field of the same name (resolveRefs.ts copies this onto BOTH heroes and
     *  creatures identically) — never read back out for a hero (a hero is never a squad
     *  minion), kept purely so the two merge blocks don't diverge in shape. */
    with_captain?: string;
    statblock?: unknown; // To allow property fallback
}

export interface CreatureInstance {
    id: number;
    current_stamina?: number;
    temp_stamina?: number;
    conditions?: (string | Condition)[];
    isDead?: boolean;
    /** Per-turn action checklist (D8 spec §7.2/§7.3, additive) — same contract as
     *  Hero.actions. Tracked per INSTANCE (not per creature type), matching the schema's
     *  `enemy_groups[].creatures[].instances[]` placement. */
    actions?: ActorActions;
}

export interface Creature {
    name: string;
    max_stamina: number;
    amount: number;
    instances?: CreatureInstance[];
    image?: string;
    isHero: boolean;
    /** SC-183 r3 / GH #67 — the creature's place in a squad group.
     *  - `minion`   — a minion SQUAD. Its Stamina is a shared pool (see
     *                 `minion_stamina_pool` below). A group may now hold SEVERAL of
     *                 these (issue #67: Delian Tomb W1 group 3 is two squads of
     *                 "flows of the river" in one group).
     *  - `captain`  — attached to one squad as its captain (`captain_of`).
     *  - `attached` — SC-183 r3, additive: a non-minion creature travelling with the
     *                 squad that is not (currently) a captain. This is what a relieved
     *                 captain becomes, and what a promotable candidate is; it behaves
     *                 exactly like an ordinary creature in every other respect. Old
     *                 encounter YAML never contains it. */
    squad_role?: "minion" | "captain" | "attached";
    /** SC-183 r3 / GH #67 — WHICH squad this captain leads, by the minion creature's
     *  `name`. ABSENT (the only shape old YAML has) means "the group's first minion
     *  creature", which is what a one-squad group has always meant. Only written when a
     *  group holds more than one squad, so single-squad blocks keep their exact bytes. */
    captain_of?: string;
    /** SC-183 r3 / GH #67 — this minion squad's own shared Stamina pool. ABSENT means
     *  "use the group's `minion_stamina_pool`", which is where a one-squad group has
     *  always kept it and still keeps it — so an existing block never grows this key.
     *  Only a group with 2+ minion creatures materializes per-creature pools. Always
     *  read through `minionPoolOf` / write through `setMinionPool`, never directly. */
    minion_stamina_pool?: number;
    /** SC-195 — the raw "With Captain" benefit string merged from the referenced
     *  statblock (resolveRefs.ts, only-if-unset — mirrors `name`/`max_stamina`/`image`).
     *  Free-form; only the exact `+N bonus to Stamina` shape (case/whitespace-insensitive)
     *  means anything to the tracker (`parseWithCaptainStamina`) — every other shape
     *  ("Gain an edge on strikes", "+2 bonus to speed", …) is inert here on purpose (it
     *  still renders on the statblock element's own "With Captain" cell). */
    with_captain?: string;
    /** SC-195 — explicit YAML override for the per-minion Stamina bonus this squad's
     *  captain grants (a positive integer). Wins over a value parsed from `with_captain`
     *  when both are present — the escape hatch for a ref-less/homebrew squad, or for a
     *  `with_captain` string the parser doesn't recognize. */
    with_captain_stamina?: number;
    /** SC-195 — this minion squad's own persisted pool MAX. ABSENT means "derive from
     *  `max_stamina * amount`" (every pre-SC-195 block, and any squad whose captain has
     *  never carried an ACTIVE Stamina bonus — `initMinionPool` only materializes this
     *  when the bonus is actually nonzero, so an ordinary squad's bytes never grow this
     *  key). Once a captain bonus has been applied or withdrawn, the max stops being a
     *  pure function of (max_stamina, amount): a captain-down withdrawal removes
     *  `N × the ALIVE count at that moment`, not the squad's original size, so a squad
     *  that had already lost minions before the captain fell keeps a permanent residue
     *  (SC-195 decisions ledger, owner ruling) — history a formula cannot recover. Always
     *  read through `minionPoolMaxOf`; written only by `initMinionPool` /
     *  `applyCaptainBonusTransition`. */
    minion_stamina_pool_max?: number;
    /** SC-195 — persisted: is this squad's Stamina bonus currently folded into its pool?
     *  Written by `initMinionPool` (squad creation, only when the bonus is nonzero) and
     *  `applyCaptainBonusTransition` (every subsequent promote/relieve/captain-death/
     *  captain-heal) — NEVER re-derived wholesale at render time, so a vault reload can
     *  neither double-apply nor drop the bonus. ABSENT means "never computed" (treated as
     *  false everywhere this is read). */
    captain_bonus_active?: boolean;
    /** SC-195 fix round (MEDIUM-1 owner ruling) — the per-minion N actually FOLDED INTO
     *  the pool by the transition that set `captain_bonus_active: true`. Persisted
     *  alongside the flag (written by `initMinionPool` / `applyCaptainBonusTransition`,
     *  cleared whenever the flag goes back to false) so the OFF-transition an orphaned
     *  bonus needs (`reconcileOrphanedCaptainBonus`, below) can un-wind the EXACT amount
     *  that was applied, independent of whatever `with_captain`/`with_captain_stamina`
     *  data the minion carries by the time the reconciliation runs — the captain that
     *  granted the bonus, and potentially the data it was computed from, may be long gone
     *  by then. ABSENT means "never computed" (same contract as `captain_bonus_active`).
     */
    captain_bonus_n?: number;
    statblock?: unknown; // To allow property fallback
}

export interface EnemyGroup {
    name: string;
    creatures: Creature[];
    has_taken_turn?: boolean;
    selectedInstanceKey?: string;
    is_squad?: boolean;
    /** The shared minion pool of a group holding exactly ONE minion squad — the
     *  historical home, kept as the back-compat carrier (see `Creature.minion_stamina_pool`
     *  for the multi-squad case). Read through `minionPoolOf`, write through
     *  `setMinionPool`. */
    minion_stamina_pool?: number;
}

/* ---------------------------------------------------------------- squad helpers
   SC-183 r3 / GH #67 ("Support multiple minion squads in the same group").

   The pre-#67 model could not express the Delian Tomb W1 case: `parse` capped a squad
   group at two creatures and at ONE minion creature type, and the shared pool lived on
   the GROUP — so a group could hold exactly one squad. #67 relaxes both caps, which
   means the pool has to become addressable per squad.

   THE BACK-COMPAT RULE, and why it is a resolution pair rather than a migration: an
   existing block must serialize to the same bytes it parsed from, so the group field
   cannot simply be moved onto the creature. Instead the pool has TWO homes and one
   resolution order — the creature's own field wins, the group's is the fallback — and
   the writer only ever materializes the creature field when the group actually holds
   more than one squad. A one-squad block therefore never grows a key it did not have,
   and a multi-squad block (which could not previously parse at all, so it has no
   bytes to be compatible with) gets per-squad pools. */

/** Every minion-squad creature in a group, in declaration order. */
export function minionCreatures(group: EnemyGroup): Creature[] {
    return group.is_squad ? group.creatures.filter((c) => c.squad_role === "minion") : [];
}

/** The live pool value for one minion squad — creature field first, group field as the
 *  historical fallback. `undefined` only before initialization. */
export function minionPoolOf(group: EnemyGroup, creature: Creature): number | undefined {
    return creature.minion_stamina_pool ?? group.minion_stamina_pool;
}

/** Writes one squad's pool back to whichever field is the LIVE one for it (see the
 *  back-compat rule above): the creature's own, if it already has one or if the group
 *  holds more than one squad; otherwise the group's. */
export function setMinionPool(group: EnemyGroup, creature: Creature, value: number): void {
    if (creature.minion_stamina_pool != null || minionCreatures(group).length > 1) {
        creature.minion_stamina_pool = value;
    } else {
        group.minion_stamina_pool = value;
    }
}

/** The captain attached to ONE squad. A captain names its squad with `captain_of`; a
 *  captain with no `captain_of` (every pre-#67 block) leads the group's first squad. */
export function captainOfSquad(group: EnemyGroup, minion: Creature): Creature | undefined {
    if (!group.is_squad) return undefined;
    const captains = group.creatures.filter((c) => c.squad_role === "captain");
    const named = captains.find((c) => c.captain_of === minion.name);
    if (named) return named;
    return minionCreatures(group)[0] === minion
        ? captains.find((c) => c.captain_of == null)
        : undefined;
}

/** Which squad a captain leads (the inverse of `captainOfSquad`). */
export function squadOfCaptain(group: EnemyGroup, captain: Creature): Creature | undefined {
    return minionCreatures(group).find((minion) => captainOfSquad(group, minion) === captain);
}

/* ---------------------------------------------------------------- SC-195: the "With
   Captain" Stamina bonus.

   Rules grounding (Draw Steel Monsters, "Using Minions" § "Attached Squad Captain" §
   "Captain Benefits"): "While a minion squad has a captain, each minion in the squad
   gains the benefits noted at the 'With Captain' entry on their stat block." Per-minion
   (the pool's own build rule multiplies "each individual minion's Stamina" by the
   squad's count, so a benefit that raises each minion's Stamina raises the multiplicand)
   and conditional on a LIVE captain ("While…").

   Owner ruling (SC-195 decisions ledger, Scott's RULING 1, quoting the clarification he
   was given): "Reduces the current and maximum stamina by the captain bonus multiplied
   by the current number of minions" — the delta on any bonus ON/OFF crossing is
   `N × the ALIVE minion count at that moment`, applied to BOTH current and max. Because
   that delta depends on how many minions were already dead at the moment of the
   crossing, the max is no longer a pure function of (max_stamina, amount) once a
   crossing has ever happened — see `minion_stamina_pool_max`'s own doc comment. */

/** Is this captain "down" — every instance at ≤0 Stamina ("When a nonhero creature's
 *  Stamina is reduced to 0, they die or are knocked unconscious", Draw Steel Heroes)?
 *  Shared by the roster's own "Captain down" badge state and the Stamina-bonus gate
 *  below: a down captain grants no bonus, same as no captain at all ("While…").
 *
 *  An instance with `current_stamina` still `undefined` (or no instances materialized
 *  yet at all) is treated as ALIVE, not down: both parse-time callers below (model.ts's
 *  sync split, resolveRefs.ts's post-merge phase) may reach a captain BEFORE that
 *  captain's own instances have been fully materialized/filled — declaration order in
 *  the YAML doesn't guarantee captain-before-minion (e.g. squad.yaml lists the minion
 *  row first) — and a freshly-parsed creature is never born already-dead. By the time
 *  anything renders, every real captain instance's `current_stamina` is a number, so this
 *  fallback is inert outside that transient parse-time window. */
export function isCaptainDown(captain: Creature): boolean {
    const instances = captain.instances;
    if (!instances || instances.length === 0) return false;
    return instances.every((inst) => (inst.current_stamina ?? Number.POSITIVE_INFINITY) <= 0);
}

/** SC-195 — the tracker's ONE recognized "With Captain" shape: an anchored,
 *  case-insensitive, trimmed `+N bonus to Stamina` (all ten Stamina-flavored entries in
 *  the Monsters book match this; N is observed as 2/3/4/6, but any positive integer is
 *  accepted). Every other shape is a SILENT no-op — never an error, never a UI warning
 *  (27 "Gain an edge on strikes" squads, and the rest of the corpus's 21 non-Stamina
 *  shapes, must keep loading exactly as they always have). */
const WITH_CAPTAIN_STAMINA_RE = /^\+(\d+)\s+bonus to Stamina$/i;

export function parseWithCaptainStamina(raw: string | undefined): number | undefined {
    if (raw == null) return undefined;
    const match = WITH_CAPTAIN_STAMINA_RE.exec(raw.trim());
    if (!match) return undefined;
    const n = Number(match[1]);
    return n > 0 ? n : undefined;
}

/** SC-195 — the per-minion Stamina bonus N a captain grants THIS squad's minion, from the
 *  explicit YAML override (`with_captain_stamina`, wins when present) or else the parsed
 *  `with_captain` statblock string. Independent of whether a captain is actually
 *  bound/alive right now — that gate is `captainStaminaBonus` below. */
export function withCaptainStaminaN(minion: Creature): number | undefined {
    return minion.with_captain_stamina ?? parseWithCaptainStamina(minion.with_captain);
}

/** SC-195 — the ACTIVE per-minion Stamina bonus for one squad right now: N when the
 *  squad has a captain bound (`captainOfSquad`) who isn't down, 0 otherwise (no captain,
 *  or a down captain — both read as "the squad has no captain" per Monsters.md's
 *  "While…"). */
export function captainStaminaBonus(group: EnemyGroup, minion: Creature): number {
    const captain = captainOfSquad(group, minion);
    if (!captain || isCaptainDown(captain)) return 0;
    return withCaptainStaminaN(minion) ?? 0;
}

/** SC-195 — this minion squad's pool MAX: the persisted value once anything has
 *  initialized/transitioned it, else the plain per-minion × ORIGINAL-count formula
 *  (every pre-SC-195 squad, and any squad whose captain has never carried an active
 *  Stamina bonus). C1 (owner ruling): always the ORIGINAL count, never the alive count,
 *  and the max never shrinks on a minion death — this is also the fix for the
 *  pre-existing modal/row divergence (`MinionStaminaPoolModal` used to recompute the max
 *  from the alive count while the row bar and print readout always used the original
 *  `amount`). */
export function minionPoolMaxOf(creature: Creature): number {
    return creature.minion_stamina_pool_max ?? creature.max_stamina * creature.amount;
}

/** SC-195 fix round (HIGH-1) — the per-minion Stamina bonus actually FOLDED INTO this
 *  squad's pool right now: the PERSISTED `captain_bonus_active` flag, never the live
 *  `captainStaminaBonus` gate. Every READOUT (row/print numbers, the pool modal's
 *  kill-ladder divisor) must call this one — only `initMinionPool` /
 *  `applyCaptainBonusTransition` (deciding whether to CROSS) may consult the live gate.
 *  The two disagree exactly in the states the no-backfill ruling deliberately permits: a
 *  pre-upgrade squad with a captain bound (flag absent, pool un-folded) and a squad whose
 *  bound captain is currently down (flag true, live gate 0) — see review report HIGH-1,
 *  PROBEs A/B. Prefers the persisted per-minion N (`captain_bonus_n`) over a fresh
 *  `withCaptainStaminaN` read so the readout stays correct even if the minion's own
 *  `with_captain`/`with_captain_stamina` data changes after the bonus was applied;
 *  falls back to the live parse only for a hand-authored flag with no persisted N. */
export function foldedCaptainStaminaBonus(minion: Creature): number {
    if (!minion.captain_bonus_active) return 0;
    return minion.captain_bonus_n ?? withCaptainStaminaN(minion) ?? 0;
}

/** SC-195 — squad-creation-time pool init, the drop-in replacement for the pre-SC-195
 *  `setMinionPool(group, creature, creature.max_stamina * creature.amount)` at every one
 *  of its call sites (guarded identically — only when `minionPoolOf(...) == null`, i.e.
 *  a brand-new squad; an existing pool is never recomputed from scratch here or
 *  anywhere). Bakes the ACTIVE captain bonus into BOTH the current and max ("Pool built
 *  WITH a captain bound: max = current = (per + N) × squad size. Built without a
 *  captain: no bonus" — SC-195 decisions ledger) and, ONLY when that bonus is actually
 *  nonzero, stamps `minion_stamina_pool_max` + `captain_bonus_active` so a later
 *  transition has a persisted baseline to diff against — an ordinary squad (no captain,
 *  or a captain with no Stamina bonus) therefore never grows these keys at all, keeping
 *  every pre-SC-195 fixture byte-identical. */
export function initMinionPool(group: EnemyGroup, creature: Creature): void {
    const bonus = captainStaminaBonus(group, creature);
    const max = (creature.max_stamina + bonus) * creature.amount;
    setMinionPool(group, creature, max);
    if (bonus > 0) {
        creature.minion_stamina_pool_max = max;
        creature.captain_bonus_active = true;
        creature.captain_bonus_n = bonus;
    }
}

/** SC-195 — call after any event that might change whether a squad's captain Stamina
 *  bonus is ACTIVE (promote, relieve, a captain's Stamina crossing 0, a down captain
 *  healed back above 0 while still bound): diffs the freshly-computed
 *  `captainStaminaBonus` against the squad's persisted `captain_bonus_active` flag and,
 *  ONLY on an actual crossing, applies the owner-ruled delta to BOTH current and max —
 *  `N × the ALIVE minion count at this moment` (RULING 1, quoted above), current clamped
 *  at 0. A flag that already matches the live state is a no-op — this is what makes
 *  promote-then-relieve with an unchanged alive count net to zero, and what keeps a
 *  render-time re-read of an unchanged squad idempotent (the bonus is NEVER re-derived
 *  wholesale here or anywhere at render — only this edge-triggered diff ever moves it).
 *  Returns true iff the pool actually moved (so a caller can decide whether the extra
 *  repaint/rebuild this implies is owed). */
export function applyCaptainBonusTransition(group: EnemyGroup, minion: Creature): boolean {
    const wasActive = minion.captain_bonus_active ?? false;
    const nowActive = captainStaminaBonus(group, minion) > 0;
    if (wasActive === nowActive) return false;

    const n = withCaptainStaminaN(minion) ?? 0;
    const alive = (minion.instances ?? []).filter((inst) => !inst.isDead).length;
    const delta = n * alive * (nowActive ? 1 : -1);

    const maxBefore = minionPoolMaxOf(minion);
    const currentBefore = minionPoolOf(group, minion) ?? maxBefore;

    minion.minion_stamina_pool_max = maxBefore + delta;
    setMinionPool(group, minion, Math.max(0, currentBefore + delta));
    minion.captain_bonus_active = nowActive;
    minion.captain_bonus_n = nowActive ? n : undefined;
    return true;
}

/** SC-195 fix round (MEDIUM-1, owner ruling) — the persisted bonus flag latches: nothing
 *  else ever fires the OFF-transition for a captain that leaves a squad by any route other
 *  than the promote/relieve controls or the captain-Stamina modal (both of which call
 *  `applyCaptainBonusTransition` directly) — e.g. a GM hand-edits the block to delete the
 *  captain's creature entry, or changes its `squad_role`/`captain_of`, then reloads. Call
 *  once per squad at parse time (both parse paths' phase-3 pool pass), for EVERY squad,
 *  not only newly-initialized ones.
 *
 *  Fires ONLY when `captain_bonus_active` is true AND the squad has NO bound captain at
 *  all (`captainOfSquad` returns undefined) — a present-but-down captain is a different,
 *  already-handled case (the live gate reads it as inactive, and the next real transition
 *  — promote/relieve/heal — reconciles it via `applyCaptainBonusTransition`). This does
 *  NOT contradict the no-backfill ruling: that ruling governs the ON direction only
 *  ("never silently ADD a bonus on load"); "no captain bound" is deterministic from the
 *  rules text ("While a minion squad has a captain") and this only ever REMOVES a
 *  stranded bonus, never adds one.
 *
 *  Uses the PERSISTED per-minion N (`captain_bonus_n`), not a fresh `withCaptainStaminaN`
 *  read, so the un-wind is exact even if the minion's own `with_captain`/
 *  `with_captain_stamina` data has also changed since the bonus was applied (falls back to
 *  the live parse only for a hand-authored `captain_bonus_active: true` with no persisted
 *  N). Returns true iff the pool actually moved. */
export function reconcileOrphanedCaptainBonus(group: EnemyGroup, minion: Creature): boolean {
    if (!minion.captain_bonus_active) return false;
    if (captainOfSquad(group, minion) != null) return false;

    const n = minion.captain_bonus_n ?? withCaptainStaminaN(minion) ?? 0;
    const alive = (minion.instances ?? []).filter((inst) => !inst.isDead).length;
    const delta = n * alive;

    const maxBefore = minionPoolMaxOf(minion);
    const currentBefore = minionPoolOf(group, minion) ?? maxBefore;

    minion.minion_stamina_pool_max = maxBefore - delta;
    setMinionPool(group, minion, Math.max(0, currentBefore - delta));
    minion.captain_bonus_active = false;
    minion.captain_bonus_n = undefined;
    return true;
}

/** SC-183 r3 — promote `creature` to captain of `minion`'s squad, one call, no other
 *  side effects: the squad's previous captain (if any, and if not `creature` itself) is
 *  relieved to `attached`, and `captain_of` is written only when the group holds more
 *  than one squad (so a one-squad group's YAML keeps its exact pre-#67 key set).
 *  Returns false when the promotion is not legal (not a squad group, or the target is
 *  itself a minion — "a captain is any non-Mount, non-minion creature", Draw Steel
 *  Monsters, "Using Minions"). */
export function promoteCaptain(group: EnemyGroup, creature: Creature, minion: Creature): boolean {
    if (!group.is_squad || creature.squad_role === "minion") return false;
    if (!minionCreatures(group).includes(minion)) return false;
    const previous = captainOfSquad(group, minion);
    if (previous && previous !== creature) {
        previous.squad_role = "attached";
        delete previous.captain_of;
    }
    // A creature can only captain one squad, so leaving it as another squad's captain
    // would double-book it.
    delete creature.captain_of;
    creature.squad_role = "captain";
    if (minionCreatures(group).length > 1) creature.captain_of = minion.name;
    return true;
}

/** SC-183 r3 — the inverse: the squad keeps its creature, loses its captain. */
export function relieveCaptain(creature: Creature): void {
    creature.squad_role = "attached";
    delete creature.captain_of;
}

/** SC-183 r3 / GH #67 — squad validation, transcribed ONCE and shared by both parse
 *  paths (the async oracle in this file and the sync split in
 *  `elements/initiative/model.ts`), so the two can no longer drift on what a legal squad
 *  group is. Runs BEFORE the creature loop in both, exactly as the legacy block did, so
 *  the `creature.name` interpolations still match legacy byte-for-byte.
 *
 *  WHAT #67 RELAXED, and why each cap went:
 *   - "at most two creatures": the whole point of #67 — a group holds several squads
 *     (Delian Tomb W1 group 3 is two "flows of the river" squads) plus captains and
 *     attached creatures.
 *   - "only one minion creature type": same; each minion creature is now its own squad
 *     with its own pool.
 *   - "at most one captain creature": relaxed to at most one captain PER SQUAD, which is
 *     what the rules actually say ("A squad of minions can have only one captain") and
 *     which for a one-squad group is the identical constraint, identical message. */
export function validateSquad(group: EnemyGroup): void {
    let minionCount = 0;
    group.creatures.forEach((creature) => {
        if (!creature.squad_role) {
            throw new Error(
                `Creature '${creature.name}' in squad '${group.name}' must have a 'squad_role' of 'minion' or 'captain'.`
            );
        }
        if (creature.squad_role === "minion") {
            minionCount += 1;
        } else if (creature.squad_role !== "captain" && creature.squad_role !== "attached") {
            throw new Error(
                `Creature '${creature.name}' in squad '${group.name}' has an invalid 'squad_role' value.`
            );
        }
    });
    if (minionCount === 0) {
        throw new Error(`Squad '${group.name}' must have at least one minion creature.`);
    }
    // A captain naming a squad must name one that exists, or the attachment is silently
    // inert — the exact failure mode `captain_of` was added to make impossible.
    const minions = minionCreatures(group);
    const minionNames = new Set(minions.map((m) => m.name));
    for (const captain of group.creatures.filter((c) => c.squad_role === "captain")) {
        if (captain.captain_of != null && !minionNames.has(captain.captain_of)) {
            throw new Error(
                `Captain '${captain.name}' in squad '${group.name}' names a 'captain_of' minion ('${captain.captain_of}') that is not in this group.`
            );
        }
    }
    // One captain per squad (the rules' own cap). For a single-squad group this is the
    // pre-#67 "at most one captain creature" check, message included.
    const unattachedCaptains = group.creatures.filter(
        (c) => c.squad_role === "captain" && c.captain_of == null
    );
    if (unattachedCaptains.length > 1) {
        throw new Error(`Squad '${group.name}' can have at most one captain creature.`);
    }
    for (const minion of minions) {
        const named = group.creatures.filter(
            (c) => c.squad_role === "captain" && c.captain_of === minion.name
        );
        if (named.length > 1) {
            throw new Error(
                `Squad '${group.name}' can have at most one captain per minion squad ('${minion.name}' has ${named.length}).`
            );
        }
    }
}

/** A single Malice pool event — a spend (Deliverable 2, D8 spec §3.2) or a manual
 *  trigger-based gain (quick-add, spec §3.3) — so the table can see where Malice went.
 *  `amount` is always the event's magnitude (never signed to mean "spend"); the label
 *  carries the meaning. */
export interface MaliceLogEntry {
    round: number;
    amount: number;
    label: string;
}

export interface Malice {
    value: number;
    /** Per-round automatic gain applied by "Advance round" (D8 spec §3.3, OD-3).
     *  ABSENT means no auto-gain — the reference omits the Director's-guide formula, so
     *  this is a configurable, user-set value with no built-in default; trigger-based
     *  gains (e.g. Feytouched +3) stay manual via the quick-add instead. Never
     *  fabricated (reference-math honesty note, D8 spec header). */
    round_gain?: number;
    /** Spend/gain log ({round, amount, label}), oldest-first. Absent/empty until the
     *  first quick-add or malice-feature spend (D8 spec §3.1/§3.2). Capped at
     *  `MALICE_LOG_MAX_ENTRIES` — see `appendMaliceLogEntry`, the ONLY sanctioned way to
     *  push onto this array (D8 Task 5 review carry-forward: an unbounded log grows the
     *  note forever across a long campaign). */
    log?: MaliceLogEntry[];
}

/** D8 Task 10 (Task 5 review carry-forward, "malice.log unbounded (cap policy)"): the
 *  most recent `MALICE_LOG_MAX_ENTRIES` entries are kept, oldest-first — a long-running
 *  campaign's round-gain + quick-add events would otherwise grow this array (and the
 *  note's byte size) forever. 50 is a generous multi-session buffer (the log is a
 *  "where did Malice go" readout, not an audit trail) with no reference-math basis to
 *  fabricate a different number from — a plain configurable constant, not a spec value. */
export const MALICE_LOG_MAX_ENTRIES = 50;

/** The ONLY sanctioned way to add a `MaliceLogEntry` (advanceRound's round-gain log and
 *  the quick-add handler both call this instead of pushing directly): materializes `log`
 *  on first use, appends, then trims from the front so the array never exceeds
 *  `MALICE_LOG_MAX_ENTRIES` (oldest entries drop first — newest/most-relevant survive). */
export function appendMaliceLogEntry(malice: Malice, entry: MaliceLogEntry): void {
    const log = malice.log ?? (malice.log = []);
    log.push(entry);
    if (log.length > MALICE_LOG_MAX_ENTRIES) {
        log.splice(0, log.length - MALICE_LOG_MAX_ENTRIES);
    }
}

export interface Condition {
    key: string;
    color?: string;
    effect?: string;
    /** SC-186 — additive, first-class duration (absent = "until removed"). Preferred
     *  over the legacy free-text `effect`-string duration vocabulary
     *  ('save ends' | 'eot' | 'eoe', case/whitespace-insensitive) that predates this
     *  field: readers should resolve via `resolveDuration()`
     *  (src/elements/conditionDuration.ts), which prefers this field and falls back to
     *  the tolerant `effect` parse, so hand-authored YAML with only `effect: eot` etc.
     *  keeps working unchanged. `effect` remains the separate CSS pulse-effect field
     *  ('blink' | 'glow' | 'glow-pulse' | 'breathing' | 'blur-pulse') — the two no
     *  longer share one slot. */
    duration?: 'eot' | 'save-ends' | 'eoe';
}

/** D7 Task 2 (spec §4.4, recon delta 7) — the structural superset of `Hero |
 *  CreatureInstance` that `ConditionsModal`'s ctor widens to, so `ds-conditions`'s
 *  standalone hero-sheet play-state (which is NOT a full CreatureInstance — no id,
 *  statblock ref, or initiative order) can open the SAME modal without fabricating
 *  those encounter-only fields. `conditions` is optional (mirroring
 *  `CreatureInstance.conditions?`) so both existing union members stay assignable —
 *  widening this parameter is source-compatible, not a breaking change: the
 *  initiative tracker's `Hero | CreatureInstance` callers keep typechecking
 *  unmodified. */
export interface ConditionHolder {
    conditions?: (string | Condition)[];
}

export interface EncounterData {
    heroes: Hero[];
    enemy_groups: EnemyGroup[];
    // REVIEW: should we make this into a number since Malice is only {value: number}?
    malice: Malice;
    /** Encounter round counter (D8 spec §7.3, additive). ABSENT → treated as round 1;
     *  advanced only via the initiative model's exported `advanceRound()` helper (Task 9,
     *  spec §7.2), which is the round-boundary control shared by the round display and the
     *  Malice panel's auto-gain — a strict superset of the sibling `resetRound()` helper
     *  (task-9-review.md HIGH finding: "Reset Round" stays as its own turn-only control,
     *  clearing has_taken_turn/actions WITHOUT touching this counter). */
    round?: number;
}

export function resetEncounter(data: EncounterData) {
    data.heroes.forEach((hero) => {
        hero.current_stamina = undefined;
        hero.temp_stamina = undefined;
        hero.has_taken_turn = undefined;
        hero.actions = undefined;
        hero.conditions = Array<Condition | string>();
    });
    data.enemy_groups.forEach((group) => {
        group.has_taken_turn = undefined;
        group.selectedInstanceKey = undefined;
        if (group.is_squad) {
            group.minion_stamina_pool = undefined;
            // SC-183 r3 / GH #67 — a multi-squad group keeps its pools on the creatures,
            // so clearing only the group field would leave every squad but the first at
            // its mid-fight value after a reset.
            group.creatures.forEach((creatureType) => {
                if (creatureType.squad_role === "minion") {
                    creatureType.minion_stamina_pool = undefined;
                    // SC-195 fix round (HIGH-2) — these two persisted fields are runtime
                    // state in exactly the same sense as the pool itself; leaving them
                    // behind stranded a stale max (and, if the flag happened to survive
                    // with a bonus-free pool, permanently no-op'd the next promote) after
                    // "Reset Encounter State".
                    creatureType.minion_stamina_pool_max = undefined;
                    creatureType.captain_bonus_active = undefined;
                    creatureType.captain_bonus_n = undefined;
                }
            });
        }
        group.creatures.forEach((creatureType) => {
            // Instances (and any per-instance `actions` they carried, D8 spec §7.3) are
            // dropped wholesale here — parse() rebuilds them fresh, unmaterialized, exactly
            // like a brand-new encounter.
            creatureType.instances = undefined;
        });
    });
    data.malice.value = 0;
    // The spend/gain log and round counter are per-encounter RUNTIME state — a fresh
    // encounter starts with neither. `round_gain` is a configured default (not
    // round-scoped state), so it survives a reset like max_stamina survives it.
    data.malice.log = undefined;
    data.round = undefined;
}

export async function parseEncounterData(source: string, app: App, settings: DSESettings): Promise<EncounterData> {
    let data: EncounterData;

    // Try parsing the YAML input
    try {
        data = parseYaml(source) as EncounterData;
    } catch (error: unknown) {
        throw new Error("Invalid YAML format: " + errorMessage(error));
    }

    const resolver = new ReferenceResolver(app, settings);

    // Validate that data is an object
    if (typeof data !== "object" || data === null) {
        throw new Error("The input must be a YAML object.");
    }

    // Validate 'heroes' field
    if (!data.heroes || !Array.isArray(data.heroes)) {
        throw new Error("Invalid data: 'heroes' field is missing or is not a list.");
    }

    // Validate 'enemy_groups' field
    if (!data.enemy_groups || !Array.isArray(data.enemy_groups)) {
        throw new Error("Invalid data: 'enemy_groups' field is missing or is not a list.");
    }

    // Initialize heroes
    for (const [index, hero] of data.heroes.entries()) {
        if (typeof hero.statblock === 'string') {
            try {
                const resolved = await resolver.resolveReferences(hero.statblock) as StatblockFields | null | undefined;
                if (resolved) {
                    if (!hero.name && resolved.name) hero.name = resolved.name as string;
                    if (!hero.max_stamina && resolved.stamina) hero.max_stamina = +(resolved.stamina as string | number);
                    if (!hero.image && resolved.image) hero.image = resolved.image as string;
                }
            } catch (e: unknown) {
                const message = `
Failed to resolve hero statblock reference at index ${index} (${hero.statblock}):
    ${errorMessage(e)}

Are there multiple instances of the '${hero.statblock}' file in your vault? If so, please specify the full path.
`;
                throw new Error(message);
            }
        }

        if (!hero.name) {
            throw new Error(`Hero at index ${index} is missing the 'name' field.`);
        }
        if (typeof hero.max_stamina !== "number") {
            throw new Error(`Hero '${hero.name}' is missing or has an invalid 'max_stamina' field.`);
        }

        hero.conditions =
            hero.conditions?.map((cond) => {
                if (typeof cond === "string") {
                    return {
                        key: cond,
                        color: undefined,
                        effect: undefined,
                        duration: undefined
                    }
                } else if (typeof cond === "object" && cond.key) {
                    return {
                        key: cond.key,
                        color: cond.color ?? undefined,
                        effect: cond.effect ?? undefined,
                        duration: cond.duration ?? undefined,
                    };
                } else {
                    throw new Error(`Invalid condition format for hero '${hero.name}'.`);
                }
            }) ?? [];

        hero.isHero = true;
        hero.has_taken_turn = hero.has_taken_turn ?? false;
        hero.current_stamina = hero.current_stamina ?? hero.max_stamina;
        hero.temp_stamina = hero.temp_stamina ?? 0;
    }

    // Initialize enemy groups and creatures
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
            // Squad-specific validation. SC-183 r3 / GH #67: the "at most two creatures"
            // and "only one minion creature type" caps are GONE — a group may hold several
            // squads (Delian Tomb W1) plus their captains and any attached creatures. What
            // survives is what still has meaning: every creature declares a role, the group
            // holds at least one squad, and no squad has two captains. (Transcribed in
            // lockstep with the sync split in elements/initiative/model.ts — the two parse
            // paths are byte-compat oracles for each other.)
            validateSquad(group);
        }

        for (const [creatureIndex, creature] of group.creatures.entries()) {
            if (typeof creature.statblock === 'string') {
                try {
                    const resolved = await resolver.resolveReferences(creature.statblock) as StatblockFields | null | undefined;
                    if (resolved) {
                        if (!creature.name && resolved.name) creature.name = resolved.name as string;
                        if (!creature.max_stamina && resolved.stamina) creature.max_stamina = +(resolved.stamina as string | number);
                        if (!creature.image && resolved.image) creature.image = resolved.image as string;
                    }
                } catch (e: unknown) {
                    const message = `
Failed to resolve creature statblock reference at index ${creatureIndex} (${creature.statblock}):
    ${errorMessage(e)}

Are there multiple instances of the '${creature.statblock}' file in your vault? If so, please specify the full path.
`;
                    throw new Error(message);
                }
            }

            if (!creature.name) {
                throw new Error(
                    `Creature at index ${creatureIndex} in group '${group.name}' is missing the 'name' field.`
                );
            }
            if (typeof creature.amount !== "number") {
                throw new Error(
                    `Creature '${creature.name}' in group '${group.name}' is missing or has an invalid 'amount' field.`
                );
            }
            if (typeof creature.max_stamina !== "number") {
                throw new Error(
                    `Creature '${creature.name}' in group '${group.name}' is missing or has an invalid 'max_stamina' field.`
                );
            }

            creature.isHero = false;

            // Initialize instances
            if (group.is_squad && creature.squad_role === "minion") {
                // For minions in a squad, they share a stamina pool
                // Initialize the shared stamina pool. SC-183 r3 / GH #67: resolved per
                // SQUAD now, and written back through setMinionPool — which keeps a
                // one-squad group's value on the GROUP (its historical home, so the block
                // serializes to the same bytes) and only materializes a per-creature pool
                // once a group actually holds more than one squad.
                if (minionPoolOf(group, creature) == null) {
                    // Initialize the pool to total stamina (max_stamina * amount)
                    setMinionPool(group, creature, creature.max_stamina * creature.amount);
                }
                // Initialize instances for minions (for conditions only)
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
                    // Validate existing instances
                    creature.instances.forEach((instance, instanceIndex) => {
                        if (typeof instance.id !== "number") {
                            throw new Error(
                                `Instance at index ${instanceIndex} of creature '${creature.name}' in group '${group.name}' is missing or has an invalid 'id' field.`
                            );
                        }
                        // For minions, we don't need to set current_stamina or temp_stamina
                        // Update conditions handling
                        instance.conditions =
                            instance.conditions?.map((cond) => {
                                if (typeof cond === "string") {
                                    return {
                                        key: cond,
                                        color: undefined,
                                        effect: undefined,
                                        duration: undefined
                                    }
                                } else if (typeof cond === "object" && cond.key) {
                                    return {
                                        key: cond.key,
                                        color: cond.color ?? undefined,
                                        effect: cond.effect ?? undefined,
                                        duration: cond.duration ?? undefined,
                                    };
                                } else {
                                    throw new Error(
                                        `Invalid condition format for instance '${instance.id}' of creature '${creature.name}'.`
                                    );
                                }
                            }) ?? [];
                    });
                }
            } else {
                // For regular creatures and captains
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
                    // Validate existing instances
                    creature.instances.forEach((instance, instanceIndex) => {
                        if (typeof instance.id !== "number") {
                            throw new Error(
                                `Instance at index ${instanceIndex} of creature '${creature.name}' in group '${group.name}' is missing or has an invalid 'id' field.`
                            );
                        }
                        instance.current_stamina = instance.current_stamina ?? creature.max_stamina;
                        instance.temp_stamina = instance.temp_stamina ?? 0;
                        // Update conditions handling
                        instance.conditions =
                            instance.conditions?.map((cond) => {
                                if (typeof cond === "string") {
                                    return {
                                        key: cond,
                                        color: undefined,
                                        effect: undefined,
                                        duration: undefined
                                    }
                                } else if (typeof cond === "object" && cond.key) {
                                    return {
                                        key: cond.key,
                                        color: cond.color ?? undefined,
                                        effect: cond.effect ?? undefined,
                                        duration: cond.duration ?? undefined,
                                    };
                                } else {
                                    throw new Error(
                                        `Invalid condition format for instance '${instance.id}' of creature '${creature.name}'.`
                                    );
                                }
                            }) ?? [];
                    });
                }
            }
        }
    }

    data.malice = data.malice ?? {value: 0};
    if (typeof data.malice.value !== "number") {
        throw new Error("Invalid data: 'malice.value' must be a number.");
    }

    return data;
}
