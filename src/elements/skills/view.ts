// Plan 09 Task 2 (D2 §3.4) — SkillsView on the D2 kit: both the whole-element wrapper
// (the preserved `collapsible`/`collapse_default` YAML contract, F1 §1.4) and each skill
// group are kit `collapsible` regions. Open-state round-trips through SessionStore via
// the SessionPersist accessor (F1 §4.3) — keyed by `cx.host.blockKey()`, never written
// back to the note (Skills has no `serialize`). Replaces the D1 rendering on the old
// kit componentWrapper/collapsibleHeading helpers (deleted in the Plan 09 Task 10
// cleanup once no consumer remained).
//
// collapsible collapses by HIDING its region (`hidden` attribute) rather than
// re-rendering content per expand cycle, so the old per-cycle contentOwner machinery is
// gone: content mounts exactly once per onMount and the only listeners are the kit's own
// owner-bound header clicks (bound to `this`, the view — one registration set per mount,
// torn down by the default update()/unload path).
//
// Marks are read-only display (D2 §3.4: skills are not a picker here): a <span
// role="img"> whose enabled/disabled state is conveyed by shape (solid vs hollow box via
// `[data-on]` CSS) + an aria-label — never color alone (§4), never a control.
//
// SC-182 — three authored LAYOUTS via the YAML `style:` enum (list | ledger | chips;
// Scott's round-1 ruling: "implement both the ledger and chips options … set the style
// in the yaml"). `list` (the default, and the value an absent key takes) renders the
// classic checklist DOM byte-identically to before the field existed; the two others
// stamp `data-skills-style` on `.dse-skills` — the hook every SC-182 Steel screen rule
// keys on — and add a per-group owned/total tally in the header button.
//
// SC-182 — UNOWNED-SKILL VISIBILITY is one state with two writers:
//   initial   the authored `only_show_selected:` key (unchanged semantics), and
//   runtime   the menu-panel eye toggle (chromeItems below), whose flips persist in
//             SessionStore at (blockKey, 'unowned-hidden') — session beats YAML, the
//             same "block key seeds, session overrides" ladder the collapse state uses.
//             Session-only: toggling NEVER writes the note.
// While hidden, the `list` style keeps the legacy only_show_selected DOM verbatim (bare
// h3 headings, no group collapse — Vue parity, pinned by skills.test.ts); the ledger and
// chips styles keep their collapsible groups and tallies and simply render only the
// owned items — the tally's owned/total is exactly the "3 of 11 shown" context the
// filtered view needs.
//
// Preserves D1's fix of the latent Vue crash: SkillList.vue indexed
// `fullSkillData.value[customSkill.skill_group]` and unconditionally `.push()`ed onto it,
// crashing for ANY skill_group that didn't match one of the 5 built-in SKILL_DATA keys.
// buildGroupedSkillData below follows the documented behavior (docs/skills-element.md:
// unmatched/absent skill_group → the "Custom Skills" bucket) exactly.
import { ElementView } from '@/framework/view';
import { collapsible } from '@/framework/kit';
import type { ChromeMenuItem } from '@/framework/chrome/types';
import { Skills, CustomSkill, type SkillsStyle } from '@model/Skills';
import { SKILL_DATA, SkillInfo } from '@utils/SkillsData';
import { toProperCase } from '@utils/common';
import { resolveCollapsePrefs } from '@/prefs/catalog';

/** SessionStore slot for the whole-element collapsible open-state (F1 §4.3). Stores the
 *  kit's OPEN boolean (true = expanded) — the inverse sense of the old ComponentWrapper
 *  'collapsed' slot it replaces (session-only state; nothing outlives a plugin reload). */
const WRAPPER_OPEN_SLOT = 'open';

/** SC-182: SessionStore slot for the menu-panel unowned-visibility toggle. Stores the
 *  HIDDEN boolean (true = unowned skills hidden); absent = follow the block's own
 *  `only_show_selected:` key. Session-only, per block, never written to the note. */
const UNOWNED_HIDDEN_SLOT = 'unowned-hidden';

