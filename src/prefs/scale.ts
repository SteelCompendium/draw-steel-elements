// src/prefs/scale.ts — SC-112 (Plan 23 Task 7): the size-scale value layer.
//
// Sibling of fontStacks.ts, shared by the catalog descriptors (catalog.ts) and
// the Task 8 slider controls. snap() is a PORT OF THE SITE'S semantics VERBATIM
// (v2/docs/javascripts/settings-core.js:28-43 — a model, not an import): clamp
// into [min, max], round to the nearest step, return the default on anything
// non-finite. The ranges are the site's SCALE_*/CARD_* constants
// (settings-core.js:22-23) — both deliberately SYMMETRIC about the 1.0 default
// so the two sliders' thumbs sit at the same center track position at 100%;
// the plugin inherits that alignment property by using the same ranges.

/** One slider's numeric contract: bounds, step, and the inert default. */
export interface ScaleRange {
	readonly min: number;
	readonly max: number;
	readonly step: number;
	readonly default: number;
}

/** Text-size range — the site's SCALE_MIN/MAX/STEP/DEFAULT (settings-core.js:22). */
export const TEXT_SCALE: ScaleRange = { min: 0.6, max: 1.4, step: 0.05, default: 1 };

/** Card-size range — the site's CARD_MIN/MAX/STEP/DEFAULT (settings-core.js:23). */
export const CARD_SCALE: ScaleRange = { min: 0.8, max: 1.2, step: 0.05, default: 1 };

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
