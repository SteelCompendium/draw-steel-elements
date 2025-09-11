import { parseYaml } from "obsidian";
import { validateYamlWithYamlSchema, ValidationError } from "@utils/JsonSchemaValidator";
import { ComponentWrapper } from "@model/ComponentWrapper";
import counterSchemaYaml from "@model/schemas/Counter.yaml";

export class Counter extends ComponentWrapper {
    name_top: string;
    name_bottom: string;
    current_value: number;
	max_value?: number;
	min_value: number;
    name_top_height: number;
    name_bottom_height: number;
	value_height: number;
    style: 'default' | 'horizontal' | 'vertical' | undefined;

	public static parseYaml(source: string) {
		try {
			// Validate YAML content against YAML schema (all dependencies pre-registered)
			const validation = validateYamlWithYamlSchema(source, counterSchemaYaml);
			if (!validation.valid) {
				const errorMessages = validation.errors.map((error: ValidationError) => 
					`${error.path}: ${error.message}`
				).join(', ');
				throw new Error("Schema validation failed: " + errorMessages);
			}

			// Parse the YAML after validation
			const data = parseYaml(source);
			return Counter.parse(data);
		} catch (error: any) {
			throw new Error("Invalid YAML format: " + error.message);
		}
	}

	public static parse(data: any): Counter {
		return {
            collapsible: data.collapsible,
            collapse_default: data.collapse_default,
            name_top: data.name_top,
            name_bottom: data.name_bottom,
            current_value: data.current_value,
            max_value: data.max_value,
            min_value: data.min_value,
            name_top_height: data.name_top_height,
            name_bottom_height: data.name_bottom_height,
            value_height: data.value_height,
            style: data.style
        } as Counter;
	}

	constructor(collapsible: boolean, collapse_default: boolean, max_value: number | undefined, current_value: number, min_value: number, name_top: string, name_bottom: string, value_height: number, name_top_height: number, name_bottom_height: number) {
		super(collapsible, collapse_default);
		this.max_value = max_value;
		this.current_value = current_value;
		this.min_value = min_value;
		this.name_top = name_top;
        this.name_bottom = name_bottom;
		this.value_height = value_height;
		this.name_top_height = name_top_height;
        this.name_bottom_height = name_bottom_height;
	}
}
