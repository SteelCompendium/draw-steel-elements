// D8 Task 4 (spec §2.2, OD-2) — encounter budget math: pure, synchronous, no DOM/async,
// no compendium access (view.ts resolves rows via cx.compendium.getStatblock and hands
// this module plain { count, ev } pairs). This is the file the spec's "reference-math
// honesty" note (§0) is really about: the encounter EV/budget formula and the
// difficulty-band thresholds are Monsters-book / Director's-guide content NOT present in
// the workspace's hand-curated `reference/` docs, so every default below is a
// PARAMETERIZED, replaceable DATA TABLE flagged "verify against Draw Steel core rules"
// (OD-2) — never a formula hardcoded into computeEncounter's own logic. Only the
// victory-payout rule is directly citable (REF §13 line 370; AGENT Part 12: "a hard
// encounter awards 2 Victories vs 1").
import type { EncounterComputed } from './model';

/** `/(-?\d+)/` first-integer parse (recon delta 5: `ev` is a STRING on the SDK
 *  Statblock model, e.g. `"3"`, `"96"`, or a hand-authored `"~120 (minion)"`). A number
 *  input passes through as-is (defensive: no caller today hands this a number, but the
 *  brief's own signature is `string | number | undefined`); anything non-numeric or
 *  absent parses to 0 rather than throwing — an encounter builder must stay usable with
 *  a partially-synced compendium, never crash on one bad `ev` string. */
export function parseEv(ev: string | number | undefined): number {
	if (typeof ev === 'number') return Number.isFinite(ev) ? ev : 0;
	if (typeof ev !== 'string') return 0;
	const match = /(-?\d+)/.exec(ev);
	return match ? parseInt(match[1], 10) : 0;
}

/** spec §2.2 "Spent EV (citable, from data)": `Σ row.count × parseEv(row.ev)`. Every
 *  term comes from real compendium `ev` — this function does no lookup itself. */
export function spentEv(rows: { count: number; ev: string | number }[]): number {
	return rows.reduce((total, row) => total + row.count * parseEv(row.ev), 0);
}

/** spec §2.2 "Victory payout (citable)" — REF §13 line 370 / AGENT Part 12: a
 *  hard-or-harder encounter awards 2 Victories, everything else 1. Unlike budget/band,
 *  this is a real cited rule, not a parameterized guess. */
export function victoryPayout(band: string | null): number {
	return band === 'hard' || band === 'extreme' ? 2 : 1;
}

// ---------------------------------------------------------------------- budget table

const MIN_HERO_LEVEL = 1;
const MAX_HERO_LEVEL = 10;
const MIN_HERO_COUNT = 1;
const MAX_HERO_COUNT = 6;

/** "Encounter Strength" of one hero at `level` — the same shape the v2 site's own
 *  encounter tool already ships (workspace `v2/docs/javascripts/sc-encounter-core.js`'s
 *  `heroES`), itself sourced from `Read/bestiary/monster-basics.md` (real Monsters-book
 *  text, rendered by steel-etl — NOT the hand-curated `reference/` docs this spec's
 *  honesty note is about, and not independently re-verified by this task). Reproduced
 *  here only to SEED the literal table below, never called from computeEncounter
 *  directly — OD-2 asks for "a data-driven, user-editable table", not a formula in the
 *  math path. verify against Draw Steel core rules (OD-2). */
function heroEncounterStrength(level: number): number {
	return 4 + 2 * level;
}

/**
 * OD-2 default party-budget table: `budget(heroCount, heroLevel) = heroEncounterStrength
 * (heroLevel) × heroCount`, bounded to a plausible play range (levels 1-10, party size
 * 1-6) and materialized as a literal lookup table (not a formula call) so it reads and
 * edits like the "data-driven, user-editable table" OD-2 asks for. Every cell carries
 * the same flag: verify against Draw Steel core rules before treating a number here as
 * authoritative. Outside the configured range, `budgetTable` returns null — "unset —
 * configure in settings" (spec §2.2) — rather than extrapolating a guess.
 */
