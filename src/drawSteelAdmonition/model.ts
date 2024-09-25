export interface Hero {
	name: string;
	max_hp: number;
	current_hp?: number;
	temp_hp?: number;
	image?: string;
	isHero: boolean;
	has_taken_turn?: boolean;
	conditions?: string[];
}

export interface CreatureInstance {
	id: number;
	current_hp: number;
	conditions?: string[];
}

export interface Creature {
	name: string;
	max_hp: number;
	amount: number;
	instances?: CreatureInstance[];
	image?: string;
	isHero: boolean;
}

export interface EnemyGroup {
	name: string;
	creatures: Creature[];
	has_taken_turn?: boolean;
}

export interface VillainPower {
	value: number;
}

export interface EncounterData {
	heroes: Hero[];
	enemy_groups: EnemyGroup[];
	villain_power: VillainPower;
}
