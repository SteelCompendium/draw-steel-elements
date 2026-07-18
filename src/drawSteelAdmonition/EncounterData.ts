import {App, parseYaml} from "obsidian";
import {DSESettings} from "@model/Settings";
import {ReferenceResolver} from "@utils/ReferenceResolver";

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
    statblock?: any; // To allow property fallback
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
    squad_role?: "minion" | "captain";
    statblock?: any; // To allow property fallback
}

export interface EnemyGroup {
    name: string;
    creatures: Creature[];
    has_taken_turn?: boolean;
    selectedInstanceKey?: string;
    is_squad?: boolean;
    minion_stamina_pool?: number;
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
}

/** D7 Task 2 (spec §4.4, recon delta 7) — the structural superset of `Hero |
 *  CreatureInstance` that `AddConditionsModal`'s ctor widens to, so `ds-conditions`'s
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
    } catch (error) {
        throw new Error("Invalid YAML format: " + error.message);
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
                const resolved = await resolver.resolveReferences(hero.statblock);
                if (resolved) {
                    if (!hero.name && resolved.name) hero.name = resolved.name;
                    if (!hero.max_stamina && resolved.stamina) hero.max_stamina = +resolved.stamina;
                    if (!hero.image && resolved.image) hero.image = resolved.image;
                }
            } catch (e) {
                const message = `
Failed to resolve hero statblock reference at index ${index} (${hero.statblock}):
    ${e.message}

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
                        effect: undefined
                    }
                } else if (typeof cond === "object" && cond.key) {
                    return {
                        key: cond.key,
                        color: cond.color ?? undefined,
                        effect: cond.effect ?? undefined,
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
            // Squad-specific validation
            if (group.creatures.length > 2) {
                throw new Error(
                    `Squad '${group.name}' can have at most two creatures (minions and an optional captain).`
                );
            }
            let minionCount = 0;
            let captainCount = 0;
            group.creatures.forEach((creature) => {
                if (!creature.squad_role) {
                    throw new Error(
                        `Creature '${creature.name}' in squad '${group.name}' must have a 'squad_role' of 'minion' or 'captain'.`
                    );
                }
                if (creature.squad_role === "minion") {
                    minionCount += 1;
                } else if (creature.squad_role === "captain") {
                    captainCount += 1;
                } else {
                    throw new Error(
                        `Creature '${creature.name}' in squad '${group.name}' has an invalid 'squad_role' value.`
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

        for (const [creatureIndex, creature] of group.creatures.entries()) {
            if (typeof creature.statblock === 'string') {
                try {
                    const resolved = await resolver.resolveReferences(creature.statblock);
                    if (resolved) {
                        if (!creature.name && resolved.name) creature.name = resolved.name;
                        if (!creature.max_stamina && resolved.stamina) creature.max_stamina = +resolved.stamina;
                        if (!creature.image && resolved.image) creature.image = resolved.image;
                    }
                } catch (e) {
                    const message = `
Failed to resolve creature statblock reference at index ${creatureIndex} (${creature.statblock}):
    ${e.message}

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
                // Initialize the shared stamina pool
                if (group.minion_stamina_pool == null) {
                    // Initialize the pool to total stamina (max_stamina * amount)
                    group.minion_stamina_pool = creature.max_stamina * creature.amount;
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
                                        effect: undefined
                                    }
                                } else if (typeof cond === "object" && cond.key) {
                                    return {
                                        key: cond.key,
                                        color: cond.color ?? undefined,
                                        effect: cond.effect ?? undefined,
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
                                        effect: undefined
                                    }
                                } else if (typeof cond === "object" && cond.key) {
                                    return {
                                        key: cond.key,
                                        color: cond.color ?? undefined,
                                        effect: cond.effect ?? undefined,
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
