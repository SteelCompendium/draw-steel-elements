// D1 Task 2 (Plan 03) / F1 §6 step "Skills" — SkillsView: re-expresses SkillList.vue +
// SkillGroup.vue as a createEl tree. Interactive shape (F1 §1.3): both the whole-element
// ComponentWrapper collapse and each group's individual collapse live in SessionStore,
// keyed by `cx.host.blockKey()` (F1 §4.3) — never written back to the note.
//
// Group-level collapse is a NEW persistence guarantee, not a regression: the legacy
// SkillGroup.vue tracked `isHeadingCollapsed` in a local `ref()` that was recreated (and so
// reset to expanded) on every block re-render — SessionStore is what F1 §4.3 exists to fix.
//
// Fixes a latent Vue crash as a byproduct of the rewrite (same spirit as D1's CB-17
// StaminaBar fix): SkillList.vue indexed `fullSkillData.value[customSkill.skill_group]` and
// unconditionally `.push()`ed onto it. For ANY skill_group that didn't match one of the 5
// built-in SKILL_DATA keys — including the code's own "no skill_group" fallback,
// "ungrouped skills", which was never itself a SKILL_DATA key either — this threw "Cannot
// read properties of undefined" and crashed the whole element. The documented behavior
// (docs/skills-element.md: "If skill_group matches an existing skill group... otherwise, it
// will be placed under 'Custom Skills'") and the (dead, unregistered) DOM twin
// `SkillsProcessor`/`SkillsView` both already implement the intended, non-crashing rule;
// buildGroupedSkillData below follows that documented behavior exactly.
import { ElementView } from '@/framework/view';
import { mountComponentWrapper } from '@/framework/kit/componentWrapper';
import { mountCollapsibleHeading } from '@/framework/kit/collapsible';
import { Skills, CustomSkill } from '@model/Skills';
import { SKILL_DATA, SkillInfo } from '@utils/SkillsData';
import { toProperCase } from '@utils/common';

/** SessionStore slot for the whole-element ComponentWrapper collapse (F1 §4.3). */
const WRAPPER_COLLAPSE_SLOT = 'collapsed';

/** Internal-only bucket key for custom skills with no (or no matching) skill_group — never
 *  displayed; see groupDisplayName below for the user-facing label. */
const CUSTOM_SKILLS_GROUP_KEY = '__custom_skills__';
const CUSTOM_SKILLS_GROUP_LABEL = 'Custom Skills';

/**
 * Groups built-in SKILL_DATA skills plus custom_skills by group, per
 * docs/skills-element.md's documented rule: a custom skill's skill_group is honored only
 * when it matches one of the 5 built-in groups (case-insensitive); everything else (no
 * skill_group, or one that doesn't match) is bucketed under "Custom Skills". The bucket is
 * omitted entirely when empty (mirrors the dead DOM twin's `if (...length > 0)` guard).
 */
function buildGroupedSkillData(customSkills: CustomSkill[]): Record<string, SkillInfo[]> {
	const grouped: Record<string, SkillInfo[]> = {};
	for (const [groupName, skills] of Object.entries(SKILL_DATA)) {
		grouped[groupName] = skills.map((skill) => ({ ...skill }));
	}

	const customBucket: SkillInfo[] = [];
	for (const custom of customSkills) {
		const requestedGroup = custom.skill_group?.trim().toLowerCase();
		const target = requestedGroup && grouped[requestedGroup] ? grouped[requestedGroup] : customBucket;
		target.push({ name: custom.name, use: custom.description ?? '' });
	}
	if (customBucket.length > 0) {
		grouped[CUSTOM_SKILLS_GROUP_KEY] = customBucket;
	}

	return grouped;
}

/** Display label for a group key — the internal "Custom Skills" bucket gets its literal
 *  label (matching docs/skills-element.md + the dead DOM twin); real SKILL_DATA / matched
 *  custom groups get the same toProperCase() treatment SkillGroup.vue applied. */
