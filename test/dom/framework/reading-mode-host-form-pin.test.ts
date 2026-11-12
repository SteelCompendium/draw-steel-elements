// SC-596 -- a block edit form drawn in an embed or hover preview of PART of a note (`![[note#^a]]`, `![[note#Heading]]`, a hover of a block or heading
// link) is placed exactly like a card's (SC-594 `rebaseCardPin`: the link, checked by `cardLinkLine`, else this host's own last write, else
// refused), never by a search for the part's text, and a form there that cannot be pinned gets a REFUSING pin: Save writes
// nothing and shows a Notice, it never falls back to a write without `pinOnly` (the part's line numbers and the body against the whole
// note, which finds an identical twin when the form's block was edited from outside before the form opened).
// The sweep runs a form Save through every construct x link shape x host x outside edit x + x cache lag x twin layout; the named tests are the
// shapes that matter on their own (the ticket's two hazards, the null-pin shapes, the shapes that save today, the lagging-cache guards).
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { noteHoverLink } from '../../../src/framework/host/hoverLinks';
import { resetDroppedWriteNotices } from '../../../src/framework/host/droppedWriteNotice';
import { App, Notice, Plugin } from '../../mocks/obsidian';
import type { MarkdownPostProcessorContext } from '../../mocks/obsidian';

type Sec = { text: string; lineStart: number; lineEnd: number };
type Section = { current: Sec | null };

function switchableCtx(section: Section): MarkdownPostProcessorContext {
	return { docId: 'doc-596', sourcePath: 'Note.md', frontmatter: undefined, addChild: () => {}, getSectionInfo: () => section.current } as never;
}
const CTR = (n: number, name = 'Twin'): string[] => ['```ds-counter', `name: ${name}`, `current_value: ${n}`, '```'];
const bodyOf = (n: number, name = 'Twin'): string => `name: ${name}\ncurrent_value: ${n}`;
const q = (l: string) => `> ${l}`;
const qq = (l: string) => `> > ${l}`;
const ind = (n: number) => (l: string) => `${' '.repeat(n)}${l}`;
// [name, build(value) -> lines, offset of the counter's fence inside the construct, plain (its section IS the fence)]
type Construct = [string, (v: number) => string[], number, boolean];
const CONSTRUCTS: Construct[] = [
	['plain fence', (v) => CTR(v), 0, true],
	['callout', (v) => ['> [!note] Camp', ...CTR(v).map(q), '> after'], 1, false],
	['header-less quote', (v) => ['> intro', ...CTR(v).map(q)], 1, false],
	['quote, first line is the fence', (v) => [...CTR(v).map(q), '> after'], 0, false],
	['nested callout', (v) => ['> [!note] Outer', '> > [!tip] Inner', ...CTR(v).map(qq)], 2, false],
	['nested quote, first line is the fence', (v) => [...CTR(v).map(qq), '> > after'], 0, false],
	['list item', (v) => ['- item', ...CTR(v).map(ind(2))], 1, false],
	['footnote', (v) => ['[^1]: note', ...CTR(v).map(ind(4))], 1, false],
];
type Shape = 'heading hover' | 'block hover' | 'heading embed' | 'block embed' | 'whole-note hover' | 'whole-note embed';
const SHAPES: Shape[] = ['heading hover', 'block hover', 'heading embed', 'block embed', 'whole-note hover', 'whole-note embed'];
type Edit = 'none' | 'own edited' | 'own deleted';
const EDITS: Edit[] = ['none', 'own edited', 'own deleted'];
type Plus = 'no +' | '+ (part pre-+)' | '+ (part redrawn after +)';
const PLUSES: Plus[] = ['no +', '+ (part pre-+)', '+ (part redrawn after +)'];
type Cache = 'fresh' | 'lagging';

/**
 * The note. Layout 'twin elsewhere': the twin B in the top section, then `## Tracker` holding A. Layout 'same-name section': A under the FIRST
 * `## Tracker` (the one Obsidian embeds / a heading link names first), B under a SECOND `## Tracker` below. Block shapes carry ids (`^a` names A).
 * `a === null`: A deleted.
 */
