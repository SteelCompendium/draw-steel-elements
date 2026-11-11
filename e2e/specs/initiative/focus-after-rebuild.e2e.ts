// SC-588: Advance round, Make / Relieve captain, Reset turns and Reset encounter -> Yes each rebuild the whole tracker, which empties its root and
// mounts again. Focus used to fall to <body>, so a keyboard user had to Tab in from the top of the note; the rebuilt tracker now focuses the control
// that replaced the one pressed (the quick-add field's Enter is INIT-F01 in malice.e2e.ts). The mapping per action:
//   Advance round -> the rebuilt Advance round button      Reset turns -> the rebuilt Reset turns chrome item
//   Make captain <-> Relieve captain: the badge of the same creature, whichever of the two it now is
//   Reset encounter -> Yes: the confirm modal closes, and the rebuilt Reset encounter chrome item takes focus
// A mouse press never moves focus: in Reading view it does not focus the button, so there is nothing to hand back. The jsdom matrix ([F], test/dom/elements/initiative-matrix.test.ts) holds the
// rest (focus elsewhere is never taken, a list that shrank, the fallback to the root). Initiative/rich.md: round 2, Malice 4, round_gain 2.
// Initiative/captain.md: Goblins #1-#3, the Goblin Captain (selected), an attached Warg Rider.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const RICH = 'Initiative/rich.md';
const CAP = 'Initiative/captain.md';
const INIT = 'ds-initiative';
const TABS = 80; // Tab presses from the top of the note to the control (the chrome panel and the whole tracker are in the way)

/** What holds focus: its control id, whether it is inside the Reading view's tracker (not the hidden Live Preview copy) and whether it draws the ring. */
const focusState = () =>
	dse.page<{ ctl: string | null; inTracker: boolean; ring: boolean }>(`(() => {
		const a = document.activeElement;
		return {
			ctl: a?.closest('[data-dse-control]')?.getAttribute('data-dse-control') ?? null,
			inTracker: !!a?.closest('.markdown-reading-view [data-dse-element="initiative"]'),
			ring: !!a && a.matches(':focus-visible'),
		};
	})()`);

describe('initiative: keyboard focus after an action that rebuilds the whole tracker', () => {
	it('[INIT-F02] Enter on Advance round: the rebuilt Advance round button holds focus, with the keyboard ring', async () => {
		await dse.openNote(RICH);
		const root = dse.block(INIT);
		await dse.tabTo(root.control('init.round.advance'), TABS);
		await dse.waitForWrite(RICH, () => dse.press('Enter', root.control('init.round.advance')));
		await dse.settle();
		await expect(root.control({ css: '.dse-init__round-value' })).toHaveText('Round 3');
		expect(await focusState()).toEqual({ ctl: 'init.round.advance', inTracker: true, ring: true });
	});

	it('[INIT-F03] Enter on Reset turns (this round): the rebuilt chrome item holds focus', async () => {
		await dse.openNote(RICH);
		const root = dse.block(INIT);
		await dse.tabTo(root.control('init.reset-turns'), TABS);
		await dse.waitForWrite(RICH, () => dse.press('Enter', root.control('init.reset-turns')));
		await dse.settle();
		await expect(root.control('init.hero.turn', { nth: 1 })).toHaveAttribute('aria-pressed', 'false'); // Bruno's turn mark cleared: the tracker was rebuilt
		expect(await focusState()).toEqual({ ctl: 'init.reset-turns', inTracker: true, ring: true });
	});

	it('[INIT-F04] Enter on Relieve captain, then on Make captain: focus follows the badge each time', async () => {
		await dse.openNote(CAP);
		const root = dse.block(INIT);
		const relieve = root.control('init.captain.relieve'); // the selected Goblin Captain
		await dse.tabTo(relieve, TABS);
		await dse.waitForWrite(CAP, () => dse.press('Enter', relieve));
		await dse.settle();
		await expect(root.control('init.captain.make')).toHaveAttribute('aria-label', 'Make Goblin Captain captain of Goblin');
		expect(await focusState()).toEqual({ ctl: 'init.captain.make', inTracker: true, ring: true });
		await dse.waitForWrite(CAP, () => dse.press('Enter', root.control('init.captain.make')));
		await dse.settle();
		await expect(root.control('init.captain.relieve')).toHaveAttribute('aria-label', 'Relieve Goblin Captain as captain');
		expect(await focusState()).toEqual({ ctl: 'init.captain.relieve', inTracker: true, ring: true });
	});

	it('[INIT-F05] Reset encounter -> Yes, Reset from the keyboard: the modal closes and the rebuilt Reset encounter item holds focus', async () => {
		await dse.openNote(RICH);
		const root = dse.block(INIT);
		await dse.tabTo(root.control('init.reset-encounter'), TABS);
		await dse.press('Enter', root.control('init.reset-encounter'));
		const modal = await dse.modal('reset-encounter');
		const confirm = modal.control('init.reset-encounter.confirm');
		await dse.tabTo(confirm, 6);
		await dse.waitForWrite(RICH, () => dse.press('Enter', confirm));
		await expect(modal.root).not.toBeExisting();
		await dse.settle();
		await expect(root.control({ css: '.dse-init__round-value' })).toHaveText('Round 1');
		expect(await focusState()).toEqual({ ctl: 'init.reset-encounter', inTracker: true, ring: true });
	});

	it('[INIT-F06] a mouse press on Advance round takes no focus (the note\'s click shield does not focus the button), and the rebuild does not pull any in', async () => {
		await dse.openNote(RICH);
		const root = dse.block(INIT);
		const before = await focusState();
		expect(before.inTracker).toBe(false);
		await dse.waitForWrite(RICH, () => dse.click(root.control('init.round.advance')));
		await dse.settle();
		await expect(root.control({ css: '.dse-init__round-value' })).toHaveText('Round 3');
		const after = await focusState();
		expect([after.ctl, after.inTracker]).toEqual([before.ctl, before.inTracker]);
	});
});
