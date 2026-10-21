// SC-456 - the e2e driver's after-every-test note-integrity check (e2e/driver/noteFences.ts, pure so it
// loads here). It used to record only the first token of each opening fence line, so it could not catch
// a write that rewrote the opening line of the block under test (the SC-290 bug class) and it reported
// false failures on `~~~` fences and on a space before the language.
import { integrityProblems, scanFences, skeletonOf } from '../../e2e/driver/noteFences';
import { matchFenceMarker } from '../../src/framework/host/blockPrefix';
import { parseOpenFenceLine } from '../../src/framework/host/fenceLine';
import { fenceAlias, isFenceClose, listFences, matchFenceLine } from '../../src/framework/sidebar/anchor';

const nl = (...lines: string[]): string => lines.join('\n');
const T0 = new Set([0]);

describe('e2e integrity: fence forms the product accepts are not false failures', () => {
	test('a ~~~ fence: a body-only write to the target reports nothing', () => {
		const fixture = nl('# n', '~~~ds-counter', 'current_value: 1', '~~~', 'after');
		const now = nl('# n', '~~~ds-counter', 'current_value: 2', '~~~', 'after');
		expect(integrityProblems('n.md', now, fixture, T0)).toEqual([]);
		expect(skeletonOf(fixture)).toMatchObject({ fences: 1, unterminated: false });
	});

	test('a four-backtick fence holding an inner ``` line is ONE fence, closed by the 4-backtick line', () => {
		const fixture = nl('````ds-x', '```', 'a: 1', '```', '````', 'tail');
		const now = nl('````ds-x', '```', 'a: 2', '```', '````', 'tail');
		expect(scanFences(fixture)).toHaveLength(1);
		expect(skeletonOf(fixture)).toMatchObject({ fences: 1, unterminated: false });
		expect(integrityProblems('n.md', now, fixture, T0)).toEqual([]);
	});

	test('a closing fence longer than the opener (and trailing spaces) still closes', () => {
		const note = nl('```ds-x', 'a: 1', '`````  ', 'tail');
		expect(scanFences(note)[0]).toMatchObject({ closed: true, closeLine: '`````  ', end: 2 });
	});

	test('a space before the language is targetable as type `ds-x` (O2)', () => {
		const fixture = nl('``` ds-x', 'a: 1', '```');
		const f = scanFences(fixture)[0];
		expect(f.lang).toBe('ds-x');
		expect(f.openLine).toBe('``` ds-x');
		expect(integrityProblems('n.md', nl('``` ds-x', 'a: 2', '```'), fixture, T0)).toEqual([]);
	});

	test('the type is the first token of the trimmed info string; a bare fence has type ""', () => {
		expect(scanFences('```ds-x  extra words\n```')[0].lang).toBe('ds-x');
		expect(scanFences('~~~   ds-y\t k=v \n~~~')[0].lang).toBe('ds-y');
		expect(scanFences('```\nplain\n```')[0].lang).toBe('');
	});

	test('a fence-looking line inside an open fence is body: a ds-x example inside ```md is not a block', () => {
		const note = nl('```md', '```ds-x', 'a: 1', '```', '````ds-x', 'b: 1', '````');
		// line 1 (```ds-x) carries an info string so it does not close the ```md fence; the bare ``` on line 3 does
		expect(scanFences(note).map((f) => [f.lang, f.start, f.end])).toEqual([
			['md', 0, 3],
			['ds-x', 4, 6],
		]);
	});
});

