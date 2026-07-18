// D8 Task 7 (spec §5) — ProjectView: the ds-project downtime tracker, negotiation/montage
// -sibling (cardHead + a canPersist-gated write bar, no legacy predecessor to port).
//
// Optional D6 dep: `goal_code` (an SCC `project`-type code) resolves goal_name/
// goal_points LIVE for display when the inline fields are absent — never persisted back
// into the model (same "recompute wins, but here just for DISPLAY" spirit as encounter's
// live EV, minus the _computed cache: project's schema has no such field, spec §5.2).
// There is no typed SDK reader for `project` (typeAdapters.ts has no adapter for it —
// only `rule.*`'s model-less family comes close), so resolution reads
// CompendiumIndex.getEntity() directly: `entry.name` (frontmatter item_name/name/
// basename) for goal_name, and a `**Project Goal:** <points>` regex over the resolved
// body text for goal_points (the real corpus's own prose shape — see
// data-unified/en/unified/md-dse/project/*.md; a non-numeric goal, e.g. "Varies", simply
// leaves goal_points unresolved rather than fabricating a number).
//
// Project rolls (REF §10/AGENT 872-908): characteristic + skill, 2d10. `roll` = the
// natural (pre-modifier) 2d10 sum — RollResult.natural IS this value, and
// RollResult.isNat IS "natural 19-20" (breakthrough, AGENT 878) — so the optional D5
// roller path feeds addRoll(natural, total, isNat) directly; manual entry (always
// available, roller-independent) uses the same addRoll with typed roll/points/
// breakthrough. Breakthrough logs `points` INCLUSIVE of the +20 bonus and surfaces a
// "bonus roll" banner, derived live from the log (model.ts's hasPendingBreakthroughRoll)
// rather than a separate persisted flag — it naturally clears once another roll (of
// either kind) is logged.
import { Component } from 'obsidian';
import { ElementView } from '@/framework/view';
import { cardHead, iconButton } from '@/framework/kit';
import { normalizeSccTarget } from '@/refs/SccResolver';
import type { RollService } from '@/framework/roll/service';
import type { ProjectModel, ProjectRoll } from './model';
import { BREAKTHROUGH_BONUS, progressPercent, hasPendingBreakthroughRoll } from './model';

const PROJECT_GOAL_RE = /\*\*Project Goal:\*\*\s*([\d,]+)/;

interface ResolvedGoal {
	name?: string;
	points?: number;
}

export class ProjectView extends ElementView<ProjectModel> {
	protected async onMount(root: HTMLElement, model: ProjectModel): Promise<void> {
		const cycleOwner = this.addChild(new Component());
		const canPersist = this.cx.host.canPersist;

		const resolved = await this.resolveGoal(model);

		const container = root.createDiv({ cls: 'dse-prj' });

		this.buildHead(container, cycleOwner, model, resolved);
		this.buildProgress(container, model, resolved);
		this.buildPrerequisites(container, model);
		this.buildBreakthroughBanner(container, model);
		this.buildRollLog(container, model);
		this.buildActions(container, cycleOwner, model, canPersist);
	}

	// ------------------------------------------------------------------- D6 resolve

	/** spec §5: optional D6 resolution of `goal_code` -> prefill points/name FOR DISPLAY
	 *  ONLY (inline `goal_name`/`goal_points`, when present, always win — never
	 *  overwritten). No adapter exists for the `project` SCC type (typeAdapters.ts), so
	 *  this reads `CompendiumIndex.getEntity()` directly rather than `.model()`. Degrades
	 *  silently to `{}` (inline-field fallback, no error surface) whenever the code is
	 *  absent, the compendium isn't installed/synced, or the entity can't be found —
	 *  matching the brief's "inline fallback otherwise." */
	private async resolveGoal(model: ProjectModel): Promise<ResolvedGoal> {
		if (!model.goal_code) return {};
		const index = this.cx.compendium;
		if (!index || !index.available) return {};
		const bareCode = normalizeSccTarget(model.goal_code) ?? model.goal_code;
		const entity = await index.getEntity(bareCode);
		if (!entity) return {};
		const body = await entity.body();
		const match = PROJECT_GOAL_RE.exec(body);
		const points = match ? Number(match[1].replace(/,/g, '')) : undefined;
		return { name: entity.name, points: points !== undefined && !Number.isNaN(points) ? points : undefined };
	}

