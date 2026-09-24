// SC-343 (spec SC-340 §6.5): durable block identity for ReadingModeBlockHost.
import {
	ReadingModeBlockHost,
	locateByBody,
	normalizeBody,
} from '../../../src/framework/host/ReadingModeBlockHost';
import { App, Plugin, makeFakeContext } from '../../mocks/obsidian';
import type { MarkdownPostProcessorContext } from '../../mocks/obsidian';

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
