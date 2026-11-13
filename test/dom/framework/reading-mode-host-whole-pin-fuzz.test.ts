// SC-612 -- a seeded fuzz behind reading-mode-host-whole-pin.test.ts, the second sweep: random notes of 2-4 counters (70% value 5; blank / two blank / no / prose separators;
// callouts, an unterminated trailing fence, CRLF, twins in another language) x 0-3 random outside edits (delete any / the pinned one, paste an identical or a different counter,
// edit / type prose, delete a blank line, bump a sibling, make a sibling a twin, move or edit the pinned one) x the form and three card section modes. Ground truth is tracked
// by block id. The oracle is independent of lineMap (an LCS placement cost, as in the sweep). Asserted per cell: integrity (exactly one block's body changed, every other byte kept,
// CRLF too); one Notice per refusal, none per save; no refusal without an outside edit; the next round of a refused cell saves; in a cell whose body is twinned and the oracle sees
// a tie, nothing is written; no refusal where the one cheapest placement is the pinned block and the head-first map puts it there too (the refusals this rule must not add).
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { droppedWriteMessage, resetDroppedWriteNotices } from '../../../src/framework/host/droppedWriteNotice';
import { mapLine } from '../../../src/framework/host/lineMap';
import { App, Notice, Plugin } from '../../mocks/obsidian';

type Sec = { text: string; lineStart: number; lineEnd: number };
type Section = { current: Sec | null };
const ctxOf = (section: Section) =>
	({ docId: 'doc-r3', sourcePath: 'Note.md', frontmatter: undefined, addChild: () => {}, getSectionInfo: () => section.current }) as never;

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

type Blk = { t: 'blk'; id: string; lang: string; v: number; name: string; pre: string; hdr: boolean };
type Tok = Blk | { t: 'line'; s: string };
const isBlk = (k: Tok): k is Blk => k.t === 'blk';
const L = (s: string): Tok => ({ t: 'line', s });
let nid = 0;
const newId = () => `n${nid++}`;

function render(toks: Tok[], unterm: boolean, eol: string): { text: string; fence: Map<string, number>; secs: Map<string, [number, number]>; order: string[]; ok: boolean } {
	const lines: string[] = [];
	const fence = new Map<string, number>();
	const secs = new Map<string, [number, number]>();
	const order: string[] = [];
	let ok = true;
	toks.forEach((k, i) => {
		if (!isBlk(k)) {
			lines.push(k.s);
			return;
		}
		const p = k.pre;
		const start = lines.length;
		if (p && k.hdr) lines.push('> [!note]');
		fence.set(k.id, lines.length);
		if (k.lang === 'ds-counter') order.push(k.id);
		lines.push(`${p}\`\`\`${k.lang}`, `${p}name: ${k.name}`, `${p}current_value: ${k.v}`);
		const last = i === toks.length - 1;
		if (!(unterm && last && p === '' && k.lang === 'ds-counter')) lines.push(`${p}\`\`\``);
		secs.set(k.id, [p ? start : fence.get(k.id)!, lines.length - 1]);
	});
	if (unterm) {
		const lastBlk = [...toks].reverse().find(isBlk);
		if (!lastBlk || toks[toks.length - 1] !== lastBlk || lastBlk.pre !== '' || lastBlk.lang !== 'ds-counter') ok = unterm ? false : true;
	}
	return { text: lines.join(eol), fence, secs, order, ok };
}

const SEPS: Tok[][] = [[L('')], [L('')], [L('')], [L(''), L('')], [], [L(''), L('P'), L('')]];
function layout(): { toks: Tok[]; unterm: boolean; eol: string; tag: string } {
	const nb = 2 + ri(3); // 2..4 blocks
	const callout = rnd() < 0.2;
	const unterm = !callout && rnd() < 0.12;
	const eol = rnd() < 0.15 ? '\r\n' : '\n';
	const toks: Tok[] = [L('# N'), L(''), L('TOP'), L('')];
	for (let b = 0; b < nb; b++) {
		if (b > 0) {
			const s = pick(SEPS).map((x) => (x.t === 'line' && x.s === 'P' ? L(`P${b}`) : x));
			toks.push(...(callout && s.length === 0 ? [L('')] : s));
		}
		const r = rnd();
		const v = r < 0.7 ? 5 : r < 0.85 ? 7 : 5;
		const lang = rnd() < 0.08 ? 'ds-other' : 'ds-counter';
		toks.push({ t: 'blk', id: `b${b}`, lang, v, name: 'Twin', pre: callout ? '> ' : '', hdr: true });
	}
	if (!unterm) toks.push(L(''), L('END'));
	const tag = `nb${nb}${callout ? '-callout' : ''}${unterm ? '-unterm' : ''}${eol === '\r\n' ? '-crlf' : ''}`;
	return { toks, unterm, eol, tag };
}

