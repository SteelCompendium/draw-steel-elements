// SC-612 -- a block edit form's Save or a card's + / - on a counter of a note open in its OWN pane (a whole-note pin, not an embed or a hover preview), when the
// note holds two identical counters separated only by blank lines and one of them is deleted from outside (Sync, another app) while the form is open / the click
// is in its 400 ms round. The note that is left is the same whichever counter was deleted, so the head-first line map's guess (it always reads the LOWER one as
// deleted) must not place a write: the form or card would land in a block that only looks like its own. Rule: while the known body occurs twice (in the note as
// pinned, or now), `pinnedTarget` accepts a place only when the tail-first map agrees AND neither greedy map (`mapLineGreedy`) puts the block elsewhere. Otherwise
// nothing is written and the "changed on disk first" Notice shows (the form stays open; the next round, on the note as it is now, saves).
// The named tests (T1-T13) are the shapes that matter on their own; the sweep runs ten layouts x every counter x ~140 outside edits x form / three card section
// modes against an oracle that is independent of lineMap: in a cell where more than one placement of the block costs the same, nothing is written.
import { ReadingModeBlockHost } from '../../../src/framework/host/ReadingModeBlockHost';
import { droppedWriteMessage, resetDroppedWriteNotices } from '../../../src/framework/host/droppedWriteNotice';
import { App, Notice, Plugin } from '../../mocks/obsidian';

type Sec = { text: string; lineStart: number; lineEnd: number };
type Section = { current: Sec | null };
const ctxOf = (section: Section) =>
	({ docId: 'doc-612', sourcePath: 'Note.md', frontmatter: undefined, addChild: () => {}, getSectionInfo: () => section.current }) as never;
const bodyOf = (n: number, name = 'Twin'): string => `name: ${name}\ncurrent_value: ${n}`;
const CTR = (n: number): string[] => ['```ds-counter', 'name: Twin', `current_value: ${n}`, '```'];
const fencesOf = (text: string): number[] => text.split('\n').map((l, i) => (l === '```ds-counter' ? i : -1)).filter((i) => i >= 0);
const sectionAt = (text: string, fence: number | undefined): Sec | null => {
	if (fence === undefined) return null;
	const ls = text.split('\n');
	let end = fence + 1;
	while (end < ls.length && ls[end] !== '```') end++;
	return { text, lineStart: fence, lineEnd: end };
};
const DISK = droppedWriteMessage('Note');
const note = (...parts: string[][]): string => parts.map((p) => p.join('\n')).join('\n');
const HEAD = ['# N', '', 'TOP', ''];
const END = ['', 'BOTTOM'];
/** `TOP / counter / '' / counter / BOTTOM`: two identical counters separated only by a blank line. */
const twins = (top = 'TOP', bottom = 'BOTTOM'): string => note(['# N', '', top, ''], CTR(5), [''], CTR(5), ['', bottom]);
/** The note with the counter at `index` (0 = the first) written with `body` (the same two lines, other value / name). */
const withBody = (text: string, index: number, body: string): string => {
	const ls = text.split('\n');
	const f = fencesOf(text)[index];
	ls.splice(f + 1, 2, ...body.split('\n'));
	return ls.join('\n');
};

type Kind = 'form' | 'card';
/** How the card's `getSectionInfo` answers after the outside edit: its own block (identity), the block at the same ordinal (Obsidian's hand-over), nothing. */
type SecMode = 'identity' | 'ordinal' | 'null';

