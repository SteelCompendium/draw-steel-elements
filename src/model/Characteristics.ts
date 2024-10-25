import {parseYaml} from "obsidian";

export class Characteristics {
	might: number;
	agility: number;
	reason: number;
	intuition: number;
	presence: number;
	value_height: number;
	name_height: number;

	public static parseYaml(source: string) {
		let data: any;
		try {
			data = parseYaml(source);
		} catch (error: any) {
			throw new Error("Invalid YAML format: " + error.message);
		}
		return Characteristics.parse(data);
	}

	public static parse(data: any): Characteristics {
		return new Characteristics(
			data.might ? data.might : 0,
			data.agility ? data.agility : 0,
			data.reason ? data.reason : 0,
			data.intuition ? data.intuition : 0,
			data.presence ? data.presence : 0,
			data.value_height ? data.value_height : 3,
			data.name_height ? data.name_height : 1
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
