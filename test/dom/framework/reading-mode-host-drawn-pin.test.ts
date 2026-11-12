// SC-607 -- a card's + / - or a block edit form's Save in a hover preview or an embed of PART of a note that stayed open while the note changed
// from outside. Obsidian does not redraw such a preview when the part's own text is unchanged (the hovered one of two identical sections deleted,
// two heading names swapped), so the link (`![[note#Tracker]]`, `[[note#^id]]`) can name another, identical counter by the time of the click. The
// rule: the pin is placed through the link on the note as it is now, and accepted only when the block the card was DRAWN from (the note read when the
// card was mounted or re-bound, or this host's own last write, the newer first) maps STRICTLY (head-first and tail-first line maps agree) to that
// same line. Otherwise nothing is written and the "changed on disk first" Notice shows: never a different, identical counter.
// The sweep runs every construct x host x mode x click x hovered counter x outside edit x cache lag x + through that rule and asserts the outcome AND
// the Notice; the named tests are the shapes that matter on their own (N1-N7), the line map's give-up (more than 400 lines changed around the block),
// and the hover window guard (`hoverPopover.embed.data`).
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { noteHoverLink } from '../../../src/framework/host/hoverLinks';
import { droppedWriteMessage, resetDroppedWriteNotices } from '../../../src/framework/host/droppedWriteNotice';
import { App, Notice, Plugin } from '../../mocks/obsidian';

type Sec = { text: string; lineStart: number; lineEnd: number };
type Section = { current: Sec | null };
const ctxOf = (section: Section) =>
	({ docId: 'doc-607', sourcePath: 'Note.md', frontmatter: undefined, addChild: () => {}, getSectionInfo: () => section.current }) as never;
