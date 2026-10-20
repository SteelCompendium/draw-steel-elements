// SC-343 (spec SC-340 §6.5): durable block identity for ReadingModeBlockHost.
import {
	ReadingModeBlockHost,
	locateByBody,
	normalizeBody,
} from '../../../src/framework/host/ReadingModeBlockHost';
import { App, Notice, Plugin, makeFakeContext } from '../../mocks/obsidian';
import type { MarkdownPostProcessorContext } from '../../mocks/obsidian';
import {
	droppedWriteMessage,
	resetDroppedWriteNotices,
	unsavableWriteMessage,
} from '../../../src/framework/host/droppedWriteNotice';

/** A ctx whose getSectionInfo returns whatever `section.current` holds (null = gone). */
function switchableCtx(sourcePath: string, section: { current: { text: string; lineStart: number; lineEnd: number } | null }) {
	const ctx: MarkdownPostProcessorContext = {
		docId: 'doc-switchable',
		sourcePath,
		frontmatter: undefined,
		addChild: () => {},
		getSectionInfo: () => section.current,
	};
	return ctx;
}

const COUNTER = ['```ds-counter', 'name: A', 'current_value: 1', '```'].join('\n');

describe('SC-343: normalizeBody / locateByBody', () => {
	test('normalizeBody treats CRLF, CR and LF alike and trims trailing whitespace', () => {
		expect(normalizeBody('a: 1\r\nb: 2\r\n  \n')).toBe('a: 1\nb: 2');
		expect(normalizeBody('a: 1\rb: 2')).toBe('a: 1\nb: 2');
	});

	test('locateByBody picks the identical block NEAREST the last known line (ties to the earlier one)', () => {
		const note = ['top', COUNTER, 'mid', COUNTER, 'bottom'].join('\n');
		// fences: first at line 1 (1..4), second at line 6 (6..9)
		expect(locateByBody(note, 'ds-counter', 'name: A\ncurrent_value: 1', 7)).toEqual({ lineStart: 6, lineEnd: 9 });
		expect(locateByBody(note, 'ds-counter', 'name: A\ncurrent_value: 1', 2)).toEqual({ lineStart: 1, lineEnd: 4 });
		expect(locateByBody(note, 'ds-counter', 'name: A\ncurrent_value: 1', 3.5)).toEqual({ lineStart: 1, lineEnd: 4 });
	});

	test('locateByBody returns null when no block of that language has that body', () => {
		expect(locateByBody(COUNTER, 'ds-counter', 'name: B', 0)).toBeNull();
		expect(locateByBody(COUNTER, 'ds-stamina', 'name: A\ncurrent_value: 1', 0)).toBeNull();
	});

	test('locateByBody finds the block in a CRLF note (fence lines still parse)', () => {
		const crlf = COUNTER.replace(/\n/g, '\r\n');
		expect(locateByBody(crlf, 'ds-counter', 'name: A\ncurrent_value: 1', 0)).toEqual({ lineStart: 0, lineEnd: 3 });
	});
});

describe('SC-343: durable identity and canPersist', () => {
	test('a host whose section resolved once stays persistable after the section goes (navigate-away)', () => {
		const app = new App();
		app.vault.setFile('Note.md', COUNTER);
		const section = { current: { text: COUNTER, lineStart: 0, lineEnd: 3 } as { text: string; lineStart: number; lineEnd: number } | null };
		const host = new ReadingModeBlockHost(new Plugin(app) as any, document.createElement('div'), switchableCtx('Note.md', section) as any, 'ds-counter');
		host.setMountedBody('name: A\ncurrent_value: 1');

		section.current = null; // section replaced / note navigated away
		expect(host.canPersist).toBe(true);
		expect(host.lastKnownBody).toBe('name: A\ncurrent_value: 1');
		expect(host.lastKnownLineStart).toBe(0);
	});

	test('a host whose section NEVER resolved (hover popover / print / nested render) stays read-only even with a mount body', () => {
		const app = new App();
		app.vault.setFile('Note.md', COUNTER);
		const section = { current: null as { text: string; lineStart: number; lineEnd: number } | null };
		const host = new ReadingModeBlockHost(new Plugin(app) as any, document.createElement('div'), switchableCtx('Note.md', section) as any, 'ds-counter');
		host.setMountedBody('name: A\ncurrent_value: 1');

		expect(host.canPersist).toBe(false);
	});

	test('canvas (sourcePath "") is never persistable, whatever the identity', () => {
		const app = new App();
		const section = { current: { text: COUNTER, lineStart: 0, lineEnd: 3 } };
		const host = new ReadingModeBlockHost(new Plugin(app) as any, document.createElement('div'), switchableCtx('', section) as any, 'ds-counter');
		host.setMountedBody('name: A\ncurrent_value: 1');
		expect(host.canPersist).toBe(false);
	});

	test('a block in a callout forms a durable identity too (SC-455): still persistable once its section is gone', () => {
		const app = new App();
		const text = ['> [!note]', '> ```ds-counter', '> name: A', '> ```'].join('\n');
		app.vault.setFile('Note.md', text);
		const section = { current: { text, lineStart: 0, lineEnd: 3 } as { text: string; lineStart: number; lineEnd: number } | null };
		const host = new ReadingModeBlockHost(new Plugin(app) as any, document.createElement('div'), switchableCtx('Note.md', section) as any, 'ds-counter');
		host.setMountedBody('name: A');
		expect(host.canPersist).toBe(true);
		section.current = null;
		expect(host.canPersist).toBe(true); // the language was read from inside the callout
		expect(host.lastKnownLineStart).toBe(1); // the FENCE line, not the callout's header
	});

	test('a host whose section resolved once but setMountedBody was never called: canPersist false after the section goes', () => {
		const app = new App();
		app.vault.setFile('Note.md', COUNTER);
		const section = { current: { text: COUNTER, lineStart: 0, lineEnd: 3 } as { text: string; lineStart: number; lineEnd: number } | null };
		const host = new ReadingModeBlockHost(new Plugin(app) as any, document.createElement('div'), switchableCtx('Note.md', section) as any, 'ds-counter');
		// setMountedBody deliberately never called.
		expect(host.canPersist).toBe(true); // section resolves: unchanged from today

		section.current = null;
		expect(host.canPersist).toBe(false); // no known body -> no durable identity
	});

	test('a plain canPersist or getBlockInfo read (not just notePersistIntent) refreshes lastKnownLineStart', () => {
		const app = new App();
		app.vault.setFile('Note.md', COUNTER);
		const ctx = makeFakeContext(app, 'Note.md');
		const host = new ReadingModeBlockHost(new Plugin(app) as any, ctx.el, ctx as any, 'ds-counter');
		expect(host.lastKnownLineStart).toBe(0);

		app.vault.setFile('Note.md', ['shift 1', 'shift 2', 'shift 3', COUNTER].join('\n'));
		expect(host.canPersist).toBe(true);
		expect(host.lastKnownLineStart).toBe(3);

		app.vault.setFile('Note.md', ['shift 1', 'shift 2', 'shift 3', 'shift 4', COUNTER].join('\n'));
		expect(host.getBlockInfo()?.lineStart).toBe(4);
		expect(host.lastKnownLineStart).toBe(4);
	});

	test('notePersistIntent refreshes the last known line from the live section', () => {
		const app = new App();
		app.vault.setFile('Note.md', COUNTER);
		const ctx = makeFakeContext(app, 'Note.md');
		const host = new ReadingModeBlockHost(new Plugin(app) as any, ctx.el, ctx as any, 'ds-counter');
		expect(host.lastKnownLineStart).toBe(0);

		app.vault.setFile('Note.md', ['shift 1', 'shift 2', 'shift 3', COUNTER].join('\n'));
		host.notePersistIntent();
		expect(host.lastKnownLineStart).toBe(3);
	});
});

