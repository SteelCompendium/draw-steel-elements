// D8 Task 6 (spec §4.2) — montage model.ts: parse + serialize for `ds-montage`, a BRAND
// NEW element with no legacy predecessor (unlike negotiation/counter) — so there is no
// external byte-compat oracle to transcribe; the contract is self-referential, the same
// convention D8 Task 4's encounter model established (encounter/model.ts): parse builds
// a plain object in FIXED schema key order (title, rounds, success_limit, failure_limit,
// successes, failures, participants, current_round, _dse_anchor), materializing defaults
// ONLY for rounds/successes/failures/current_round (the Task 6 brief's explicit list) —
// never for a key the input already fixes, and never inventing a key the input omits
// (title/participants/_dse_anchor stay absent, exactly like encounter's `label`). This
// makes serialize(parse(x)) reproduce x's own bytes whenever x already carries the full
// field set in schema order (montage-serialize.test.ts's oracle).
//
// success_limit/failure_limit are Director-set free-entry numbers (REF §7/AGENT 95) with
// NO textually-supported default — they fall back to 0 only so an incompletely-authored
// block still type-checks as a plain `number`, never silently promoted into a "real"
// limit (see montageOutcome's `> 0` guard below, which stops a 0 limit from reading as
// perpetually "reached").
import { stringifyYaml } from 'obsidian';

export interface MontageParticipant {
	name: string;
	skills_used: string[];
}

export interface MontageModel {
	title?: string;
	rounds: number;
	success_limit: number;
	failure_limit: number;
	successes: number;
	failures: number;
	participants?: MontageParticipant[];
	current_round: number;
	_dse_anchor?: string;
}

export function parse(data: unknown, _raw: string): MontageModel {
	const d = (data ?? {}) as Partial<MontageModel>;
	const model = {} as MontageModel;
	if (d.title !== undefined) model.title = d.title;
	model.rounds = d.rounds ?? 2;
	model.success_limit = d.success_limit ?? 0;
	model.failure_limit = d.failure_limit ?? 0;
	model.successes = d.successes ?? 0;
	model.failures = d.failures ?? 0;
	if (d.participants !== undefined) model.participants = d.participants;
	model.current_round = d.current_round ?? 1;
	if (d._dse_anchor !== undefined) model._dse_anchor = d._dse_anchor;
	return model;
}

export function serialize(model: MontageModel): string {
	return stringifyYaml(model).trim();
}

export type MontageOutcome = 'total' | 'partial' | 'failure';

/**
 * The three outcome bands (AGENT line 96), DERIVED live — never stored (spec §4.2):
 *   - total:   successes reach success_limit.
 *   - partial: time/failures run out (failures at/over failure_limit, OR the montage has
 *              run past its last round) but successes exceed failures by 2 or more.
 *   - failure: otherwise — including mid-montage (not yet exhausted), which reads as the
 *              "if it ended right now" band rather than a final verdict, matching the
 *              live-readout framing in the Task 6 brief.
 * The `> 0` guards on success_limit/failure_limit stop an unset (0-default) limit from
 * reading as instantly/perpetually reached.
 */
export function montageOutcome(m: MontageModel): MontageOutcome {
	if (m.success_limit > 0 && m.successes >= m.success_limit) return 'total';
	const exhausted = (m.failure_limit > 0 && m.failures >= m.failure_limit) || m.current_round > m.rounds;
	if (exhausted && m.successes - m.failures >= 2) return 'partial';
	return 'failure';
}
