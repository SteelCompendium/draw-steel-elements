// SC-605: Live Preview variants of the SC-589 quick-add draft tests (INIT-M10 in malice.e2e.ts). In Live Preview the tracker's own save
// redraws its CodeMirror widget with a NEW tracker (a view's write is adopted only in Reading view), so a half-typed amount and label came
// back for a moment and then emptied about half a second later, when the save landed. The redrawn tracker now starts with the draft the
// old one held when it was removed. Only the tracker that saved, in the pane it was typed in, gets it; an outside edit carries nothing; a
// successful Add still empties the boxes; a mouse press never moves focus.
// Each end state is read a second after write-idle (`settled`): the hand-off is one-shot, so it must hold, not only show at the write.
// Initiative/tracker.md: Malice 3, round 1. Initiative/two-trackers.md: two different trackers. Initiative/twins.md: two identical trackers.
import { browser, expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const MIN = 'Initiative/tracker.md';
const TWO = 'Initiative/two-trackers.md';
const TWINS = 'Initiative/twins.md';
const INIT = 'ds-initiative';
const AMT = 'init.malice.quickadd.amount';
const LBL = 'init.malice.quickadd.label';
const ADD = 'init.malice.quickadd.add';

interface Boxes {
	active: boolean;
	amount: string;
	label: string;
	hint: string;
	invalid: boolean;
}

/** The quick-add boxes of every DISPLAYED Live Preview tracker (Live Preview can keep a hidden copy of a widget), in page order, with the
 *  state derived from them (hint line, aria-invalid) and whether the tracker is in the active pane. */
const boxes = () =>
	dse.page<Boxes[]>(`(() => Array.from(document.querySelectorAll('.markdown-source-view [data-dse-element="initiative"]'))
		.filter((r) => r.offsetParent !== null && !r.parentElement.closest('[data-dse-element]'))
		.map((r) => {
			const q = (id) => r.querySelector('[data-dse-control="' + id + '"]');
			return {
				active: !!r.closest('.workspace-leaf.mod-active'),
				amount: q('${AMT}').value,
				label: q('${LBL}').value,
				hint: r.querySelector('.dse-init__malice-quickadd-hint')?.textContent ?? '',
				invalid: q('${AMT}').hasAttribute('aria-invalid') || q('${LBL}').hasAttribute('aria-invalid'),
			};
		}))()`);
const shows = (amount: string, label: string, active = true): Boxes => ({ active, amount, label, hint: '', invalid: false });

/** What holds focus (same shape as focus-live-preview.e2e.ts), plus the caret of a focused text box. */
const focusState = () =>
	dse.page<{ ctl: string | null; tracker: number; ring: boolean; caret: [number, number] | null }>(`(() => {
		const a = document.activeElement;
		const roots = Array.from(document.querySelectorAll('.workspace-leaf.mod-active .markdown-source-view [data-dse-element="initiative"]')).filter((r) => !r.parentElement.closest('[data-dse-element]'));
		const root = a?.closest('[data-dse-element="initiative"]');
		return {
			ctl: a?.closest('[data-dse-control]')?.getAttribute('data-dse-control') ?? null,
			tracker: root ? roots.indexOf(root) : -1,
			ring: !!a && a.matches(':focus-visible'),
			caret: a && a.tagName === 'INPUT' && a.type === 'text' ? [a.selectionStart, a.selectionEnd] : null,
		};
	})()`);

const fill = async (n: number, amount: string, label: string): Promise<void> => {
	const root = dse.block(INIT, n);
	await dse.type(root.control(AMT), amount, { replace: true });
	await dse.type(root.control(LBL), label, { replace: true });
};
const settled = async (): Promise<void> => {
	await dse.settle();
	await browser.pause(1000);
};
const maliceLog = async (): Promise<unknown> => ((await dse.expectNoteBlock(MIN, INIT).value()) as { malice: { log?: unknown } }).malice.log;

describe('initiative: a half-typed Malice quick-add across the tracker\'s own save, in Live Preview', () => {
	it('[INIT-L09] a half-typed quick-add survives Advance round and the stepper (mouse); Add then commits it and empties the boxes', async () => {
		await dse.openNote(MIN, { mode: 'live-preview' });
		const root = dse.block(INIT);
		await fill(0, '2', 'Feytouched');
		await dse.waitForWrite(MIN, () => dse.click(root.control('init.round.advance')));
		await settled();
		await expect(root.control({ css: '.dse-init__round-value' })).toHaveText('Round 2'); // redrawn from the saved note
		expect(await boxes()).toEqual([shows('2', 'Feytouched')]);
		expect((await focusState()).tracker).toBe(-1); // a mouse press: the hand-off never moves focus
		await dse.waitForWrite(MIN, () => dse.click(root.control('init.malice.inc')));
		await settled();
		expect(await boxes()).toEqual([shows('2', 'Feytouched')]);
		expect(JSON.stringify(await dse.expectNoteBlock(MIN, INIT).value())).not.toContain('Feytouched'); // a draft is not note content
		await dse.waitForWrite(MIN, () => dse.click(root.control(ADD)));
		await settled();
		expect(await maliceLog()).toEqual([{ round: 2, amount: 2, label: 'Feytouched' }]);
		expect(await boxes()).toEqual([shows('', '')]);
	});

	it('[INIT-L10] Enter on Advance round keeps the draft, and the redrawn Advance round holds focus with the ring', async () => {
		await dse.openNote(MIN, { mode: 'live-preview' });
		const root = dse.block(INIT);
		await fill(0, '2', 'Feytouched');
		await dse.focusByScript(root.control('init.round.advance'));
		await dse.waitForWrite(MIN, () => dse.press('Enter', root.control('init.round.advance')));
		await settled();
		expect(await boxes()).toEqual([shows('2', 'Feytouched')]);
		expect(await focusState()).toEqual({ ctl: 'init.round.advance', tracker: 0, ring: true, caret: null });
	});

	it('[INIT-L11] text typed after the press but before the save lands is kept, with focus and the caret in the label box', async () => {
		await dse.openNote(MIN, { mode: 'live-preview' });
		const root = dse.block(INIT);
		await fill(0, '2', 'Fey');
		// The + press schedules the save (400 ms debounce); the click into the label and the key land before it.
		await dse.waitForWrite(MIN, async () => {
			await dse.click(root.control('init.malice.inc'));
			await dse.type(root.control(LBL), 'X');
		});
		await settled();
		expect(await boxes()).toEqual([shows('2', 'FeyX')]);
		expect(await focusState()).toEqual({ ctl: LBL, tracker: 0, ring: true, caret: [4, 4] });
	});

	it('[INIT-L12] two trackers: Advance round in the second keeps the second\'s draft, and the first keeps its own', async () => {
		await dse.openNote(TWO, { mode: 'live-preview' });
		await fill(0, '1', 'Alpha');
		await fill(1, '2', 'Beta');
		await dse.waitForWrite(TWO, () => dse.click(dse.block(INIT, 1).control('init.round.advance')));
		await settled();
		expect(await boxes()).toEqual([shows('1', 'Alpha'), shows('2', 'Beta')]);
	});

	it('[INIT-L13] identical twin trackers: Advance round in the first keeps the draft in the first, never in the second', async () => {
		await dse.openNote(TWINS, { mode: 'live-preview' });
		await fill(0, '1', 'Alpha');
		await dse.waitForWrite(TWINS, () => dse.click(dse.block(INIT, 0).control('init.round.advance')));
		await settled();
		expect(await boxes()).toEqual([shows('1', 'Alpha'), shows('', '')]);
		expect(await dse.expectNoteBlock(TWINS, INIT, 1).value()).not.toHaveProperty('round'); // the second twin was not written
	});

	it('[INIT-L14] an outside edit of the note (no save of the tracker) carries nothing: the redrawn tracker starts empty, as before', async () => {
		await dse.openNote(MIN, { mode: 'live-preview' });
		await fill(0, '2', 'Feytouched');
		await dse.externalEdit(MIN, `c.replace('value: 3', 'value: 5')`);
		await dse.waitFor(`document.querySelector('.workspace-leaf.mod-active .markdown-source-view [data-dse-element="initiative"] .dse-init__malice-value')?.textContent?.includes('5')`, 'the redrawn tracker');
		await settled();
		expect(await boxes()).toEqual([shows('', '')]);
	});

	it('[INIT-L15] Add after a kept draft empties the boxes, and an outside edit after that does not bring the draft back', async () => {
		await dse.openNote(MIN, { mode: 'live-preview' });
		const root = dse.block(INIT);
		await fill(0, '2', 'Feytouched');
		await dse.waitForWrite(MIN, () => dse.click(root.control('init.round.advance')));
		await settled();
		expect(await boxes()).toEqual([shows('2', 'Feytouched')]);
		await dse.waitForWrite(MIN, () => dse.click(root.control(ADD)));
		await settled();
		expect(await boxes()).toEqual([shows('', '')]);
		await dse.externalEdit(MIN, `c.replace(/value: \\d+/, 'value: 9')`);
		await dse.waitFor(`document.querySelector('.workspace-leaf.mod-active .markdown-source-view [data-dse-element="initiative"] .dse-init__malice-value')?.textContent?.includes('9')`, 'the redrawn tracker');
		await settled();
		expect(await boxes()).toEqual([shows('', '')]);
	});

	it('[INIT-L16] the hand-off is one-shot: boxes emptied by hand after the save, then an outside edit straight away, stay empty', async () => {
		await dse.openNote(MIN, { mode: 'live-preview' });
		const root = dse.block(INIT);
		await fill(0, '2', 'Feytouched');
		await dse.waitForWrite(MIN, () => dse.click(root.control('init.round.advance')));
		// No settle pause: the outside edit must land soon after the save's redraw, while a hand-off left armed would still be live.
		for (const id of [AMT, LBL]) {
			await dse.type(root.control(id), '', { replace: true });
			await browser.keys(['Backspace']);
		}
		await dse.externalEdit(MIN, `c.replace(/value: \\d+/, 'value: 9')`);
		await dse.waitFor(`document.querySelector('.workspace-leaf.mod-active .markdown-source-view [data-dse-element="initiative"] .dse-init__malice-value')?.textContent?.includes('9')`, 'the redrawn tracker');
		await settled();
		expect(await boxes()).toEqual([shows('', '')]);
	});

	it('[INIT-L17] the same note in two panes: the draft comes back only in the pane it was typed in', async () => {
		await dse.openNote(MIN, { mode: 'live-preview' });
		await dse.page(`(async () => { const leaf = app.workspace.getLeaf('split', 'vertical'); await leaf.setViewState({ type: 'markdown', state: { file: '${MIN}', mode: 'source', source: false }, active: true }); app.workspace.setActiveLeaf(leaf, { focus: true }); leaf.view.editor.setCursor({ line: 0, ch: 0 }); return true; })()`);
		try {
			await dse.waitFor(`document.querySelectorAll('.markdown-source-view [data-dse-element="initiative"] [data-dse-control="${AMT}"]').length >= 2`, 'two panes drawn');
			await fill(0, '2', 'Right'); // the active (right) pane
			await dse.waitForWrite(MIN, () => dse.click(dse.block(INIT).control('init.round.advance')));
			await settled();
			expect(await boxes()).toEqual([shows('', '', false), shows('2', 'Right', true)]);
		} finally {
			await dse.page(`(() => { app.workspace.getLeavesOfType('markdown').slice(1).forEach((l) => l.detach()); return true; })()`);
		}
	});
});
