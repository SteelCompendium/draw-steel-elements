// D8 Task 6 (spec §4.2) — montage model.ts: parse + serialize for `ds-montage`, a BRAND
// NEW element with no legacy predecessor (unlike negotiation/counter) — so there is no
// external byte-compat oracle to transcribe; the contract is self-referential, the same
// convention D8 Task 4's encounter/model.ts established: parse builds a plain object in
// FIXED schema key order, materializing defaults ONLY for the brief's explicit list —
// never for a key the input already fixes, and never inventing a key the input omits.
//
// SC-191 (impl spec §B) extends the schema PURELY ADDITIVELY: two new optional keys,
// `description` (the Director's brief, read-only prose rendered above the board) and
// `entries` (the board's per-cell records, `MontageEntry[]`). Nothing existing is
// renamed, retyped, removed or reordered (§B.2). Fixed key order (§B.5): title,
// description, rounds, success_limit, failure_limit, successes, failures, participants,
// entries, current_round, _dse_anchor — produced by assigning fields onto `model` in
// exactly that order below, the technique the pre-SC-191 code already relied on for
// `stringifyYaml(model)` to emit schema order. Entry key order (§B.5): hero, round,
// result, skill, note. That is the whole backward-compatibility story (§B.4): an
// old-shape block parses into the same model with description/entries left `undefined`,
// and serializes back byte-identical because an absent optional key is never
// materialized — this makes serialize(parse(x)) reproduce x's own bytes whenever x
// already carries the full field set in schema order (montage-serialize.test.ts's
// oracle, extended by SC-191 to cover the two new keys the same way).
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

/** §B.2 — one logged test on the board. `skill`/`note` are omitted when empty, never
 *  serialized as `null` or `''` (§B.5). There is deliberately no `rider` field — the
 *  cheat sheet's "with a reward"/"with a consequence" vocabulary is rules text, never
 *  recorded on the board; a Director who wants to remember a consequence uses `note`. */
export type MontageResult = 'success' | 'failure' | 'assist';

export interface MontageEntry {
	hero: string;
	round: number;
	result: MontageResult;
	skill?: string;
	note?: string;
}

export interface MontageModel {
	title?: string;
	description?: string;
	rounds: number;
	success_limit: number;
	failure_limit: number;
	successes: number;
	failures: number;
	participants?: MontageParticipant[];
	entries?: MontageEntry[];
	current_round: number;
	_dse_anchor?: string;
}

/**
 * Sanitizes one raw `entries[]` item (§G "a null/wrong-type entry field is dropped,
 * never crashes"). `hero`/`round`/`result` are required by the schema; a raw entry
 * missing one, or holding the wrong type for one, is unusable and DROPPED WHOLESALE
 * (`undefined` — the caller filters it out) rather than fabricating a hero name or round
 * number nobody authored. `skill`/`note` are optional: a `null` or non-string value for
 * either is simply left off the sanitized entry — the field-level counterpart of the
 * same rule, and how the entry stays omit-when-empty on the next serialize (§B.5).
 */
function sanitizeEntry(raw: unknown): MontageEntry | undefined {
	if (raw === null || typeof raw !== 'object') return undefined;
	const r = raw as Record<string, unknown>;
	if (typeof r.hero !== 'string' || r.hero.length === 0) return undefined;
	if (typeof r.round !== 'number' || !Number.isFinite(r.round)) return undefined;
	if (r.result !== 'success' && r.result !== 'failure' && r.result !== 'assist') return undefined;
	const entry: MontageEntry = { hero: r.hero, round: r.round, result: r.result };
	if (typeof r.skill === 'string' && r.skill.length > 0) entry.skill = r.skill;
	if (typeof r.note === 'string' && r.note.length > 0) entry.note = r.note;
	return entry;
}

/** Sanitizes the whole raw `entries` value. A non-array input and an all-dropped array
 *  both come back `undefined` so the caller never materializes an empty `[]` (§B.5). */
function sanitizeEntries(raw: unknown): MontageEntry[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	const entries = raw.map(sanitizeEntry).filter((e): e is MontageEntry => e !== undefined);
	return entries.length > 0 ? entries : undefined;
}

