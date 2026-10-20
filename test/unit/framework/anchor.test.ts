// D8 Task 2 review fix round 1 (finding #4, CRITICAL) — anchor.ts's fence scanner. Pure
// string logic, no Obsidian/DOM needed. Covers the reviewer's two live reproductions
// against the shipped (pre-fix) code:
//   1. A `_dse_anchor`-lookalike nested inside an EARLIER, unrelated fence must NOT be
//      matched — the outer fence has to be treated as one opaque region, not re-tested
//      line-by-line for the target alias.
//   2. An earlier fence that never finds a valid close before EOF must NOT blind the
//      scanner to a real, well-formed block later in the note.
import { parse as parseYamlPkg } from 'yaml';
import { parseYaml, stringifyYaml } from '../../mocks/obsidian';
import {
	ANCHOR_KEY,
	ensureAnchor,
	fenceAlias,
	findAnchoredBlock,
	findFenceAtLine,
	findFenceByBody,
	findFirstFence,
	findGeneratedBlock,
	listFences,
	readAnchor,
	readGeneratedFrom,
} from '@/framework/sidebar/anchor';

describe('D8 Task 2 review fix — anchor.ts fence scanner (finding #4, CRITICAL)', () => {
	test('a `_dse_anchor`-lookalike inside an earlier, unrelated (but properly closed) fence is NOT matched', () => {
		// The outer documentation fence uses 4 backticks (standard "fence an example fence"
		// convention — CommonMark fences don't nest, so a longer outer marker is required
		// for the inner 3-backtick example's own close not to prematurely end the outer
		// fence). Reproduces the reviewer's scenario: a GM's "how this block works" note
		// containing a fake, unanchored-in-spirit `ds-counter` example.
		const note = [
			'````md',
			"Here's how you write a counter block:",
			'```ds-counter',
			'current_value: 99',
			'_dse_anchor: fake',
			'```',
			'(end of example)',
			'````',
			'',
			'```ds-counter',
			'current_value: 1',
			'_dse_anchor: abc123',
			'```',
		].join('\n');

		// The FIRST ds-counter-looking fence in the note is the fake one nested inside the
		// outer ```md example fence — it must never be surfaced as a real block.
		const first = findFirstFence(note, 'ds-counter');
		expect(first).not.toBeNull();
		expect(first!.lineStart).toBe(9); // the REAL block, not the nested fake at line 2
		expect(first!.lineEnd).toBe(12);

		// And explicitly: looking up the fake id must fail (it was never a real fence).
		expect(findAnchoredBlock(note, 'ds-counter', 'fake')).toBeNull();
		// The real anchor is still reachable.
		expect(findAnchoredBlock(note, 'ds-counter', 'abc123')).toEqual({
			language: 'ds-counter',
			lineStart: 9,
			lineEnd: 12,
		});
		// Only ONE real ds-counter fence exists in this note.
		expect(listFences(note, 'ds-counter')).toHaveLength(1);
	});

	test('an earlier fence that never closes before EOF does not hide a real, well-formed block after it', () => {
		const note = [
			'~~~ds-counter',
			'some prior malformed thing without a closing ~~~ anywhere in the rest of the file',
			'',
			'```ds-counter',
			'current_value: 1',
			'_dse_anchor: abc123',
			'```',
		].join('\n');

		const first = findFirstFence(note, 'ds-counter');
		expect(first).toEqual({ language: 'ds-counter', lineStart: 3, lineEnd: 6 });
		expect(findAnchoredBlock(note, 'ds-counter', 'abc123')).toEqual({
			language: 'ds-counter',
			lineStart: 3,
			lineEnd: 6,
		});
	});

	test('nested fence-open lookalikes of a DIFFERENT alias are also opaque (not just same-alias ones)', () => {
		const note = ['```txt', '```ds-initiative', 'current_round: 1', '```', 'more text', '```'].join('\n');
		// The whole thing is one `txt` fence — no ds-initiative block exists at all.
		expect(findFirstFence(note, 'ds-initiative')).toBeNull();
		expect(listFences(note, 'txt')).toHaveLength(1);
	});

	test('findFenceAtLine returns the fence containing the given line, for disambiguating multiple same-alias blocks', () => {
		const note = [
			'```ds-counter', // 0
			'current_value: 1', // 1
			'_dse_anchor: first', // 2
			'```', // 3
			'', // 4
			'```ds-counter', // 5
			'current_value: 2', // 6
			'_dse_anchor: second', // 7
			'```', // 8
		].join('\n');

		expect(listFences(note, 'ds-counter')).toHaveLength(2);
		expect(findFenceAtLine(note, 'ds-counter', 1)).toEqual({ language: 'ds-counter', lineStart: 0, lineEnd: 3 });
		expect(findFenceAtLine(note, 'ds-counter', 6)).toEqual({ language: 'ds-counter', lineStart: 5, lineEnd: 8 });
		expect(findFenceAtLine(note, 'ds-counter', 4)).toBeNull(); // blank line between blocks
	});

	test('ensureAnchor/readAnchor round-trip (unaffected by the scanner change)', () => {
		const { body, id } = ensureAnchor('current_value: 1');
		expect(readAnchor(body)).toBe(id);
		expect(ensureAnchor(body)).toEqual({ body, id }); // idempotent once anchored
	});

	// SC-360 — a freshly minted id must survive the YAML round trip every sidebar write does
	// (parseYaml -> model -> stringifyYaml) as the SAME string. A random hex id that happened to
	// read as a YAML number (`056948`, `092e50`, `4e8540`, `000000`) was re-emitted as
	// `56948` / `9.2e+51` / `.inf` / `0`, so `findAnchoredBlock(id)` lost the block right after
	// the panel's first write (~3% of ids). Deterministic sweep (stubbed Math.random), not sampling.
	describe('SC-360: a minted anchor id is always a plain YAML string', () => {
		afterEach(() => jest.restoreAllMocks());

		/** Math.random() values to mint ids from: the whole [0,1) edge set, every 6-hex-digit
		 *  fraction built from digit / 'e' / 'f' / '0' nibbles (the shapes YAML mis-reads as
		 *  numbers, inf or exponents), and a fine grid over the unit interval. */
		function sweepValues(): number[] {
			const out = [0, 0.5, 1 - 2 ** -53];
			const nibbles = [0, 1, 9, 14, 15, 10]; // 0 1 9 e f a
			const total = 16 ** 6;
			const walk = (depth: number, acc: number) => {
				if (depth === 6) {
					out.push(acc / total);
					return;
				}
				for (const n of nibbles) walk(depth + 1, acc * 16 + n);
			};
			walk(0, 0);
			for (let k = 0; k < 4096; k++) out.push((k + 0.5) / 4096);
			return out;
		}

		test('every id from the generator round-trips parseYaml/stringifyYaml unchanged, as a string, in YAML 1.2 and 1.1', () => {
			const seen = new Set<string>();
			const random = jest.spyOn(Math, 'random');
			for (const r of sweepValues()) {
				random.mockReturnValue(r);
				const { body, id } = ensureAnchor('current_value: 1');
				seen.add(id as string);

				expect(id).toMatch(/^[A-Za-z0-9_-]{6}$/); // same shape the matchers accept
				const model = parseYaml(body);
				expect(typeof model[ANCHOR_KEY]).toBe('string');
				expect(model[ANCHOR_KEY]).toBe(id);
				expect(readAnchor(stringifyYaml(model))).toBe(id);
				// Obsidian ships YAML 1.2 core; 1.1 adds octal/binary/sexagesimal/yes-no booleans,
				// so also prove the id is a string there.
				expect(parseYamlPkg(body, { version: '1.1' })[ANCHOR_KEY]).toBe(id);
			}
			expect(seen.size).toBeGreaterThan(1000); // the sweep really produced varied ids
		});
	});

	// SC-360 (r1b ruling) - a note whose anchor was ALREADY rewritten by the old generator's ids
	// (`056948` -> `56948`, `4e8540` -> `.inf`, ...) must be re-pinnable: the reader has to see
	// the rewritten scalar as the anchor, so `ensureAnchor` reuses it. Before, `.inf` / `9.2e+51`
	// read as "no anchor", `ensureAnchor` appended a second `_dse_anchor:` line, and the block
	// died with "Map keys must be unique".
	describe('SC-360: readers accept any YAML scalar token a rewritten id can become', () => {
		const REWRITTEN = ['9.2e+51', '.inf', '4e+207', '56948', '0', '-.inf', '.nan', '1e-7'];

		test.each(REWRITTEN)('readAnchor reads the rewritten id %s, and ensureAnchor reuses it (one line, body untouched)', (id) => {
			const body = `current_value: 1\n${ANCHOR_KEY}: ${id}`;
			expect(readAnchor(body)).toBe(id);
			expect(ensureAnchor(body)).toEqual({ body, id });
			expect(body.match(/_dse_anchor:/g)).toHaveLength(1);
		});

		test.each(REWRITTEN)('readGeneratedFrom / findGeneratedBlock read the rewritten _dse_from %s', (id) => {
			const body = `_dse_from: ${id}\nround: 1`;
			expect(readGeneratedFrom(body)).toBe(id);
			const note = ['```ds-initiative', body, '```'].join('\n');
			expect(findGeneratedBlock(note, 'ds-initiative', id)).toEqual({ language: 'ds-initiative', lineStart: 0, lineEnd: 3 });
		});

		test('quoted ids and the new letter-led ids still read correctly', () => {
			expect(readAnchor(`${ANCHOR_KEY}: "056948"`)).toBe('056948');
			expect(readAnchor(`${ANCHOR_KEY}: '056948'`)).toBe('056948');
			expect(readAnchor(`${ANCHOR_KEY}: abc123`)).toBe('abc123');
			expect(readAnchor(`${ANCHOR_KEY}: d0e5f9\r\nother: 1`)).toBe('d0e5f9');
			expect(readGeneratedFrom('_dse_from: "056948"')).toBe('056948');
			expect(readGeneratedFrom('_dse_from: f12345')).toBe('f12345');
		});

		// SC-453 - CRLF notes. `sendToSidebar` hands `ensureAnchor` a body split on `\n` only, so each line
		// still ends in `\r`; `iterateFences` (the lookup side) is LF-joined. Both must read the scalar.
		test.each(REWRITTEN)('CRLF: rewritten id %s is read from a CRLF body, reused untouched, and found in a CRLF note', (id) => {
			const body = ['current_value: 1', `${ANCHOR_KEY}: ${id}`, 'label: Foo'].join('\r\n');
			expect(readAnchor(body)).toBe(id);
			expect(readAnchor(`${body}\r\n`)).toBe(id);
			expect(ensureAnchor(body)).toEqual({ body, id }); // reused, no second line, no EOL mixing
			const note = ['# Note', '```ds-counter', body, '```', 'after'].join('\r\n');
			expect(findAnchoredBlock(note, 'ds-counter', id)).toEqual({ language: 'ds-counter', lineStart: 1, lineEnd: 5 });
			const quoted = ['```ds-counter', `${ANCHOR_KEY}: "${id}"`, '```'].join('\r\n');
			expect(findAnchoredBlock(quoted, 'ds-counter', id)).toEqual({ language: 'ds-counter', lineStart: 0, lineEnd: 2 });
			expect(readGeneratedFrom(`_dse_from: ${id}\r\nround: 1`)).toBe(id);
		});

		// SC-360 (r2 review LOW-1) - YAML sees a `_dse_anchor` key that the line reader cannot. Appending a
		// second one makes the block die with "Map keys must be unique". Next-line values were read by the
		// base reader; they must stay readable. Every other form is REFUSED (id null, body untouched):
		// the key is there, the lookups could never find a value they cannot read, and appending would
		// duplicate it. Safest non-duplicating choice - the caller tells the user to fix the line.
		test.each([
			['next indented line', `${ANCHOR_KEY}:\n  abc123`, 'abc123'],
			['next indented line, CRLF', `${ANCHOR_KEY}:\r\n  abc123\r\nother: 1`, 'abc123'],
			['next indented line, quoted', `${ANCHOR_KEY}:\n  "056948"`, '056948'],
		])('hand-typed value on the %s is still read and reused (no second key)', (_name, anchorLines, id) => {
			const body = `current_value: 1\n${anchorLines}`;
			expect(readAnchor(body)).toBe(id);
			expect(ensureAnchor(body)).toEqual({ body, id });
		});

		test.each([
			['an inline comment', `${ANCHOR_KEY}: abc123 # c`],
			['a tag', `${ANCHOR_KEY}: !!str 056948`],
			['a YAML anchor', `${ANCHOR_KEY}: &a abc123`],
			['~', `${ANCHOR_KEY}: ~`],
			['an empty value', `${ANCHOR_KEY}:`],
			['an empty string', `${ANCHOR_KEY}: ""`],
			['a folded scalar', `${ANCHOR_KEY}: >\n  abc123`],
			['a space before the colon', `${ANCHOR_KEY} : abc123`],
			['a quoted key', `"${ANCHOR_KEY}": abc123`],
		])('a key YAML sees but the reader cannot (%s): ensureAnchor refuses - id null, body untouched, no second key', (_name, anchorLines) => {
			const body = `current_value: 1\n${anchorLines}`;
			expect(readAnchor(body)).toBeNull();
			expect(ensureAnchor(body)).toEqual({ body, id: null });
		});

		// r4 re-review MEDIUM-A: a YAML error alone must not stop a pin (it pinned before r3 and the panel just
		// shows the block's own error card); only a body that MENTIONS the key is refused, because a key may be
		// hiding in what we cannot parse.
		test('a body with a YAML error but no `_dse_anchor` is still stamped, as before', () => {
			const body = 'current_value: 1\ncurrent_value: 2'; // duplicate key = parse error
			expect(() => parseYamlPkg(body)).toThrow();
			const { body: stamped, id } = ensureAnchor(body);
			expect(id).toMatch(/^[a-df][0-9a-f]{5}$/);
			expect(stamped).toBe(`${body}\n${ANCHOR_KEY}: ${id}`);
		});

		test('a body with a YAML error that mentions `_dse_anchor` is refused (id null, body untouched)', () => {
			const body = `current_value: 1\ncurrent_value: 2\n${ANCHOR_KEY}: abc123 # c`;
			expect(() => parseYamlPkg(body)).toThrow();
			expect(ensureAnchor(body)).toEqual({ body, id: null });
		});

		test('control: parseable YAML without the key is still stamped', () => {
			const { body, id } = ensureAnchor('current_value: 1');
			expect(id).toMatch(/^[a-df][0-9a-f]{5}$/);
			expect(body).toBe(`current_value: 1\n${ANCHOR_KEY}: ${id}`);
		});

		test('the widened match does not swallow trailing content or a comment on the line', () => {
			expect(readAnchor(`${ANCHOR_KEY}: 9.2e+51 extra words`)).toBeNull();
			expect(readAnchor(`${ANCHOR_KEY}: abc123 # note`)).toBeNull();
			expect(readAnchor(`${ANCHOR_KEY}: .inf, other`)).toBeNull();
			expect(readAnchor(`${ANCHOR_KEY}: [a, b]`)).toBeNull();
			expect(readGeneratedFrom('_dse_from: 9.2e+51 extra')).toBeNull();
			expect(readGeneratedFrom('_dse_from: abc123 # note')).toBeNull();
		});

		test('the widened match never takes a value from a different key', () => {
			expect(readAnchor('other: .inf')).toBeNull();
			expect(readAnchor(`x${ANCHOR_KEY}: .inf`)).toBeNull();
			expect(readAnchor(`${ANCHOR_KEY}_old: .inf`)).toBeNull();
			expect(readAnchor('  _dse_anchor: .inf')).toBeNull(); // indented = nested under another key
			expect(readAnchor('_dse_from: .inf')).toBeNull(); // the provenance key is not the identity key
			expect(readGeneratedFrom(`${ANCHOR_KEY}: .inf`)).toBeNull();
			expect(readAnchor(`${ANCHOR_KEY}:\nnext_key: .inf`)).toBeNull(); // empty value must not reach the next line
		});
	});

	test('FOLLOWUPS #28 LOW: a CRLF-authored body stays all-CRLF after stamping — the appended anchor line does not mix EOLs', () => {
		const crlfBody = ['current_value: 1', 'label: Foo'].join('\r\n');
		const { body, id } = ensureAnchor(crlfBody);

		expect(readAnchor(body)).toBe(id);
		// The whole stamped body — including the joiner in front of the fresh anchor line —
		// uses the source's own dominant CRLF EOL, not a bare `\n`.
		expect(body).toBe(`${crlfBody}\r\n${ANCHOR_KEY}: ${id}`);
		expect(body.split('\r\n').some((line) => line.includes('\n'))).toBe(false);
	});

	test('ensureAnchor is idempotent on an already-anchored CRLF body (no re-mixing on a second stamp)', () => {
		const crlfBody = ['current_value: 1', 'label: Foo'].join('\r\n');
		const first = ensureAnchor(crlfBody);
		const second = ensureAnchor(first.body);
		expect(second).toEqual(first);
	});

	// SC-184 fix round (MEDIUM-2b) — a fence's alias is its info string's FIRST
	// whitespace-delimited token, matching Obsidian's own `language-<x>` class derivation
	// (mdast-to-hast's `lang.match(/^[^ \t]+(?=[ \t]|$)/)`) and ReadingModeBlockHost's
	// OPEN_FENCE. Before `fenceAlias` existed, `iterateFences` matched against the FULL
	// trimmed rest of the fence-open line, so a fence carrying extra info-string content
	// past the language token was invisible to `listFences`/`findAnchoredBlock` when queried
	// with the bare language token — exactly what the chrome "Pin to sidebar" item passes.
	describe('MEDIUM-2b: alias is the first info-string token, not the whole trimmed rest', () => {
		test('fenceAlias extracts the first token; a bare language and an empty rest are unaffected', () => {
			expect(fenceAlias('ds-counter extra')).toBe('ds-counter');
			expect(fenceAlias('ds-counter')).toBe('ds-counter');
			expect(fenceAlias('')).toBe('');
			expect(fenceAlias('ds-counter   trailing   words')).toBe('ds-counter');
		});

		test('an info-string fence is found by its bare language token', () => {
			const note = ['```ds-counter extra', 'current_value: 1', '_dse_anchor: abc123', '```'].join('\n');

			expect(listFences(note, 'ds-counter')).toHaveLength(1);
			expect(findFirstFence(note, 'ds-counter')).toEqual({ language: 'ds-counter', lineStart: 0, lineEnd: 3 });
			expect(findAnchoredBlock(note, 'ds-counter', 'abc123')).toEqual({
				language: 'ds-counter',
				lineStart: 0,
				lineEnd: 3,
			});
			// Querying with the FULL info string (the pre-fix identity) no longer matches
			// anything — "ds-counter extra" is not a registered element alias either way.
			expect(listFences(note, 'ds-counter extra')).toHaveLength(0);
		});

		test('an info-string fence and a bare-alias fence of the same language are the SAME alias, not two', () => {
			const note = [
				'```ds-counter extra', // 0
				'current_value: 1', // 1
				'```', // 2
				'', // 3
				'```ds-counter', // 4
				'current_value: 2', // 5
				'```', // 6
			].join('\n');

			expect(listFences(note, 'ds-counter')).toHaveLength(2);
		});
	});
});

