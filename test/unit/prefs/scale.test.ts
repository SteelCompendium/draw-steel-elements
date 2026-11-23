// Plan 23 Task 7 (SC-112) — snap(): the site's settings-core.js snap() semantics,
// ported verbatim (v2/docs/javascripts/settings-core.js:28-43). The cases below
// mirror the site's own suite (v2/tests/settings-core.test.js clampScale /
// clampCardScale) plus the float-precision hazard the ×100 rounding exists for.
// Pure unit tests — no DOM.
import { snap, TEXT_SCALE, CARD_SCALE, TYPE_SCALE } from '../../../src/prefs/scale';

test('ranges: text mirrors the site; card is 30%-120% (SC-683) and no longer mirrors it; type is 80%-120%', () => {
	expect(TEXT_SCALE).toEqual({ min: 0.6, max: 1.4, step: 0.05, default: 1 });
	// SC-683 (Scott: "Lets go with 30% min"): the site's CARD_MIN stays 0.8, the plugin's does not.
	expect(CARD_SCALE).toEqual({ min: 0.3, max: 1.2, step: 0.05, default: 1 });
	expect(TYPE_SCALE).toEqual({ min: 0.8, max: 1.2, step: 0.05, default: 1 });
	// The symmetry that centers the default slider thumb (settings-core.js:17-21) holds for
	// the text and type sliders; Card size is deliberately asymmetric since SC-683.
	expect(TEXT_SCALE.max - TEXT_SCALE.default).toBeCloseTo(TEXT_SCALE.default - TEXT_SCALE.min);
	expect(TYPE_SCALE.max - TYPE_SCALE.default).toBeCloseTo(TYPE_SCALE.default - TYPE_SCALE.min);
	expect(CARD_SCALE.default - CARD_SCALE.min).toBeCloseTo(0.7);
	expect(CARD_SCALE.max - CARD_SCALE.default).toBeCloseTo(0.2);
});

test('text: clamps to [0.6, 1.4] and snaps to 0.05 (site clampScale cases)', () => {
	expect(snap(1, TEXT_SCALE)).toBe(1);
	expect(snap(0.5, TEXT_SCALE)).toBe(0.6); // below min
	expect(snap(2, TEXT_SCALE)).toBe(1.4); // above max
	expect(snap('1.07', TEXT_SCALE)).toBe(1.05); // snap down to step
	expect(snap('1.08', TEXT_SCALE)).toBe(1.1); // snap up to step
	expect(snap('abc', TEXT_SCALE)).toBe(1); // NaN → default
	expect(snap(undefined, TEXT_SCALE)).toBe(1);
});

test('card: clamps to [0.3, 1.2] and snaps to 0.05 (site clampCardScale cases, min moved by SC-683)', () => {
	expect(snap(1, CARD_SCALE)).toBe(1);
	expect(snap(0.5, CARD_SCALE)).toBe(0.5); // in range since SC-683 (was clamped to 0.8)
	expect(snap(0.1, CARD_SCALE)).toBe(0.3); // below min
	expect(snap(0.27, CARD_SCALE)).toBe(0.3); // below min, off-step
	expect(snap(1.5, CARD_SCALE)).toBe(1.2); // above max
	expect(snap('0.78', CARD_SCALE)).toBe(0.8); // snap up to step
	expect(snap('1.12', CARD_SCALE)).toBe(1.1); // snap down to step
	expect(snap(NaN, CARD_SCALE)).toBe(1); // NaN → default
	expect(snap(null, CARD_SCALE)).toBe(1); // non-numeric → default
	expect(snap(Infinity, CARD_SCALE)).toBe(1); // non-finite → default
});

test('the exact bounds are representable (min/max survive the snap round-trip)', () => {
	expect(snap(0.6, TEXT_SCALE)).toBe(0.6);
	expect(snap(1.4, TEXT_SCALE)).toBe(1.4);
	expect(snap(0.3, CARD_SCALE)).toBe(0.3);
	expect(snap(0.8, CARD_SCALE)).toBe(0.8); // the old minimum is an ordinary step now
	expect(snap(1.2, CARD_SCALE)).toBe(1.2);
});

test('the ×100 rounding kills float noise: every step lands on two decimals', () => {
	// 0.6 + 9×0.05 is 1.0499999999999998 in raw floats — the site rounds to 1.05.
	expect(snap(1.05, TEXT_SCALE)).toBe(1.05);
	for (let n = 0; n <= Math.round((TEXT_SCALE.max - TEXT_SCALE.min) / TEXT_SCALE.step); n++) {
		const raw = TEXT_SCALE.min + n * TEXT_SCALE.step;
		const snapped = snap(raw, TEXT_SCALE);
		expect(snapped).toBe(Math.round(raw * 100) / 100);
	}
});

test('card: every step from 0.3 to 1.2 (19 values) snaps to itself as an exact two-decimal number (SC-683)', () => {
	const LITERALS = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2];
	expect(LITERALS).toHaveLength(19);
	for (let n = 0; n < LITERALS.length; n++) {
		const raw = CARD_SCALE.min + n * CARD_SCALE.step; // raw floats: 0.3 + 3×0.05 is not 0.45
		expect(snap(raw, CARD_SCALE)).toBe(LITERALS[n]); // toBe is Object.is: the exact double of the two-decimal literal
		expect(snap(LITERALS[n], CARD_SCALE)).toBe(LITERALS[n]);
		expect(String(snap(raw, CARD_SCALE))).toBe(String(LITERALS[n])); // what is stamped on --dse-card-scale
	}
});