describe('SC-343: guarded replaceSource', () => {
	let warn: jest.SpyInstance;
	beforeEach(() => {
		resetDroppedWriteNotices();
		Notice.notices.length = 0;
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => warn.mockRestore());

	function hostFor(app: App, sourcePath: string, section: { current: { text: string; lineStart: number; lineEnd: number } | null }, body: string | null) {
		const host = new ReadingModeBlockHost(new Plugin(app) as any, document.createElement('div'), switchableCtx(sourcePath, section) as any, 'ds-counter');
		if (body !== null) host.setMountedBody(body);
		return host;
	}

	test('stale section range (a detached duplicate still reports old lines): never corrupts — relocates by body', async () => {
		const app = new App();
		// The block GREW since this host last saw it (lines 0..3); the stale range would cut it.
		const live = ['```ds-counter', 'name: A', 'current_value: 1', 'extra: yes', '```', '', 'After'].join('\n');
		app.vault.setFile('Note.md', live);
		const section = { current: { text: live, lineStart: 0, lineEnd: 3 } };
		const host = hostFor(app, 'Note.md', section, 'name: A\ncurrent_value: 1\nextra: yes');

		await expect(host.replaceSource('name: A\ncurrent_value: 2\nextra: yes')).resolves.toBe(true);
		expect(app.vault.getContent('Note.md')).toBe(
			['```ds-counter', 'name: A', 'current_value: 2', 'extra: yes', '```', '', 'After'].join('\n'),
		);
		expect(Notice.notices).toHaveLength(0);
	});

	test('stale model (body on disk is not what we last knew, block not found by body): dropped + ONE Notice, note unchanged', async () => {
		const app = new App();
		const live = ['```ds-counter', 'name: Vigor', 'current_value: 10', '```'].join('\n');
		app.vault.setFile('Folder/Session 3.md', live);
		const section = { current: { text: live, lineStart: 0, lineEnd: 3 } };
		const host = hostFor(app, 'Folder/Session 3.md', section, 'name: Health\ncurrent_value: 10');

		await expect(host.replaceSource('name: Health\ncurrent_value: 11')).resolves.toBe(false);
		expect(app.vault.getContent('Folder/Session 3.md')).toBe(live);
		expect(Notice.notices).toEqual([droppedWriteMessage('Session 3')]);
		expect(warn).toHaveBeenCalledTimes(1);
	});

	test('section gone (navigate-away flush): the write lands through the durable locate (SC-336)', async () => {
		const app = new App();
		const live = ['# N', '', '```ds-counter', 'name: A', 'current_value: 1', '```'].join('\n');
		app.vault.setFile('Note.md', live);
		const section = { current: { text: live, lineStart: 2, lineEnd: 5 } as { text: string; lineStart: number; lineEnd: number } | null };
		const host = hostFor(app, 'Note.md', section, 'name: A\ncurrent_value: 1');
		section.current = null;

		await expect(host.replaceSource('name: A\ncurrent_value: 2')).resolves.toBe(true);
		expect(app.vault.getContent('Note.md')).toContain('current_value: 2');
		expect(Notice.notices).toHaveLength(0);
	});

	test('identical twins, section gone after lines shifted: writes the twin nearest the refreshed position', async () => {
		const app = new App();
		const twin = ['```ds-counter', 'name: Twin', 'current_value: 5', '```'].join('\n');
		const before = ['TOP', twin, 'MID', twin, 'BOTTOM'].join('\n'); // lower twin at line 6
		app.vault.setFile('Note.md', before);
		const section = { current: { text: before, lineStart: 6, lineEnd: 9 } as { text: string; lineStart: number; lineEnd: number } | null };
		const host = hostFor(app, 'Note.md', section, 'name: Twin\ncurrent_value: 5');
		// 16 lines inserted above both twins; the live section follows (Obsidian E2)...
		const shifted = [...Array.from({ length: 16 }, (_, i) => `shift ${i}`), before].join('\n');
		app.vault.setFile('Note.md', shifted);
		section.current = { text: shifted, lineStart: 22, lineEnd: 25 };
		host.notePersistIntent(); // ...and persist() refreshes the durable position
		section.current = null; // then the note is navigated away before the flush

		await expect(host.replaceSource('name: Twin\ncurrent_value: 6')).resolves.toBe(true);
		const values = (app.vault.getContent('Note.md')!.match(/current_value: (\d+)/g) ?? []).map((s) => s.split(': ')[1]);
		expect(values).toEqual(['5', '6']); // the LOWER twin, never the upper one
	});

	test('CRLF note: the section path still matches the body and writes (no Notice)', async () => {
		const app = new App();
		const live = ['```ds-counter', 'name: A', 'current_value: 1', '```', ''].join('\r\n');
		app.vault.setFile('Note.md', live);
		const section = { current: { text: live, lineStart: 0, lineEnd: 3 } };
		const host = hostFor(app, 'Note.md', section, 'name: A\ncurrent_value: 1');

		await expect(host.replaceSource('name: A\ncurrent_value: 2')).resolves.toBe(true);
		expect(app.vault.getContent('Note.md')).toContain('current_value: 2');
		expect(Notice.notices).toHaveLength(0);
	});

	test('unterminated fence at the end of the note: still writes and closes the fence (unchanged from today)', async () => {
		const app = new App();
		const live = ['Before', '', '```ds-counter', 'name: A', 'current_value: 1'].join('\n');
		app.vault.setFile('Note.md', live);
		const section = { current: { text: live, lineStart: 2, lineEnd: 4 } };
		const host = hostFor(app, 'Note.md', section, 'name: A\ncurrent_value: 1');

		await expect(host.replaceSource('name: A\ncurrent_value: 2')).resolves.toBe(true);
		expect(app.vault.getContent('Note.md')).toBe(['Before', '', '```ds-counter', 'name: A', 'current_value: 2', '```'].join('\n'));
		expect(Notice.notices).toHaveLength(0);
	});

	test('unterminated fence at EOF, note ends with a trailing newline: still writes and closes the fence (no Notice)', async () => {
		const app = new App();
		const live = ['Before', '', '```ds-counter', 'name: A', 'current_value: 1'].join('\n') + '\n';
		app.vault.setFile('Note.md', live);
		const section = { current: { text: live, lineStart: 2, lineEnd: 4 } };
		const host = hostFor(app, 'Note.md', section, 'name: A\ncurrent_value: 1');

		await expect(host.replaceSource('name: A\ncurrent_value: 2')).resolves.toBe(true);
		expect(app.vault.getContent('Note.md')).toBe(
			['Before', '', '```ds-counter', 'name: A', 'current_value: 2', '```', ''].join('\n'),
		);
		expect(Notice.notices).toHaveLength(0);
	});

	test('unterminated fence at EOF, note ends with a trailing blank line: still writes and closes the fence (no Notice)', async () => {
		const app = new App();
		const live = ['Before', '', '```ds-counter', 'name: A', 'current_value: 1', '', ''].join('\n');
		app.vault.setFile('Note.md', live);
		const section = { current: { text: live, lineStart: 2, lineEnd: 4 } };
		const host = hostFor(app, 'Note.md', section, 'name: A\ncurrent_value: 1');

		await expect(host.replaceSource('name: A\ncurrent_value: 2')).resolves.toBe(true);
		expect(app.vault.getContent('Note.md')).toBe(
			['Before', '', '```ds-counter', 'name: A', 'current_value: 2', '```', '', ''].join('\n'),
		);
		expect(Notice.notices).toHaveLength(0);
	});

	test('unterminated fence at EOF, section gone (navigate-away): the write lands, fence closes, no Notice — trailing newline', async () => {
		const app = new App();
		const live = ['Before', '', '```ds-counter', 'name: A', 'current_value: 1'].join('\n') + '\n';
		app.vault.setFile('Note.md', live);
		const section = { current: { text: live, lineStart: 2, lineEnd: 4 } as { text: string; lineStart: number; lineEnd: number } | null };
		const host = hostFor(app, 'Note.md', section, 'name: A\ncurrent_value: 1');
		section.current = null; // navigate away before the flush

		await expect(host.replaceSource('name: A\ncurrent_value: 2')).resolves.toBe(true);
		expect(app.vault.getContent('Note.md')).toBe(
			['Before', '', '```ds-counter', 'name: A', 'current_value: 2', '```'].join('\n'),
		);
		expect(Notice.notices).toHaveLength(0);
	});

	test('unterminated fence at EOF, section gone (navigate-away): the write lands, fence closes, no Notice — trailing blank lines', async () => {
		const app = new App();
		const live = ['Before', '', '```ds-counter', 'name: A', 'current_value: 1'].join('\n') + '\n\n\n';
		app.vault.setFile('Note.md', live);
		const section = { current: { text: live, lineStart: 2, lineEnd: 4 } as { text: string; lineStart: number; lineEnd: number } | null };
		const host = hostFor(app, 'Note.md', section, 'name: A\ncurrent_value: 1');
		section.current = null; // navigate away before the flush

		await expect(host.replaceSource('name: A\ncurrent_value: 2')).resolves.toBe(true);
		expect(app.vault.getContent('Note.md')).toBe(
			['Before', '', '```ds-counter', 'name: A', 'current_value: 2', '```'].join('\n'),
		);
		expect(Notice.notices).toHaveLength(0);
	});

	test('close-fence hardening: a stale range running into trailing blank lines past a real close is never treated as unterminated (no data loss)', async () => {
		const app = new App();
		const live = ['```ds-counter', 'name: A', '```', 'After', '', ''].join('\n');
		app.vault.setFile('Note.md', live);
		// Stale range: reports lineEnd 4 (into the trailing blanks), but the block actually
		// closed at line 2 — "After" and the blanks are note content, not the block's body.
		const section = { current: { text: live, lineStart: 0, lineEnd: 4 } };
		const host = hostFor(app, 'Note.md', section, null); // no durable identity (knownBody null)

		await expect(host.replaceSource('name: B')).resolves.toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(live);
		// SC-455: a write that cannot land is never silent any more (the note is still untouched).
		expect(Notice.notices).toEqual([unsavableWriteMessage('Note')]);
	});

	test('overlapping writes on one host (a timer flush racing an unload flush): both land, no dropped write, no Notice', async () => {
		const app = new App();
		const live = ['```ds-counter', 'name: A', 'current_value: 1', '```'].join('\n');
		app.vault.setFile('Note.md', live);
		const section = { current: { text: live, lineStart: 0, lineEnd: 3 } };
		const host = hostFor(app, 'Note.md', section, 'name: A\ncurrent_value: 1');

		const a = host.replaceSource('name: A\ncurrent_value: 2');
		const b = host.replaceSource('name: A\ncurrent_value: 3');
		await expect(Promise.all([a, b])).resolves.toEqual([true, true]);
		expect(app.vault.getContent('Note.md')).toContain('current_value: 3');
		expect(Notice.notices).toHaveLength(0);
	});

	test('a successful write becomes the new known body (a second write finds it)', async () => {
		const app = new App();
		const live = ['```ds-counter', 'name: A', 'current_value: 1', '```'].join('\n');
		app.vault.setFile('Note.md', live);
		const section = { current: { text: live, lineStart: 0, lineEnd: 3 } as { text: string; lineStart: number; lineEnd: number } | null };
		const host = hostFor(app, 'Note.md', section, 'name: A\ncurrent_value: 1');
		await host.replaceSource('name: A\ncurrent_value: 2');
		expect(host.lastKnownBody).toBe('name: A\ncurrent_value: 2');
		section.current = null;
		await expect(host.replaceSource('name: A\ncurrent_value: 3')).resolves.toBe(true);
		expect(app.vault.getContent('Note.md')).toContain('current_value: 3');
	});
});

// SC-453 — a CRLF note: the section/durable locate already worked (SC-343's local CR strip),
// but the rewritten block was emitted with LF, leaving the note mixed-ending. Policy: all-CRLF
// stays all-CRLF after a write, all-LF is byte-identical to the pre-SC-453 output, a mixed
// note follows its dominant ending (tie: first line break) and loses nothing.
describe('SC-453: ReadingModeBlockHost.replaceSource on CRLF / mixed-ending notes', () => {
	let warn: jest.SpyInstance;
	beforeEach(() => {
		resetDroppedWriteNotices();
		Notice.notices.length = 0;
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => warn.mockRestore());

	type Section = { current: { text: string; lineStart: number; lineEnd: number } | null };
	const toCrlf = (s: string): string => s.replace(/\n/g, '\r\n');
	const CTR = (n: number, name = 'A'): string[] => ['```ds-counter', `name: ${name}`, `current_value: ${n}`, '```'];
	const bodyOf = (n: number, name = 'A'): string => `name: ${name}\ncurrent_value: ${n}`;

	function hostFor(app: App, section: Section, body: string) {
		const host = new ReadingModeBlockHost(new Plugin(app) as any, document.createElement('div'), switchableCtx('Note.md', section) as any, 'ds-counter');
		host.setMountedBody(body);
		return host;
	}

	test('a write lands in a CRLF note: the whole note is all-CRLF afterward, content above/below byte-identical', async () => {
		const app = new App();
		const live = toCrlf(['# N', '', 'above', '', ...CTR(1), '', 'below'].join('\n'));
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, { current: { text: live, lineStart: 4, lineEnd: 7 } }, bodyOf(1));

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		const out = app.vault.getContent('Note.md')!;
		expect(out).toBe(toCrlf(['# N', '', 'above', '', ...CTR(2), '', 'below'].join('\n')));
		expect(out.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
		expect(Notice.notices).toHaveLength(0);
	});

	test('an all-LF note stays byte-identical to the pre-SC-453 output', async () => {
		const app = new App();
		const live = ['# N', '', ...CTR(1), '', 'below'].join('\n');
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, { current: { text: live, lineStart: 2, lineEnd: 5 } }, bodyOf(1));

		await host.replaceSource(bodyOf(2));

		expect(app.vault.getContent('Note.md')).toBe(['# N', '', ...CTR(2), '', 'below'].join('\n'));
	});

	test('two same-kind blocks in one CRLF note: the write lands in the right one and the other is byte-identical', async () => {
		const app = new App();
		const live = toCrlf(['top', ...CTR(1, 'First'), 'mid', ...CTR(1, 'Second'), 'bottom'].join('\n'));
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, { current: { text: live, lineStart: 6, lineEnd: 9 } }, bodyOf(1, 'Second'));

		await host.replaceSource(bodyOf(2, 'Second'));

		expect(app.vault.getContent('Note.md')).toBe(toCrlf(['top', ...CTR(1, 'First'), 'mid', ...CTR(2, 'Second'), 'bottom'].join('\n')));
	});

	test('a CRLF note whose close fence is its last line with no trailing newline: no CR is invented at EOF', async () => {
		const app = new App();
		const live = toCrlf(['# N', ...CTR(1)].join('\n'));
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, { current: { text: live, lineStart: 1, lineEnd: 4 } }, bodyOf(1));

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toBe(toCrlf(['# N', ...CTR(2)].join('\n')));
	});

	test('a hand-edited CRLF note, section gone: the durable locate finds the block and the write stays all-CRLF', async () => {
		const app = new App();
		const live = toCrlf(['# N', ...CTR(1)].join('\n'));
		app.vault.setFile('Note.md', live);
		const section: Section = { current: { text: live, lineStart: 1, lineEnd: 4 } };
		const host = hostFor(app, section, bodyOf(1));
		// Hand-edit: three lines inserted above the block, CRLF kept; then the section is torn down.
		const edited = toCrlf(['x', 'y', 'z', '# N', ...CTR(1)].join('\n'));
		app.vault.setFile('Note.md', edited);
		section.current = null;

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toBe(toCrlf(['x', 'y', 'z', '# N', ...CTR(2)].join('\n')));
		expect(Notice.notices).toHaveLength(0);
	});

	test('unterminated fence at EOF in a CRLF note: written and closed, still all-CRLF', async () => {
		const app = new App();
		const live = toCrlf(['Before', '', '```ds-counter', 'name: A', 'current_value: 1'].join('\n') + '\n');
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, { current: { text: live, lineStart: 2, lineEnd: 4 } }, bodyOf(1));

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toBe(toCrlf(['Before', '', ...CTR(2), ''].join('\n')));
	});

	test('a CRLF-dominant mixed note: the block is CRLF, a stray LF line outside it is untouched, nothing is lost', async () => {
		const app = new App();
		const live = `# N\r\n${CTR(1).join('\r\n')}\r\nstray-lf\ntail\r\n`;
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, { current: { text: live, lineStart: 1, lineEnd: 4 } }, bodyOf(1));

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toBe(`# N\r\n${CTR(2).join('\r\n')}\r\nstray-lf\ntail\r\n`);
	});

	test('an LF-dominant mixed note: the block is LF, a stray CRLF line outside it is untouched, nothing is lost', async () => {
		const app = new App();
		const live = `# N\n${CTR(1).join('\n')}\nstray-crlf\r\ntail\n`;
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, { current: { text: live, lineStart: 1, lineEnd: 4 } }, bodyOf(1));

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toBe(`# N\n${CTR(2).join('\n')}\nstray-crlf\r\ntail\n`);
	});
});

