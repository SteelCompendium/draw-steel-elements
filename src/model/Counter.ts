import {parseYaml} from "obsidian";

export class Counter {
	max_value?: number;
	current_value: number;
	min_value: number;
	name: string;
	value_height: number;
	name_height: number;

	public static parseYaml(source: string) {
		let data: any;
		try {
			data = parseYaml(source);
		} catch (error: any) {
			throw new Error("Invalid YAML format: " + error.message);
		}
		return Counter.parse(data);
	}

	public static parse(data: any): Counter {
		return new Counter(
			data.max_value,
			data.current_value ? data.current_value : 0,
			data.min_value ? data.min_value : 0,
			data.name,
			data.value_height ? data.value_height : 3,
			data.name_height ? data.name_height : 1);
	}

	constructor(max_value: number| undefined, current_value: number, min_value: number, name: string, value_height: number, name_height: number) {
		this.max_value = max_value;
		this.current_value = current_value;
		this.min_value = min_value;
		this.name = name;
		this.value_height = value_height;
		this.name_height = name_height;
	}
}
