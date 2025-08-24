import {parseYaml} from "obsidian";

export class Skills {
	skills: string[];
	custom_skills: CustomSkill[];

	public static parseYaml(source: string) {
		let data: any;
		try {
			data = parseYaml(source);
		} catch (error: any) {
			throw new Error("Invalid YAML format: " + error.message);
		}
		return Skills.parse(data);
	}

	public static parse(data: any): Skills {
		const skills = data.skills ? data.skills : [];
		let custom_skills: CustomSkill[] = [];
		if (data.custom_skills && Array.isArray(data.custom_skills)) {
			data.custom_skills.forEach((cs: any) => custom_skills.push(CustomSkill.parse(cs)));
		}
		return new Skills(skills, custom_skills);
	}

	constructor(skills: string[], custom_skills: CustomSkill[]) {
		this.skills = skills;
		this.custom_skills = custom_skills;
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

