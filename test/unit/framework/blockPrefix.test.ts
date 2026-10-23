// SC-455 — blockPrefix.ts (the one definition of a blockquote/callout prefix) and the prefix-aware
// splices in fenceLine.ts built on it. Pure string logic.
import { fenceAlias, matchFenceLine } from '@/framework/sidebar/anchor';
import {
	addBlockPrefix,
	blankLinesAreTrimmed,
	fenceLanguage,
	matchFenceMarker,
	stripBlockPrefix,
} from '@/framework/host/blockPrefix';
import { blockBodyLines, emitOpenFenceLine, parseOpenFenceLine, replaceFenceBlock, replaceFenceBody } from '@/framework/host/fenceLine';

describe('SC-455: matchFenceMarker', () => {
	test.each([
		['```ds-counter', '', '```', 'ds-counter'],
		['> ```ds-counter', '> ', '```', 'ds-counter'],
		['>```ds-counter', '>', '```', 'ds-counter'],
		['> > ~~~ds-counter  extra', '> > ', '~~~', 'ds-counter  extra'],
		['>> ```', '>> ', '```', ''],
		['   > ```x', '   > ', '```', 'x'],
		['>   ```x', '>   ', '```', 'x'], // a list item's fence inside a callout: marker + 2 spaces
	])('%j is a fence line with prefix %j', (line, prefix, marker, rest) => {
		expect(matchFenceMarker(line)).toEqual({ prefix, marker, rest });
	});

	test.each([
		['  ```x'], // indented outside any quote: a list item's fence / an indented code block, not addressable
		['    ```x'],
		['> text'],
		['text ```x'],
		['> `` x'],
	])('%j is not a fence line DSE can address', (line) => {
		expect(matchFenceMarker(line)).toBeNull();
	});
});

describe('SC-455: stripBlockPrefix / addBlockPrefix', () => {
	test('the empty prefix is the identity both ways (an un-nested block never changes)', () => {
		expect(stripBlockPrefix('  name: A', '')).toBe('  name: A');
		expect(addBlockPrefix('', 'name: A')).toBe('name: A');
		expect(addBlockPrefix('', '')).toBe('');
	});

	test('strips exactly the block prefix, keeping the body line own indentation, and tolerates `>` vs `> `', () => {
		expect(stripBlockPrefix('> name: A', '> ')).toBe('name: A');
		expect(stripBlockPrefix('>name: A', '> ')).toBe('name: A');
		expect(stripBlockPrefix('>   nested: 1', '> ')).toBe('  nested: 1');
		expect(stripBlockPrefix('>', '> ')).toBe('');
		expect(stripBlockPrefix('> ', '> ')).toBe('');
		expect(stripBlockPrefix('> > name: A', '> > ')).toBe('name: A');
		expect(stripBlockPrefix('>>name: A', '> > ')).toBe('name: A');
		expect(stripBlockPrefix('> >', '> > ')).toBe('');
		expect(stripBlockPrefix('>     deeper', '>   ')).toBe('  deeper'); // `>   `: the marker's own space + 2 of indentation are stripped
	});

	test('null when the line has left the quote (or is shallower than the block)', () => {
		expect(stripBlockPrefix('', '> ')).toBeNull();
		expect(stripBlockPrefix('plain text', '> ')).toBeNull();
		expect(stripBlockPrefix('> still depth 1', '> > ')).toBeNull();
	});

	test('adds the prefix to a line; an empty line becomes the prefix without its trailing space (or with it)', () => {
		expect(addBlockPrefix('> ', 'name: A')).toBe('> name: A');
		expect(addBlockPrefix('> > ', 'a')).toBe('> > a');
		expect(addBlockPrefix('> ', '')).toBe('>');
		expect(addBlockPrefix('> ', '', false)).toBe('> ');
		expect(addBlockPrefix('>', '')).toBe('>');
		expect(addBlockPrefix('> > ', '')).toBe('> >');
	});

	test('blankLinesAreTrimmed: `> ` only when the block already spells an empty line that way', () => {
		expect(blankLinesAreTrimmed('> ', ['> a', '>', '> b'])).toBe(true);
		expect(blankLinesAreTrimmed('> ', ['> a', '> ', '> b'])).toBe(false);
		expect(blankLinesAreTrimmed('> ', ['> a', '> ', '>', '> b'])).toBe(true);
		expect(blankLinesAreTrimmed('> ', ['> a', '> b'])).toBe(true); // no empty line yet: the clean spelling
		expect(blankLinesAreTrimmed('> ', ['> a', '> \r'])).toBe(false); // a CRLF note's raw line
		expect(blankLinesAreTrimmed('>', ['>a'])).toBe(true);
		expect(blankLinesAreTrimmed('', [''])).toBe(true);
	});
});

