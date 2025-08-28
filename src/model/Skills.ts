import { parseYaml } from "obsidian";
import { validateYamlWithYamlSchema, ValidationError } from "@utils/JsonSchemaValidator";
import { ComponentWrapper } from "@model/ComponentWrapper";
import skillsSchemaYaml from "@model/schemas/SkillsSchema.yaml";

export class Skills extends ComponentWrapper{
	skills: string[];
	custom_skills: CustomSkill[];
	only_show_selected: boolean;

	public static parseYaml(source: string) {
		try {
			// Validate YAML content against YAML schema (all dependencies pre-registered)
			const validation = validateYamlWithYamlSchema(source, skillsSchemaYaml);
			if (!validation.valid) {
				const errorMessages = validation.errors.map((error: ValidationError) => 
					`${error.path}: ${error.message}`
				).join(', ');
				throw new Error("Schema validation failed: " + errorMessages);
			}

			// Parse the YAML after validation
			const data = parseYaml(source);
			return Skills.parse(data);
		} catch (error: any) {
			throw new Error("Invalid YAML format: " + error.message);
		}
	}

	public static parse(data: any): Skills {
		const skills = data.skills ? data.skills : [];
		let custom_skills: CustomSkill[] = [];
		if (data.custom_skills && Array.isArray(data.custom_skills)) {
			data.custom_skills.forEach((cs: any) => custom_skills.push(CustomSkill.parse(cs)));
		}
		return new Skills(data.collapsible, data.collapse_default, skills, custom_skills, data.only_show_selected);
	}

	constructor( collapsible: boolean, collapse_default: boolean, skills: string[], custom_skills: CustomSkill[], only_show_selected: boolean) {
        super(collapsible, collapse_default);
		this.skills = skills;
		this.custom_skills = custom_skills;
		this.only_show_selected = only_show_selected ?? false;
	}
}

export class CustomSkill {
	name: string;
	has_skill: boolean;
	skill_group?: string;
	description?: string;

	static parse(data: any) {
		return new CustomSkill(data.name, data.has_skill ?? true, data.skill_group, data.description)
	}

	constructor(name: string, has_skill: boolean, skill_group: string | undefined, description: string | undefined) {
		this.name = name;
		this.has_skill = has_skill;
		this.skill_group = skill_group;
		this.description = description;
	}
}

