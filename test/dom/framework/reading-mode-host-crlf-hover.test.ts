// SC-619 -- a + / - or a block edit form Save in a hover preview of a HEADING (`[[note#Heading]]`) of a note saved with Windows line endings (CRLF).
// Measured (SC-619 r1, Obsidian 1.15.1, Reading view and Live Preview): Obsidian gives such a hover card the note's text from ONE character after the
// heading line's content up to the next heading. In an LF note that character is the line break, so the part starts on the line under the heading
// (`"\n```ds-counter\n..."`, the card's `lineStart` 1). In a CRLF note it is the CR, so the part starts with the LF of the heading line's own CRLF
// (`"\n\r\n```ds-counter\r\n..."`, `lineStart` 2): its line 0 is the (empty) rest of the HEADING line, one line more than in an LF note. Placed
// through the link as if it started under the heading, every line of the part is compared one line too low and the write is refused although
// nothing changed. A heading EMBED (its part starts at the heading), a block hover / embed (the block's own lines) and a whole-note hover / embed
// are not affected (measured: saved). The rule this file holds: a CRLF note behaves exactly as the same LF note - saved where the LF note saves,
// refused (the "changed on disk first" Notice, nothing written) where it refuses - and a write keeps the note all-CRLF (SC-453).
// The cache mock carries Obsidian's raw offsets (CRLF counted), and `hoverPopover.embed.data` is the raw note (measured: it holds the CRs).
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { noteHoverLink } from '../../../src/framework/host/hoverLinks';
import { droppedWriteMessage, resetDroppedWriteNotices } from '../../../src/framework/host/droppedWriteNotice';
import { splitLines, splitWithEols } from '../../../src/framework/host/lineEnding';
import { App, Notice, Plugin } from '../../mocks/obsidian';

type Eol = '\n' | '\r\n';
type Sec = { text: string; lineStart: number; lineEnd: number };
type Section = { current: Sec | null };
const ctxOf = (section: Section) =>
	({ docId: 'doc-619', sourcePath: 'Note.md', frontmatter: undefined, addChild: () => {}, getSectionInfo: () => section.current }) as never;
const CTR = (n: number, name = 'Twin'): string[] => ['```ds-counter', `name: ${name}`, `current_value: ${n}`, '```'];
const bodyOf = (n: number, name = 'Twin'): string => `name: ${name}\ncurrent_value: ${n}`;
const settle = () => new Promise((r) => setTimeout(r, 25));

