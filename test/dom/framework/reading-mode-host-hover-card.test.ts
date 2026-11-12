// SC-594 -- a card's + / - in a hover preview (or an embed) of PART of a note, with an identical counter (the twin) elsewhere in the note.
// Obsidian gives such a card a section that does not say where it sits: a heading hover's section is the heading's BODY (no heading line,
// `lineStart` 1, measured), a block hover's the block's own lines, so the part's text occurs at the twin's place too. The card's write is
// placed through the LINK the preview was opened for (Obsidian's `hover-link` event; the embed's `src`), checked over the whole part against the
// note, or through the host's own last write; otherwise nothing is written (the dropped-write Notice). It is never placed by searching the note
// for the part's text or for the body, so the twin is never written, whatever an outside edit did before the click.
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { hoverLinkOf, noteHoverLink, registerHoverLinks } from '../../../src/framework/host/hoverLinks';
import { atxHeadings, normalizeHeadingName } from '../../../src/framework/host/headingNames';
import { droppedWriteMessage, resetDroppedWriteNotices } from '../../../src/framework/host/droppedWriteNotice';
import { App, Notice, Plugin } from '../../mocks/obsidian';
import type { MarkdownPostProcessorContext } from '../../mocks/obsidian';

type Sec = { text: string; lineStart: number; lineEnd: number };
type Section = { current: Sec | null };

function switchableCtx(section: Section): MarkdownPostProcessorContext {
	return { docId: 'doc-594', sourcePath: 'Note.md', frontmatter: undefined, addChild: () => {}, getSectionInfo: () => section.current } as never;
}
const CTR = (n: number, name = 'Twin'): string[] => ['```ds-counter', `name: ${name}`, `current_value: ${n}`, '```'];
const bodyOf = (n: number, name = 'Twin'): string => `name: ${name}\ncurrent_value: ${n}`;
const q = (l: string) => `> ${l}`;
const qq = (l: string) => `> > ${l}`;
const ind = (n: number) => (l: string) => `${' '.repeat(n)}${l}`;
const para = (n: number, tag: string): string[] => Array.from({ length: n }, (_, i) => `${tag} ${i}`);
const pos = (line: number) => ({ line, col: 0, offset: 0 });
const settle = () => new Promise((r) => setTimeout(r, 25));

