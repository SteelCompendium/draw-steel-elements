// SC-552 -- a block's position pinned at one moment and a write placed through it later. A block edit form pins its block when it
// opens; Obsidian's redraw of identical blocks can then hand the form's element to a twin, and a write that follows the element
// lands in the twin. `pinPosition()` reads where the block is drawn now, `replaceSource(body, { pin })` finds that block again
// in whatever the note has become (a line diff, lineMap.ts) and writes there; a pin that cannot be placed falls back to the
// element's section as before, unless the caller asked for `pinOnly` (a form kept open past its view, SC-552 K-strict).
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { ViewRegistry } from '../../../src/framework/host/viewRegistry';
import { droppedWriteMessage, resetDroppedWriteNotices } from '../../../src/framework/host/droppedWriteNotice';
import { App, Notice, Plugin, makeFakeContext } from '../../mocks/obsidian';
import type { MarkdownPostProcessorContext } from '../../mocks/obsidian';

type Section = { current: { text: string; lineStart: number; lineEnd: number } | null };

function switchableCtx(section: Section): MarkdownPostProcessorContext {
	return { docId: 'doc-pin', sourcePath: 'Note.md', frontmatter: undefined, addChild: () => {}, getSectionInfo: () => section.current };
}

const CTR = (n: number, name = 'Twin'): string[] => ['```ds-counter', `name: ${name}`, `current_value: ${n}`, '```'];
const bodyOf = (n: number, name = 'Twin'): string => `name: ${name}\ncurrent_value: ${n}`;
/** A note of identical counters, one per value, between a heading and some text. */
const noteOf = (values: number[], head: string[] = []): string =>
	['# N', '', ...head, ...values.flatMap((v) => [...CTR(v), '', 'between', '']), 'END'].join('\n');
/** The fence lines of the closed ds-counter blocks of `text`. */
const fencesOf = (text: string): number[] => text.split('\n').map((l, i) => (l === '```ds-counter' ? i : -1)).filter((i) => i >= 0);
const sectionAt = (text: string, fence: number): NonNullable<Section['current']> => ({ text, lineStart: fence, lineEnd: fence + 3 });
const names = (app: App): string[] => [...app.vault.getContent('Note.md')!.matchAll(/name: (\w+)/g)].map((m) => m[1]);
const values = (app: App): number[] => [...app.vault.getContent('Note.md')!.matchAll(/current_value: (\d+)/g)].map((m) => Number(m[1]));

