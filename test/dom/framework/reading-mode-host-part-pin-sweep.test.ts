// SC-621 -- the sweep and the seeded fuzz behind reading-mode-host-part-pin-twin.test.ts: a + / - or a block edit form's Save in a hover preview or an embed of PART of a
// note (a heading, a `^id` block) while ONE outside write lands first, over many layouts of identical counters x outside edits x the six ways a click arrives (card / form,
// no + / + then rebound / + stale) x hover, embed in reading mode, embed in live preview. Only the cells whose part's text is unchanged are run (Obsidian redraws a preview
// whose part changed, measured SC-607: nothing stale is left to click). Ground truth is tracked by block id. The oracle is SC-612's LCS placement cost from the note as the
// round began to the note now, independent of lineMap. Asserted per cell: nothing corrupt; one Notice per refusal, none per save; nothing is written where the body is twinned
// and the oracle sees a tie; no write into another counter outside the two residual classes R1 (a move among text-identical blocks) and R2 (the drawn-from section deleted while a
// neighbour is renamed to its name); no refusal where the one cheapest placement IS the drawn-from block, the head-first map and the link both name it, and the link names one block
// before and now (the refusals the rule must not add). The totals are pinned (a regression fence). Not run here: the second timing (the write lands after the click placed the pin;
// refused by SC-612's write-time rule, pinned in the twin file) and the full 21,060-cell sweep SC-621 was designed on (~9 min); each (layout, link, edit) runs in one combination.
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { noteHoverLink } from '../../../src/framework/host/hoverLinks';
import { droppedWriteMessage, resetDroppedWriteNotices } from '../../../src/framework/host/droppedWriteNotice';
import { mapLine } from '../../../src/framework/host/lineMap';
import { App, Notice, Plugin } from '../../mocks/obsidian';

type Sec = { text: string; lineStart: number; lineEnd: number };
type Section = { current: Sec | null };
const ctxOf = (section: Section) =>
	({ docId: 'doc-621', sourcePath: 'Note.md', frontmatter: undefined, addChild: () => {}, getSectionInfo: () => section.current }) as never;
