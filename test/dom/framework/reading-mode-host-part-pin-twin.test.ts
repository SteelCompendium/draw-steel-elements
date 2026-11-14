// SC-621 -- a + / - or a block edit form's Save in a hover preview or an embed of PART of a note (a heading, a `^id` block) that stayed open while one
// outside write (Sync, another app) deleted the counter the card was drawn from AND edited a line on one side of the pair. The part's own text is
// unchanged, so Obsidian does not redraw the preview (measured, SC-607), and the link now names the other, identical counter. The head-first and the
// tail-first line maps (`mapLineStrict`, SC-607) both trim the untouched side first, so they agree on the survivor and the tie is not seen. The rule:
// the block the card was drawn from is placed in the note now only on its unique cheapest placement (SC-612's rule, `placedUniquely`) while its body is
// twinned, exactly as a whole-note pin at write time. Otherwise nothing is written and the "changed on disk first" Notice shows.
// Written RED by SC-621 r1 (the ticket shapes and the mirrors fail at df92a3f6; the controls pass on both).
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { noteHoverLink } from '../../../src/framework/host/hoverLinks';
import { droppedWriteMessage, resetDroppedWriteNotices } from '../../../src/framework/host/droppedWriteNotice';
import { App, Notice, Plugin } from '../../mocks/obsidian';
import { settleVaultReads } from '../_settleVaultReads'; // SC-568: waits for the mock vault's reads to drain, not a timer

type Sec = { text: string; lineStart: number; lineEnd: number };
type Section = { current: Sec | null };
const ctxOf = (section: Section) =>
	({ docId: 'doc-621', sourcePath: 'Note.md', frontmatter: undefined, addChild: () => {}, getSectionInfo: () => section.current }) as never;
