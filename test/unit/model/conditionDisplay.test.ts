// SC-186 — shared condition DISPLAY fallback helpers (src/elements/conditionDisplay.ts):
// the generic fallback glyph/title-case story for unregistered condition keys, and the
// custom-condition text -> Condition.key slug ConditionsModal's "Add custom" row uses.
import { titleCaseConditionKey, slugConditionKey, FALLBACK_CONDITION_ICON } from '../../../src/elements/conditionDisplay';

describe('SC-186: titleCaseConditionKey', () => {
	test('hyphenated / underscored / spaced keys all title-case the same way', () => {
		expect(titleCaseConditionKey('used-triggered-action')).toBe('Used Triggered Action');
		expect(titleCaseConditionKey('high_ground')).toBe('High Ground');
		expect(titleCaseConditionKey('hexed')).toBe('Hexed');
	});

	test('collapses repeated separators and ignores leading/trailing ones', () => {
		expect(titleCaseConditionKey('--hexed--by--the-witch--')).toBe('Hexed By The Witch');
	});
});

describe('SC-186 fix-round LOW-2: slugConditionKey', () => {
	test('lowercases and hyphenates ordinary text', () => {
		expect(slugConditionKey('Hexed By The Witch')).toBe('hexed-by-the-witch');
	});

	test('NFKD-normalizes accented Latin letters to their base letter, not dropping them', () => {
		// The bug: a naive [^a-z0-9]+ strip on the RAW string drops 'Ü' entirely
		// ("Ünholy" -> "nholy"). NFKD decomposes 'Ü' into 'U' + a combining diaeresis
		// FIRST, so stripping combining marks before the character-class filter leaves
		// the base letter.
		expect(slugConditionKey('Ünholy')).toBe('unholy');
		expect(slugConditionKey('Café Fear')).toBe('cafe-fear');
		expect(slugConditionKey('Naïve Curse')).toBe('naive-curse');
	});

	test('blank/punctuation-only input slugs to the empty string', () => {
		expect(slugConditionKey('???')).toBe('');
		expect(slugConditionKey('   ')).toBe('');
	});

	test('clamps to 64 characters, never leaving a trailing hyphen from the cut', () => {
		const long = 'a'.repeat(80);
		const slug = slugConditionKey(long);
		expect(slug.length).toBe(64);
		expect(slug).toBe('a'.repeat(64));

		// A cut that WOULD land mid-hyphen-run is trimmed clean.
		const words = Array.from({ length: 20 }, (_, i) => `word${i}`).join(' '); // > 64 chars
		const wordSlug = slugConditionKey(words);
		expect(wordSlug.length).toBeLessThanOrEqual(64);
		expect(wordSlug.endsWith('-')).toBe(false);
	});
});

describe('SC-186: FALLBACK_CONDITION_ICON', () => {
	test('is the Lucide "circle-dashed" glyph (reads as "unregistered")', () => {
		expect(FALLBACK_CONDITION_ICON).toBe('circle-dashed');
	});
});
