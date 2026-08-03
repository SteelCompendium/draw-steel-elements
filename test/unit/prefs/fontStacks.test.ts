// Plan 23 Task 6 (SC-112) — the font-slot value layer: sanitizeFamily() table
// tests (normalization + injection neutralization), fontCss() fallback tails per
// slot, and the curated-list invariants the Task 8 dropdown relies on. Pure unit
// tests — no DOM.
import {
	sanitizeFamily, fontCss, CURATED_FONTS, DEFAULT_FONT_OPTION,
} from '../../../src/prefs/fontStacks';
import type { FontSlot } from '../../../src/prefs/fontStacks';

describe('sanitizeFamily — normalization', () => {
	test.each<[string, string, string]>([
		['bare name is quoted', 'Georgia', '"Georgia"'],
		['spaced name is quoted', 'Palatino Linotype', '"Palatino Linotype"'],
		['already-quoted input: quotes stripped, re-quoted canonically', '"Georgia"', '"Georgia"'],
		['single-quoted input likewise', "'Times New Roman'", '"Times New Roman"'],
		['stack passes through token-by-token', 'Georgia, Times New Roman, serif', '"Georgia", "Times New Roman", serif'],
		['generic keywords stay bare (quoting would kill the fallback)', 'system-ui', 'system-ui'],
		['generic keyword case-insensitive, typed case preserved', 'Serif', 'Serif'],
		['ui-monospace stays bare', 'ui-monospace', 'ui-monospace'],
		['whitespace trimmed and collapsed', '  Palatino   Linotype  ,  serif ', '"Palatino Linotype", serif'],
		['empty tokens dropped', 'Georgia,, ,serif', '"Georgia", serif'],
	])('%s', (_name, input, expected) => {
		expect(sanitizeFamily(input)).toBe(expected);
	});

	test.each<[string, string]>([
		['empty string', ''],
		['whitespace only', '   '],
		['commas only', ' , , '],
		['quotes only', '"\'"'],
		['forbidden chars only', ';{}()\\`'],
	])('returns null (= default) when nothing survives: %s', (_name, input) => {
		expect(sanitizeFamily(input)).toBeNull();
	});
});

describe('sanitizeFamily — injection attempts are neutralized', () => {
	test('declaration breakout (;) is stripped and the remaining token quoted', () => {
		expect(sanitizeFamily('Georgia; background: red')).toBe('"Georgia background: red"');
	});
	test('block breakout ({}) cannot open or close a rule', () => {
		const out = sanitizeFamily('Georgia} .evil{color:red');
		expect(out).toBe('"Georgia .evilcolor:red"');
		expect(out).not.toMatch(/[{}]/);
	});
	test('function calls (var()/url()) lose their parens', () => {
		expect(sanitizeFamily('var(--font-text)')).toBe('"var--font-text"');
		expect(sanitizeFamily('url(https://evil.example)')).toBe('"urlhttps://evil.example"');
	});
	test('string-escape smuggling (backslash, backtick, quotes) is stripped', () => {
		expect(sanitizeFamily('Geo\\rgia`"\'')).toBe('"Georgia"');
	});
	test('control characters are stripped', () => {
		expect(sanitizeFamily('Geor\u0000gia\u001f\u007f')).toBe('"Georgia"');
	});
	test('no output ever contains an unquoted forbidden character', () => {
		const hostile = ';{}()"\'\\`Georgia;}{)("\'\\`';
		expect(sanitizeFamily(hostile)).toBe('"Georgia"');
	});
});

describe('fontCss — sanitized family + the slot\'s §5 fallback tail', () => {
	test.each<[FontSlot, string]>([
		['title', 'var(--font-text)'],
		['body', 'var(--font-text)'],
		['controls', 'var(--dse-font-body)'],
		['cardBody', 'var(--dse-font-body)'],
		['label', 'var(--dse-font-title)'],
		['mono', 'var(--font-monospace)'],
	])('slot %s → "<family>", %s', (slot, tail) => {
		expect(fontCss(slot, 'Georgia')).toBe(`"Georgia", ${tail}`);
	});

	test('a family that sanitizes away yields null (treated as default)', () => {
		expect(fontCss('title', '')).toBeNull();
		expect(fontCss('mono', ' ;() ')).toBeNull();
	});

	test('a multi-token stack keeps the tail appended once, at the end', () => {
		expect(fontCss('body', 'Palatino Linotype, serif')).toBe('"Palatino Linotype", serif, var(--font-text)');
	});
});

describe('curated list invariants (the Task 8 dropdown contract)', () => {
	test('the uniform default option: value \'\' labeled per Scott\'s 2026-08-02 ruling', () => {
		expect(DEFAULT_FONT_OPTION).toEqual({ value: '', label: 'Default (Obsidian vault fonts)' });
	});
	test('values are bare family names — every curated value round-trips through fontCss', () => {
		for (const { value } of [...CURATED_FONTS.text, ...CURATED_FONTS.mono]) {
			expect(value).not.toMatch(/[,"']/); // bare: no baked-in stacks or quotes
			expect(fontCss('body', value)).not.toBeNull();
		}
	});
	test('the bundled Steel face leads the text list; the mono list is mono-only', () => {
		expect(CURATED_FONTS.text[0].value).toBe('Source Serif 4');
		expect(CURATED_FONTS.mono.map((f) => f.value)).toEqual(['JetBrains Mono', 'Fira Code', 'ui-monospace']);
	});
});