export function parse(data: unknown, _raw: string): MontageModel {
	const d = (data ?? {}) as Partial<MontageModel>;
	const model = {} as MontageModel;
	if (d.title !== undefined) model.title = d.title;
	if (typeof d.description === 'string' && d.description.length > 0) model.description = d.description;
	model.rounds = d.rounds ?? 2;
	model.success_limit = d.success_limit ?? 0;
	model.failure_limit = d.failure_limit ?? 0;
	model.successes = d.successes ?? 0;
	model.failures = d.failures ?? 0;
	if (d.participants !== undefined) model.participants = d.participants;
	const entries = sanitizeEntries(d.entries);
	if (entries !== undefined) model.entries = entries;
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
 *
 * SC-191 note (impl spec §I, slice 2): at 0/0 (nothing recorded, no limits set) this
 * still returns 'failure' — a known bug carried since design round 2. A fourth band,
 * `pending`, is the fix; it ships in slice 2 alongside the UI that reads it. Slice 1 is
 * model + tests only and must stay behavior-neutral, so it is not fixed here.
 */
export function montageOutcome(m: MontageModel): MontageOutcome {
	if (m.success_limit > 0 && m.successes >= m.success_limit) return 'total';
	const exhausted = (m.failure_limit > 0 && m.failures >= m.failure_limit) || m.current_round > m.rounds;
	if (exhausted && m.successes - m.failures >= 2) return 'partial';
	return 'failure';
}

/** True once the montage can no longer continue: a limit was reached or the rounds ran
 *  out. Not a schema field (§B.2 has no `complete` key) — always re-derived from the
 *  stored scalars, the same way montageOutcome is. */
function isExhausted(m: MontageModel): boolean {
	return (m.failure_limit > 0 && m.failures >= m.failure_limit) || m.current_round > m.rounds;
}

/**
 * §B.3 "Tallies: stored, never recomputed" — read straight off the model's own scalars.
 * **Never** derived from `entries.length` or a filter over `entries`: successes/failures
 * stay whatever the last delta write left them, which is the entire point of "stored,
 * never recomputed" — an old-shape block (no `entries` at all) or a block whose
 * `entries` disagree with its scalars (a hand-edit) both come back with their true
 * stored totals, not a recount from the board (§B.3's testable invariant).
 */
export interface MontageTallies {
	successes: number;
	failures: number;
	successLimit: number;
	failureLimit: number;
	/** Successes still needed to reach success_limit; 0 once reached or with no limit set. */
	toTotal: number;
	/** Failures still available before failure_limit is reached. */
	failuresSpare: number;
	/** The montage has run its course: a limit was reached or the rounds ran out. */
	complete: boolean;
}

export function montageTallies(m: MontageModel): MontageTallies {
	return {
		successes: m.successes,
		failures: m.failures,
		successLimit: m.success_limit,
		failureLimit: m.failure_limit,
		toTotal: Math.max(0, m.success_limit - m.successes),
		failuresSpare: Math.max(0, m.failure_limit - m.failures),
		complete: (m.success_limit > 0 && m.successes >= m.success_limit) || isExhausted(m),
	};
}

const BAND_WORD: Record<MontageOutcome, string> = {
	total: 'Total Success',
	partial: 'Partial Success',
	failure: 'Total Failure',
};

/**
 * §D "outcome band (verdict / tracks / rule line …)" — the at-a-glance tail phrasing for
 * the two tracks, quoted verbatim from the settled mock
 * (`visual-harness/sc191/mock6.js`'s `outcome()`, the `merged`/`pip` design the ledger
 * settled on — see the design freeze, spec §A). The tail is TENSED: while the montage is
 * still live it reads as a countdown ("1 from Total Success", "1 more ends it"); once
 * `complete` it reads as a verdict ("the success limit, reached", "1 under the failure
 * limit") — a finished montage is not "1 more ends it" away from anything, which round 3
 * printed and round 4 caught (mock6.js:944-948, "THE TAILS ARE TENSED").
 */
export interface MontageBandCopy {
	band: MontageOutcome;
	word: string;
	successTail: string;
	failureTail: string;
}

export function montageBandCopy(m: MontageModel): MontageBandCopy {
	const band = montageOutcome(m);
	const { toTotal, failuresSpare, complete } = montageTallies(m);
	const successTail = complete
		? toTotal === 0
			? 'the success limit, reached'
			: `${toTotal} short of the success limit`
		: toTotal === 0
			? 'Total Success reached'
			: toTotal === 1
				? '1 from Total Success'
				: `${toTotal} from Total Success`;
	const failureTail = complete
		? failuresSpare === 0
			? 'the failure limit, reached'
			: failuresSpare === 1
				? '1 under the failure limit'
				: `${failuresSpare} under the failure limit`
		: failuresSpare === 0
			? 'the limit is reached'
			: failuresSpare === 1
				? '1 more ends it'
				: `${failuresSpare} more end it`;
	return { band, word: BAND_WORD[band], successTail, failureTail };
}
