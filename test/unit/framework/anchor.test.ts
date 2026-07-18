// D8 Task 2 review fix round 1 (finding #4, CRITICAL) — anchor.ts's fence scanner. Pure
// string logic, no Obsidian/DOM needed. Covers the reviewer's two live reproductions
// against the shipped (pre-fix) code:
//   1. A `_dse_anchor`-lookalike nested inside an EARLIER, unrelated fence must NOT be
//      matched — the outer fence has to be treated as one opaque region, not re-tested
//      line-by-line for the target alias.
//   2. An earlier fence that never finds a valid close before EOF must NOT blind the
//      scanner to a real, well-formed block later in the note.
import {
	ANCHOR_KEY,
	ensureAnchor,
	findAnchoredBlock,
	findFenceAtLine,
	findFirstFence,
	listFences,
	readAnchor,
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
});