// SC-455 — a block nested in a blockquote / callout. Measured in real Obsidian 1.14.4: the Reading
// view section is the WHOLE quote/callout (lineStart = its first line, e.g. the `> [!note]` header,
// not the fence), and Live Preview gives a callout NO section at all (see the LP describe below).
// The write re-emits the block's own `> ` prefix on every line it writes and touches nothing else.
describe('SC-455: ReadingModeBlockHost.replaceSource on a block inside a blockquote / callout', () => {
	let warn: jest.SpyInstance;
	beforeEach(() => {
		resetDroppedWriteNotices();
		Notice.notices.length = 0;
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => warn.mockRestore());

	type Section = { current: { text: string; lineStart: number; lineEnd: number } | null };
	const CTR = (n: number, name = 'A', extra = ''): string[] => [`\`\`\`ds-counter${extra}`, `name: ${name}`, `current_value: ${n}`, '```'];
	const bodyOf = (n: number, name = 'A'): string => `name: ${name}\ncurrent_value: ${n}`;
	/** `lines` under `prefix`; an empty line becomes the prefix with its trailing space dropped (`>`). */
	const under = (prefix: string, lines: string[]): string[] => lines.map((l) => (l === '' ? prefix.trimEnd() : prefix + l));

	function hostFor(app: App, section: Section, body: string | null, el: HTMLElement = document.createElement('div')) {
		const host = new ReadingModeBlockHost(new Plugin(app) as any, el, switchableCtx('Note.md', section) as any, 'ds-counter');
		if (body !== null) host.setMountedBody(body);
		return host;
	}
	/** What real Obsidian reports for a block inside a quote/callout: the container's whole range. */
	const sectionOf = (text: string, lineStart: number, lineEnd: number): Section => ({ current: { text, lineStart, lineEnd } });

	test('plain blockquote: the write keeps the `> ` on every line, content above/below byte-identical', async () => {
		const app = new App();
		const live = ['# N', '', 'above', '', ...under('> ', CTR(1)), '', 'below'].join('\n');
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, sectionOf(live, 4, 7), bodyOf(1));

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toBe(['# N', '', 'above', '', ...under('> ', CTR(2)), '', 'below'].join('\n'));
		expect(Notice.notices).toHaveLength(0);
	});

	test('callout with a header and text above and below the fence: only the block changes', async () => {
		const app = new App();
		const callout = ['> [!note] Title', '> text above', ...under('> ', CTR(1)), '> text below'];
		const live = ['top', '', ...callout, '', 'bottom'].join('\n');
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, sectionOf(live, 2, 10), bodyOf(1)); // whole callout, header first

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		const calloutAfter = ['> [!note] Title', '> text above', ...under('> ', CTR(2)), '> text below'];
		expect(app.vault.getContent('Note.md')).toBe(['top', '', ...calloutAfter, '', 'bottom'].join('\n'));
		expect(Notice.notices).toHaveLength(0);
	});

	test('getBlockInfo reports the FENCE lines inside the callout, not the callout range', () => {
		const app = new App();
		const live = ['top', '> [!note] Title', '> text', ...under('> ', CTR(1)), '> after'].join('\n');
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, sectionOf(live, 1, 8), bodyOf(1));

		expect(host.getBlockInfo()).toEqual({ language: 'ds-counter', lineStart: 3, lineEnd: 6 });
	});

	test('nested callout (`> > `): the whole two-level prefix is re-emitted', async () => {
		const app = new App();
		const nested = ['> [!note] Outer', '> outer text', '> > [!tip] Inner', ...under('> > ', CTR(1)), '> > inner below', '> outer below'];
		const live = ['top', ...nested, 'bottom'].join('\n');
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, sectionOf(live, 1, 10), bodyOf(1));

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		const after = ['> [!note] Outer', '> outer text', '> > [!tip] Inner', ...under('> > ', CTR(2)), '> > inner below', '> outer below'];
		expect(app.vault.getContent('Note.md')).toBe(['top', ...after, 'bottom'].join('\n'));
	});

	test('`>` with no space after it is accepted and re-emitted as written', async () => {
		const app = new App();
		const live = ['top', ...under('>', CTR(1)), 'bottom'].join('\n'); // >```ds-counter / >name: A / ...
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, sectionOf(live, 1, 4), bodyOf(1));

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toBe(['top', ...under('>', CTR(2)), 'bottom'].join('\n'));
	});

	test.each([
		['`>`', '>'],
		['`> `', '> '],
	])('an empty body line written as %s survives a write (round trip), and new empty lines follow the same style', async (_label, blank) => {
		const app = new App();
		const block = ['> ```ds-counter', '> name: A', blank, '> current_value: 1', '> ```'];
		const live = ['top', ...block, 'bottom'].join('\n');
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, sectionOf(live, 1, 5), 'name: A\n\ncurrent_value: 1');

		await expect(host.replaceSource('name: A\n\ncurrent_value: 2')).resolves.toBe(true);
		expect(app.vault.getContent('Note.md')).toBe(['top', '> ```ds-counter', '> name: A', blank, '> current_value: 2', '> ```', 'bottom'].join('\n'));

		// A body that gains another blank line writes it in the block's own blank style.
		await expect(host.replaceSource('name: A\n\ncurrent_value: 2\n\nextra: 1')).resolves.toBe(true);
		expect(app.vault.getContent('Note.md')).toBe(
			['top', '> ```ds-counter', '> name: A', blank, '> current_value: 2', blank, '> extra: 1', '> ```', 'bottom'].join('\n'),
		);
	});

	test('a multi-line body write prefixes every new line (the block grows and shrinks)', async () => {
		const app = new App();
		const live = ['> [!note]', ...under('> ', CTR(1)), '> tail'].join('\n');
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, sectionOf(live, 0, 5), bodyOf(1));

		await host.replaceSource('name: A\ncurrent_value: 2\nmax_value: 9\nmin_value: 0\nnotes: |\n  one\n  two');
		expect(app.vault.getContent('Note.md')).toBe(
			['> [!note]', '> ```ds-counter', '> name: A', '> current_value: 2', '> max_value: 9', '> min_value: 0', '> notes: |', '>   one', '>   two', '> ```', '> tail'].join('\n'),
		);

		await host.replaceSource('name: A');
		expect(app.vault.getContent('Note.md')).toBe(['> [!note]', '> ```ds-counter', '> name: A', '> ```', '> tail'].join('\n'));
	});

	test('the info string on the opening fence is kept inside the prefix (SC-290)', async () => {
		const app = new App();
		const live = ['> [!note]', ...under('> ', CTR(1, 'A', '  extra words'))].join('\n');
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, sectionOf(live, 0, 4), bodyOf(1));

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toBe(['> [!note]', ...under('> ', CTR(2, 'A', '  extra words'))].join('\n'));
	});

	test('two different-bodied blocks in ONE callout do not cross-talk (both write orders)', async () => {
		const app = new App();
		const callout = ['> [!note]', ...under('> ', CTR(1, 'First')), '> mid', ...under('> ', CTR(1, 'Second'))];
		const live = callout.join('\n');
		app.vault.setFile('Note.md', live);
		const first = hostFor(app, sectionOf(live, 0, 9), bodyOf(1, 'First'));
		const second = hostFor(app, sectionOf(live, 0, 9), bodyOf(1, 'Second'));

		await second.replaceSource(bodyOf(7, 'Second'));
		await first.replaceSource(bodyOf(5, 'First'));
		expect(app.vault.getContent('Note.md')).toBe(
			['> [!note]', ...under('> ', CTR(5, 'First')), '> mid', ...under('> ', CTR(7, 'Second'))].join('\n'),
		);

		// And the other order, from a fresh note.
		app.vault.setFile('Note.md', live);
		const first2 = hostFor(app, sectionOf(live, 0, 9), bodyOf(1, 'First'));
		const second2 = hostFor(app, sectionOf(live, 0, 9), bodyOf(1, 'Second'));
		await first2.replaceSource(bodyOf(5, 'First'));
		await second2.replaceSource(bodyOf(7, 'Second'));
		expect(app.vault.getContent('Note.md')).toBe(
			['> [!note]', ...under('> ', CTR(5, 'First')), '> mid', ...under('> ', CTR(7, 'Second'))].join('\n'),
		);
	});

	test('two IDENTICAL blocks in one callout are told apart by their position in the callout (DOM order)', async () => {
		const app = new App();
		const live = ['> [!note]', ...under('> ', CTR(1, 'Twin')), '> mid', ...under('> ', CTR(1, 'Twin'))].join('\n');
		app.vault.setFile('Note.md', live);
		// Reading view's DOM for that callout: both blocks are .block-language-ds-counter siblings.
		const callout = document.createElement('div');
		callout.className = 'callout';
		const content = document.createElement('div');
		content.className = 'callout-content';
		callout.appendChild(content);
		const els = [0, 1].map(() => {
			const d = document.createElement('div');
			d.className = 'block-language-ds-counter';
			content.appendChild(d);
			return d;
		});
		const upper = hostFor(app, sectionOf(live, 0, 9), bodyOf(1, 'Twin'), els[0]);
		const lower = hostFor(app, sectionOf(live, 0, 9), bodyOf(1, 'Twin'), els[1]);

		await lower.replaceSource(bodyOf(9, 'Twin'));
		expect(app.vault.getContent('Note.md')).toBe(
			['> [!note]', ...under('> ', CTR(1, 'Twin')), '> mid', ...under('> ', CTR(9, 'Twin'))].join('\n'),
		);
		await upper.replaceSource(bodyOf(4, 'Twin'));
		expect(app.vault.getContent('Note.md')).toBe(
			['> [!note]', ...under('> ', CTR(4, 'Twin')), '> mid', ...under('> ', CTR(9, 'Twin'))].join('\n'),
		);
	});

	test('two blocks in two DIFFERENT callouts do not cross-talk (both write orders)', async () => {
		const app = new App();
		const a = ['> [!note] A', ...under('> ', CTR(1, 'Same'))];
		const b = ['> [!tip] B', ...under('> ', CTR(1, 'Other'))];
		const live = [...a, '', ...b].join('\n');
		app.vault.setFile('Note.md', live);
		const hostA = hostFor(app, sectionOf(live, 0, 4), bodyOf(1, 'Same'));
		const hostB = hostFor(app, sectionOf(live, 6, 10), bodyOf(1, 'Other'));

		await hostB.replaceSource(bodyOf(3, 'Other'));
		await hostA.replaceSource(bodyOf(2, 'Same'));
		expect(app.vault.getContent('Note.md')).toBe(
			[['> [!note] A', ...under('> ', CTR(2, 'Same'))].join('\n'), '', ['> [!tip] B', ...under('> ', CTR(3, 'Other'))].join('\n')].join('\n'),
		);
	});

	test('a CRLF note with a callout stays all-CRLF after a write (SC-453)', async () => {
		const app = new App();
		const live = ['# N', '', '> [!note]', ...under('> ', CTR(1)), '> tail', '', 'below'].join('\r\n');
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, sectionOf(live, 2, 7), bodyOf(1));

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		const out = app.vault.getContent('Note.md')!;
		expect(out).toBe(['# N', '', '> [!note]', ...under('> ', CTR(2)), '> tail', '', 'below'].join('\r\n'));
		expect(out.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
	});

	test('a hand-edited callout block (lines inserted above, section gone) is re-located by its body and written', async () => {
		const app = new App();
		const live = ['> [!note]', ...under('> ', CTR(1))].join('\n');
		app.vault.setFile('Note.md', live);
		const section = sectionOf(live, 0, 4);
		const host = hostFor(app, section, bodyOf(1));
		host.notePersistIntent();
		const edited = ['x', 'y', 'z', live].join('\n');
		app.vault.setFile('Note.md', edited);
		section.current = null; // the callout section was torn down before the flush

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toBe(['x', 'y', 'z', '> [!note]', ...under('> ', CTR(2))].join('\n'));
		expect(Notice.notices).toHaveLength(0);
	});

	test('a callout block that grew since the section was read: the stale range never corrupts, the body relocates it', async () => {
		const app = new App();
		const live = ['> [!note]', '> ```ds-counter', '> name: A', '> current_value: 1', '> extra: yes', '> ```', '> tail'].join('\n');
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, sectionOf(live, 0, 6), 'name: A\ncurrent_value: 1\nextra: yes');

		await expect(host.replaceSource('name: A\ncurrent_value: 2\nextra: yes')).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toBe(
			['> [!note]', '> ```ds-counter', '> name: A', '> current_value: 2', '> extra: yes', '> ```', '> tail'].join('\n'),
		);
	});

	test('regression guard: an un-nested block is written byte-for-byte as before', async () => {
		const app = new App();
		const live = ['# N', '', '```ds-counter  extra', 'name: A', 'current_value: 1', '```', '', '> unrelated quote', ''].join('\n');
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, sectionOf(live, 2, 5), bodyOf(1));

		await host.replaceSource(`${bodyOf(2)}\n\nnotes: x`);

		expect(app.vault.getContent('Note.md')).toBe(
			['# N', '', '```ds-counter  extra', 'name: A', 'current_value: 2', '', 'notes: x', '```', '', '> unrelated quote', ''].join('\n'),
		);
	});

	test('an identical-content write is a no-op with NO Notice (the callout note is byte-identical)', async () => {
		const app = new App();
		const live = ['> [!note]', ...under('> ', CTR(1))].join('\n');
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, sectionOf(live, 0, 4), bodyOf(1));

		await expect(host.replaceSource(bodyOf(1))).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toBe(live);
		expect(Notice.notices).toHaveLength(0);
	});

	test('the file changed underneath (block gone): still the one existing "changed on disk first" Notice, nothing new', async () => {
		const app = new App();
		const live = ['> [!note]', ...under('> ', CTR(1, 'Vigor'))].join('\n');
		app.vault.setFile('Folder/Session 3.md', live);
		const ctx = switchableCtx('Folder/Session 3.md', sectionOf(live, 0, 4));
		const host = new ReadingModeBlockHost(new Plugin(app) as any, document.createElement('div'), ctx as any, 'ds-counter');
		host.setMountedBody(bodyOf(1, 'Health'));

		await expect(host.replaceSource(bodyOf(2, 'Health'))).resolves.toBe(false);

		expect(app.vault.getContent('Folder/Session 3.md')).toBe(live);
		expect(Notice.notices).toEqual([droppedWriteMessage('Session 3')]);
	});

	test('a fence inside a list item cannot be written: a "could not be saved" Notice, the note unchanged', async () => {
		const app = new App();
		const live = ['# N', '', '- item', '  ```ds-counter', '  name: A', '  current_value: 1', '  ```', '', 'below'].join('\n');
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, sectionOf(live, 2, 6), bodyOf(1)); // Reading view: the whole list

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(false);

		expect(app.vault.getContent('Note.md')).toBe(live);
		expect(Notice.notices).toEqual([unsavableWriteMessage('Note')]);
	});

	test('a list inside a callout works: the fence under `> - item` keeps its `>   ` prefix on every written line', async () => {
		const app = new App();
		const live = ['top', '> - item', ...under('>   ', CTR(1)), '> tail'].join('\n');
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, sectionOf(live, 1, 6), bodyOf(1));

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toBe(['top', '> - item', ...under('>   ', CTR(2)), '> tail'].join('\n'));
	});

	test('a fence indented a few spaces outside any quote is another unsupported shape: the Notice, the note unchanged', async () => {
		const app = new App();
		const live = ['top', '', ...CTR(1).map((l) => `  ${l}`), '', 'below'].join('\n');
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, sectionOf(live, 2, 5), bodyOf(1));

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(false);

		expect(app.vault.getContent('Note.md')).toBe(live);
		expect(Notice.notices).toEqual([unsavableWriteMessage('Note')]);
	});

	test('a section that holds no readable fence at all (no identity): the same Notice instead of a silent false', async () => {
		const app = new App();
		const live = ['> [!note]', '> just text, the block was edited away'].join('\n');
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, sectionOf(live, 0, 1), null);

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(false);

		expect(app.vault.getContent('Note.md')).toBe(live);
		expect(Notice.notices).toEqual([unsavableWriteMessage('Note')]);
	});

	test('a callout with a fence that never closes inside the quote is not written (and says so)', async () => {
		const app = new App();
		const live = ['> [!note]', '> ```ds-counter', '> name: A', '', 'after the quote'].join('\n');
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, sectionOf(live, 0, 2), 'name: A');

		await expect(host.replaceSource('name: B')).resolves.toBe(false);

		expect(app.vault.getContent('Note.md')).toBe(live);
		expect(Notice.notices).toHaveLength(1);
	});
});

