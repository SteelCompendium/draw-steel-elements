// test/unit/elements/cardLayoutHelpers.test.ts — SC-120 Batch A (design §5.1): direct unit
// coverage for the shared helpers extracted this batch. `stripInlineMarkdown`/`plainText`
// live in CardLayout.ts (shared with `normalizeForDuplicateCheck`, "one regex pair, not two
// that can drift" — design §5.1); `languageCount` lives in layouts.ts (design §3.2, next to
// `kitBonusValue`).
import { stripInlineMarkdown, plainText, normalizeForDuplicateCheck } from '@/elements/shared/CardLayout';
import { languageCount } from '@/elements/display/layouts';

describe('SC-120 Batch A: stripInlineMarkdown / plainText (CardLayout.ts)', () => {
	test('strips a markdown link to its link text', () => {
		expect(stripInlineMarkdown('[Reason](scc.v1:mcdm.heroes.v1/rule.character/reason)')).toBe('Reason');
	});

	test('strips emphasis/code markers', () => {
		expect(stripInlineMarkdown('*Quick Build:* `Lead`')).toBe('Quick Build: Lead');
	});

	test('plainText: real class potency value — link stripped, case and spacing preserved', () => {
		const raw = '[Reason](scc.v1:mcdm.heroes.v1/rule.character/reason) − 2';
		expect(plainText(raw)).toBe('Reason − 2');
	});

	test('plainText: preserves case (does NOT lowercase, unlike normalizeForDuplicateCheck)', () => {
		expect(plainText('[Reason](scc.v1:...)')).toBe('Reason');
		expect(normalizeForDuplicateCheck('[Reason](scc.v1:...)')).toBe('reason');
	});

	test('plainText: trims edge whitespace left behind by link removal', () => {
		expect(plainText('  [Reason](scc.v1:...)  ')).toBe('Reason');
	});

	test('normalizeForDuplicateCheck: unaffected by the stripInlineMarkdown extraction (regression)', () => {
		expect(normalizeForDuplicateCheck('  **[Renown](scc.v1:...):**  +1  ')).toBe('renown: +1');
	});
});

describe('SC-120 Batch A: languageCount (layouts.ts, design §3.2 — ports careerLanguageCount)', () => {
	test('strips a trailing " language" suffix', () => {
		expect(languageCount('One language')).toBe('One');
	});

	test('strips a trailing " languages" suffix (plural)', () => {
		expect(languageCount('Two languages')).toBe('Two');
	});

	test('is case-insensitive on the suffix', () => {
		expect(languageCount('Three LANGUAGES')).toBe('Three');
	});

	test('falls back to the whole string when there is no recognized suffix (site parity: never empties a non-empty input)', () => {
		expect(languageCount('None')).toBe('None');
	});

	test('undefined/empty input -> "" (statTiles() owns the dash fallback for a genuinely absent field)', () => {
		expect(languageCount(undefined)).toBe('');
		expect(languageCount('')).toBe('');
		expect(languageCount('   ')).toBe('');
	});
});