describe('SC-552: ReadingModeBlockHost pinned writes', () => {
	let warn: jest.SpyInstance;
	beforeEach(() => {
		resetDroppedWriteNotices();
		Notice.notices.length = 0;
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => warn.mockRestore());

	function hostOn(app: App, section: Section, el: HTMLElement = document.createElement('div')) {
		const host = new ReadingModeBlockHost(new Plugin(app) as never, el, switchableCtx(section) as never, 'ds-counter');
		host.setMountedBody(bodyOf(5));
		return host;
	}
	/** Three twins; the host sits on the MIDDLE one. */
	function triplet(values3: number[] = [5, 5, 5]) {
		const app = new App();
		const text = noteOf(values3);
		app.vault.setFile('Note.md', text);
		const section: Section = { current: sectionAt(text, fencesOf(text)[1]) };
		return { app, section, host: hostOn(app, section), text };
	}

	test('pinPosition: the note text and the fence line the block is drawn on', () => {
		const { host, text } = triplet();
		expect(host.pinPosition()).toEqual({ text, lineStart: fencesOf(text)[1] });
	});

	test('pinPosition: a block inside a callout is pinned at its own fence, told from its twin by its place in the callout', () => {
		const app = new App();
		const lines = ['# N', '', '> [!note] Camp', ...CTR(5).map((l) => `> ${l}`), ...CTR(5).map((l) => `> ${l}`), '', 'END'];
		const text = lines.join('\n');
		app.vault.setFile('Note.md', text);
		const callout = document.body.createDiv({ cls: 'callout' });
		callout.createDiv({ cls: 'block-language-ds-counter' });
		const second = callout.createDiv({ cls: 'block-language-ds-counter' });
		const section: Section = { current: { text, lineStart: 2, lineEnd: 10 } };
		const host = hostOn(app, section, second);

		expect(host.pinPosition()).toEqual({ text, lineStart: 7 });
		callout.remove();
	});

	test('pinPosition: null while the block has no section', () => {
		const { host, section } = triplet();
		section.current = null;
		expect(host.pinPosition()).toBeNull();
	});

	test('after Obsidian hands the form\'s element to the lower twin, a pinned write lands in the block the pin was taken on (and without a pin it follows the element)', async () => {
		const { app, section, host } = triplet();
		const pin = host.pinPosition()!;
		// the upper twin is written (6), and the redraw puts the middle block's element on the lower block
		const after = noteOf([6, 5, 5]);
		app.vault.setFile('Note.md', after);
		section.current = sectionAt(after, fencesOf(after)[2]);

		expect(await host.replaceSource(bodyOf(5, 'Edited'), { pin })).toBe(true);
		expect(names(app)).toEqual(['Twin', 'Edited', 'Twin']);
		expect(values(app)).toEqual([6, 5, 5]);

		// control: the same situation without a pin is the bug this fixes - the write follows the element
		const control = triplet();
		control.section.current = sectionAt(after, fencesOf(after)[2]);
		control.app.vault.setFile('Note.md', after);
		expect(await control.host.replaceSource(bodyOf(5, 'Edited'))).toBe(true);
		expect(names(control.app)).toEqual(['Twin', 'Twin', 'Edited']);
	});

	test('lines inserted above the block while the pin is held move the target with them', async () => {
		const { app, section, host } = triplet();
		const pin = host.pinPosition()!;
		const after = noteOf([6, 5, 5], ['NEW PARAGRAPH', '']); // an outside edit: text above AND the upper twin changed
		app.vault.setFile('Note.md', after);
		section.current = sectionAt(after, fencesOf(after)[2]);

		expect(await host.replaceSource(bodyOf(5, 'Edited'), { pin })).toBe(true);
		expect(names(app)).toEqual(['Twin', 'Edited', 'Twin']);
		expect(app.vault.getContent('Note.md')).toContain('NEW PARAGRAPH');
	});

	test('a pin that cannot be placed falls back to the element\'s section: no new refusal, the write lands', async () => {
		const { app, host } = triplet();
		const stale = { text: app.vault.getContent('Note.md')!, lineStart: 0 }; // line 0 is the heading, not a fence

		expect(await host.replaceSource(bodyOf(5, 'Edited'), { pin: stale })).toBe(true);
		expect(names(app)).toEqual(['Twin', 'Edited', 'Twin']); // the section the element sits on
		expect(host.lastWriteReported).toBe(false);
	});

	test('the pinned block is only written while it still holds the body the host knows', async () => {
		const { app, section, host } = triplet();
		const pin = host.pinPosition()!;
		const after = noteOf([5, 9, 5]); // the pinned (middle) block was edited from outside
		app.vault.setFile('Note.md', after);
		section.current = sectionAt(after, fencesOf(after)[1]);

		expect(await host.replaceSource(bodyOf(5, 'Edited'), { pin, pinOnly: true })).toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(after);
	});

	test('pinOnly: a pin that cannot be placed writes nothing, says the block changed on disk, and reports it', async () => {
		const { app, host } = triplet();
		const before = app.vault.getContent('Note.md')!;
		const stale = { text: before, lineStart: 0 };

		expect(await host.replaceSource(bodyOf(5, 'Edited'), { pin: stale, pinOnly: true })).toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(before);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
		expect(host.lastWriteReported).toBe(true);
	});

	test('pinOnly with a pin that places: the write lands there', async () => {
		const { app, host } = triplet();
		expect(await host.replaceSource(bodyOf(5, 'Edited'), { pin: host.pinPosition()!, pinOnly: true })).toBe(true);
		expect(names(app)).toEqual(['Twin', 'Edited', 'Twin']);
	});

	test('an unterminated trailing fence is pinned and written like any other block: the note\'s final newline stays', async () => {
		const app = new App();
		const closed = [...CTR(5), ''].join('\n');
		const text = `# N\n\n${closed}\n\`\`\`ds-counter\nname: Twin\ncurrent_value: 5\n`; // the last block never closes
		app.vault.setFile('Note.md', text);
		const lines = text.split('\n');
		const unterminated = lines.indexOf('```ds-counter', 5);
		const section: Section = { current: { text, lineStart: unterminated, lineEnd: lines.length - 1 } }; // Obsidian: to the note's last line
		const host = hostOn(app, section);
		const pin = host.pinPosition()!;
		expect(pin.lineStart).toBe(unterminated);

		section.current = { text, lineStart: 2, lineEnd: 5 }; // the element has been handed to the closed twin above
		expect(await host.replaceSource(bodyOf(5, 'Edited'), { pin, pinOnly: true })).toBe(true);
		expect(app.vault.getContent('Note.md')).toBe(`# N\n\n${closed}\n\`\`\`ds-counter\nname: Edited\ncurrent_value: 5\n\`\`\`\n`);
	});
});

// SC-549 / SC-552 (wide): the view's own debounced write is pinned too. The first click of a round (notePersistIntent) takes the pin,
// while the card is on its own block; a redraw inside the 400 ms (another block's write, an outside edit, typing) can hand the card's
// element to a twin before the write runs.
describe('SC-552: a view\'s own write is placed through the pin its round\'s first click took', () => {
	let warn: jest.SpyInstance;
	beforeEach(() => {
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => warn.mockRestore());

	/** Three twins, the host on the middle one; `handOver()` is the redraw that puts its element on the lower one (the upper written). */
	function setup() {
		const app = new App();
		const text = noteOf([5, 5, 5]);
		app.vault.setFile('Note.md', text);
		const section: Section = { current: sectionAt(text, fencesOf(text)[1]) };
		const host = new ReadingModeBlockHost(new Plugin(app) as never, document.createElement('div'), switchableCtx(section) as never, 'ds-counter');
		host.setMountedBody(bodyOf(5));
		const handOver = (): void => {
			const after = noteOf([7, 5, 5]);
			app.vault.setFile('Note.md', after);
			section.current = sectionAt(after, fencesOf(after)[2]);
		};
		return { app, section, host, handOver };
	}
	const own = { fromView: true };

	test('the first click pins: after the redraw the view\'s write still lands in the block that was clicked', async () => {
		const { app, host, handOver } = setup();
		host.notePersistIntent();
		handOver();

		expect(await host.replaceSource(bodyOf(6), own)).toBe(true);
		expect(values(app)).toEqual([7, 6, 5]);
	});

	test('a later click of the same round does not pin again (it may come after the redraw)', async () => {
		const { app, host, handOver } = setup();
		host.notePersistIntent();
		handOver();
		host.notePersistIntent(); // the second click, on the element that is now on the lower block

		expect(await host.replaceSource(bodyOf(7), own)).toBe(true);
		expect(values(app)).toEqual([7, 7, 5]);
	});

	test('the write uses the pin up: the next write, with no click before it, follows the element as it always did', async () => {
		const { app, host, handOver } = setup();
		host.notePersistIntent();
		expect(await host.replaceSource(bodyOf(5), own)).toBe(true); // the middle block; the pin is used up
		handOver();

		expect(await host.replaceSource(bodyOf(8), own)).toBe(true);
		expect(values(app)).toEqual([7, 5, 8]); // the lower block, where the element is
	});

	test('a write that is not the view\'s own (the form\'s Save) does not use the pin', async () => {
		const { app, host, handOver } = setup();
		host.notePersistIntent();
		handOver();

		expect(await host.replaceSource(bodyOf(5, 'Edited'))).toBe(true);
		expect(names(app)).toEqual(['Twin', 'Twin', 'Edited']); // follows the element, as before
	});

	test('a write that is not the view\'s own does not use up the pin either', async () => {
		const { app, host, handOver } = setup();
		host.notePersistIntent();
		handOver();
		await host.replaceSource(bodyOf(5)); // the form\'s Save of an unchanged body

		expect(await host.replaceSource(bodyOf(6), own)).toBe(true);
		expect(values(app)).toEqual([7, 6, 5]); // the pin was still there for the view\'s own write
	});
});

// SC-552 (K): what the Reading-view host offers a block edit form that wants to outlive its view.
describe('SC-552: ReadingModeBlockHost.keepFormOpenOn', () => {
	function hostWithRegistry() {
		const app = new App();
		app.vault.setFile('Note.md', noteOf([5, 5]));
		const plugin = new Plugin(app);
		const registry = new ViewRegistry({ enabled: true });
		registry.load();
		const ctx = makeFakeContext(app, 'Note.md', 0);
		const host = new ReadingModeBlockHost(plugin as never, ctx.el, ctx as never, 'ds-counter', null, registry);
		/** The panes that show a note: `shownIn(['Note.md'])` puts one pane on it, `shownIn([])` closes every pane. */
		const shownIn = (paths: string[]): void => {
			jest.spyOn(app.workspace, 'getLeavesOfType').mockReturnValue(paths.map((path) => ({ view: { file: { path } } })) as never);
		};
		return { registry, host, renderChild: ctx.addedChildren[0], shownIn };
	}

	test('the section is still there: no holder (the form closes with its view as it always did)', () => {
		const { host, renderChild, shownIn } = hostWithRegistry();
		shownIn(['Note.md']); // the note is on screen, so only the live section says no
		renderChild.load();
		expect(host.keepFormOpenOn()).toBeNull();
	});

	test('the section was thrown away, the note is still shown in a pane and the plugin is loaded: the registry', () => {
		const { host, registry, renderChild, shownIn } = hostWithRegistry();
		shownIn(['Other.md', 'Note.md']);
		renderChild.load();
		renderChild.unload();
		expect(host.keepFormOpenOn()).toBe(registry);
	});

	test('the note is no longer shown in any pane (leaf closed or navigated away): no holder, the form closes with its view', () => {
		const { host, renderChild, shownIn } = hostWithRegistry();
		shownIn(['Other.md']);
		renderChild.load();
		renderChild.unload();
		expect(host.keepFormOpenOn()).toBeNull();
	});

	test('the plugin is unloading (the registry is not loaded): no holder', () => {
		const { host, registry, renderChild, shownIn } = hostWithRegistry();
		shownIn(['Note.md']);
		renderChild.load();
		renderChild.unload();
		registry.unload();
		expect(host.keepFormOpenOn()).toBeNull();
	});

	test('a host with no registry has nothing to hold a form on', () => {
		const app = new App();
		app.vault.setFile('Note.md', noteOf([5, 5]));
		const ctx = makeFakeContext(app, 'Note.md', 0);
		const host = new ReadingModeBlockHost(new Plugin(app) as never, ctx.el, ctx as never, 'ds-counter');
		ctx.addedChildren[0].load();
		ctx.addedChildren[0].unload();
		expect(host.keepFormOpenOn()).toBeNull();
	});
});
