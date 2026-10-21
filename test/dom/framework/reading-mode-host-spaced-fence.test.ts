// SC-457 — a fence with whitespace between the backticks and the language (```` ``` ds-counter ````).
// Obsidian renders it as the `ds-counter` block (measured, 1.14.4: one space, several spaces and a tab, in Reading
// view and Live Preview), but the host used to read the language as the first token of the UNTRIMMED remainder - ''.
// So `getBlockInfo().language` was '' (block key `Note.md::::4`, the chrome "Pin to sidebar" item asked for a block of
// language ''), and a write whose section snapshot was gone / stale was looked up by body under the language '' and
// never found: dropped, with the "not saved" Notice. The language is now the first token of the TRIMMED info string
// (blockPrefix.ts `fenceLanguage`, the same rule as anchor.ts' alias); the info string itself is still re-emitted verbatim.
import { ReadingModeBlockHost, locateByBody, locateInSection } from '../../../src/framework/host/ReadingModeBlockHost';
import { App, Notice, Plugin } from '../../mocks/obsidian';
import type { MarkdownPostProcessorContext } from '../../mocks/obsidian';
import { droppedWriteMessage, resetDroppedWriteNotices } from '../../../src/framework/host/droppedWriteNotice';

type Section = { current: { text: string; lineStart: number; lineEnd: number } | null };

function switchableCtx(sourcePath: string, section: Section): MarkdownPostProcessorContext {
	return {
		docId: 'doc-spaced',
		sourcePath,
		frontmatter: undefined,
		addChild: () => {},
		getSectionInfo: () => section.current,
	};
}

const toCrlf = (s: string): string => s.replace(/\n/g, '\r\n');
/** A ds-counter block whose opening fence is ```` ```<info> ````. */
const CTR = (n: number, info = ' ds-counter', name = 'A'): string[] => [`\`\`\`${info}`, `name: ${name}`, `current_value: ${n}`, '```'];
const bodyOf = (n: number, name = 'A'): string => `name: ${name}\ncurrent_value: ${n}`;
const under = (prefix: string, lines: string[]): string[] => lines.map((l) => (l === '' ? prefix.trimEnd() : prefix + l));

