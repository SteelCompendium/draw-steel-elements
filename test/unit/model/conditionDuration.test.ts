// SC-186 — shared condition DURATION helpers (src/elements/conditionDuration.ts). The
// consumers (panel.ts, hero/view.ts, ConditionsModal) are covered end-to-end elsewhere;
// this file pins the pure functions directly, including the fix-round MED-1 export
// (`isLegacyDurationText`) ConditionsModal.setDuration needs to migrate/clear a legacy
// effect-string duration when the user makes an explicit duration choice.
import {
	resolveDuration,
	durationBadgeText,
	isSaveEnds,
	isLegacyDurationText,
} from '../../../src/elements/conditionDuration';

describe('SC-186: resolveDuration', () => {
	test('the first-class field wins when present and valid', () => {
		expect(resolveDuration({ duration: 'save-ends', effect: 'glow' })).toBe('save-ends');
	});

	test('falls back to the tolerant legacy effect-string parse when duration is absent', () => {
		expect(resolveDuration({ effect: 'save ends' })).toBe('save-ends');
		expect(resolveDuration({ effect: 'EoT' })).toBe('eot');
		expect(resolveDuration({ effect: '  eoe  ' })).toBe('eoe');
	});

	test('an unrecognized effect string resolves to undefined ("until removed")', () => {
		expect(resolveDuration({ effect: 'glow' })).toBeUndefined();
		expect(resolveDuration({})).toBeUndefined();
	});
});

describe('SC-186: durationBadgeText / isSaveEnds', () => {
	test('the three known durations format to the panel badge vocabulary', () => {
		expect(durationBadgeText('save-ends')).toBe('Save Ends');
		expect(durationBadgeText('eot')).toBe('EoT');
		expect(durationBadgeText('eoe')).toBe('EoE');
		expect(durationBadgeText(undefined)).toBeNull();
	});

	test('only save-ends offers the roll affordance', () => {
		expect(isSaveEnds('save-ends')).toBe(true);
		expect(isSaveEnds('eot')).toBe(false);
		expect(isSaveEnds(undefined)).toBe(false);
	});
});

describe('SC-186 fix-round MED-1: isLegacyDurationText', () => {
	test('true for the three legacy duration spellings (case/whitespace-insensitive)', () => {
		expect(isLegacyDurationText('save ends')).toBe(true);
		expect(isLegacyDurationText('EoT')).toBe(true);
		expect(isLegacyDurationText(' eoe ')).toBe(true);
	});

	test('false for a real CSS pulse effect, or absent/unrelated text', () => {
		expect(isLegacyDurationText('glow')).toBe(false);
		expect(isLegacyDurationText(undefined)).toBe(false);
		expect(isLegacyDurationText('')).toBe(false);
	});
});
