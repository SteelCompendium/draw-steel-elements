import {parseYaml} from "obsidian";

export interface Hero {
	name: string;
	max_stamina: number;
	current_stamina?: number;
	temp_stamina?: number;
	image?: string;
	isHero: boolean;
	has_taken_turn?: boolean;
	conditions?: string[];
}

export interface CreatureInstance {
	id: number;
	current_stamina: number;
	conditions?: string[];
}

export interface Creature {
	name: string;
	max_stamina: number;
	amount: number;
	instances?: CreatureInstance[];
	image?: string;
	isHero: boolean;
}

export interface EnemyGroup {
	name: string;
    creatures: Creature[];
    has_taken_turn?: boolean;
    selectedInstanceKey: string;
}

export interface VillainPower {
	value: number;
}

export interface EncounterData {
	heroes: Hero[];
	enemy_groups: EnemyGroup[];
	villain_power: VillainPower;
}

export function parseEncounterData(source: string): EncounterData {
    let data: EncounterData;

    // Try parsing the YAML input
    try {
        data = parseYaml(source) as EncounterData;
    } catch (error) {
        throw new Error("Invalid YAML format: " + error.message);
    }

    // Validate that data is an object
    if (typeof data !== 'object' || data === null) {
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
    data.heroes.forEach((hero, index) => {
        if (!hero.name) {
            throw new Error(`Hero at index ${index} is missing the 'name' field.`);
        }
        if (typeof hero.max_stamina !== 'number') {
            throw new Error(`Hero '${hero.name}' is missing or has an invalid 'max_stamina' field.`);
        }

        hero.isHero = true;
        hero.has_taken_turn = hero.has_taken_turn ?? false;
        hero.conditions = hero.conditions ?? [];
        hero.current_stamina = hero.current_stamina ?? hero.max_stamina;
    });

    // Initialize enemy groups and creatures
    data.enemy_groups.forEach((group, groupIndex) => {
        if (!group.name) {
            throw new Error(`Enemy group at index ${groupIndex} is missing the 'name' field.`);
        }
        if (!group.creatures || !Array.isArray(group.creatures)) {
            throw new Error(`Enemy group '${group.name}' has an invalid or missing 'creatures' field.`);
        }

        group.has_taken_turn = group.has_taken_turn ?? false;

        group.creatures.forEach((creature, creatureIndex) => {
            if (!creature.name) {
                throw new Error(
                    `Creature at index ${creatureIndex} in group '${group.name}' is missing the 'name' field.`
                );
            }
            if (typeof creature.amount !== 'number') {
                throw new Error(
                    `Creature '${creature.name}' in group '${group.name}' is missing or has an invalid 'amount' field.`
                );
            }
            if (typeof creature.max_stamina !== 'number') {
                throw new Error(
                    `Creature '${creature.name}' in group '${group.name}' is missing or has an invalid 'max_stamina' field.`
                );
            }

            // Initialize instances
            if (!creature.instances || creature.instances.length !== creature.amount) {
                creature.instances = [];
                for (let i = 0; i < creature.amount; i++) {
                    creature.instances.push({
                        id: i + 1,
                        current_stamina: creature.max_stamina,
                        conditions: [],
                    });
                }
            } else {
                // Validate existing instances
                creature.instances.forEach((instance, instanceIndex) => {
                    if (typeof instance.id !== 'number') {
                        throw new Error(
                            `Instance at index ${instanceIndex} of creature '${creature.name}' in group '${group.name}' is missing or has an invalid 'id' field.`
                        );
                    }
                    instance.current_stamina = instance.current_stamina ?? creature.max_stamina;
                    instance.conditions = instance.conditions ?? [];
                });
            }
        });
    });

    // Initialize villain power
    data.villain_power = data.villain_power ?? {value: 0};
    if (typeof data.villain_power.value !== 'number') {
        throw new Error("Invalid data: 'villain_power.value' must be a number.");
    }

    return data;
}