type Layout = 'twin elsewhere' | 'same-name section';
const LAYOUTS: Layout[] = ['twin elsewhere', 'same-name section'];
function noteOf(build: (v: number) => string[], plain: boolean, a: number | null, b: number, ids: boolean, layout: Layout = 'twin elsewhere'): { lines: string[]; aStart: number; bStart: number } {
	const idLines = (id: string) => (!ids ? [] : plain ? [`^${id}`] : ['', `^${id}`]);
	const lines = ['# N', ''];
	let aStart = -1;
	let bStart = -1;
	const pushA = () => {
		aStart = a === null ? -1 : lines.length;
		if (a !== null) lines.push(...build(a), ...idLines('a'), '');
	};
	if (layout === 'twin elsewhere') {
		bStart = lines.length;
		lines.push(...build(b), ...idLines('b'), '', 'p-twin', '', '## Tracker', '');
		pushA();
	} else {
		lines.push('## Tracker', '');
		pushA();
		lines.push('## Mid', '', 'p-mid', '', '## Tracker', '');
		bStart = lines.length;
		lines.push(...build(b), ...idLines('b'), '');
	}
	lines.push('## After', '', 'END');
	return { lines, aStart, bStart };
}
const pos = (line: number) => ({ line, col: 0, offset: 0 });
function cacheFor(lines: string[], aStart: number, bStart: number, len: number) {
	const headings: Array<{ heading: string; level: number; position: unknown }> = [];
	let fenced = false;
	lines.forEach((l, i) => {
		if (/^```/.test(l)) fenced = !fenced;
		const h = !fenced && /^(#{1,6})\s+(.*)$/.exec(l);
		if (h) headings.push({ heading: h[2], level: h[1].length, position: { start: pos(i), end: pos(i) } });
	});
	const blocks: Record<string, unknown> = { b: { id: 'b', position: { start: pos(bStart), end: pos(bStart + len - 1) } } };
	if (aStart >= 0) blocks.a = { id: 'a', position: { start: pos(aStart), end: pos(aStart + len - 1) } };
	return { headings, blocks };
}
/** A hover preview card, with the DOM Obsidian draws for its link (data-type / data-heading, measured 1.15.1) and the hover-link event noted. */
function popoverEl(app: App, link: string | null): { popover: HTMLElement; el: HTMLElement } {
	const popover = document.createElement('div');
	popover.className = 'popover hover-popover';
	const embed = popover.appendChild(document.createElement('div'));
	embed.className = 'markdown-embed';
	const sub = link !== null && link.includes('#') ? link.slice(link.indexOf('#')) : null;
	if (sub !== null && sub.startsWith('#^')) embed.setAttribute('data-type', 'block');
	else if (sub !== null) {
		embed.setAttribute('data-type', 'heading');
		const h = embed.appendChild(document.createElement('h2'));
		h.setAttribute('data-heading', sub.split('#').pop()!);
	}
	const el = embed.appendChild(document.createElement('div'));
	document.body.appendChild(popover);
	if (link !== null) noteHoverLink(app, { linktext: link, sourcePath: 'Host.md', hoverParent: { hoverPopover: { hoverEl: popover } } });
	return { popover, el };
}
function embedEl(src: string, lp: boolean): HTMLElement {
	const embed = document.createElement('div');
	embed.className = 'internal-embed markdown-embed';
	embed.setAttribute('src', src);
	const el = embed.appendChild(document.createElement('div'));
	if (lp) document.createElement('div').appendChild(embed).parentElement!.className = 'cm-embed-block';
	return el;
}
const settle = () => new Promise((r) => setTimeout(r, 25));
/** The block edit form's Save, exactly FormModal.save (FormModal.ts:543-545): pin-only through its pin, or a plain write with NO pin. */
const formSave = (host: ReadingModeBlockHost, pin: ReturnType<ReadingModeBlockHost['pinPosition']>, body: string) =>
	pin ? host.replaceSource(body, { pin, pinOnly: true }) : host.replaceSource(body);

/** The part Obsidian reports for the card on A, drawn from `drawn` (A at `aStart`). */
function partOf(shape: Shape, drawn: { lines: string[]; aStart: number }, aLines: string[], off: number, plain: boolean): Sec {
	const len = aLines.length;
	const winStart = plain ? off : 0;
	const winEnd = plain ? off + 3 : len - 1;
	if (shape === 'heading hover') return { text: ['', ...aLines, '', ''].join('\n'), lineStart: 1 + winStart, lineEnd: 1 + winEnd }; // the heading's BODY, measured
	if (shape === 'block hover' || shape === 'block embed') return { text: aLines.join('\n'), lineStart: winStart, lineEnd: winEnd };
	if (shape === 'heading embed') return { text: ['## Tracker', '', ...aLines, ''].join('\n'), lineStart: 2 + winStart, lineEnd: 2 + winEnd };
	return { text: drawn.lines.join('\n'), lineStart: drawn.aStart + winStart, lineEnd: drawn.aStart + winEnd };
}

type Result = { pin: 'pin' | 'null-pin'; outcome: 'A' | 'TWIN' | 'OTHER' | 'refused'; kinds: string[] };
const noticeKind = (n: string): string =>
	n.includes('changed on disk first') ? 'dropped' : n.includes("can't be edited yet") ? 'unsavable-list' : n.includes("can't tell where") ? 'unsavable' : 'other';

/**
 * One cell of the sweep: a form on counter A opened in an embed / hover preview of a note that holds an identical counter B elsewhere. The
 * outside edit (A edited to 9 or deleted) lands just BEFORE the pencil, so the part Obsidian reports is still the one drawn before it. Save
 * follows `FormModal.save` exactly (`formSave`).
 */
async function cell(c: Construct, shape: Shape, hostKind: 'rv' | 'lp', edit: Edit, plus: Plus, cache: Cache, layout: Layout): Promise<Result & { listWindow: boolean }> {
	const [, build, off, plain] = c;
	resetDroppedWriteNotices();
	Notice.notices.length = 0;
	const ids = shape.startsWith('block');
	const withPlus = plus !== 'no +';
	const len = build(5).length;
	// before: A 5; the twin B 5 (no +) or 6 (the + will make A read like B)
	const pre = noteOf(build, plain, 5, withPlus ? 6 : 5, ids, layout);
	const app = new App();
	app.vault.setFile('Note.md', pre.lines.join('\n'));
	let cacheNote = pre;
	jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheFor(cacheNote.lines, cacheNote.aStart, cacheNote.bStart, len) as never);
	const section: Section = { current: partOf(shape, pre, build(5), off, plain) };
	let el: HTMLElement;
	let popover: HTMLElement | null = null;
	const linktext = shape === 'heading hover' ? 'Note#Tracker' : shape === 'block hover' ? 'Note#^a' : shape === 'whole-note hover' ? 'Note' : null;
	if (shape.endsWith('hover')) ({ popover, el } = popoverEl(app, linktext));
	else el = embedEl(shape === 'heading embed' ? 'Note#Tracker' : shape === 'block embed' ? 'Note#^a' : 'Note', hostKind === 'lp');
	const host = new ReadingModeBlockHost(new Plugin(app) as never, el, switchableCtx(section) as never, 'ds-counter');
	host.setMountedBody(bodyOf(5));
	let known = 5;
	if (withPlus) {
		host.notePersistIntent();
		await settle();
		const ok = await host.replaceSource(bodyOf(6), { fromView: true });
		const afterPlus = app.vault.getContent('Note.md')!;
		const plusLanded = ok && afterPlus.split('\n').slice(pre.aStart, pre.aStart + len).some((l) => /current_value: 6/.test(l));
		if (plusLanded) known = 6;
		const post = noteOf(build, plain, known, 6, ids, layout);
		cacheNote = post;
		if (plus === '+ (part redrawn after +)') section.current = partOf(shape, post, build(known), off, plain);
		Notice.notices.length = 0;
		resetDroppedWriteNotices();
	}
	// the outside edit, just BEFORE the form opens (the part is not redrawn yet)
	const now = noteOf(build, plain, edit === 'own edited' ? 9 : edit === 'own deleted' ? null : known, withPlus ? 6 : 5, ids, layout);
	const nowText = now.lines.join('\n');
	app.vault.setFile('Note.md', nowText);
	if (cache === 'fresh') cacheNote = now;
	const pin = host.pinPosition();
	const sec = section.current!;
	const listWindow = nowText.split('\n').slice(sec.lineStart, sec.lineEnd + 1).some((l) => /^[ \t]*(?:[-*+]|\d+[.)])[ \t]/.test(l) || /^ {2,}[`~]{3,}/.test(l));
	await formSave(host, pin, bodyOf(known, 'Edited'));
	popover?.remove();
	const after = app.vault.getContent('Note.md')!;
	const kinds = (Notice.notices as unknown[]).map((n) => noticeKind(String(n)));
	const base = { pin: pin === null ? ('null-pin' as const) : ('pin' as const), kinds, listWindow };
	if (after === nowText) return { ...base, outcome: 'refused' };
	const al = after.split('\n');
	const editedIn = (start: number) => start >= 0 && al.slice(start, start + len).some((l) => /name: Edited/.test(l));
	const outcome = editedIn(now.bStart) ? 'TWIN' : editedIn(now.aStart) ? 'A' : 'OTHER';
	return { ...base, outcome };
}

/**
 * The rule's result for a cell (SC-596: a form's pin in an embed / hover preview of part of a note is placed exactly like a card's, never by a
 * search for the part's text, and a form that cannot be pinned is refused, never given no pin).
 *  - the form's block edited or deleted from outside before the pencil: refused, "changed on disk first" (a list item or a footnote: the
 *    "can't tell where" wording, as before; which of its two texts shows is decided by the note's own lines at the part, `listWindow`);
 *  - nothing edited: saved into A, except a heading link of a note with TWO `## Tracker` sections holding identical counters and no + first
 *    (the link names two places while the body occurs twice: refused, as a card is since SC-594) - and list items / footnotes, which have no
 *    own fence in the part and are refused as they were.
 */
function expected(cname: string, shape: Shape, edit: Edit, plus: Plus, layout: Layout, listWindow: boolean): { outcome: Result['outcome']; kind: string | null } {
	if (cname === 'list item' || cname === 'footnote') return { outcome: 'refused', kind: listWindow ? 'unsavable-list' : 'unsavable' };
	if (edit !== 'none') return { outcome: 'refused', kind: 'dropped' };
	if (layout === 'same-name section' && (shape === 'heading embed' || shape === 'heading hover') && plus === 'no +') return { outcome: 'refused', kind: 'dropped' };
	return { outcome: 'A', kind: null };
}

describe('SC-596: a block edit form in an embed or hover preview of part of a note is placed like a card, never by a search for the part', () => {
	let warn: jest.SpyInstance;
	beforeEach(() => {
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => {
		warn.mockRestore();
		jest.restoreAllMocks();
	});
	// 8 constructs x 6 link shapes x RV / LP x edit (none / edited / deleted) x + (none / part from before / part redrawn after) x cache (fresh /
	// lagging, an unedited note has no lag) x 2 twin layouts = 2880 cells. The part's twin is never written.
	const cases = LAYOUTS.flatMap((layout) => CONSTRUCTS.flatMap((c) =>
		SHAPES.flatMap((shape) =>
			(['rv', 'lp'] as const).flatMap((hostKind) =>
				EDITS.flatMap((edit) =>
					PLUSES.flatMap((plus) => ((edit === 'none' ? ['fresh'] : ['fresh', 'lagging']) as Cache[]).map((cache) => ({ layout, c, cname: c[0], shape, hostKind, edit, plus, cache }))),
				),
			),
		),
	));
	test.each(cases)('$layout | $cname | $shape | $hostKind | $edit | $plus | $cache', async ({ layout, c, cname, shape, hostKind, edit, plus, cache }) => {
		const got = await cell(c, shape, hostKind, edit, plus, cache, layout);
		const want = expected(cname, shape, edit, plus, layout, got.listWindow);
		expect(got.outcome).not.toBe('TWIN');
		// a form here is ALWAYS given a pin (a refusing one when nothing places it), never none: a pin is what keeps a form open past its card when the
		// note is shown in another pane (`FormModal.hasPin`, SC-552), so this is the list of shapes whose close-on-redraw changed - every shape, list items
		// and footnotes included: the pin of a list item / footnote is refusing, and its Save says "can't be edited yet inside lists"
		expect(got.pin).toBe('pin');
		expect(got.outcome).toBe(want.outcome);
		expect(got.kinds).toEqual(want.kind === null ? [] : [want.kind]);
	});
});

describe('SC-596: named shapes of a form in an embed or hover preview', () => {
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
	const names = (app: App): string[] => [...app.vault.getContent('Note.md')!.matchAll(/name: (\w+)/g)].map((m) => m[1]);
	function cacheOfText(text: string) {
		const lines = text.split(/\r?\n/);
		const headings: Array<{ heading: string; level: number; position: unknown }> = [];
		const blocks: Record<string, { id: string; position: unknown }> = {};
		let fenced = false;
		lines.forEach((l, i) => {
			if (/^```/.test(l)) fenced = !fenced;
			const h = !fenced && /^(#{1,6})\s+(.*)$/.exec(l);
			if (h) headings.push({ heading: h[2], level: h[1].length, position: { start: pos(i), end: pos(i) } });
			const id = /^\^(\w+)$/.exec(l);
			if (id) {
				let end = i - 1;
				while (end >= 0 && lines[end] === '') end--;
				let start = end;
				if (lines[end] === '```') for (start = end - 1; start >= 0 && !/^```\w/.test(lines[start]); start--);
				blocks[id[1]] = { id: id[1], position: { start: pos(start), end: pos(end) } };
			}
		});
		return { headings, blocks };
	}
	function make(full: string, sec: Sec, el: HTMLElement, body: string, cache: string | object = full) {
		const app = new App();
		app.vault.setFile('Note.md', full);
		jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => (typeof cache === 'string' ? cacheOfText(cache) : cache) as never);
		const section: Section = { current: sec };
		const host = new ReadingModeBlockHost(new Plugin(app) as never, el, switchableCtx(section) as never, 'ds-counter');
		host.setMountedBody(body);
		return { app, host, section };
	}
	const hoverIn = (app: App, link: string | null) => popoverEl(app, link).el;

	const kinds = (): string[] => (Notice.notices as unknown[]).map((n) => noticeKind(String(n)));
	/** Nothing was written, exactly one Notice, of this kind. */
	const expectRefused = (app: App, disk: string, kind: string) => {
		expect(app.vault.getContent('Note.md')).toBe(disk);
		expect(kinds()).toEqual([kind]);
	};
	const para = (n: number, tag: string): string[] => Array.from({ length: n }, (_, i) => `${tag} ${i}`);
	const hoverWith = (app: App, el: HTMLElement, link: string) => {
		const pop = el.closest('.hover-popover')!;
		noteHoverLink(app, { linktext: link, sourcePath: 'Host.md', hoverParent: { hoverPopover: { hoverEl: pop } } });
		const emb = pop.querySelector('.markdown-embed')!;
		if (link.includes('#^')) emb.setAttribute('data-type', 'block');
		else if (link.includes('#')) {
			emb.setAttribute('data-type', 'heading');
			emb.insertBefore(document.createElement('h2'), el).setAttribute('data-heading', link.split('#').pop()!);
		}
	};
	const writtenAt = (app: App): number[] => app.vault.getContent('Note.md')!.split('\n').map((l, i) => (l === 'name: Edited' ? i : -1)).filter((i) => i >= 0);

	// P4 (the block was edited from outside BEFORE the pencil, the part Obsidian reports is still the one drawn before: the body this host knows,
	// 6, is in the part, and the note holds it only in an identical twin). The text search put the pin on the twin; the link names A, A no longer
	// holds the known body, so nothing is written.
	test.each([
		['block hover, no hover-link record', null],
		['block hover, the hover-link record Obsidian sends', 'Note#^a'],
	])('P4 %s: A edited from outside before the pencil, an identical twin: nothing is written', async (_name, link) => {
		const disk = ['# N', '', ...CTR(9), '^a', '', 'p', '', ...CTR(6), '^b', '', 'END'].join('\n');
		const el = hoverIn(new App(), null);
		const { app, host } = make(disk, { text: CTR(6).join('\n'), lineStart: 0, lineEnd: 3 }, el, bodyOf(6));
		if (link) hoverWith(app, el, link);
		await formSave(host, host.pinPosition(), bodyOf(6, 'Edited'));
		expectRefused(app, disk, 'dropped');
	});
	test.each([
		['P4 block embed, fresh cache', 'embed', 'Note#^a'],
		['P4 heading hover, record', 'hover', 'Note#Tracker'],
		['P4 heading embed, fresh cache', 'embed', 'Note#Tracker'],
	])('%s: the same shape (section == known, A edited from outside, identical twin): nothing is written', async (_name, kind, link) => {
		const isBlock = link.includes('^');
		const disk = isBlock
			? ['# N', '', ...CTR(9), '^a', '', 'p', '', ...CTR(6), '^b', '', 'END'].join('\n')
			: ['# N', '', ...CTR(6), '', 'p', '', '## Tracker', '', ...CTR(9), '', '## After', 'END'].join('\n');
		const sec = isBlock
			? { text: CTR(6).join('\n'), lineStart: 0, lineEnd: 3 }
			: kind === 'hover'
				? { text: ['', ...CTR(6), '', ''].join('\n'), lineStart: 1, lineEnd: 4 }
				: { text: ['## Tracker', '', ...CTR(6), ''].join('\n'), lineStart: 2, lineEnd: 5 };
		const el = kind === 'hover' ? hoverIn(new App(), null) : embedEl(link, false);
		const { app, host } = make(disk, sec, el, bodyOf(6));
		if (kind === 'hover') hoverWith(app, el, link);
		await formSave(host, host.pinPosition(), bodyOf(6, 'Edited'));
		expectRefused(app, disk, 'dropped');
	});

	// P13: a callout `^cal` embed, the host knows 6 while its part still shows 5, this host has NO record of a + (it is the host of a block another
	// pane wrote), A edited to 9, the upper callout holds 6. The pin used to be null and FormModal saved without `pinOnly`: the upper callout.
	test('P13 callout embed, the host knows 6, the part shows 5, no own-write record, the upper callout holds 6: refused with the "can\'t tell where" Notice', async () => {
		const CAL = (n: number): string[] => ['> [!note] Camp', ...CTR(n).map((l) => `> ${l}`), '> after text'];
		const full = ['# N', '', 'TOP', '', ...CAL(6), '', 'mid', '', ...CAL(9), '', '^cal', '', 'END'].join('\n');
		const lower = full.split('\n').lastIndexOf('> [!note] Camp');
		const cache = { headings: [], blocks: { cal: { id: 'cal', position: { start: pos(lower), end: pos(lower + 5) } } } };
		const { app, host } = make(full, { text: CAL(5).join('\n'), lineStart: 1, lineEnd: 4 }, embedEl('Note#^cal', false), bodyOf(6), cache);
		const pin = host.pinPosition();
		expect(pin).not.toBeNull(); // a REFUSING pin, never no pin
		await formSave(host, pin, bodyOf(6, 'Edited'));
		expectRefused(app, full, 'unsavable');
	});
	// the same with a REAL + by this host first (a record exists), then A edited from outside, then the pencil: the record's note no longer holds the block
	test('P13 callout embed, a real + first, then A edited from outside: nothing is written', async () => {
		const CAL = (n: number): string[] => ['> [!note] Camp', ...CTR(n).map((l) => `> ${l}`), '> after text'];
		const pre = ['# N', '', 'TOP', '', ...CAL(6), '', 'mid', '', ...CAL(5), '', '^cal', '', 'END'].join('\n');
		const lower = pre.split('\n').lastIndexOf('> [!note] Camp');
		const cache = { headings: [], blocks: { cal: { id: 'cal', position: { start: pos(lower), end: pos(lower + 5) } } } };
		const { app, host } = make(pre, { text: CAL(5).join('\n'), lineStart: 0, lineEnd: 5 }, embedEl('Note#^cal', false), bodyOf(5), cache);
		host.notePersistIntent();
		await settle();
		expect(await host.replaceSource(bodyOf(6), { fromView: true })).toBe(true);
		const outside = app.vault.getContent('Note.md')!.split('\n').map((l, i) => (i === lower + 3 ? '> current_value: 9' : l)).join('\n');
		app.vault.setFile('Note.md', outside);
		Notice.notices.length = 0;
		await formSave(host, host.pinPosition(), bodyOf(6, 'Edited'));
		expectRefused(app, outside, 'dropped');
	});

	// The shapes that save today and must keep saving (SC-584 r5): two IDENTICAL counters, NO + first, the pencil on the LOWER one, no outside edit.
	// (a) two plain counters in one `## Tracker` section, heading embed (RV / LP-style wrapper) and heading hover; (b) two counters in one callout,
	// block embed and heading embed, RV / LP (the DOM ordinal).
	test.each([
		['r5a heading embed rv', 'embed', false],
		['r5a heading embed lp', 'embed', true],
		['r5a heading hover', 'hover', false],
	] as const)('%s: two identical plain counters in the section, form on the lower: Save writes the lower', async (_name, kind, lp) => {
		const full = ['# N', '', 'TOP', '', '## Tracker', '', ...CTR(5), '', ...CTR(5), '', '## After', 'END'].join('\n');
		const sec = kind === 'embed' ? { text: ['## Tracker', '', ...CTR(5), '', ...CTR(5), ''].join('\n'), lineStart: 7, lineEnd: 10 } : { text: ['', ...CTR(5), '', ...CTR(5), '', ''].join('\n'), lineStart: 6, lineEnd: 9 };
		const el = kind === 'embed' ? embedEl('Note#Tracker', lp) : hoverIn(new App(), null);
		const { app, host } = make(full, sec, el, bodyOf(5));
		if (kind === 'hover') hoverWith(app, el, 'Note#Tracker');
		await formSave(host, host.pinPosition(), bodyOf(5, 'Edited'));
		expect(names(app)).toEqual(['Twin', 'Edited']);
		expect(Notice.notices).toHaveLength(0);
	});
	test.each([
		['r5b callout block embed rv', 'block', false],
		['r5b callout block embed lp', 'block', true],
		['r5b callout heading embed rv', 'heading', false],
		['r5b callout heading embed lp', 'heading', true],
	] as const)('%s: two identical counters in one callout, form on the lower (DOM ordinal): Save writes the lower', async (_name, kind, lp) => {
		const qf = (l: string) => `> ${l}`;
		const calLines = ['> [!note] Camp', ...CTR(5).map(qf), '> mid', ...CTR(5).map(qf)];
		const pre = kind === 'block' ? ['# N', '', ...calLines, '', '^cal', '', 'END'] : ['# N', '', '## Tracker', '', ...calLines, '', '## After', 'END'];
		const head = pre.indexOf('> [!note] Camp');
		const src = kind === 'block' ? 'Note#^cal' : 'Note#Tracker';
		const cache = kind === 'block' ? { headings: [], blocks: { cal: { id: 'cal', position: { start: pos(head), end: pos(head + 9) } } } } : pre.join('\n');
		const sec = kind === 'block' ? { text: calLines.join('\n'), lineStart: 0, lineEnd: 9 } : { text: ['## Tracker', '', ...calLines, ''].join('\n'), lineStart: 2, lineEnd: 11 };
		const inner = embedEl(src, lp);
		const outer = inner.closest('.internal-embed') as HTMLElement;
		inner.remove();
		const callout = outer.appendChild(document.createElement('div'));
		callout.className = 'callout';
		callout.appendChild(document.createElement('div')).className = 'block-language-ds-counter';
		const lower = callout.appendChild(document.createElement('div'));
		lower.className = 'block-language-ds-counter';
		const root = (outer.parentElement ?? outer) as HTMLElement;
		document.body.appendChild(root);
		const { app, host } = make(pre.join('\n'), sec, lower, bodyOf(5), cache);
		await formSave(host, host.pinPosition(), bodyOf(5, 'Edited'));
		root.remove();
		expect(names(app)).toEqual(['Twin', 'Edited']);
		expect(Notice.notices).toHaveLength(0);
	});

	// Shapes that had NO pin (a form in an embed / hover preview whose block cannot be placed) and were written without `pinOnly` at base: a REFUSING
	// pin now, nothing is written and one Notice says why.
	// N1: a callout's stale window (the + was written by ANOTHER host, a second pane: no record of this host) with a twin callout holding the known body.
	test('N1 callout embed, the block written by another host (no own-write record), part stale, a twin callout holds the known body: refused', async () => {
		const CAL = (n: number): string[] => ['> [!note] Camp', ...CTR(n).map((l) => `> ${l}`), '> after text'];
		const disk = ['# N', '', 'TOP', '', ...CAL(6), '', 'mid', '', ...CAL(6), '', '^cal', '', 'END'].join('\n');
		const lower = disk.split('\n').lastIndexOf('> [!note] Camp');
		const cache = { headings: [], blocks: { cal: { id: 'cal', position: { start: pos(lower), end: pos(lower + 5) } } } };
		const { app, host } = make(disk, { text: CAL(5).join('\n'), lineStart: 0, lineEnd: 5 }, embedEl('Note#^cal', false), bodyOf(6), cache);
		const pin = host.pinPosition();
		expect(pin).not.toBeNull();
		await formSave(host, pin, bodyOf(6, 'Edited'));
		expectRefused(app, disk, 'unsavable');
	});
	// N3: an embed host that never had a section (getSectionInfo null): the host cannot persist, nothing is written; FormModal says it ("couldn't save").
	test('N3 embed host with no section info: nothing is written, the form says so itself', async () => {
		const full = ['# N', '', ...CTR(5), '', 'p', '', ...CTR(5), '^a', '', 'END'].join('\n');
		const app = new App();
		app.vault.setFile('Note.md', full);
		const section: Section = { current: null };
		const host = new ReadingModeBlockHost(new Plugin(app) as never, embedEl('Note#^a', false), switchableCtx(section) as never, 'ds-counter');
		host.setMountedBody(bodyOf(5));
		const pin = host.pinPosition();
		expect(pin).not.toBeNull();
		expect(await formSave(host, pin, bodyOf(5, 'Edited'))).toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(full);
		expect(Notice.notices).toHaveLength(0); // the host reports nothing (`reported` false): FormModal's own Notice follows
	});
	// N3b: the section resolved when the host was built and is null when the pencil is pressed; A edited from outside, the twin holds the body.
	test('N3b embed host, section resolved at build then null at the pencil, A edited, a twin elsewhere: refused', async () => {
		const drawn = ['# N', '', ...CTR(5), '', 'p', '', ...CTR(5), '^a', '', 'END'].join('\n');
		const disk = ['# N', '', ...CTR(5), '', 'p', '', ...CTR(9), '^a', '', 'END'].join('\n');
		const app = new App();
		app.vault.setFile('Note.md', drawn);
		const section: Section = { current: { text: CTR(5).join('\n'), lineStart: 0, lineEnd: 3 } };
		const host = new ReadingModeBlockHost(new Plugin(app) as never, embedEl('Note#^a', false), switchableCtx(section) as never, 'ds-counter');
		host.setMountedBody(bodyOf(5));
		app.vault.setFile('Note.md', disk);
		section.current = null;
		const pin = host.pinPosition();
		expect(pin).not.toBeNull();
		await formSave(host, pin, bodyOf(5, 'Edited'));
		expectRefused(app, disk, 'unsavable');
	});
	// N4: a heading-hover callout whose part is stale and whose own-write record is gone (the host was rebound: `setMountedBody`), a twin callout holding the known body.
	test('N4 heading hover callout, stale part, no own-write record, a twin callout holds the known body: refused', async () => {
		const CAL = (n: number): string[] => ['> [!note] Camp', ...CTR(n).map((l) => `> ${l}`), '> after'];
		const disk = ['# N', '', ...CAL(6), '', 'p', '', '## Tracker', '', ...CAL(9), '', '## After', 'END'].join('\n');
		const el = hoverIn(new App(), null);
		const { app, host } = make(disk, { text: ['', ...CAL(5), '', ''].join('\n'), lineStart: 1, lineEnd: 6 }, el, bodyOf(6));
		hoverWith(app, el, 'Note#Tracker');
		const pin = host.pinPosition();
		expect(pin).not.toBeNull();
		await formSave(host, pin, bodyOf(6, 'Edited'));
		expectRefused(app, disk, 'unsavable');
	});

	// W1: a whole-note hover, an identical block ADDED above from outside before the pencil (the form's own block untouched): the hover's link (no #)
	// makes the pin a pin of the note as drawn, mapped through the edit, so the hovered block is written and never the added one.
	test('W1 whole-note hover, an identical block added above before the pencil: the hovered block is written, never the added one', async () => {
		const drawn = ['# N', '', 'TOP', '', ...CTR(5), '', 'END'];
		const now = ['# N', '', ...CTR(5), '', 'added', '', 'TOP', '', ...CTR(5), '', 'END'].join('\n');
		const el = hoverIn(new App(), null);
		const { app, host } = make(now, { text: drawn.join('\n'), lineStart: 4, lineEnd: 7 }, el, bodyOf(5));
		hoverWith(app, el, 'Note');
		await formSave(host, host.pinPosition(), bodyOf(5, 'Edited'));
		expect(names(app)).toEqual(['Twin', 'Edited']);
		expect(Notice.notices).toHaveLength(0);
	});
	// X1: saved -> refused by design: other text of the embedded section edited from outside before the pencil (the block itself untouched): the part
	// no longer equals the note where the link starts, so nothing says the part is still what is drawn (a card refuses it too).
	test('X1 heading embed, a paragraph inside the embedded section edited from outside before the pencil (block untouched): refused', async () => {
		const drawnSub = ['## Tracker', '', 'intro', '', ...CTR(5), ''];
		const now = ['# N', '', ...CTR(5), '', 'x', '', '## Tracker', '', 'intro, edited', '', ...CTR(5), '', '## After', 'END'].join('\n');
		const { app, host } = make(now, { text: drawnSub.join('\n'), lineStart: 4, lineEnd: 7 }, embedEl('Note#Tracker', false), bodyOf(5));
		await formSave(host, host.pinPosition(), bodyOf(5, 'Edited'));
		expectRefused(app, now, 'dropped');
	});
	// X2: the metadata cache lags an insertion above (2 lines inserted, not yet re-read). The cache's heading line is no longer the heading's line in the
	// text, so the link places nothing; the text search used to place the pin by the part's lines.
	test('X2 heading embed, the cache lags an insertion above (a twin under ## Other): refused, never the twin', async () => {
		const twin = ['## Other', '', ...CTR(5), ''];
		const SUB = ['## Tracker', '', ...CTR(5), ''];
		const now = ['# N', '', 'inserted 1', 'inserted 2', ...twin, ...SUB, '## After', '', 'tail'].join('\n');
		const before = ['# N', '', ...twin, ...SUB, '## After', '', 'tail'].join('\n');
		const { app, host } = make(now, { text: SUB.join('\n'), lineStart: 2, lineEnd: 5 }, embedEl('Note#Tracker', false), bodyOf(5), before);
		await formSave(host, host.pinPosition(), bodyOf(5, 'Edited'));
		expectRefused(app, now, 'dropped');
	});

	// ---- Y: lagging-cache / wrong-link shapes for the guards a form's pin shares with a card's (`cardLinkLine`, `hoverLinkOf`). Never the other block.
	test.each([
		['Y1 heading embed', 'embed'],
		['Y1 heading hover', 'hover'],
	] as const)('%s: an identical ## Tracker section pasted directly above the own one from outside, the cache lags: refused, never the pasted copy', async (_name, kind) => {
		const own = ['## Tracker', '', ...CTR(5), ''];
		const pre = ['# N', '', 'TOP', '', ...own, '## After', 'END'].join('\n');
		const now = ['# N', '', 'TOP', '', ...own, ...own, '## After', 'END'].join('\n');
		const el = kind === 'embed' ? embedEl('Note#Tracker', false) : hoverIn(new App(), null);
		const sec = kind === 'embed' ? { text: own.join('\n'), lineStart: 2, lineEnd: 5 } : { text: ['', ...CTR(5), '', ''].join('\n'), lineStart: 1, lineEnd: 4 };
		const { app, host } = make(now, sec, el, bodyOf(5), pre);
		if (kind === 'hover') hoverWith(app, el, 'Note#Tracker');
		await formSave(host, host.pinPosition(), bodyOf(5, 'Edited'));
		expectRefused(app, now, 'dropped'); // the two places read the same: refused, never a guess
	});
	test.each([
		['Y2 block embed', 'embed'],
		['Y2 block hover', 'hover'],
	] as const)('%s: a copy of the block WITH its ^a pasted above it from outside, the cache lags: refused, never the copy', async (_name, kind) => {
		const A = [...CTR(5), '^a'];
		const pre = ['# N', '', 'TOP', '', ...A, '', 'END'].join('\n');
		const now = ['# N', '', 'TOP', '', ...A, '', ...A, '', 'END'].join('\n');
		const el = kind === 'embed' ? embedEl('Note#^a', false) : hoverIn(new App(), null);
		const { app, host } = make(now, { text: CTR(5).join('\n'), lineStart: 0, lineEnd: 3 }, el, bodyOf(5), pre);
		if (kind === 'hover') hoverWith(app, el, 'Note#^a');
		await formSave(host, host.pinPosition(), bodyOf(5, 'Edited'));
		expectRefused(app, now, 'dropped');
	});
	test.each([
		['Y3 block embed', 'embed'],
		['Y3 block hover', 'hover'],
	] as const)('%s: lines inserted at the top move the twin B (^b) onto the line the lagging cache gives ^a: refused, never B', async (_name, kind) => {
		const pre = ['# N', '', ...CTR(5), '^b', '', 'p', '', ...CTR(5), '^a', '', 'END'];
		const aLine = pre.indexOf('^a') - 4; // A's fence in pre
		const bLine = 2;
		const ins = Array.from({ length: aLine - bLine }, (_, i) => `ins ${i}`);
		const now = ['# N', ...ins, '', ...CTR(5), '^b', '', 'p', '', ...CTR(5), '^a', '', 'END'];
		const bNow = now.indexOf('^b') - 4; // B's fence after the shift: the line the lagging cache still gives ^a
		const cache = { headings: [], blocks: { a: { id: 'a', position: { start: pos(bNow), end: pos(bNow + 3) } }, b: { id: 'b', position: { start: pos(bLine), end: pos(bLine + 3) } } } };
		const el = kind === 'embed' ? embedEl('Note#^a', false) : hoverIn(new App(), null);
		const { app, host } = make(now.join('\n'), { text: CTR(5).join('\n'), lineStart: 0, lineEnd: 3 }, el, bodyOf(5), cache);
		if (kind === 'hover') hoverWith(app, el, 'Note#^a');
		await formSave(host, host.pinPosition(), bodyOf(5, 'Edited'));
		expectRefused(app, now.join('\n'), 'dropped');
	});
	test('Y5 heading hover of ## Tracker whose popover is bound to the link of ## Other (another link\'s event): refused, never the counter under ## Other', async () => {
		const full = ['# N', '', 'TOP', '', '## Other', '', ...CTR(5), '', '## Tracker', '', ...CTR(5), '', 'END'].join('\n');
		const el = hoverIn(new App(), null);
		const { app, host } = make(full, { text: ['', ...CTR(5), '', ''].join('\n'), lineStart: 1, lineEnd: 4 }, el, bodyOf(5));
		const pop = el.closest('.hover-popover')!;
		noteHoverLink(app, { linktext: 'Note#Other', sourcePath: 'Host.md', hoverParent: { hoverPopover: { hoverEl: pop } } });
		const emb = pop.querySelector('.markdown-embed')!;
		emb.setAttribute('data-type', 'heading');
		emb.insertBefore(document.createElement('h2'), el).setAttribute('data-heading', 'Tracker');
		await formSave(host, host.pinPosition(), bodyOf(5, 'Edited'));
		expect(writtenAt(app)).toEqual([]);
		expect(kinds()).toEqual(['dropped']);
	});
	test('Y6 heading hover, ## Tracker and ## Other swapped from outside, the cache lags (Tracker still at the old line, now ## Other): refused, never the counter under ## Other', async () => {
		const pre = ['# N', '', '## Tracker', '', ...CTR(5), '', '## Other', '', ...CTR(5), '', 'END'].join('\n');
		const now = ['# N', '', '## Other', '', ...CTR(5), '', '## Tracker', '', ...CTR(5), '', 'END'].join('\n');
		const el = hoverIn(new App(), null);
		const { app, host } = make(now, { text: ['', ...CTR(5), '', ''].join('\n'), lineStart: 1, lineEnd: 4 }, el, bodyOf(5), pre);
		hoverWith(app, el, 'Note#Tracker');
		await formSave(host, host.pinPosition(), bodyOf(5, 'Edited'));
		expectRefused(app, now, 'dropped');
	});
});

// A card (+ / -) write goes through the same pin, so it has the same twin hazard where nothing could pin it. Measured at the base of SC-596: the 2880-cell
// sweep above, run for a card's write, writes the twin in none of its cells; these five shapes (a stale callout window with no own-write record of
// this host, the section gone at the click) write the twin, so a card there gets the same refusing pin. A card write is rate limited (one Notice per
// note per window), so the first of them shows (the "can't tell where" wording: no place was found for the card at all).
describe('SC-596: a card write in an embed or hover preview that cannot be pinned is refused, never written into an identical twin', () => {
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
	const CAL = (n: number, tail = '> after text'): string[] => ['> [!note] Camp', ...CTR(n).map((l) => `> ${l}`), tail];
	const values = (app: App): string[] => [...app.vault.getContent('Note.md')!.matchAll(/current_value: (\d+)/g)].map((m) => m[1]);
	function make(full: string, sec: Sec | null, el: HTMLElement, body: string, cache: object) {
		const app = new App();
		app.vault.setFile('Note.md', full);
		jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cache as never);
		const section: Section = { current: sec };
		const host = new ReadingModeBlockHost(new Plugin(app) as never, el, switchableCtx(section) as never, 'ds-counter');
		host.setMountedBody(body);
		return { app, host, section };
	}
	/** The card write: the persist intent takes the pin, the view's debounced write follows it. */
	async function cardWrite(host: ReadingModeBlockHost, value: number): Promise<boolean> {
		host.notePersistIntent();
		return host.replaceSource(bodyOf(value), { fromView: true });
	}
	const calCache = (full: string) => {
		const lower = full.split('\n').lastIndexOf('> [!note] Camp');
		return { headings: [], blocks: { cal: { id: 'cal', position: { start: pos(lower), end: pos(lower + 5) } } } };
	};

	test.each([
		['+', 7],
		['-', 5],
	])('a card %s on a callout embed whose host knows 6 while the part shows 5, no own-write record, the lower callout edited to 9, the upper holding 6: nothing is written', async (_sign, to) => {
		const full = ['# N', '', 'TOP', '', ...CAL(6), '', 'mid', '', ...CAL(9), '', '^cal', '', 'END'].join('\n');
		const { app, host } = make(full, { text: CAL(5).join('\n'), lineStart: 1, lineEnd: 4 }, embedEl('Note#^cal', false), bodyOf(6), calCache(full));
		expect(await cardWrite(host, to)).toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(full);
		expect((Notice.notices as unknown[]).map((n) => noticeKind(String(n)))).toEqual(['unsavable']); // the "can't tell where" Notice: nothing could place the card
	});
	test('a card + on a callout embed whose block another pane wrote (no own-write record), part stale, a twin callout holding the known body: nothing is written', async () => {
		const full = ['# N', '', 'TOP', '', ...CAL(6), '', 'mid', '', ...CAL(6), '', '^cal', '', 'END'].join('\n');
		const { app, host } = make(full, { text: CAL(5).join('\n'), lineStart: 0, lineEnd: 5 }, embedEl('Note#^cal', false), bodyOf(6), calCache(full));
		expect(await cardWrite(host, 7)).toBe(false);
		expect(values(app)).toEqual(['6', '6']);
		expect((Notice.notices as unknown[]).map((n) => noticeKind(String(n)))).toEqual(['unsavable']); // the "can't tell where" Notice: nothing could place the card
	});
	test('a card + on a heading hover callout, stale part, no own-write record, a twin callout holding the known body: nothing is written', async () => {
		const disk = ['# N', '', ...CAL(6, '> after'), '', 'p', '', '## Tracker', '', ...CAL(9, '> after'), '', '## After', 'END'].join('\n');
		const el = popoverEl(new App(), null).el;
		const { app, host } = make(disk, { text: ['', ...CAL(5, '> after'), '', ''].join('\n'), lineStart: 1, lineEnd: 6 }, el, bodyOf(6), cacheFor(disk.split('\n'), -1, -1, 4));
		noteHoverLink(app, { linktext: 'Note#Tracker', sourcePath: 'Host.md', hoverParent: { hoverPopover: { hoverEl: el.closest('.hover-popover')! } } });
		expect(await cardWrite(host, 7)).toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(disk);
		expect((Notice.notices as unknown[]).map((n) => noticeKind(String(n)))).toEqual(['unsavable']); // the "can't tell where" Notice: nothing could place the card
	});
	test('a card + on a block embed whose section resolved when it was built and is gone at the click, the block edited from outside, a twin elsewhere: nothing is written', async () => {
		const drawn = ['# N', '', ...CTR(5), '', 'p', '', ...CTR(5), '^a', '', 'END'].join('\n');
		const disk = ['# N', '', ...CTR(5), '', 'p', '', ...CTR(9), '^a', '', 'END'].join('\n');
		const app = new App();
		app.vault.setFile('Note.md', drawn);
		const section: Section = { current: { text: CTR(5).join('\n'), lineStart: 0, lineEnd: 3 } };
		const host = new ReadingModeBlockHost(new Plugin(app) as never, embedEl('Note#^a', false), switchableCtx(section) as never, 'ds-counter');
		host.setMountedBody(bodyOf(5));
		app.vault.setFile('Note.md', disk);
		section.current = null;
		expect(await cardWrite(host, 7)).toBe(false);
		expect(app.vault.getContent('Note.md')).toBe(disk);
		expect((Notice.notices as unknown[]).map((n) => noticeKind(String(n)))).toEqual(['unsavable']); // the "can't tell where" Notice: nothing could place the card
	});
	// the control: a card in an embed that CAN be placed (the link names its block, the part is current) still writes, and a card that is not in an
	// embed is untouched
	test('a card + on a block embed whose link places it still writes, and a card outside any embed with no section is as before (no pin)', async () => {
		const full = ['# N', '', ...CTR(5), '^a', '', 'p', '', ...CTR(5), '^b', '', 'END'].join('\n');
		const cache = { headings: [], blocks: { a: { id: 'a', position: { start: pos(2), end: pos(5) } }, b: { id: 'b', position: { start: pos(10), end: pos(13) } } } };
		const placed = make(full, { text: CTR(5).join('\n'), lineStart: 0, lineEnd: 3 }, embedEl('Note#^b', false), bodyOf(5), cache);
		expect(await cardWrite(placed.host, 7)).toBe(true);
		expect(values(placed.app)).toEqual(['5', '7']);
		const loose = make(full, null, document.createElement('div'), bodyOf(5), cache);
		loose.host.notePersistIntent();
		expect((loose.host as unknown as { pendingPin: unknown }).pendingPin).toBeNull();
	});

	// NOT embedded (the host's section is the note's own): nothing changed. A card in a callout of the note itself has no pin when its window holds no
	// block with the known body (a second + while the callout still shows the text from before the first +); the view's write is placed by today's path
	// once the window is fresh and LANDS. A refusing pin there (the `embedded ?` guard of `takePin` dropped) loses the click with a Notice.
	test('a card in a callout of a note that is not an embed: a second + while the callout still shows the text from before the first + lands', async () => {
		const note = (n: number) => ['# N', '', 'TOP', '', ...CAL(n, '> after'), '', 'END'];
		const app = new App();
		app.vault.setFile('Note.md', note(5).join('\n'));
		const win = (n: number): Sec => ({ text: note(n).join('\n'), lineStart: 4, lineEnd: 9 });
		const section: Section = { current: win(5) };
		const callout = document.createElement('div');
		callout.className = 'callout';
		const el = callout.appendChild(document.createElement('div'));
		el.className = 'block-language-ds-counter';
		document.body.appendChild(callout);
		const host = new ReadingModeBlockHost(new Plugin(app) as never, el, switchableCtx(section) as never, 'ds-counter');
		host.setMountedBody(bodyOf(5));
		expect(await cardWrite(host, 6)).toBe(true);
		// the window is still the one drawn before the + (5); the second + comes now
		host.notePersistIntent();
		expect((host as unknown as { pendingPin: unknown }).pendingPin).toBeNull(); // no own fence in the stale window, not embedded: no pin
		await settle();
		section.current = win(6); // the redraw: the window is fresh by the time the debounced write runs
		expect(await host.replaceSource(bodyOf(7), { fromView: true })).toBe(true);
		expect(values(app)).toEqual(['7']);
		expect(Notice.notices).toHaveLength(0);
		callout.remove();
	});
	test('a block edit form on a list item of a note that is not an embed has no pin (as before): only a host in an embed or hover preview gets a refusing pin', () => {
		const full = ['# N', '', '- item', ...CTR(5).map((l) => `  ${l}`), '', 'END'].join('\n');
		const { host } = make(full, { text: full, lineStart: 2, lineEnd: 6 }, document.createElement('div'), bodyOf(5), { headings: [], blocks: {} });
		expect(host.pinPosition()).toBeNull();
	});
});