describe('SC-457: ReadingModeBlockHost with whitespace before the language', () => {
	let warn: jest.SpyInstance;
	beforeEach(() => {
		resetDroppedWriteNotices();
		Notice.notices.length = 0;
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => warn.mockRestore());

	function hostFor(app: App, section: Section, body: string | null, path = 'Note.md') {
		const host = new ReadingModeBlockHost(new Plugin(app) as any, document.createElement('div'), switchableCtx(path, section) as any, 'ds-counter');
		if (body !== null) host.setMountedBody(body);
		return host;
	}
	const sectionOf = (text: string, lineStart: number, lineEnd: number): Section => ({ current: { text, lineStart, lineEnd } });
	const values = (app: App): string[] => (app.vault.getContent('Note.md')!.match(/current_value: (\d+)/g) ?? []).map((s) => s.split(': ')[1]);

	test.each([
		['one space', ' ds-counter'],
		['three spaces', '   ds-counter'],
		['a tab', '\tds-counter'],
		['a space, then extra info', ' ds-counter  extra'],
		['trailing whitespace', ' ds-counter  '],
	])('getBlockInfo and blockKey name the language (%s), not an empty one', (_label, info) => {
		const app = new App();
		const live = ['# N', '', 'above', '', ...CTR(1, info)].join('\n');
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, sectionOf(live, 4, 7), bodyOf(1));

		expect(host.getBlockInfo()).toEqual({ language: 'ds-counter', lineStart: 4, lineEnd: 7 });
		expect(host.blockKey()).toBe('Note.md::ds-counter::4');
	});

	// Obsidian renders ```ds-counter<NBSP/U+3000> (and with a leading space) as the block and it saves on develop: the
	// language is read without trailing whitespace of any kind. The write drops the trailing whitespace of the opening
	// line (SC-290: `info` is the remainder minus trailing whitespace).
	test.each([
		['a trailing no-break space', 'ds-counter\u00a0'],
		['a trailing U+3000', 'ds-counter\u3000'],
		['a no-break space right after the name, then a word (Live Preview renders it as the block)', 'ds-counter\u00a0x'],
		['a leading space and a trailing U+3000', ' ds-counter\u3000'],
	])('%s: the language is ds-counter and a section-gone write lands', async (_label, info) => {
		const app = new App();
		const before = ['# N', '', 'TOP', '', ...CTR(1, info), '', 'BELOW'].join('\n');
		app.vault.setFile('Note.md', before);
		const section = sectionOf(before, 4, 7);
		const host = hostFor(app, section, bodyOf(1));
		expect(host.getBlockInfo()?.language).toBe('ds-counter');
		expect(host.blockKey()).toBe('Note.md::ds-counter::4');
		const shifted = ['# N', '', 'TOP', '', 'shift 0', '', 'shift 1', '', ...CTR(1, info), '', 'BELOW'].join('\n');
		app.vault.setFile('Note.md', shifted);
		section.current = sectionOf(shifted, 8, 11).current;
		host.notePersistIntent();
		section.current = null;

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		const opener = info.replace(/[\u00a0\u3000]$/, '');
		expect(app.vault.getContent('Note.md')).toBe(['# N', '', 'TOP', '', 'shift 0', '', 'shift 1', '', ...CTR(2, opener), '', 'BELOW'].join('\n'));
		expect(Notice.notices).toHaveLength(0);
	});

	test('a spaced fence inside a callout reports its language too (the SC-455 section-window path)', () => {
		const app = new App();
		const live = ['top', '> [!note] Title', ...under('> ', CTR(1)), '> after'].join('\n');
		app.vault.setFile('Note.md', live);
		const host = hostFor(app, sectionOf(live, 1, 6), bodyOf(1));

		expect(host.getBlockInfo()).toEqual({ language: 'ds-counter', lineStart: 2, lineEnd: 5 });
		expect(host.blockKey()).toBe('Note.md::ds-counter::2');
	});

	test('a bare fence and an unspaced one are unchanged: language "" and "ds-counter"', () => {
		const app = new App();
		const live = ['```', 'x', '```', '', ...CTR(1, 'ds-counter')].join('\n');
		app.vault.setFile('Note.md', live);

		expect(hostFor(app, sectionOf(live, 0, 2), null).getBlockInfo()?.language).toBe('');
		expect(hostFor(app, sectionOf(live, 4, 7), null).getBlockInfo()?.language).toBe('ds-counter');
	});

	test('section gone (navigate-away flush) after lines were inserted above: the write lands, the info string and every other byte survive', async () => {
		const app = new App();
		const before = ['# N', '', 'TOP', '', ...CTR(1), '', 'BELOW'].join('\n');
		app.vault.setFile('Note.md', before);
		const section = sectionOf(before, 4, 7);
		const host = hostFor(app, section, bodyOf(1));
		const shifted = ['# N', '', 'TOP', '', ...Array.from({ length: 8 }, (_, i) => `shift ${i}`), '', ...CTR(1), '', 'BELOW'].join('\n');
		app.vault.setFile('Note.md', shifted);
		section.current = sectionOf(shifted, 14, 17).current;
		host.notePersistIntent(); // persist() refreshes the durable position while the section is live...
		section.current = null; // ...then the note is navigated away before the flush

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toBe(['# N', '', 'TOP', '', ...Array.from({ length: 8 }, (_, i) => `shift ${i}`), '', ...CTR(2), '', 'BELOW'].join('\n'));
		expect(Notice.notices).toHaveLength(0);
	});

	test.each([
		['three spaces', '   ds-counter'],
		['a tab', '\tds-counter'],
		['a space, then extra info', ' ds-counter  extra'],
	])('stale section range (the block moved): relocated by body and written (%s), the opening line kept byte for byte', async (_label, info) => {
		const app = new App();
		const seen = [...CTR(1, info), 'after'].join('\n');
		app.vault.setFile('Note.md', seen);
		const host = hostFor(app, sectionOf(seen, 0, 3), bodyOf(1)); // the host saw the block at lines 0..3...
		const live = ['a', 'b', 'c', 'd', seen].join('\n');
		app.vault.setFile('Note.md', live); // ...then lines were inserted above, and the snapshot is still lines 0..3

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toBe(['a', 'b', 'c', 'd', ...CTR(2, info), 'after'].join('\n'));
		expect(Notice.notices).toHaveLength(0);
	});

	test('a spaced block and an unspaced one with the SAME body do not cross-talk (section gone, both orders)', async () => {
		for (const [which, expected] of [
			[0, ['2', '1']],
			[1, ['1', '2']],
		] as const) {
			const app = new App();
			const live = ['top', ...CTR(1, ' ds-counter'), 'mid', ...CTR(1, 'ds-counter'), 'bottom'].join('\n');
			app.vault.setFile('Note.md', live);
			const section = sectionOf(live, which === 0 ? 1 : 6, which === 0 ? 4 : 9);
			const host = hostFor(app, section, bodyOf(1));
			section.current = null;

			await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

			expect(values(app)).toEqual(expected);
			const out = app.vault.getContent('Note.md')!.split('\n');
			expect(out[1]).toBe('``` ds-counter'); // the spaced twin's opening line survives, whichever twin was written
			expect(out[6]).toBe('```ds-counter');
			expect(Notice.notices).toHaveLength(0);
		}
	});

	test('CRLF note, section gone: the write lands, the note stays all-CRLF and the info string survives', async () => {
		const app = new App();
		const live = toCrlf(['# N', '', 'TOP', '', ...CTR(1), '', 'BELOW'].join('\n'));
		app.vault.setFile('Note.md', live);
		const section = sectionOf(live, 4, 7);
		const host = hostFor(app, section, bodyOf(1));
		section.current = null;

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		const out = app.vault.getContent('Note.md')!;
		expect(out).toBe(toCrlf(['# N', '', 'TOP', '', ...CTR(2), '', 'BELOW'].join('\n')));
		expect(out.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
		expect(Notice.notices).toHaveLength(0);
	});

	test('a lone CR above the block (SC-460), section gone: the write lands and the lone CR survives', async () => {
		const app = new App();
		const live = ['# N', '', 'A\rB', '', ...CTR(1), '', 'BELOW\rX'].join('\n');
		app.vault.setFile('Note.md', live);
		const section = sectionOf(live, 5, 8); // Obsidian counts the lone CR as a line break
		const host = hostFor(app, section, bodyOf(1));
		expect(host.getBlockInfo()).toEqual({ language: 'ds-counter', lineStart: 5, lineEnd: 8 });
		section.current = null;

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toBe(['# N', '', 'A\rB', '', ...CTR(2), '', 'BELOW\rX'].join('\n'));
		expect(Notice.notices).toHaveLength(0);
	});

	test('an unterminated spaced fence at the end of the note, section gone: written and closed', async () => {
		const app = new App();
		const live = ['# N', '', 'TOP', '', ...CTR(1).slice(0, 3)].join('\n');
		app.vault.setFile('Note.md', live);
		const section = sectionOf(live, 4, 6);
		const host = hostFor(app, section, bodyOf(1));
		section.current = null;

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toBe(['# N', '', 'TOP', '', ...CTR(2)].join('\n'));
		expect(Notice.notices).toHaveLength(0);
	});

	test('a spaced block inside a callout, hand-edited above (section gone): written, prefix and info string kept', async () => {
		const app = new App();
		const live = ['top', '> [!note] Title', ...under('> ', CTR(1)), '> after'].join('\n');
		app.vault.setFile('Note.md', live);
		const section = sectionOf(live, 1, 6);
		const host = hostFor(app, section, bodyOf(1));
		const edited = ['top', 'more', '> [!note] Title', ...under('> ', CTR(1)), '> after'].join('\n');
		app.vault.setFile('Note.md', edited);
		section.current = sectionOf(edited, 2, 7).current;

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(true);

		expect(app.vault.getContent('Note.md')).toBe(['top', 'more', '> [!note] Title', ...under('> ', CTR(2)), '> after'].join('\n'));
		expect(Notice.notices).toHaveLength(0);
	});

	test('a write that still cannot land says so: the body is gone from the note, so ONE "not saved" Notice and the note is unchanged', async () => {
		const app = new App();
		const live = ['# N', ...CTR(1)].join('\n');
		app.vault.setFile('Note.md', live);
		const section = sectionOf(live, 1, 4);
		const host = hostFor(app, section, bodyOf(1));
		const changed = ['# N', ...CTR(7, ' ds-counter', 'Other')].join('\n');
		app.vault.setFile('Note.md', changed);
		section.current = null;

		await expect(host.replaceSource(bodyOf(2))).resolves.toBe(false);

		expect(app.vault.getContent('Note.md')).toBe(changed);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
	});
});

describe('SC-457: the locate helpers match a spaced fence by its trimmed language', () => {
	const note = (info: string): string => ['top', ...CTR(1, info), 'bottom'].join('\n');

	test.each(['ds-counter', ' ds-counter', '   ds-counter', '\tds-counter', ' \t ds-counter  extra'])('locateByBody finds the block opened with %j', (info) => {
		expect(locateByBody(note(info), 'ds-counter', bodyOf(1), 0)).toEqual({ lineStart: 1, lineEnd: 4 });
	});

	test('locateByBody does not match another language, or the empty language (a bare fence with the same body)', () => {
		expect(locateByBody(note(' ds-counter'), 'ds-stamina', bodyOf(1), 0)).toBeNull();
		expect(locateByBody(note(' ds-counter'), '', bodyOf(1), 0)).toBeNull();
	});

	test('locateByBody finds an unterminated spaced fence that runs to the end of the note', () => {
		const text = ['top', ...CTR(1).slice(0, 3)].join('\n');
		expect(locateByBody(text, 'ds-counter', bodyOf(1), 0)).toEqual({ lineStart: 1, lineEnd: 3 });
	});

	test.each(['\u00a0', '\u3000', '\f', '\v'])('a fence with %j before the language is not the block: locateByBody never relocates onto it, and its host reports another language', (ws) => {
		const impostor = ['```' + ws + 'ds-counter', 'name: A', 'current_value: 1', '```'];
		const real = CTR(1, 'ds-counter');
		const text = ['top', ...impostor, 'mid', ...real, 'bottom'].join('\n');
		// the impostor is nearer the known line, but only the real block is a ds-counter block
		expect(locateByBody(text, 'ds-counter', bodyOf(1), 1)).toEqual({ lineStart: 6, lineEnd: 9 });
		expect(locateByBody(['top', ...impostor].join('\n'), 'ds-counter', bodyOf(1), 1)).toBeNull();
		const app = new App();
		app.vault.setFile('Note.md', text);
		const host = new ReadingModeBlockHost(new Plugin(app) as any, document.createElement('div'), switchableCtx('Note.md', { current: { text, lineStart: 1, lineEnd: 4 } }) as any, 'ds-counter');
		expect(host.getBlockInfo()?.language).toBe(ws + 'ds-counter');
	});

	test('locateInSection finds a spaced fence inside a quote/callout window', () => {
		const text = ['top', '> [!note]', ...under('> ', CTR(1, '  ds-counter')), 'bottom'].join('\n');
		expect(locateInSection(text, { lineStart: 1, lineEnd: 6 }, 'ds-counter', bodyOf(1), -1, null)).toEqual({ lineStart: 2, lineEnd: 5 });
	});
});
