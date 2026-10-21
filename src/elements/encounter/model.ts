// D8 Task 4 (spec §2.5) — ds-encounter model: parse/serialize for the persisted
// Encounter Builder. New element (no legacy predecessor, unlike initiative/negotiation/
// counter) — so there is no byte-compat ORACLE to transcribe against; the byte-stability
// contract here is simpler and self-referential: serialize(parse(x)) reproduces the same
// YAML text `x` was parsed from, because parse only VALIDATES + fills two top-level
// defaults (`party`, `monsters`) and never touches, reorders, or strips any other key —
// including the two passthrough fields the spec calls out by name: `_dse_anchor` (D8
// spec §1.5 sidebar anchor) and `_computed` (spec §2.5 — a display cache the VIEW
// rewrites on render, never something parse/serialize touch).
//
// SC-482 contract: those two filled defaults used to leak into the user's note — and for this
// element on RENDER, with no user action, because the view's `_computed` write persists the whole
// model (a block with only `monsters:` came back with `party: {}` added). A default is now
// OMITTED from the written block iff it was ABSENT from the parsed source AND still equals what
// parse filled in (`{}` / `[]`) at write time; a declared `party:` / `monsters:` is written, and
// a `party` the user configured is written. Because parse fills the defaults INTO the incoming
// object, whether the source declared them is read BEFORE the fill (recordingDefaults).
// `_computed` and `_dse_anchor` are never parser-filled, so they are written exactly as before.
// The record lives in src/elements/shared/undeclaredDefaults.ts. (Whether a render should write
// `_computed` at all is a separate question — SC-486.)
import { recordingDefaults, stringifyOmittingUntouched } from '../shared/undeclaredDefaults';

/** spec §2.5 `party:` — every field optional so an unconfigured/blank block still
 *  parses (budget.ts's computeEncounter degrades gracefully on missing party info,
 *  OD-2: "the tool stays useful before the numbers are sourced"). */
export interface EncounterParty {
	hero_count?: number;
	hero_level?: number;
	/** Feeds the budget-table victory adjustment (spec §2.2's "+ optional victory
	 *  adjustment"; budget.ts's `victoryAdjustment`, Task 4 review round 1 Finding 3) —
	 *  `budgetTable(heroCount, heroLevel) + victoryAdjustment(heroLevel, victories)`. */
	victories?: number;
	/** Optional `[[Party]]` link to a ds-party block (D8 spec §6) — not resolved by this
	 *  task (ds-party doesn't exist yet); kept as an opaque passthrough string. */
	party_ref?: string;
}

/** spec §2.5 `monsters[]` — one row per monster TYPE, resolved live via
 *  `cx.compendium.getStatblock` (view.ts); never inlined stats. */
export interface EncounterRow {
	/** An SCC code, `scc.v1:`-prefixed per the spec's own schema example (or bare —
	 *  view.ts normalizes either form via `normalizeSccTarget`). */
	code: string;
	count: number;
	/** Optional; spec §2.3 — "defaults from resolved role" (in practice: the resolved
	 *  statblock's `organization` field, the SDK field that actually carries the
	 *  "Minion"/"Horde"/"Solo"/… enum the spec's prose loosely calls "role" — see
	 *  view.ts's isMinionRow for the exact detection + citation). */
	squad?: 'minion' | 'captain';
}

/** spec §2.5 `_computed:` — a DISPLAY CACHE, never authoritative (spec §2.5's own
 *  closing note: "the view recomputes from live `ev` on every mount and rewrites it;
 *  treat divergence as 'recompute wins'"). `victories` here is the VICTORY PAYOUT
 *  (`budget.ts`'s `victoryPayout(band)`), not `EncounterParty.victories`. */
export interface EncounterComputed {
	spent_ev: number;
	/** null = "unset — configure in settings" (OD-2: an unconfigured budgetTable cell). */
	budget: number | null;
	ratio: number | null;
	band: string | null;
	victories: number;
}

export interface EncounterModel {
	party: EncounterParty;
	monsters: EncounterRow[];
	label?: string;
	/** D8 spec §1.5 — sidebar block anchor. Round-trips untouched; ignored by every
	 *  piece of game logic in this element. */
	_dse_anchor?: string;
	_computed?: EncounterComputed;
}

/**
 * Validates shape (per spec §2.5's "Interfaces" note: "monsters is a list; each row has
 * `code` + numeric `count`") and materializes the two top-level defaults (`party: {}`,
 * `monsters: []`) so a bare/blank block still parses. Deliberately mutates and returns
 * the SAME parsed object (the initiative/counter model convention) rather than building
 * a fresh DTO — that is what makes an unknown top-level key (or `_dse_anchor`/
 * `_computed`) survive parse -> serialize for free, with no explicit passthrough code.
 */
function parseModel(input: unknown, _raw: string): EncounterModel {
	if (typeof input !== 'object' || input === null) {
		throw new Error('The input must be a YAML object.');
	}
	const data = input as EncounterModel;

	if (
		data.party !== undefined &&
		(typeof data.party !== 'object' || data.party === null || Array.isArray(data.party))
	) {
		throw new Error("Invalid data: 'party' field must be an object.");
	}
	data.party = data.party ?? {};

	if (data.monsters !== undefined && !Array.isArray(data.monsters)) {
		throw new Error("Invalid data: 'monsters' field must be a list.");
	}
	data.monsters = data.monsters ?? [];

	data.monsters.forEach((row, index) => {
		if (typeof row !== 'object' || row === null) {
			throw new Error(`Monster row at index ${index} must be an object.`);
		}
		if (typeof row.code !== 'string' || row.code.trim() === '') {
			throw new Error(`Monster row at index ${index} is missing the 'code' field.`);
		}
		if (typeof row.count !== 'number') {
			throw new Error(`Monster row '${row.code}' is missing or has an invalid 'count' field.`);
		}
		if (row.squad !== undefined && row.squad !== 'minion' && row.squad !== 'captain') {
			throw new Error(`Monster row '${row.code}' has an invalid 'squad' value.`);
		}
	});

	return data;
}

export const parse = recordingDefaults(parseModel, ['party', 'monsters'] as const);

/** serialize(model): `stringifyYaml(...).trim()` — the same expression every other
 *  persisted element's serialize uses (initiative/counter/negotiation), minus an untouched
 *  `party: {}` / `monsters: []` default (SC-482). `_computed`/
 *  `_dse_anchor` serialize ONLY when present (yaml's `keepUndefined: false` default —
 *  an absent optional field is OMITTED, never emitted as `null`), which is exactly the
 *  "derived fields serialize only when present" contract: a block that has never been
 *  rendered (no `_computed` yet) stays clean; the view sets `_computed` and re-persists
 *  only when the freshly computed values actually differ from what is already stored
 *  (view.ts's computedEqual guard) — so a re-render with unchanged inputs never rewrites
 *  identical bytes back into the note. */
export function serialize(model: EncounterModel): string {
	return stringifyOmittingUntouched(model);
}
