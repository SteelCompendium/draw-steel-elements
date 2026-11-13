// SC-612 -- the sweep behind reading-mode-host-whole-pin.test.ts: a host on a counter of a note open in its own pane (a whole-note pin, no embed, no hover),
// ten layouts (single counter, twins separated by one blank line / two / none / prose / at the end of the note, a triple, two different counters, identical
// and different headed sections) x every counter x ~140 outside edits (none, unrelated edits, a twin added or deleted next to the pinned block, a sibling's
// write, the pinned block moved or edited, >400 changed lines, each alone and with TOP / END edited in the same write) x the form and three card section
// modes (the section at the block's identity, at the same ordinal as Obsidian's hand-over, null), plus the user's own rounds with no outside edit.
// The oracle does not use lineMap: a cell is AMBIGUOUS when more than one placement of the pinned block (paired with an identical block of the note now,
// or left unpaired = deleted) has the same minimal line-edit cost. Asserted per cell: nothing is written in an ambiguous cell (so never into another block);
// every refusal shows exactly one "changed on disk first" Notice and a save none; the next round of a refused cell (the form reopened / the next click, on the
// note as it is now) saves; a cell with no outside edit or an unrelated one saves. The totals are pinned as a regression fence.
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { mapLine } from '../../../src/framework/host/lineMap';
import { droppedWriteMessage, resetDroppedWriteNotices } from '../../../src/framework/host/droppedWriteNotice';
import { App, Notice, Plugin } from '../../mocks/obsidian';

type Sec = { text: string; lineStart: number; lineEnd: number };
type Section = { current: Sec | null };
const ctxOf = (section: Section) =>
	({ docId: 'doc-612', sourcePath: 'Note.md', frontmatter: undefined, addChild: () => {}, getSectionInfo: () => section.current }) as never;
const bodyOf = (n: number, name = 'Twin'): string => `name: ${name}\ncurrent_value: ${n}`;

type Tok = { t: 'ctr'; id: string; v: number; reser?: boolean } | { t: 'line'; s: string };
const C = (id: string, v = 5): Tok => ({ t: 'ctr', id, v });
const L = (s: string): Tok => ({ t: 'line', s });
const B = L('');
const ctrLines = (k: Extract<Tok, { t: 'ctr' }>): string[] =>
	k.reser
		? ['```ds-counter', 'max_value: 20', `current_value: ${k.v}`, 'min_value: 0', 'name: Twin', '```']
		: ['```ds-counter', 'name: Twin', `current_value: ${k.v}`, '```'];
