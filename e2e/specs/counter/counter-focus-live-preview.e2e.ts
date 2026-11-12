// SC-602: in Live Preview a counter's own save redraws its CodeMirror widget with a NEW root (a view's write is adopted only in Reading view),
// so the control a keyboard user pressed used to be thrown away and focus fell to <body> about half a second later. The redrawn counter now takes
// focus on the control that replaces the pressed one, with the ring. A mouse press never pulls focus in; an outside edit and a twin never take it.
// A real Tab from the editor would indent the note, so the control is focused by script (dse.focusByScript) and the Enter is a real key press.
// Counter/counter.md: Health 1, min 0, max 3. Counter/twins.md: two identical counters (Health 1).
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const NOTE = 'Counter/counter.md';
const TWINS = 'Counter/twins.md';
const COUNTER = 'ds-counter';

/** What holds focus: its control id, the index of the Live Preview counter it is in (-1: none), and whether it draws the keyboard ring. */
const focusState = () =>
	dse.page<{ ctl: string | null; counter: number; ring: boolean }>(`(() => {
		const a = document.activeElement;
		const roots = Array.from(document.querySelectorAll('.markdown-source-view [data-dse-element="counter"]'));
		const root = a?.closest('[data-dse-element="counter"]');
		return {
			ctl: a?.closest('[data-dse-control]')?.getAttribute('data-dse-control') ?? null,
			counter: root && root.closest('.markdown-source-view') ? roots.indexOf(root) : -1,
			ring: !!a && a.matches(':focus-visible'),
		};
	})()`);

describe('counter: keyboard focus across the note save in Live Preview', () => {
	it('[CTR-L01] Enter on "+" writes once, and the redrawn counter holds focus on "+", with the keyboard ring', async () => {
		await dse.openNote(NOTE, { mode: 'live-preview' });
		const inc = dse.block(COUNTER).control('counter.inc');
		await dse.focusByScript(inc);
		const w = await dse.waitForWrite(NOTE, () => dse.press('Enter', inc));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(NOTE, COUNTER).toMatchObject({ current_value: 2 });
		await dse.settle();
		expect(await focusState()).toEqual({ ctl: 'counter.inc', counter: 0, ring: true });
	});

	it('[CTR-L02] a mouse click on "+" (focus in the editor) writes, and the redraw does not pull focus into the counter', async () => {
		await dse.openNote(NOTE, { mode: 'live-preview' });
		const before = await focusState();
		expect(before.counter).toBe(-1);
		const w = await dse.waitForWrite(NOTE, () => dse.click(dse.block(COUNTER).control('counter.inc')));
		expect(w.count).toBe(1);
		await dse.settle();
		await dse.expectNoteBlock(NOTE, COUNTER).toMatchObject({ current_value: 2 });
		expect((await focusState()).counter).toBe(-1);
	});

	it('[CTR-L03] two identical counters: Enter on the first "+" keeps focus in the FIRST counter, and the second is untouched', async () => {
		await dse.openNote(TWINS, { mode: 'live-preview' });
		const inc = dse.block(COUNTER, 0).control('counter.inc');
		await dse.focusByScript(inc);
		const w = await dse.waitForWrite(TWINS, () => dse.press('Enter', inc));
		expect(w.count).toBe(1);
		await dse.settle();
		await dse.expectNoteBlock(TWINS, COUNTER, 0).toMatchObject({ current_value: 2 });
		await dse.expectNoteBlock(TWINS, COUNTER, 1).toMatchObject({ current_value: 1 });
		expect(await focusState()).toEqual({ ctl: 'counter.inc', counter: 0, ring: true });
	});

	it('[CTR-L04] an outside edit of the note (no press of ours) does not take focus: it is not carried into the redrawn counter', async () => {
		await dse.openNote(NOTE, { mode: 'live-preview' });
		await dse.focusByScript(dse.block(COUNTER).control('counter.inc'));
		await dse.externalEdit(NOTE, `c.replace('current_value: 1', 'current_value: 3')`);
		await dse.waitFor(`document.querySelector('.markdown-source-view [data-dse-control="counter.input"]')?.value === '3'`, 'the counter to show the outside edit');
		await dse.settle();
		expect((await focusState()).counter).toBe(-1);
	});

	it('[CTR-L05] Enter on "-" at 1 writes 0, and focus ends in the redrawn counter\'s number field (the stepper\'s own hand-off, SC-495), with the ring', async () => {
		await dse.openNote(NOTE, { mode: 'live-preview' });
		const dec = dse.block(COUNTER).control('counter.dec');
		await dse.focusByScript(dec);
		const w = await dse.waitForWrite(NOTE, () => dse.press('Enter', dec));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(NOTE, COUNTER).toMatchObject({ current_value: 0 });
		await dse.settle();
		expect(await focusState()).toEqual({ ctl: 'counter.input', counter: 0, ring: true });
	});
});