const CTR = (n: number, name = 'Twin'): string[] => ['```ds-counter', `name: ${name}`, `current_value: ${n}`, '```'];
const bodyOf = (n: number, name = 'Twin'): string => `name: ${name}\ncurrent_value: ${n}`;
const settle = () => settleVaultReads();
const pos = (line: number) => ({ line, col: 0, offset: 0 });
/** What Obsidian's metadata cache holds for `lines`: headings, and `^id` blocks (the id on the line right under a fence). */
function cacheOf(lines: string[]) {
	const headings: Array<{ heading: string; level: number; position: unknown }> = [];
	const blocks: Record<string, unknown> = {};
	let fenced = false;
	lines.forEach((l, i) => {
		if (/^```/.test(l)) fenced = !fenced;
		const h = !fenced && /^(#{1,6})\s+(.*)$/.exec(l);
		if (h) headings.push({ heading: h[2], level: h[1].length, position: { start: pos(i), end: pos(i) } });
		const id = /^\^(\w+)$/.exec(l);
		if (id && !fenced && lines[i - 1] === '```') {
			let s = i - 2;
			while (s >= 0 && !/^```\w/.test(lines[s])) s--;
			blocks[id[1]] = { id: id[1], position: { start: pos(s), end: pos(i - 1) } };
		}
	});
	return { headings, blocks };
}
function popoverEl(app: App, link: string, data: string): HTMLElement {
	const hoverEl = document.createElement('div');
	hoverEl.className = 'popover hover-popover';
	const embed = hoverEl.appendChild(document.createElement('div'));
	embed.className = 'markdown-embed';
	const sub = link.slice(link.indexOf('#'));
	if (sub.startsWith('#^')) embed.setAttribute('data-type', 'block');
	else {
		embed.setAttribute('data-type', 'heading');
		embed.appendChild(document.createElement('h2')).setAttribute('data-heading', sub.split('#').pop()!);
	}
	const el = embed.appendChild(document.createElement('div'));
	document.body.appendChild(hoverEl);
	noteHoverLink(app, { linktext: link, sourcePath: 'Host.md', hoverParent: { hoverPopover: { hoverEl, embed: { data } } } });
	return el;
}
function embedEl(src: string, lp: boolean): HTMLElement {
	const embed = document.createElement('div');
	embed.className = 'internal-embed markdown-embed';
	embed.setAttribute('src', src);
	const el = embed.appendChild(document.createElement('div'));
	if (lp) document.createElement('div').appendChild(embed).parentElement!.className = 'cm-embed-block';
	return el;
}
const dropped = [droppedWriteMessage('Note')];
const values = (text: string): number[] => [...text.matchAll(/current_value: (\d+)/g)].map((m) => Number(m[1]));
const names = (text: string): string[] => [...text.matchAll(/name: (\w+)/g)].map((m) => m[1]);

type Shape = 'heading hover' | 'heading embed RV' | 'heading embed LP' | 'block hover' | 'block embed RV' | 'block embed LP';
type Click = 'card' | 'form';
/** The part Obsidian gives for the link in `lines`: a heading hover the heading's BODY, a heading embed with the heading, a block link the block. */
function partOf(lines: string[], link: string, shape: Shape): Sec {
	const sub = link.slice(link.indexOf('#') + 1);
	let start: number;
	let end: number;
	let fence: number;
	if (sub.startsWith('^')) {
		fence = lines.indexOf(sub) - 4; // the counter right above its `^id` line
		start = fence;
		end = fence + 3;
	} else {
		const h = lines.indexOf(`## ${sub}`);
		let next = h + 1;
		while (next < lines.length && !/^#{1,6}\s/.test(lines[next])) next++;
		start = shape === 'heading hover' ? h + 1 : h;
		end = next - 1;
		fence = lines.indexOf('```ds-counter', h);
	}
	return { text: lines.slice(start, end + 1).join('\n'), lineStart: fence - start, lineEnd: fence - start + 3 };
}

/**
 * A card drawn from `mount` (the counter the link draws, value 5) in `shape` for `link`; optionally its own + first (Obsidian redraws the part
 * from the note the + left and the view is adopted into it: `rebind`); then the note becomes `now` from outside (`timing` 'before click': the
 * outside write lands before the click, so before the pin is placed; 'after rebase': between the click's placement and the write); then a + or the
 * form's Save. Returns the note after it, and the Notices.
 */
async function round(o: { mount: string[]; link: string; shape: Shape; plus?: boolean; now: (round: string[]) => string[]; click: Click; timing?: 'before click' | 'after rebase' }) {
	const app = new App();
	app.vault.setFile('Note.md', o.mount.join('\n'));
	let cacheLines = o.mount;
	jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheOf(cacheLines) as never);
	const section: Section = { current: partOf(o.mount, o.link, o.shape) };
	const el = o.shape.endsWith('hover') ? popoverEl(app, `Note#${o.link.split('#')[1]}`, o.mount.join('\n')) : embedEl(o.link, o.shape.endsWith('LP'));
	const host = new ReadingModeBlockHost(new Plugin(app) as never, el, ctxOf(section), 'ds-counter');
	host.setMountedBody(bodyOf(5));
	await settle();
	let known = 5;
	let roundLines = o.mount;
	if (o.plus) {
		host.notePersistIntent();
		await settle();
		expect(await host.replaceSource(bodyOf(6), { fromView: true })).toBe(true);
		known = 6;
		roundLines = app.vault.getContent('Note.md')!.split('\n');
		cacheLines = roundLines;
		section.current = partOf(roundLines, o.link, o.shape);
		host.rebind(el, ctxOf(section));
		await settle();
		Notice.notices.length = 0;
		resetDroppedWriteNotices();
	}
	const now = o.now(roundLines).join('\n');
	// the shape: the part's text is unchanged, so Obsidian does not redraw the preview
	expect(partOf(now.split('\n'), o.link, o.shape).text).toBe(section.current!.text);
	const outside = () => {
		app.vault.setFile('Note.md', now);
		cacheLines = now.split('\n');
	};
	if ((o.timing ?? 'before click') === 'before click') outside();
	if (o.click === 'card') {
		host.notePersistIntent();
		await settle();
		if (o.timing === 'after rebase') outside();
		await host.replaceSource(bodyOf(known + 1), { fromView: true });
	} else {
		const pin = host.pinPosition();
		await settle();
		if (o.timing === 'after rebase') outside();
		await (pin ? host.replaceSource(bodyOf(known, 'Edited'), { pin, pinOnly: true }) : host.replaceSource(bodyOf(known, 'Edited')));
	}
	el.closest('.hover-popover')?.remove();
	return { now, after: app.vault.getContent('Note.md')!, notices: Notice.notices.slice() };
}

// ---- the notes ----
/** Two sections with different names and identical counters; the card is drawn from the one under `## Tracker`. */
const NAMED = ['# N', '', 'TOP', '', '## Tracker', '', ...CTR(5), '', '## Other', '', ...CTR(5), '', '## After', '', 'END'];
/** The Tracker section deleted, `## Other` renamed `## Tracker`, and a line on one side edited: one outside write. */
const delTrackerRenameOther = (edit: (l: string) => string) => (r: string[]) => [...r.slice(0, 4), ...r.slice(11)].map((l) => (l === '## Other' ? '## Tracker' : edit(l)));
const endEdited = (l: string) => (l === 'END' ? 'END edited' : l);
const topEdited = (l: string) => (l === 'TOP' ? 'TOP edited' : l);
/** Two ADJACENT `## Tracker` sections; the lower holds 6, so the card's own + (5 -> 6) makes the two identical. */
const TWIN = ['# N', '', 'TOP', '', '## Tracker', '', ...CTR(5), '', '## Tracker', '', ...CTR(6), '', '## After', '', 'END'];
const delFirstTracker = (edit: (l: string) => string) => (r: string[]) => [...r.slice(0, 4), ...r.slice(11)].map(edit);
const delSecondTracker = (edit: (l: string) => string) => (r: string[]) => [...r.slice(0, 11), ...r.slice(18)].map(edit);
/** Two identical counters separated by a blank line, `^p` under the LOWER one (the card is drawn from it). */
const LOW = ['# N', '', 'TOP', '', ...CTR(5), '', ...CTR(5), '^p', '', 'END'];
/** The lower counter deleted with the blank line above it; its `^p` line is left, now right under the upper counter. */
const delLowerKeepMark = (edit: (l: string) => string) => (r: string[]) => [...r.slice(0, 8), ...r.slice(13)].map(edit);
/** The UPPER counter deleted with the blank line under it: the same text as `delLowerKeepMark` (a line diff cannot tell them apart). */
const delUpper = (edit: (l: string) => string) => (r: string[]) => [...r.slice(0, 4), ...r.slice(9)].map(edit);

/** A UNIQUE counter (5) under `^p` below another one (9): the body the card was drawn from is not twinned in the note as drawn. */
const UNIQ = ['# N', '', 'TOP', '', ...CTR(9), '', ...CTR(5), '^p', '', 'END'];
/** An identical counter pasted right above the `^p` one (blank line between), TOP edited: the twin exists only in the note now. */
const pasteAbove = (edit: (l: string) => string) => (r: string[]) => [...r.slice(0, 9), ...CTR(5), '', ...r.slice(9)].map(edit);

describe('SC-621: a preview of part of a note never writes the other identical counter when the drawn-from one is deleted with a one-sided edit', () => {
	let warn: jest.SpyInstance;
	beforeEach(() => {
		resetDroppedWriteNotices();
		Notice.notices.length = 0;
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => {
		warn.mockRestore();
		jest.restoreAllMocks();
		document.body.innerHTML = '';
	});

	const refused = (r: { now: string; after: string; notices: unknown[] }) => {
		expect(r.after).toBe(r.now); // nothing written: the counter under the link now is not the one the card was drawn from
		expect(r.notices).toEqual(dropped);
	};

	describe('the ticket shapes: refused with the one "changed on disk first" Notice', () => {
		test.each([
			['heading hover', 'card'],
			['heading hover', 'form'],
			['heading embed RV', 'card'],
			['heading embed RV', 'form'],
			['heading embed LP', 'card'],
			['heading embed LP', 'form'],
		] as Array<[Shape, Click]>)('%s, %s: the Tracker section deleted, the other one renamed Tracker, END edited', async (shape, click) => {
			refused(await round({ mount: NAMED, link: 'Note#Tracker', shape, now: delTrackerRenameOther(endEdited), click }));
		});

		test.each([
			['heading hover', 'card'],
			['heading hover', 'form'],
			['heading embed RV', 'card'],
			['heading embed LP', 'form'],
		] as Array<[Shape, Click]>)('%s, %s: after the card\'s own + made two adjacent Tracker sections identical, the first deleted and END edited', async (shape, click) => {
			refused(await round({ mount: TWIN, link: 'Note#Tracker', shape, plus: true, now: delFirstTracker(endEdited), click }));
		});

		test.each([
			['block hover', 'card'],
			['block hover', 'form'],
			['block embed RV', 'card'],
			['block embed LP', 'form'],
		] as Array<[Shape, Click]>)('%s, %s: the lower counter (the one ^p names) deleted, its ^p line left under the upper one, TOP edited', async (shape, click) => {
			refused(await round({ mount: LOW, link: 'Note#^p', shape, now: delLowerKeepMark(topEdited), click }));
		});
	});

	describe('the mirrors: the OTHER counter deleted with the same edit leaves the same text, so they are refused too (the accepted cost)', () => {
		test.each([
			['heading hover', 'card'],
			['heading embed RV', 'form'],
		] as Array<[Shape, Click]>)('%s, %s: the Other section deleted, END edited (reads the same as the Tracker one deleted and Other renamed)', async (shape, click) => {
			const r = await round({ mount: NAMED, link: 'Note#Tracker', shape, now: (x) => [...x.slice(0, 11), ...x.slice(18)].map(endEdited), click });
			expect(r.now).toBe(delTrackerRenameOther(endEdited)(NAMED).join('\n'));
			refused(r);
		});

		test('heading hover, card: after the own +, the SECOND Tracker section deleted, END edited', async () => {
			refused(await round({ mount: TWIN, link: 'Note#Tracker', shape: 'heading hover', plus: true, now: delSecondTracker(endEdited), click: 'card' }));
		});

		test('block embed RV, card: the UPPER counter deleted, TOP edited', async () => {
			const r = await round({ mount: LOW, link: 'Note#^p', shape: 'block embed RV', now: delUpper(topEdited), click: 'card' });
			expect(r.now).toBe(delLowerKeepMark(topEdited)(LOW).join('\n'));
			refused(r);
		});
	});

	describe('the twin gate covers the note as it is now, not only the note as drawn', () => {
		test.each([
			['block hover', 'card'],
			['block embed RV', 'form'],
		] as Array<[Shape, Click]>)('%s, %s: an identical counter pasted right above the unique one the card was drawn from, TOP edited', async (shape, click) => {
			// as drawn the body is unique (the other counter holds 9), so only the note now has a twin: the pasted copy and the original read the same, and a placement that
			// keeps the original is no more likely than one that keeps the copy
			const r = await round({ mount: UNIQ, link: 'Note#^p', shape, now: pasteAbove(topEdited), click });
			expect(values(r.now)).toEqual([9, 5, 5]);
			refused(r);
		});
		test('block hover, card: the same paste with nothing else edited is not a tie for the line maps (TOP kept): refused as at base', async () => {
			refused(await round({ mount: UNIQ, link: 'Note#^p', shape: 'block hover', now: pasteAbove((l) => l), click: 'card' }));
		});
	});

	describe('persistence: nothing is written and the refusal repeats until the preview or embed is reopened', () => {
		/** A card of `shape` for `link` drawn from `mount`; the note becomes `now` from outside; two clicks on that same card; then a preview reopened on the note now. */
		async function twoClicksThenReopen(mount: string[], link: string, shape: Shape, now: string[]) {
			const app = new App();
			app.vault.setFile('Note.md', mount.join('\n'));
			let cacheLines = mount;
			jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheOf(cacheLines) as never);
			const open = (lines: string[]) => {
				const section: Section = { current: partOf(lines, link, shape) };
				const el = shape.endsWith('hover') ? popoverEl(app, `Note#${link.split('#')[1]}`, lines.join('\n')) : embedEl(link, false);
				const host = new ReadingModeBlockHost(new Plugin(app) as never, el, ctxOf(section), 'ds-counter');
				host.setMountedBody(bodyOf(5));
				return { el, host };
			};
			const first = open(mount);
			await settle();
			app.vault.setFile('Note.md', now.join('\n'));
			cacheLines = now;
			const click = async (host: ReadingModeBlockHost) => {
				Notice.notices.length = 0;
				resetDroppedWriteNotices(); // the Notice is rate limited to one per note per 5 s; this asks for each click's own
				host.notePersistIntent();
				await settle();
				await host.replaceSource(bodyOf(6), { fromView: true });
				return { after: app.vault.getContent('Note.md')!, notices: Notice.notices.slice() };
			};
			const c1 = await click(first.host);
			const c2 = await click(first.host);
			first.el.closest('.hover-popover')?.remove();
			const reopened = open(now);
			await settle();
			const c3 = await click(reopened.host);
			reopened.el.closest('.hover-popover')?.remove();
			return { now: now.join('\n'), c1, c2, c3 };
		}
		test.each([
			['heading hover', 'Note#Tracker', NAMED, delTrackerRenameOther(endEdited)],
			['block embed RV', 'Note#^p', LOW, delLowerKeepMark(topEdited)],
		] as Array<[Shape, string, string[], (r: string[]) => string[]]>)('%s: refused (one Notice, nothing written), refused again on a second click of the same card, saved from a reopened preview', async (shape, link, mount, edit) => {
			const r = await twoClicksThenReopen(mount, link, shape, edit(mount));
			expect(r.c1).toEqual({ after: r.now, notices: dropped });
			expect(r.c2).toEqual({ after: r.now, notices: dropped });
			expect(values(r.c3.after)).toEqual(values(r.now).map((v, i) => (i === 0 ? 6 : v))); // the counter the reopened preview names is written
			expect(r.c3.notices).toEqual([]);
		});
	});

	describe('controls: saved into the counter the card was drawn from, no Notice', () => {
		const saved = (r: { now: string; after: string; notices: unknown[] }, want: { values?: number[]; names?: string[] }) => {
			if (want.values) expect(values(r.after)).toEqual(want.values);
			if (want.names) expect(names(r.after)).toEqual(want.names);
			expect(r.notices).toEqual([]);
		};
		test.each([
			['heading hover', 'card'],
			['heading embed RV', 'form'],
		] as Array<[Shape, Click]>)('%s, %s: nothing edited', async (shape, click) => {
			const r = await round({ mount: NAMED, link: 'Note#Tracker', shape, now: (x) => x, click });
			saved(r, click === 'card' ? { values: [6, 5] } : { names: ['Edited', 'Twin'] });
		});

		test.each([
			['heading hover', 'card'],
			['heading embed LP', 'form'],
		] as Array<[Shape, Click]>)('%s, %s: TOP and END edited', async (shape, click) => {
			const r = await round({ mount: NAMED, link: 'Note#Tracker', shape, now: (x) => x.map((l) => endEdited(topEdited(l))), click });
			saved(r, click === 'card' ? { values: [6, 5] } : { names: ['Edited', 'Twin'] });
		});

		test('heading hover, card: the Other counter changed to 9 and END edited (the body is twinned as drawn, unique now: one placement)', async () => {
			const r = await round({ mount: NAMED, link: 'Note#Tracker', shape: 'heading hover', now: (x) => x.map((l, i) => (i === 15 ? 'current_value: 9' : endEdited(l))), click: 'card' });
			saved(r, { values: [6, 9] });
		});

		test('heading embed RV, card: after the own +, an unrelated line edited above (TOP)', async () => {
			const r = await round({ mount: TWIN, link: 'Note#Tracker', shape: 'heading embed RV', plus: true, now: (x) => x.map(topEdited), click: 'card' });
			saved(r, { values: [7, 6] });
		});

		test('block hover, card: the upper counter changed to 9 and TOP edited', async () => {
			const r = await round({ mount: LOW, link: 'Note#^p', shape: 'block hover', now: (x) => x.map((l, i) => (i === 6 ? 'current_value: 9' : topEdited(l))), click: 'card' });
			saved(r, { values: [9, 6] });
		});
	});

	describe('the second timing (the outside write lands after the click placed the pin): refused already by the write-time rule (SC-612), on both', () => {
		test.each([
			['heading hover', 'card'],
			['heading embed RV', 'form'],
		] as Array<[Shape, Click]>)('%s, %s', async (shape, click) => {
			refused(await round({ mount: NAMED, link: 'Note#Tracker', shape, now: delTrackerRenameOther(endEdited), click, timing: 'after rebase' }));
		});
	});
});
