// SC-343 (spec SC-340 §6.5): durable block identity for ReadingModeBlockHost.
import {
	ReadingModeBlockHost,
	locateByBody,
	normalizeBody,
} from '../../../src/framework/host/ReadingModeBlockHost';
import { App, Notice, Plugin, makeFakeContext } from '../../mocks/obsidian';
import type { MarkdownPostProcessorContext } from '../../mocks/obsidian';
import { droppedWriteMessage, resetDroppedWriteNotices } from '../../../src/framework/host/droppedWriteNotice';

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

	test('a fence not at column 0 (callout) never forms a durable identity: read-only once its section is gone', () => {
		const app = new App();
		const text = ['> [!note]', '> ```ds-counter', '> name: A', '> ```'].join('\n');
		app.vault.setFile('Note.md', text);
		const section = { current: { text, lineStart: 0, lineEnd: 3 } as { text: string; lineStart: number; lineEnd: number } | null };
		const host = new ReadingModeBlockHost(new Plugin(app) as any, document.createElement('div'), switchableCtx('Note.md', section) as any, 'ds-counter');
		host.setMountedBody('name: A');
		expect(host.canPersist).toBe(true); // section resolves: unchanged from today
		section.current = null;
		expect(host.canPersist).toBe(false); // no language could be read -> no durable identity
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

	test('fence not at column 0 (callout): no write and NO Notice (unchanged from today)', async () => {
		const app = new App();
		const live = ['> [!note]', '> ```ds-counter', '> name: A', '> ```'].join('\n');
		app.vault.setFile('Note.md', live);
		const section = { current: { text: live, lineStart: 0, lineEnd: 3 } };
		const host = hostFor(app, 'Note.md', section, 'name: A');

		await expect(host.replaceSource('name: B')).resolves.toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(live);
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