/** What Obsidian's metadata cache holds for `text`: headings, `^id` blocks and one section ending at the last non-blank line, with RAW offsets (CRLF counted, measured). */
function cacheOf(text: string) {
	const { lines, eols } = splitWithEols(text);
	const offs: number[] = [];
	let o = 0;
	for (let i = 0; i < lines.length; i++) {
		offs.push(o);
		o += lines[i].length + eols[i].length;
	}
	const P = (line: number, col: number) => ({ line, col, offset: offs[line] + col });
	const headings: unknown[] = [];
	const blocks: Record<string, unknown> = {};
	let fenced = false;
	let last = 0;
	lines.forEach((l, i) => {
		if (l.trim() !== '') last = i;
		if (/^```/.test(l)) fenced = !fenced;
		const h = !fenced && /^(#{1,6})\s+(.*)$/.exec(l);
		if (h) headings.push({ heading: h[2], level: h[1].length, position: { start: P(i, 0), end: P(i, l.length) } });
		const id = /^\^(\w+)$/.exec(l);
		if (id) {
			let s = i - 1;
			while (s >= 0 && lines[s] !== '```') s--;
			for (s = s - 1; s >= 0 && !/^```\w/.test(lines[s]); s--);
			blocks[id[1]] = { id: id[1], position: { start: P(s, 0), end: P(i, l.length) } };
		}
	});
	return { headings, blocks, sections: [{ type: 'paragraph', position: { start: P(0, 0), end: P(last, lines[last].length) } }] };
}
/** The card's own fence in a part: Obsidian's `lineStart` / `lineEnd` for the card are the part's own line numbers (splitLines). */
function secOf(part: string): Sec {
	const lines = splitLines(part);
	const lineStart = lines.findIndex((l) => l === '```ds-counter');
	const lineEnd = lines.findIndex((l, i) => i > lineStart && l === '```');
	return { text: part, lineStart, lineEnd };
}
/** A heading HOVER's part as Obsidian 1.15.1 slices it (measured, SC-619 r1): from one character after the heading line's content to the next heading line. */
function hoverPart(text: string, heading: string): Sec {
	const lines = splitWithEols(text);
	let off = 0;
	let at = -1;
	for (let i = 0; i < lines.lines.length; i++) {
		if (lines.lines[i] === heading) {
			at = off + heading.length;
			break;
		}
		off += lines.lines[i].length + lines.eols[i].length;
	}
	if (at < 0) throw new Error(`no ${heading}`);
	const from = at + 1;
	const next = /(^|\n)#{1,6} /m.exec(text.slice(from));
	const to = next ? from + next.index + (next[1] === '\n' ? 1 : 0) : text.length;
	return secOf(text.slice(from, to));
}
/** A heading EMBED's part (measured): from the heading line's start to the next heading line. */
function embedPart(text: string, heading: string): Sec {
	const from = text.indexOf(heading);
	const next = /\n#{1,6} /.exec(text.slice(from + heading.length));
	return secOf(text.slice(from, next ? from + heading.length + next.index + 1 : text.length));
}
/** A hover popover of `link`, announced like Obsidian does (`hover-link`); `data` is `hoverPopover.embed.data` (the note as Obsidian read it for the preview: raw, CRs kept). */
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
function embedEl(src: string): HTMLElement {
	const embed = document.createElement('div');
	embed.className = 'internal-embed markdown-embed';
	embed.setAttribute('src', src);
	return embed.appendChild(document.createElement('div'));
}

/** Two identical counters under `## Tracker` and `## Other` (values a, b). */
const TWIN = (a = 5, b = 5): string[] => ['# N', '', 'TOP', '', '## Tracker', '', ...CTR(a), '', '## Other', '', ...CTR(b), '', '## After', '', 'END', ''];
const join = (lines: string[], eol: Eol) => lines.join(eol);
/** `lines` with the counter whose fence opens at `fence` holding `value` (and `name`). */
function edited(lines: string[], fence: number, value: number, name = 'Twin'): string[] {
	const out = lines.slice();
	out[fence + 1] = `name: ${name}`;
	out[fence + 2] = `current_value: ${value}`;
	return out;
}

type Run = {
	eol: Eol;
	/** the note as the preview was drawn */
	drawn: string[];
	/** the note at the click (an outside edit); default: as drawn */
	now?: string[];
	/** the note the CARD read at mount (the hover window race: Obsidian read `drawn`, the card this); default: as drawn */
	cardRead?: string[];
	shape?: 'hover' | 'embed';
	link: string;
	/** the line the part hangs from (a heading) */
	heading: string;
	click?: 'card' | 'form';
};
/** Mount a card for `r`, apply the outside edit, click. Returns the note after, the note at the click, and the Notices. */
async function run(r: Run): Promise<{ after: string; now: string; notices: string[]; ok: boolean }> {
	const app = new App();
	const drawn = join(r.drawn, r.eol);
	const now = join(r.now ?? r.drawn, r.eol);
	app.vault.setFile('Note.md', r.cardRead ? join(r.cardRead, r.eol) : drawn);
	jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheOf(app.vault.getContent('Note.md')!) as never);
	const sec = r.shape === 'embed' ? embedPart(drawn, r.heading) : r.link.includes('#^') ? blockPart(drawn, r.link) : hoverPart(drawn, r.heading);
	const el = r.shape === 'embed' ? embedEl(r.link) : popoverEl(app, r.link, drawn);
	const host = new ReadingModeBlockHost(new Plugin(app) as never, el, ctxOf({ current: sec }), 'ds-counter');
	host.setMountedBody(bodyOf(5));
	await settle(); // the card is drawn: its note read is done
	app.vault.setFile('Note.md', now);
	let ok: boolean;
	if ((r.click ?? 'card') === 'card') {
		host.notePersistIntent();
		await settle();
		ok = await host.replaceSource(bodyOf(6), { fromView: true });
	} else {
		const pin = host.pinPosition();
		ok = await (pin ? host.replaceSource(bodyOf(5, 'Edited'), { pin, pinOnly: true }) : host.replaceSource(bodyOf(5, 'Edited')));
	}
	el.closest('.hover-popover, .internal-embed')?.remove();
	return { after: app.vault.getContent('Note.md')!, now, notices: (Notice.notices as unknown[]).map(String), ok };
}
/** A block hover's part (measured): the block's own lines, from its fence to its closing fence. */
function blockPart(text: string, link: string): Sec {
	const id = link.slice(link.indexOf('#^') + 2);
	const lines = splitWithEols(text);
	const idLine = lines.lines.indexOf(`^${id}`);
	let close = idLine - 1;
	while (lines.lines[close] !== '```') close--;
	let open = close - 1;
	while (!/^```\w/.test(lines.lines[open])) open--;
	return secOf(lines.lines.slice(open, close + 1).map((l, i) => l + (open + i < close ? lines.eols[open + i] : '')).join(''));
}

const dropped = [droppedWriteMessage('Note')];
/** The fence line of `heading`'s counter in `lines` (the counter right under the heading and one blank line). */
const fenceUnder = (lines: string[], heading: string) => lines.indexOf(heading) + 2;

describe('SC-619: a hover preview of a heading of a note saved with Windows line endings (CRLF)', () => {
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

	test('SC-619: the model: the hover part of a CRLF note starts with the LF of the heading line (lineStart 2), the LF note\'s on the blank line (lineStart 1)', () => {
		const crlf = hoverPart(join(TWIN(), '\r\n'), '## Tracker');
		const lf = hoverPart(join(TWIN(), '\n'), '## Tracker');
		// the measured texts (r1, Obsidian 1.15.1): 84 and 75 characters
		expect(crlf.text).toBe('\n\r\n```ds-counter\r\nname: Twin\r\ncurrent_value: 5\r\n```\r\n\r\n');
		expect(crlf.lineStart).toBe(2);
		expect(lf.text).toBe('\n```ds-counter\nname: Twin\ncurrent_value: 5\n```\n\n');
		expect(lf.lineStart).toBe(1);
	});

	// --- the ticket: saved (red until fixed) ---

	test('SC-619: + in the hover of [[Note#Tracker]], an identical counter under ## Other: saved into Tracker, the note stays all-CRLF, no Notice', async () => {
		const r = await run({ eol: '\r\n', drawn: TWIN(), link: 'Note#Tracker', heading: '## Tracker' });

		expect(r.after).toBe(join(edited(TWIN(), fenceUnder(TWIN(), '## Tracker'), 6), '\r\n'));
		expect(r.notices).toEqual([]);
		expect(r.ok).toBe(true);
	});

	test('SC-619: + in the hover of [[Note#Other]] (the lower of the two identical counters): saved into Other', async () => {
		const r = await run({ eol: '\r\n', drawn: TWIN(), link: 'Note#Other', heading: '## Other' });

		expect(r.after).toBe(join(edited(TWIN(), fenceUnder(TWIN(), '## Other'), 6), '\r\n'));
		expect(r.notices).toEqual([]);
	});

	test('SC-619: + in the hover of a heading whose counter is unique in the note: saved (the refusal is not about the twin)', async () => {
		const r = await run({ eol: '\r\n', drawn: TWIN(5, 9), link: 'Note#Tracker', heading: '## Tracker' });

		expect(r.after).toBe(join(edited(TWIN(5, 9), fenceUnder(TWIN(), '## Tracker'), 6), '\r\n'));
		expect(r.notices).toEqual([]);
	});

	test('SC-619: a block edit form Save in the hover (the SC-596 pin, pinOnly): saved into the hovered counter', async () => {
		const r = await run({ eol: '\r\n', drawn: TWIN(), link: 'Note#Tracker', heading: '## Tracker', click: 'form' });

		expect(r.after).toBe(join(edited(TWIN(), fenceUnder(TWIN(), '## Tracker'), 5, 'Edited'), '\r\n'));
		expect(r.notices).toEqual([]);
	});

	test('SC-619: the fence right under the heading (no blank line: the part is the LF, then the fence): saved', async () => {
		const note = ['# N', '', '## Tracker', ...CTR(5), '', '## Other', ...CTR(5), '', 'END', ''];
		const part = hoverPart(join(note, '\r\n'), '## Tracker');
		expect(part.text.startsWith('\n```ds-counter\r\n')).toBe(true);
		expect(part.lineStart).toBe(1);
		const r = await run({ eol: '\r\n', drawn: note, link: 'Note#Tracker', heading: '## Tracker' });

		expect(r.after).toBe(join(edited(note, 3, 6), '\r\n'));
		expect(r.notices).toEqual([]);
	});

	test('SC-619: an unrelated outside edit above before the click (TOP edited): saved', async () => {
		const now = TWIN().map((l) => (l === 'TOP' ? 'TOP edited' : l));
		const r = await run({ eol: '\r\n', drawn: TWIN(), now, link: 'Note#Tracker', heading: '## Tracker' });

		expect(r.after).toBe(join(edited(now, fenceUnder(now, '## Tracker'), 6), '\r\n'));
		expect(r.notices).toEqual([]);
	});

	test('SC-619: two + in a row, the preview redrawn between them (Obsidian slices the new part the same way; rebind): both land in the hovered counter', async () => {
		const app = new App();
		const drawn = join(TWIN(), '\r\n');
		app.vault.setFile('Note.md', drawn);
		jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheOf(app.vault.getContent('Note.md')!) as never);
		const el = popoverEl(app, 'Note#Tracker', drawn);
		const section: Section = { current: hoverPart(drawn, '## Tracker') };
		const host = new ReadingModeBlockHost(new Plugin(app) as never, el, ctxOf(section), 'ds-counter');
		host.setMountedBody(bodyOf(5));
		await settle();
		host.notePersistIntent();
		await settle();
		expect(await host.replaceSource(bodyOf(6), { fromView: true })).toBe(true);
		section.current = hoverPart(app.vault.getContent('Note.md')!, '## Tracker');
		host.rebind(el, ctxOf(section));
		await settle();
		host.notePersistIntent();
		await settle();

		expect(await host.replaceSource(bodyOf(7), { fromView: true })).toBe(true);
		expect(app.vault.getContent('Note.md')).toBe(join(edited(TWIN(), fenceUnder(TWIN(), '## Tracker'), 7), '\r\n'));
		expect(Notice.notices).toEqual([]);
	});

	// --- refusals: the same shapes the LF note refuses (SC-594 / SC-607 / SC-612) stay refusals in a CRLF note ---

	const refusal = (name: string, r: Omit<Run, 'eol'>) =>
		test(`SC-619: ${name}: nothing written, the "changed on disk first" Notice, in a CRLF note as in the LF note`, async () => {
			for (const eol of ['\n', '\r\n'] as Eol[]) {
				Notice.notices.length = 0;
				resetDroppedWriteNotices();
				const out = await run({ eol, ...r });
				expect({ eol, after: out.after }).toEqual({ eol, after: out.now });
				expect(out.notices).toEqual(dropped);
			}
		});

	const swapped = TWIN().map((l) => (l === '## Tracker' ? '## Other' : l === '## Other' ? '## Tracker' : l));
	refusal('the two heading names swapped from outside before the click (the link now names the other counter)', { drawn: TWIN(), now: swapped, link: 'Note#Tracker', heading: '## Tracker' });
	refusal('the same, a block edit form Save', { drawn: TWIN(), now: swapped, link: 'Note#Tracker', heading: '## Tracker', click: 'form' });
	const adj = ['# N', '', 'TOP', '', '## Tracker', '', ...CTR(5), '', '## Tracker', '', ...CTR(5), '', '## After', '', 'END', ''];
	const adjDel = ['# N', '', 'TOP', '', '## Tracker', '', ...CTR(5), '', '## After', '', 'END', ''];
	refusal('the hovered (upper) of two ADJACENT identical ## Tracker sections deleted from outside', { drawn: adj, now: adjDel, link: 'Note#Tracker', heading: '## Tracker' });
	const sep = ['# N', '', 'TOP', '', '## Tracker', '', ...CTR(5), '', '## Mid', '', 'p-mid', '', '## Tracker', '', ...CTR(5), '', 'END', ''];
	const sepDel = ['# N', '', 'TOP', '', '## Mid', '', 'p-mid', '', '## Tracker', '', ...CTR(5), '', 'END', ''];
	refusal('two identical ## Tracker sections with a section between, the hovered (first) one deleted from outside (the link now names the other)', { drawn: sep, now: sepDel, link: 'Note#Tracker', heading: '## Tracker' });
	refusal('the hovered counter edited from outside, the identical one under ## Other holding the old value', {
		drawn: TWIN(),
		now: edited(TWIN(), fenceUnder(TWIN(), '## Tracker'), 9),
		link: 'Note#Tracker',
		heading: '## Tracker',
	});
	const moved = ['# N', '', 'TOP', '', '## Other', '', ...CTR(9), '', '## After', '', 'END', '', '## Tracker', '', ...CTR(5), ''];
	refusal('the hovered section (its counter unique) moved to the end from outside while the preview stays open (SC-607: refused, as in an LF note)', { drawn: TWIN(5, 9), now: moved, link: 'Note#Tracker', heading: '## Tracker' });
	refusal('the hover window race: the names swapped after Obsidian read the note (embed.data) and before the card did', {
		drawn: TWIN(),
		cardRead: swapped,
		now: swapped,
		link: 'Note#Tracker',
		heading: '## Tracker',
	});

	// --- controls: saved at the base already (no regression) ---

	test('SC-619 control: the same + in the LF note: saved into Tracker (the LF path is untouched)', async () => {
		const r = await run({ eol: '\n', drawn: TWIN(), link: 'Note#Tracker', heading: '## Tracker' });

		expect(r.after).toBe(join(edited(TWIN(), fenceUnder(TWIN(), '## Tracker'), 6), '\n'));
		expect(r.notices).toEqual([]);
	});

	test('SC-619 control: a block hover [[Note#^ta]] of a CRLF note with an identical block ^tb: saved', async () => {
		const note = ['# N', '', 'TOP', '', '## Tracker', '', ...CTR(5), '^ta', '', '## Other', '', ...CTR(5), '^tb', '', 'END', ''];
		const r = await run({ eol: '\r\n', drawn: note, link: 'Note#^ta', heading: '## Tracker' });

		expect(r.after).toBe(join(edited(note, 6, 6), '\r\n'));
		expect(r.notices).toEqual([]);
	});

	test('SC-619 control: a heading EMBED ![[Note#Tracker]] of a CRLF note (its part starts at the heading): saved', async () => {
		const r = await run({ eol: '\r\n', drawn: TWIN(), link: 'Note#Tracker', heading: '## Tracker', shape: 'embed' });

		expect(r.after).toBe(join(edited(TWIN(), fenceUnder(TWIN(), '## Tracker'), 6), '\r\n'));
		expect(r.notices).toEqual([]);
	});

	test('SC-619 control: a mixed note whose heading line ends in LF (the part starts on the blank line, as in an LF note): saved', async () => {
		const text = join(TWIN(), '\r\n').replace('## Tracker\r\n', '## Tracker\n');
		const app = new App();
		app.vault.setFile('Note.md', text);
		jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheOf(app.vault.getContent('Note.md')!) as never);
		const sec = hoverPart(text, '## Tracker');
		expect(sec.text.startsWith('\r\n```ds-counter')).toBe(true);
		const el = popoverEl(app, 'Note#Tracker', text);
		const host = new ReadingModeBlockHost(new Plugin(app) as never, el, ctxOf({ current: sec }), 'ds-counter');
		host.setMountedBody(bodyOf(5));
		await settle();
		host.notePersistIntent();
		await settle();

		expect(await host.replaceSource(bodyOf(6), { fromView: true })).toBe(true);
		expect(app.vault.getContent('Note.md')).toBe(text.replace('current_value: 5', 'current_value: 6'));
	});
});
