// SC-453 — the shared line-ending helpers (framework/host/lineEnding.ts) and the EOL-aware
// block splice every host write goes through (fenceLine.ts's replaceFenceBlock). Pure string
// logic. The policy under test: a note that is all-CRLF stays all-CRLF after a block write, an
// all-LF note is byte-identical to the pre-SC-453 splice, and a mixed note follows its
// DOMINANT ending (a tie goes to the first line break) without losing content.
import { detectEol, splitLines, stripCr, toEol } from '@/framework/host/lineEnding';
import { parseOpenFenceLine, emitOpenFenceLine, replaceFenceBlock } from '@/framework/host/fenceLine';

/** The splice both hosts did inline BEFORE SC-453, verbatim — the byte-identity oracle for LF notes. */
function legacySplice(content: string, lineStart: number, lineEnd: number, newSource: string): string | null {
	const lines = content.split('\n');
	const openFence = parseOpenFenceLine(lines[lineStart]);
	if (!openFence) return null;
	const close = lines[lineEnd]?.match(/^([`~]{3,})/);
	const closeFence = close ? close[1] : openFence.fence;
	lines.splice(lineStart, lineEnd - lineStart + 1, emitOpenFenceLine(openFence), ...newSource.split('\n'), closeFence);
	return lines.join('\n');
}

describe('SC-453: detectEol', () => {
	test.each([
		['no line break at all', 'a single line', '\n'],
		['all LF', 'a\nb\nc\n', '\n'],
		['all CRLF', 'a\r\nb\r\nc\r\n', '\r\n'],
		['CRLF in the majority', 'a\r\nb\r\nc\nd\r\n', '\r\n'],
		['LF in the majority', 'a\nb\nc\r\nd\n', '\n'],
		['a tie goes to the FIRST line break (CRLF first)', 'a\r\nb\nc', '\r\n'],
		['a tie goes to the FIRST line break (LF first)', 'a\nb\r\nc', '\n'],
		['a lone CR is not a line break', 'a\rb\rc', '\n'],
	])('%s', (_label, text, expected) => {
		expect(detectEol(text)).toBe(expected);
	});
});

describe('SC-453: splitLines / stripCr / toEol', () => {
	test('splitLines yields the same line COUNT and indices as split("\\n"), minus each line\'s CR', () => {
		const text = 'a\r\nb\nc\r\n\r\nd';
		expect(splitLines(text)).toEqual(['a', 'b', 'c', '', 'd']);
		expect(splitLines(text)).toHaveLength(text.split('\n').length);
	});

	test('a lone CR (not before an LF) stays inside its line', () => {
		expect(splitLines('a\rb\r\nc')).toEqual(['a\rb', 'c']);
		expect(stripCr('a\rb\r\nc')).toBe('a\rb\nc');
	});

	test('toEol is the identity for LF and re-terminates every line for CRLF (no doubled CR)', () => {
		expect(toEol('a\nb', '\n')).toBe('a\nb');
		expect(toEol('a\nb\n', '\r\n')).toBe('a\r\nb\r\n');
		expect(toEol('a\r\nb', '\r\n')).toBe('a\r\nb');
	});
});

describe('SC-453: replaceFenceBlock', () => {
	const NEW = 'current_value: 5\n_dse_anchor: abc123';

	test.each([
		['a block mid-note', ['# T', '', '```ds-counter', 'current_value: 1', '```', '', 'tail'].join('\n'), 2, 4],
		['a block that ends the note, no trailing newline', ['# T', '```ds-counter', 'x: 1', '```'].join('\n'), 1, 3],
		['a block that ends the note, trailing newline', ['# T', '```ds-counter', 'x: 1', '```', ''].join('\n'), 1, 3],
		['an info-string fence', ['```ds-counter extra', 'x: 1', '```'].join('\n'), 0, 2],
		['a tilde fence', ['~~~ds-counter', 'x: 1', '~~~'].join('\n'), 0, 2],
		['an unterminated fence running to EOF', ['# T', '```ds-counter', 'x: 1'].join('\n'), 1, 2],
		['an empty body', ['```ds-counter', '```'].join('\n'), 0, 1],
	])('LF note, %s: byte-identical to the pre-SC-453 splice', (_label, note, start, end) => {
		expect(replaceFenceBlock(note, start, end, NEW)).toBe(legacySplice(note, start, end, NEW));
	});

	test('an LF note whose new source carries CRLF is written through unchanged (as before)', () => {
		const note = ['```ds-counter', 'x: 1', '```'].join('\n');
		expect(replaceFenceBlock(note, 0, 2, 'a: 1\r\nb: 2')).toBe(legacySplice(note, 0, 2, 'a: 1\r\nb: 2'));
	});

	test('CRLF note: the block is rewritten with CRLF, everything outside it is byte-identical', () => {
		const above = '# T\r\n\r\nabove\r\n';
		const below = '\r\nbelow\r\n';
		const note = `${above}\`\`\`ds-counter\r\ncurrent_value: 1\r\n_dse_anchor: abc123\r\n\`\`\`\r\n${below}`;
		const out = replaceFenceBlock(note, 3, 6, NEW)!;
		expect(out).toBe(`${above}\`\`\`ds-counter\r\ncurrent_value: 5\r\n_dse_anchor: abc123\r\n\`\`\`\r\n${below}`);
		expect(out.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/); // no stray bare CR / LF anywhere
	});

	test('CRLF note: a new source that already carries CRLF is not doubled', () => {
		const note = '```ds-counter\r\nx: 1\r\n```\r\n';
		expect(replaceFenceBlock(note, 0, 2, 'a: 1\r\nb: 2')).toBe('```ds-counter\r\na: 1\r\nb: 2\r\n```\r\n');
	});

	test('CRLF note whose last line (the close fence) has no trailing newline: no CR is invented at EOF', () => {
		const note = '# T\r\n```ds-counter\r\nx: 1\r\n```';
		expect(replaceFenceBlock(note, 1, 3, 'x: 2')).toBe('# T\r\n```ds-counter\r\nx: 2\r\n```');
	});

	test('CRLF note, unterminated fence at EOF: the synthesized close keeps the replaced last line\'s ending', () => {
		const note = '# T\r\n```ds-counter\r\nx: 1';
		expect(replaceFenceBlock(note, 1, 2, 'x: 2')).toBe('# T\r\n```ds-counter\r\nx: 2\r\n```');
	});

	test('a fence-open line is required: a non-fence line at lineStart yields null', () => {
		expect(replaceFenceBlock('plain\nlines\n', 0, 1, 'x')).toBeNull();
	});

	test('mixed note, CRLF dominant: the block is CRLF, a stray LF line outside it is untouched', () => {
		const note = 'a\r\nb\r\n```ds-counter\r\nx: 1\r\n```\r\ntail-lf\nz\r\n';
		const out = replaceFenceBlock(note, 2, 4, 'x: 2')!;
		expect(out).toBe('a\r\nb\r\n```ds-counter\r\nx: 2\r\n```\r\ntail-lf\nz\r\n');
	});

	test('mixed note, LF dominant: the block is LF and content outside it is untouched', () => {
		const note = 'a\nb\n```ds-counter\nx: 1\n```\ntail-crlf\r\nz\n';
		const out = replaceFenceBlock(note, 2, 4, 'x: 2')!;
		expect(out).toBe('a\nb\n```ds-counter\nx: 2\n```\ntail-crlf\r\nz\n');
	});
});