const CTR = (n: number, name = 'Twin'): string[] => ['```ds-counter', `name: ${name}`, `current_value: ${n}`, '```'];
const bodyOf = (n: number, name = 'Twin'): string => `name: ${name}\ncurrent_value: ${n}`;
const settle = () => new Promise((r) => setTimeout(r, 25)); // the card's note read (one cachedRead) is done
const pos = (line: number) => ({ line, col: 0, offset: 0 });
/** What Obsidian's metadata cache holds for `lines`: headings, and `^id` blocks (the id on its own line under the fence). */
function cacheOf(lines: string[]) {
	const headings: Array<{ heading: string; level: number; position: unknown }> = [];
	const blocks: Record<string, unknown> = {};
	let fenced = false;
	lines.forEach((l, i) => {
		if (/^```/.test(l)) fenced = !fenced;
		const h = !fenced && /^(#{1,6})\s+(.*)$/.exec(l);
		if (h) headings.push({ heading: h[2], level: h[1].length, position: { start: pos(i), end: pos(i) } });
		const id = /^\^(\w+)$/.exec(l);
		if (id) {
			let s = i - 1;
			while (s >= 0 && lines[s] !== '```') s--;
			for (s = s - 1; s >= 0 && !/^```\w/.test(lines[s]); s--);
			blocks[id[1]] = { id: id[1], position: { start: pos(s), end: pos(i - 1) } };
		}
	});
	return { headings, blocks };
}

type Kind = 'heading' | 'block';
type Shape = 'hover' | 'embed';
type Edit = 'none' | 'unrelated' | 'swap' | 'del-upper-adj' | 'del-upper-sep';
type Plus = 'no +' | '+ redrawn' | '+ stale';
type Popover = { hoverEl: HTMLElement; embed?: { data: unknown } };
/** The note: the upper (U) and lower (L) counters. `del` drops U (with its heading / marker). Returns the lines and the fence line of U and L (-1: gone). */
function noteOf(kind: Kind, edit: Edit, after: boolean, u: number, l: number): { lines: string[]; U: number; L: number } {
	const lines = ['# N', '', after && edit === 'unrelated' ? 'TOP edited' : 'TOP', ''];
	let U = -1;
	let L = -1;
	const del = after && edit.startsWith('del');
	const swapped = after && edit === 'swap';
	if (kind === 'heading') {
		const [hu, hl] = edit.startsWith('del') ? ['## Tracker', '## Tracker'] : swapped ? ['## Other', '## Tracker'] : ['## Tracker', '## Other'];
		if (!del) {
			lines.push(hu, '');
			U = lines.length;
			lines.push(...CTR(u), '');
		}
		if (edit === 'del-upper-sep') lines.push('## Mid', '', 'p-mid', '');
		lines.push(hl, '');
		L = lines.length;
		lines.push(...CTR(l), '', '## After', '', 'END');
	} else {
		const [mu, ml] = swapped ? ['^pb', '^pa'] : ['^pa', '^pb'];
		if (!del) {
			U = lines.length;
			lines.push(...CTR(u), mu, '');
		}
		if (edit !== 'del-upper-adj') lines.push('p-mid', '');
		L = lines.length;
		lines.push(...CTR(l), ml, '', 'END');
	}
	return { lines, U, L };
}
/** The part Obsidian draws for the hovered counter (value `v`) and the link. A heading hover is given the heading's BODY, an embed the heading too. */
function partOf(kind: Kind, shape: Shape, edit: Edit, upper: boolean, v: number): { sec: Sec; link: string } {
	if (kind === 'block') return { sec: { text: CTR(v).join('\n'), lineStart: 0, lineEnd: 3 }, link: upper ? 'Note#^pa' : 'Note#^pb' };
	const name = edit.startsWith('del') ? 'Tracker' : upper ? 'Tracker' : 'Other';
	if (shape === 'hover') return { sec: { text: ['', ...CTR(v), ''].join('\n'), lineStart: 1, lineEnd: 4 }, link: `Note#${name}` };
	return { sec: { text: [`## ${name}`, '', ...CTR(v), ''].join('\n'), lineStart: 2, lineEnd: 5 }, link: `Note#${name}` };
}
/** A hover popover of `link`, announced like Obsidian does (`hover-link`); `data` is what `hoverPopover.embed.data` holds (undefined: no `embed`, the internal API absent). */
function popoverEl(app: App, link: string, data?: unknown): { el: HTMLElement; popover: Popover } {
	const hoverEl = document.createElement('div');
	hoverEl.className = 'popover hover-popover';
	const embed = hoverEl.appendChild(document.createElement('div'));
	embed.className = 'markdown-embed';
	const sub = link.slice(link.indexOf('#'));
	if (sub.startsWith('#^')) embed.setAttribute('data-type', 'block');
	else {
		embed.setAttribute('data-type', 'heading');
		const h = embed.appendChild(document.createElement('h2'));
		h.setAttribute('data-heading', sub.split('#').pop()!);
	}
	const el = embed.appendChild(document.createElement('div'));
	document.body.appendChild(hoverEl);
	const popover: Popover = data === undefined ? { hoverEl } : { hoverEl, embed: { data } };
	noteHoverLink(app, { linktext: link, sourcePath: 'Host.md', hoverParent: { hoverPopover: popover } });
	return { el, popover };
}
function embedEl(src: string, lp: boolean): HTMLElement {
	const embed = document.createElement('div');
	embed.className = 'internal-embed markdown-embed';
	embed.setAttribute('src', src);
	const el = embed.appendChild(document.createElement('div'));
	if (lp) document.createElement('div').appendChild(embed).parentElement!.className = 'cm-embed-block';
	return el;
}
const noticeKind = (n: string): string => (n.includes('changed on disk first') ? 'dropped' : n.includes("can't tell where") ? 'unsavable' : 'other');
const values = (app: App): number[] => [...app.vault.getContent('Note.md')!.matchAll(/current_value: (\d+)/g)].map((m) => Number(m[1]));
const kindsNow = (): string[] => (Notice.notices as unknown[]).map((n) => noticeKind(String(n)));
/** What the click did: nothing ('refused'), the hovered counter (A: the one the card was drawn from), the other counter (TWIN), or neither (OTHER). */
function judge(app: App, nowText: string, A: number, B: number): { outcome: string; kinds: string[] } {
	const after = app.vault.getContent('Note.md')!;
	if (after === nowText) return { outcome: 'refused', kinds: kindsNow() };
	const al = after.split('\n');
	const nl = nowText.split('\n');
	const changed = (s: number) => s >= 0 && al.slice(s, s + 4).join('\n') !== nl.slice(s, s + 4).join('\n');
	return { outcome: changed(B) ? 'TWIN' : changed(A) ? 'A' : 'OTHER', kinds: kindsNow() };
}

type Cell = { kind: Kind; shape: Shape; mode: 'rv' | 'lp'; click: 'card' | 'form'; upper: boolean; edit: Edit; cache: 'fresh' | 'lagging'; plus: Plus };
async function run(c: Cell): Promise<{ outcome: string; kinds: string[] }> {
	const app = new App();
	const plus = c.plus !== 'no +';
	// before the outside edit the twin reads like the hovered counter will (after its own +: 6)
	const hovV = 5;
	const twinV = plus ? 6 : 5;
	const mount = noteOf(c.kind, c.edit, false, c.upper ? hovV : twinV, c.upper ? twinV : hovV);
	app.vault.setFile('Note.md', mount.lines.join('\n'));
	let cacheLines = mount.lines;
	jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheOf(cacheLines) as never);
	const p = partOf(c.kind, c.shape, c.edit, c.upper, hovV);
	const section: Section = { current: p.sec };
	// a hover preview holds the note it was drawn from in `hoverPopover.embed.data` (Obsidian's lastSavedData); neither an outside edit that does not redraw it nor a redraw from a changed part
	// (after this card's own +) refreshes it (measured, Obsidian 1.15.1): it stays the note as FIRST drawn
	const hover = c.shape === 'hover' ? popoverEl(app, p.link, mount.lines.join('\n')) : null;
	const el = hover ? hover.el : embedEl(p.link, c.mode === 'lp');
	const host = new ReadingModeBlockHost(new Plugin(app) as never, el, ctxOf(section), 'ds-counter');
	host.setMountedBody(bodyOf(hovV));
	await settle(); // the card is on screen: the note as drawn has been read
	let known = hovV;
	if (plus) {
		host.notePersistIntent();
		await settle();
		const ok = await host.replaceSource(bodyOf(6), { fromView: true });
		if (ok) known = 6;
		const post = noteOf(c.kind, c.edit, false, c.upper ? known : twinV, c.upper ? twinV : known);
		cacheLines = post.lines;
		if (c.plus === '+ redrawn' && ok) {
			// Obsidian redraws the part from the note as the + left it and the view is adopted into it
			section.current = partOf(c.kind, c.shape, c.edit, c.upper, known).sec;
			host.rebind(el, ctxOf(section));
			await settle();
		}
		Notice.notices.length = 0;
		resetDroppedWriteNotices();
	}
	const now = noteOf(c.kind, c.edit, true, c.upper ? known : twinV, c.upper ? twinV : known);
	const nowText = now.lines.join('\n');
	app.vault.setFile('Note.md', nowText);
	if (c.cache === 'fresh') cacheLines = now.lines;
	if (c.click === 'card') {
		host.notePersistIntent();
		await settle();
		await host.replaceSource(bodyOf(known + 1), { fromView: true });
	} else {
		const pin = host.pinPosition();
		await (pin ? host.replaceSource(bodyOf(known, 'Edited'), { pin, pinOnly: true }) : host.replaceSource(bodyOf(known, 'Edited')));
	}
	hover?.el.closest('.hover-popover')?.remove();
	return judge(app, nowText, c.upper ? now.U : now.L, c.upper ? now.L : now.U);
}
/**
 * What the rule says (the sweep asserts it for every cell; the hovered counter is A, the identical one the other):
 *  - nothing changed, or something unrelated above: A (the card's block maps to the link's line);
 *  - the hovered one of two ADJACENT identical blocks deleted, either one: refused (head-first and tail-first read the deletion differently);
 *  - deleted with something between: the lower survives and saves (both maps agree); the upper's block is gone: refused;
 *  - the two heading names / block ids swapped: the link now names the other counter, the card was drawn from this one: refused. After a + the part is
 *    stale, nothing places the pin through the link and this host's own write does: A;
 *  - the cache still lagging the edit: the link places nothing; the host's own write does when there was a +, else refused.
 */
function expected(c: Cell): 'A' | 'refused' {
	if (c.edit === 'none' || c.edit === 'unrelated') return 'A';
	if (c.edit === 'del-upper-adj') return 'refused';
	if (c.edit === 'del-upper-sep') return !c.upper && !(c.cache === 'lagging' && c.plus === 'no +') ? 'A' : 'refused';
	// swap
	if (c.plus === '+ stale') return 'A';
	if (c.cache === 'lagging') return c.plus === 'no +' ? 'refused' : 'A';
	return 'refused';
}

const cells: Cell[] = [];
for (const kind of ['heading', 'block'] as Kind[])
	for (const shape of ['hover', 'embed'] as Shape[])
		for (const mode of ['rv', 'lp'] as const)
			for (const click of ['card', 'form'] as const)
				for (const upper of [true, false])
					for (const edit of ['none', 'unrelated', 'swap', 'del-upper-adj', 'del-upper-sep'] as Edit[]) {
						if (kind === 'heading' && !upper && edit.startsWith('del')) continue; // a heading link names the FIRST of two same-name sections
						for (const cache of (edit === 'none' ? ['fresh'] : ['fresh', 'lagging']) as Array<'fresh' | 'lagging'>)
							for (const plus of ['no +', '+ redrawn', '+ stale'] as Plus[]) cells.push({ kind, shape, mode, click, upper, edit, cache, plus });
					}

describe('SC-607: a preview that stayed open while the note changed never writes a different, identical counter', () => {
	let warn: jest.SpyInstance;
	beforeEach(() => {
		resetDroppedWriteNotices();
		Notice.notices.length = 0;
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => {
		warn.mockRestore();
		jest.restoreAllMocks();
	});

	test('the sweep has every cell once', () => {
		expect(cells).toHaveLength(768);
		expect(new Set(cells.map((c) => JSON.stringify(c))).size).toBe(768);
	});

	test.each(cells)('$kind $shape $mode $click upper=$upper $edit $cache $plus', async (c) => {
		const r = await run(c);
		const want = expected(c);
		expect(r.outcome).toBe(want);
		// a save shows no Notice; a refusal shows exactly the one "changed on disk first" Notice (never "can't tell where")
		expect(r.kinds).toEqual(want === 'A' ? [] : ['dropped']);
	});

	// --- named shapes ---
	const blockHover = (app: App, lines: string[], link: string, sec: Sec, data?: unknown) => {
		app.vault.setFile('Note.md', lines.join('\n'));
		const section: Section = { current: sec };
		const { el, popover } = popoverEl(app, link, data);
		const host = new ReadingModeBlockHost(new Plugin(app) as never, el, ctxOf(section), 'ds-counter');
		return { host, el, section, popover };
	};
	const q = (l: string) => `> ${l}`;
	const CAL = (n: number): string[] => ['> [!note] Camp', ...CTR(n).map(q)];
	const dropped = [droppedWriteMessage('Note')];

	test('N1: the upper of two identical sections deleted between Obsidian\'s read and the card\'s note read, the cache still lagging at that read: the click is refused', async () => {
		const pre = noteOf('heading', 'del-upper-adj', false, 5, 5);
		const now = noteOf('heading', 'del-upper-adj', true, 5, 5);
		const app = new App();
		app.vault.setFile('Note.md', now.lines.join('\n')); // the read at mount already sees the edit
		let cacheLines = pre.lines; // the cache does not yet
		jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheOf(cacheLines) as never);
		const p = partOf('heading', 'hover', 'del-upper-adj', true, 5);
		const { el } = popoverEl(app, p.link);
		const host = new ReadingModeBlockHost(new Plugin(app) as never, el, ctxOf({ current: p.sec }), 'ds-counter');
		host.setMountedBody(bodyOf(5));
		await settle();
		cacheLines = now.lines; // caught up before the click
		host.notePersistIntent();
		await settle();
		await host.replaceSource(bodyOf(6), { fromView: true });
		el.closest('.hover-popover')?.remove();

		expect(app.vault.getContent('Note.md')).toBe(now.lines.join('\n')); // the hovered (upper) counter is gone: any write would be the other one
		expect(Notice.notices).toEqual(dropped);
	});

	test('N2: a hover whose section is the whole note and that has no recorded link, nothing edited: the + is saved', async () => {
		const pre = noteOf('block', 'none', false, 5, 5);
		const text = pre.lines.join('\n');
		const app = new App();
		app.vault.setFile('Note.md', text);
		jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheOf(pre.lines) as never);
		const popover = document.createElement('div');
		popover.className = 'popover hover-popover';
		const el = popover.appendChild(document.createElement('div'));
		document.body.appendChild(popover);
		const host = new ReadingModeBlockHost(new Plugin(app) as never, el, ctxOf({ current: { text, lineStart: pre.U, lineEnd: pre.U + 3 } }), 'ds-counter');
		host.setMountedBody(bodyOf(5));
		await settle();
		host.notePersistIntent();
		await settle();
		await host.replaceSource(bodyOf(6), { fromView: true });
		popover.remove();

		expect(judge(app, text, pre.U, pre.L)).toEqual({ outcome: 'A', kinds: [] });
	});

	test('N3: a block hover of the upper of two adjacent identical callouts, a + (the part stays stale), the upper deleted from outside, then the form Save: refused', async () => {
		const pre = ['# N', '', 'TOP', '', ...CAL(5), '', '^ca', '', ...CAL(6), '', '^cb', '', 'END'];
		const now = ['# N', '', 'TOP', '', ...CAL(6), '', '^cb', '', 'END'];
		const app = new App();
		let cacheLines = pre;
		jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(
			() => ({ headings: [], blocks: Object.fromEntries(cacheLines.flatMap((l, i) => (/^\^c\w$/.test(l) ? [[l.slice(1), { id: l.slice(1), position: { start: pos(i - 6), end: pos(i - 2) } }]] : []))) }) as never,
		);
		const { host, el } = blockHover(app, pre, 'Note#^ca', { text: CAL(5).join('\n'), lineStart: 0, lineEnd: 4 }, pre.join('\n'));
		host.setMountedBody(bodyOf(5));
		await settle();
		host.notePersistIntent();
		await settle();
		expect(await host.replaceSource(bodyOf(6), { fromView: true })).toBe(true);
		Notice.notices.length = 0;
		resetDroppedWriteNotices();
		app.vault.setFile('Note.md', now.join('\n'));
		cacheLines = now;
		const pin = host.pinPosition();
		await (pin ? host.replaceSource(bodyOf(6, 'Edited'), { pin, pinOnly: true }) : host.replaceSource(bodyOf(6, 'Edited')));
		el.closest('.hover-popover')?.remove();

		expect(app.vault.getContent('Note.md')).toBe(now.join('\n')); // the surviving callout is the twin of the one the + was pressed on
		expect(Notice.notices).toEqual(dropped);
	});

	test('N4: a block hover of the lower of two adjacent identical blocks, a +, the upper deleted from outside before the redraw, the redraw (rebind), then a +: saved in the hovered block', async () => {
		const pre = ['# N', '', 'TOP', '', ...CTR(6), '^pa', '', ...CTR(5), '^pb', '', 'END'];
		const now = ['# N', '', 'TOP', '', ...CTR(6), '^pb', '', 'END'];
		const app = new App();
		let cacheLines = pre;
		jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheOf(cacheLines) as never);
		const { host, el, section, popover } = blockHover(app, pre, 'Note#^pb', { text: CTR(5).join('\n'), lineStart: 0, lineEnd: 3 }, pre.join('\n'));
		host.setMountedBody(bodyOf(5));
		await settle();
		host.notePersistIntent();
		await settle();
		expect(await host.replaceSource(bodyOf(6), { fromView: true })).toBe(true);
		app.vault.setFile('Note.md', now.join('\n'));
		cacheLines = now;
		section.current = { text: CTR(6).join('\n'), lineStart: 0, lineEnd: 3 };
		host.rebind(el, ctxOf(section));
		await settle();
		Notice.notices.length = 0;
		resetDroppedWriteNotices();
		host.notePersistIntent();
		await settle();
		await host.replaceSource(bodyOf(7), { fromView: true });
		el.closest('.hover-popover')?.remove();

		expect(judge(app, now.join('\n'), 4, -1)).toEqual({ outcome: 'A', kinds: [] });
	});

	test('N5: a block hover of a unique counter, deleted from outside while another counter is edited to read like it: the + is not written there', async () => {
		const pre = ['# N', '', 'TOP', '', ...CTR(5), '^pa', '', 'mid', '', ...CTR(7), '^pb', '', 'END'];
		const now = ['# N', '', 'TOP', '', 'mid', '', ...CTR(5), '^pb', '', 'END'];
		const app = new App();
		let cacheLines = pre;
		jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheOf(cacheLines) as never);
		const { host, el } = blockHover(app, pre, 'Note#^pa', { text: CTR(5).join('\n'), lineStart: 0, lineEnd: 3 }, pre.join('\n'));
		host.setMountedBody(bodyOf(5));
		await settle();
		app.vault.setFile('Note.md', now.join('\n'));
		cacheLines = now;
		host.notePersistIntent();
		await settle();
		await host.replaceSource(bodyOf(6), { fromView: true });
		el.closest('.hover-popover')?.remove();

		expect(app.vault.getContent('Note.md')).toBe(now.join('\n'));
		expect(Notice.notices).toEqual(dropped);
	});

	test('N6: a block hover of a unique counter, deleted from outside while an identical counter is pasted elsewhere: the + is not written into the pasted one', async () => {
		const pre = ['# N', '', 'TOP', '', ...CTR(5), '^pa', '', 'mid', '', 'END'];
		const now = ['# N', '', 'TOP', '', 'mid', '', 'pasted', '', ...CTR(5), '', 'END'];
		const app = new App();
		let cacheLines = pre;
		jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheOf(cacheLines) as never);
		const { host, el } = blockHover(app, pre, 'Note#^pa', { text: CTR(5).join('\n'), lineStart: 0, lineEnd: 3 }, pre.join('\n'));
		host.setMountedBody(bodyOf(5));
		await settle();
		app.vault.setFile('Note.md', now.join('\n'));
		cacheLines = now;
		host.notePersistIntent();
		await settle();
		await host.replaceSource(bodyOf(6), { fromView: true });
		el.closest('.hover-popover')?.remove();

		expect(app.vault.getContent('Note.md')).toBe(now.join('\n')); // a line diff alone reads the deletion plus the paste as a move
		expect(Notice.notices).toEqual(dropped);
	});

	test('N7: lines inserted above the sections from outside (every line below moves), the cache fresh: the + is saved in the hovered counter', async () => {
		const pre = noteOf('heading', 'swap', false, 5, 5);
		const now = { lines: ['# N', '', 'added 1', 'added 2', ...pre.lines.slice(2)], U: pre.U + 2, L: pre.L + 2 };
		const app = new App();
		app.vault.setFile('Note.md', pre.lines.join('\n'));
		let cacheLines = pre.lines;
		jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheOf(cacheLines) as never);
		const p = partOf('heading', 'hover', 'swap', true, 5);
		const { el } = popoverEl(app, p.link, pre.lines.join('\n'));
		const host = new ReadingModeBlockHost(new Plugin(app) as never, el, ctxOf({ current: p.sec }), 'ds-counter');
		host.setMountedBody(bodyOf(5));
		await settle();
		app.vault.setFile('Note.md', now.lines.join('\n'));
		cacheLines = now.lines;
		host.notePersistIntent();
		await settle();
		await host.replaceSource(bodyOf(6), { fromView: true });
		el.closest('.hover-popover')?.remove();

		expect(judge(app, now.lines.join('\n'), now.U, now.L)).toEqual({ outcome: 'A', kinds: [] });
	});

	// --- the line map gives up (more than 400 lines changed on both sides of the block) ---
	describe('the line map gives up: the link places the pin only while the body is unique', () => {
		const para = (n: number, tag: string): string[] => Array.from({ length: n }, (_, i) => `${tag} ${i}`);
		const trackerPart = ['## Tracker', '', ...CTR(5), ''];
		/** The note; the counter under `## Other` holds `other` (5: identical to the Tracker counter). */
		const noteWith = (other: number): string[] => ['# N', '', ...para(300, 'above'), '', ...trackerPart, '## Other', '', ...CTR(other), '', '## After', '', ...para(300, 'below')];
		/**
		 * A heading embed `![[Note#Tracker]]` drawn from the note with `drawnOther` under `## Other`; 500 lines are inserted above and 500 below from outside
		 * while it stays open (its part is unchanged: no redraw), `nowOther` under `## Other` then; the + is pressed.
		 */
		async function bigRewrite(drawnOther: number, nowOther: number) {
			const pre = noteWith(drawnOther);
			const app = new App();
			app.vault.setFile('Note.md', pre.join('\n'));
			let cacheLines = pre;
			jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheOf(cacheLines) as never);
			const section: Section = { current: { text: trackerPart.join('\n'), lineStart: 2, lineEnd: 5 } };
			const host = new ReadingModeBlockHost(new Plugin(app) as never, embedEl('Note#Tracker', false), ctxOf(section), 'ds-counter');
			host.setMountedBody(bodyOf(5));
			await settle();
			const outside = ['# N', '', ...para(500, 'inserted above'), ...noteWith(nowOther).slice(1), ...para(500, 'inserted below')];
			app.vault.setFile('Note.md', outside.join('\n'));
			cacheLines = outside;
			host.notePersistIntent();
			await settle();
			const ok = await host.replaceSource(bodyOf(6), { fromView: true });
			return { app, outside: outside.join('\n'), ok };
		}

		test('the body is unique in the note as drawn and now: the + is saved (the link places it; nothing identical to confuse it with)', async () => {
			const { app, outside, ok } = await bigRewrite(9, 9);

			expect(ok).toBe(true);
			expect(app.vault.getContent('Note.md')).toBe(outside.replace('current_value: 5', 'current_value: 6'));
			expect(Notice.notices).toEqual([]);
		});

		test.each([
			['control: an identical counter under another heading, as drawn and now', 5, 5],
			['the body was twice in the note as drawn and is unique now', 5, 9],
			['the body was unique in the note as drawn and is twice now', 9, 5],
		])('%s: refused (the link is not enough once the line map cannot say which counter the card was drawn from)', async (_name, drawnOther, nowOther) => {
			const { app, outside, ok } = await bigRewrite(drawnOther, nowOther);

			expect(ok).toBe(false);
			expect(app.vault.getContent('Note.md')).toBe(outside);
			expect(Notice.notices).toEqual(dropped);
		});
	});

	// --- the hover window: the card's note read can come after an outside edit that Obsidian's own read did not see ---
	describe('the hover window guard: hoverPopover.embed.data is what the preview was drawn from', () => {
		/** A heading hover of `Tracker` (the upper counter); the names are swapped from outside BEFORE the card reads the note (Obsidian's own read, `embed.data`, saw the old note). */
		async function swappedBeforeTheCardRead(data: unknown, link = 'Note#Tracker') {
			const pre = noteOf('heading', 'none', false, 5, 5);
			const now = noteOf('heading', 'swap', true, 5, 5);
			const app = new App();
			app.vault.setFile('Note.md', now.lines.join('\n')); // the card's read sees the swap, and the cache has caught up
			jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheOf(now.lines) as never);
			const p = partOf('heading', 'hover', 'none', true, 5);
			const { el } = popoverEl(app, link, data === 'old note' ? pre.lines.join('\n') : data);
			const host = new ReadingModeBlockHost(new Plugin(app) as never, el, ctxOf({ current: p.sec }), 'ds-counter');
			host.setMountedBody(bodyOf(5));
			await settle();
			host.notePersistIntent();
			await settle();
			await host.replaceSource(bodyOf(6), { fromView: true });
			el.closest('.hover-popover')?.remove();
			return { app, now };
		}

		test('data is a string that is not the text the card read: refused (the card was drawn from the note as Obsidian read it, the link names the other counter now)', async () => {
			const { app, now } = await swappedBeforeTheCardRead('old note');

			expect(app.vault.getContent('Note.md')).toBe(now.lines.join('\n'));
			expect(Notice.notices).toEqual(dropped);
		});

		test('data is the text the card read: the check passes and the + is saved in the counter under the link', async () => {
			const now = noteOf('heading', 'swap', true, 5, 5);
			const { app } = await swappedBeforeTheCardRead(now.lines.join('\n'));

			expect(judge(app, now.lines.join('\n'), now.L, now.U)).toEqual({ outcome: 'A', kinds: [] }); // the counter the link names (the lower: the swapped names)
		});

		test('a second + after the first, the preview redrawn from the note the first + wrote while its popover data still holds the note as first drawn: saved (a re-bind is not checked)', async () => {
			const pre = noteOf('heading', 'none', false, 5, 5);
			const app = new App();
			app.vault.setFile('Note.md', pre.lines.join('\n'));
			let cacheLines = pre.lines;
			jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheOf(cacheLines) as never);
			const p = partOf('heading', 'hover', 'none', true, 5);
			const section: Section = { current: p.sec };
			const { el } = popoverEl(app, p.link, pre.lines.join('\n'));
			const host = new ReadingModeBlockHost(new Plugin(app) as never, el, ctxOf(section), 'ds-counter');
			host.setMountedBody(bodyOf(5));
			await settle();
			host.notePersistIntent();
			await settle();
			expect(await host.replaceSource(bodyOf(6), { fromView: true })).toBe(true);
			cacheLines = noteOf('heading', 'none', false, 6, 5).lines;
			section.current = partOf('heading', 'hover', 'none', true, 6).sec; // Obsidian redrew the part from the note as the + left it (its popover data is not refreshed)
			host.rebind(el, ctxOf(section));
			await settle();
			host.notePersistIntent();
			await settle();
			await host.replaceSource(bodyOf(7), { fromView: true });
			el.closest('.hover-popover')?.remove();

			expect(values(app)).toEqual([7, 5]);
			expect(Notice.notices).toEqual([]);
		});

		test('the preview was redrawn from a note an outside edit changed (a NEW card, mounted after the edit) while its popover data still holds the note as first drawn: the + is saved', async () => {
			const pre = noteOf('heading', 'none', false, 5, 5);
			const now = noteOf('heading', 'none', false, 9, 5); // the hovered counter edited from outside: the part changes, so Obsidian redraws it
			const app = new App();
			app.vault.setFile('Note.md', now.lines.join('\n'));
			jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheOf(now.lines) as never);
			const p = partOf('heading', 'hover', 'none', true, 9);
			const { el } = popoverEl(app, p.link, pre.lines.join('\n'));
			const host = new ReadingModeBlockHost(new Plugin(app) as never, el, ctxOf({ current: p.sec }), 'ds-counter');
			host.setMountedBody(bodyOf(9));
			await settle();
			host.notePersistIntent();
			await settle();
			await host.replaceSource(bodyOf(10), { fromView: true });
			el.closest('.hover-popover')?.remove();

			expect(values(app)).toEqual([10, 5]);
			expect(Notice.notices).toEqual([]);
		});

		test('an embed drawn INSIDE a hover preview of another note: the popover\'s data is that other note\'s text, so the check does not apply to the embed\'s card (it saves)', async () => {
			const now = noteOf('heading', 'none', false, 5, 5);
			const app = new App();
			app.vault.setFile('Note.md', now.lines.join('\n'));
			jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheOf(now.lines) as never);
			const outer = popoverEl(app, 'Outer#Host', 'the text of the note the preview shows, which embeds Note.md');
			const embed = outer.el.appendChild(document.createElement('div'));
			embed.className = 'internal-embed markdown-embed';
			embed.setAttribute('src', 'Note#Tracker');
			const el = embed.appendChild(document.createElement('div'));
			const p = partOf('heading', 'embed', 'none', true, 5);
			const host = new ReadingModeBlockHost(new Plugin(app) as never, el, ctxOf({ current: p.sec }), 'ds-counter');
			host.setMountedBody(bodyOf(5));
			await settle();
			host.notePersistIntent();
			await settle();
			await host.replaceSource(bodyOf(6), { fromView: true });
			outer.el.closest('.hover-popover')?.remove();

			expect(judge(app, now.lines.join('\n'), now.U, now.L)).toEqual({ outcome: 'A', kinds: [] });
		});

		test.each([
			['no embed on the popover (the internal API is absent)', undefined],
			['embed.data is not a string', 12345],
		])('%s: the check is skipped, never a refusal on its absence', async (_name, data) => {
			const now = noteOf('heading', 'none', false, 5, 5);
			const app = new App();
			app.vault.setFile('Note.md', now.lines.join('\n'));
			jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheOf(now.lines) as never);
			const p = partOf('heading', 'hover', 'none', true, 5);
			const { el } = popoverEl(app, p.link, data);
			const host = new ReadingModeBlockHost(new Plugin(app) as never, el, ctxOf({ current: p.sec }), 'ds-counter');
			host.setMountedBody(bodyOf(5));
			await settle();
			host.notePersistIntent();
			await settle();
			await host.replaceSource(bodyOf(6), { fromView: true });
			el.closest('.hover-popover')?.remove();

			expect(judge(app, now.lines.join('\n'), now.U, now.L)).toEqual({ outcome: 'A', kinds: [] });
		});
	});
});