// SC-453 — a CRLF note's fence lines used to fail FENCE_LINE (`.` never matches `\r`), so
// listFences saw zero fences and every sidebar lookup missed. The scanner now treats `\r\n` as
// the line terminator (and only that: a lone `\r` stays inside its line), with line indices
// identical to the LF twin's so every caller that splits the same content on `\n` stays aligned.
describe('SC-453: anchor.ts scans a CRLF note exactly like its LF twin', () => {
	const LF = [
		'# Notes', // 0
		'', // 1
		'```ds-counter', // 2
		'current_value: 1', // 3
		'_dse_anchor: aaa111', // 4
		'```', // 5
		'', // 6
		'```ds-counter extra', // 7
		'current_value: 2', // 8
		'_dse_anchor: bbb222', // 9
		'_dse_from: gen777', // 10
		'```', // 11
		'tail', // 12
	].join('\n');
	const CRLF = LF.replace(/\n/g, '\r\n');

	test('listFences / findAnchoredBlock / findFenceAtLine / findGeneratedBlock return the LF twin\'s positions', () => {
		expect(listFences(CRLF, 'ds-counter')).toEqual(listFences(LF, 'ds-counter'));
		expect(listFences(CRLF, 'ds-counter')).toHaveLength(2);
		expect(findAnchoredBlock(CRLF, 'ds-counter', 'aaa111')).toEqual({ language: 'ds-counter', lineStart: 2, lineEnd: 5 });
		expect(findAnchoredBlock(CRLF, 'ds-counter', 'bbb222')).toEqual({ language: 'ds-counter', lineStart: 7, lineEnd: 11 });
		expect(findFenceAtLine(CRLF, 'ds-counter', 9)).toEqual({ language: 'ds-counter', lineStart: 7, lineEnd: 11 });
		expect(findGeneratedBlock(CRLF, 'ds-counter', 'gen777')).toEqual({ language: 'ds-counter', lineStart: 7, lineEnd: 11 });
	});

	test('two same-kind blocks do not cross-talk: each anchor resolves to its own fence only', () => {
		expect(findAnchoredBlock(CRLF, 'ds-counter', 'aaa111')?.lineStart).toBe(2);
		expect(findAnchoredBlock(CRLF, 'ds-counter', 'bbb222')?.lineStart).toBe(7);
		expect(findAnchoredBlock(CRLF, 'ds-counter', 'zzz999')).toBeNull();
	});

	test('findFenceByBody matches a CRLF block against an LF body and a CRLF body alike', () => {
		const body = 'current_value: 1\n_dse_anchor: aaa111';
		expect(findFenceByBody(CRLF, 'ds-counter', body)).toEqual({ language: 'ds-counter', lineStart: 2, lineEnd: 5 });
		expect(findFenceByBody(CRLF, 'ds-counter', body.replace(/\n/g, '\r\n'))).toEqual({
			language: 'ds-counter',
			lineStart: 2,
			lineEnd: 5,
		});
	});

	test('a mixed-ending note still finds every block (LF and CRLF fence lines both parse)', () => {
		const mixed = '```ds-counter\r\n_dse_anchor: aaa111\r\n```\n\n```ds-counter\n_dse_anchor: bbb222\r\n```\r\n';
		expect(findAnchoredBlock(mixed, 'ds-counter', 'aaa111')).toEqual({ language: 'ds-counter', lineStart: 0, lineEnd: 2 });
		expect(findAnchoredBlock(mixed, 'ds-counter', 'bbb222')).toEqual({ language: 'ds-counter', lineStart: 4, lineEnd: 6 });
	});

	test('a CRLF note whose last line (the close fence) has no trailing newline still closes the fence', () => {
		const note = '```ds-counter\r\n_dse_anchor: aaa111\r\n```';
		expect(findAnchoredBlock(note, 'ds-counter', 'aaa111')).toEqual({ language: 'ds-counter', lineStart: 0, lineEnd: 2 });
	});
});

