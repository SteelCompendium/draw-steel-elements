// SC-602: Live Preview variants of the SC-588 focus tests (focus-after-rebuild.e2e.ts, INIT-F01 in malice.e2e.ts). In Live Preview the tracker's own
// save redraws its CodeMirror widget with a NEW root (a view's write is adopted only in Reading view), so the control SC-588 handed focus to was
// thrown away again when the save landed about half a second later, and focus fell to <body>. The redrawn tracker now takes focus on the control that
// replaces the pressed one, with the ring. A mouse press never pulls focus in, and focus the user moved away never comes back.
// A real Tab from the editor would indent the note, so a control is focused by script (dse.focusByScript) and its Enter is a real key press; the quick-add
// fields are typed into with real clicks and keys.
// Initiative/rich.md: round 2, Malice 4. Initiative/captain.md: the captain case. Initiative/tracker.md: Malice 3. Initiative/two-trackers.md: two trackers.
import { browser, expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const RICH = 'Initiative/rich.md';
const CAP = 'Initiative/captain.md';
const MIN = 'Initiative/tracker.md';
const TWO = 'Initiative/two-trackers.md';
const INIT = 'ds-initiative';
const TRACKER = '.markdown-source-view [data-dse-element="initiative"]';

/** What holds focus: its control id, the index of the Live Preview tracker it is in (-1: none), whether the page body or the editor text holds it, and the ring. */
const focusState = () =>
	dse.page<{ ctl: string | null; tracker: number; editor: boolean; ring: boolean }>(`(() => {
		const a = document.activeElement;
		const roots = Array.from(document.querySelectorAll('${TRACKER}')).filter((r) => !r.parentElement.closest('[data-dse-element]'));
		const root = a?.closest('[data-dse-element="initiative"]');
		return {
			ctl: a?.closest('[data-dse-control]')?.getAttribute('data-dse-control') ?? null,
			tracker: root && root.closest('.markdown-source-view') ? roots.indexOf(root) : -1,
			editor: !!a?.classList.contains('cm-content'),
			ring: !!a && a.matches(':focus-visible'),
		};
	})()`);

describe('initiative: keyboard focus after the tracker saves, in Live Preview', () => {
	it('[INIT-L01] after Enter in the quick-add label field, keyboard focus is on the redrawn label field', async () => {
		await dse.openNote(MIN, { mode: 'live-preview' });
		const root = dse.block(INIT);
		await dse.type(root.control('init.malice.quickadd.amount'), '2', { replace: true });
		await dse.type(root.control('init.malice.quickadd.label'), 'Kbd', { replace: true });
		await dse.waitForWrite(MIN, () => dse.press('Enter', root.control('init.malice.quickadd.label')));
		await dse.settle();
		await browser.pause(1000); // the carry is one-shot: the end state must hold a second after write-idle, not only at it
		expect(await focusState()).toEqual({ ctl: 'init.malice.quickadd.label', tracker: 0, editor: false, ring: true });
		await expect(root.control('init.malice.quickadd.label')).toHaveValue(''); // the add happened and the redrawn field is empty
	});

	it('[INIT-L02] Enter on Advance round: the redrawn Advance round button holds focus, with the keyboard ring', async () => {
		await dse.openNote(RICH, { mode: 'live-preview' });
		const root = dse.block(INIT);
		await dse.focusByScript(root.control('init.round.advance'));
		await dse.waitForWrite(RICH, () => dse.press('Enter', root.control('init.round.advance')));
		await dse.settle();
		await browser.pause(1000); // the carry is one-shot: the end state must hold a second after write-idle, not only at it
		await expect(root.control({ css: '.dse-init__round-value' })).toHaveText('Round 3');
		expect(await focusState()).toEqual({ ctl: 'init.round.advance', tracker: 0, editor: false, ring: true });
	});

	it('[INIT-L03] Enter on Reset turns (this round): the redrawn chrome item holds focus', async () => {
		await dse.openNote(RICH, { mode: 'live-preview' });
		const root = dse.block(INIT);
		await dse.focusByScript(root.control('init.reset-turns'));
		await dse.waitForWrite(RICH, () => dse.press('Enter', root.control('init.reset-turns')));
		await dse.settle();
		await browser.pause(1000); // the carry is one-shot: the end state must hold a second after write-idle, not only at it
		await expect(root.control('init.hero.turn', { nth: 1 })).toHaveAttribute('aria-pressed', 'false'); // Bruno's turn mark cleared: the tracker was redrawn
		expect(await focusState()).toEqual({ ctl: 'init.reset-turns', tracker: 0, editor: false, ring: true });
	});

	it('[INIT-L04] Enter on Relieve captain, then on Make captain: focus follows the badge each time', async () => {
		await dse.openNote(CAP, { mode: 'live-preview' });
		const root = dse.block(INIT);
		await dse.focusByScript(root.control('init.captain.relieve')); // the selected Goblin Captain
		await dse.waitForWrite(CAP, () => dse.press('Enter', root.control('init.captain.relieve')));
		await dse.settle();
		await browser.pause(1000); // the carry is one-shot: the end state must hold a second after write-idle, not only at it
		await expect(root.control('init.captain.make')).toHaveAttribute('aria-label', 'Make Goblin Captain captain of Goblin');
		expect(await focusState()).toEqual({ ctl: 'init.captain.make', tracker: 0, editor: false, ring: true });
		await dse.waitForWrite(CAP, () => dse.press('Enter', root.control('init.captain.make')));
		await dse.settle();
		await browser.pause(1000); // the carry is one-shot: the end state must hold a second after write-idle, not only at it
		await expect(root.control('init.captain.relieve')).toHaveAttribute('aria-label', 'Relieve Goblin Captain as captain');
		expect(await focusState()).toEqual({ ctl: 'init.captain.relieve', tracker: 0, editor: false, ring: true });
	});

	it('[INIT-L05] Reset encounter -> Yes, Reset from the keyboard: the modal closes and the redrawn Reset encounter item holds focus', async () => {
		await dse.openNote(RICH, { mode: 'live-preview' });
		const root = dse.block(INIT);
		await dse.focusByScript(root.control('init.reset-encounter'));
		await dse.press('Enter', root.control('init.reset-encounter'));
		const modal = await dse.modal('reset-encounter');
		const confirm = modal.control('init.reset-encounter.confirm');
		await dse.tabTo(confirm, 6);
		await dse.waitForWrite(RICH, () => dse.press('Enter', confirm));
		await expect(modal.root).not.toBeExisting();
		await dse.settle();
		await browser.pause(1000); // the carry is one-shot: the end state must hold a second after write-idle, not only at it
		await expect(root.control({ css: '.dse-init__round-value' })).toHaveText('Round 1');
		expect(await focusState()).toEqual({ ctl: 'init.reset-encounter', tracker: 0, editor: false, ring: true });
	});

	it('[INIT-L06] a mouse press on Advance round (focus in the editor) takes no focus into the tracker, and the redraw does not pull any in', async () => {
		await dse.openNote(RICH, { mode: 'live-preview' });
		const root = dse.block(INIT);
		expect((await focusState()).tracker).toBe(-1);
		await dse.waitForWrite(RICH, () => dse.click(root.control('init.round.advance')));
		await dse.settle();
		await expect(root.control({ css: '.dse-init__round-value' })).toHaveText('Round 3');
		expect((await focusState()).tracker).toBe(-1);
	});

	it('[INIT-L07] two trackers: Enter on the SECOND tracker\'s Advance round keeps focus in the second tracker', async () => {
		await dse.openNote(TWO, { mode: 'live-preview' });
		const root = dse.block(INIT, 1);
		await dse.focusByScript(root.control('init.round.advance'));
		await dse.waitForWrite(TWO, () => dse.press('Enter', root.control('init.round.advance')));
		await dse.settle();
		await browser.pause(1000); // the carry is one-shot: the end state must hold a second after write-idle, not only at it
		expect(await focusState()).toEqual({ ctl: 'init.round.advance', tracker: 1, editor: false, ring: true });
	});

	it('[INIT-L08] Enter on Advance round, then focus moved to the editor before the save lands: the save does not take it back', async () => {
		await dse.openNote(RICH, { mode: 'live-preview' });
		const root = dse.block(INIT);
		await dse.focusByScript(root.control('init.round.advance'));
		await dse.waitForWrite(RICH, async () => {
			await dse.press('Enter', root.control('init.round.advance'));
			await dse.page(`document.querySelector('.workspace-leaf.mod-active .markdown-source-view .cm-content').focus()`); // inside the 400 ms debounce
		});
		await dse.settle();
		await expect(root.control({ css: '.dse-init__round-value' })).toHaveText('Round 3');
		const f = await focusState();
		expect([f.tracker, f.editor]).toEqual([-1, true]);
	});
});
