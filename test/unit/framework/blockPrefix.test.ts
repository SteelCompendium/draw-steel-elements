// SC-455 — blockPrefix.ts (the one definition of a blockquote/callout prefix) and the prefix-aware
// splices in fenceLine.ts built on it. Pure string logic.
import {
	addBlockPrefix,
	blankLinesAreTrimmed,
	matchFenceMarker,
	stripBlockPrefix,
} from '@/framework/host/blockPrefix';
import { blockBodyLines, parseOpenFenceLine, replaceFenceBlock, replaceFenceBody } from '@/framework/host/fenceLine';

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

describe('SC-455: fenceLine splices with a prefix', () => {
	test('parseOpenFenceLine reads the prefix; the info string keeps its spacing after the fence run', () => {
		expect(parseOpenFenceLine('> > ```ds-counter  extra  ')).toEqual({ prefix: '> > ', fence: '```', language: 'ds-counter', info: 'ds-counter  extra' });
		expect(parseOpenFenceLine('```ds-counter')).toEqual({ prefix: '', fence: '```', language: 'ds-counter', info: 'ds-counter' });
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

	test('replaceFenceBody swaps only the body: both fence lines stay byte-identical (trailing space, CRLF), prefix and ending re-applied', () => {
		const note = ['> [!n]', '> ```ds-counter ', '> a: 1', '> ``` ', '> t'].join('\r\n');
		expect(replaceFenceBody(note, 1, 3, 'a: 1\n_dse_anchor: abc')).toBe(
			['> [!n]', '> ```ds-counter ', '> a: 1', '> _dse_anchor: abc', '> ``` ', '> t'].join('\r\n'),
		);
		expect(replaceFenceBody('x\ny', 0, 1, 'z')).toBeNull(); // not a fence-open line
	});
});
