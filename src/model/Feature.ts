import { parseYaml } from "obsidian";
import { validateDataWithSchema, ValidationError } from "@utils/JsonSchemaValidator";
import { ComponentWrapper } from "@model/ComponentWrapper";
import featureSchemaYaml from "@model/schemas/FeatureSchema.yaml";

export class Feature extends ComponentWrapper {
	name?: string;          // implemented
	icon?: string;          // implemented
	type: string;           // can be ignored for now
	feature_type: string;   // can be ignored for now
	usage?: string;         // implemented
	cost?: string;          // implemented
	ability_type?: string;  // implemented
	keywords?: string[];    // implemented
	distance?: string;      // implemented
	target?: string;        // implemented
	trigger?: string;
	effects: Effect[];
	flavor?: string;        
	metadata?: Record<string, any>;

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
			data.type,
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
		type: string,
		feature_type: string,
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
		this.type = "feature";
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

export class Effect {
	name?: string;
	cost?: string;
	effect?: string;
	roll?: string;
	features?: Feature[];
	tier1?: string;
	tier2?: string;
	tier3?: string;
	t1?: string;
	t2?: string;
	t3?: string;
	crit?: string;
	"11 or lower"?: string;
	"12-16"?: string;
	"17+"?: string;
	"nat 19-20"?: string;

	static parse(data: any): Effect {
		const features: Feature[] | undefined = data.features && Array.isArray(data.features)
			? data.features.map((f: any) => Feature.parse(f))
			: undefined;

		return new Effect(
			data.name,
			data.cost,
			data.effect,
			data.roll,
			features,
			data.tier1,
			data.tier2,
			data.tier3,
			data.t1,
			data.t2,
			data.t3,
			data.crit,
			data["11 or lower"],
			data["12-16"],
			data["17+"],
			data["nat 19-20"]
		);
	}

	constructor(
		name: string | undefined,
		cost: string | undefined,
		effect: string | undefined,
		roll: string | undefined,
		features: Feature[] | undefined,
		tier1: string | undefined,
		tier2: string | undefined,
		tier3: string | undefined,
		t1: string | undefined,
		t2: string | undefined,
		t3: string | undefined,
		crit: string | undefined,
		lower11: string | undefined,
		range1216: string | undefined,
		plus17: string | undefined,
		nat1920: string | undefined
	) {
		this.name = name;
		this.cost = cost;
		this.effect = effect;
		this.roll = roll;
		this.features = features;
		this.tier1 = tier1;
		this.tier2 = tier2;
		this.tier3 = tier3;
		this.t1 = t1;
		this.t2 = t2;
		this.t3 = t3;
		this.crit = crit;
		this["11 or lower"] = lower11;
		this["12-16"] = range1216;
		this["17+"] = plus17;
		this["nat 19-20"] = nat1920;
	}
}