describe('SC-612: whole-note pins of identical blocks', () => {
	let warn: jest.SpyInstance;
	beforeEach(() => {
		resetDroppedWriteNotices();
		Notice.notices.length = 0;
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => warn.mockRestore());

	/**
	 * A host on the counter at `pinned` (index into the fences of `before`) of a note that becomes `after` from outside, then the form's Save (a pin taken before
	 * the edit, `pinOnly`) or the card's + (`notePersistIntent` before the edit, `fromView`). `pinnedAfter`: the index of that counter in `after` (identity), when it exists.
	 */
	async function round(kind: Kind, before: string, after: string, pinned: number, o: { pinnedAfter?: number; sec?: SecMode; value?: number } = {}) {
		const value = o.value ?? 5;
		const app = new App();
		app.vault.setFile('Note.md', before);
		const section: Section = { current: sectionAt(before, fencesOf(before)[pinned]) };
		const host = new ReadingModeBlockHost(new Plugin(app) as never, document.createElement('div'), ctxOf(section), 'ds-counter');
		host.setMountedBody(bodyOf(value));
		const next = kind === 'card' ? bodyOf(value + 1) : bodyOf(value, 'Edited');
		const pin = kind === 'form' ? host.pinPosition() : undefined;
		if (kind === 'card') host.notePersistIntent();
		app.vault.setFile('Note.md', after);
		const afterFences = fencesOf(after);
		const mode = o.sec ?? (kind === 'card' ? 'ordinal' : 'identity');
		const at = mode === 'null' ? undefined : mode === 'identity' ? o.pinnedAfter : (o.pinnedAfter ?? Math.min(pinned, afterFences.length - 1));
		section.current = sectionAt(after, at === undefined ? undefined : afterFences[at]);
		const ok = kind === 'card' ? await host.replaceSource(next, { fromView: true }) : await host.replaceSource(next, { pin, pinOnly: true });
		return { app, host, ok, final: app.vault.getContent('Note.md')!, notices: Notice.notices.slice(), next, section };
	}
	const refused = (r: Awaited<ReturnType<typeof round>>, after: string) => {
		expect(r.final).toBe(after);
		expect(r.ok).toBe(false);
		expect(r.notices).toEqual([DISK]);
	};
	const saved = (r: Awaited<ReturnType<typeof round>>, after: string, index: number) => {
		expect(r.final).toBe(withBody(after, index, r.next));
		expect(r.ok).toBe(true);
		expect(r.notices).toEqual([]);
	};
	const KINDS: Kind[] = ['form', 'card'];

	test.each(KINDS)('T1/T2 %s on the upper twin, the upper deleted from outside: nothing written, the Notice shows', async (kind) => {
		const before = twins();
		const after = note(HEAD, CTR(5), END); // the note that is left reads the same whichever counter was deleted
		refused(await round(kind, before, after, 0), after);
	});

	test.each(KINDS)('T3 %s on the lower twin, the lower deleted and TOP edited in the same write: refused (both full maps agree on the survivor, the head greedy map does not)', async (kind) => {
		const before = twins();
		const after = note(['# N', '', 'TOP edited', ''], CTR(5), END);
		refused(await round(kind, before, after, 1), after);
	});

	test.each(KINDS)('T4 %s on the upper twin, the upper deleted and BOTTOM edited in the same write: refused (the tail greedy map dissents)', async (kind) => {
		const before = twins();
		const after = note(HEAD, CTR(5), ['', 'BOTTOM edited']);
		refused(await round(kind, before, after, 0), after);
	});

	test.each(KINDS)('T5 %s on the lower twin, the lower deleted (the mirror, no other edit): refused', async (kind) => {
		const before = twins();
		const after = note(HEAD, CTR(5), END);
		refused(await round(kind, before, after, 1), after);
	});

	test.each(KINDS)('T5b %s on the upper twin, the lower deleted: refused too (the note reads the same as T1)', async (kind) => {
		const before = twins();
		const after = note(HEAD, CTR(5), END);
		refused(await round(kind, before, after, 0, { pinnedAfter: 0 }), after);
	});

	test('T6 an identical counter added right below the form: refused, then the form reopened on the note as it is now saves into that block (not persistent)', async () => {
		const before = twins();
		const after = note(HEAD, CTR(5), [''], CTR(5), [''], CTR(5), END);
		const r = await round('form', before, after, 0, { pinnedAfter: 0 });
		refused(r, after);
		// the form closed and opened again: a new pin from the note as it is now, the block's body as drawn now
		Notice.notices.length = 0;
		resetDroppedWriteNotices();
		r.section.current = sectionAt(after, fencesOf(after)[0]);
		r.host.setMountedBody(bodyOf(5));
		const ok = await r.host.replaceSource(bodyOf(5, 'Edited'), { pin: r.host.pinPosition(), pinOnly: true });
		expect(ok).toBe(true);
		expect(Notice.notices).toEqual([]);
		expect(r.app.vault.getContent('Note.md')).toBe(withBody(after, 0, bodyOf(5, 'Edited')));
	});

	test.each(KINDS)('T6b %s on the upper twin: an identical counter added ABOVE the run with prose between: refused too (the new block and the pinned one are interchangeable, the accepted cost)', async (kind) => {
		const before = twins();
		const after = note(HEAD, CTR(5), ['', 'prose', ''], CTR(5), [''], CTR(5), END);
		refused(await round(kind, before, after, 0, { pinnedAfter: 0 }), after);
	});

	test.each(KINDS.flatMap((k) => [0, 1].map((p) => [k, p] as const)))(
		'T7 %s on twin %i, the OTHER twin deleted, with prose between the twins: saves into the pinned block (the surroundings tell them apart, no tie)',
		async (kind, pinned) => {
			const before = note(HEAD, CTR(5), ['', 'MID', ''], CTR(5), END);
			const after = pinned === 0 ? note(HEAD, CTR(5), ['', 'MID'], END) : note(HEAD, ['MID', ''], CTR(5), END);
			saved(await round(kind, before, after, pinned, { pinnedAfter: 0 }), after, 0);
		}
	);

	/** Edits that say nothing about the twins; `pinned` is the index of the counter the host is on. */
	const unrelated = (pinned: number): Array<[string, string]> => [
		['TOP edited', twins('TOP edited')],
		['BOTTOM edited', twins('TOP', 'BOTTOM edited')],
		['a prose line typed between the twins', note(HEAD, CTR(5), ['', 'typed', ''], CTR(5), END)],
		['a blank line added between the twins', note(HEAD, CTR(5), ['', ''], CTR(5), END)],
		['the other twin bumped (a sibling write)', pinned === 0 ? note(HEAD, CTR(5), [''], CTR(6), END) : note(HEAD, CTR(6), [''], CTR(5), END)],
		['no edit at all', twins()],
	];
	test.each(KINDS.flatMap((k) => [0, 1].flatMap((p) => unrelated(p).map(([name, after]) => [k, p, name, after] as const))))(
		'T8 %s on twin %i: %s -> saves',
		async (kind, pinned, _name, after) => {
			saved(await round(kind, twins(), after, pinned, { pinnedAfter: pinned }), after, pinned);
		}
	);

	test.each(KINDS)('T9 %s: a different counter pasted right above the pinned block and TOP edited, in a note with twins -> saves (a block of another body says nothing about the twins)', async (kind) => {
		const before = twins();
		const after = note(['# N', '', 'TOP edited', ''], CTR(7), [''], CTR(5), [''], CTR(5), END);
		saved(await round(kind, before, after, 0, { pinnedAfter: 1 }), after, 1);
	});

	test.each(KINDS)('T10 %s: 500 lines inserted above only, in a note with twins -> saves (the greedy head map gives up and is not a dissent)', async (kind) => {
		const before = twins();
		const lots = Array.from({ length: 500 }, (_, i) => `line ${i}`);
		const after = note(['# N', ''], lots, HEAD.slice(1), CTR(5), [''], CTR(5), END);
		saved(await round(kind, before, after, 0, { pinnedAfter: 0, sec: 'identity' }), after, 0);
	});

	test.each(KINDS)('T11 %s in a note WITHOUT twins: a different counter deleted above and TOP edited -> saves (the twin gate is load-bearing)', async (kind) => {
		const before = note(HEAD, CTR(5), [''], CTR(9), END);
		const after = note(['# N', '', 'TOP edited', ''], CTR(9), END);
		saved(await round(kind, before, after, 1, { pinnedAfter: 0, value: 9 }), after, 0);
	});

	describe('T12 the user\'s own rounds, no outside edit', () => {
		function pair(value = 5) {
			const text = twins();
			const app = new App();
			app.vault.setFile('Note.md', text);
			const section: Section = { current: sectionAt(text, fencesOf(text)[0]) };
			const host = new ReadingModeBlockHost(new Plugin(app) as never, document.createElement('div'), ctxOf(section), 'ds-counter');
			host.setMountedBody(bodyOf(value));
			return { app, text, section, host };
		}
		const values = (app: App) => [...app.vault.getContent('Note.md')!.matchAll(/current_value: (\d+)/g)].map((m) => Number(m[1]));

		test('+ twice on the upper twin, the second while the section still shows the note from before the first write', async () => {
			const { app, text, section, host } = pair();
			host.notePersistIntent();
			expect(await host.replaceSource(bodyOf(6), { fromView: true })).toBe(true);
			section.current = sectionAt(text, fencesOf(text)[0]); // not redrawn yet
			host.notePersistIntent();
			expect(await host.replaceSource(bodyOf(7), { fromView: true })).toBe(true);
			expect(values(app)).toEqual([7, 5]);
			expect(Notice.notices).toEqual([]);
		});

		test('+ then the edit form with the section still the note from before the +', async () => {
			const { app, text, section, host } = pair();
			host.notePersistIntent();
			expect(await host.replaceSource(bodyOf(6), { fromView: true })).toBe(true);
			section.current = sectionAt(text, fencesOf(text)[0]);
			expect(await host.replaceSource(bodyOf(6, 'Edited'), { pin: host.pinPosition(), pinOnly: true })).toBe(true);
			expect(app.vault.getContent('Note.md')).toContain('name: Edited');
			expect(values(app)).toEqual([6, 5]);
			expect(Notice.notices).toEqual([]);
		});

		test('a sibling twin\'s + and then this card\'s + inside the sibling\'s round (the flush writes the sibling first)', async () => {
			const { app, text, host } = pair();
			const sSec: Section = { current: sectionAt(text, fencesOf(text)[1]) };
			const sib = new ReadingModeBlockHost(new Plugin(app) as never, document.createElement('div'), ctxOf(sSec), 'ds-counter');
			sib.setMountedBody(bodyOf(5));
			sib.notePersistIntent();
			host.notePersistIntent();
			expect(await sib.replaceSource(bodyOf(6), { fromView: true })).toBe(true);
			expect(await host.replaceSource(bodyOf(6), { fromView: true })).toBe(true);
			expect(values(app)).toEqual([6, 6]);
			expect(Notice.notices).toEqual([]);
		});
	});

	// The review's shapes: a counter of ANOTHER value next to the run of twins. A line-level pairing reads a fence line of the other counter as the pinned block's (every opening
	// fence reads the same), which hid a real tie (H1-H1c: refused now) and made a clear case look like one (M1-M6: saves).
	const C9 = CTR(9);
	test.each(KINDS)('H1 %s on the lower twin, the lower deleted and TOP edited, a different counter below the run: refused', async (kind) => {
		const before = note(HEAD, CTR(5), [''], CTR(5), [''], C9, END);
		const after = note(['# N', '', 'TOP edited', ''], CTR(5), [''], C9, END);
		refused(await round(kind, before, after, 1), after);
	});

	test.each(KINDS)('H1b %s on the lower twin, the lower deleted and the blank line under TOP deleted, a different counter below: refused', async (kind) => {
		const before = note(HEAD, CTR(5), [''], CTR(5), [''], C9, END);
		const after = note(['# N', '', 'TOP'], CTR(5), [''], C9, END);
		refused(await round(kind, before, after, 1), after);
	});

	test.each(KINDS)('H1c %s on the lower of the twins, the upper twin deleted and BOTTOM edited, a different counter above the run: refused', async (kind) => {
		const before = note(HEAD, C9, [''], CTR(5), [''], CTR(5), END);
		const after = note(HEAD, C9, [''], CTR(5), ['', 'BOTTOM edited']);
		refused(await round(kind, before, after, 1), after);
	});

	test.each(KINDS)('M1 %s: a different counter tight above the pinned one deleted, the twin elsewhere: saves (no tie)', async (kind) => {
		const before = note(HEAD, CTR(7), CTR(5), ['', 'P2', ''], CTR(5), END);
		const after = note(['# N', '', 'TOP'], CTR(5), ['', 'P2', ''], CTR(5), END);
		saved(await round(kind, before, after, 1, { pinnedAfter: 0 }), after, 0);
	});

	test.each(KINDS)('M2 %s: the other twin bumped (a sibling write) and a different counter added below the pinned one: saves', async (kind) => {
		const before = note(HEAD, CTR(7), [''], CTR(7), END);
		const after = note(HEAD, CTR(8), [''], CTR(7), [''], C9, END);
		saved(await round(kind, before, after, 1, { pinnedAfter: 1, value: 7 }), after, 1);
	});

	test.each(KINDS)('M3 %s: of three identical counters a blank line above the pinned one removed and a different counter added below it: saves', async (kind) => {
		const before = note(HEAD, CTR(5), [''], CTR(5), ['', 'P2', ''], CTR(5), END);
		const after = note(HEAD, CTR(5), CTR(5), [''], C9, ['', 'P2', ''], CTR(5), END);
		saved(await round(kind, before, after, 1, { pinnedAfter: 1 }), after, 1);
	});

	test.each(KINDS)('M6 %s: the other twin bumped and a different counter added below the pinned one: saves', async (kind) => {
		const before = twins();
		const after = note(HEAD, CTR(6), [''], CTR(5), [''], C9, END);
		saved(await round(kind, before, after, 1, { pinnedAfter: 1 }), after, 1);
	});

	// The head-first map pairs the unterminated block's three lines with the closed copy's first three (the copy has one more line, the closing fence): it names the COPY.
	// The base wrote it (a different block, no Notice); the one cheapest placement is the pinned block further down, which is not where the head-first map says, so: refused.
	test.each(KINDS)('%s on the pinned UNTERMINATED trailing fence, an identical but CLOSED copy pasted above it: refused (the base wrote the copy)', async (kind) => {
		const open = ['```ds-counter', 'name: Twin', 'current_value: 5'];
		const before = note(HEAD, open);
		const after = note(HEAD, CTR(5), [''], open);
		refused(await round(kind, before, after, 0, { pinnedAfter: 1 }), after);
	});

	// The residual, pinned so that it changes on purpose only: a tie combined with a ONE-SIDED edit of more than LINE_MAP_MAX_EDITS lines. The head-first map still places the
	// block (it sits in the common head), but the capped diff cannot price its placements, so the head-first answer stands (written as at the base).
	test.each(KINDS)('T14 %s on the upper twin, the lower twin deleted AND 500 lines added below: the capped diff gives up, the head-first answer stands (documented residual)', async (kind) => {
		const before = twins();
		const lots = Array.from({ length: 500 }, (_, i) => `line ${i}`);
		const after = note(HEAD, CTR(5), [''], lots, END);
		saved(await round(kind, before, after, 0, { pinnedAfter: 0 }), after, 0);
	});

	test.each(KINDS)('T13 %s on the MIDDLE of a run of three identical counters, the upper deleted: refused (the base writes the lowest one)', async (kind) => {
		const before = note(HEAD, CTR(5), [''], CTR(5), [''], CTR(5), END);
		const after = note(HEAD, CTR(5), [''], CTR(5), END);
		refused(await round(kind, before, after, 1, { pinnedAfter: 0 }), after);
	});
});
