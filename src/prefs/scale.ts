// src/prefs/scale.ts — SC-112 (Plan 23 Task 7): the size-scale value layer.
//
// Sibling of fontStacks.ts, shared by the catalog descriptors (catalog.ts) and
// the Task 8 slider controls. snap() is a PORT OF THE SITE'S semantics VERBATIM
// (v2/docs/javascripts/settings-core.js:28-43 — a model, not an import): clamp
// into [min, max], round to the nearest step, return the default on anything
// non-finite. TEXT_SCALE is the site's SCALE_* constants (settings-core.js:22),
// symmetric about the 1.0 default so its thumb sits at the centre of the track
// at 100%. CARD_SCALE no longer mirrors the site's CARD_* constants
// (settings-core.js:23, CARD_MIN = 0.8, unchanged on purpose) — see below.

/** One slider's numeric contract: bounds, step, and the inert default. */
export interface ScaleRange {
	readonly min: number;
	readonly max: number;
	readonly step: number;
	readonly default: number;
}

/** Text-size range — the site's SCALE_MIN/MAX/STEP/DEFAULT (settings-core.js:22). */
export const TEXT_SCALE: ScaleRange = { min: 0.6, max: 1.4, step: 0.05, default: 1 };

/**
 * Card-size range (SC-683): 0.3–1.2, step 0.05. Scott: "Lets go with 30% min" (the
 * minimum was 0.8). The site's CARD_MIN/MAX/STEP/DEFAULT (settings-core.js:23) stay
 * 0.8/1.2/0.05/1 — the plugin's minimum deliberately stops mirroring the site's.
 * No longer symmetric about the 1.0 default, so this slider's thumb at 100% is
 * off-centre (the other four stay centred). Stored values 0.8–1.2 stay valid, so
 * there is no migration.
 */
export const CARD_SCALE: ScaleRange = { min: 0.3, max: 1.2, step: 0.05, default: 1 };

/**
 * Type-ROLE range (SC-185) — the small/large/control text knobs over the
 * --dse-fs-* role scale. Started as the SAME numbers as CARD_SCALE (a separate
 * constant, not an alias, because the two govern different things and either may
 * move on its own — and SC-683 moved CARD_SCALE's minimum to 0.3 alone): 0.8–1.2,
 * symmetric about 1.0, so these three sliders' thumbs, like Text size's, sit at the
 * centre track position at 100% (Card size's no longer does).
 *
 * ±20% is a nudge, not a zoom: the whole-element zoom already exists as
 * TEXT_SCALE. What these do is retune the RATIO between a role and the body — at
 * 1.2 a `label` reaches 1.02em, i.e. body size, which is the intended ceiling for
 * "the small text is too small to read" and is exactly as far as that complaint
 * can sensibly go before the role stops being a small-text role at all.
 */
export const TYPE_SCALE: ScaleRange = { min: 0.8, max: 1.2, step: 0.05, default: 1 };

/**
 * Clamp `value` into the range and snap to the nearest step, returning the
 * range's default when `value` is not a finite number (site settings-core.js
 * snap(), including its parseFloat coercion of strings and the ×100 rounding
 * that keeps the result at two decimals — 0.6 + 9×0.05 is NOT 1.05 in floats).
 */
export function snap(value: unknown, range: ScaleRange): number {
	const n = typeof value === 'number' ? value : parseFloat(String(value));
	if (!isFinite(n)) return range.default;
	const clamped = Math.min(Math.max(n, range.min), range.max);
	const steps = Math.round((clamped - range.min) / range.step);
	return Math.round((range.min + steps * range.step) * 100) / 100;
}
