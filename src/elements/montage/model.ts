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

/**
 * `result` is a bare `string`, NOT narrowed to `MontageResult` — a deliberate widening,
 * fix-round-1 L-2 (owner ruling, not the reviewer's own first-draft fix). A Director typo
 * (`result: sucess`) used to drop the WHOLE entry, note included, silently — the next
 * debounced write would then erase it from the note on disk with no trace. `sanitizeEntry`
 * now only requires `result` to be a non-empty STRING (a genuinely wrong-TYPE `result` — a
 * number, `null` — still can't be preserved and still drops the entry, §G's own "dropped,
 * never crashes" sanction). An entry whose `result` isn't one of the three known values
 * round-trips through parse→serialize byte-for-byte untouched (§B.5), and the view renders
 * it exactly like "nothing recorded" (`data-kind` `none`) — but its `note`, if any, is NOT
 * lost: the cell's note mark still shows and the text still lists in the outcome band,
 * because neither reads `result` to decide whether a note exists. Use
 * `isKnownMontageResult` to narrow to `MontageResult` before indexing anything keyed by it
 * (e.g. `Record<MontageResult, …>`).
 */
export interface MontageEntry {
	hero: string;
	round: number;
	result: string;
	skill?: string;
	note?: string;
}

/** True for one of the three values the board actually knows how to draw a seal for. */
export function isKnownMontageResult(result: string): result is MontageResult {
	return result === 'success' || result === 'failure' || result === 'assist';
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
 * never crashes"). `hero`/`round` are required and must be the right TYPE — a raw entry
 * missing one, or holding the wrong type for one, is unusable and DROPPED WHOLESALE
 * (`undefined` — the caller filters it out and warns) rather than fabricating a hero name
 * or round number nobody authored. `result` only has to be a non-empty STRING (fix-round-1
 * L-2 — see `MontageEntry`'s own doc comment): an unrecognised value is PRESERVED, not
 * dropped, because it is exactly the shape a Director's typo takes and the entry (and its
 * `note`) must survive a write-back untouched. `skill`/`note` are optional: a `null` or
 * non-string value for either is simply left off the sanitized entry — the field-level
 * counterpart of the same rule, and how the entry stays omit-when-empty on the next
 * serialize (§B.5).
 */
function sanitizeEntry(raw: unknown): MontageEntry | undefined {
	if (raw === null || typeof raw !== 'object') return undefined;
	const r = raw as Record<string, unknown>;
	if (typeof r.hero !== 'string' || r.hero.length === 0) return undefined;
	if (typeof r.round !== 'number' || !Number.isFinite(r.round)) return undefined;
	if (typeof r.result !== 'string' || r.result.length === 0) return undefined;
	const entry: MontageEntry = { hero: r.hero, round: r.round, result: r.result };
	if (typeof r.skill === 'string' && r.skill.length > 0) entry.skill = r.skill;
	if (typeof r.note === 'string' && r.note.length > 0) entry.note = r.note;
	return entry;
}

/** Sanitizes the whole raw `entries` value. A non-array input and an all-dropped array
 *  both come back `undefined` so the caller never materializes an empty `[]` (§B.5).
 *
 *  Fix-round-1 L-2: a whole-entry DROP (missing/wrong-type `hero`, `round` or `result`) is
 *  now `console.warn`ed with the raw offending item — §G sanctions the drop itself
 *  ("dropped, never crashes"), what was wrong was the SILENCE. An unrecognised but
 *  otherwise well-shaped `result` (a Director typo) is no longer a drop at all — see
 *  `sanitizeEntry` — and is warned about separately so its presence is still visible
 *  somewhere. A first-write `Notice` is slice 4's job (once there is a write path that
 *  could actually discard something). */
function sanitizeEntries(raw: unknown): MontageEntry[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	const entries: MontageEntry[] = [];
	for (const item of raw) {
		const entry = sanitizeEntry(item);
		if (!entry) {
			console.warn(
				'Draw Steel Elements: montage dropped a malformed entries[] item (missing/invalid hero or round) — it will not be written back on the next save',
				item,
			);
			continue;
		}
		if (!isKnownMontageResult(entry.result)) {
			console.warn(
				`Draw Steel Elements: montage entry for "${entry.hero}" round ${entry.round} has an unrecognised result "${entry.result}" — preserved as-is, rendered as unrecorded`,
				item,
			);
		}
		entries.push(entry);
	}
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
	// Fix-round-1 L-3: an empty `participants: []` used to round-trip verbatim — §B.5 lists
	// `participants` among the omit-when-absent keys ("never emit `null`, `''` or `[]`"),
	// and the board already has its own `No heroes yet` fallback (BoardView.ts), so a bare
	// `[]` on disk carries no information an omitted key doesn't already carry.
	if (d.participants !== undefined && d.participants.length > 0) model.participants = d.participants;
	const entries = sanitizeEntries(d.entries);
	if (entries !== undefined) model.entries = entries;
	model.current_round = d.current_round ?? 1;
	if (d._dse_anchor !== undefined) model._dse_anchor = d._dse_anchor;
	return model;
}

export function serialize(model: MontageModel): string {
	return stringifyYaml(model).trim();
}

export type MontageOutcome = 'pending' | 'total' | 'partial' | 'failure';

/**
 * The four outcome bands (AGENT line 96 + SC-191 impl spec §I), DERIVED live — never
 * stored (spec §4.2):
 *   - pending: nothing recorded yet (successes === 0 && failures === 0). A montage that
 *              has not started is not a Total Failure — round 1's report flagged the old
 *              3-band read as a bug every reader hit, and mock6.js's `derive()` keys the
 *              same band off "nothing recorded" unconditionally (checked FIRST, ahead of
 *              the margin math below) — mirrored here.
 *   - total:   successes reach success_limit.
 *   - partial: successes exceed failures by 2 or more (the book's own margin rule — the
 *              same "Partial Success needs successes to lead failures by 2" the outcome
 *              band's own rule line states). Fix-round-1 H-1: this used to additionally
 *              require `exhausted` (failures at/over failure_limit, OR past the last
 *              round), which made `partial` UNREACHABLE while the montage is still live —
 *              the "if it ended now" framing IS the hypothetical in which the montage has
 *              already ended, so gating it on a SEPARATE exhaustion check made the band
 *              word contradict the rule line printed directly under it (e.g. 5/2 at round
 *              3 of 3, not yet exhausted, printed "Total Failure" over "currently +3" —
 *              the approved mock, mock6.js:632-635, has no `exhausted` gate here and
 *              renders Partial Success for the same numbers, `sc191-r5-tracks-mid-dark.png`).
 *              The guard was pre-existing (`69eb5f7`); SC-191 slice 2 only made the
 *              contradiction visible by printing the rule line beside the band word.
 *   - failure: otherwise — a margin under 2, live or complete.
 * The `> 0` guard on success_limit stops an unset (0-default) limit from reading as
 * instantly reached.
 */
export function montageOutcome(m: MontageModel): MontageOutcome {
	if (m.successes === 0 && m.failures === 0) return 'pending';
	if (m.success_limit > 0 && m.successes >= m.success_limit) return 'total';
	if (m.successes - m.failures >= 2) return 'partial';
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
	pending: 'Not started',
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

// ------------------------------------------------------------------------------------
// SC-191 SLICE 4 — the write path (spec §C/§D): every mutation below runs from a click
// handler (view/modal code), never from render. All of them are DELTA writes onto the
// model's own scalars (§B.3's testable invariant) — nothing here ever assigns
// `successes = entries.length` or otherwise recomputes a stored total from the board.

/** True for a result that moves a tally at all (`assist` and any unrecognised typo do
 *  not — §B.3, model.ts's own `isKnownMontageResult` convention). */
function tallyKeyFor(result: string): 'successes' | 'failures' | undefined {
	if (result === 'success') return 'successes';
	if (result === 'failure') return 'failures';
	return undefined;
}

/** `sign` +1 applies an entry's contribution, -1 undoes it — the one function both
 *  "log" and "correct"/"remove" (undo-then-reapply) share, so the delta math can only
 *  ever be written once. Clamped at 0: undoing a stale/hand-edited scalar must never
 *  drive it negative. */
function applyTallyDelta(m: MontageModel, result: string, sign: 1 | -1): void {
	const key = tallyKeyFor(result);
	if (!key) return;
	m[key] = Math.max(0, m[key] + sign);
}

function findParticipant(m: MontageModel, hero: string): MontageParticipant | undefined {
	return (m.participants ?? []).find((p) => p.name === hero);
}

/** Removes ONE occurrence of `skill` from `hero`'s `skills_used` (§B.3: "removing an
 *  entry removes one occurrence") — a no-op when the hero or the skill isn't found. */
function removeSkillOccurrence(m: MontageModel, hero: string, skill: string | undefined): void {
	if (!skill) return;
	const p = findParticipant(m, hero);
	if (!p) return;
	const idx = p.skills_used.indexOf(skill);
	if (idx !== -1) p.skills_used.splice(idx, 1);
}

function addSkillOccurrence(m: MontageModel, hero: string, skill: string | undefined): void {
	if (!skill) return;
	const p = findParticipant(m, hero);
	if (p) p.skills_used.push(skill);
}

/**
 * The skill-reuse rule (Draw Steel Heroes:21286 — "An individual character can't use
 * the same skill more than once in a montage test"), computed LIVE for the sheet's own
 * warning. `excluding` is the entry currently being edited (if any) — its OWN
 * contribution is subtracted first, so correcting an entry back onto its own unchanged
 * skill never warns against itself (the same undo-then-check shape
 * `correctMontageEntry` performs for real, mirrored here as a pure read).
 */
export function wouldReuseSkill(
	m: MontageModel,
	hero: string,
	skill: string,
	excluding?: MontageEntry,
): boolean {
	const p = findParticipant(m, hero);
	if (!p) return false;
	const used = p.skills_used.slice();
	if (excluding && excluding.hero === hero && excluding.skill) {
		const idx = used.indexOf(excluding.skill);
		if (idx !== -1) used.splice(idx, 1);
	}
	return used.includes(skill);
}

/** The next participant (roster order) who has not yet logged an action in the CURRENT
 *  round — what the sheet pre-fills when opened from the bottom "Log an action…" row
 *  (spec §D / round-4 report: "the current round, and the next hero who has not yet
 *  acted in it"). `undefined` when every roster hero has already acted (or the roster
 *  is empty). */
export function nextHeroToAct(m: MontageModel): string | undefined {
	const participants = m.participants ?? [];
	const actedThisRound = new Set((m.entries ?? []).filter((e) => e.round === m.current_round).map((e) => e.hero));
	return participants.find((p) => !actedThisRound.has(p.name))?.name;
}

/** Logs a brand-new entry: appends to `entries[]` (materialising the array on its
 *  first write, §B.4), deltas the tally, and appends the skill occurrence. Never
 *  touches an existing entry — callers dedupe display, not the model (§B.5: "entries
 *  preserve their authored array order"). */
export function logMontageEntry(m: MontageModel, entry: MontageEntry): void {
	const entries = m.entries ?? [];
	entries.push(entry);
	m.entries = entries;
	applyTallyDelta(m, entry.result, 1);
	addSkillOccurrence(m, entry.hero, entry.skill);
}

/** Corrects an EXISTING entry (identity = object reference, as handed back by
 *  BoardView's own lookup) to a new shape in place — Scott's original ticket case
 *  ("that 13 was really a 17"). Undoes the old entry's tally/skill contribution, then
 *  applies the new one: the same "remove + log" shape §B.3 prescribes, never a
 *  recount. */
export function correctMontageEntry(m: MontageModel, existing: MontageEntry, next: MontageEntry): void {
	applyTallyDelta(m, existing.result, -1);
	removeSkillOccurrence(m, existing.hero, existing.skill);
	existing.hero = next.hero;
	existing.round = next.round;
	existing.result = next.result;
	if (next.skill) existing.skill = next.skill;
	else delete existing.skill;
	if (next.note) existing.note = next.note;
	else delete existing.note;
	applyTallyDelta(m, next.result, 1);
	addSkillOccurrence(m, next.hero, next.skill);
}

/** Removes an entry entirely: undoes its tally/skill contribution and splices it out
 *  of `entries[]`, restoring `undefined` (never a bare `[]`, §B.5) once the list is
 *  empty again. */
export function removeMontageEntry(m: MontageModel, existing: MontageEntry): void {
	applyTallyDelta(m, existing.result, -1);
	removeSkillOccurrence(m, existing.hero, existing.skill);
	const entries = m.entries ?? [];
	const idx = entries.indexOf(existing);
	if (idx !== -1) entries.splice(idx, 1);
	m.entries = entries.length > 0 ? entries : undefined;
}

/** ⋯ "Add a round" — extends the montage's total round count by one. A Director-set
 *  config change (like `rounds:` itself), not a progress write. */
export function addMontageRound(m: MontageModel): void {
	m.rounds += 1;
}

/** ⋯ "Add a hero" — appends a new roster entry with no skill history yet. */
export function addMontageHero(m: MontageModel, name: string): void {
	const participants = m.participants ?? [];
	participants.push({ name, skills_used: [] });
	m.participants = participants;
}

/** ⋯ "Set limits…" — the Director-set success/failure limits. Negative input is
 *  clamped to 0 (the schema's own "unset" convention, montageOutcome's `> 0` guard). */
export function setMontageLimits(m: MontageModel, successLimit: number, failureLimit: number): void {
	m.success_limit = Math.max(0, Math.trunc(successLimit));
	m.failure_limit = Math.max(0, Math.trunc(failureLimit));
}

/** "Reset progress" (⋯ menu) / "Clear all" (the done-state bar, fix round 2) — zeroes
 *  PLAY STATE only (successes/failures/current_round/entries/each participant's
 *  skills_used); the Director-set config (title, description, rounds, limits,
 *  participant roster) survives. Extracted from the pre-slice-4
 *  MontageView.resetProgress() so both callers share one implementation rather than two
 *  hand-copies that could drift — fix round 2 (ledger 2026-09-03) removed "Clear all"
 *  from the ⋯ menu (it now lives only in the done-state bar, mirroring the mock), which
 *  is what makes "one action, two former menu labels" moot; the two callers now read as
 *  two different SURFACES for the same reset, not two menu items for it. */
export function resetMontageProgress(m: MontageModel): void {
	m.successes = 0;
	m.failures = 0;
	m.current_round = 1;
	m.entries = undefined;
	for (const participant of m.participants ?? []) {
		participant.skills_used = [];
	}
}

/** FIX ROUND 2 — "End round N" (the bottom action bar, mock6.js:1460): the ONLY control
 *  that advances `current_round`. Confirmed before writing this: `model.ts` touches
 *  `current_round` in exactly two places pre-fix-2 — `parse()` (`d.current_round ?? 1`)
 *  and `resetMontageProgress()` (`= 1`) — neither of which moves it forward, so a
 *  Director had no way to leave round 1 without hand-editing the YAML. A delta write
 *  (`+= 1`), same shape as `addMontageRound`: ending the last round (`current_round`
 *  reaches `rounds + 1`) is what makes `isExhausted`/`montageTallies(m).complete` true —
 *  no separate "mark complete" step, the outcome band re-derives it live as it always
 *  has (model.ts's own `isExhausted`). The sheet keeps logging into whatever
 *  `current_round` now is. */
export function endMontageRound(m: MontageModel): void {
	m.current_round += 1;
}

/** FIX ROUND 2 — "Undo" (the bottom action bar, mock6.js:1459): removes the MOST
 *  RECENTLY LOGGED entry. Tie-break: `entries[]` preserves LOG ORDER (§B.5 "entries
 *  preserve their authored array order"; `logMontageEntry` always `.push()`es), so "most
 *  recent" is unambiguously the last array element — never a sort by `round`/`hero`,
 *  which would disagree with log order whenever a Director logs out of board order (the
 *  sheet's Round field allows any round, spec §D). Delegates to the same
 *  `removeMontageEntry` the sheet's own Remove button uses — one undo path, not a
 *  second hand-rolled delta. No-op on an empty/absent `entries[]` (nothing to undo —
 *  the caller disables the button on that same condition). */
export function undoLastMontageEntry(m: MontageModel): void {
	const entries = m.entries;
	if (!entries || entries.length === 0) return;
	removeMontageEntry(m, entries[entries.length - 1]);
}

/** FIX ROUND 2 — is "Reopen" offered on a COMPLETE montage? The mock only draws the
 *  button (mock6.js:1424, a static screenshot); this is the behaviour the ledger's
 *  ruling specifies: reopenable ONLY when the montage ran out of ROUNDS with neither
 *  limit reached — extending `rounds` (`addMontageRound`) makes it live again. A limit
 *  reached (success OR failure) is a FINAL verdict — "Clear all"/"Reset progress" is the
 *  only way back, matching the book's own "hit the success limit → total success;
 *  otherwise, at the failure limit or out of rounds: partial/total failure" framing
 *  (docs/gm-trackers.md's own guide text) where a limit is a verdict and running out of
 *  rounds is just running out of clock. */
export function montageReopenable(m: MontageModel): boolean {
	const tallies = montageTallies(m);
	if (!tallies.complete) return false;
	const successLimitHit = m.success_limit > 0 && m.successes >= m.success_limit;
	const failureLimitHit = m.failure_limit > 0 && m.failures >= m.failure_limit;
	return !successLimitHit && !failureLimitHit;
}

export function montageBandCopy(m: MontageModel): MontageBandCopy {
	const band = montageOutcome(m);
	const { toTotal, failuresSpare, complete } = montageTallies(m);
	// Fix-round-1 L-1: an unset limit (0, the schema default — never a real Director-set
	// limit, model.ts's own `> 0` guard convention) used to fall into the `toTotal === 0` /
	// `failuresSpare === 0` branch below and print the LIVE "reached" copy ("Total Success
	// reached" / "the limit is reached") under a band that could not possibly mean that —
	// e.g. "Not started" is exactly the `pending` state a vacuous limit always coincides
	// with at 0/0. `success_limit > 0` (m.successes >= m.success_limit) is the only way
	// `toTotal` reaches 0 while NOT complete — proof: if it were 0 while success_limit > 0,
	// montageTallies.complete's own first clause would already be true — so once the
	// vacuous case is named explicitly up front, the untensed "…reached" branches below are
	// unreachable and are removed rather than kept as dead code. Same proof, mirrored, for
	// failuresSpare/failure_limit.
	const successTail =
		m.success_limit === 0
			? 'no success limit set'
			: complete
				? toTotal === 0
					? 'the success limit, reached'
					: `${toTotal} short of the success limit`
				: toTotal === 1
					? '1 from Total Success'
					: `${toTotal} from Total Success`;
	const failureTail =
		m.failure_limit === 0
			? 'no failure limit set'
			: complete
				? failuresSpare === 0
					? 'the failure limit, reached'
					: failuresSpare === 1
						? '1 under the failure limit'
						: `${failuresSpare} under the failure limit`
				: failuresSpare === 1
					? '1 more ends it'
					: `${failuresSpare} more end it`;
	return { band, word: BAND_WORD[band], successTail, failureTail };
}
