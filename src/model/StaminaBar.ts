import {parseYaml} from "obsidian";
import {Creature, CreatureInstance, Hero} from "@drawSteelAdmonition/EncounterData";

export class StaminaBar {
	max_stamina: number;
	current_stamina: number;
	temp_stamina: number;
	height: number;

	public static parseYaml(source: string) {
		let data: any;
		try {
			data = parseYaml(source);
		} catch (error: any) {
			throw new Error("Invalid YAML format: " + error.message);
		}
		return StaminaBar.parse(data);
	}

	public static parse(data: any): StaminaBar {
		return new StaminaBar(
			data.max_stamina,
			data.current_stamina ? data.current_stamina : data.max_stamina,
			data.temp_stamina ? data.temp_stamina : 0,
			data.height ? data.height : 1);
	}

	// TODO - should this be in Hero and CreatureInstance instead?  probably, but those are interfaces
	public static fromHero(hero: Hero) {
		return new StaminaBar(hero.max_stamina, hero.current_stamina, hero.temp_stamina, 1);
	}

	public static fromCreature(being: CreatureInstance, creature: Creature) {
		return new StaminaBar(creature.max_stamina, being.current_stamina, being.temp_stamina, 1);
	}

	constructor(max_stamina: number, current_stamina: number, temp_stamina: number, height: number) {
		this.max_stamina = max_stamina;
		this.current_stamina = current_stamina;
		this.temp_stamina = temp_stamina;
		this.height = height;
	}

	public updateHero(hero: Hero) {
		hero.max_stamina = this.max_stamina;
		hero.current_stamina = this.current_stamina;
		hero.temp_stamina = this.temp_stamina;
	}

	public updateCreature(creature: CreatureInstance) {
		creature.current_stamina = this.current_stamina;
		creature.temp_stamina = this.temp_stamina;
	}
}