function render(toks: Tok[]): { text: string; fence: Map<string, number>; order: string[] } {
	const lines: string[] = [];
	const fence = new Map<string, number>();
	const order: string[] = [];
	for (const k of toks) {
		if (k.t === 'line') lines.push(k.s);
		else {
			fence.set(k.id, lines.length);
			order.push(k.id);
			lines.push(...ctrLines(k));
		}
	}
	return { text: lines.join('\n'), fence, order };
}
const HEAD = [L('# N'), B, L('TOP'), B];
const TAIL = [B, L('END')];
const LAYOUTS: Record<string, Tok[]> = {
	single: [...HEAD, C('a'), ...TAIL],
	'twin-blank': [...HEAD, C('a'), B, C('b'), ...TAIL],
	'twin-blank2': [...HEAD, C('a'), B, B, C('b'), ...TAIL],
	'twin-tight': [...HEAD, C('a'), C('b'), ...TAIL],
	'twin-prose': [...HEAD, C('a'), B, L('MID'), B, C('b'), ...TAIL],
	'twin-blank-eof': [...HEAD, C('a'), B, C('b')],
	'triple-blank': [...HEAD, C('a'), B, C('b'), B, C('c'), ...TAIL],
	'uniq-blank': [...HEAD, C('a', 5), B, C('b', 9), ...TAIL],
	'twin-headed': [...HEAD, L('## T'), B, C('a'), B, L('## T'), B, C('b'), ...TAIL],
	'twin-headed-diff': [...HEAD, L('## T1'), B, C('a'), B, L('## T2'), B, C('b'), ...TAIL],
	// a counter of ANOTHER value next to the run of twins (SC-612 review: the layouts above had none)
	'twin-blank+diff-below': [...HEAD, C('a'), B, C('b'), B, C('d', 9), ...TAIL],
	'twin-blank+diff-above': [...HEAD, C('d', 9), B, C('a'), B, C('b'), ...TAIL],
	'tight-diff-neighbour': [...HEAD, C('d', 7), C('a'), B, L('P2'), B, C('b'), ...TAIL],
	'triple+diff': [...HEAD, C('a'), B, C('b'), B, C('c'), B, C('d', 9), ...TAIL],
};
const lines = (n: number, tag: string): Tok[] => Array.from({ length: n }, (_, i) => L(`${tag} ${i}`));
const idxOf = (toks: Tok[], id: string) => toks.findIndex((k) => k.t === 'ctr' && k.id === id);
const ctrOf = (toks: Tok[], id: string) => toks[idxOf(toks, id)] as Extract<Tok, { t: 'ctr' }>;
function del(toks: Tok[], id: string): Tok[] {
	const r = toks.slice();
	const i = idxOf(r, id);
	if (i < 0) return r;
	const next = r[i + 1];
	if (next && next.t === 'line' && next.s === '') r.splice(i, 2);
	else if (i > 0 && r[i - 1].t === 'line' && (r[i - 1] as { s: string }).s === '') r.splice(i - 1, 2);
	else r.splice(i, 1);
	return r;
}
const insAt = (toks: Tok[], at: number, add: Tok[]): Tok[] => [...toks.slice(0, at), ...add, ...toks.slice(at)];
const firstCtr = (toks: Tok[]) => toks.findIndex((k) => k.t === 'ctr');
const big = (toks: Tok[]): Tok[] => {
	const r = insAt(toks, 2, [...lines(210, 'big-top'), B]);
	const end = r.findIndex((k) => k.t === 'line' && k.s === 'END');
	return end < 0 ? [...r, B, ...lines(210, 'big-bottom')] : insAt(r, end, [...lines(210, 'big-bottom'), B]);
};
const setV = (toks: Tok[], id: string, v: number, reser = false): Tok[] => toks.map((k) => (k.t === 'ctr' && k.id === id ? { ...k, v, reser: reser || k.reser } : k));
const beforeEnd = (toks: Tok[], add: Tok[]): Tok[] => {
	const end = toks.findIndex((k) => k.t === 'line' && k.s === 'END');
	return end < 0 ? [...toks, B, ...add] : insAt(toks, end, [...add, B]);
};

