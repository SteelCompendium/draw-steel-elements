import {parseYaml} from "obsidian";

export class KeyValuePairs {
	values: KVPair[];
	value_height: number;
	name_height: number;

	public static parseYaml(source: string) {
		let data: any;
		try {
			data = parseYaml(source);
		} catch (error: any) {
			throw new Error("Invalid YAML format: " + error.message);
		}
		return KeyValuePairs.parse(data);
	}

	public static parse(data: any): KeyValuePairs {
		return new KeyValuePairs(KVPair.parseAll(data.values),
			data.value_height ? data.value_height : 3,
			data.name_height ? data.name_height : 1);
	}

	constructor(values: KVPair[], value_height: number, name_height: number) {
		this.values = values;
		this.value_height = value_height;
		this.name_height = name_height;
	}
}

export class KVPair {
	name?: string;
	value?: string;

	static parseAll(values: any): KVPair[] {
		if (!values) {
			return [];
		}
		if (!Array.isArray(values)) {
			throw new Error("Expected effects to be an array");
		}
		let effects = [];
		for (let entry of values) {
			if (entry.name && entry.effect) {
				effects.push(KVPair.parse(entry));
			} else if (typeof entry === "string" || typeof entry === "number") {
				effects.push(KVPair.nameless(entry));
			} else {
				effects.push(KVPair.parseKeyValue(entry));
			}
		}
		return effects;
	}

	static parseKeyValue(data: any) {
		const key: string = Object.keys(data)[0];
		const value: string = Object.values(data)[0];
		return new KVPair(key, value);
	}

	static parse(data: any) {
		return new KVPair(data.name, data.effect);
	}

	static nameless(effect: string | number) {
		return new KVPair(undefined, effect?.toString());
	}

	constructor(name?: string, value?: string) {
		this.name = name;
		this.value = value;
	}
}
