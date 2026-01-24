import { App, parseYaml } from "obsidian";
import { DSESettings } from "@model/Settings";
import { ReferenceResolver } from "@utils/ReferenceResolver";

export interface Hero {
	name: string;
	max_stamina: number;
	current_stamina?: number;
	temp_stamina?: number;
	image?: string;
	isHero: boolean;
	has_taken_turn?: boolean;
	conditions: (string | Condition)[];
	statblock?: any; // To allow property fallback
}

export interface CreatureInstance {
	id: number;
	current_stamina?: number;
	temp_stamina?: number;
	conditions?: (string | Condition)[];
	isDead?: boolean;
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

export interface Malice {
	value: number;
}

export interface Condition {
	key: string;
	color?: string;
	effect?: string;
}

export interface EncounterData {
	heroes: Hero[];
	enemy_groups: EnemyGroup[];
	// REVIEW: should we make this into a number since Malice is only {value: number}?
	malice: Malice;
}

export function resetEncounter(data: EncounterData) {
	data.heroes.forEach((hero) => {
		hero.current_stamina = undefined;
		hero.temp_stamina = undefined;
		hero.has_taken_turn = undefined;
		hero.conditions = Array<Condition | string>();
	});
	data.enemy_groups.forEach((group) => {
		group.has_taken_turn = undefined;
		group.selectedInstanceKey = undefined;
		if (group.is_squad) {
			group.minion_stamina_pool = undefined;
		}
		group.creatures.forEach((creatureType) => {
			creatureType.instances = undefined;
		});
	});
	data.malice.value = 0;
}

export async function parseEncounterData(source: string, app: App, settings: DSESettings): Promise<EncounterData> {
	let data: EncounterData;

	// Try parsing the YAML input
	try {
		data = parseYaml(source) as EncounterData;
		// We do NOT resolve all references recursively to preserve the strings in the object
		// Instead we resolve specific fields manually below
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
        if (typeof hero.statblock === 'string' && hero.statblock.startsWith('@')) {
            try {
                const resolved = await resolver.resolvePath(hero.statblock.substring(1));
                if (resolved) {
                    if (!hero.name && resolved.name) hero.name = resolved.name;
                    if (!hero.max_stamina && resolved.stamina) hero.max_stamina = +resolved.stamina;
                    if (!hero.image && resolved.image) hero.image = resolved.image;
                }
            } catch (e) {
                console.warn(`Draw Steel Elements: Failed to resolve statblock for hero at index ${heroIndex}`, e);
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
			if (typeof creature.statblock === 'string' && creature.statblock.startsWith('@')) {
				try {
					const resolved = await resolver.resolvePath(creature.statblock.substring(1));
					if (resolved) {
						if (!creature.name && resolved.name) creature.name = resolved.name;
                        if (!creature.max_stamina && resolved.stamina) creature.max_stamina = +resolved.stamina;
						if (!creature.image && resolved.image) creature.image = resolved.image;
					}
				} catch (e) {
					console.warn(`Draw Steel Elements: Failed to resolve statblock for creature at index ${creatureIndex}`, e);
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

	data.malice = data.malice ?? { value: 0 };
	if (typeof data.malice.value !== "number") {
		throw new Error("Invalid data: 'malice.value' must be a number.");
	}

	return data;
}