/** Every edit for a layout and a pinned id: name -> the note after it (null: not applicable). */
function editsFor(toks: Tok[], P: string): Record<string, Tok[] | null> {
	const ids = toks.filter((k) => k.t === 'ctr').map((k) => (k as { id: string }).id);
	const others = ids.filter((x) => x !== P);
	const pv = ctrOf(toks, P).v;
	const pi = idxOf(toks, P);
	const fc = firstCtr(toks);
	const e: Record<string, Tok[] | null> = {
		none: toks,
		'unrel-above': toks.map((k) => (k.t === 'line' && k.s === 'TOP' ? L('TOP edited') : k)),
		'unrel-below': toks.some((k) => k.t === 'line' && k.s === 'END') ? toks.map((k) => (k.t === 'line' && k.s === 'END' ? L('END edited') : k)) : null,
		'unrel-between': ids.length > 1 ? insAt(toks, fc + 1, [B, L('typed')]) : null,
		'blank-ins-between': ids.length > 1 ? insAt(toks, fc + 1, [B]) : null,
		'blank-del-between': ids.length > 1 && toks[fc + 1].t === 'line' && (toks[fc + 1] as { s: string }).s === '' ? [...toks.slice(0, fc + 1), ...toks.slice(fc + 2)] : null,
		'ins-twin-above-adj': insAt(toks, pi, [C('N', pv), B]),
		'ins-twin-below-adj': insAt(toks, pi + 1, [B, C('N', pv)]),
		'ins-twin-top': insAt(toks, 4, [C('N', pv), B]),
		'ins-twin-bottom': beforeEnd(toks, [C('N', pv)]),
		'ins-diff-above-adj': insAt(toks, pi, [C('N', 7), B]),
		'ins-diff-below-adj': insAt(toks, pi + 1, [B, C('N', 7)]),
		'edit-pinned': setV(toks, P, pv + 3),
		'move-pinned-end': beforeEnd(del(toks, P), [ctrOf(toks, P)]),
		'del-pinned-paste-end': beforeEnd(del(toks, P), [C('N', pv)]),
		big: big(toks),
		'big-del-pinned': big(del(toks, P)),
		'del-pinned': del(toks, P),
	};
	for (const o of others) {
		e[`del-other-${o}`] = del(toks, o);
		e[`bump-other-${o}`] = setV(toks, o, ctrOf(toks, o).v + 1);
		e[`reser-other-${o}`] = setV(toks, o, ctrOf(toks, o).v + 1, true);
		e[`big-del-other-${o}`] = big(del(toks, o));
		e[`del-pinned-other-to-p-${o}`] = ctrOf(toks, o).v !== pv ? setV(del(toks, P), o, pv) : null; // N5: P deleted, another edited to read like it
		e[`other-to-p-${o}`] = ctrOf(toks, o).v !== pv ? setV(toks, o, pv) : null; // a twin made by an edit (a sibling write)
	}
	const both = (t: Tok[] | null): Tok[] | null =>
		t === null ? null : t.map((k) => (k.t === 'line' && k.s === 'TOP' ? L('TOP edited') : k.t === 'line' && k.s === 'END' ? L('END edited') : k));
	const top = (t: Tok[] | null): Tok[] | null => (t === null ? null : t.map((k) => (k.t === 'line' && k.s === 'TOP' ? L('TOP edited') : k)));
	const end = (t: Tok[] | null): Tok[] | null =>
		t === null || !t.some((k) => k.t === 'line' && k.s === 'END') ? null : t.map((k) => (k.t === 'line' && k.s === 'END' ? L('END edited') : k));
	for (const name of Object.keys(e)) {
		if (name.startsWith('big') || name.startsWith('unrel-above') || name.startsWith('unrel-below')) continue;
		e[`${name}+both`] = both(e[name]);
		if (name !== 'none') {
			e[`${name}+top`] = top(e[name]);
			e[`${name}+end`] = end(e[name]);
		}
	}
	e['big-above'] = insAt(toks, 2, [...lines(500, 'big-top'), B]);
	return e;
}

type SecMode = 'identity' | 'index' | 'null';
const CONSTRUCTS: Array<{ name: string; card: boolean; sec: SecMode }> = [
	{ name: 'form', card: false, sec: 'identity' },
	{ name: 'card-identity', card: true, sec: 'identity' },
	{ name: 'card-index', card: true, sec: 'index' },
	{ name: 'card-null', card: true, sec: 'null' },
];