const CTR = (n: number, name = 'Twin'): string[] => ['```ds-counter', `name: ${name}`, `current_value: ${n}`, '```'];
const bodyOf = (n: number, name = 'Twin'): string => `name: ${name}\ncurrent_value: ${n}`;
const settle = () => new Promise((r) => setTimeout(r, 2));
const pos = (line: number) => ({ line, col: 0, offset: 0 });
function cacheOf(lines: string[]) {
	const headings: Array<{ heading: string; level: number; position: unknown }> = [];
	const blocks: Record<string, unknown> = {};
	let fenced = false;
	lines.forEach((l, i) => {
		if (/^```/.test(l)) fenced = !fenced;
		const h = !fenced && /^(#{1,6})\s+(.*)$/.exec(l);
		if (h) headings.push({ heading: h[2], level: h[1].length, position: { start: pos(i), end: pos(i) } });
		const id = /^\^(\w+)$/.exec(l);
		if (id && !fenced) {
			let s = i - 1;
			if (s < 0 || lines[s] !== '```') return; // a marker attaches to the block right above it (a fence's closing line)
			for (s = s - 1; s >= 0 && !/^```\w/.test(lines[s]); s--);
			if (s >= 0) blocks[id[1]] = { id: id[1], position: { start: pos(s), end: pos(i - 1) } };
		}
	});
	return { headings, blocks };
}

// ---- notes as tokens ----
// sec: a heading section ['## name', '', counter, ''] (the twin unit of a heading link); ctr: a counter with an optional `^mark` line under it.
type Tok = { t: 'sec'; id: string; v: number; name: string } | { t: 'ctr'; id: string; v: number; mark?: string } | { t: 'line'; s: string };
const L = (s: string): Tok => ({ t: 'line', s });
const B = L('');
const S = (id: string, name: string, v = 5): Tok => ({ t: 'sec', id, v, name });
const C = (id: string, v = 5, mark?: string): Tok => ({ t: 'ctr', id, v, mark });
type Ctr = Exclude<Tok, { t: 'line' }>;
const isC = (k: Tok): k is Ctr => k.t !== 'line';
function render(toks: Tok[]): { text: string; lines: string[]; fence: Map<string, number> } {
	const lines: string[] = [];
	const fence = new Map<string, number>();
	for (const k of toks) {
		if (k.t === 'line') lines.push(k.s);
		else if (k.t === 'sec') {
			lines.push(`## ${k.name}`, '');
			fence.set(k.id, lines.length);
			lines.push(...CTR(k.v), '');
		} else {
			fence.set(k.id, lines.length);
			lines.push(...CTR(k.v));
			if (k.mark) lines.push(`^${k.mark}`);
		}
	}
	return { text: lines.join('\n'), lines, fence };
}
const idx = (toks: Tok[], id: string) => toks.findIndex((k) => isC(k) && k.id === id);
const ctrOf = (toks: Tok[], id: string) => toks[idx(toks, id)] as Ctr;
function del(toks: Tok[], id: string, keepMark = false, pre = false): Tok[] {
	const r = toks.slice();
	const i = idx(r, id);
	if (i < 0) return r;
	const k = r[i];
	if (k.t === 'sec') {
		r.splice(i, 1);
		return r;
	}
	const rest: Tok[] = keepMark && k.t === 'ctr' && k.mark ? [L(`^${k.mark}`)] : [];
	const next = r[i + 1];
	if (pre && i > 0 && r[i - 1].t === 'line' && (r[i - 1] as { s: string }).s === '') r.splice(i - 1, 2, ...rest);
	else if (next && next.t === 'line' && next.s === '') r.splice(i, 2, ...rest, ...(rest.length ? [B] : []));
	else if (i > 0 && r[i - 1].t === 'line' && (r[i - 1] as { s: string }).s === '') r.splice(i - 1, 2, ...rest);
	else r.splice(i, 1, ...rest);
	return r;
}
const insAt = (toks: Tok[], at: number, add: Tok[]): Tok[] => [...toks.slice(0, at), ...add, ...toks.slice(at)];
const setLine = (toks: Tok[], from: string, to: string): Tok[] | null =>
	toks.some((k) => k.t === 'line' && k.s === from) ? toks.map((k) => (k.t === 'line' && k.s === from ? L(to) : k)) : null;
const setV = (toks: Tok[], id: string, v: number): Tok[] => toks.map((k) => (isC(k) && k.id === id ? { ...k, v } : k));
const rename = (toks: Tok[], id: string, name: string): Tok[] => toks.map((k) => (k.t === 'sec' && k.id === id ? { ...k, name } : k));

// ---- links ----
type Link = { kind: 'heading'; name: string } | { kind: 'block'; id: string };
type Shape = 'hover' | 'embed';
const linkText = (l: Link) => (l.kind === 'heading' ? `Note#${l.name}` : `Note#^${l.id}`);
/** The part Obsidian gives for `link` in `lines` (hover: a heading's BODY; embed: with the heading), and the counter fences in it; null: the link resolves nowhere. */
function partOf(lines: string[], link: Link, shape: Shape): { text: string; start: number; fences: number[] } | null {
	const cache = cacheOf(lines);
	let start: number;
	let end: number;
	if (link.kind === 'heading') {
		const i = cache.headings.findIndex((h) => h.heading.toLowerCase() === link.name.toLowerCase());
		if (i < 0) return null;
		const h = (cache.headings[i].position as { start: { line: number } }).start.line;
		const next = cache.headings[i + 1] ? (cache.headings[i + 1].position as { start: { line: number } }).start.line : lines.length;
		start = shape === 'hover' ? h + 1 : h;
		end = next - 1;
	} else {
		const b = cache.blocks[link.id] as { position: { start: { line: number }; end: { line: number } } } | undefined;
		if (!b) return null;
		start = b.position.start.line;
		end = b.position.end.line;
	}
	const fences: number[] = [];
	for (let i = start; i <= end; i++) if (lines[i] === '```ds-counter') fences.push(i);
	return { text: lines.slice(start, end + 1).join('\n'), start, fences };
}
/** Whether `link` names exactly one block in `lines` (a heading name once) and that block draws the counter at `fence`. */
function namesOnly(lines: string[], link: Link, shape: Shape, fence: number | null): boolean {
	if (fence === null) return false;
	if (link.kind === 'heading' && cacheOf(lines).headings.filter((h) => h.heading.toLowerCase() === link.name.toLowerCase()).length !== 1) return false;
	return partOf(lines, link, shape)?.fences.includes(fence) === true;
}
function popoverEl(app: App, link: string, data?: unknown): HTMLElement {
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
	const popover = data === undefined ? { hoverEl } : { hoverEl, embed: { data } };
	noteHoverLink(app, { linktext: link, sourcePath: 'Host.md', hoverParent: { hoverPopover: popover } });
	return el;
}
function embedEl(src: string, lp: boolean): HTMLElement {
	const embed = document.createElement('div');
	embed.className = 'internal-embed markdown-embed';
	embed.setAttribute('src', src);
	const el = embed.appendChild(document.createElement('div'));
	if (lp) document.createElement('div').appendChild(embed).parentElement!.className = 'cm-embed-block';
	document.body.appendChild(embed.parentElement ?? embed);
	return el;
}

// ---- oracle (SC-612's, independent of lineMap) ----
const SPLIT = /\r\n|\r|\n/;
function spansOf(ls: string[]): Array<[number, number]> {
	const res: Array<[number, number]> = [];
	for (let i = 0; i < ls.length; i++) {
		const m = /^((?:> )?)```(\S*)$/.exec(ls[i]);
		if (!m) continue;
		let j = i + 1;
		while (j < ls.length && ls[j] !== `${m[1]}\`\`\``) j++;
		if (m[2] === 'ds-counter') res.push([i, Math.min(j, ls.length - 1)]);
		i = j;
	}
	return res;
}
const lcs = (a: string[], b: string[]): number => {
	let prev = new Array<number>(b.length + 1).fill(0);
	for (let i = 0; i < a.length; i++) {
		const cur = new Array<number>(b.length + 1).fill(0);
		for (let j = 0; j < b.length; j++) cur[j + 1] = a[i] === b[j] ? prev[j] + 1 : Math.max(prev[j + 1], cur[j]);
		prev = cur;
	}
	return prev[b.length];
};
const dist = (a: string[], b: string[]): number => a.length + b.length - 2 * lcs(a, b);
function placements(bt: string, at: string, pB: number): Array<number | 'deleted'> | null {
	const a = bt.split(SPLIT);
	const b = at.split(SPLIT);
	const dmin = dist(a, b);
	const sp = spansOf(a).find(([x]) => x === pB);
	if (!sp) return null;
	const [s, e] = sp;
	const blk = a.slice(s, e + 1);
	const opts: Array<number | 'deleted'> = [];
	for (const [qs, qe] of spansOf(b)) {
		if (b.slice(qs, qe + 1).join('\n') === blk.join('\n') && dist(a.slice(0, s), b.slice(0, qs)) + dist(a.slice(e + 1), b.slice(qe + 1)) === dmin) opts.push(qs);
	}
	if (dist([...a.slice(0, s), ...a.slice(e + 1)], b) + blk.length === dmin) opts.push('deleted');
	return opts;
}
const countBody = (text: string, body: string): number => {
	const ls = text.split(SPLIT);
	return spansOf(ls).filter(([s, e]) => ls.slice(s + 1, e).join('\n') === body).length;
};

