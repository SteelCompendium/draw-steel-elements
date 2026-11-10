// SC-552 -- a block's position pinned at one moment and a write placed through it later. A block edit form pins its block when it
// opens; Obsidian's redraw of identical blocks can then hand the form's element to a twin, and a write that follows the element
// lands in the twin. `pinPosition()` reads where the block is drawn now, `replaceSource(body, { pin })` finds that block again
// in whatever the note has become (a line diff, lineMap.ts) and writes there; a pin that cannot be placed falls back to the
// element's section as before, unless the caller asked for `pinOnly` (every block edit form's Save, SC-556; the view's own write does not).
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

	test('SC-556 control: a form on the note\'s unterminated trailing fence, lines inserted above it from outside: the pin-only Save still lands in that fence, the final newline stays', async () => {
		const app = new App();
		const closed = [...CTR(5), ''].join('\n');
		const tail = '```ds-counter\nname: Twin\ncurrent_value: 5\n'; // the last block never closes
		const text = `# N\n\n${closed}\n${tail}`;
		app.vault.setFile('Note.md', text);
		const lines = text.split('\n');
		const unterminated = lines.indexOf('```ds-counter', 5);
		const section: Section = { current: { text, lineStart: unterminated, lineEnd: lines.length - 1 } };
		const host = hostOn(app, section);
		const pin = host.pinPosition()!;

		const after = `# N\n\nINSERTED\n\n${closed}\n${tail}`; // an outside edit above both blocks
		app.vault.setFile('Note.md', after);
		section.current = { text: after, lineStart: 4, lineEnd: 7 }; // the element was handed to the closed twin
		expect(await host.replaceSource(bodyOf(5, 'Edited'), { pin, pinOnly: true })).toBe(true);
		expect(app.vault.getContent('Note.md')).toBe(`# N\n\nINSERTED\n\n${closed}\n\`\`\`ds-counter\nname: Edited\ncurrent_value: 5\n\`\`\`\n`);
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

	test('SC-556: the view\'s own write is not pin-only: a pin that cannot be placed (its block edited from outside) still falls back and writes', async () => {
		Notice.notices.length = 0;
		const { app, host, section } = setup();
		host.notePersistIntent();
		const after = noteOf([5, 9, 5]); // the clicked (middle) block was edited from outside
		app.vault.setFile('Note.md', after);
		section.current = sectionAt(after, fencesOf(after)[1]);

		expect(await host.replaceSource(bodyOf(6), own)).toBe(true); // not dropped: only a form's Save is pin-only
		expect(Notice.notices).toEqual([]);
		expect(values(app)).toContain(9); // the outside edit is still in the note
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

// SC-556: a form's Save that writes nothing always says why. The dropped-write Notice is rate limited to one per note per 5 s so that a
// burst of card writes is one message; a form Save is the user's own act and is never folded into that limit.
describe('SC-556: a dropped form Save is never silent (the rate limit is for card writes)', () => {
	let warn: jest.SpyInstance;
	beforeEach(() => {
		resetDroppedWriteNotices();
		Notice.notices.length = 0;
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => warn.mockRestore());

	/** Three twins, the host on the middle one, its block then edited from outside: both a form Save (pinned) and a card write cannot land. */
	function edited() {
		const app = new App();
		const text = noteOf([5, 5, 5]);
		app.vault.setFile('Note.md', text);
		const section: Section = { current: sectionAt(text, fencesOf(text)[1]) };
		const host = new ReadingModeBlockHost(new Plugin(app) as never, document.createElement('div'), switchableCtx(section) as never, 'ds-counter');
		host.setMountedBody(bodyOf(5));
		const pin = host.pinPosition()!;
		const after = noteOf([9, 9, 9]); // no block holds the body the host knows any more
		app.vault.setFile('Note.md', after);
		section.current = sectionAt(after, fencesOf(after)[1]);
		return { app, host, pin, after };
	}
	const save = (host: ReadingModeBlockHost, pin: { text: string; lineStart: number }) => host.replaceSource(bodyOf(5, 'Edited'), { pin, pinOnly: true });

	test('two dropped form Saves within 5 s each show the Notice, one per Save, and the note is untouched', async () => {
		const { app, host, pin, after } = edited();
		expect(await save(host, pin)).toBe(false);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
		expect(host.lastWriteReported).toBe(true); // the form adds none of its own

		expect(await save(host, pin)).toBe(false);
		expect(await save(host, pin)).toBe(false);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note'), droppedWriteMessage('Note'), droppedWriteMessage('Note')]);
		expect(app.vault.getContent('Note.md')).toBe(after);
	});

	test('a dropped card write, then a dropped form Save within 5 s: the Save still gets its Notice', async () => {
		const { host, pin } = edited();
		expect(await host.replaceSource(bodyOf(6), { fromView: true })).toBe(false);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]); // the card write's own

		expect(await save(host, pin)).toBe(false);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note'), droppedWriteMessage('Note')]);
		expect(host.lastWriteReported).toBe(true);
	});

	test('card writes keep the rate limit: a burst of dropped card writes is one Notice', async () => {
		const { host } = edited();
		for (let i = 0; i < 3; i++) expect(await host.replaceSource(bodyOf(6 + i), { fromView: true })).toBe(false);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
		expect(host.lastWriteReported).toBe(true);
	});

	test('a form Save restarts the clock: the card writes right behind it do not repeat the message', async () => {
		const { host, pin } = edited();
		expect(await save(host, pin)).toBe(false);
		expect(await host.replaceSource(bodyOf(6), { fromView: true })).toBe(false);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
	});
});

// SC-556: a block inside a heading embed (`![[note#Heading]]`) is given just that section's text, lines counted from the section's first line.
// Its pin is rebased onto the whole note when it is taken, so a form's Save (pin-only) lands however long the rest of the note is.
describe('SC-556: a block edit form in a heading embed', () => {
	let warn: jest.SpyInstance;
	beforeEach(() => {
		resetDroppedWriteNotices();
		Notice.notices.length = 0;
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => warn.mockRestore());

	const para = (n: number, tag: string): string[] => Array.from({ length: n }, (_, i) => `${tag} ${i}`);
	const SUB = ['## Tracker', '', ...CTR(5), '']; // the embedded section: what Obsidian reports as the section's text
	/** The element a block of an embed is mounted in (Obsidian wraps an embed in `.markdown-embed`). */
	const inEmbed = (): HTMLElement => {
		const embed = document.createElement('div');
		embed.className = 'internal-embed markdown-embed';
		return embed.appendChild(document.createElement('div'));
	};
	/** The source note: `above` lines, the embedded section, `below` lines; the host is on the section's block. */
	function embedded(above: string[], below: string[]) {
		const app = new App();
		const full = ['# N', '', ...above, '', ...SUB, '## After', '', ...below, 'END'].join('\n');
		app.vault.setFile('Note.md', full);
		const section: Section = { current: { text: SUB.join('\n'), lineStart: 2, lineEnd: 5 } }; // relative to the section, like Obsidian's
		const host = new ReadingModeBlockHost(new Plugin(app) as never, inEmbed(), switchableCtx(section) as never, 'ds-counter');
		host.setMountedBody(bodyOf(5));
		return { app, host, full };
	}
	const save = (host: ReadingModeBlockHost, pin: ReturnType<ReadingModeBlockHost['pinPosition']>) => host.replaceSource(bodyOf(5, 'Edited'), { pin, pinOnly: true });

	test('a long note (500 lines on each side of the section), nothing changed: Save lands in the embedded block and the rest is byte for byte', async () => {
		const { app, host, full } = embedded(para(500, 'above'), para(500, 'below'));
		const pin = host.pinPosition()!;

		expect(await save(host, pin)).toBe(true); // before the fix: false and the "changed on disk first" Notice
		expect(app.vault.getContent('Note.md')).toBe(full.replace('name: Twin', 'name: Edited'));
		expect(Notice.notices).toEqual([]);
	});

	test('an identical block outside the embedded section (above it): Save writes the embedded block, never the twin', async () => {
		const { app, host, full } = embedded([...CTR(5), '', 'x'], para(500, 'below'));
		const pin = host.pinPosition()!;

		expect(await save(host, pin)).toBe(true);
		const note = app.vault.getContent('Note.md')!;
		expect(names(app)).toEqual(['Twin', 'Edited']);
		expect(note).toBe(full.replace(/(## Tracker\n\n```ds-counter\nname: )Twin/, '$1Edited'));
	});

	test('the embedded block itself edited from outside while the form is open, an identical block outside it holding the old body: Save writes nothing', async () => {
		const { app, host } = embedded([...CTR(5), '', 'x'], para(20, 'below'));
		const pin = host.pinPosition()!;
		const outside = app.vault.getContent('Note.md')!.replace(/(## Tracker\n\n```ds-counter\nname: Twin\ncurrent_value: )5/, '$19');
		app.vault.setFile('Note.md', outside);

		expect(await save(host, pin)).toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(outside); // not written into the twin above
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
	});

	test('the embedded block deleted from outside, a long note: Save writes nothing', async () => {
		const { app, host } = embedded(para(300, 'above'), para(300, 'below'));
		const pin = host.pinPosition()!;
		const outside = app.vault.getContent('Note.md')!.replace(CTR(5).join('\n') + '\n', '');
		app.vault.setFile('Note.md', outside);

		expect(await save(host, pin)).toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(outside);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
	});

	test('an outside edit elsewhere in the source note (above and below the section) while the form is open: Save still lands in the embedded block', async () => {
		const { app, host, full } = embedded(para(100, 'above'), para(100, 'below'));
		const pin = host.pinPosition()!;
		const outside = full.replace('above 0', 'above 0, edited\nand a new line').replace('below 99', 'below 99, edited');
		app.vault.setFile('Note.md', outside);

		expect(await save(host, pin)).toBe(true);
		expect(app.vault.getContent('Note.md')).toBe(outside.replace('name: Twin', 'name: Edited'));
	});

	test('a section that appears twice in the note (identical sections) keeps its pin as it was: no rebase, no guess', async () => {
		const app = new App();
		const full = ['# N', '', ...SUB, '## After', '', ...SUB, 'END'].join('\n');
		app.vault.setFile('Note.md', full);
		const section: Section = { current: { text: SUB.join('\n'), lineStart: 2, lineEnd: 5 } };
		const host = new ReadingModeBlockHost(new Plugin(app) as never, inEmbed(), switchableCtx(section) as never, 'ds-counter');
		host.setMountedBody(bodyOf(5));
		const pin = host.pinPosition()!;
		await save(host, pin); // settles the rebase attempt

		expect(pin).toEqual({ text: SUB.join('\n'), lineStart: 2 });
	});
});

// SC-556 r6: the pin of a block in an embed is rebased by the EMBED'S OWN LINK (its `src`, resolved with Obsidian's `resolveSubpath` over
// the metadata cache), not by searching for the section's text: that text can be stale when the form opens (a + just before the pencil)
// and an identical block or section elsewhere in the note cannot be told apart by text. The cache's answer is verified against the note.
describe('SC-556 r6: an embedded block\'s pin is rebased by the embed\'s link', () => {
	let warn: jest.SpyInstance;
	beforeEach(() => {
		resetDroppedWriteNotices();
		Notice.notices.length = 0;
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => warn.mockRestore());

	const para = (n: number, tag: string): string[] => Array.from({ length: n }, (_, i) => `${tag} ${i}`);
	const pos = (line: number) => ({ start: { line, col: 0, offset: 0 }, end: { line, col: 0, offset: 0 } });
	/** What Obsidian's metadata cache holds for `text`: its headings, and its `^id` blocks (the id on its own line under the block). */
	function cacheOf(text: string) {
		const lines = text.split('\n');
		const headings: Array<{ heading: string; level: number; position: unknown }> = [];
		const blocks: Record<string, { id: string; position: unknown }> = {};
		let fenced = false;
		lines.forEach((l, i) => {
			if (/^```/.test(l)) fenced = !fenced;
			const h = !fenced && /^(#{1,6})\s+(.*)$/.exec(l);
			if (h) headings.push({ heading: h[2], level: h[1].length, position: pos(i) });
			const id = /^\^(\w+)$/.exec(l);
			if (id) {
				let end = i - 1;
				while (end >= 0 && lines[end] === '') end--;
				let start = end;
				if (lines[end] === '```') for (start = end - 1; start >= 0 && !/^```\w/.test(lines[start]); start--);
				blocks[id[1]] = { id: id[1], position: pos(start) };
			}
		});
		return { headings, blocks };
	}
	const embedEl = (src: string): HTMLElement => {
		const embed = document.createElement('div');
		embed.className = 'internal-embed markdown-embed';
		embed.setAttribute('src', src);
		return embed.appendChild(document.createElement('div'));
	};
	/** The host of the block `section` describes (relative to the embedded part), in an embed with link `src`; the metadata cache answers for the note as it is now. */
	function embedded(full: string, section: { text: string; lineStart: number; lineEnd: number }, src: string, body = bodyOf(5), cacheText: string | object = full, el: HTMLElement = embedEl(src)) {
		const app = new App();
		app.vault.setFile('Note.md', full);
		jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => (typeof cacheText === 'string' ? cacheOf(cacheText) : cacheText) as never);
		const sec: Section = { current: section };
		const host = new ReadingModeBlockHost(new Plugin(app) as never, el, switchableCtx(sec) as never, 'ds-counter');
		host.setMountedBody(body);
		return { app, host };
	}
	const save = (host: ReadingModeBlockHost, pin: ReturnType<ReadingModeBlockHost['pinPosition']>, body = bodyOf(5, 'Edited')) => host.replaceSource(body, { pin, pinOnly: true });
	const SUB = ['## Tracker', '', ...CTR(5), ''];
	const part = (lines: string[], lineStart: number) => ({ text: lines.join('\n'), lineStart, lineEnd: lineStart + 3 });

	test('+ then the pencil: the section text is stale (old value) when the form opens, a long note: Save lands in the embedded block', async () => {
		const live = ['## Tracker', '', ...CTR(6), ''];
		const full = ['# N', '', ...para(500, 'above'), '', ...live, '## After', '', ...para(500, 'below'), 'END'].join('\n');
		const { app, host } = embedded(full, part(SUB, 2), 'Note#Tracker', bodyOf(6)); // Obsidian still reports the section with value 5; the host wrote 6
		const pin = host.pinPosition()!;

		expect(await save(host, pin, bodyOf(6, 'Edited'))).toBe(true); // before: the section text was not found, the partial pin was refused
		expect(app.vault.getContent('Note.md')).toBe(full.replace('name: Twin', 'name: Edited'));
		expect(Notice.notices).toEqual([]);
	});

	test.each([
		['a short note', 3],
		['a long note', 400],
	])('a block embed (![[note#^id]]) of the lower of two identical blocks, %s: Save writes the embedded block, never the other', async (_name, filler) => {
		const full = ['# N', '', ...CTR(5), '', ...para(filler, 'between'), '', ...CTR(5), '^blk', '', ...para(filler, 'below'), 'END'].join('\n');
		const second = full.split('\n').lastIndexOf('```ds-counter');
		const { app, host } = embedded(full, { text: CTR(5).join('\n'), lineStart: 0, lineEnd: 3 }, 'Note#^blk');
		const pin = host.pinPosition()!;

		expect(await save(host, pin)).toBe(true);
		expect(names(app)).toEqual(['Twin', 'Edited']);
		expect(app.vault.getContent('Note.md')).toBe(full.split('\n').map((l, i) => (i === second + 1 ? 'name: Edited' : l)).join('\n'));
	});

	test('a heading embed of a note with two identical sections: Save writes the section Obsidian embeds (the first heading of that name)', async () => {
		const full = ['# N', '', ...para(300, 'above'), '', ...SUB, '## After', '', ...para(300, 'mid'), '', ...SUB, '## End', ...para(300, 'below')].join('\n');
		const { app, host } = embedded(full, part(SUB, 2), 'Note#Tracker');
		const pin = host.pinPosition()!;

		expect(await save(host, pin)).toBe(true);
		expect(names(app)).toEqual(['Edited', 'Twin']);
	});

	test('a cache that lags the note (its position verifies nothing): the pin is not taken from it, and nothing is written into the identical block it points at', async () => {
		// the note now has two lines more above the section than the cache knows; the cache's heading line is where the TWIN's heading-less block sits
		const twin = ['## Other', '', ...CTR(5), ''];
		const now = ['# N', '', 'inserted 1', 'inserted 2', ...twin, ...SUB, '## After', '', 'tail'].join('\n');
		const before = ['# N', '', ...twin, ...SUB, '## After', '', 'tail'].join('\n'); // what the cache was built from
		const { app, host } = embedded(now, part(SUB, 2), 'Note#Tracker', bodyOf(5), before);
		const pin = host.pinPosition()!;

		expect(await save(host, pin)).toBe(true); // the text search (one run) places it: the embedded block, not the twin
		expect(names(app)).toEqual(['Twin', 'Edited']);
	});

	test('a cache whose heading line is a line that is NOT the heading (it points at the identical block above the section): not taken, the text search places the pin, the twin is not written', async () => {
		const twin = ['## Other', '', ...CTR(5), ''];
		const full = ['# N', '', ...twin, ...SUB, '## After', '', 'tail'].join('\n');
		// "Tracker" is said to start on the twin's heading line, so that its line + 2 is the twin's fence
		const lagging = { headings: [{ heading: 'Tracker', level: 2, position: pos(2) }], blocks: {} };
		const { app, host } = embedded(full, part(SUB, 2), 'Note#Tracker', bodyOf(5), lagging);
		const pin = host.pinPosition()!;

		expect(await save(host, pin)).toBe(true);
		expect(names(app)).toEqual(['Twin', 'Edited']);
	});

	test('the block at the cache\'s position holds another body than the host knows: the pin is not rebased', async () => {
		const full = ['# N', '', ...para(500, 'above'), '', '## Tracker', '', ...CTR(9), '', '## After', ...para(500, 'below')].join('\n');
		const { app, host } = embedded(full, part(SUB, 2), 'Note#Tracker');
		const pin = host.pinPosition()!;

		expect(await save(host, pin)).toBe(false); // the block was changed from outside before the form opened: nothing to place the write on
		expect(pin).toEqual({ text: SUB.join('\n'), lineStart: 2 });
		expect(app.vault.getContent('Note.md')).toBe(full);
	});

	test('a cache that lags AND a section text that is stale, a long note: the pin stays as it was, Save is refused and nothing is written', async () => {
		const live = ['## Tracker', '', ...CTR(6), ''];
		const now = ['# N', '', 'inserted', ...para(500, 'above'), '', ...CTR(5), '', ...live, '## After', ...para(500, 'below')].join('\n');
		const before = ['# N', '', ...para(500, 'above'), '', ...CTR(5), '', ...live, '## After', ...para(500, 'below')].join('\n');
		const { app, host } = embedded(now, part(SUB, 2), 'Note#Tracker', bodyOf(6), before);
		const pin = host.pinPosition()!;

		expect(await save(host, pin, bodyOf(6, 'Edited'))).toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(now);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
	});

	test.each([
		['no src on the embed', (): HTMLElement => { const e = embedEl('x'); e.parentElement!.removeAttribute('src'); return e; }],
		['a link without a subpath', () => embedEl('Note')],
		['a link to another note', () => embedEl('Elsewhere#Tracker')],
		['a subpath that does not resolve', () => embedEl('Note#Nope')],
	])('%s: the text search places the pin (one run), as before', async (_name, el) => {
		const full = ['# N', '', ...para(500, 'above'), '', ...SUB, '## After', '', ...para(500, 'below'), 'END'].join('\n');
		const { app, host } = embedded(full, part(SUB, 2), 'Note#Tracker', bodyOf(5), full, el());
		const pin = host.pinPosition()!;

		expect(await save(host, pin)).toBe(true);
		expect(app.vault.getContent('Note.md')).toBe(full.replace('name: Twin', 'name: Edited'));
	});

	test('no metadata cache for the note: the text search places the pin', async () => {
		const full = ['# N', '', ...para(500, 'above'), '', ...SUB, '## After', '', ...para(500, 'below'), 'END'].join('\n');
		const { app, host } = embedded(full, part(SUB, 2), 'Note#Tracker');
		jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => null);
		const pin = host.pinPosition()!;

		expect(await save(host, pin)).toBe(true);
		expect(app.vault.getContent('Note.md')).toBe(full.replace('name: Twin', 'name: Edited'));
	});

	test('the text search drops the part\'s own trailing blank lines (Obsidian can report more of them than the note has)', async () => {
		// the embedded section is the last of the note: its reported text ends with two blank lines the file does not have
		const full = ['# N', '', ...para(500, 'above'), '', '## Tracker', '', ...CTR(5)].join('\n') + '\n';
		const app = new App();
		app.vault.setFile('Note.md', full);
		const text = ['## Tracker', '', ...CTR(5), '', ''].join('\n');
		const sec: Section = { current: { text, lineStart: 2, lineEnd: 5 } };
		const el = document.createElement('div');
		el.className = 'internal-embed markdown-embed';
		const host = new ReadingModeBlockHost(new Plugin(app) as never, el.appendChild(document.createElement('div')), switchableCtx(sec) as never, 'ds-counter');
		host.setMountedBody(bodyOf(5));
		const pin = host.pinPosition()!;

		expect(await save(host, pin)).toBe(true);
		expect(app.vault.getContent('Note.md')).toBe(full.replace('name: Twin', 'name: Edited'));
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