const DEFAULT_BUDGET_TABLE: ReadonlyMap<number, ReadonlyMap<number, number>> = (() => {
	const table = new Map<number, Map<number, number>>();
	for (let level = MIN_HERO_LEVEL; level <= MAX_HERO_LEVEL; level++) {
		const row = new Map<number, number>();
		for (let count = MIN_HERO_COUNT; count <= MAX_HERO_COUNT; count++) {
			row.set(count, heroEncounterStrength(level) * count); // verify against Draw Steel core rules (OD-2)
		}
		table.set(level, row);
	}
	return table;
})();

/** spec §2.2: `budget = budgetTable(heroCount, heroLevel)`. Returns null for any cell
 *  outside DEFAULT_BUDGET_TABLE's configured range — "unset — configure in settings",
 *  never a fabricated number. */
export function budgetTable(heroCount: number, heroLevel: number): number | null {
	return DEFAULT_BUDGET_TABLE.get(heroLevel)?.get(heroCount) ?? null;
}

// ------------------------------------------------------------------------ band table

/**
 * OD-2 default difficulty bands, expressed as `ratio = spentEv / budget` thresholds —
 * the shape spec §2.5's own schema uses (`ratio: 1.1, band: hard`) — rather than
 * sc-encounter-core.js's absolute-EV bands (keyed off `partyES ± heroES`, which do not
 * collapse to a fixed ratio independent of party size). This is a deliberate, FLAGGED
 * simplification (OD-2): a single small ratio table covers every party shape without a
 * second axis. Each `max` is the inclusive upper bound of its band; anything past the
 * last entry is "extreme". Thresholds are chosen so spec §2.5's own worked example
 * (spent 44 / budget 40 = ratio 1.1 -> band "hard") holds under this table.
 */
const DEFAULT_BAND_TABLE: ReadonlyArray<{ readonly max: number; readonly band: string }> = [
	{ max: 0.5, band: 'trivial' }, // verify against Draw Steel core rules (OD-2)
	{ max: 0.8, band: 'easy' }, // verify against Draw Steel core rules (OD-2)
	{ max: 1.0, band: 'standard' }, // verify against Draw Steel core rules (OD-2)
	{ max: 1.5, band: 'hard' }, // verify against Draw Steel core rules (OD-2)
	// > 1.5 -> extreme (verify against Draw Steel core rules, OD-2)
];

/** spec §2.2: `ratio -> band` via the table above. Always returns a band name (never
 *  null) — computeEncounter is the one that decides whether a band applies at all
 *  (it doesn't call this when budget/ratio is unset). */
export function bandTable(ratio: number): string {
	for (const entry of DEFAULT_BAND_TABLE) {
		if (ratio <= entry.max) return entry.band;
	}
	return 'extreme';
}

// -------------------------------------------------------------------- assembled math

/** Injectable table pair — DEFAULT_TABLES below for production; tests inject a small
 *  fixed table to pin "configured vs unconfigured cell" behavior without depending on
 *  DEFAULT_BUDGET_TABLE's exact shipped range. */
export interface EncounterTables {
	budgetTable: (heroCount: number, heroLevel: number) => number | null;
	bandTable: (ratio: number) => string;
}

export const DEFAULT_TABLES: EncounterTables = { budgetTable, bandTable };

/**
 * spec §2.5 `_computed`, assembled: spent EV from real per-row `ev` (never a lookup),
 * budget/band from the (replaceable) tables above, victory payout from the one cited
 * rule. `ratio`/`band` stay null — not zero, not "trivial" — whenever `budget` is null
 * or non-positive, matching OD-2's "tool stays useful before the numbers are sourced"
 * (spent EV and the party inputs still show; only the difficulty read-out is withheld).
 */
export function computeEncounter(
	rows: { count: number; ev: string | number }[],
	party: { hero_count?: number; hero_level?: number; victories?: number },
	tables: EncounterTables = DEFAULT_TABLES,
): EncounterComputed {
	const spent_ev = spentEv(rows);
	const budget = tables.budgetTable(party.hero_count ?? 0, party.hero_level ?? 1);
	const ratio = budget !== null && budget > 0 ? spent_ev / budget : null;
	const band = ratio === null ? null : tables.bandTable(ratio);
	return { spent_ev, budget, ratio, band, victories: victoryPayout(band) };
}