/** What Obsidian's metadata cache holds for `lines`: the headings, and the blocks `blocks` names (id -> [start line, end line]). */
function cacheFor(lines: string[], blocks: Record<string, [number, number]> = {}) {
	const headings: Array<{ heading: string; level: number; position: unknown }> = [];
	lines.forEach((l, i) => {
		const h = /^(#{1,6})\s+(.*)$/.exec(l);
		if (h) headings.push({ heading: h[2], level: h[1].length, position: { start: pos(i), end: pos(i) } });
	});
	const bl: Record<string, unknown> = {};
	for (const [id, [s, e]] of Object.entries(blocks)) bl[id] = { id, position: { start: pos(s), end: pos(e) } };
	return { headings, blocks: bl };
}
/**
 * A hover popover as Obsidian draws it (measured, 1.15.1): `.popover.hover-popover > .markdown-embed > card element`, no `src` anywhere. For a heading link
 * `.markdown-embed[data-type=heading]` holds the heading (`data-heading`) before the card, for a block link `data-type=block`, for a whole note neither.
 */
function popoverEl(link: string | null = null): { popover: HTMLElement; el: HTMLElement } {
	const popover = document.createElement('div');
	popover.className = 'popover hover-popover';
	const embed = popover.appendChild(document.createElement('div'));
	embed.className = 'markdown-embed';
	const el = embed.appendChild(document.createElement('div'));
	const sub = link !== null && link.includes('#') ? link.slice(link.indexOf('#')) : null;
	if (sub !== null && sub.startsWith('#^')) embed.setAttribute('data-type', 'block');
	else if (sub !== null) {
		embed.setAttribute('data-type', 'heading');
		const h = document.createElement('h2');
		h.setAttribute('data-heading', sub.split('#').pop()!);
		embed.insertBefore(h, el);
	}
	document.body.appendChild(popover);
	return { popover, el };
}
/** A `hover-link` event the way Obsidian fires it: the link, the note it was hovered in, the parent whose popover is shown. */
const hoverEvent = (linktext: string, popover: HTMLElement, parent: { hoverPopover: { hoverEl: HTMLElement } | null } = { hoverPopover: { hoverEl: popover } }) => ({
	linktext,
	sourcePath: 'Host.md',
	hoverParent: parent,
});
function embedEl(src: string, lp: boolean): HTMLElement {
	const embed = document.createElement('div');
	embed.className = 'internal-embed markdown-embed';
	embed.setAttribute('src', src);
	const el = embed.appendChild(document.createElement('div'));
	if (lp) document.createElement('div').appendChild(embed).parentElement!.className = 'cm-embed-block';
	return el;
}
const valuesOf = (app: App): number[] => [...app.vault.getContent('Note.md')!.matchAll(/current_value: (\d+)/g)].map((m) => Number(m[1]));

describe('a hover preview card write with an identical counter elsewhere in the note', () => {
	let warn: jest.SpyInstance;
	const popovers: HTMLElement[] = [];
	beforeEach(() => {
		resetDroppedWriteNotices();
		Notice.notices.length = 0;
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => {
		warn.mockRestore();
		popovers.splice(0).forEach((p) => p.remove());
	});

	const HPART = ['', ...CTR(5), '', ''];
	/** A heading hover's section: the heading's body, the way Obsidian measured it. */
	const heading: Sec = { text: HPART.join('\n'), lineStart: 1, lineEnd: 4 };
	const LONG = (a: number, b: number) => ['# N', '', ...para(120, 'above'), '', '## Tracker', '', ...CTR(a), '', '## After', '', ...para(40, 'mid'), '', '## Other', '', ...CTR(b), '', ...para(80, 'below')].join('\n');
	/** Make a popover draw a heading preview of `name` (what Obsidian draws for `[[note#name]]`). */
	const showsHeading = (popover: HTMLElement, name: string) => {
		const embed = popover.querySelector('.markdown-embed')!;
		embed.setAttribute('data-type', 'heading');
		embed.insertBefore(document.createElement('h2'), embed.firstChild).setAttribute('data-heading', name);
	};
	const refused = (app: App, note: string) => {
		expect(app.vault.getContent('Note.md')).toBe(note);
		expect(Notice.notices).toEqual([droppedWriteMessage('Note')]);
	};

	/** A hover preview card: `linktext` is the link its preview was opened for (null: Obsidian announced none), `sec` the part it was given, `disk` the note. */
	function hovered(disk: string, sec: Sec, linktext: string | null, known = bodyOf(5), blocks: Record<string, [number, number]> = {}, cachedNote: string | null = null) {
		const app = new App();
		app.vault.setFile('Note.md', disk);
		// `cachedNote`: the note the metadata cache was built from (a cache that lags an outside edit); else the note as it is now
		jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheFor((cachedNote ?? app.vault.getContent('Note.md')!).split('\n'), blocks) as never);
		const { popover, el } = popoverEl(linktext);
		popovers.push(popover);
		if (linktext) noteHoverLink(app, hoverEvent(linktext, popover));
		const section: Section = { current: sec };
		const host = new ReadingModeBlockHost(new Plugin(app) as never, el, switchableCtx(section) as never, 'ds-counter');
		host.setMountedBody(known);
		return { app, host, section, popover };
	}
	/** The + on the card: a persist intent takes the card's pin, the debounced write follows it. */
	async function plus(host: ReadingModeBlockHost, to: string): Promise<boolean> {
		host.notePersistIntent();
		await settle();
		return host.replaceSource(to, { fromView: true });
	}

	test('J1 the ticket: [[long note#Tracker]] hover, an identical counter under another heading: the + lands in the hovered counter', async () => {
		const { app, host } = hovered(LONG(5, 5), heading, 'Note#Tracker');

		expect(await plus(host, bodyOf(6))).toBe(true);
		expect(valuesOf(app)).toEqual([6, 5]);
		expect(Notice.notices).toEqual([]);
	});

	test('J1 the same in a short note', async () => {
		const disk = ['# N', '', 'TOP', '', '## Tracker', '', ...CTR(5), '', '## Other', '', 'mid', '', ...CTR(5), '', 'END'].join('\n');
		const { app, host } = hovered(disk, heading, 'Note#Tracker');

		expect(await plus(host, bodyOf(6))).toBe(true);
		expect(valuesOf(app)).toEqual([6, 5]);
	});

	test('J2 a block hover [[Note#^a]] whose identical block carries another id, nothing edited: the + lands in the hovered block', async () => {
		const disk = ['# N', '', ...CTR(5), '^a', '', 'p', '', ...CTR(5), '^b', '', 'END'].join('\n');
		const { app, host } = hovered(disk, { text: CTR(5).join('\n'), lineStart: 0, lineEnd: 3 }, 'Note#^a', bodyOf(5), { a: [2, 5], b: [10, 13] });

		expect(await plus(host, bodyOf(6))).toBe(true);
		expect(valuesOf(app)).toEqual([6, 5]);
	});

	test('J3 a block hover, the + landed (the part still shows 5), then the hovered block is edited from outside while the identical block holds what the + made: the next + writes nothing', async () => {
		const disk = ['# N', '', ...CTR(9), '^a', '', 'p', '', ...CTR(6), '^b', '', 'END'].join('\n');
		const { app, host } = hovered(disk, { text: CTR(5).join('\n'), lineStart: 0, lineEnd: 3 }, 'Note#^a', bodyOf(6), { a: [2, 5], b: [10, 13] });

		expect(await plus(host, bodyOf(7))).toBe(false);
		refused(app, disk);
	});

	test('J3 the same with no hover-link record for the preview: nothing is written', async () => {
		const disk = ['# N', '', ...CTR(9), '^a', '', 'p', '', ...CTR(6), '^b', '', 'END'].join('\n');
		const { app, host } = hovered(disk, { text: CTR(5).join('\n'), lineStart: 0, lineEnd: 3 }, null, bodyOf(6), { a: [2, 5], b: [10, 13] });

		expect(await plus(host, bodyOf(7))).toBe(false);
		refused(app, disk);
	});

	test('J3 a block hover, the hovered block edited from outside before the click (no + before it), an identical block holding the old value: nothing is written', async () => {
		const disk = ['# N', '', ...CTR(9), '^a', '', 'p', '', ...CTR(5), '^b', '', 'END'].join('\n');
		const { app, host } = hovered(disk, { text: CTR(5).join('\n'), lineStart: 0, lineEnd: 3 }, 'Note#^a', bodyOf(5), { a: [2, 5], b: [10, 13] });

		expect(await plus(host, bodyOf(6))).toBe(false);
		refused(app, disk);
	});

	test('J4 a heading hover, the hovered counter edited from outside before the click, the identical one under another heading holding the old value: nothing is written', async () => {
		const { app, host } = hovered(LONG(9, 5), heading, 'Note#Tracker');

		expect(await plus(host, bodyOf(6))).toBe(false);
		refused(app, LONG(9, 5));
	});

	test('J5 a second + in the same heading hover while its part still shows the old value (the ticket\'s shape): it lands in the hovered counter again', async () => {
		const { app, host } = hovered(LONG(5, 5), heading, 'Note#Tracker');

		expect(await plus(host, bodyOf(6))).toBe(true);
		expect(await plus(host, bodyOf(7))).toBe(true);
		expect(valuesOf(app)).toEqual([7, 5]);
		expect(Notice.notices).toEqual([]);
	});

	test('J5 the second + after the preview was redrawn (its part shows the new value): it lands in the hovered counter', async () => {
		const { app, host, section } = hovered(LONG(5, 5), heading, 'Note#Tracker');
		await plus(host, bodyOf(6));
		section.current = { text: ['', ...CTR(6), '', ''].join('\n'), lineStart: 1, lineEnd: 4 };

		expect(await plus(host, bodyOf(7))).toBe(true);
		expect(valuesOf(app)).toEqual([7, 5]);
	});

	test('J6 the + made the hovered counter read like the identical one (it holds 6): the second + still lands in the hovered counter', async () => {
		const { app, host } = hovered(LONG(5, 6), heading, 'Note#Tracker');

		expect(await plus(host, bodyOf(6))).toBe(true);
		expect(await plus(host, bodyOf(7))).toBe(true);
		expect(valuesOf(app)).toEqual([7, 6]);
	});

	test('J6 the hovered counter edited from outside between the two +: the second writes nothing', async () => {
		const { app, host } = hovered(LONG(5, 6), heading, 'Note#Tracker');
		await plus(host, bodyOf(6));
		const outside = app.vault.getContent('Note.md')!.replace('current_value: 6', 'current_value: 9');
		app.vault.setFile('Note.md', outside);

		expect(await plus(host, bodyOf(7))).toBe(false);
		refused(app, outside);
	});

	test('J7 a heading name used twice, the hovered counter\'s body unique in the note: the + lands in the first section (no regression)', async () => {
		const disk = ['# N', '', '## Tracker', '', ...CTR(5), '', '## Mid', '', 'x', '', '## Tracker', '', ...CTR(3), '', 'END'].join('\n');
		const { app, host } = hovered(disk, heading, 'Note#Tracker');

		expect(await plus(host, bodyOf(6))).toBe(true);
		expect(valuesOf(app)).toEqual([6, 3]);
	});

	test('J8 a section of the same name pasted ABOVE before the click, a counter with the same body elsewhere: nothing is written (the link names two places)', async () => {
		const outside = LONG(5, 5).replace('# N\n\n', '# N\n\n## Tracker\n\n' + CTR(5).join('\n') + '\n\n## Pasted\n\n');
		const { app, host } = hovered(outside, heading, 'Note#Tracker');

		expect(await plus(host, bodyOf(6))).toBe(false);
		refused(app, outside);
	});

	test('J9 two previews open, the card in the second, the newest event is the first one\'s: the card uses its own preview\'s link', async () => {
		const other = popoverEl('Note#Other');
		popovers.push(other.popover);
		const app = new App();
		app.vault.setFile('Note.md', LONG(5, 5));
		jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheFor(app.vault.getContent('Note.md')!.split('\n')) as never);
		noteHoverLink(app, hoverEvent('Note#Other', other.popover));
		const mine = popoverEl('Note#Tracker');
		popovers.push(mine.popover);
		noteHoverLink(app, hoverEvent('Note#Tracker', mine.popover));
		noteHoverLink(app, hoverEvent('Note#Other', other.popover)); // the newest event is for the OTHER preview
		const host = new ReadingModeBlockHost(new Plugin(app) as never, mine.el, switchableCtx({ current: heading }) as never, 'ds-counter');
		host.setMountedBody(bodyOf(5));

		expect(await plus(host, bodyOf(6))).toBe(true);
		expect(valuesOf(app)).toEqual([6, 5]);
	});

	test('J10 the only event names another preview (the card\'s preview was opened some other way): nothing is written', async () => {
		const { app, host, popover } = hovered(LONG(5, 5), heading, null);
		showsHeading(popover, 'Tracker'); // so the DOM check alone would not refuse the link of the other preview
		const elsewhere = popoverEl('Note#Tracker');
		popovers.push(elsewhere.popover);
		noteHoverLink(app, hoverEvent('Note#Tracker', elsewhere.popover));

		expect(await plus(host, bodyOf(6))).toBe(false);
		refused(app, LONG(5, 5));
	});

	test('J11 a Reading-view heading embed ![[Note#Tracker]], a heading name used twice, the body unique: the + lands (no regression)', async () => {
		const disk = ['# N', '', '## Tracker', '', ...CTR(5), '', '## Mid', '', 'x', '', '## Tracker', '', ...CTR(3), '', 'END'].join('\n');
		const app = new App();
		app.vault.setFile('Note.md', disk);
		jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheFor(disk.split('\n')) as never);
		const sec: Section = { current: { text: ['## Tracker', '', ...CTR(5), ''].join('\n'), lineStart: 2, lineEnd: 5 } };
		const host = new ReadingModeBlockHost(new Plugin(app) as never, embedEl('Note#Tracker', false), switchableCtx(sec) as never, 'ds-counter');
		host.setMountedBody(bodyOf(5));

		expect(await plus(host, bodyOf(6))).toBe(true);
		expect(valuesOf(app)).toEqual([6, 3]);
	});

	test('J12 a whole-note hover [[Note]], an identical counter added above before the click: the + lands in the hovered counter, not the added one', async () => {
		const pre = ['# N', '', 'TOP', '', ...CTR(5), '', 'END'];
		const outside = ['# N', '', ...CTR(5), '', 'added', '', 'TOP', '', ...CTR(5), '', 'END'].join('\n');
		const { app, host } = hovered(outside, { text: pre.join('\n'), lineStart: 4, lineEnd: 7 }, 'Note');

		expect(await plus(host, bodyOf(6))).toBe(true);
		expect(valuesOf(app)).toEqual([5, 6]);
	});

	test('J13 the part holds two counters separated by a blank line, the hovered one deleted from outside so the other moves onto its line: nothing is written', async () => {
		const part = ['', ...CTR(5), '', ...CTR(5), '', ''];
		const outside = ['# N', '', '## Tracker', '', ...CTR(5), '', '## After', '', 'END'].join('\n');
		const { app, host } = hovered(outside, { text: part.join('\n'), lineStart: 1, lineEnd: 4 }, 'Note#Tracker');

		expect(await plus(host, bodyOf(6))).toBe(false);
		refused(app, outside);
	});

	test('J14 the write comes at once after the click (an unload flush, no debounce): the card\'s pin is placed before the write', async () => {
		const { app, host } = hovered(LONG(5, 5), heading, 'Note#Tracker');
		host.notePersistIntent();

		expect(await host.replaceSource(bodyOf(6), { fromView: true })).toBe(true);
		expect(valuesOf(app)).toEqual([6, 5]);
	});

	test('J15 a block hover whose metadata cache lags and points ^a at the identical block (which carries ^b): nothing is written', async () => {
		const disk = ['# N', '', ...CTR(5), '^a', '', 'p', '', ...CTR(5), '^b', '', 'END'].join('\n');
		const { app, host } = hovered(disk, { text: CTR(5).join('\n'), lineStart: 0, lineEnd: 3 }, 'Note#^a', bodyOf(5), { a: [10, 13], b: [10, 13] });

		expect(await plus(host, bodyOf(6))).toBe(false);
		refused(app, disk);
	});

	test('J16 a callout under the heading and an identical callout above it already reading 6: a + and a second + with the window still stale both land in the hovered callout', async () => {
		const CAL = (n: number) => ['> [!note] Camp', ...CTR(n).map(q)];
		const disk = ['# N', '', 'TOP', '', ...CAL(6), '', 'p', '', '## Tracker', '', ...CAL(5), '', '## After', '', 'END'].join('\n');
		const { app, host } = hovered(disk, { text: ['', ...CAL(5), '', ''].join('\n'), lineStart: 1, lineEnd: 5 }, 'Note#Tracker');

		expect(await plus(host, bodyOf(6))).toBe(true);
		expect(await plus(host, bodyOf(7))).toBe(true);
		expect(valuesOf(app)).toEqual([6, 7]);
	});

	// A callout holding TWO counters, the + on the lower one: both read the same and the stale window holds the known body only in the UPPER one,
	// so the card's own fence found in it by body is the sibling: the second + is placed by the host's own write, never at the upper counter.
	test.each([
		['block hover, window stale', 'Note#^cal', false, false],
		['heading hover, window stale', 'Note#Tracker', true, false],
		['block hover, window redrawn (both counters read 6)', 'Note#^cal', false, true],
		['heading hover, window redrawn (both counters read 6)', 'Note#Tracker', true, true],
	] as const)('J18 two counters in one callout, + on the lower one, then a second + (%s): it lands in the lower counter, the upper one is untouched', async (_name, link, byHeading, redrawn) => {
		const C2 = (a: number, b: number): string[] => ['> [!note] Camp', ...CTR(a).map(q), '> mid', ...CTR(b).map(q)];
		const cal = C2(6, 5);
		const lines = byHeading ? ['# N', '', '## Tracker', '', ...cal, '', '## After', 'END'] : ['# N', '', ...cal, '', '^cal', '', 'END'];
		const head = lines.indexOf('> [!note] Camp');
		const sec: Sec = byHeading ? { text: ['', ...cal, '', ''].join('\n'), lineStart: 1, lineEnd: 10 } : { text: cal.join('\n'), lineStart: 0, lineEnd: 9 };
		const { app, host, section } = hovered(lines.join('\n'), sec, link, bodyOf(5), { cal: [head, head + 9] });

		expect(await plus(host, bodyOf(6))).toBe(true); // the lower counter now reads like the upper
		if (redrawn) section.current = byHeading ? { text: ['', ...C2(6, 6), '', ''].join('\n'), lineStart: 1, lineEnd: 10 } : { text: C2(6, 6).join('\n'), lineStart: 0, lineEnd: 9 };
		expect(await plus(host, bodyOf(7))).toBe(true);
		expect(valuesOf(app)).toEqual([6, 7]);
		expect(Notice.notices).toEqual([]);
	});

	// A callout holding two counters (upper 5, lower 6) under the heading / with an id; + on the UPPER one (it becomes 6 and now reads like the lower one). Before the
	// preview redraws, an outside edit puts the upper one back to 5: the note reads exactly like the stale part again. The second +: the host knows body 6, the stale
	// window holds body 6 only in the LOWER counter, so the card's own fence found by body is the sibling. The host's own last write (the guard in `takePin`) says the
	// upper counter, which now holds 5: refused. Without the guard the whole-part check passes and the LOWER counter is written.
	test.each([
		['heading hover', 'Note#Tracker', true],
		['block hover', 'Note#^cal', false],
	] as const)('J19 a second + after an outside edit put the first + back, in a stale two-counter callout window (%s): the sibling counter is never written', async (_name, link, byHeading) => {
		const C2 = (a: number, b: number): string[] => ['> [!note] Camp', ...CTR(a).map(q), '> mid', ...CTR(b).map(q)];
		const lines = byHeading ? ['# N', '', '## Tracker', '', ...C2(5, 6), '', '## After', 'END'] : ['# N', '', ...C2(5, 6), '', '^cal', '', 'END'];
		const head = lines.indexOf('> [!note] Camp');
		const sec: Sec = byHeading ? { text: ['', ...C2(5, 6), '', ''].join('\n'), lineStart: 1, lineEnd: 10 } : { text: C2(5, 6).join('\n'), lineStart: 0, lineEnd: 9 };
		const { app, host } = hovered(lines.join('\n'), sec, link, bodyOf(5), { cal: [head, head + 9] });

		expect(await plus(host, bodyOf(6))).toBe(true);
		expect(valuesOf(app)).toEqual([6, 6]);
		const reverted = app.vault.getContent('Note.md')!.replace('current_value: 6', 'current_value: 5'); // the upper counter back to 5
		app.vault.setFile('Note.md', reverted);

		expect(await plus(host, bodyOf(7))).toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(reverted);
	});

	// A heading hover's section is the heading's BODY: nothing in it says which heading it hangs from, so the place is the LINE the metadata cache gives the heading,
	// and the cache lags an outside edit by a moment. The note TEXT must confirm it: that line is an ATX heading of the link's name, and while the counter's body occurs
	// twice the text holds exactly one such heading.
	describe('a heading hover whose metadata cache lags an outside edit', () => {
		const ORIG = ['# N', '', 'TOP', '', '## Tracker', '', ...CTR(5), '', '## Other', '', ...CTR(5), '', 'END'].join('\n');
		const lagging = (disk: string) => hovered(disk, heading, 'Note#Tracker', bodyOf(5), {}, ORIG);

		test('J20 the hovered section deleted from outside (the cache still has it): nothing is written, never the counter under the next heading', async () => {
			const disk = ['# N', '', 'TOP', '', '## Other', '', ...CTR(5), '', 'END'].join('\n');
			const { app, host } = lagging(disk);

			expect(await plus(host, bodyOf(6))).toBe(false);
			refused(app, disk);
		});

		test('J20 the next section moved ABOVE the hovered one from outside: nothing is written, never the counter that is now under the old line', async () => {
			const disk = ['# N', '', 'TOP', '', '## Other', '', ...CTR(5), '', '## Tracker', '', ...CTR(5), '', 'END'].join('\n');
			const { app, host } = lagging(disk);

			expect(await plus(host, bodyOf(6))).toBe(false);
			refused(app, disk);
		});

		test('J20 an identical section of the same name pasted ABOVE from outside (the cache has one): nothing is written (the text names two places)', async () => {
			const disk = ['# N', '', 'TOP', '', '## Tracker', '', ...CTR(5), '', '## Pasted', '', '## Tracker', '', ...CTR(5), '', '## Other', '', ...CTR(5), '', 'END'].join('\n');
			const { app, host } = lagging(disk);

			expect(await plus(host, bodyOf(6))).toBe(false);
			refused(app, disk);
		});

		test('J20 the cache points at a blank line (lines were inserted above): nothing is written', async () => {
			const disk = ['# N', '', 'TOP', '', 'inserted', '## Tracker', '', ...CTR(5), '', '## Other', '', ...CTR(5), '', 'END'].join('\n');
			const { app, host } = lagging(disk);

			expect(await plus(host, bodyOf(6))).toBe(false);
			refused(app, disk);
		});

		test('J20 a heading-looking line inside a code fence is no heading: the one real heading of that name still places the +', async () => {
			const disk = ['# N', '', '## Tracker', '', ...CTR(5), '', '```md', '## Tracker', '```', '', '## Other', '', ...CTR(5), '', 'END'].join('\n');
			const { app, host } = hovered(disk, heading, 'Note#Tracker');

			expect(await plus(host, bodyOf(6))).toBe(true);
			expect(valuesOf(app)).toEqual([6, 5]);
		});

		test('J20 a heading written with an underline (setext) is not placed from the text: refused, even with a unique body', async () => {
			const disk = ['# N', '', 'Tracker', '-------', '', ...CTR(5), '', 'END'].join('\n');
			const { app, host } = hovered(disk, heading, 'Note#Tracker');

			expect(await plus(host, bodyOf(6))).toBe(false);
			refused(app, disk);
		});

		test('J20 a heading whose name has a colon, linked without it ([[Note#Tracker one]] for "## Tracker: one"), with an identical counter elsewhere: refused (unchanged)', async () => {
			const disk = ['# N', '', '## Tracker: one', '', ...CTR(5), '', '## Other', '', ...CTR(5), '', 'END'].join('\n');
			const { app, host } = hovered(disk, heading, 'Note#Tracker one');

			expect(await plus(host, bodyOf(6))).toBe(false);
			refused(app, disk);
		});
	});

	test('the heading lines of a note text: ATX only, up to three spaces of indent, an optional closing run of #, none inside a fence, quote or list item', () => {
		const lines = ['# One', '  ## Two ##', '    # indented code', '> # quoted', '- # listed', 'Setext', '======', '```md', '# fenced', '```', '~~~~', '## tilde fenced', '~~~', '## still fenced', '~~~~', '### Three  '];

		expect(atxHeadings(lines)).toEqual([
			{ line: 0, name: 'One' },
			{ line: 1, name: 'Two' },
			{ line: 15, name: 'Three' },
		]);
		expect(normalizeHeadingName('  Tracker   ONE ')).toBe('tracker one');
	});

	// A link another event bound to this preview is refused when the preview's own DOM does not show it (heading name, block / heading / whole note).
	describe('the bound link must be what the preview shows', () => {
		const TWO = ['# N', '', '## Tracker', '', ...CTR(5), '', '## Other', '', ...CTR(5), '', 'END'].join('\n');
		const LONGA = ['# N', '', 'TOP', '', '## Other', '', ...CTR(5), '', '## Tracker', '', ...CTR(5), '', 'END'].join('\n'); // the identical counter ABOVE

		/** The preview shows `shows` (a link) but the event that is bound to it names `named`. */
		function mismatched(disk: string, shows: string, named: string, sec: Sec = heading, blocks: Record<string, [number, number]> = { a: [4, 7] }, withHeading: string | null = null) {
			const app = new App();
			app.vault.setFile('Note.md', disk);
			jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheFor(disk.split('\n'), blocks) as never);
			const { popover, el } = popoverEl(shows);
			popovers.push(popover);
			// a block preview that also draws a heading of the named link (its callout holds one): the heading alone must not make it a heading preview
			if (withHeading) el.parentElement!.insertBefore(Object.assign(document.createElement('h2'), { textContent: withHeading }), el).setAttribute('data-heading', withHeading);
			noteHoverLink(app, hoverEvent(named, popover));
			const host = new ReadingModeBlockHost(new Plugin(app) as never, el, switchableCtx({ current: sec }) as never, 'ds-counter');
			host.setMountedBody(bodyOf(5));
			return { app, host };
		}

		test('J21 a preview of ## Tracker bound to the link of ## Other (an identical-body heading): nothing is written', async () => {
			const { app, host } = mismatched(TWO, 'Note#Tracker', 'Note#Other');

			expect(await plus(host, bodyOf(6))).toBe(false);
			refused(app, TWO);
		});

		test('J21 a preview of a heading bound to a whole-note link ([[Note]]), the identical counter above: nothing is written (a whole-note pin would be mapped against the note)', async () => {
			const { app, host } = mismatched(LONGA, 'Note#Tracker', 'Note');

			expect(await plus(host, bodyOf(6))).toBe(false);
			refused(app, LONGA);
		});

		test('J21 a preview of a heading bound to a block link, and a preview of a block bound to a heading link: nothing is written', async () => {
			const blk = ['# N', '', ...CTR(5), '^a', '', 'p', '', ...CTR(5), '^b', '', 'END'].join('\n');
			const one = mismatched(blk, 'Note#Tracker', 'Note#^a', { text: CTR(5).join('\n'), lineStart: 0, lineEnd: 3 }, { a: [2, 5], b: [10, 13] });
			expect(await plus(one.host, bodyOf(6))).toBe(false);
			refused(one.app, blk);
			Notice.notices.length = 0;
			resetDroppedWriteNotices();
			const two = mismatched(TWO, 'Note#^a', 'Note#Tracker', heading, {}, 'Tracker');
			expect(await plus(two.host, bodyOf(6))).toBe(false);
			refused(two.app, TWO);
		});

		test('J21 a preview of a whole note bound to a heading link: nothing is written', async () => {
			const pre = ['# N', '', 'TOP', '', ...CTR(5), '', 'END'];
			const outside = ['# N', '', ...CTR(5), '', 'added', '', 'TOP', '', ...CTR(5), '', 'END'].join('\n');
			const { app, host } = mismatched(outside, 'Note', 'Note#Tracker', { text: pre.join('\n'), lineStart: 4, lineEnd: 7 });

			expect(await plus(host, bodyOf(6))).toBe(false);
			refused(app, outside);
		});

		test('J21 the residual: another link\'s event before the preview exists, then the preview of ## Tracker opens (the parent names it): the card is not placed at the other link', async () => {
			const app = new App();
			app.vault.setFile('Note.md', TWO);
			jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheFor(TWO.split('\n')) as never);
			const { popover, el } = popoverEl('Note#Tracker');
			popovers.push(popover);
			const parent: { hoverPopover: { hoverEl: HTMLElement } | null } = { hoverPopover: null };
			noteHoverLink(app, hoverEvent('Note#Other', popover, parent));
			parent.hoverPopover = { hoverEl: popover };
			const host = new ReadingModeBlockHost(new Plugin(app) as never, el, switchableCtx({ current: heading }) as never, 'ds-counter');
			host.setMountedBody(bodyOf(5));

			expect(await plus(host, bodyOf(6))).toBe(false);
			refused(app, TWO);
		});

		test('J21 a preview that is already open when the listener registers gets no link, even from a later event that names it the way its DOM shows', () => {
			const app = new App();
			const open = popoverEl('Note#Tracker');
			popovers.push(open.popover); // in the document before the plugin registers
			registerHoverLinks(new Plugin(app) as never);
			noteHoverLink(app, hoverEvent('Note#Tracker', open.popover));

			expect(hoverLinkOf(app, open.el)).toBeNull();
		});
	});

	test('J22 a hover link that names another note (the card is in this note): nothing is written', async () => {
		const TWO = ['# N', '', '## Tracker', '', ...CTR(5), '', '## Other', '', ...CTR(5), '', 'END'].join('\n');
		const { app, host } = hovered(TWO, heading, 'Other#Tracker');
		app.vault.setFile('Other.md', '# Other');

		expect(await plus(host, bodyOf(6))).toBe(false);
		refused(app, TWO);
	});

	test('J22 a block hover whose id sits on two blocks after a paste from outside, the cache still on the old line: nothing is written (the text names two places)', async () => {
		// the cache was built before an identical block with the same id was pasted above: its `a` is on line 2, which is now the pasted block
		const disk = ['# N', '', ...CTR(5), '^a', '', 'p', '', ...CTR(5), '^a', '', 'END'].join('\n');
		const { app, host } = hovered(disk, { text: CTR(5).join('\n'), lineStart: 0, lineEnd: 3 }, 'Note#^a', bodyOf(5), { a: [2, 5] });

		expect(await plus(host, bodyOf(6))).toBe(false);
		refused(app, disk);
	});

	describe('the link is bound to the preview once', () => {
		// Two headings that each hold only the identical counter: the part of either is the same text.
		const TWO = ['# N', '', '## Tracker', '', ...CTR(5), '', '## Other', '', ...CTR(5), '', 'END'].join('\n');

		test('J17 the pointer passes over another link on the same parent while the preview is open (an event for a heading with the identical body, its preview never opens), then the +: it lands in the hovered counter', async () => {
			const { app, host, popover } = hovered(TWO, heading, 'Note#Tracker');
			// the parent still shows the hovered preview: the pass-over's event names the same popover
			noteHoverLink(app, hoverEvent('Note#Other', popover));

			expect(await plus(host, bodyOf(6))).toBe(true);
			expect(valuesOf(app)).toEqual([6, 5]);
			expect(Notice.notices).toEqual([]);
		});

		test('J17 the same pass-over after the first + (its link already looked up), the part redrawn with the new value, the identical counter holding it too: the second + lands in the hovered counter', async () => {
			const disk = ['# N', '', '## Tracker', '', ...CTR(5), '', '## Other', '', ...CTR(6), '', 'END'].join('\n');
			const { app, host, section, popover } = hovered(disk, heading, 'Note#Tracker');
			expect(await plus(host, bodyOf(6))).toBe(true); // both counters read 6 now (the hovered one was 5)
			section.current = { text: ['', ...CTR(6), '', ''].join('\n'), lineStart: 1, lineEnd: 4 };
			noteHoverLink(app, hoverEvent('Note#Other', popover));

			expect(await plus(host, bodyOf(7))).toBe(true);
			expect(valuesOf(app)).toEqual([7, 6]);
		});

		test('J17 a preview no event named when it was first looked up (opened some other way) keeps no link when a later event names its popover: nothing is written', async () => {
			const { app, host, popover } = hovered(TWO, heading, null);
			showsHeading(popover, 'Tracker');
			expect(await plus(host, bodyOf(6))).toBe(false); // the first lookup: no link
			noteHoverLink(app, hoverEvent('Note#Tracker', popover)); // an event that names it the way its DOM shows: still no link, the preview was bound once

			expect(await plus(host, bodyOf(6))).toBe(false);
			expect(app.vault.getContent('Note.md')).toBe(TWO);
		});

		test('an event for a preview that was never opened (its parent shows no popover) names no card\'s preview', () => {
			const app = new App();
			const { popover, el } = popoverEl();
			popovers.push(popover);
			noteHoverLink(app, { linktext: 'Note#Tracker', sourcePath: 'Host.md', hoverParent: { hoverPopover: null } });

			expect(hoverLinkOf(app, el)).toBeNull();
		});

		test('an event without a link text is ignored, a card outside a hover preview has no link', () => {
			const app = new App();
			const { popover, el } = popoverEl();
			popovers.push(popover);
			noteHoverLink(app, { sourcePath: 'Host.md', hoverParent: { hoverPopover: { hoverEl: popover } } });
			noteHoverLink(app, null);

			expect(hoverLinkOf(app, el)).toBeNull();
			expect(hoverLinkOf(app, document.createElement('div'))).toBeNull();
		});

		test('the log keeps the newest 16 events: the link of a preview whose event was dropped before its first lookup is gone, never another event\'s', () => {
			const app = new App();
			const first = popoverEl('Note#First');
			popovers.push(first.popover);
			const parent: { hoverPopover: { hoverEl: HTMLElement } | null } = { hoverPopover: null };
			noteHoverLink(app, { linktext: 'Note#First', sourcePath: 'Host.md', hoverParent: parent });
			for (let i = 0; i < 16; i++) noteHoverLink(app, { linktext: `Note#H${i}`, sourcePath: 'Host.md', hoverParent: { hoverPopover: null } });
			parent.hoverPopover = { hoverEl: first.popover };

			expect(hoverLinkOf(app, first.el)).toBeNull();
		});
	});

	// The sweep: every construct a counter can sit in, every way a card can be given its part, Reading view and Live Preview, and every kind of outside
	// edit before the click. The invariant: the identical counter (the twin) and a counter added from outside are NEVER written. A card whose block
	// was edited from outside (the preview not redrawn yet) writes nothing; a counter in a list item or a footnote writes nothing (unchanged); every
	// other cell lands in the clicked block.
	type Shape = 'heading hover' | 'block hover' | 'heading embed' | 'block embed' | 'whole-note hover';
	type Edit = 'none' | 'own edited' | 'twin edited' | 'identical added';
	// [name, build(value) -> lines, offset of the counter's fence inside the construct, plain (its section IS the fence)]
	const CONSTRUCTS: Array<[string, (v: number) => string[], number, boolean]> = [
		['plain fence', (v) => CTR(v), 0, true],
		['callout', (v) => ['> [!note] Camp', ...CTR(v).map(q), '> after'], 1, false],
		['header-less quote', (v) => ['> intro', ...CTR(v).map(q)], 1, false],
		['quote, first line is the fence', (v) => [...CTR(v).map(q), '> after'], 0, false],
		['nested callout', (v) => ['> [!note] Outer', '> > [!tip] Inner', ...CTR(v).map(qq)], 2, false],
		['list item', (v) => ['- item', ...CTR(v).map(ind(2))], 1, false],
		['footnote', (v) => ['[^1]: note', ...CTR(v).map(ind(4))], 1, false],
	];
	const SHAPES: Shape[] = ['heading hover', 'block hover', 'heading embed', 'block embed', 'whole-note hover'];
	const EDITS: Edit[] = ['none', 'own edited', 'twin edited', 'identical added'];

	/** The note: an identical construct (the twin, B) above the `## Tracker` section that holds A. Block shapes carry ids (`^a` names A). */
	function sweepNote(build: (v: number) => string[], plain: boolean, a: number, b: number, added: boolean, ids: boolean) {
		const idLines = (id: string) => (!ids ? [] : plain ? [`^${id}`] : ['', `^${id}`]);
		const lines = ['# N', ''];
		let cStart = -1;
		if (added) {
			cStart = lines.length;
			lines.push(...build(5), '', 'p-added', '');
		}
		const bStart = lines.length;
		lines.push(...build(b), ...idLines('b'), '', 'p-twin', '', '## Tracker', '');
		const aStart = lines.length;
		lines.push(...build(a), ...idLines('a'), '', '## After', '', 'END');
		return { lines, aStart, bStart, cStart };
	}

	async function sweepCell(build: (v: number) => string[], off: number, plain: boolean, shape: Shape, lp: boolean, edit: Edit): Promise<{ landed: string[]; notices: number }> {
		const ids = shape.startsWith('block');
		const before = sweepNote(build, plain, 5, 5, false, ids);
		const now = sweepNote(build, plain, edit === 'own edited' ? 9 : 5, edit === 'twin edited' ? 9 : 5, edit === 'identical added', ids);
		const len = build(5).length;
		const nowText = now.lines.join('\n');
		const app = new App();
		app.vault.setFile('Note.md', nowText);
		jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheFor(now.lines, { a: [now.aStart, now.aStart + len - 1], b: [now.bStart, now.bStart + len - 1] }) as never);
		// the part Obsidian drew BEFORE the outside edit (the preview / embed is not redrawn yet)
		const aLines = build(5);
		const winStart = plain ? off : 0;
		const winEnd = plain ? off + 3 : len - 1;
		let sec: Sec;
		let linktext: string | null = null;
		if (shape === 'heading hover') {
			sec = { text: ['', ...aLines, '', ''].join('\n'), lineStart: 1 + winStart, lineEnd: 1 + winEnd };
			linktext = 'Note#Tracker';
		} else if (shape === 'block hover') {
			sec = { text: aLines.join('\n'), lineStart: winStart, lineEnd: winEnd };
			linktext = 'Note#^a';
		} else if (shape === 'heading embed') {
			sec = { text: ['## Tracker', '', ...aLines, ''].join('\n'), lineStart: 2 + winStart, lineEnd: 2 + winEnd };
		} else if (shape === 'block embed') {
			sec = { text: aLines.join('\n'), lineStart: winStart, lineEnd: winEnd };
		} else {
			sec = { text: before.lines.join('\n'), lineStart: before.aStart + winStart, lineEnd: before.aStart + winEnd };
			linktext = 'Note';
		}
		let el: HTMLElement;
		if (shape.endsWith('hover')) {
			const p = popoverEl(linktext);
			popovers.push(p.popover);
			el = p.el;
			noteHoverLink(app, hoverEvent(linktext!, p.popover));
		} else el = embedEl(shape === 'heading embed' ? 'Note#Tracker' : 'Note#^a', lp);
		const host = new ReadingModeBlockHost(new Plugin(app) as never, el, switchableCtx({ current: sec }) as never, 'ds-counter');
		host.setMountedBody(bodyOf(5));
		await plus(host, bodyOf(6));
		const al = app.vault.getContent('Note.md')!.split('\n');
		const valueAt = (start: number) => {
			for (let i = start; i < start + len; i++) {
				const m = /current_value: (\d+)/.exec(al[i] ?? '');
				if (m) return Number(m[1]);
			}
			return -1;
		};
		const landed: string[] = [];
		if (valueAt(now.aStart) === 6) landed.push('A');
		if (valueAt(now.bStart) === 6) landed.push('TWIN');
		if (now.cStart >= 0 && valueAt(now.cStart) === 6) landed.push('ADDED');
		return { landed, notices: Notice.notices.length };
	}

	const sweepCases = CONSTRUCTS.flatMap(([cname, build, off, plain]) =>
		SHAPES.flatMap((shape) => (['rv', 'lp'] as const).flatMap((host) => EDITS.map((edit) => ({ cname, build, off, plain, shape, host, edit })))),
	);
	test.each(sweepCases)('sweep: $cname | $shape | $host | $edit', async ({ cname, build, off, plain, shape, host, edit }) => {
		const out = await sweepCell(build, off, plain, shape, host === 'lp', edit);

		expect(out.landed).not.toContain('TWIN');
		expect(out.landed).not.toContain('ADDED');
		const refusedCell = edit === 'own edited' || cname === 'list item' || cname === 'footnote';
		expect(out.landed).toEqual(refusedCell ? [] : ['A']);
		expect(out.notices).toBe(refusedCell ? 1 : 0);
	});
});
