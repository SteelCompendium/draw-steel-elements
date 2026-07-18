// D8 Task 8 (spec §6) — ds-party model: parse + serialize for the Party tracker, the hub
// other subsystems read from (Encounter Builder's hero_count/hero_level §2, Initiative's
// heroes[] seed, Victory payouts from Encounter/Montage §4/§7). BRAND NEW element with no
// legacy predecessor (same convention as encounter/montage/project, D8 Tasks 4/6/7) — no
// external byte-compat oracle to transcribe against. The contract is self-referential and
// follows encounter/model.ts's "mutate + validate" convention (NOT montage/project's
// "rebuild in fixed key order" convention): parse only VALIDATES shape and materializes
// ONE top-level default (`members: []`) on the SAME object it was handed, touching no
// other key. That is what makes an unknown top-level key (`_dse_anchor`, `party`) AND
// every per-member optional field (level/class/ancestry/victories/xp/renown/wealth/
// hero_ref) survive parse -> serialize untouched — "optional fields absent on a member do
// not materialize on round-trip" falls out for free, with no explicit passthrough code.
import { stringifyYaml } from 'obsidian';

/** spec §6.2 — one party member row. Only `name` is required; every progression field is
 *  optional so a freshly-added member (or a hand-authored minimal block) still parses. */
export interface PartyMember {
	name: string;
	level?: number;
	class?: string;
	ancestry?: string;
	victories?: number;
	xp?: number;
	renown?: number;
	wealth?: number;
	/** Optional D7 link to a hero note (`"[[Kira]]"`, OD-8) — rendered as a real link by
	 *  the view (ElementView.renderMarkdown), never resolved/dereferenced by this element
	 *  (autoResolveRefs:false, definition.ts) — a single inline field the block's own
	 *  author sets, not a whole-block reference. */
	hero_ref?: string;
}

/** spec §6.2 `party:` — the table-wide pool (AGENT line 87). Optional: an unconfigured
 *  block has no `party:` key at all (never materialized as `{}` — unlike encounter's
 *  `party`, which budget.ts reads unconditionally; nothing here reads party.hero_tokens
 *  without checking presence first). */
export interface PartyPool {
	hero_tokens?: number;
}

export interface PartyModel {
	members: PartyMember[];
	party?: PartyPool;
	/** D8 spec §1.5 — sidebar block anchor. Round-trips untouched; ignored by every piece
	 *  of game logic in this element. */
	_dse_anchor?: string;
}

/**
 * Validates shape (per the Task 8 brief's "Interfaces" note: "parse validates members is a
 * list") and materializes the one top-level default (`members: []`) so a bare/blank block
 * still parses. Deliberately mutates and returns the SAME parsed object (the encounter
 * model convention) rather than building a fresh DTO, preserving every untouched key
 * (including unknown ones) byte-for-byte through serialize.
 */
export function parse(input: unknown, _raw: string): PartyModel {
	if (typeof input !== 'object' || input === null) {
		throw new Error('The input must be a YAML object.');
	}
	const data = input as PartyModel;

	if (data.members !== undefined && !Array.isArray(data.members)) {
		throw new Error("Invalid data: 'members' field must be a list.");
	}
	data.members = data.members ?? [];

	data.members.forEach((member, index) => {
		if (typeof member !== 'object' || member === null) {
			throw new Error(`Member at index ${index} must be an object.`);
		}
		if (typeof member.name !== 'string' || member.name.trim() === '') {
			throw new Error(`Member at index ${index} is missing the 'name' field.`);
		}
	});

	if (data.party !== undefined && (typeof data.party !== 'object' || data.party === null || Array.isArray(data.party))) {
		throw new Error("Invalid data: 'party' field must be an object.");
	}

	return data;
}

/** serialize(model): `stringifyYaml(model).trim()` — the same expression every other
 *  persisted element's serialize uses (encounter/montage/project/initiative/counter). */
export function serialize(model: PartyModel): string {
	return stringifyYaml(model).trim();
}

// --------------------------------------------------------------------- derived (§6.1)

/** Abstract Wealth's stated bounds (REF §11/§13, AGENT: "Abstract 1-6. Start at 1."). The
 *  view clamps the stepper's ± buttons to this range but (like Counter's
 *  clampInitial:false) still DISPLAYS a stored out-of-range value as-is — a hand-edited
 *  `wealth: 8` is never silently misrepresented. */
export const WEALTH_MIN = 1;
export const WEALTH_MAX = 6;

/**
 * REF §11 lines 334-338 / §13, AGENT lines 962-1005: Renown attracts followers at
 * thresholds 3/6/9/12 -> 1/2/3/4 followers. Highest threshold met wins; below 3 is 0
 * followers (no fabricated partial credit between thresholds — the reference states
 * exact breakpoints, not a continuous rate).
 */
export function followerCount(renown: number): number {
	if (renown >= 12) return 4;
	if (renown >= 9) return 3;
	if (renown >= 6) return 2;
	if (renown >= 3) return 1;
	return 0;
}

/**
 * REF §13 / AGENT lines 993-1005: the four echelons by hero level (1st 1-3, 2nd 4-6, 3rd
 * 7-9, 4th 10 — the table's own bounds, not a formula). Returns `null` for an unset or
 * out-of-table level (0, negative, 11+, non-finite) — never guesses an echelon the
 * reference doesn't define.
 */
export function echelonForLevel(level: number | undefined): number | null {
	if (level === undefined || !Number.isFinite(level)) return null;
	if (level >= 1 && level <= 3) return 1;
	if (level >= 4 && level <= 6) return 2;
	if (level >= 7 && level <= 9) return 3;
	if (level === 10) return 4;
	return null;
}