// SC-455 — the scanner sees blocks inside a blockquote / callout: `> `-prefixed fence lines open and
// close a block, the body comes back prefix-free, and nothing about an un-nested note changes.
describe('SC-455: anchor.ts fence scanner on blockquote / callout prefixes', () => {
	const callout = [
		'# Notes', // 0
		'', // 1
		'> [!note] Title', // 2
		'> text above', // 3
		'> ```ds-counter', // 4
		'> current_value: 1', // 5
		'> _dse_anchor: abc123', // 6
		'> ```', // 7
		'> text below', // 8
		'', // 9
		'tail', // 10
	].join('\n');

	test('listFences finds a fence inside a callout, with the fence lines (not the callout range)', () => {
		expect(listFences(callout, 'ds-counter')).toEqual([{ language: 'ds-counter', lineStart: 4, lineEnd: 7 }]);
	});

	test('findAnchoredBlock / findFenceAtLine / findFenceByBody / findGeneratedBlock all see through the prefix', () => {
		expect(findAnchoredBlock(callout, 'ds-counter', 'abc123')).toEqual({ language: 'ds-counter', lineStart: 4, lineEnd: 7 });
		expect(findFenceAtLine(callout, 'ds-counter', 5)).toEqual({ language: 'ds-counter', lineStart: 4, lineEnd: 7 });
		expect(findFenceAtLine(callout, 'ds-counter', 3)).toBeNull();
		expect(findFenceByBody(callout, 'ds-counter', 'current_value: 1\n_dse_anchor: abc123')).toEqual({ language: 'ds-counter', lineStart: 4, lineEnd: 7 });
		const generated = ['> ```ds-initiative', '> _dse_from: gen42', '> heroes: []', '> ```'].join('\n');
		expect(findGeneratedBlock(generated, 'ds-initiative', 'gen42')).toEqual({ language: 'ds-initiative', lineStart: 0, lineEnd: 3 });
	});

	test('the prefix forms: plain quote, nested `> > `, `>` with no space, `>>`, CRLF', () => {
		for (const prefix of ['> ', '> > ', '>', '>>', '> >  ']) {
			const note = [`${prefix}\`\`\`ds-counter`, `${prefix}a: 1`, prefix.trimEnd(), `${prefix}b: 2`, `${prefix}\`\`\``].join('\n');
			expect(listFences(note, 'ds-counter')).toEqual([{ language: 'ds-counter', lineStart: 0, lineEnd: 4 }]);
			expect(listFences(note.replace(/\n/g, '\r\n'), 'ds-counter')).toEqual([{ language: 'ds-counter', lineStart: 0, lineEnd: 4 }]);
		}
	});

	test('a fence-marker line carrying a different quote depth or none is body content / ends the quote, never a close', () => {
		// The `> ```` inside the (col-0) 4-backtick outer fence is literal content of that region.
		const documented = ['````md', '> ```ds-counter', '> current_value: 99', '> _dse_anchor: fake', '> ```', '````', '', '```ds-counter', 'current_value: 1', '```'].join('\n');
		expect(listFences(documented, 'ds-counter')).toEqual([{ language: 'ds-counter', lineStart: 7, lineEnd: 9 }]);
		// A quoted fence whose quote ends before any close is NOT closed by an un-quoted fence further down.
		const ended = ['> ```ds-counter', '> a: 1', '', '```', 'text', '```'].join('\n');
		expect(listFences(ended, 'ds-counter')).toEqual([]);
	});

	test('a fence indented inside a list item is not recognised (unsupported shape), and an un-nested note scans exactly as before', () => {
		expect(listFences(['- item', '  ```ds-counter', '  a: 1', '  ```'].join('\n'), 'ds-counter')).toEqual([]);
		expect(listFences(['```ds-counter', 'a: 1', '```', '', '```ds-counter', 'b: 2', '```'].join('\n'), 'ds-counter')).toEqual([
			{ language: 'ds-counter', lineStart: 0, lineEnd: 2 },
			{ language: 'ds-counter', lineStart: 4, lineEnd: 6 },
		]);
	});
});