// ---- one cell ----
type Plus = 'no +' | '+ redrawn' | '+ stale';
type Cell = {
	layout: string; toks: Tok[]; P: string; link: Link; shape: Shape; mode: 'rv' | 'lp'; click: 'card' | 'form'; plus: Plus; edit: string; after: (t: Tok[]) => Tok[] | null;
};
type Rec = Record<string, unknown>;
const DISK = droppedWriteMessage('Note');
async function run(c: Cell): Promise<Rec | null> {
	const plus = c.plus !== 'no +';
	// before the outside write: every counter that reads like P (5) is one higher with a + (the + makes P read like them)
	const mountToks = plus ? c.toks.map((k) => (isC(k) && k.id !== c.P && k.v === 5 ? { ...k, v: 6 } : k)) : c.toks;
	const mount = render(mountToks);
	const p0 = partOf(mount.lines, c.link, c.shape);
	if (!p0 || !p0.fences.includes(mount.fence.get(c.P)!)) return null; // the link does not draw P
	const before = render(plus ? setV(mountToks, c.P, 6) : mountToks);
	const nowToks = c.after(plus ? setV(mountToks, c.P, 6) : mountToks);
	if (nowToks === null) return null;
	const now = render(nowToks);
	// Obsidian redraws a preview whose part changed (or whose link no longer resolves): new hosts, nothing stale to click. Those cells are not this gap.
	const pb = partOf(before.lines, c.link, c.shape);
	const pn = partOf(now.lines, c.link, c.shape);
	if (!pb || !pn || pb.text !== pn.text) return { skip: 'redrawn' };
	const app = new App();
	app.vault.setFile('Note.md', mount.text);
	let cacheLines = mount.lines;
	jest.spyOn(app.metadataCache, 'getFileCache').mockImplementation(() => cacheOf(cacheLines) as never);
	const rel = mount.fence.get(c.P)! - p0.start;
	const section: Section = { current: { text: p0.text, lineStart: rel, lineEnd: rel + 3 } };
	const el = c.shape === 'hover' ? popoverEl(app, linkText(c.link), mount.text) : embedEl(linkText(c.link), c.mode === 'lp');
	const host = new ReadingModeBlockHost(new Plugin(app) as never, el, ctxOf(section), 'ds-counter');
	host.setMountedBody(bodyOf(5));
	await settle();
	let known = 5;
	if (plus) {
		host.notePersistIntent();
		await settle();
		const ok = await host.replaceSource(bodyOf(6), { fromView: true });
		if (!ok) {
			cleanup(el);
			return { skip: 'own + refused' };
		}
		known = 6;
		const post = before;
		if (app.vault.getContent('Note.md') !== post.text) {
			cleanup(el);
			return { skip: 'own + wrote elsewhere' };
		}
		cacheLines = post.lines;
		if (c.plus === '+ redrawn') {
			const p1 = partOf(post.lines, c.link, c.shape)!;
			const r1 = post.fence.get(c.P)! - p1.start;
			section.current = { text: p1.text, lineStart: r1, lineEnd: r1 + 3 };
			host.rebind(el, ctxOf(section));
			await settle();
		}
		Notice.notices.length = 0;
		resetDroppedWriteNotices();
	}
	const outside = () => {
		app.vault.setFile('Note.md', now.text);
		cacheLines = now.lines;
	};
	outside(); // the outside write lands before the click, so before the pin is placed
	if (c.click === 'card') {
		host.notePersistIntent();
		await settle();
		await host.replaceSource(bodyOf(known + 1), { fromView: true });
	} else {
		const pin = host.pinPosition();
		await settle();
		await (pin ? host.replaceSource(bodyOf(known, 'Edited'), { pin, pinOnly: true }) : host.replaceSource(bodyOf(known, 'Edited')));
	}
	const final = app.vault.getContent('Note.md')!;
	const notices = (Notice.notices as unknown[]).map((n) => (n === DISK ? 'disk' : `other:${String(n).slice(0, 40)}`));
	cleanup(el);
	let outcome = 'refused';
	if (final !== now.text) {
		const fl = final.split('\n');
		const nl = now.lines;
		const changed = [...now.fence.entries()].filter(([, l]) => fl.slice(l, l + 4).join('\n') !== nl.slice(l, l + 4).join('\n')).map(([id]) => id);
		outcome = fl.length !== nl.length || changed.length !== 1 ? `CORRUPT:${changed.join(',')}` : changed[0] === c.P ? 'A' : `OTHER:${changed[0]}`;
	}
	const pB = before.fence.get(c.P)!;
	const pA = now.fence.get(c.P) ?? null;
	const opts = placements(before.text, now.text, pB);
	const body = bodyOf(known);
	const twinned = Math.max(countBody(before.text, body), countBody(now.text, body)) > 1;
	const linkOk = namesOnly(before.lines, c.link, c.shape, pB) && namesOnly(now.lines, c.link, c.shape, pA);
	return {
		layout: c.layout, edit: c.edit, P: c.P, link: linkText(c.link), shape: c.shape, mode: c.mode, click: c.click, plus: c.plus,
		outcome, notices, pB, pA, opts, amb: opts !== null && opts.length > 1, twinned, headMap: mapLine(before.text, now.text, pB), linkOk, bt: before.text, at: now.text,
	};
}
function cleanup(el: HTMLElement) {
	el.closest('.hover-popover')?.remove();
	(el.closest('.cm-embed-block') ?? el.closest('.internal-embed'))?.remove();
	jest.restoreAllMocks();
	Notice.notices.length = 0;
	resetDroppedWriteNotices();
}

