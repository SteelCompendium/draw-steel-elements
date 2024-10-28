import { Component, MarkdownPostProcessorContext, Plugin } from "obsidian";
import { Skills, CustomSkill } from "../../model/Skills";
import { SKILL_DATA } from "../../utils/SkillsData";

export class SkillsView {
	private plugin: Plugin;
	private data: Skills;
	private ctx: MarkdownPostProcessorContext;

	constructor(plugin: Plugin, data: Skills, ctx: MarkdownPostProcessorContext) {
		this.plugin = plugin;
		this.data = data;
		this.ctx = ctx;
	}

	public build(parent: HTMLElement) {
		const container = parent.createEl("div", { cls: "ds-skills-container" });

		// For each skill group
		for (const groupName in SKILL_DATA) {
			const groupSkills = SKILL_DATA[groupName];
			const groupContainer = container.createEl("div", { cls: "ds-skill-group" });
			const groupTitle = groupContainer.createEl("h3", { text: groupName, cls: "ds-skill-group-title" });
			const skillsList = groupContainer.createEl("ul", { cls: "ds-skill-list" });

			groupSkills.forEach((skillInfo) => {
				const hasSkill = this.hasSkill(skillInfo.name);
				const skillItem = skillsList.createEl("li", { cls: "ds-skill-item" });
				const indicator = skillItem.createEl("span", { cls: "ds-skill-indicator" });
				indicator.addClass(hasSkill ? "enabled" : "disabled");
				const skillName = skillItem.createEl("span", { cls: "ds-skill-name", text: skillInfo.name });
				skillName.setAttribute("title", skillInfo.use);
			});

			// Include custom skills for this group
			const customSkillsInGroup = this.data.custom_skills.filter(
				(cs) => cs.skill_group && cs.skill_group.toLowerCase() === groupName.toLowerCase()
			);
			customSkillsInGroup.forEach((customSkill) => {
				const skillItem = skillsList.createEl("li", { cls: "ds-skill-item" });
				const indicator = skillItem.createEl("span", { cls: "ds-skill-indicator" });
				indicator.addClass(customSkill.has_skill ? "enabled" : "disabled");
				const skillName = skillItem.createEl("span", { cls: "ds-skill-name", text: customSkill.name });
				skillName.setAttribute("title", customSkill.description || '');
			});
		}

		// Handle custom skills without a skill_group or with non-matching skill_group
		const customSkillsWithoutGroup = this.data.custom_skills.filter(
			(cs) => !cs.skill_group || !(cs.skill_group.toLowerCase() in SKILL_DATA)
		);

		if (customSkillsWithoutGroup.length > 0) {
			const customGroupContainer = container.createEl("div", { cls: "ds-skill-group" });
			const customGroupTitle = customGroupContainer.createEl("h3", {
				text: "Custom Skills",
				cls: "ds-skill-group-title",
			});
			const customSkillsList = customGroupContainer.createEl("ul", { cls: "ds-skill-list" });

			customSkillsWithoutGroup.forEach((customSkill) => {
				const skillItem = customSkillsList.createEl("li", { cls: "ds-skill-item" });
				const indicator = skillItem.createEl("span", { cls: "ds-skill-indicator" });
				indicator.addClass(customSkill.has_skill ? "enabled" : "disabled");
				const skillName = skillItem.createEl("span", { cls: "ds-skill-name", text: customSkill.name });
			});
		}
	}

	private hasSkill(skillName: string): boolean {
		// Check if the skill is in the skills array (case-insensitive)
		return this.data.skills.some((skill) => skill.toLowerCase() === skillName.toLowerCase());
	}
}