const blocksOf = (text: string): Array<{ start: number; body: string }> => {
	const ls = text.split('\n');
	const out: Array<{ start: number; body: string }> = [];
	for (let i = 0; i < ls.length; i++) {
		if (ls[i] !== '```ds-counter') continue;
		let j = i + 1;
		while (j < ls.length && ls[j] !== '```') j++;
		out.push({ start: i, body: ls.slice(i + 1, j).join('\n') });
		i = j;
	}
	return out;
};
function written(after: { text: string; order: string[] }, final: string): string {
	if (final === after.text) return '';
	const a = blocksOf(after.text);
	const f = blocksOf(final);
	if (a.length !== f.length) return 'CORRUPT';
	const changed = a.map((x, i) => (x.body !== f[i].body ? i : -1)).filter((i) => i >= 0);
	if (changed.length !== 1) return 'CORRUPT';
	return after.order[changed[0]];
}
const noticeKind = (ns: string[]): string => (ns.length === 0 ? 'none' : ns.map((n) => (n === droppedWriteMessage('Note') ? 'disk' : /can't tell/.test(n) ? 'tell' : 'other')).join('+'));
function secFor(r: { text: string; fence: Map<string, number>; order: string[] }, P: string, mode: SecMode, oldOrdinal: number): Sec | null {
	if (mode === 'null') return null;
	let f = mode === 'identity' ? r.fence.get(P) : undefined;
	if (f === undefined) {
		const ids = r.order;
		const id = ids[Math.min(oldOrdinal, ids.length - 1)];
		f = id === undefined ? undefined : r.fence.get(id);
	}
	if (f === undefined) return null;
	const ls = r.text.split('\n');
	let e = f + 1;
	while (e < ls.length && ls[e] !== '```') e++;
	return { text: r.text, lineStart: f, lineEnd: e };
}

type Rec = {
	layout: string;
	pinned: string;
	edit: string;
	cons: string;
	outcome: string;
	notice: string;
	next?: string;
	next_ok?: boolean;
	ok?: boolean;
	bt?: string;
	at?: string;
	pB?: number;
	pA?: number;
	own?: boolean;
};
const records: Rec[] = [];

async function cell(layout: string, P: string, editName: string, afterToks: Tok[], cons: { name: string; card: boolean; sec: SecMode }) {
	const toks = LAYOUTS[layout];
	const before = render(toks);
	const after = render(afterToks);
	const pv = ctrOf(toks, P).v;
	const app = new App();
	app.vault.setFile('Note.md', before.text);
	const section: Section = { current: secFor(before, P, 'identity', 0) };
	const host = new ReadingModeBlockHost(new Plugin(app) as never, document.createElement('div'), ctxOf(section), 'ds-counter');
	host.setMountedBody(bodyOf(pv));
	resetDroppedWriteNotices();
	Notice.notices.length = 0;
	const ordinal = before.order.indexOf(P);
	let ok: boolean;
	const newBody = cons.card ? bodyOf(pv + 1) : bodyOf(pv, 'Edited');
	if (cons.card) {
		host.notePersistIntent();
		app.vault.setFile('Note.md', after.text);
		section.current = secFor(after, P, cons.sec, ordinal);
		ok = await host.replaceSource(newBody, { fromView: true });
	} else {
		const pin = host.pinPosition();
		app.vault.setFile('Note.md', after.text);
		section.current = secFor(after, P, cons.sec, ordinal);
		ok = await host.replaceSource(newBody, { pin, pinOnly: true });
	}
	const final = app.vault.getContent('Note.md')!;
	const w = written(after, final);
	const outcome = w === '' ? 'refused' : w === P ? 'A' : w === 'CORRUPT' ? 'CORRUPT' : `OTHER:${w}`;
	const rec: Rec = { layout, pinned: P, edit: editName, cons: cons.name, outcome, ok, notice: noticeKind(Notice.notices.slice()) };
	if (!editName.startsWith('big')) Object.assign(rec, { bt: before.text, at: after.text, pB: before.fence.get(P), pA: after.fence.get(P) });
	// the next round (the form closed and reopened / the next click) on the note as it is now, the block where it is now: must save
	if (outcome === 'refused' && after.fence.has(P)) {
		resetDroppedWriteNotices();
		Notice.notices.length = 0;
		section.current = secFor(after, P, 'identity', ordinal);
		host.setMountedBody(bodyOf(ctrOf(afterToks, P).v));
		let ok2: boolean;
		if (cons.card) {
			host.notePersistIntent();
			ok2 = await host.replaceSource(newBody, { fromView: true });
		} else ok2 = await host.replaceSource(newBody, { pin: host.pinPosition(), pinOnly: true });
		const w2 = written(after, app.vault.getContent('Note.md')!);
		// (the body written in the next round is the one of the block as it is now)
		rec.next = w2 === '' ? 'refused' : w2 === P ? 'A' : `OTHER:${w2}`;
		rec.next_ok = ok2;
	}
	records.push(rec);
	return rec;
}

/** No outside edit: the user's own rounds. A + whose section is still the note from before it (Obsidian has not redrawn yet), then another + / the form. */
async function ownRounds(layout: string, P: string, kind: 'card-twice-stale' | 'form-after-plus-stale' | 'card-sibling-then-own') {
	const toks = LAYOUTS[layout];
	const before = render(toks);
	const pv = ctrOf(toks, P).v;
	const app = new App();
	app.vault.setFile('Note.md', before.text);
	const sec0 = secFor(before, P, 'identity', 0);
	const section: Section = { current: sec0 };
	const host = new ReadingModeBlockHost(new Plugin(app) as never, document.createElement('div'), ctxOf(section), 'ds-counter');
	host.setMountedBody(bodyOf(pv));
	resetDroppedWriteNotices();
	Notice.notices.length = 0;
	const rec: Rec = { layout, pinned: P, edit: 'own', cons: kind, outcome: '', notice: '', own: true };
	if (kind === 'card-sibling-then-own') {
		// a sibling card (another host, the other twin) clicked first; this card clicked inside the sibling's round; the sibling writes, then this one
		const O = before.order.find((x) => x !== P);
		if (!O) return null;
		const sSec: Section = { current: secFor(before, O, 'identity', 0) };
		const sib = new ReadingModeBlockHost(new Plugin(app) as never, document.createElement('div'), ctxOf(sSec), 'ds-counter');
		sib.setMountedBody(bodyOf(ctrOf(toks, O).v));
		sib.notePersistIntent();
		host.notePersistIntent();
		const s1 = await sib.replaceSource(bodyOf(ctrOf(toks, O).v + 1), { fromView: true });
		const r1 = await host.replaceSource(bodyOf(pv + 1), { fromView: true });
		const want = render(setV(setV(toks, O, ctrOf(toks, O).v + 1), P, pv + 1)).text;
		rec.outcome = s1 && r1 && app.vault.getContent('Note.md') === want ? 'A' : `BAD:${s1}/${r1}`;
	} else {
		host.notePersistIntent();
		const r1 = await host.replaceSource(bodyOf(pv + 1), { fromView: true });
		const mid = render(setV(toks, P, pv + 1));
		// section stays the OLD note (not redrawn yet)
		section.current = sec0;
		let r2: boolean;
		if (kind === 'card-twice-stale') {
			host.notePersistIntent();
			r2 = await host.replaceSource(bodyOf(pv + 2), { fromView: true });
		} else r2 = await host.replaceSource(bodyOf(pv + 1, 'Edited'), { pin: host.pinPosition(), pinOnly: true });
		const w = written(mid, app.vault.getContent('Note.md')!);
		rec.outcome = !r1 ? 'first-refused' : w === '' ? 'refused' : w === P ? 'A' : `OTHER:${w}`;
		rec.ok = r2;
	}
	rec.notice = noticeKind(Notice.notices.slice());
	records.push(rec);
	return rec;
}

// ---- the oracle (independent of lineMap) ----
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
const fenceSpans = (ls: string[]): Array<[number, number]> => {
	const out: Array<[number, number]> = [];
	for (let i = 0; i < ls.length; i++) {
		if (ls[i] !== '```ds-counter') continue;
		let j = i + 1;
		while (j < ls.length && ls[j] !== '```') j++;
		out.push([i, j]);
		i = j;
	}
	return out;
};
/** Every placement of the block at fence line `pB` of `bt` with the minimal line-edit cost between the notes: a block of `at` identical to it, or 'deleted'. */
function placements(bt: string, at: string, pB: number): Array<number | 'deleted'> {
	const a = bt.split('\n');
	const b = at.split('\n');
	const dmin = dist(a, b);
	const [s, e] = fenceSpans(a).find(([x]) => x === pB)!;
	const blk = a.slice(s, e + 1);
	const opts: Array<number | 'deleted'> = [];
	for (const [qs, qe] of fenceSpans(b)) {
		const same = b.slice(qs, qe + 1).join('\n') === blk.join('\n');
		if (same && dist(a.slice(0, s), b.slice(0, qs)) + dist(a.slice(e + 1), b.slice(qe + 1)) === dmin) opts.push(qs);
	}
	if (dist([...a.slice(0, s), ...a.slice(e + 1)], b) + blk.length === dmin) opts.push('deleted');
	return opts;
}

/** An outside edit that says nothing about the pinned block: nothing, an unrelated line, a blank line, a sibling's write or re-serialization, 500 lines above. */
const UNRELATED = /^(none|unrel-above|unrel-below|unrel-between|blank-ins-between|blank-del-between|bump-other-\w+|reser-other-\w+|big-above)(\+top|\+end|\+both)?$/;

describe('SC-612: whole-note pin sweep', () => {
	let warn: jest.SpyInstance;
	beforeEach(() => {
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => warn.mockRestore());

	test('every cell: no write where the oracle sees a tie, one Notice per refusal, the next round saves, no refusal where nothing is ambiguous or changed', async () => {
		records.length = 0;
		for (const layout of Object.keys(LAYOUTS)) {
			const toks = LAYOUTS[layout];
			const ids = toks.filter((k) => k.t === 'ctr').map((k) => (k as { id: string }).id);
			for (const P of ids) {
				for (const [name, after] of Object.entries(editsFor(toks, P))) {
					if (after === null) continue;
					for (const cons of CONSTRUCTS) await cell(layout, P, name, after, cons);
				}
				for (const k of ['card-twice-stale', 'form-after-plus-stale', 'card-sibling-then-own'] as const) await ownRounds(layout, P, k);
			}
		}
		const key = (r: Rec) => `${r.layout}/${r.pinned}/${r.edit}/${r.cons}`;
		const cache = new Map<string, Array<number | 'deleted'>>();
		const bad: string[] = [];
		let ambiguous = 0;
		let checked = 0;
		for (const r of records) {
			if (r.own) {
				// no outside edit: the user's own rounds
				if (r.outcome !== 'A' || r.notice !== 'none') bad.push(`own round refused or noisy: ${key(r)} ${r.outcome} ${r.notice}`);
				continue;
			}
			if (r.outcome === 'CORRUPT') bad.push(`corrupt: ${key(r)}`);
			// one Notice per refusal, none per save
			if (r.outcome === 'refused' ? r.notice !== 'disk' : r.notice !== 'none') bad.push(`notice: ${key(r)} ${r.outcome} ${r.notice}`);
			// a refused cell whose block still exists: the next round saves
			if (r.outcome === 'refused' && r.next !== undefined && r.next !== 'A') bad.push(`next round: ${key(r)} ${r.next}`);
			if (UNRELATED.test(r.edit) && r.outcome !== 'A') bad.push(`unrelated edit not saved: ${key(r)} ${r.outcome}`);
			if (r.bt === undefined || r.at === undefined || r.pB === undefined) continue;
			const ck = `${r.pB}\u0000${r.bt}\u0000${r.at}`;
			let opts = cache.get(ck);
			if (!opts) cache.set(ck, (opts = placements(r.bt, r.at, r.pB)));
			checked++;
			if (opts.length > 1) {
				ambiguous++;
				if (r.outcome !== 'refused') bad.push(`written in an ambiguous cell: ${key(r)} -> ${r.outcome}`);
			} else if (r.outcome === 'refused' && opts[0] === r.pA && r.pA !== undefined && mapLine(r.bt, r.at, r.pB) === r.pA) {
				// a NEW refusal needs a tie, or a pinned block that is gone or changed: here the one cheapest placement IS the pinned block and the head-first line map (which
				// the base writes through) puts it there too. (Where the head-first map itself puts the block on another block, e.g. a counter of another value pasted right
				// above it, the base refuses as well: a known false refusal, not this rule's.)
				bad.push(`refused although the block's one cheapest placement is the block: ${key(r)}`);
			}
		}
		expect(bad.slice(0, 20)).toEqual([]);
		// the regression fence: cells, cells the oracle calls ambiguous (>400-line cells are not checked), and the outcomes
		const count = (f: (r: Rec) => boolean) => records.filter(f).length;
		expect({
			cells: records.length,
			checked,
			ambiguous,
			saved: count((r) => r.outcome === 'A'),
			refused: count((r) => r.outcome === 'refused'),
			other: count((r) => r.outcome.startsWith('OTHER')),
		}).toEqual({ cells: 10966, checked: 10264, ambiguous: 2288, saved: 6003, refused: 4029, other: 934 });
	}, 600000);
});
