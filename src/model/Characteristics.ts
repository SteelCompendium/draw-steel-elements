import {parseYaml} from "obsidian";

/** Raw YAML shape for a `Characteristics` block — parsed YAML is inherently untyped;
 *  every field is read with a truthy-check/default below, same as before this file
 *  was typed. */
interface RawCharacteristicsData {
	might?: number;
	agility?: number;
	reason?: number;
	intuition?: number;
	presence?: number;
	value_height?: number;
	name_height?: number;
}

export class Characteristics {
	might: number;
	agility: number;
	reason: number;
	intuition: number;
	presence: number;
	value_height: number;
	name_height: number;

	public static parseYaml(source: string) {
		let data: unknown;
		try {
			data = parseYaml(source);
		} catch (error: unknown) {
			throw new Error("Invalid YAML format: " + (error instanceof Error ? error.message : String(error)));
		}
		return Characteristics.parse(data);
	}

	public static parse(data: unknown): Characteristics {
		const raw = data as RawCharacteristicsData;
		return new Characteristics(
			raw.might ? raw.might : 0,
			raw.agility ? raw.agility : 0,
			raw.reason ? raw.reason : 0,
			raw.intuition ? raw.intuition : 0,
			raw.presence ? raw.presence : 0,
			raw.value_height ? raw.value_height : 3,
			raw.name_height ? raw.name_height : 1
		);
	}

	constructor(might: number, agility: number, reason: number, intuition: number, presence: number, value_height: number, name_height: number) {
		this.might = might;
		this.agility = agility;
		this.reason = reason;
		this.intuition = intuition;
		this.presence = presence;
		this.value_height = value_height;
		this.name_height = name_height;
	}
}