/** Title shown in the whole-element collapsible header (the old ComponentWrapper
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
		// applies to a collapsible element). Otherwise ONE collapsible wraps the list;
		// a session value (SessionPersist) beats the collapse_default seed, exactly as
		// the old SessionStore-then-model fallback read.
		//
		// D4 §1.3 (Plan 13, amended): block key > global pref > default — the existing
		// collapsible:/collapse_default: YAML keys ARE the per-block override.
		const { collapsible: isCollapsible, collapseDefault } = resolveCollapsePrefs(model, this.cx.prefs);
		if (!isCollapsible) {
			this.renderGroups(root, model);
			return;
		}
		const wrapper = collapsible(
			root,
			{
				title: WRAPPER_TITLE,
				open: !collapseDefault,
				persist: { session: this.cx.session, blockKey: this.blockKey, slot: WRAPPER_OPEN_SLOT },
			},
			this,
		);
		this.renderGroups(wrapper.contentEl, model);
	}

	/** SC-182: is the unowned half of the catalog currently hidden? Session (the menu
	 *  toggle's writes) beats the authored `only_show_selected:` key. */
	private unownedHidden(model: Skills): boolean {
		return this.cx.session.get<boolean>(this.blockKey, UNOWNED_HIDDEN_SLOT) ?? model.only_show_selected;
	}

	/**
	 * SC-182 — the menu-panel eye toggle (Scott's round-1 ask: "a button in the ds-skill
	 * menu panel to show/hide unowned skills so the user can toggle easily"). A
	 * view-contributed item (ElementView.chromeItems): the panel is rebuilt on every
	 * render, so icon + label always reflect the CURRENT state, and the click handler
	 * persists the flip to SessionStore and re-renders through the standard update()
	 * path — which also remounts the panel with the flipped icon. Session-only, so the
	 * toggle is legitimate on read-only hosts too (same reasoning as the chrome
	 * collapse: no note writes).
	 */
	chromeItems(): ChromeMenuItem[] {
		if (!this.model) return [];
		const hidden = this.unownedHidden(this.model);
		return [
			{
				id: 'skills-unowned',
				icon: hidden ? 'eye' : 'eye-off',
				label: hidden ? 'Show unowned skills' : 'Hide unowned skills',
				onClick: () => {
					this.cx.session.set(this.blockKey, UNOWNED_HIDDEN_SLOT, !this.unownedHidden(this.model));
					void this.update(this.model);
				},
			},
		];
	}

	private renderGroups(container: HTMLElement, model: Skills): void {
		const grouped = buildGroupedSkillData(model.custom_skills);
		const activeSkills = buildActiveSkills(model);
		const listContainer = container.createDiv({ cls: 'dse-skills' });
		// SC-182 — the authored layout (YAML `style:`). `list` (the default) is the
		// classic checklist VERBATIM: no attribute is stamped and renderGroup takes its
		// untouched path, so a block without the key renders — and prints — the exact
		// DOM it always has. A non-default style stamps `data-skills-style`, the hook
		// every SC-182 Steel screen rule keys on.
		//
		// Destructured rather than read as a member: the shared kit style guard
		// (test/dom/kit/styleGuard.ts) blanket-bans the `.style` token to catch inline
		// DOM styling, and a YAML field that happens to be NAMED `style` would trip the
		// same scan.
		const { style } = model;
		if (style !== 'list') listContainer.setAttribute('data-skills-style', style);
		const hideUnowned = this.unownedHidden(model);
		for (const [groupKey, skills] of Object.entries(grouped)) {
			this.renderGroup(listContainer, groupKey, skills, activeSkills, hideUnowned, style);
		}
	}

	private renderGroup(
		parent: HTMLElement,
		groupKey: string,
		skills: SkillInfo[],
		activeSkills: string[],
		hideUnowned: boolean,
		style: SkillsStyle,
	): void {
		const hasSkill = (name: string): boolean =>
			activeSkills.some((active) => active.toLowerCase() === name.toLowerCase());

		if (hideUnowned && style === 'list') {
			// Vue parity, unchanged since D1: the classic checklist's hidden-unowned form
			// is a bare heading with no collapse toggle (SkillGroup.vue's
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

		// Per-group collapsible: open-state lives at (blockKey, group:<key>) so it
		// survives the echo-rebuild (F1 §4.3) — the group-level persistence guarantee the
		// D1 rewrite introduced, now carried by the kit's SessionPersist round-trip.
		const group = collapsible(
			parent,
			{
				title: groupDisplayName(groupKey),
				open: true,
				persist: { session: this.cx.session, blockKey: this.blockKey, slot: `group:${groupKey}` },
			},
			this,
		);
		group.rootEl.addClass('dse-skills__group');
		// SC-182 ledger/chips only (never the classic list): a per-group owned/total
		// tally at the header's right edge — the scan a player actually does ("how many
		// Lore skills do I have?") without opening the group. A track-style fraction
		// ("3/11", the stamina "15/20" grammar) — unambiguous in a header that already
		// names the group, and exactly the context the hidden-unowned form needs (the
		// total says how much of the catalog is folded away). Rendered inside the header
		// <button>, so the group's accessible name reads "crafting, 1/8" and the tally
		// survives the collapsed state.
		if (style !== 'list') {
			const owned = skills.filter((skill) => hasSkill(skill.name)).length;
			group.headerEl.createSpan({
				cls: 'dse-skills__tally',
				text: `${owned}/${skills.length}`,
			});
		}
		const list = group.contentEl.createEl('ul', { cls: 'dse-skills__list' });
		for (const skill of skills) {
			const owned = hasSkill(skill.name);
			// SC-182: the ledger/chips hidden-unowned form keeps the collapsible group +
			// tally and simply omits the unowned items (the `list` style's hidden form is
			// the legacy branch above).
			if (hideUnowned && !owned) continue;
			this.renderSkillItem(list, skill, owned);
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