const blkIdx = (toks: Tok[], id: string) => toks.findIndex((k) => isBlk(k) && k.id === id);
function del(toks: Tok[], id: string): Tok[] {
	const r = toks.slice();
	const i = blkIdx(r, id);
	if (i < 0) return r;
	const next = r[i + 1];
	if (next && next.t === 'line' && next.s === '') r.splice(i, 2);
	else if (i > 0 && r[i - 1].t === 'line' && (r[i - 1] as { s: string }).s === '') r.splice(i - 1, 2);
	else r.splice(i, 1);
	return r;
}
const insAt = (toks: Tok[], at: number, add: Tok[]): Tok[] => [...toks.slice(0, at), ...add, ...toks.slice(at)];
const posIn = (toks: Tok[]) => 2 + ri(Math.max(1, toks.length - 1)); // after '# N', ''

type Op = (toks: Tok[], P: string) => [Tok[], string] | null;
const blks = (toks: Tok[]) => toks.filter(isBlk);
const OPS: Record<string, Op> = {
	del: (t, P) => {
		const c = blks(t);
		if (!c.length) return null;
		const b = pick(c);
		return [del(t, b.id), `del:${b.id === P ? 'P' : b.id}`];
	},
	delP: (t, P) => (blkIdx(t, P) < 0 ? null : [del(t, P), 'delP']),
	dupIns: (t, P) => {
		const c = blks(t);
		if (!c.length) return null;
		const src = rnd() < 0.6 && blkIdx(t, P) >= 0 ? (t[blkIdx(t, P)] as Blk) : pick(c);
		const at = posIn(t);
		const sep = rnd() < 0.8 ? [L('')] : [L(''), L('Q'), L('')];
		return [insAt(t, at, [{ ...src, id: newId() }, ...sep]), `dup:${src.id === P ? 'P' : src.id}@${at}`];
	},
	diffIns: (t) => {
		const at = posIn(t);
		return [insAt(t, at, [{ t: 'blk', id: newId(), lang: rnd() < 0.5 ? 'ds-counter' : 'ds-other', v: 9, name: 'Twin', pre: '', hdr: true }, L('')]), `diff@${at}`];
	},
	editLine: (t) => {
		const idx = t.map((k, i) => (k.t === 'line' && k.s !== '' ? i : -1)).filter((i) => i >= 0);
		if (!idx.length) return null;
		const i = pick(idx);
		const r = t.slice();
		r[i] = L(`${(t[i] as { s: string }).s} edited`);
		return [r, `edit:${(t[i] as { s: string }).s}`];
	},
	insProse: (t) => {
		const at = posIn(t);
		return [insAt(t, at, [L('typed'), L('')]), `prose@${at}`];
	},
	delBlank: (t) => {
		const idx = t.map((k, i) => (k.t === 'line' && k.s === '' && i > 1 ? i : -1)).filter((i) => i >= 0);
		if (!idx.length) return null;
		const i = pick(idx);
		return [[...t.slice(0, i), ...t.slice(i + 1)], `delblank@${i}`];
	},
	bump: (t, P) => {
		const c = blks(t).filter((b) => b.id !== P);
		if (!c.length) return null;
		const b = pick(c);
		return [t.map((k) => (isBlk(k) && k.id === b.id ? { ...k, v: k.v + 1 } : k)), `bump:${b.id}`];
	},
	makeTwin: (t, P) => {
		const pi = blkIdx(t, P);
		const c = blks(t).filter((b) => b.id !== P);
		if (pi < 0 || !c.length) return null;
		const b = pick(c);
		const pv = (t[pi] as Blk).v;
		return [t.map((k) => (isBlk(k) && k.id === b.id ? { ...k, v: pv } : k)), `maketwin:${b.id}`];
	},
	moveP: (t, P) => {
		const pi = blkIdx(t, P);
		if (pi < 0) return null;
		const pb = t[pi];
		const r = del(t, P);
		const at = posIn(r);
		return [insAt(r, at, [pb, L('')]), `moveP@${at}`];
	},
	editP: (t, P) => (blkIdx(t, P) < 0 ? null : [t.map((k) => (isBlk(k) && k.id === P ? { ...k, v: k.v + 3 } : k)), 'editP']),
};
const OPW: Array<[string, number]> = [
	['del', 3], ['delP', 3], ['dupIns', 4], ['diffIns', 1], ['editLine', 3], ['insProse', 1], ['delBlank', 1], ['bump', 1], ['makeTwin', 1], ['moveP', 1], ['editP', 0.3],
];
const pickOp = (): string => {
	const tot = OPW.reduce((s, [, w]) => s + w, 0);
	let x = rnd() * tot;
	for (const [n, w] of OPW) if ((x -= w) < 0) return n;
	return 'del';
};

