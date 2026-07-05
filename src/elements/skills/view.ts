// Plan 09 Task 2 (D2 §3.4) — SkillsView on the D2 kit: both the whole-element wrapper
// (the preserved `collapsible`/`collapse_default` YAML contract, F1 §1.4) and each skill
// group are kit `collapsible2` regions. Open-state round-trips through SessionStore via
// the SessionPersist accessor (F1 §4.3) — keyed by `cx.host.blockKey()`, never written
// back to the note (Skills has no `serialize`). Replaces the D1 rendering on the old
// kit componentWrapper/collapsibleHeading helpers (which stay for their remaining
// consumers until the Plan 09 final cleanup).
//
// collapsible2 collapses by HIDING its region (`hidden` attribute) rather than
// re-rendering content per expand cycle, so the old per-cycle contentOwner machinery is
// gone: content mounts exactly once per onMount and the only listeners are the kit's own
// owner-bound header clicks (bound to `this`, the view — one registration set per mount,
// torn down by the default update()/unload path).
//
// Marks are read-only display (D2 §3.4: skills are not a picker here): a <span
// role="img"> whose enabled/disabled state is conveyed by shape (solid vs hollow box via
// `[data-on]` CSS) + an aria-label — never color alone (§4), never a control.
//
// Preserves D1's fix of the latent Vue crash: SkillList.vue indexed
// `fullSkillData.value[customSkill.skill_group]` and unconditionally `.push()`ed onto it,
// crashing for ANY skill_group that didn't match one of the 5 built-in SKILL_DATA keys.
// buildGroupedSkillData below follows the documented behavior (docs/skills-element.md:
// unmatched/absent skill_group → the "Custom Skills" bucket) exactly.
import { ElementView } from '@/framework/view';
import { collapsible2 } from '@/framework/kit';
import { Skills, CustomSkill } from '@model/Skills';
import { SKILL_DATA, SkillInfo } from '@utils/SkillsData';
import { toProperCase } from '@utils/common';

/** SessionStore slot for the whole-element collapsible2 open-state (F1 §4.3). Stores the
 *  kit's OPEN boolean (true = expanded) — the inverse sense of the old ComponentWrapper
 *  'collapsed' slot it replaces (session-only state; nothing outlives a plugin reload). */
const WRAPPER_OPEN_SLOT = 'open';

/** Title shown in the whole-element collapsible2 header (the old ComponentWrapper
 *  componentName, previously visible only in the collapsed rail). */
const WRAPPER_TITLE = 'Skill List';

/** Internal-only bucket key for custom skills with no (or no matching) skill_group — never
 *  displayed; see groupDisplayName below for the user-facing label. */
const CUSTOM_SKILLS_GROUP_KEY = '__custom_skills__';
const CUSTOM_SKILLS_GROUP_LABEL = 'Custom Skills';

/**
 * Groups built-in SKILL_DATA skills plus custom_skills by group, per
 * docs/skills-element.md's documented rule: a custom skill's skill_group is honored only
 * when it matches one of the 5 built-in groups (case-insensitive); everything else (no
 * skill_group, or one that doesn't match) is bucketed under "Custom Skills". The bucket is
 * omitted entirely when empty.
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
 *  label (matching docs/skills-element.md); real SKILL_DATA / matched custom groups get
 *  the same toProperCase() treatment SkillGroup.vue applied. */
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

		// Whole-element wrapper (F1 §1.4 contract): `collapsible: false` opts out of the
		// collapse affordance entirely — the list renders bare (collapse_default only
		// applies to a collapsible element). Otherwise ONE collapsible2 wraps the list;
		// a session value (SessionPersist) beats the collapse_default seed, exactly as
		// the old SessionStore-then-model fallback read.
		if (!model.collapsible) {
			this.renderGroups(root, model);
			return;
		}
		const wrapper = collapsible2(
			root,
			{
				title: WRAPPER_TITLE,
				open: !model.collapse_default,
				persist: { session: this.cx.session, blockKey: this.blockKey, slot: WRAPPER_OPEN_SLOT },
			},
			this,
		);
		this.renderGroups(wrapper.contentEl, model);
	}

	private renderGroups(container: HTMLElement, model: Skills): void {
		const grouped = buildGroupedSkillData(model.custom_skills);
		const activeSkills = buildActiveSkills(model);
		const listContainer = container.createDiv({ cls: 'dse-skills' });
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
		const hasSkill = (name: string): boolean =>
			activeSkills.some((active) => active.toLowerCase() === name.toLowerCase());

		if (onlyShowSelected) {
			// Vue parity: bare heading, no collapse toggle in this mode (SkillGroup.vue's
			// `v-if="onlyShowSelected"` branch). Group headers still show even with zero
			// matching skills (docs/skills-element.md).
			const groupEl = parent.createDiv({ cls: 'dse-skills__group' });
			groupEl.createEl('h3', { text: groupDisplayName(groupKey), cls: 'dse-skills__group-title' });
			const list = groupEl.createEl('ul', { cls: 'dse-skills__list' });
			for (const skill of skills) {
				if (hasSkill(skill.name)) this.renderSkillItem(list, skill, true);
			}
			return;
		}

		// Per-group collapsible2: open-state lives at (blockKey, group:<key>) so it
		// survives the echo-rebuild (F1 §4.3) — the group-level persistence guarantee the
		// D1 rewrite introduced, now carried by the kit's SessionPersist round-trip.
		const group = collapsible2(
			parent,
			{
				title: groupDisplayName(groupKey),
				open: true,
				persist: { session: this.cx.session, blockKey: this.blockKey, slot: `group:${groupKey}` },
			},
			this,
		);
		group.rootEl.addClass('dse-skills__group');
		const list = group.contentEl.createEl('ul', { cls: 'dse-skills__list' });
		for (const skill of skills) {
			this.renderSkillItem(list, skill, hasSkill(skill.name));
		}
	}

	private renderSkillItem(list: HTMLElement, skill: SkillInfo, enabled: boolean): void {
		const item = list.createEl('li', { cls: 'dse-skills__item' });
		// Read-only status marker (not a control): state exposed as shape ([data-on]
		// drives the solid-vs-hollow CSS) + an accessible label — not color alone (§4).
		const mark = item.createSpan({ cls: 'dse-skills__mark' });
		if (enabled) mark.setAttribute('data-on', '');
		mark.setAttribute('role', 'img');
		mark.setAttribute('aria-label', enabled ? 'enabled' : 'disabled');
		item.createSpan({ cls: 'dse-skills__name', text: toProperCase(skill.name), title: skill.use });
	}
}
