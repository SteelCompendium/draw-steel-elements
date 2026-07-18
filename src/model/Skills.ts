import { parseYaml } from "obsidian";
import { validateYamlWithYamlSchema, ValidationError } from "@utils/JsonSchemaValidator";
import { ComponentWrapper } from "@model/ComponentWrapper";
import skillsSchemaYaml from "@model/schemas/SkillsSchema.yaml";

/** Raw YAML shape after AJV validation against SkillsSchema.yaml (see parseYaml below)
 *  — validation guarantees the schema-declared fields, but every field stays optional
 *  here since (like the pre-existing `any`-typed code) each is still read with a
 *  truthy-check/default, never assumed present. */
interface RawSkillsData {
    skills?: string[];
    custom_skills?: unknown[];
    only_show_selected?: boolean;
    collapsible?: boolean;
    collapse_default?: boolean;
}

interface RawCustomSkillData {
    name?: string;
    has_skill?: boolean;
    skill_group?: string;
    description?: string;
}

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
			const data: unknown = parseYaml(source);
			return Skills.parse(data);
		} catch (error: unknown) {
			throw new Error("Invalid YAML format: " + (error instanceof Error ? error.message : String(error)));
		}
	}

	public static parse(data: unknown): Skills {
		const raw = data as RawSkillsData;
		const skills = raw.skills ? raw.skills : [];
		let custom_skills: CustomSkill[] = [];
		if (raw.custom_skills && Array.isArray(raw.custom_skills)) {
			raw.custom_skills.forEach((cs: unknown) => custom_skills.push(CustomSkill.parse(cs)));
		}
		return new Skills(raw.collapsible as boolean, raw.collapse_default as boolean, skills, custom_skills, raw.only_show_selected as boolean);
	}

	constructor(collapsible: boolean, collapse_default: boolean, skills: string[], custom_skills: CustomSkill[], only_show_selected: boolean) {
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

	static parse(data: unknown) {
		const raw = data as RawCustomSkillData;
		return new CustomSkill(raw.name as string, raw.has_skill ?? true, raw.skill_group, raw.description)
	}

	constructor(name: string, has_skill: boolean, skill_group: string | undefined, description: string | undefined) {
		this.name = name;
		this.has_skill = has_skill;
		this.skill_group = skill_group;
		this.description = description;
	}
}