// SC-455 review HIGH-1: what is written must read back as itself, whatever the prefix spelling.
describe('SC-455: stripBlockPrefix(addBlockPrefix(p, t), p) === t', () => {
	const PREFIXES = ['> ', '>', '> > ', '>>', '> >', ' > ', '>   ', ''];
	const TEXTS = ['name: A', '', ' one space', '  - name: x', '    deeper: 1', '\tTabbed', 'a:\n b:', '> already quoted', ' '];
	test.each(PREFIXES.flatMap((p) => TEXTS.flatMap((t) => [[p, t, true], [p, t, false]] as const)))(
		'prefix %j, text %j (trimBlank %s)',
		(prefix, text, trimBlank) => {
			for (const line of text.split('\n')) {
				expect(stripBlockPrefix(addBlockPrefix(prefix, line, trimBlank), prefix)).toBe(line);
			}
		},
	);
});

describe('SC-455: fenceLine splices with a prefix', () => {
	test('parseOpenFenceLine reads the prefix; the info string keeps its spacing after the fence run', () => {
		expect(parseOpenFenceLine('> > ```ds-counter  extra  ')).toEqual({ prefix: '> > ', fence: '```', language: 'ds-counter', info: 'ds-counter  extra' });
		expect(parseOpenFenceLine('```ds-counter')).toEqual({ prefix: '', fence: '```', language: 'ds-counter', info: 'ds-counter' });
	});

	// SC-457: the language is the first token of the TRIMMED info string; `info` stays the verbatim remainder.
	test.each([
		['one space', '``` ds-counter', ' ds-counter'],
		['three spaces', '```   ds-counter', '   ds-counter'],
		['a tab', '```\tds-counter', '\tds-counter'],
		['mixed whitespace and extra tokens', '``` \t ds-counter  extra', ' \t ds-counter  extra'],
		['trailing whitespace', '``` ds-counter  ', ' ds-counter'],
	])('parseOpenFenceLine skips whitespace before the language (%s) and keeps the info string verbatim', (_label, line, info) => {
		expect(parseOpenFenceLine(line)).toEqual({ prefix: '', fence: '```', language: 'ds-counter', info });
		expect(emitOpenFenceLine(parseOpenFenceLine(line)!)).toBe(`\`\`\`${info}`);
	});

	test('parseOpenFenceLine: a bare fence, and one with only whitespace after it, have the empty language; a prefix is separate', () => {
		expect(parseOpenFenceLine('```')?.language).toBe('');
		expect(parseOpenFenceLine('```   ')).toEqual({ prefix: '', fence: '```', language: '', info: '' });
		expect(parseOpenFenceLine('> > ``` ds-counter')).toEqual({ prefix: '> > ', fence: '```', language: 'ds-counter', info: ' ds-counter' });
	});

	test('fenceLanguage is the one definition: first token of the trimmed info string', () => {
		expect(['ds-counter', ' ds-counter', ' ds-counter extra', '\t ds-counter\textra', '', '   '].map(fenceLanguage)).toEqual([
			'ds-counter', 'ds-counter', 'ds-counter', 'ds-counter', '', '',
		]);
	});

	// Obsidian 1.14.4 does NOT render these as a ds-counter block (measured, Reading view and Live Preview): only a
	// space or a tab may precede the language, so the language of these fences is not `ds-counter`.
	test.each([
		['a no-break space', '\u00a0'],
		['U+3000', '\u3000'],
		['a form feed', '\f'],
		['a vertical tab', '\v'],
	])('%s before the language is NOT skipped: the fence is not a ds-counter block', (_label, ws) => {
		expect(parseOpenFenceLine(`\`\`\`${ws}ds-counter`)).toEqual({ prefix: '', fence: '```', language: `${ws}ds-counter`, info: `${ws}ds-counter` });
		expect(parseOpenFenceLine(`\`\`\` ${ws}ds-counter`)?.language).toBe(`${ws}ds-counter`);
		expect(fenceLanguage(`${ws}ds-counter`)).not.toBe('ds-counter');
		expect(fenceLanguage(` ${ws} ds-counter`)).not.toBe('ds-counter');
	});

	// A trailing no-break space / U+3000 / FF / VT / space does not change the language (Obsidian renders
	// ```ds-counter<U+3000> as the block; the info string is read without its trailing whitespace).
	test.each(['\u00a0', '\u3000', '\f', '\v', ' ', ' \u00a0 '])('trailing %j after the language leaves it ds-counter, on the host and the anchor parse alike', (ws) => {
		for (const opener of [`\`\`\`ds-counter${ws}`, `\`\`\` ds-counter${ws}`]) {
			expect(parseOpenFenceLine(opener)?.language).toBe('ds-counter');
			expect(fenceAlias(matchFenceLine(opener)!.rest)).toBe('ds-counter');
		}
	});

	// The name ends at the first whitespace character of ANY kind (as before SC-457): Live Preview renders
	// ```ds-counter<NBSP>x as the block, and Pin to sidebar must find it.
	test.each(['\u00a0x', '\u3000x', '\fx', '\vx', ' x', '  x', '\tx'])('the name ends at the whitespace in %j: the language is ds-counter', (tail) => {
		expect(parseOpenFenceLine(`\`\`\`ds-counter${tail}`)?.language).toBe('ds-counter');
		expect(fenceAlias(matchFenceLine(`\`\`\`ds-counter${tail}`)!.rest)).toBe('ds-counter');
	});

	// SC-487, measured in Obsidian 1.14.4: Live Preview ends the name at a zero-width character (renders the block), so the language
	// is the name before it - the pin must find the block it renders. Inside the name no mode renders it (the character ends the
	// name, it is not stripped from it), and before the name no mode renders it.
	test.each(['\u200b', '\u200c', '\u200d', '\u2060', '\ufeff'])('a zero-width character %j ends the name: after it the language is ds-counter, inside it the name stops short, before it the fence is no ds-counter block', (z) => {
		for (const tail of [z, `${z}x`, `${z} extra`, ` ${z}`, `${z}${z}`]) {
			expect(parseOpenFenceLine(`\`\`\`ds-counter${tail}`)?.language).toBe('ds-counter');
			expect(fenceAlias(matchFenceLine(`\`\`\`ds-counter${tail}`)!.rest)).toBe('ds-counter');
		}
		expect(fenceLanguage(`ds-co${z}unter`)).toBe('ds-co');
		expect(fenceLanguage(`${z}ds-counter`)).toBe(`${z}ds-counter`);
		expect(fenceLanguage(` ${z}ds-counter`)).toBe(`${z}ds-counter`);
		expect(['', ' '].map((pad) => fenceLanguage(`${pad}${z}`))).toEqual(['', '']);
	});

	test('replaceFenceBlock re-emits an opening line that holds a zero-width character byte for byte', () => {
		const open = '```ds-counter' + String.fromCharCode(0x200b);
		const note = ['top', open, 'a: 1', '```', 'bottom'].join('\n');
		expect(replaceFenceBlock(note, 1, 3, 'a: 2')).toBe(['top', open, 'a: 2', '```', 'bottom'].join('\n'));
	});

	test('replaceFenceBlock re-emits a spaced opening line byte for byte, in LF, CRLF and lone-CR notes', () => {
		const lf = ['top', '``` ds-counter  extra', 'a: 1', '```', 'bottom'].join('\n');
		expect(replaceFenceBlock(lf, 1, 3, 'a: 2')).toBe(['top', '``` ds-counter  extra', 'a: 2', '```', 'bottom'].join('\n'));
		const crlf = lf.replace(/\n/g, '\r\n');
		expect(replaceFenceBlock(crlf, 1, 3, 'a: 2')).toBe(['top', '``` ds-counter  extra', 'a: 2', '```', 'bottom'].join('\r\n'));
		const lone = ['top', 'x\ry', '```\tds-counter', 'a: 1', '```', 'bottom'].join('\n');
		expect(replaceFenceBlock(lone, 3, 5, 'a: 2')).toBe(['top', 'x\ry', '```\tds-counter', 'a: 2', '```', 'bottom'].join('\n'));
	});

	test('blockBodyLines returns the body without the prefix; identity for an un-nested block', () => {
		const lines = ['> [!note]', '> ```x', '> a: 1', '>', '> b: 2', '> ```'];
		expect(blockBodyLines(lines, 1, 5)).toEqual(['a: 1', '', 'b: 2']);
		expect(blockBodyLines(['```x', '  a: 1', '```'], 0, 2)).toEqual(['  a: 1']);
	});

	test('replaceFenceBlock prefixes every written line, keeps the opening info string and the close fence run, touches nothing else', () => {
		const note = ['top', '> [!note]', '> ````ds-counter  extra', '> a: 1', '> ````', '> tail', 'bottom'].join('\n');
		expect(replaceFenceBlock(note, 2, 4, 'a: 2\n\nb: 3')).toBe(
			['top', '> [!note]', '> ````ds-counter  extra', '> a: 2', '>', '> b: 3', '> ````', '> tail', 'bottom'].join('\n'),
		);
	});

	test('replaceFenceBlock of an unterminated callout fence closes it with the block prefix', () => {
		const note = ['> ```ds-counter', '> a: 1'].join('\n');
		expect(replaceFenceBlock(note, 0, 1, 'a: 2')).toBe(['> ```ds-counter', '> a: 2', '> ```'].join('\n'));
	});

	test('replaceFenceBlock on an un-nested block is the pre-SC-455 splice, byte for byte (a "> " body line is just body)', () => {
		const note = ['```ds-counter  extra', 'a: 1', '```', '> quote'].join('\n');
		expect(replaceFenceBlock(note, 0, 2, 'a: 2\n> kept')).toBe(['```ds-counter  extra', 'a: 2', '> kept', '```', '> quote'].join('\n'));
	});

	test('a body with leading-space lines is written back unchanged under a `>` (no space) prefix, again and again', () => {
		const note = ['>```ds-counter', '>a:', '>  b:', '>    c: 1', '>```'].join('\n');
		const body = blockBodyLines(note.split('\n'), 0, 4).join('\n');
		expect(body).toBe('a:\n b:\n   c: 1');
		const once = replaceFenceBlock(note, 0, 4, body)!;
		expect(once).toBe(note);
		expect(replaceFenceBlock(once, 0, 4, body)).toBe(note);
	});

	test('replaceFenceBody swaps only the body: both fence lines stay byte-identical (trailing space, CRLF), prefix and ending re-applied', () => {
		const note = ['> [!n]', '> ```ds-counter ', '> a: 1', '> ``` ', '> t'].join('\r\n');
		expect(replaceFenceBody(note, 1, 3, 'a: 1\n_dse_anchor: abc')).toBe(
			['> [!n]', '> ```ds-counter ', '> a: 1', '> _dse_anchor: abc', '> ``` ', '> t'].join('\r\n'),
		);
		expect(replaceFenceBody('x\ny', 0, 1, 'z')).toBeNull(); // not a fence-open line
	});
});