// ---- the sweep: layouts x links x edits ----
const HEAD = [L('# N'), B, L('TOP'), B];
const AFTER_H = [L('## After'), B, L('END')];
const TAIL = [B, L('END')];
type Layout = { name: string; toks: Tok[]; links: Array<{ link: Link; P: string }> };
const T = 'Tracker';
const LAYOUTS: Layout[] = [
	// heading links: the twin unit is a whole section (a hover / embed of `## Tracker` names the FIRST one)
	{ name: 'sec-twin', toks: [...HEAD, S('a', T), S('b', T), ...AFTER_H], links: [{ link: { kind: 'heading', name: T }, P: 'a' }] },
	{ name: 'sec-twin+diff-below', toks: [...HEAD, S('a', T), S('b', T), S('d', 'Other', 9), ...AFTER_H], links: [{ link: { kind: 'heading', name: T }, P: 'a' }] },
	{ name: 'sec-twin+diff-above', toks: [...HEAD, S('d', 'Other', 9), S('a', T), S('b', T), ...AFTER_H], links: [{ link: { kind: 'heading', name: T }, P: 'a' }] },
	{ name: 'sec-triple+diff', toks: [...HEAD, S('a', T), S('b', T), S('c', T), S('d', 'Other', 9), ...AFTER_H], links: [{ link: { kind: 'heading', name: T }, P: 'a' }] },
	{ name: 'sec-named', toks: [...HEAD, S('a', T), S('b', 'Other'), ...AFTER_H], links: [{ link: { kind: 'heading', name: T }, P: 'a' }, { link: { kind: 'heading', name: 'Other' }, P: 'b' }] },
	{ name: 'sec-named+prose', toks: [...HEAD, S('a', T), L('## Mid'), B, L('p-mid'), B, S('b', 'Other'), ...AFTER_H], links: [{ link: { kind: 'heading', name: T }, P: 'a' }, { link: { kind: 'heading', name: 'Other' }, P: 'b' }] },
	// block links: counters separated only by blank lines; the marker under the hovered one (or both)
	{ name: 'blk-twin-blank-lowmark', toks: [...HEAD, C('a'), B, C('b', 5, 'p'), ...TAIL], links: [{ link: { kind: 'block', id: 'p' }, P: 'b' }] },
	{ name: 'blk-twin-blank-upmark', toks: [...HEAD, C('a', 5, 'p'), B, C('b'), ...TAIL], links: [{ link: { kind: 'block', id: 'p' }, P: 'a' }] },
	{ name: 'blk-twin-blank-bothmark', toks: [...HEAD, C('a', 5, 'pa'), B, C('b', 5, 'pb'), ...TAIL], links: [{ link: { kind: 'block', id: 'pa' }, P: 'a' }, { link: { kind: 'block', id: 'pb' }, P: 'b' }] },
	{ name: 'blk-twin-blank2-lowmark', toks: [...HEAD, C('a'), B, B, C('b', 5, 'p'), ...TAIL], links: [{ link: { kind: 'block', id: 'p' }, P: 'b' }] },
	{ name: 'blk-twin-tight-lowmark', toks: [...HEAD, C('a'), C('b', 5, 'p'), ...TAIL], links: [{ link: { kind: 'block', id: 'p' }, P: 'b' }] },
	{ name: 'blk-twin-blank+diff-below', toks: [...HEAD, C('a'), B, C('b', 5, 'p'), B, C('d', 9), ...TAIL], links: [{ link: { kind: 'block', id: 'p' }, P: 'b' }] },
	{ name: 'blk-twin-blank+diff-above', toks: [...HEAD, C('d', 9), B, C('a'), B, C('b', 5, 'p'), ...TAIL], links: [{ link: { kind: 'block', id: 'p' }, P: 'b' }] },
	{ name: 'blk-tight-diff-neighbour', toks: [...HEAD, C('d', 7), C('a'), B, L('P2'), B, C('b', 5, 'p'), ...TAIL], links: [{ link: { kind: 'block', id: 'p' }, P: 'b' }] },
	{ name: 'blk-triple+diff', toks: [...HEAD, C('a'), B, C('b'), B, C('c', 5, 'p'), B, C('d', 9), ...TAIL], links: [{ link: { kind: 'block', id: 'p' }, P: 'c' }] },
	{ name: 'blk-triple-midmark', toks: [...HEAD, C('a'), B, C('b', 5, 'p'), B, C('c'), ...TAIL], links: [{ link: { kind: 'block', id: 'p' }, P: 'b' }] },
	{ name: 'blk-uniq', toks: [...HEAD, C('a', 9), B, C('b', 5, 'p'), ...TAIL], links: [{ link: { kind: 'block', id: 'p' }, P: 'b' }] },
];
function editsFor(toks: Tok[], P: string): Record<string, (t: Tok[]) => Tok[] | null> {
	const ids = toks.filter(isC).map((k) => k.id);
	const others = ids.filter((x) => x !== P);
	const top = (t: Tok[] | null) => (t === null ? null : setLine(t, 'TOP', 'TOP edited'));
	const end = (t: Tok[] | null) => (t === null ? null : setLine(t, 'END', 'END edited'));
	const afterH = (t: Tok[] | null) => (t === null ? null : setLine(t, '## After', '## After edited'));
	const e: Record<string, (t: Tok[]) => Tok[] | null> = {
		none: (t) => t,
		top: (t) => top(t),
		end: (t) => end(t),
		'del-P': (t) => del(t, P),
		'del-P-keepmark': (t) => (ctrOf(t, P).t === 'ctr' && (ctrOf(t, P) as { mark?: string }).mark ? del(t, P, true) : null),
		'del-P-keepmark-pre': (t) => (ctrOf(t, P).t === 'ctr' && (ctrOf(t, P) as { mark?: string }).mark ? del(t, P, true, true) : null),
		'edit-P': (t) => setV(t, P, ctrOf(t, P).v + 3),
		'move-P-end': (t) => {
			const r = del(t, P);
			const at = r.findIndex((k) => k.t === 'line' && (k.s === 'END' || k.s === '## After'));
			return at < 0 ? null : insAt(r, at, [ctrOf(t, P), ...(ctrOf(t, P).t === 'sec' ? [] : [B])]);
		},
		'ins-twin-above-adj': (t) => insAt(t, idx(t, P), [ctrOf(t, P).t === 'sec' ? S('N', (ctrOf(t, P) as { name: string }).name, ctrOf(t, P).v) : C('N', ctrOf(t, P).v), ...(ctrOf(t, P).t === 'sec' ? [] : [B])]),
		'ins-twin-below-adj': (t) => insAt(t, idx(t, P) + 1, ctrOf(t, P).t === 'sec' ? [S('N', 'Copy', ctrOf(t, P).v)] : [B, C('N', ctrOf(t, P).v)]),
	};
	for (const o of others) {
		e[`del-${o}`] = (t) => del(t, o);
		e[`del-${o}-keepmark`] = (t) => (ctrOf(t, o).t === 'ctr' && (ctrOf(t, o) as { mark?: string }).mark ? del(t, o, true) : null);
		e[`del-${o}-keepmark-pre`] = (t) => (ctrOf(t, o).t === 'ctr' && (ctrOf(t, o) as { mark?: string }).mark ? del(t, o, true, true) : null);
		e[`bump-${o}`] = (t) => setV(t, o, ctrOf(t, o).v + 1);
		e[`del-P-rename-${o}`] = (t) => (ctrOf(t, P).t === 'sec' && ctrOf(t, o).t === 'sec' ? rename(del(t, P), o, (ctrOf(t, P) as { name: string }).name) : null);
		e[`swap-name-${o}`] = (t) => {
			const p = ctrOf(t, P);
			const q = ctrOf(t, o);
			return p.t === 'sec' && q.t === 'sec' && p.name !== q.name ? rename(rename(t, P, q.name), o, p.name) : null;
		};
	}
	for (const name of Object.keys(e)) {
		if (name === 'none' || name === 'top' || name === 'end') continue;
		const f = e[name];
		e[`${name}+top`] = (t) => top(f(t));
		e[`${name}+end`] = (t) => end(f(t));
		e[`${name}+afterH`] = (t) => afterH(f(t));
	}
	return e;
}
/** Every (shape, mode, click, + mode) a click can come through. */
const COMBOS: Array<Pick<Cell, 'shape' | 'mode' | 'click' | 'plus'>> = [];
for (const [shape, mode] of [['hover', 'rv'], ['embed', 'rv'], ['embed', 'lp']] as Array<[Shape, 'rv' | 'lp']>)
	for (const click of ['card', 'form'] as const) for (const plus of ['no +', '+ redrawn', '+ stale'] as Plus[]) COMBOS.push({ shape, mode, click, plus });