/** Blocks of `ds-counter` (prefix-aware, unterminated trailing too) with fence line and body. */
function parse(text: string): Array<{ start: number; end: number; body: string }> {
	const ls = text.split(/\r\n|\r|\n/);
	const out: Array<{ start: number; end: number; body: string }> = [];
	for (let i = 0; i < ls.length; i++) {
		const m = /^((?:> )?)```(\S*)$/.exec(ls[i]);
		if (!m) continue;
		const pre = m[1];
		let j = i + 1;
		while (j < ls.length && ls[j] !== `${pre}\`\`\``) j++;
		if (m[2] === 'ds-counter') out.push({ start: i, end: j, body: ls.slice(i + 1, j).join('\n') });
		i = j;
	}
	return out;
}

const DISK = droppedWriteMessage('Note');
type Rec = Record<string, unknown>;
let out: Rec[] = [];

async function cell(id: string, toks: Tok[], afterToks: Tok[], unterm: boolean, eol: string, P: string, cons: string, ops: string[], tag: string) {
	const before = render(toks, unterm, eol);
	const after = render(afterToks, unterm, eol);
	if (!before.ok || !after.ok) return;
	const pBlk = toks[blkIdx(toks, P)] as Blk;
	const bodyOf = (v: number, name = 'Twin') => `name: ${name}\ncurrent_value: ${v}`;
	const app = new App();
	app.vault.setFile('Note.md', before.text);
	const secOf = (r: typeof before, bid: string | undefined): Sec | null => {
		if (bid === undefined) return null;
		const s = r.secs.get(bid);
		return s ? { text: r.text, lineStart: s[0], lineEnd: s[1] } : null;
	};
	const section: Section = { current: secOf(before, P) };
	const host = new ReadingModeBlockHost(new Plugin(app) as never, document.createElement('div'), ctxOf(section), 'ds-counter');
	host.setMountedBody(bodyOf(pBlk.v));
	resetDroppedWriteNotices();
	Notice.notices.length = 0;
	const card = cons !== 'form';
	const newBody = card ? bodyOf(pBlk.v + 1) : bodyOf(pBlk.v, 'Edited');
	const ordinal = before.order.indexOf(P);
	let ok: boolean;
	let pin = null;
	if (card) host.notePersistIntent();
	else pin = host.pinPosition();
	app.vault.setFile('Note.md', after.text);
	const pAfter = blkIdx(afterToks, P) >= 0 ? P : undefined;
	section.current =
		cons === 'card-null' ? null : cons === 'card-ordinal' ? secOf(after, after.order[Math.min(ordinal, after.order.length - 1)]) : secOf(after, pAfter);
	try {
		ok = card ? await host.replaceSource(newBody, { fromView: true }) : await host.replaceSource(newBody, { pin: pin!, pinOnly: true });
	} catch (e) {
		out.push({ id, tag, cons, err: String(e) });
		return;
	}
	const final = app.vault.getContent('Note.md')!;
	// integrity: which block of `after` changed; every other line byte-identical
	let written = '';
	let corrupt = '';
	let wl: number | null = null;
	if (final !== after.text) {
		const a = parse(after.text);
		const f = parse(final);
		if (a.length !== f.length) corrupt = 'count';
		else {
			const ch = a.map((x, i) => (x.body !== f[i].body ? i : -1)).filter((i) => i >= 0);
			if (ch.length !== 1) corrupt = `changed${ch.length}`;
			else {
				const fenceLine = a[ch[0]].start;
				const bid = [...after.fence.entries()].find(([, l]) => l === fenceLine)?.[0] ?? '?';
				written = bid;
				// outside the block's body lines nothing changed (EOLs included)
				const al = after.text.split(/(?<=\n)/);
				const fl = final.split(/(?<=\n)/);
				const fa = a[ch[0]];
				const ff = f[ch[0]];
				const headA = al.slice(0, fa.start + 1).join('');
				const headF = fl.slice(0, ff.start + 1).join('');
				const tailA = al.slice(fa.end).join('');
				const tailF = fl.slice(ff.end).join('');
				const lastUnterm = unterm && fa.end >= al.length - 1 && !/^`{3}$/.test(al[al.length - 1]);
				if (headA !== headF || (tailA !== tailF && !lastUnterm)) corrupt = 'outside';
				wl = fa.start;
				if (eol === '\r\n' && /[^\r]\n/.test(final)) corrupt = 'eol';
			}
		}
	}
	const outcome = corrupt ? `CORRUPT:${corrupt}` : written === '' ? 'refused' : written === P ? 'A' : `OTHER:${written}`;
	const notices = Notice.notices.slice().map((n) => (n === DISK ? 'disk' : 'other:' + n.slice(0, 40)));
	const rec: Rec = { id, tag, cons, ops, P, outcome, ok, notices, bt: before.text, at: after.text, pB: before.fence.get(P), pA: pAfter === undefined ? null : after.fence.get(P), wl };
	if (outcome === 'refused' && pAfter !== undefined) {
		resetDroppedWriteNotices();
		Notice.notices.length = 0;
		section.current = secOf(after, P);
		const nowV = (afterToks[blkIdx(afterToks, P)] as Blk).v;
		host.setMountedBody(bodyOf(nowV));
		let ok2: boolean;
		if (card) {
			host.notePersistIntent();
			ok2 = await host.replaceSource(newBody, { fromView: true });
		} else ok2 = await host.replaceSource(newBody, { pin: host.pinPosition()!, pinOnly: true });
		const f2 = parse(app.vault.getContent('Note.md')!);
		const a2 = parse(after.text);
		const ch = a2.map((x, i) => (x.body !== f2[i]?.body ? i : -1)).filter((i) => i >= 0);
		rec.next = ch.length === 1 && a2[ch[0]].start === after.fence.get(P) ? 'A' : ch.length === 0 ? 'refused' : 'BAD';
		rec.next_ok = ok2;
	}
	out.push(rec);
}


// ---- the oracle (independent of lineMap) ----
const SPLIT = /\r\n|\r|\n/;
const linesOf = (t: string): string[] => t.split(SPLIT);
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
/** The minimal-cost placements of the block at fence line `pB`: a line-identical block of `at`, or 'deleted'. */
function placements(bt: string, at: string, pB: number): Array<number | 'deleted'> | null {
	const a = linesOf(bt);
	const b = linesOf(at);
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
const bodyNorm = (ls: string[], s: number, e: number): string =>
	ls.slice(s + 1, e + 1).filter((x) => !/^(> )?```$/.test(x)).map((x) => x.replace(/^> /, '')).join('\n').trimEnd();
const twinCount = (text: string, body: string): number => {
	const ls = linesOf(text);
	return spansOf(ls).filter(([s, e]) => bodyNorm(ls, s, e) === body).length;
};

/** The notes and edits of a seed, the cells, and the checks. */
async function runSeed(sd: number, notes: number): Promise<{ cells: number; ambiguous: number; twinnedAmbiguous: number; saved: number; refused: number; other: number; bad: string[] }> {
	seed = sd;
	out = [];
	nid = 0;
	for (let c = 0; c < notes; c++) {
		const { toks, unterm, eol, tag } = layout();
		const ctr = blks(toks).filter((b) => b.lang === 'ds-counter');
		if (!ctr.length) continue;
		const P = pick(ctr).id;
		const nops = rnd() < 0.1 ? 0 : 1 + ri(3);
		let t = toks;
		const ops: string[] = [];
		for (let o = 0; o < nops; o++) {
			const r = OPS[pickOp()](t, P);
			if (!r) continue;
			t = r[0];
			ops.push(r[1]);
		}
		for (const cons of ['form', 'card-identity', 'card-ordinal', 'card-null']) await cell(`${sd}-${c}`, toks, t, unterm, eol, P, cons, ops, tag);
	}
	const bad: string[] = [];
	const cache = new Map<string, Array<number | 'deleted'> | null>();
	let ambiguous = 0;
	let twinnedAmbiguous = 0;
	let saved = 0;
	let refused = 0;
	let other = 0;
	for (const r of out) {
		const k = `${r.id}/${r.cons}`;
		if ('err' in r) {
			bad.push(`error ${k}: ${String(r.err)}`);
			continue;
		}
		const o = String(r.outcome);
		if (o.startsWith('CORRUPT')) bad.push(`${o} ${k} ${r.tag} ${JSON.stringify(r.ops)}`);
		const notices = r.notices as string[];
		if (o === 'refused' ? notices.length !== 1 || notices[0] !== 'disk' : notices.length !== 0) bad.push(`notice ${k}: ${o} ${JSON.stringify(notices)}`);
		if (o === 'A') saved++;
		else if (o === 'refused') refused++;
		else if (o.startsWith('OTHER')) other++;
		if (o === 'refused') {
			if ((r.ops as string[]).length === 0) bad.push(`refused with no outside edit ${k}`);
			if (r.pA !== null && r.next !== 'A') bad.push(`next round ${k}: ${String(r.next)}`);
		}
		const ck = `${r.pB}\u0000${r.bt}\u0000${r.at}`;
		let opts = cache.get(ck);
		if (opts === undefined) cache.set(ck, (opts = placements(r.bt as string, r.at as string, r.pB as number)));
		if (!opts) continue;
		const amb = opts.length > 1;
		const ls = linesOf(r.bt as string);
		const sp = spansOf(ls).find(([x]) => x === r.pB)!;
		const body = bodyNorm(ls, sp[0], sp[1]);
		const twinned = Math.max(twinCount(r.bt as string, body), twinCount(r.at as string, body)) > 1;
		if (amb) ambiguous++;
		// a tie between a twinned block's placements: nothing is written
		if (amb && twinned) {
			twinnedAmbiguous++;
			if (o !== 'refused') bad.push(`written in a twinned ambiguous cell ${k} -> ${o} ${r.tag} ${JSON.stringify(r.ops)}`);
		}
		// a NEW refusal: the one cheapest placement is the pinned block and the head-first map (what the base writes through) puts it there
		if (o === 'refused' && !amb && opts[0] === r.pA && r.pA !== null && mapLine(r.bt as string, r.at as string, r.pB as number) === r.pA) {
			bad.push(`refused although the one cheapest placement is the block ${k} ${r.tag} ${JSON.stringify(r.ops)}`);
		}
	}
	return { cells: out.length, ambiguous, twinnedAmbiguous, saved, refused, other, bad };
}

describe('SC-612: whole-note pin fuzz', () => {
	let warn: jest.SpyInstance;
	beforeEach(() => {
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => warn.mockRestore());

	test.each([1, 2, 3])('seed %i: no write in a twinned tie, no refusal outside a tie, one Notice per refusal, the next round saves, nothing corrupt', async (sd) => {
		const r = await runSeed(sd, NOTES);
		expect(r.bad.slice(0, 20)).toEqual([]);
		expect({ cells: r.cells, ambiguous: r.ambiguous, twinnedAmbiguous: r.twinnedAmbiguous, saved: r.saved, refused: r.refused, other: r.other }).toEqual(PINNED[sd]);
	}, 600000);
});
const NOTES = 3000;
// pinned totals (a regression fence; 'other' = writes into another block in a cell the oracle calls unambiguous: text-identical moves and pastes, the residuals)
const PINNED: Record<number, object> = {
	1: { cells: 11708, ambiguous: 2412, twinnedAmbiguous: 2408, saved: 5968, refused: 4571, other: 1169 },
	2: { cells: 11684, ambiguous: 2372, twinnedAmbiguous: 2360, saved: 5769, refused: 4774, other: 1141 },
	3: { cells: 11716, ambiguous: 2304, twinnedAmbiguous: 2300, saved: 5930, refused: 4645, other: 1141 },
};