	// ------------------------------------------------------------------------- build

	private buildHead(container: HTMLElement, owner: Component, model: ProjectModel, resolved: ResolvedGoal): void {
		const head = container.createDiv({ cls: 'dse-prj__head' });
		const name = model.goal_name?.trim() || resolved.name?.trim() || '';
		cardHead(
			head,
			{
				leftEyebrow: name ? 'Project' : undefined,
				name: name || 'Project',
				rightEyebrow: `Respite ${model.current_respite}`,
				level: 2,
			},
			owner,
		);
	}

	private buildProgress(container: HTMLElement, model: ProjectModel, resolved: ResolvedGoal): void {
		const goalPoints = model.goal_points ?? resolved.points;
		const pct = progressPercent(model.accrued, goalPoints);

		const wrap = container.createDiv({ cls: 'dse-prj__progress' });
		const track = wrap.createDiv({ cls: 'dse-prj__bar' });
		const fill = track.createDiv({ cls: 'dse-prj__bar-fill' });
		fill.style.setProperty('--dse-fill', `${pct ?? 0}%`);

		wrap.createDiv({
			cls: 'dse-prj__progress-text',
			text: goalPoints !== undefined ? `${model.accrued} / ${goalPoints}` : `${model.accrued} pts`,
		});
	}

	private buildPrerequisites(container: HTMLElement, model: ProjectModel): void {
		const item = model.prerequisites?.item;
		const source = model.prerequisites?.source;
		if (!item && !source) return;
		const wrap = container.createDiv({ cls: 'dse-prj__prereqs' });
		if (item) wrap.createDiv({ cls: 'dse-prj__prereq', text: `Item: ${item}` });
		if (source) wrap.createDiv({ cls: 'dse-prj__prereq', text: `Source: ${source}` });
	}

	/** spec §5.2/AGENT 878: derived (never persisted) — shown whenever the LAST logged
	 *  roll granted a bonus roll that hasn't been superseded by a subsequent one. */
	private buildBreakthroughBanner(container: HTMLElement, model: ProjectModel): void {
		if (!hasPendingBreakthroughRoll(model)) return;
		container.createDiv({
			cls: 'dse-prj__breakthrough',
			text: `Breakthrough! +${BREAKTHROUGH_BONUS} points banked — roll again this respite.`,
		});
	}

	private buildRollLog(container: HTMLElement, model: ProjectModel): void {
		if (model.rolls.length === 0) return;
		const wrap = container.createDiv({ cls: 'dse-prj__log' });
		wrap.createDiv({ cls: 'dse-prj__log-header', text: 'Project rolls' });
		for (const entry of model.rolls) {
			const row = wrap.createDiv({ cls: 'dse-prj__log-row' });
			if (entry.breakthrough) row.addClass('dse-prj__log-row--breakthrough');
			row.createSpan({ cls: 'dse-prj__log-respite', text: `Respite ${entry.respite}` });
			row.createSpan({ cls: 'dse-prj__log-roll', text: `Roll ${entry.roll}` });
			row.createSpan({ cls: 'dse-prj__log-points', text: `+${entry.points} pts` });
			if (entry.breakthrough) row.createSpan({ cls: 'dse-prj__log-badge', text: 'Breakthrough' });
		}
	}

	// ------------------------------------------------------------------------ actions

	/** F1 §4.4: the whole write bar (roll form + Log respite) is omitted entirely on a
	 *  read-only host — the progress bar / prereqs / log above render identically either
	 *  way (pure display), no dead-end write affordance. */
	private buildActions(container: HTMLElement, owner: Component, model: ProjectModel, canPersist: boolean): void {
		if (!canPersist) return;
		const bar = container.createDiv({ cls: 'dse-prj__actions' });

		this.buildRollForm(bar, owner, model);

		iconButton(
			bar,
			{
				icon: 'moon',
				label: 'Log respite',
				text: 'Log respite',
				onClick: () => this.logRespite(),
			},
			owner,
		);
	}