describe('e2e integrity: the full opening and closing line of every fence is compared', () => {
	const fixture = nl('intro', '```ds-counter extra', 'current_value: 1', '```', 'outro');

	test('a target whose BODY changes is not reported', () => {
		const now = nl('intro', '```ds-counter extra', 'current_value: 9', 'added: 1', '```', 'outro');
		expect(integrityProblems('n.md', now, fixture, T0)).toEqual([]);
	});

	test('a target whose opening line changes (info string dropped) IS reported - the SC-290 bug class', () => {
		const now = nl('intro', '```ds-counter', 'current_value: 9', '```', 'outro');
		const problems = integrityProblems('n.md', now, fixture, T0);
		expect(problems.some((p) => p.includes('fence #0 (ds-counter) opening line changed'))).toBe(true);
		expect(problems.some((p) => p.includes('opening / closing line'))).toBe(true);
	});

	test('the reverse (an info string appearing) and a changed fence run are reported too', () => {
		const plain = nl('```ds-counter', 'a: 1', '```');
		expect(integrityProblems('n.md', nl('```ds-counter extra', 'a: 1', '```'), plain, T0)).not.toEqual([]);
		expect(integrityProblems('n.md', nl('~~~ds-counter', 'a: 1', '~~~'), plain, T0)).not.toEqual([]);
	});

	test('a target whose closing line changes IS reported', () => {
		const now = nl('intro', '```ds-counter extra', 'current_value: 9', '````', 'outro');
		const problems = integrityProblems('n.md', now, fixture, T0);
		expect(problems.some((p) => p.includes('fence #0 (ds-counter) closing line changed'))).toBe(true);
	});

	test('a changed first token is still reported', () => {
		const now = nl('intro', '```ds-other extra', 'current_value: 1', '```', 'outro');
		expect(integrityProblems('n.md', now, fixture, T0)).not.toEqual([]);
	});

	test('a sibling (non-target) block change is still reported, body or opening line', () => {
		const twin = nl('```ds-x', 'a: 1', '```', '', '```ds-x', 'a: 1', '```');
		const body = nl('```ds-x', 'a: 1', '```', '', '```ds-x', 'a: 2', '```');
		expect(integrityProblems('n.md', body, twin, T0)).toEqual([expect.stringContaining('fence #1 (ds-x) changed but is not a block this test declared')]);
		const open = nl('```ds-x', 'a: 1', '```', '', '```ds-x extra', 'a: 1', '```');
		expect(integrityProblems('n.md', open, twin, T0).length).toBeGreaterThan(0);
		// declaring the second block as the target moves the verdict: now only the FIRST would be a problem
		expect(integrityProblems('n.md', body, twin, new Set([1]))).toEqual([]);
	});

	test('text outside the blocks, the fence count and an unterminated fence are reported', () => {
		expect(integrityProblems('n.md', nl('intro!', '```ds-counter extra', 'current_value: 1', '```', 'outro'), fixture, T0)).toEqual([expect.stringContaining('outside the block bodies')]);
		expect(integrityProblems('n.md', nl('intro', 'outro'), fixture, T0)).toEqual(expect.arrayContaining([expect.stringContaining('fence count 1 -> 0')]));
		expect(integrityProblems('n.md', nl('intro', '```ds-counter extra', 'current_value: 1', 'outro'), fixture, T0)).toEqual(expect.arrayContaining([expect.stringContaining('left unterminated')]));
	});

	test('exempt mode relaxes the fences to "same count" (prefix + type only), outside text still exact', () => {
		const now = nl('intro', '```ds-counter', 'whatever: 1', '````', 'outro');
		expect(integrityProblems('n.md', now, fixture, new Set(), true)).toEqual([]);
		expect(integrityProblems('n.md', nl('intro', '```ds-counter', 'x: 1', '```', 'outro', 'more'), fixture, new Set(), true)).not.toEqual([]);
		expect(integrityProblems('n.md', nl('intro', '```ds-counter', 'x: 1', '```', 'outro', '```ds-counter', '```'), fixture, new Set(), true)).toEqual([expect.stringContaining('fence count 1 -> 2'), expect.stringContaining('outside the block bodies')]);
	});
});

