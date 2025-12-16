import {parseYaml} from "obsidian";
import {Creature, CreatureInstance, Hero} from "@drawSteelAdmonition/EncounterData";
import { ComponentWrapper } from "@model/ComponentWrapper";
import { validateDataWithSchema, ValidationError } from "@utils/JsonSchemaValidator";
import staminaBarSchemaYaml from "@model/schemas/StaminaBarSchema.yaml";

export class StaminaBar extends ComponentWrapper{
	max_stamina: number;
	current_stamina: number;
	temp_stamina: number;
	height: number;
    style: string;

	public static parseYaml(source: string) {
		try {
			// Validate YAML content against YAML schema (all dependencies pre-registered)
			const validation = validateDataWithSchema(source, staminaBarSchemaYaml);
			if (!validation.valid) {
				const errorMessages = validation.errors.map((error: ValidationError) => 
					`${error.path}: ${error.message}`
				).join(', ');
				throw new Error("Schema validation failed: " + errorMessages);
			}

			// Parse the YAML after validation
			const data = parseYaml(source);
			return StaminaBar.parse(data);
		} catch (error: any) {
			throw new Error("Invalid YAML format: " + error.message);
		}
	}

	public static parse(data: any): StaminaBar {
		return new StaminaBar(
            data.collapsible,
            data.collapse_default,
			data.max_stamina,
			data.current_stamina ? data.current_stamina : 0,
			data.temp_stamina ? data.temp_stamina : 0,
			data.height ? data.height : 1,
            data.style);       
	}

	// TODO - should this be in Hero and CreatureInstance instead?  probably, but those are interfaces
	public static fromHero(hero: Hero) {
		return new StaminaBar(false, false, hero.max_stamina, hero.current_stamina ?? 0, hero.temp_stamina ?? 0, 1);
	}

	public static fromCreature(being: CreatureInstance, creature: Creature) {
		return new StaminaBar(false, false, creature.max_stamina, being.current_stamina ?? 0, being.temp_stamina ?? 0, 1);
	}

	constructor(collapsible: boolean, collapse_default: boolean, max_stamina: number, current_stamina: number, temp_stamina: number, height: number, style: string = "default") {
        super(collapsible, collapse_default);
		this.max_stamina = max_stamina;
		this.current_stamina = current_stamina;
		this.temp_stamina = temp_stamina;
		this.height = height;
        this.style = style
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