	/** Manual entry (always available) + an optional roller row when cx.roll is wired
	 *  (D5). Roll totals entered manually, OR via the roller — never both required. */
	private buildRollForm(parent: HTMLElement, owner: Component, model: ProjectModel): void {
		const form = parent.createDiv({ cls: 'dse-prj__roll-form' });

		const rollInput = form.createEl('input', { cls: 'dse-prj__roll-input', type: 'number' }) as HTMLInputElement;
		rollInput.setAttribute('aria-label', 'Roll (natural 2d10 total)');
		rollInput.setAttribute('placeholder', 'Roll');

		const pointsInput = form.createEl('input', { cls: 'dse-prj__points-input', type: 'number' }) as HTMLInputElement;
		pointsInput.setAttribute('aria-label', 'Points earned');
		pointsInput.setAttribute('placeholder', 'Points');

		const breakthroughLabel = form.createEl('label', { cls: 'dse-prj__breakthrough-label' });
		const breakthroughInput = breakthroughLabel.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
		breakthroughInput.setAttribute('aria-label', 'Breakthrough (natural 19-20)');
		breakthroughLabel.createSpan({ text: 'Breakthrough' });

		iconButton(
			form,
			{
				icon: 'check',
				label: 'Add project roll',
				text: 'Add project roll',
				onClick: () => {
					const roll = Number(rollInput.value) || 0;
					const points = Number(pointsInput.value) || 0;
					this.addRoll(roll, points, breakthroughInput.checked);
				},
			},
			owner,
		);

		const roll = this.cx.roll;
		if (roll) this.buildRollerRow(form, owner, roll);
	}

	/** The optional D5 roller row (recon §10: RollService.resolve(input, dice?) sync,
	 *  injected DiceSource in tests — montage's ParticipantsView established this
	 *  pattern). `natural` -> logged `roll`; `total` -> logged `points`; `isNat` ->
	 *  breakthrough, exactly matching AGENT 878's "natural 19-20" trigger. */
	private buildRollerRow(parent: HTMLElement, owner: Component, roll: RollService): void {
		const charInput = parent.createEl('input', {
			cls: 'dse-prj__char-input',
			type: 'number',
			value: '0',
		}) as HTMLInputElement;
		charInput.setAttribute('aria-label', 'Characteristic');

		const skillLabel = parent.createEl('label', { cls: 'dse-prj__skill-label' });
		const skillInput = skillLabel.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
		skillInput.setAttribute('aria-label', 'Applicable skill (+2)');
		skillLabel.createSpan({ text: 'Skill (+2)' });

		iconButton(
			parent,
			{
				icon: 'dices',
				label: 'Roll a project test',
				text: 'Roll',
				onClick: () => {
					const result = roll.resolve({
						mode: 'test',
						characteristic: Number(charInput.value) || 0,
						skillBonus: skillInput.checked ? 2 : 0,
					});
					this.addRoll(result.natural, result.total, result.isNat);
				},
			},
			owner,
		);
	}

	/** User mutation: append the roll (points inclusive of any breakthrough bonus),
	 *  accrue, rebuild (a fresh roll can flip the breakthrough banner/goal completion),
	 *  persist. Rendering never writes — this only runs from a click. */
	private addRoll(roll: number, points: number, breakthrough: boolean): void {
		const total = points + (breakthrough ? BREAKTHROUGH_BONUS : 0);
		const entry: ProjectRoll = { respite: this.model.current_respite, roll, points: total };
		if (breakthrough) entry.breakthrough = true;
		this.model.rolls.push(entry);
		this.model.accrued += total;
		void this.update(this.model);
		void this.persist();
	}

	private logRespite(): void {
		this.model.current_respite += 1;
		void this.update(this.model);
		void this.persist();
	}
}