describe('e2e integrity: quote-prefixed fences (SC-455) and CRLF notes (SC-453) keep working', () => {
	test('a fence in a callout and in a nested callout: body write fine, opening-line rewrite reported', () => {
		const fixture = nl('> [!note] T', '> ```ds-counter  extra', '> current_value: 1', '> ```', '', '> > ```ds-x', '> > a: 1', '> > ```');
		expect(skeletonOf(fixture)).toMatchObject({ fences: 2, unterminated: false });
		expect(skeletonOf(fixture).text).toContain('> [!note] T');
		const bodyOnly = fixture.replace('current_value: 1', 'current_value: 2').replace('> > a: 1', '> > a: 2');
		expect(integrityProblems('n.md', bodyOnly, fixture, new Set([0, 1]))).toEqual([]);
		const dropped = fixture.replace('> ```ds-counter  extra', '> ```ds-counter');
		expect(integrityProblems('n.md', dropped, fixture, new Set([0, 1])).length).toBeGreaterThan(0);
		expect(scanFences(fixture).map((f) => f.body)).toEqual([['current_value: 1'], ['a: 1']]);
	});

	// SC-456 R1: a quoted fence ends where its blockquote ends - it never closed there (product + CommonMark).
	test('a quoted fence ends when its quote ends: a later quoted ``` does not close it', () => {
		const note = nl('> ```ds-x', '> a: 1', '', '> ```');
		expect(scanFences(note).map((f) => [f.start, f.end, f.closed])).toEqual([
			[0, 1, false],
			[3, 3, false], // the trailing `> ```, now outside the first fence, opens one of its own
		]);
		expect(skeletonOf(note).unterminated).toBe(true);
		expect(integrityProblems('n.md', note, note, T0)).toEqual([expect.stringContaining('left unterminated')]);
	});

	test('an unclosed callout fence does not swallow the real block after it: the target is the real block (the false negative)', () => {
		const fixture = nl('> [!note]', '> ```ds-x', '> a: 1', '', 'between', '', '```ds-x', 'b: 1', '```', '', '> [!note]', '> ```');
		expect(scanFences(fixture).map((f) => [f.lang, f.start, f.end, f.closed])).toEqual([
			['ds-x', 1, 2, false],
			['ds-x', 6, 8, true],
			['', 11, 11, false],
		]);
		// dse.block('ds-x', 1) would target the real block; corrupting its OPENING line must be reported
		const corrupt = fixture.replace('```ds-x\nb: 1', '```ds-x BROKEN\nb: 2');
		expect(integrityProblems('n.md', corrupt, fixture, new Set([1])).some((p) => p.includes('fence #1 (ds-x) opening line changed'))).toBe(true);
		expect(integrityProblems('n.md', fixture.replace('b: 1', 'b: 2'), fixture, new Set([1])).filter((p) => !p.includes('left unterminated'))).toEqual([]);
	});

	test('CRLF: lines keep their \\r, comparison is byte-exact, a stray CR in the opening line is caught', () => {
		const fixture = 'intro\r\n```ds-counter extra\r\ncurrent_value: 1\r\n```\r\noutro\r\n';
		const f = scanFences(fixture)[0];
		expect(f).toMatchObject({ lang: 'ds-counter', openLine: '```ds-counter extra\r', closeLine: '```\r', closed: true });
		expect(f.body).toEqual(['current_value: 1\r']);
		expect(integrityProblems('n.md', fixture.replace('1\r', '2\r'), fixture, T0)).toEqual([]);
		// LF-ified fence lines (a CRLF note rewritten with bare \n on the block's fence lines)
		const lf = fixture.replace('extra\r\n', 'extra\n').replace('```\r\noutro', '```\noutro');
		const problems = integrityProblems('n.md', lf, fixture, T0);
		expect(problems.some((p) => p.includes('opening line changed'))).toBe(true);
		expect(problems.some((p) => p.includes('closing line changed'))).toBe(true);
		expect(problems.some((p) => p.includes('outside the block bodies'))).toBe(true); // via the placeholder, not the text between the blocks
	});
});

