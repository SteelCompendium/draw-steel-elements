// D8 Task 7 (spec §5) — ds-project model.ts: parse + serialize for the Project/Downtime
// tracker. BRAND NEW element with no legacy predecessor (same convention as montage/
// encounter, D8 Tasks 4/6) — no external byte-compat oracle to transcribe against; the
// contract is self-referential. parse builds a plain object in FIXED schema key order
// (goal_name, goal_code, goal_points, accrued, prerequisites, rolls, current_respite,
// _dse_anchor — spec §5.2's own example order), materializing defaults ONLY for
// accrued(0)/rolls([])/current_respite(1) (the brief's explicit list) — never for a key
// the input already fixes, and never inventing a key the input omits (goal_name/
// goal_code/goal_points/prerequisites/_dse_anchor stay absent). This makes
// serialize(parse(x)) reproduce x's own bytes whenever x already carries the full field
// set in schema order (project-serialize.test.ts's oracle).
import { stringifyYaml } from 'obsidian';

export interface ProjectRoll {
	respite: number;
	/** The natural (unmodified) 2d10 roll total — 19-20 triggers breakthrough (AGENT 878). */
	roll: number;
	/** Points earned by THIS entry, already including the +20 breakthrough bonus (if any). */
	points: number;
	breakthrough?: boolean;
}

export interface ProjectPrerequisites {
	item?: string;
	source?: string;
}

export interface ProjectModel {
	goal_name?: string;
	/** Optional D6 resolve target: an SCC `project` code (data-unified has a `project`
	 *  type, but no typed SDK model exists for it — the view resolves goal_name/
	 *  goal_points live from the resolved entity's name + body text, never persisted
	 *  back into these inline fields). */
	goal_code?: string;
	goal_points?: number;
	accrued: number;
	prerequisites?: ProjectPrerequisites;
	rolls: ProjectRoll[];
	current_respite: number;
	_dse_anchor?: string;
}

export function parse(data: unknown, _raw: string): ProjectModel {
	const d = (data ?? {}) as Partial<ProjectModel>;
	const model = {} as ProjectModel;
	if (d.goal_name !== undefined) model.goal_name = d.goal_name;
	if (d.goal_code !== undefined) model.goal_code = d.goal_code;
	if (d.goal_points !== undefined) model.goal_points = d.goal_points;
	model.accrued = d.accrued ?? 0;
	if (d.prerequisites !== undefined) model.prerequisites = d.prerequisites;
	model.rolls = d.rolls ?? [];
	model.current_respite = d.current_respite ?? 1;
	if (d._dse_anchor !== undefined) model._dse_anchor = d._dse_anchor;
	return model;
}

export function serialize(model: ProjectModel): string {
	return stringifyYaml(model).trim();
}

/** AGENT line 878: a natural 19-20 grants +20 points on top of the roll's own points,
 *  AND another roll. */
export const BREAKTHROUGH_BONUS = 20;

/** Progress bar percentage (clamped 0-100), or null when there's no goal to measure
 *  against (an unset/zero goalPoints — never divide-by-zero, never read as "complete"). */
export function progressPercent(accrued: number, goalPoints: number | undefined): number | null {
	if (goalPoints === undefined || goalPoints <= 0) return null;
	return Math.max(0, Math.min(100, (accrued / goalPoints) * 100));
}

/** Derived live from the log (never a separate persisted flag, spec §5.2 has no field
 *  for it): the LAST logged roll granted a breakthrough bonus roll (AGENT 878, "and
 *  another roll") that hasn't been taken yet. Survives remounts without its own
 *  bookkeeping — logging any further roll (breakthrough or not) supersedes it. */
export function hasPendingBreakthroughRoll(model: ProjectModel): boolean {
	const last = model.rolls[model.rolls.length - 1];
	return last?.breakthrough === true;
}
