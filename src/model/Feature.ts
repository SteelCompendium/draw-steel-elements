import { parseYaml } from "obsidian";
import { validateDataWithSchema, ValidationError } from "@utils/JsonSchemaValidator";
import { ComponentWrapper } from "@model/ComponentWrapper";
import { Effect } from "@model/Effect";
import featureSchemaYaml from "@model/schemas/FeatureSchema.yaml";

export class Feature extends ComponentWrapper {
	name?: string;          // implemented
	icon?: string;          // implemented
	feature_type: string | undefined;   // implemented for "ability" and parially for "trait".
                                        // Further additions may be wanted, but it works for now.
	usage?: string;         // implemented
	cost?: string;          // implemented
	ability_type?: string;  // implemented
	keywords?: string[];    // implemented
	distance?: string;      // implemented
	target?: string;        // implemented
	trigger?: string;       // implemented
	effects: Effect[];      // implemented
	flavor?: string;        // implemented
	metadata?: Record<string, any>; // implemented

	public static parseYaml(source: string) {
		try {
			// Validate YAML content against YAML schema (all dependencies pre-registered)
			const validation = validateDataWithSchema(source, featureSchemaYaml);
			if (!validation.valid) {
				const errorMessages = validation.errors.map((error: ValidationError) => 
					`${error.path}: ${error.message}`
				).join(', ');
				throw new Error("Schema validation failed: " + errorMessages);
			}

			// Parse the YAML after validation
			const data = parseYaml(source);
			return Feature.parse(data);
		} catch (error: any) {
			throw new Error("Invalid YAML format: " + error.message);
		}
	}

	public static parse(data: any): Feature {
		const effects: Effect[] = [];
		if (data.effects && Array.isArray(data.effects)) {
			data.effects.forEach((e: any) => effects.push(Effect.parse(e)));
		}

		return new Feature(
			data.collapsible,
			data.collapse_default,
			data.name,
			data.icon,
			data.feature_type,
			data.usage,
			data.cost,
			data.ability_type,
			data.keywords,
			data.distance,
			data.target,
			data.trigger,
			effects,
			data.flavor,
			data.metadata
		);
	}

	constructor(
		collapsible: boolean,
		collapse_default: boolean,
		name: string | undefined,
		icon: string | undefined,
		feature_type: string = "ability",
		usage: string | undefined,
		cost: string | undefined,
		ability_type: string | undefined,
		keywords: string[] | undefined,
		distance: string | undefined,
		target: string | undefined,
		trigger: string | undefined,
		effects: Effect[],
		flavor: string | undefined,
		metadata: Record<string, any> | undefined
	) {
		super(collapsible, collapse_default);
		this.name = name;
		this.icon = icon;
		this.feature_type = feature_type;
		this.usage = usage;
		this.cost = cost;
		this.ability_type = ability_type;
		this.keywords = keywords;
		this.distance = distance;
		this.target = target;
		this.trigger = trigger;
		this.effects = effects;
		this.flavor = flavor;
		this.metadata = metadata;
	}
}
