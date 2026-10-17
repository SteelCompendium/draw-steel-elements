import type { Statblock } from 'steel-compendium-sdk';

/**
 * The two statblock fields beastheart companions added: a `skills` list, and a TEXT
 * `free_strike` ("1 + M" — a companion's free strike is its Might-based formula, not a
 * number). Declared here, in the element's own types, because the plugin pins
 * `steel-compendium-sdk` 3.0.0 and the SDK only gained these in 3.1.0.
 *
 * Structurally identical to 3.1.0's `Statblock` (`freeStrike: number | string`,
 * `skills?: string[]`), so moving the pin is a `package.json` + `npm ci` change with zero
 * code edits: against 3.1.0 this type is simply a restatement of the model's own shape,
 * and a plain `Statblock` is assignable to it either way. At runtime 3.0.0 already carries
 * both through untouched — `Statblock.fromDTO` spreads the whole DTO and passes
 * `free_strike` straight into `freeStrike` — and nothing validates the block against the
 * SDK schema, so the only 3.0.0 gap was the compile-time type.
 */
export interface CompanionStatFields {
	freeStrike: number | string;
	skills?: string[];
}

/** A statblock as the view reads it: the SDK model with the companion fields widened in. */
export type CompanionStatblock = Omit<Statblock, 'freeStrike'> & CompanionStatFields;