/** Two cells per (layout, link, edit), the ways it is clicked rotating through the 18 combinations (every combination meets every edit family). */
function sweepCells(): Cell[] {
	const out: Cell[] = [];
	let n = 0;
	for (const lay of LAYOUTS)
		for (const { link, P } of lay.links)
			for (const [edit, after] of Object.entries(editsFor(lay.toks, P))) {
				for (const k of [0, 1]) out.push({ layout: lay.name, toks: lay.toks, P, link, ...COMBOS[(n * 7 + k * 9) % COMBOS.length], edit, after });
				n++;
			}
	return out;
}

// ---- the fuzz: random notes of sections / counters / markers x 1-3 random outside edits ----
let seed = 1;
const rnd = (): number => {
	seed |= 0;
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const ri = (n: number) => Math.floor(rnd() * n);
const pick = <T,>(xs: T[]): T => xs[ri(xs.length)];
let nid = 0;
function fuzzNote(): { toks: Tok[]; P: string; link: Link } | null {
	nid = 0;
	const secs = rnd() < 0.5;
	const n = 2 + ri(3);
	const toks: Tok[] = [...HEAD];
	const names = ['Tracker', 'Tracker', 'Other', 'Third'];
	for (let i = 0; i < n; i++) {
		const v = rnd() < 0.7 ? 5 : pick([7, 9]);
		if (secs) {
			if (i > 0 && rnd() < 0.15) toks.push(L('## Mid'), B, L(`p${i}`), B);
			toks.push(S(`b${i}`, pick(names), v));
		} else {
			if (i > 0) toks.push(...pick([[B], [B], [B], [B, B], [], [B, L(`P${i}`), B]]));
			toks.push(C(`b${i}`, v, rnd() < 0.45 ? `m${i}` : undefined));
		}
	}
	toks.push(...(secs ? AFTER_H : TAIL));
	const cands = toks.filter(isC).filter((k) => k.v === 5);
	if (!cands.length) return null;
	const P = pick(cands);
	if (P.t === 'sec') return { toks, P: P.id, link: { kind: 'heading', name: P.name } };
	if (P.t === 'ctr' && P.mark) return { toks, P: P.id, link: { kind: 'block', id: P.mark } };
	return null;
}
type Op = (t: Tok[], P: string) => Tok[] | null;
const fuzzOps: Array<[string, Op, number]> = [
	['del-any', (t) => { const c = t.filter(isC); return c.length ? del(t, pick(c).id, rnd() < 0.5, rnd() < 0.5) : null; }, 3],
	['del-P', (t, P) => (idx(t, P) < 0 ? null : del(t, P, rnd() < 0.5, rnd() < 0.5)), 3],
	['paste', (t, P) => { const c = t.filter(isC); if (!c.length) return null; const src = idx(t, P) >= 0 && rnd() < 0.6 ? ctrOf(t, P) : pick(c); const at = 2 + ri(Math.max(1, t.length - 2)); return insAt(t, at, src.t === 'sec' ? [{ ...src, id: `n${nid++}` }] : [{ ...src, id: `n${nid++}`, mark: undefined }, B]); }, 3],
	['edit-line', (t) => { const i = t.map((k, j) => (k.t === 'line' && k.s !== '' && !k.s.startsWith('^') ? j : -1)).filter((j) => j >= 0); if (!i.length) return null; const j = pick(i); const r = t.slice(); r[j] = L(`${(t[j] as { s: string }).s} edited`); return r; }, 4],
	['type', (t) => insAt(t, 2 + ri(Math.max(1, t.length - 2)), [L('typed'), B]), 1],
	['del-blank', (t) => { const i = t.map((k, j) => (k.t === 'line' && k.s === '' && j > 1 ? j : -1)).filter((j) => j >= 0); if (!i.length) return null; const j = pick(i); return [...t.slice(0, j), ...t.slice(j + 1)]; }, 1],
	['bump', (t, P) => { const c = t.filter(isC).filter((k) => k.id !== P); return c.length ? setV(t, pick(c).id, pick(c).v + 1) : null; }, 1],
	['twin-of-P', (t, P) => { const p = idx(t, P) >= 0 ? ctrOf(t, P) : null; const c = t.filter(isC).filter((k) => k.id !== P); if (!p || !c.length) return null; return setV(t, pick(c).id, p.v); }, 1],
	['rename-swap', (t, P) => { const p = idx(t, P) >= 0 ? ctrOf(t, P) : null; const c = t.filter((k) => k.t === 'sec' && k.id !== P) as Array<{ id: string; name: string }>; if (!p || p.t !== 'sec' || !c.length) return null; const q = pick(c); return rnd() < 0.5 ? rename(rename(t, P, q.name), q.id, p.name) : rename(del(t, P), q.id, p.name); }, 2],
	['move-P', (t, P) => { if (idx(t, P) < 0) return null; const p = ctrOf(t, P); const r = del(t, P); return insAt(r, 2 + ri(Math.max(1, r.length - 2)), p.t === 'sec' ? [p] : [p, B]); }, 1],
];
const pickOp = (): [string, Op] => {
	const tot = fuzzOps.reduce((s, [, , w]) => s + w, 0);
	let x = rnd() * tot;
	for (const [n, f, w] of fuzzOps) if ((x -= w) < 0) return [n, f];
	return [fuzzOps[0][0], fuzzOps[0][1]];
};
function fuzzCells(sd: number, notes: number): Cell[] {
	seed = sd;
	const out: Cell[] = [];
	for (let i = 0; i < notes; i++) {
		const nt = fuzzNote();
		if (!nt) continue;
		const nops = 1 + ri(3);
		const picked = Array.from({ length: nops }, pickOp);
		const ops: Op[] = picked.map(([, f]) => f);
		const s0 = seed;
		// the ops are replayed from the same seed on the round's note (after the own + the values differ)
		const after = (t: Tok[]): Tok[] | null => {
			const keep = seed;
			seed = s0;
			let r: Tok[] | null = t;
			for (const op of ops) {
				const n2 = op(r!, nt.P);
				if (n2) r = n2;
			}
			seed = keep;
			return r === t ? null : r;
		};
		const shape: Shape = rnd() < 0.5 ? 'hover' : 'embed';
		const mode: 'rv' | 'lp' = shape === 'embed' && rnd() < 0.5 ? 'lp' : 'rv';
		for (const click of ['card', 'form'] as const)
			for (const plus of ['no +', '+ redrawn', '+ stale'] as Plus[])
				out.push({ layout: `fuzz${sd}-${i}`, toks: nt.toks, P: nt.P, link: nt.link, shape, mode, click, plus, edit: picked.map(([n]) => n).join('+'), after });
	}
	return out;
}


// ---- the checks ----
/**
 * The residual classes (accepted, SC-621 r1 F2): R1 a move among text-identical blocks, R2 the drawn-from section deleted while a neighbour is renamed to its name.
 * In the fuzz a move is also the pair "paste an identical copy of the block + delete a counter" (the note then reads as the block moved), and a rename is `rename-swap`.
 */
const residualClass = (edit: string): 'R1' | 'R2' | null => {
	const parts = edit.split('+');
	const deletes = parts.some((p) => p === 'del-any' || p === 'del-P');
	if (parts.some((p) => p.startsWith('move-P')) || (parts.includes('paste') && deletes)) return 'R1';
	if (parts.some((p) => p.startsWith('del-P-rename-') || p === 'rename-swap')) return 'R2';
	return null;
};
async function collect(cells: Cell[]): Promise<Rec[]> {
	const records: Rec[] = [];
	const warn = () => jest.spyOn(console, 'warn').mockImplementation(() => {});
	warn();
	for (const c of cells) {
		let r: Rec | null;
		try {
			r = await run(c);
		} catch (e) {
			r = { layout: c.layout, edit: c.edit, err: String(e) };
		}
		warn(); // `cleanup` restores every spy
		if (r === null || 'skip' in r) continue;
		records.push(r);
	}
	return records;
}
function check(records: Rec[]) {
	const bad: string[] = [];
	const t = { cells: records.length, saved: 0, refused: 0, ambiguousTwinned: 0, other: 0, R1: 0, R2: 0 };
	for (const r of records as Array<Record<string, any>>) {
		const key = `${r.layout} ${r.edit} ${r.link} ${r.shape}/${r.mode} ${r.click} ${r.plus}`;
		if (r.err) {
			bad.push(`error: ${key} ${r.err}`);
			continue;
		}
		const out = r.outcome as string;
		if (out.startsWith('CORRUPT')) bad.push(`corrupt: ${key} ${out}`);
		if (out === 'refused' ? JSON.stringify(r.notices) !== '["disk"]' : r.notices.length !== 0) bad.push(`notice: ${key} ${out} ${r.notices}`);
		if (out === 'A') t.saved++;
		else if (out === 'refused') t.refused++;
		if (r.amb && r.twinned) {
			t.ambiguousTwinned++;
			// the oracle sees a tie between identical counters: nothing is written
			if (out !== 'refused') bad.push(`written in an ambiguous twinned cell: ${key} -> ${out}`);
		}
		if (out.startsWith('OTHER')) {
			t.other++;
			const cls = residualClass(r.edit);
			if (cls === null) bad.push(`written into another counter outside R1/R2: ${key} -> ${out}`);
			else t[cls]++;
		}
		// the refusals this rule must not add: the one cheapest placement IS the drawn-from block, the head-first line map and the link both name it, and the link names one block
		if (out === 'refused' && !r.amb && r.opts && r.opts[0] === r.pA && r.pA !== null && r.headMap === r.pA && r.linkOk) bad.push(`refused although nothing is ambiguous: ${key}`);
	}
	return { bad, t };
}

// pinned totals (a regression fence: `other` = writes into another counter in a cell the oracle calls unambiguous, all in R1 / R2) and the fuzz size
const SWEEP_PINNED = { cells: 1170, saved: 566, refused: 550, ambiguousTwinned: 418, other: 54, R1: 36, R2: 18 };
const FUZZ_SEEDS = [1, 2];
const FUZZ_NOTES = 150;
const FUZZ_PINNED: Record<number, object> = {
	1: { cells: 312, saved: 228, refused: 78, ambiguousTwinned: 42, other: 6, R1: 2, R2: 4 },
	2: { cells: 264, saved: 204, refused: 56, ambiguousTwinned: 30, other: 4, R1: 2, R2: 2 },
};

describe('SC-621: sweep of a click in a preview or embed of part of a note after one outside write, and a seeded fuzz', () => {
	test('sweep: no write in a twinned tie, none into another counter outside R1/R2, no refusal outside a tie, one Notice per refusal', async () => {
		const { bad, t } = check(await collect(sweepCells()));
		expect(bad.slice(0, 20)).toEqual([]);
		expect(t).toEqual(SWEEP_PINNED);
	}, 120000);

	test.each(FUZZ_SEEDS)('fuzz seed %i: the same checks over random notes and 1-3 random outside edits', async (sd) => {
		const { bad, t } = check(await collect(fuzzCells(sd, FUZZ_NOTES)));
		expect(bad.slice(0, 20)).toEqual([]);
		expect(t).toEqual(FUZZ_PINNED[sd]);
	}, 120000);
});
