// SC-453 — the shared line-ending helpers (framework/host/lineEnding.ts) and the EOL-aware
// block splice every host write goes through (fenceLine.ts's replaceFenceBlock). Pure string
// logic. The policy under test: a note that is all-CRLF stays all-CRLF after a block write, an
// all-LF note is byte-identical to the pre-SC-453 splice, and a mixed note follows its
// DOMINANT ending (a tie goes to the first line break) without losing content.
import { detectEol, joinWithEols, splitLines, splitWithEols, stripCr, toEol } from '@/framework/host/lineEnding';
import { parseOpenFenceLine, emitOpenFenceLine, replaceFenceBlock, replaceFenceBody } from '@/framework/host/fenceLine';

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
		['a lone CR casts no vote (SC-460: it is a line break, but a stray one never decides the note\'s ending)', 'a\rb\rc', '\n'],
		['a stray lone CR in an LF note does not outvote the LF lines', 'a\rb\rc\rd\ne\nf', '\n'],
		['a stray lone CR in a CRLF note does not outvote the CRLF lines', 'a\rb\rc\rd\r\ne\r\nf', '\r\n'],
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

	test('stripCr drops only a CR that precedes an LF; a lone CR stays', () => {
		expect(stripCr('a\rb\r\nc')).toBe('a\rb\nc');
	});

	test('toEol is the identity for LF and re-terminates every line for CRLF (no doubled CR)', () => {
		expect(toEol('a\nb', '\n')).toBe('a\nb');
		expect(toEol('a\nb\n', '\r\n')).toBe('a\r\nb\r\n');
		expect(toEol('a\r\nb', '\r\n')).toBe('a\r\nb');
	});
});

// SC-460 — Obsidian's own line numbering (measured on 1.14.4: getSectionInfo, the metadata cache's
// sections and the CodeMirror editor all agree) counts CR, CRLF and LF as ONE break each, so a lone CR
// above a block shifts every line number below it. U+2028 / U+2029 / NEL / VT / FF are not breaks.
describe('SC-460: splitLines / splitWithEols use Obsidian\'s line-break rule', () => {
	test.each([
		['a lone CR', 'a\rb', ['a', 'b']],
		['CRLF is ONE break', 'a\r\nb', ['a', 'b']],
		['LF', 'a\nb', ['a', 'b']],
		['CR then CRLF is TWO breaks', 'a\r\r\nb', ['a', '', 'b']],
		['LF then CR is two breaks', 'a\n\rb', ['a', '', 'b']],
		['a trailing lone CR leaves an empty last line, like a trailing LF', 'a\r', ['a', '']],
		['U+2028 / U+2029 / NEL / VT / FF are not breaks', 'a\u2028b\u2029c\u0085d\u000be\u000cf', ['a\u2028b\u2029c\u0085d\u000be\u000cf']],
	])('splitLines: %s', (_label, text, expected) => {
		expect(splitLines(text)).toEqual(expected);
	});

	test('splitWithEols keeps each line\'s own terminator and joinWithEols restores the text byte for byte', () => {
		const texts = ['', 'a', 'a\n', 'a\r', 'a\r\n', 'a\rb\nc\r\nd\r\r\n\n\re', '\r\r\r', '# t\n\nA\rB\n```x\n```\n'];
		for (const text of texts) {
			const { lines, eols } = splitWithEols(text);
			expect(lines).toHaveLength(eols.length);
			expect(lines).toEqual(splitLines(text));
			expect(joinWithEols(lines, eols)).toBe(text);
		}
		expect(splitWithEols('a\rb\r\nc\nd').eols).toEqual(['\r', '\r\n', '\n', '']);
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

// SC-460 — a lone CR above the block shifts Obsidian's line numbers: the indices handed to the splice are
// in Obsidian's numbering, and every byte outside the block (the lone CRs included) survives.
describe('SC-460: replaceFenceBlock / replaceFenceBody in a note holding lone CRs', () => {
	test('LF note, a lone CR above the block: the splice lands on the Obsidian-numbered block, the CR survives', () => {
		const note = 'A\rB\n\n```ds-counter\nx: 1\n```\nt';
		// Obsidian lines: A, B, '', ```ds-counter (3), x: 1, ``` (5), t
		expect(replaceFenceBlock(note, 3, 5, 'x: 2')).toBe('A\rB\n\n```ds-counter\nx: 2\n```\nt');
	});

	test('CRLF note, a lone CR above the block: the block is CRLF, every other byte (the lone CR too) is unchanged', () => {
		const note = '# T\r\nA\rB\r\n\r\n```ds-counter\r\nx: 1\r\n```\r\nt\r\n';
		// Obsidian lines: # T, A, B, '', ```ds-counter (4), x: 1, ``` (6), t, ''
		expect(replaceFenceBlock(note, 4, 6, 'x: 2\ny: 3')).toBe('# T\r\nA\rB\r\n\r\n```ds-counter\r\nx: 2\r\ny: 3\r\n```\r\nt\r\n');
	});

	test('several lone CRs above, one below and one at the start of the note all survive', () => {
		const note = '\rA\rB\rC\n```ds-counter\nx: 1\n```\nD\rE\n';
		expect(replaceFenceBlock(note, 4, 6, 'x: 2')).toBe('\rA\rB\rC\n```ds-counter\nx: 2\n```\nD\rE\n');
	});

	test('a fence that directly follows a lone CR is a line of its own', () => {
		const note = 'A\r```ds-counter\nx: 1\n```\n';
		expect(replaceFenceBlock(note, 1, 3, 'x: 2')).toBe('A\r```ds-counter\nx: 2\n```\n');
	});

	test('the replaced close fence\'s own terminator survives, even when it is a lone CR', () => {
		const note = '```ds-counter\nx: 1\n```\rafter\n';
		expect(replaceFenceBlock(note, 0, 2, 'x: 2')).toBe('```ds-counter\nx: 2\n```\rafter\n');
	});

	test('a lone CR INSIDE the old body is a line break: the body is rewritten in the note\'s ending, nothing outside it moves', () => {
		const note = 'top\r\n```ds-counter\r\nname: A\rcurrent_value: 1\r\n```\r\nbottom\r\n';
		// Obsidian lines: top, ```ds-counter (1), name: A, current_value: 1, ``` (4), bottom, ''
		expect(replaceFenceBlock(note, 1, 4, 'name: A\ncurrent_value: 2')).toBe('top\r\n```ds-counter\r\nname: A\r\ncurrent_value: 2\r\n```\r\nbottom\r\n');
	});

	test('a lone CR inside the NEW source is kept byte for byte (an element\'s own text is never rewritten)', () => {
		const note = '```ds-counter\nx: 1\n```\n';
		expect(replaceFenceBlock(note, 0, 2, 'x: a\rb')).toBe('```ds-counter\nx: a\rb\n```\n');
	});

	test('a note with no lone CR is spliced exactly as before (the pre-SC-460 oracle)', () => {
		const note = ['# T', '', '```ds-counter', 'x: 1', '```', '', 'tail'].join('\n');
		expect(replaceFenceBlock(note, 2, 4, 'x: 2')).toBe(legacySplice(note, 2, 4, 'x: 2'));
	});

	test('replaceFenceBody (the anchor stamp) lands in a note with a lone CR above and keeps both fences byte for byte', () => {
		const note = 'A\rB\r\n```ds-counter\r\nx: 1\r\n```\r\n';
		expect(replaceFenceBody(note, 2, 4, 'x: 1\n_dse_anchor: abc123')).toBe('A\rB\r\n```ds-counter\r\nx: 1\r\n_dse_anchor: abc123\r\n```\r\n');
	});
});
