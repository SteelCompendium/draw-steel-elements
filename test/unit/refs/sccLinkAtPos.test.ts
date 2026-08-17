// SC-135 phase 1b — pure, CM6-free coverage for the editor click extension's core logic.
// node environment (unit project): no EditorView, no DOM — exactly the "unit-testable
// without a full EditorView" ask.
import { findSccLinkAtPos, shouldFollowOnClick } from '@/refs/sccLinkAtPos';

describe('findSccLinkAtPos', () => {
	const LINE = 'If you want [speed](scc.v1:mcdm.heroes.v1/rule.character/speed) and also [a real link](https://example.com).';
	const LINE_START = 1000; // arbitrary non-zero absolute offset, proving offsets are absolute not line-relative

	test('finds an scc link when pos falls inside its span (link text)', () => {
		const textStart = LINE_START + LINE.indexOf('speed');
		const result = findSccLinkAtPos(LINE, LINE_START, textStart + 2);
		expect(result).not.toBeNull();
		expect(result!.href).toBe('scc.v1:mcdm.heroes.v1/rule.character/speed');
	});

	test('finds an scc link when pos falls inside its URL portion', () => {
		const urlStart = LINE_START + LINE.indexOf('scc.v1:');
		const result = findSccLinkAtPos(LINE, LINE_START, urlStart + 3);
		expect(result?.href).toBe('scc.v1:mcdm.heroes.v1/rule.character/speed');
	});

	test('returned offsets are absolute and span the whole [text](url)', () => {
		const bracketStart = LINE_START + LINE.indexOf('[speed]');
		const result = findSccLinkAtPos(LINE, LINE_START, bracketStart)!;
		expect(result.from).toBe(bracketStart);
		expect(LINE.slice(result.from - LINE_START, result.to - LINE_START)).toBe(
			'[speed](scc.v1:mcdm.heroes.v1/rule.character/speed)',
		);
	});

	test('pos inside a NON-scc link returns null (does not fall through to a later scc link)', () => {
		const realLinkStart = LINE_START + LINE.indexOf('[a real link]');
		expect(findSccLinkAtPos(LINE, LINE_START, realLinkStart + 3)).toBeNull();
	});

	test('pos outside any link span returns null', () => {
		const beforeAnyLink = LINE_START + 2; // "If"
		expect(findSccLinkAtPos(LINE, LINE_START, beforeAnyLink)).toBeNull();
	});

	test('pos on a line with no links at all returns null', () => {
		expect(findSccLinkAtPos('plain prose, nothing here', 0, 5)).toBeNull();
	});

	test('boundary: pos exactly at the opening [ is inside the link', () => {
		const bracketStart = LINE_START + LINE.indexOf('[speed]');
		expect(findSccLinkAtPos(LINE, LINE_START, bracketStart)?.href).toBe(
			'scc.v1:mcdm.heroes.v1/rule.character/speed',
		);
	});

	test('boundary: pos exactly at the closing ) is inside the link', () => {
		const closeParen = LINE_START + LINE.indexOf(')');
		expect(findSccLinkAtPos(LINE, LINE_START, closeParen)?.href).toBe(
			'scc.v1:mcdm.heroes.v1/rule.character/speed',
		);
	});

	test('boundary: pos is inclusive of the position immediately after the closing ) (CM6 positions sit between characters)', () => {
		const bracketStart = LINE_START + LINE.indexOf('[speed]');
		const to = findSccLinkAtPos(LINE, LINE_START, bracketStart)!.to;
		expect(findSccLinkAtPos(LINE, LINE_START, to)?.href).toBe('scc.v1:mcdm.heroes.v1/rule.character/speed');
	});

	test('boundary: pos two past the closing ) is NOT inside the link (past the boundary entirely)', () => {
		const bracketStart = LINE_START + LINE.indexOf('[speed]');
		const to = findSccLinkAtPos(LINE, LINE_START, bracketStart)!.to;
		expect(findSccLinkAtPos(LINE, LINE_START, to + 2)).toBeNull();
	});

	test('accepts the versioned scc.v2: prefix form the same way rewriteSccAnchors does (still just a prefix match here — resolution is the resolver\'s job)', () => {
		const line = '[x](scc.v2:foo/bar)';
		expect(findSccLinkAtPos(line, 0, 2)?.href).toBe('scc.v2:foo/bar');
	});

	test('multiple scc links on one line: pos resolves to the correct one', () => {
		const line = '[first](scc.v1:a/b) then [second](scc.v1:c/d)';
		const secondStart = line.indexOf('[second]');
		expect(findSccLinkAtPos(line, 0, secondStart + 2)?.href).toBe('scc.v1:c/d');
	});

	test('trims whitespace inside the parens', () => {
		const line = '[x]( scc.v1:a/b )';
		expect(findSccLinkAtPos(line, 0, 2)?.href).toBe('scc.v1:a/b');
	});
});

describe('shouldFollowOnClick (Obsidian Live Preview reveal convention)', () => {
	test('Live Preview, folded (not revealed): plain click follows', () => {
		expect(shouldFollowOnClick({ livePreview: true, lineRevealed: false, isModOrAux: false })).toBe(true);
	});

	test('Live Preview, revealed (cursor on the line): plain click does NOT follow (places cursor instead)', () => {
		expect(shouldFollowOnClick({ livePreview: true, lineRevealed: true, isModOrAux: false })).toBe(false);
	});

	test('Live Preview, revealed: mod-click DOES follow', () => {
		expect(shouldFollowOnClick({ livePreview: true, lineRevealed: true, isModOrAux: true })).toBe(true);
	});

	test('Source mode (livePreview false), plain click: does NOT follow, regardless of "revealed" (Source mode never folds)', () => {
		expect(shouldFollowOnClick({ livePreview: false, lineRevealed: false, isModOrAux: false })).toBe(false);
	});

	test('Source mode, mod-click: DOES follow', () => {
		expect(shouldFollowOnClick({ livePreview: false, lineRevealed: true, isModOrAux: true })).toBe(true);
	});

	test('Live Preview, folded: mod-click also follows (mod never blocks a follow)', () => {
		expect(shouldFollowOnClick({ livePreview: true, lineRevealed: false, isModOrAux: true })).toBe(true);
	});
});