function groupDisplayName(key: string): string {
	return key === CUSTOM_SKILLS_GROUP_KEY ? CUSTOM_SKILLS_GROUP_LABEL : toProperCase(key);
}

/** Skills the character possesses: built-in `skills` plus any custom skill with
 *  `has_skill !== false` (default true, CustomSkill.parse). Case-insensitively matched
 *  against skill names at render time (mirrors SkillGroup.vue's `hasSkill`). */
function buildActiveSkills(model: Skills): string[] {
	const active = [...model.skills];
	for (const custom of model.custom_skills) {
		if (custom.has_skill) active.push(custom.name);
	}
	return active;
}

export class SkillsView extends ElementView<Skills> {
	private blockKey!: string;

	protected onMount(root: HTMLElement, model: Skills): void {
		this.blockKey = this.cx.host.blockKey();
		const collapsed = this.cx.session.get<boolean>(this.blockKey, WRAPPER_COLLAPSE_SLOT) ?? model.collapse_default;

		mountComponentWrapper(root, this, {
			componentName: 'Skill List',
			collapsible: model.collapsible,
			collapsed,
			renderContent: (contentEl) => this.renderGroups(contentEl, model),
			onToggle: (isCollapsed) => this.cx.session.set(this.blockKey, WRAPPER_COLLAPSE_SLOT, isCollapsed),
		});
	}

	private renderGroups(container: HTMLElement, model: Skills): void {
		const grouped = buildGroupedSkillData(model.custom_skills);
		const activeSkills = buildActiveSkills(model);
		const listContainer = container.createDiv({ cls: 'ds-skills-container' });
		for (const [groupKey, skills] of Object.entries(grouped)) {
			this.renderGroup(listContainer, groupKey, skills, activeSkills, model.only_show_selected);
		}
	}

	private renderGroup(
		parent: HTMLElement,
		groupKey: string,
		skills: SkillInfo[],
		activeSkills: string[],
		onlyShowSelected: boolean,
	): void {
		const groupEl = parent.createDiv({ cls: 'ds-skill-group' });
		const hasSkill = (name: string): boolean =>
			activeSkills.some((active) => active.toLowerCase() === name.toLowerCase());

		if (onlyShowSelected) {
			// Vue: bare <h3>, no collapse toggle in this mode (SkillGroup.vue's
			// `v-if="onlyShowSelected"` branch). Group headers still show even with zero
			// matching skills (docs/skills-element.md).
			groupEl.createEl('h3', { text: groupDisplayName(groupKey), cls: 'ds-skill-group-title' });
			const list = groupEl.createEl('ul', { cls: 'ds-skill-list' });
			for (const skill of skills) {
				if (hasSkill(skill.name)) this.renderSkillItem(list, skill, true);
			}
			return;
		}

		const slot = `group:${groupKey}`;
		let collapsed = this.cx.session.get<boolean>(this.blockKey, slot) ?? false;
		let listEl: HTMLElement | null = null;

		const renderList = (): void => {
			listEl?.remove();
			listEl = null;
			if (collapsed) return;
			listEl = groupEl.createEl('ul', { cls: 'ds-skill-list' });
			for (const skill of skills) {
				this.renderSkillItem(listEl, skill, hasSkill(skill.name));
			}
		};

		const handle = mountCollapsibleHeading(groupEl, this, {
			headerLevel: 3,
			enabled: !collapsed,
			text: groupDisplayName(groupKey),
			onToggle: (enabled) => {
				collapsed = !enabled;
				this.cx.session.set(this.blockKey, slot, collapsed);
				renderList();
			},
		});
		handle.headingEl.addClass('ds-skill-group-title');

		renderList();
	}

	private renderSkillItem(list: HTMLElement, skill: SkillInfo, enabled: boolean): void {
		const item = list.createEl('li', { cls: 'ds-skill-item' });
		const indicator = item.createSpan({ cls: 'ds-skill-indicator' });
		indicator.addClass(enabled ? 'enabled' : 'disabled');
		item.createSpan({ cls: 'ds-skill-name', text: toProperCase(skill.name), title: skill.use });
	}
}
