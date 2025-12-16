import { parseYaml } from "obsidian";
import { validateDataWithSchema, ValidationError } from "@utils/JsonSchemaValidator";
import horizontalRuleSchemaYaml from "@model/schemas/HorizontalRule.yaml";

export type HorizontalRuleVariant = 'default' | 'no-diamond' | 'flat' | 'flat-one-sided';

export class HorizontalRule {
	variant: HorizontalRuleVariant;

	public static parseYaml(source: string) {
		try {
			// Handle empty or whitespace-only source
			const trimmedSource = source.trim();
			if (!trimmedSource) {
				return new HorizontalRule('default');
			}

			// Validate YAML content against schema
			const validation = validateDataWithSchema(source, horizontalRuleSchemaYaml);
			if (!validation.valid) {
				const errorMessages = validation.errors.map((error: ValidationError) => 
					`${error.path}: ${error.message}`
				).join(', ');
				throw new Error("Schema validation failed: " + errorMessages);
			}

			// Parse the YAML after validation
			const data = parseYaml(source);
			return HorizontalRule.parse(data);
		} catch (error: any) {
			throw new Error("Invalid YAML format: " + error.message);
		}
	}

	public static parse(data: any): HorizontalRule {
		// Handle null or undefined data
		if (!data) {
			return new HorizontalRule('default');
		}
		const variant: HorizontalRuleVariant = data.variant || 'default';
		return new HorizontalRule(variant);
	}

	constructor(variant: HorizontalRuleVariant = 'default') {
		this.variant = variant;
	}
}