// Live Preview draws a callout as ONE CodeMirror widget and (measured, Obsidian 1.14.4) hands its
// code-block processors a context whose getSectionInfo is null for every node — so the block used to
// be read-only there. The host finds the callout through the editor instead (cm.posAtDOM).
describe('SC-455: Live Preview callout (no section info)', () => {
	let warn: jest.SpyInstance;
	beforeEach(() => {
		resetDroppedWriteNotices();
		Notice.notices.length = 0;
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => warn.mockRestore());

	const CTR = (n: number, name = 'A'): string[] => ['> ```ds-counter', `> name: ${name}`, `> current_value: ${n}`, '> ```'];
	const bodyOf = (n: number, name = 'A'): string => `name: ${name}\ncurrent_value: ${n}`;

	/** A CM6-like editor view over `text` whose callout widget starts at `widgetLine`. */
	function lpHost(app: App, text: string, widgetLine: number, opts: { widgetClass?: string; attached?: boolean; blocks?: number; insideDseElement?: boolean } = {}) {
		const widget = document.createElement('div');
		widget.className = opts.widgetClass ?? 'cm-embed-block cm-callout';
		const els: HTMLElement[] = [];
		let holder: HTMLElement = widget;
		if (opts.insideDseElement) {
			// ds-party's hero_ref: the callout widget holds a DSE root, and the block is rendered inside THAT.
			holder = document.createElement('div');
			holder.setAttribute('data-dse-element', 'party');
			widget.appendChild(holder);
		}
		for (let i = 0; i < (opts.blocks ?? 1); i++) {
			const el = document.createElement('div');
			el.className = 'block-language-ds-counter';
			holder.appendChild(el);
			els.push(el);
		}
		const cmDom = document.createElement('div');
		if (opts.attached !== false) cmDom.appendChild(widget);
		const lineOffsets: number[] = [];
		text.split('\n').reduce((off, l) => (lineOffsets.push(off), off + l.length + 1), 0);
		const cm = {
			dom: cmDom,
			posAtDOM: (node: Node) => (node === widget ? lineOffsets[widgetLine] : (() => { throw new Error('not in view'); })()),
			state: { doc: { lineAt: (pos: number) => ({ number: lineOffsets.filter((o) => o <= pos).length }) } },
		};
		const view = { file: { path: 'Note.md' }, editor: { cm, getValue: () => text }, containerEl: cmDom };
		const plugin = new Plugin(app) as any;
		plugin.app.workspace.getLeavesOfType = () => [{ view }];
		const ctx = {
			docId: 'doc-lp',
			sourcePath: 'Note.md',
			frontmatter: undefined,
			addChild: () => {},
			getSectionInfo: () => null,
			containerEl: widget,
			el: widget,
		};
		return els.map((el) => new ReadingModeBlockHost(plugin, el, ctx as any, 'ds-counter'));
	}

	test('a callout widget in Live Preview is persistable and a click-write lands inside the callout', async () => {
		const app = new App();
		const live = ['# N', '', '> [!note] T', ...CTR(1), '> tail', '', 'below'].join('\n');
		app.vault.setFile('Note.md', live);
		const [host] = lpHost(app, live, 2);
		host.setMountedBody(bodyOf(1));

		expect(host.canPersist).toBe(true);
		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toBe(['# N', '', '> [!note] T', ...CTR(2), '> tail', '', 'below'].join('\n'));
		expect(Notice.notices).toHaveLength(0);
	});

	test('two identical blocks in one Live Preview callout: each write lands in its own block', async () => {
		const app = new App();
		const live = ['> [!note] T', ...CTR(1, 'Twin'), '> mid', ...CTR(1, 'Twin')].join('\n');
		app.vault.setFile('Note.md', live);
		const [upper, lower] = lpHost(app, live, 0, { blocks: 2 });
		upper.setMountedBody(bodyOf(1, 'Twin'));
		lower.setMountedBody(bodyOf(1, 'Twin'));

		await lower.replaceSource(bodyOf(6, 'Twin'));
		expect(app.vault.getContent('Note.md')).toBe(['> [!note] T', ...CTR(1, 'Twin'), '> mid', ...CTR(6, 'Twin')].join('\n'));
	});

	test('a block rendered BY a DSE element inside a Live Preview callout (a nested render) stays read-only', () => {
		const app = new App();
		const live = ['> [!note] T', ...CTR(1)].join('\n');
		app.vault.setFile('Note.md', live);
		const [host] = lpHost(app, live, 0, { insideDseElement: true });
		host.setMountedBody(bodyOf(1));

		expect(host.canPersist).toBe(false);
	});
});
