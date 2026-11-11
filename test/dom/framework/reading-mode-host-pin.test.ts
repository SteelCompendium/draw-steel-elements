// SC-552 -- a block's position pinned at one moment and a write placed through it later. A block edit form pins its block when it
// opens; Obsidian's redraw of identical blocks can then hand the form's element to a twin, and a write that follows the element
// lands in the twin. `pinPosition()` reads where the block is drawn now, `replaceSource(body, { pin })` finds that block again
// in whatever the note has become (a line diff, lineMap.ts) and writes there; a pin that cannot be placed falls back to the
// element's section as before, unless the caller asked for `pinOnly` (every block edit form's Save, SC-556; the view's own write does not)
// or the block has an identical twin (SC-480: nothing is written, the dropped-write Notice shows).
import { ReadingModeBlockHost, countByBody } from '../../../src/framework/host/ReadingModeBlockHost';
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

	test('SC-480: a pin that cannot be placed, with identical twins in the note: nothing is written (the dropped-write Notice), not the element\'s section', async () => {
		const { app, host } = triplet();
		const before = app.vault.getContent('Note.md')!;
		const stale = { text: before, lineStart: 0 }; // line 0 is the heading, not a fence

		expect(await host.replaceSource(bodyOf(5, 'Edited'), { pin: stale })).toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(before);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
		expect(host.lastWriteReported).toBe(true);
	});

	test('a pin that cannot be placed, no twin anywhere: falls back to the element\'s section, no new refusal, the write lands', async () => {
		const app = new App();
		const text = noteOf([5]);
		app.vault.setFile('Note.md', text);
		const host = hostOn(app, { current: sectionAt(text, fencesOf(text)[0]) });
		const stale = { text, lineStart: 0 };

		expect(await host.replaceSource(bodyOf(5, 'Edited'), { pin: stale })).toBe(true);
		expect(names(app)).toEqual(['Edited']);
		expect(host.lastWriteReported).toBe(false);
		expect(Notice.notices).toEqual([]);
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

	test('SC-556 / SC-480: the view\'s own write is not pin-only, but a pin that cannot be placed (its block edited from outside) with identical twins in the note writes nothing', async () => {
		Notice.notices.length = 0;
		resetDroppedWriteNotices();
		const { app, host, section } = setup();
		host.notePersistIntent();
		const after = noteOf([5, 9, 5]); // the clicked (middle) block was edited from outside
		app.vault.setFile('Note.md', after);
		section.current = sectionAt(after, fencesOf(after)[1]);

		expect(await host.replaceSource(bodyOf(6), own)).toBe(false); // twins: the pin was the only identity (before SC-480 the write landed in a twin)
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
		expect(app.vault.getContent('Note.md')).toBe(after); // the outside edit is kept, nothing else touched
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

// SC-480: a card write whose pin cannot be placed (its block was deleted or edited, or the note changed too much to map) falls back to
// today's placement only when its block's body was unique in the note as clicked (pin.text) and is unique now. With an identical twin the
// pin was the only identity: nothing is written and the dropped-write Notice shows, never a click landing in a block the user never touched.
describe('SC-480: a card write whose pin misses is never written into an identical twin', () => {
	let warn: jest.SpyInstance;
	beforeEach(() => {
		resetDroppedWriteNotices();
		Notice.notices.length = 0;
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => warn.mockRestore());
	const own = { fromView: true };

	/** A note of counters, one per value (null = no block there), each after its own prose line (P0, P1, ...: twins are never told apart by blank lines only). */
	const build = (blocks: (number | null)[], above: string[] = [], below: string[] = []): string =>
		['# N', '', ...above, ...blocks.flatMap((v, i) => [`P${i}`, '', ...(v === null ? [] : [...CTR(v), ''])]), ...below, 'END'].join('\n');
	/** The host sits on block `at` of `blocks`, clicked (the round's pin taken); then the note becomes `after` and the element's section is `sectionOf(after)`. */
	function clicked(blocks: (number | null)[], at: number, after: string, sectionOf: (text: string) => Section['current'], opts: { above?: string[]; below?: string[] } = {}) {
		const app = new App();
		const text = build(blocks, opts.above, opts.below);
		app.vault.setFile('Note.md', text);
		const section: Section = { current: sectionAt(text, fencesOf(text)[at]) };
		const host = new ReadingModeBlockHost(new Plugin(app) as never, document.createElement('div'), switchableCtx(section) as never, 'ds-counter');
		host.setMountedBody(bodyOf(blocks[at]!));
		host.notePersistIntent();
		app.vault.setFile('Note.md', after);
		section.current = sectionOf(after);
		return { app, host, section, after };
	}

	test.each([
		['above', 2, [5, 5, null], 1], // the lowest of three deleted: the element is handed to the twin just above it
		['below', 0, [null, 5, 5], 0], // the highest of three deleted: the element is handed to the twin just below it
	])('the clicked block deleted, its twins %s it (the element handed to a twin): nothing is written, one Notice, the note is untouched', async (_where, at, afterBlocks, handedTo) => {
		const after = build(afterBlocks as (number | null)[]);
		const { app, host } = clicked([5, 5, 5], at, after, (t) => sectionAt(t, fencesOf(t)[handedTo]));

		expect(await host.replaceSource(bodyOf(6), own)).toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(after);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
		expect(host.lastWriteReported).toBe(true);
	});

	test('the clicked block deleted, the element has no section any more (the body search): nothing is written', async () => {
		const after = build([5, 5, null]);
		const { app, host } = clicked([5, 5, 5], 2, after, () => null);

		expect(await host.replaceSource(bodyOf(6), own)).toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(after);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
	});

	test('two identical blocks, one deleted: the twin was there when the block was clicked (pin.text), though the body is unique now: nothing is written', async () => {
		const after = build([5, null]);
		const { app, host } = clicked([5, 5], 1, after, (t) => sectionAt(t, fencesOf(t)[0]));
		expect(countByBody(after, 'ds-counter', bodyOf(5))).toBe(1);

		expect(await host.replaceSource(bodyOf(6), own)).toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(after);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
	});

	test('a unique block whose body now appears twice (an outside edit pasted copies): the twin is there now, nothing is written', async () => {
		const after = build([7, null, 7]); // the clicked block (7, unique when clicked) is gone; two others now hold 7
		const { app, host } = clicked([5, 7, 5], 1, after, (t) => sectionAt(t, fencesOf(t)[0]));

		expect(await host.replaceSource(bodyOf(8), own)).toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(after);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
	});

	test('the clicked block deleted, no twin anywhere: one Notice, the note is untouched (as before)', async () => {
		const after = build([null, 7]);
		const { app, host } = clicked([5, 7], 0, after, (t) => sectionAt(t, fencesOf(t)[0]));

		expect(await host.replaceSource(bodyOf(6), own)).toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(after);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
	});

	const lines = (n: number, tag: string): string[] => Array.from({ length: n }, (_, i) => `${tag} ${i}`);
	// more than LINE_MAP_MAX_EDITS (400) lines changed on both sides of the block: the pin cannot be mapped
	const longAround = (blocks: (number | null)[], tagA: string, tagB: string): string => build(blocks, lines(210, tagA), lines(210, tagB));

	test('no twin, the note changed by more than 400 lines around the block while the write waited: the pin misses and the write still lands (as before)', async () => {
		const after = longAround([5], 'c', 'd');
		const { app, host } = clicked([5], 0, after, (t) => sectionAt(t, fencesOf(t)[0]), { above: lines(210, 'a'), below: lines(210, 'b') });

		expect(await host.replaceSource(bodyOf(6), own)).toBe(true);
		expect(values(app)).toEqual([6]);
		expect(Notice.notices).toEqual([]);
	});

	test('the same long change with an identical twin above the block: refused (the pin was the only identity)', async () => {
		const after = longAround([5, 5], 'c', 'd');
		const { app, host } = clicked([5, 5], 1, after, (t) => sectionAt(t, fencesOf(t)[1]), { above: lines(210, 'a'), below: lines(210, 'b') });

		expect(await host.replaceSource(bodyOf(6), own)).toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(after);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
	});

	test('a card write that carries no pin (its block had no section at the click) keeps today\'s placement, twins or not', async () => {
		const app = new App();
		const text = build([5, 5, 5]);
		app.vault.setFile('Note.md', text);
		const section: Section = { current: null }; // no section when the round's first click comes
		const host = new ReadingModeBlockHost(new Plugin(app) as never, document.createElement('div'), switchableCtx(section) as never, 'ds-counter');
		host.setMountedBody(bodyOf(5));
		host.notePersistIntent(); // pinPosition() is null: nothing to pin
		section.current = sectionAt(text, fencesOf(text)[1]);

		expect(await host.replaceSource(bodyOf(6), own)).toBe(true);
		expect(values(app)).toEqual([5, 6, 5]);
		expect(Notice.notices).toEqual([]);
	});

	test('one outside edit deletes the clicked block AND makes its neighbour read the same (no twin before or after): the fallback would land in the neighbour, so nothing is written', async () => {
		const after = build([5, null]); // the clicked block (5) is gone; the block above it (was 4) now reads 5
		const { app, host } = clicked([4, 5], 1, after, (t) => sectionAt(t, fencesOf(t)[0]));

		expect(await host.replaceSource(bodyOf(6), own)).toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(after);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
	});

	test('a no-twin block cut and pasted elsewhere in the note while the write waited: the fallback finds it in its new place and the write lands', async () => {
		const after = build([4, null]).replace('END', `${CTR(5).join('\n')}\n\nEND`);
		const { app, host } = clicked([4, 5], 1, after, (t) => sectionAt(t, fencesOf(t)[1]));

		expect(await host.replaceSource(bodyOf(6), own)).toBe(true);
		expect(values(app)).toEqual([4, 6]);
		expect(Notice.notices).toEqual([]);
	});

	// SC-480 r6: no identical block anywhere, the clicked block (X) only changes place with another block: the diff pairs identical fence lines,
	// so X's fence can map back onto the neighbour's old line. The click must still land in X.
	const SOLO = (v: number): string[] => CTR(v, 'Solo');
	const raw = (...parts: string[][]): string => ['# N', '', ...parts.flatMap((b) => [...b, '']), 'END'].join('\n');
	/** X (`Solo`, 5) clicked in `before`; the note becomes `after`; the element's section is X's new place or none (the body search). */
	function movedSolo(before: string, after: string) {
		const app = new App();
		app.vault.setFile('Note.md', before);
		const at = before.split('\n').indexOf('name: Solo') - 1;
		const section: Section = { current: sectionAt(before, at) };
		const host = new ReadingModeBlockHost(new Plugin(app) as never, document.createElement('div'), switchableCtx(section) as never, 'ds-counter');
		host.setMountedBody(bodyOf(5, 'Solo'));
		host.notePersistIntent();
		app.vault.setFile('Note.md', after);
		return { app, host, section };
	}
	const soloValue = (app: App): number => Number(/name: Solo\ncurrent_value: (\d+)/.exec(app.vault.getContent('Note.md')!)![1]);

	test.each(['its new place', 'no section (the body search)'])('X swaps places with a different block, no twin (%s): the click lands in X', async (mode) => {
		const before = raw(SOLO(5), ['MID'], CTR(3, 'Zed'));
		const after = raw(CTR(3, 'Zed'), ['MID'], SOLO(5));
		const { app, host, section } = movedSolo(before, after);
		section.current = mode === 'its new place' ? sectionAt(after, after.split('\n').indexOf('name: Solo') - 1) : null;

		expect(await host.replaceSource(bodyOf(6, 'Solo'), own)).toBe(true);
		expect(soloValue(app)).toBe(6);
		expect(Notice.notices).toEqual([]);
	});

	test.each(['its new place', 'no section (the body search)'])('X moves from last to first of three different blocks (%s): the click lands in X', async (mode) => {
		const before = raw(CTR(1, 'Aa'), CTR(2, 'Bb'), SOLO(5));
		const after = raw(SOLO(5), CTR(1, 'Aa'), CTR(2, 'Bb'));
		const { app, host, section } = movedSolo(before, after);
		section.current = mode === 'its new place' ? sectionAt(after, after.split('\n').indexOf('name: Solo') - 1) : null;

		expect(await host.replaceSource(bodyOf(6, 'Solo'), own)).toBe(true);
		expect(soloValue(app)).toBe(6);
		expect(Notice.notices).toEqual([]);
	});

	test('X moved into the place of a block the same edit deleted: the text is the same as "X deleted, the neighbour rewritten to match", so the click is refused (by design)', async () => {
		const before = raw(CTR(3, 'Zed'), ['P'], SOLO(5));
		const after = raw(SOLO(5), ['P']);
		const { app, host, section } = movedSolo(before, after);
		section.current = sectionAt(after, after.split('\n').indexOf('name: Solo') - 1);

		expect(await host.replaceSource(bodyOf(6, 'Solo'), own)).toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(after);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
	});

	test('the bumped neighbour with a paragraph inserted above it (the map back and the map forward disagree): still refused', async () => {
		const after = build([5, null], ['ONE MORE LINE', '']); // the clicked block (5) deleted, the block above (was 4) now reads 5 and sits two lines lower
		const { app, host } = clicked([4, 5], 1, after, (t) => sectionAt(t, fencesOf(t)[0]));

		expect(await host.replaceSource(bodyOf(6), own)).toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(after);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
	});

	test('a pin that places still writes there with identical twins around (the race: the note moved the block, nothing was deleted)', async () => {
		const after = build([5, 5, 5], ['NEW', '']);
		const { app, host } = clicked([5, 5, 5], 1, after, (t) => sectionAt(t, fencesOf(t)[2])); // the element was handed to the lower twin

		expect(await host.replaceSource(bodyOf(6), own)).toBe(true);
		expect(values(app)).toEqual([5, 6, 5]);
		expect(Notice.notices).toEqual([]);
	});
});

describe('SC-480: countByBody counts the blocks locateByBody searches', () => {
	const blk = (n: number, lang = 'ds-counter'): string => ['```' + lang, `name: Twin`, `current_value: ${n}`, '```'].join('\n');
	test('closed blocks of the language holding the body (the language and the body both count)', () => {
		const text = [blk(5), 'x', blk(5), 'x', blk(6), 'x', blk(5, 'ds-stamina')].join('\n');
		expect(countByBody(text, 'ds-counter', bodyOf(5))).toBe(2);
		expect(countByBody(text, 'ds-counter', bodyOf(6))).toBe(1);
		expect(countByBody(text, 'ds-counter', bodyOf(9))).toBe(0);
	});

	test('the note\'s trailing fence that never closes counts, quoted blocks and CRLF notes too', () => {
		const open = ['```ds-counter', 'name: Twin', 'current_value: 5', ''].join('\n');
		expect(countByBody([blk(5), 'x', open].join('\n'), 'ds-counter', bodyOf(5))).toBe(2);
		const quoted = blk(5).split('\n').map((l) => `> ${l}`).join('\n');
		expect(countByBody([quoted, 'x', blk(5)].join('\n'), 'ds-counter', bodyOf(5))).toBe(2);
		expect(countByBody([blk(5), 'x', blk(5)].join('\r\n'), 'ds-counter', bodyOf(5))).toBe(2);
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

	test('a cache that lags AND a section text that is stale, a long note (+ then the pencil): the pin is placed by the only block with the known body, Save lands in it (SC-584; before, it was refused)', async () => {
		const live = ['## Tracker', '', ...CTR(6), ''];
		const now = ['# N', '', 'inserted', ...para(500, 'above'), '', ...CTR(5), '', ...live, '## After', ...para(500, 'below')].join('\n');
		const before = ['# N', '', ...para(500, 'above'), '', ...CTR(5), '', ...live, '## After', ...para(500, 'below')].join('\n');
		const { app, host } = embedded(now, part(SUB, 2), 'Note#Tracker', bodyOf(6), before);
		const pin = host.pinPosition()!;

		expect(await save(host, pin, bodyOf(6, 'Edited'))).toBe(true);
		expect(app.vault.getContent('Note.md')).toBe(now.replace(/(## Tracker\n\n```ds-counter\nname: )Twin/, '$1Edited'));
		expect(names(app)).toEqual(['Twin', 'Edited']); // the identical-looking block above (value 5) is untouched
		expect(Notice.notices).toEqual([]);
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

	/** A hover preview of a block or heading link: Obsidian draws the card under `.popover.hover-popover > .markdown-embed`, which has no `src`. */
	const hoverEl = (): HTMLElement => {
		const popover = document.createElement('div');
		popover.className = 'popover hover-popover';
		const embed = popover.appendChild(document.createElement('div'));
		embed.className = 'markdown-embed';
		return embed.appendChild(document.createElement('div'));
	};
	const BLK = (extra = ''): string[] => [...CTR(5), `^blk${extra}`];

	test.each([
		['a short note', 3],
		['a long note', 300],
	])('a cache that lags the note, so its ^blk line is now an identical block\'s fence (%s): the marker is not there, nothing verifies, Save writes nothing', async (_name, filler) => {
		// the cache was built before 7 lines were inserted above the twin: its `blk` is at line 9, which is now the TWIN's fence
		const full = ['# N', '', ...para(7, 'ins'), ...CTR(5), '', 'p', '', ...BLK(), '', ...para(filler, 'below'), 'END'].join('\n');
		const lagging = { headings: [], blocks: { blk: { id: 'blk', position: pos(9) } } };
		const { app, host } = embedded(full, { text: CTR(5).join('\n'), lineStart: 0, lineEnd: 3 }, 'Note#^blk', bodyOf(5), lagging);
		const pin = host.pinPosition()!;

		expect(await save(host, pin)).toBe(false); // before: the position verified on the twin and the twin was written
		expect(app.vault.getContent('Note.md')).toBe(full);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
	});

	test('a hover preview (no src) of a block link, an identical block above it in a short note: the text is not unique, so nothing can place the pin: Save writes nothing, never the block above', async () => {
		const full = ['# N', '', ...CTR(5), '', 'p', '', ...BLK(), '', 'END'].join('\n');
		const { app, host } = embedded(full, { text: CTR(5).join('\n'), lineStart: 0, lineEnd: 3 }, 'x', bodyOf(5), full, hoverEl());
		const pin = host.pinPosition()!;

		expect(await save(host, pin)).toBe(false); // before: the partial pin was mapped against the note and landed on the block above
		expect(app.vault.getContent('Note.md')).toBe(full);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
	});

	test('a hover preview (no src) of a block whose text is unique in the note: the text search places the pin and Save lands', async () => {
		const other = ['```ds-counter', 'name: Other', 'current_value: 1', 'max_value: 20', 'min_value: 0', '```'];
		const full = ['# N', '', ...other, '', 'p', '', ...BLK(), '', 'END'].join('\n');
		const { app, host } = embedded(full, { text: CTR(5).join('\n'), lineStart: 0, lineEnd: 3 }, 'x', bodyOf(5), full, hoverEl());
		const pin = host.pinPosition()!;

		expect(await save(host, pin)).toBe(true);
		expect(names(app)).toEqual(['Other', 'Edited']);
	});

	test('a heading embed whose block was edited from outside BEFORE the form opened, while the embed still shows the old section, a twin above holding the old body: Save writes nothing', async () => {
		const disk = ['# N', '', ...CTR(5), '', 'x', '', '## Tracker', '', ...CTR(9), '', '## After', '', 'END'].join('\n');
		const { app, host } = embedded(disk, part(SUB, 2), 'Note#Tracker');
		const pin = host.pinPosition()!;

		expect(await save(host, pin)).toBe(false); // before: the partial pin was mapped against the note and the twin above was written
		expect(app.vault.getContent('Note.md')).toBe(disk);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
	});

	test('an embed of a WHOLE note (a link with no #) is not a part: its pin is the note\'s own, so Save lands even when the note changed since it was drawn', async () => {
		const drawn = ['# N', '', ...CTR(5), '', 'END'].join('\n');
		const now = ['# N', 'inserted', '', ...CTR(5), '', 'END'].join('\n');
		const { app, host } = embedded(now, { text: drawn, lineStart: 2, lineEnd: 5 }, 'Note');
		const pin = host.pinPosition()!;

		expect(await save(host, pin)).toBe(true);
		expect(app.vault.getContent('Note.md')).toBe(now.replace('name: Twin', 'name: Edited'));
	});

	test('a link that resolves to ANOTHER note is not used, even when this note has a section that would verify (two identical sections: the text cannot decide): Save writes nothing', async () => {
		const full = ['# N', '', ...SUB, '## After', '', 'mid', '', ...SUB, '## End'].join('\n');
		const { app, host } = embedded(full, part(SUB, 2), 'Other#Tracker');
		app.vault.setFile('Other.md', '# Other');
		const pin = host.pinPosition()!;

		expect(await save(host, pin)).toBe(false); // the link names Other.md: with this note's cache it would have verified on the FIRST section
		expect(app.vault.getContent('Note.md')).toBe(full);
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

	// SC-584 case 1: a hover preview (no `src`) opened right after a + on its card. The + is on disk (value 6, the host knows that body) but the
	// section text Obsidian reports is still the old one (5), so neither the link nor the text search can place the pin. It is placed by the
	// block's body only when exactly one block of the note holds it WHEN THE FORM OPENS, and then it is an ordinary pin of the note.
	describe('SC-584: a hover preview or an embed whose pin only the known body can place', () => {
		const settle = () => new Promise((resolve) => setTimeout(resolve, 25)); // the open-time note read (one cachedRead) is done
		const NOTE = (n: number, mid: string[] = []): string[] => ['# N', '', 'TOP', '', ...CTR(n), '', ...mid, 'END'];
		/** The hover preview's host on the counter at line 4 of `full`: the note holds 6 (the + landed), the section Obsidian reports still says 5. */
		function hover(full: string, fence = 4, known = bodyOf(6)) {
			const stale = full.replace(/current_value: 6/, 'current_value: 5');
			return embedded(full, { text: stale, lineStart: fence, lineEnd: fence + 3 }, 'x', known, full, hoverEl());
		}
		const edited = (full: string): string => full.replace('name: Twin', 'name: Edited');

		test('the + landed, the section text is stale, the block is the only one with that body: Save lands in it (a short note)', async () => {
			const full = NOTE(6).join('\n');
			const { app, host } = hover(full);
			const pin = host.pinPosition()!;

			expect(await save(host, pin, bodyOf(6, 'Edited'))).toBe(true); // before: the pin stayed partial and every Save was refused
			expect(app.vault.getContent('Note.md')).toBe(edited(full));
			expect(Notice.notices).toEqual([]);
		});

		test('the same with a long note and a heading hover: the section is the part, the block is the only one with that body', async () => {
			const full = ['# N', '', ...para(300, 'above'), '', '## Tracker', '', ...CTR(6), '', '## After', '', ...para(300, 'below')].join('\n');
			const lines = full.split('\n');
			const head = lines.indexOf('## Tracker');
			const section = { text: ['## Tracker', '', ...CTR(5), ''].join('\n'), lineStart: 2, lineEnd: 5 };
			const { app, host } = embedded(full, section, 'x', bodyOf(6), full, hoverEl());
			expect(head).toBeGreaterThan(300);
			const pin = host.pinPosition()!;

			expect(await save(host, pin, bodyOf(6, 'Edited'))).toBe(true);
			expect(app.vault.getContent('Note.md')).toBe(edited(full));
		});

		test('another block of the note holds the same body when the form opens: nothing places the pin, Save writes nothing', async () => {
			const full = ['# N', '', 'TOP', '', ...CTR(6), '', 'p', '', ...CTR(6), '', 'END'].join('\n');
			const { app, host } = hover(full, 11); // the lower one
			const pin = host.pinPosition()!;

			expect(await save(host, pin, bodyOf(6, 'Edited'))).toBe(false);
			expect(app.vault.getContent('Note.md')).toBe(full);
			expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
		});

		test('the form\'s own block is edited from outside after it opened and the twin that is left is the only block with the old body: Save writes nothing, never the twin (the SC-556 hazard)', async () => {
			const full = NOTE(6).join('\n');
			const { app, host } = hover(full);
			const pin = host.pinPosition()!;
			await settle();
			// one outside edit: the block the form is on gets another value, and a block with the old body appears further down
			const outside = ['# N', '', 'TOP', '', ...CTR(9), '', 'p', '', ...CTR(6), '', 'END'].join('\n');
			app.vault.setFile('Note.md', outside);

			expect(await save(host, pin, bodyOf(6, 'Edited'))).toBe(false); // a search for the body at Save time would write the block at the bottom
			expect(app.vault.getContent('Note.md')).toBe(outside);
			expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
		});

		test('an identical block is added to the note after the form opened: Save still lands in the block the form was opened on', async () => {
			const full = NOTE(6).join('\n');
			const { app, host } = hover(full);
			const pin = host.pinPosition()!;
			await settle();
			const outside = ['# N', '', 'TOP', '', ...CTR(6), '', 'p', '', ...CTR(6), '', 'END'].join('\n');
			app.vault.setFile('Note.md', outside);

			expect(await save(host, pin, bodyOf(6, 'Edited'))).toBe(true); // a count at Save time would see two blocks and refuse
			expect(names(app)).toEqual(['Edited', 'Twin']);
			expect(app.vault.getContent('Note.md')).toBe(edited(outside));
		});

		test('the form\'s own block was edited from outside BEFORE it opened (the preview still shows the old text), a twin holding the old body: nothing places the pin, Save writes nothing', async () => {
			// the preview's text says "5, then the block" at lines 4-7; the note has 9 there and an identical block with the old body further down
			const disk = ['# N', '', 'TOP', '', ...CTR(9), '', 'p', '', ...CTR(5), '', 'END'].join('\n');
			const { app, host } = embedded(disk, { text: NOTE(5).join('\n'), lineStart: 4, lineEnd: 7 }, 'x', bodyOf(5), disk, hoverEl());
			const pin = host.pinPosition()!;

			expect(await save(host, pin, bodyOf(5, 'Edited'))).toBe(false); // the block's body is unique in the note, but not where the preview drew it
			expect(app.vault.getContent('Note.md')).toBe(disk);
			expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
		});

		test('a card write (not a form Save) with a partial pin and a twin in the note is refused as before: the rule is for a form\'s open', async () => {
			const full = ['# N', '', 'TOP', '', ...CTR(6), '', 'p', '', ...CTR(6), '', 'END'].join('\n');
			const { app, host } = hover(full, 11);
			const pin = host.pinPosition()!;

			expect(await host.replaceSource(bodyOf(7), { pin, fromView: true })).toBe(false);
			expect(app.vault.getContent('Note.md')).toBe(full);
			expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
		});
	});

	// SC-584 case 2: a block embed (`![[note#^id]]`) of a CALLOUT. The id names the callout, so its line follows the callout's last line, not the
	// counter's closing fence (the callout has more text after the counter).
	describe('SC-584: a block embed of a callout that holds the counter', () => {
		const CAL = (n: number): string[] => ['> [!note] Camp', ...CTR(n).map((l) => `> ${l}`), '> after text'];
		const noteWith = (marker: string[]): string[] => ['# N', '', 'TOP', '', ...CAL(5), '', 'mid', '', ...CAL(5), '', ...marker, '', 'END'];
		const calCache = (start: number) => ({ headings: [], blocks: { cal: { id: 'cal', position: { start: { line: start, col: 0, offset: 0 }, end: { line: start + 5, col: 12, offset: 0 } } } } });
		const section = { text: CAL(5).join('\n'), lineStart: 0, lineEnd: 5 }; // Reading view: the whole callout, the fence is inside it
		const lowerOf = (full: string): number => full.split('\n').lastIndexOf('> [!note] Camp');
		const renamedAt = (full: string, header: number): string => full.split('\n').map((l, i) => (i === header + 2 ? '> name: Edited' : l)).join('\n');

		test('an identical callout above: Save lands in the embedded (lower) callout, never the other', async () => {
			const full = noteWith(['^cal']).join('\n');
			const lower = lowerOf(full);
			const { app, host } = embedded(full, section, 'Note#^cal', bodyOf(5), calCache(lower));
			const pin = host.pinPosition()!;

			expect(await save(host, pin)).toBe(true); // before: the marker was looked for under the counter's fence ("> after text"), nothing verified
			expect(app.vault.getContent('Note.md')).toBe(renamedAt(full, lower));
			expect(names(app)).toEqual(['Twin', 'Edited']);
			expect(Notice.notices).toEqual([]);
		});

		test.each([
			['the id line names another block', ['^other']],
			['there is no id line at all', []],
		])('%s: the marker is not there, nothing places the pin, Save writes nothing', async (_name, marker) => {
			const full = noteWith(marker).join('\n');
			const { app, host } = embedded(full, section, 'Note#^cal', bodyOf(5), calCache(lowerOf(full)));
			const pin = host.pinPosition()!;

			expect(await save(host, pin)).toBe(false);
			expect(app.vault.getContent('Note.md')).toBe(full);
			expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
		});

		test('a cache that lags the note so that its callout is the identical one ABOVE: the id is not under it, so it is not taken and nothing is written', async () => {
			const full = noteWith(['^cal']).join('\n');
			const upper = full.split('\n').indexOf('> [!note] Camp');
			const { app, host } = embedded(full, section, 'Note#^cal', bodyOf(5), calCache(upper));
			const pin = host.pinPosition()!;

			expect(await save(host, pin)).toBe(false);
			expect(app.vault.getContent('Note.md')).toBe(full);
			expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
		});
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
