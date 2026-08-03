// Plan 23 Task 7 (SC-112) — snap(): the site's settings-core.js snap() semantics,
// ported verbatim (v2/docs/javascripts/settings-core.js:28-43). The cases below
// mirror the site's own suite (v2/tests/settings-core.test.js clampScale /
// clampCardScale) plus the float-precision hazard the ×100 rounding exists for.
// Pure unit tests — no DOM.
import { snap, TEXT_SCALE, CARD_SCALE } from '../../../src/prefs/scale';

test('ranges are the site constants, both symmetric about the 1.0 default', () => {
	expect(TEXT_SCALE).toEqual({ min: 0.6, max: 1.4, step: 0.05, default: 1 });
	expect(CARD_SCALE).toEqual({ min: 0.8, max: 1.2, step: 0.05, default: 1 });
	// The symmetry that centers the default slider thumb (settings-core.js:17-21).
	expect(TEXT_SCALE.max - TEXT_SCALE.default).toBeCloseTo(TEXT_SCALE.default - TEXT_SCALE.min);
	expect(CARD_SCALE.max - CARD_SCALE.default).toBeCloseTo(CARD_SCALE.default - CARD_SCALE.min);
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

test('card: clamps to [0.8, 1.2] and snaps to 0.05 (site clampCardScale cases)', () => {
	expect(snap(1, CARD_SCALE)).toBe(1);
	expect(snap(0.5, CARD_SCALE)).toBe(0.8); // below min
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
	expect(snap(0.8, CARD_SCALE)).toBe(0.8);
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
