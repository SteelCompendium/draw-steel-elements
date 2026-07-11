// Plan 14 Task 1 (D5 §2.1) — the roll engine's type surface. PURE: no Obsidian,
// no DOM. D7/D8 import these when they need roll math without UI.
//
// Reconciliation (OD-D5-11): the spec typed `tierShifted: 0 | 1 | -1` but its own
// algorithm assigns `3 - base` on a nat-19–20 override (up to +2) — widened to
// `number`, documented as `tier - base` (−2..+2), an audit/animation delta only.

export type RollMode = 'power-roll' | 'test' | 'opposed' | 'flat';
export type RollTier = 1 | 2 | 3;
export type CharacteristicName = 'might' | 'agility' | 'reason' | 'intuition' | 'presence';

/** Deterministic, injectable dice source. Returns 1..sides. */
export interface DiceSource {
	/** One die. Real impl: 1 + Math.floor(Math.random() * sides). */
	rollDie(sides: number): number;
}

/** Arbitrary dice expression for mode "flat" (damage, saving throws, bleeding). */
export interface FlatDice {
	count: number;
	sides: number;
	bonus?: number;
}

/** Fully-specified, already-numeric roll request. Pure — no strings, no UI. */
export interface RollInput {
	mode: RollMode; // D5 §1.5
	/** Characteristic score already resolved to a number (−5..+5). Omit ⇒ 0. */
	characteristic?: number;
	/** +2 when an applicable skill is used. Omit ⇒ 0. */
	skillBonus?: number;
	/** Any other flat modifiers (feature bonuses, situational +/−). Omit ⇒ 0. */
	flatBonus?: number;
	/** Raw counts; the engine cancels & caps (D5 §1.3). Omit ⇒ 0. */
	edges?: number;
	banes?: number;
	/** Enables the critical-hit flag in power-roll mode (D5 §1.4). Default false. */
	isMainActionAbility?: boolean;
	/** Mode "flat" only: the dice expression. Tiered modes are always 2d10. */
	flat?: FlatDice;
}

export interface RollResult {
	input: RollInput; // echoed for history/re-roll
	dice: number[]; // individual faces rolled, in draw order
	natural: number; // sum of faces BEFORE any modifier (nat-19–20 source)
	/** Net edges after cancel, clamped to −2..+2 (±2 = double). */
	net: number;
	/** Flat modifier applied from edges/banes: ±2 single, 0 double (±4 opposed double). */
	edgeBaneFlat: number;
	total: number; // final number (all modes)
	tier?: RollTier; // power-roll & test only; absent for opposed/flat
	/** tier − base band (−2..+2): double-shift and/or nat-override audit delta. */
	tierShifted: number;
	isNat: boolean; // natural 19–20 (2d10 modes only)
	isCritical: boolean; // isNat && power-roll && main-action ability
	breakdown: string; // human-readable trace for the result card
}