describe('e2e integrity: agreement with the product parser (SC-456 O1)', () => {
	const lines = [
		'```ds-x', '```ds-x extra', '``` ds-x', '```ds-x ', '```ds-x\u00a0', '```ds-x\u3000', '``` ds-x\u00a0', '``` ds-x\u3000', '```ds-x\f', '```ds-x\v', '```\tds-x\t', '``` \tds-x  ', '```ds-x \u00a0', '```ds-x\u00a0 extra', '```\u00a0ds-x', '```\u3000ds-x', '```\fds-x', '```\vds-x', '``` \u00a0ds-x', '```\tds-x', '```   ds-x   extra  ', '~~~ds-x', '~~~ ds-x k=v', '````ds-x', '```', '~~~', '````', '`````  ',
		'> ```ds-x', '> > ```ds-x extra', '>```ds-x', '> ``` ds-x', '> ~~~', '>   ```ds-x', '    ```ds-x', '  ```ds-x', '``', '~~', '``ds-x', 'text', '', '```ds-x\r', '``` ds-x extra\r', '```\r', '> ```\r',
	];

	test('open-line recognition: the e2e scanner opens a fence exactly where matchFenceMarker does, with the same prefix / run / info string', () => {
		for (const line of lines) {
			const note = `${line}\nbody`; // unclosed is fine: only the opening line is under test here
			const m = matchFenceMarker(line);
			const f = scanFences(note)[0];
			if (!m) {
				expect([line, f]).toEqual([line, undefined]);
				continue;
			}
			expect(f.openLine).toBe(line);
			expect(f.lang).toBe(fenceAlias(matchFenceLine(line)!.rest));
			const open = parseOpenFenceLine(line)!;
			expect([open.prefix, open.fence]).toEqual([m.prefix, m.marker]);
			// the product's `language` and the e2e scanner's type are one definition (SC-457), a space-before-language fence included
			expect(f.lang).toBe(open.language);
		}
	});

	test('close-line recognition: the e2e scanner closes a fence exactly where anchor.isFenceClose does', () => {
		for (const open of ['```ds-x', '~~~ds-x', '````ds-x', '> ```ds-x', '> > ~~~ds-x extra', '>```ds-x']) {
			const om = matchFenceLine(open)!;
			const o = { fenceChar: om.marker[0], fenceLen: om.marker.length, prefix: om.prefix };
			for (const close of [...lines, '> > ```', '> > ~~~', '>~~~', '> ````', '~~~~~']) {
				// the body line stays inside the opener's quote, so only the close line decides
				const f = scanFences(`${open}\n${o.prefix}body\n${close}`)[0];
				expect([open, close, f.closed]).toEqual([open, close, isFenceClose(o, close)]);
			}
		}
	});
});

describe('e2e integrity: the scan agrees with the product scanner `listFences` on which ds-x blocks are closed, and where', () => {
	const notes: Record<string, string> = {
		plain: nl('a', '```ds-x', 'k: 1', '```', 'b'),
		tilde: nl('~~~ds-x', 'k: 1', '~~~'),
		fourBacktick: nl('````ds-x', '```', 'k: 1', '```', '````', 'tail'),
		infoString: nl('```ds-x  extra words', 'k: 1', '```'),
		spaceBeforeType: nl('``` ds-x', 'k: 1', '```'),
		callout: nl('> [!note] T', '> ```ds-x', '> k: 1', '> ```', 'after'),
		nested: nl('> > ```ds-x extra', '> > k: 1', '> > ```'),
		twoBlocks: nl('```ds-x', 'a: 1', '```', '', '> ```ds-x', '> a: 1', '> ```'),
		quoteEndsBeforeCloser: nl('> ```ds-x', '> a: 1', '', '> ```'),
		quoteEndsThenRealBlock: nl('> [!note]', '> ```ds-x', '> a: 1', '', 'between', '', '```ds-x', 'b: 1', '```', '', '> [!note]', '> ```'),
		reviewerCase1: nl('> > ```ds-x', '```ds-x extra', '```', '> ~~~', '', '> > ```'),
		unquotedCloserInsideQuote: nl('> ```ds-x', '> a: 1', '```', '> ```'),
		mdExample: nl('```md', '```ds-x', 'a: 1', '```', '````ds-x', 'b: 1', '````'),
		unterminatedAtEof: nl('intro', '```ds-x', 'a: 1'),
		crlf: 'intro\r\n```ds-x extra\r\na: 1\r\n```\r\nafter\r\n',
	};

	test.each(Object.entries(notes))('%s', (_name, note) => {
		const helper = scanFences(note)
			.filter((f) => f.lang === 'ds-x' && f.closed)
			.map((f) => [f.start, f.end]);
		const product = listFences(note, 'ds-x').map((b) => [b.lineStart, b.lineEnd]);
		expect(helper).toEqual(product);
	});
});
