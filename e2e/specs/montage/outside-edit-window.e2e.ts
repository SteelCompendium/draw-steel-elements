// An outside edit to the note (Sync, another device, a plugin) while a montage window is open. The edit makes Obsidian redraw the block, so the
// old montage unloads and its window closes with it: whatever was typed or staged in the window is dropped, and it cannot overwrite the outside
// change. The user is now told ("The note changed outside, so this window closed without saving") and keyboard focus lands on the redrawn
// montage's replacement of the control that opened the window, not on <body>; the initiative tracker has done the same since SC-608
// (initiative/outside-edit-window.e2e.ts). A window closed by the montage's own write shows no Notice.
//   Montage/fresh.md (Kira and Bram, round 1 of 3, limits 3 / 2), Montage/mid.md (Kira's round-1 entry, round 2 of 3, limits 4 / 3).
import { browser, expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { blockOf, FRESH, MID, MONTAGE, TABS } from '../../driver/montage';

const NOTICE = 'The note changed outside, so this window closed without saving';
/** An outside edit INSIDE the block (the success limit). */
const LIMIT_FRESH = `c.replace('success_limit: 3', 'success_limit: 6')`;
const LIMIT_MID = `c.replace('success_limit: 4', 'success_limit: 6')`;

/** What holds focus: its control id, the cell it is in (`round:hero`), which surface it is in, and whether it draws the ring. */
const focusState = () =>
	dse.page<{ ctl: string | null; cell: string | null; surface: string; ring: boolean; inMontage: boolean }>(`(() => {
		const a = document.activeElement;
		return {
			inMontage: !!a?.closest('[data-dse-element="montage"]'),
			ctl: a?.closest('[data-dse-control]')?.getAttribute('data-dse-control') ?? null,
			cell: a?.closest('.dse-mt__cell')?.getAttribute('data-dse-focus-at') ?? null,
			surface: !a || a === document.body ? 'body' : a.closest('.modal-container') ? 'modal' : a.closest('.markdown-reading-view') ? 'reading' : a.closest('.markdown-source-view') ? 'source' : 'other',
			ring: !!a && a.matches(':focus-visible'),
		};
	})()`);
/** How many Notices on screen carry the text. */
const noticeCount = () => dse.page<number>(`Array.from(document.querySelectorAll('.notice')).filter((n) => n.textContent === ${JSON.stringify(NOTICE)}).length`);
const waitNotice = () => dse.waitFor(`Array.from(document.querySelectorAll('.notice')).some((n) => n.textContent === ${JSON.stringify(NOTICE)})`, 'the "closed without saving" Notice');
/** The success limit the redrawn card shows ("6 from Total Success" on a fresh round 1 of limit 6), in the pane the test is in (a leaf keeps a hidden copy of the other mode). */
const waitLimit = (limit: number, pane = '.markdown-reading-view') =>
	dse.waitFor(`Array.from(document.querySelectorAll('${pane} [data-dse-element="montage"]')).some((r) => r.textContent?.includes('${limit} from Total Success'))`, `the redrawn montage to show the success limit ${limit}`);

describe('montage: a window open while an outside edit changes the note', () => {
	it('[MONT-OW01] Reading view, Log an action opened with the keyboard: an outside edit closes it, with one Notice, and the rebuilt Log an action button holds focus', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		const log = root.control('montage.bar.log');
		await dse.tabTo(log, TABS);
		await dse.press('Enter', log);
		const modal = await dse.modal('montage-log');
		await dse.externalEdit(FRESH, LIMIT_FRESH);
		await expect(modal.root).not.toBeExisting();
		await waitNotice();
		await waitLimit(6); // the outside change is what is on screen
		await browser.pause(500); // the hand-off must hold, not only land
		expect(await noticeCount()).toBe(1);
		expect(await focusState()).toMatchObject({ ctl: 'montage.bar.log', cell: null, surface: 'reading', ring: true, inMontage: true });
		expect((await blockOf(FRESH)).entries).toBeUndefined(); // nothing was logged over the outside edit
		expect((await blockOf(FRESH)).success_limit).toBe(6);
	});

	it('[MONT-OW02] Reading view, the sheet of a recorded cell: the rebuilt cell (same hero, same round) holds focus', async () => {
		await dse.openNote(MID);
		const root = dse.block(MONTAGE);
		const cell = root.control('montage.cell', { nth: 0 }); // Kira, round 1
		await dse.tabTo(cell, TABS);
		await dse.press('Enter', cell);
		const modal = await dse.modal('montage-log');
		await dse.externalEdit(MID, LIMIT_MID);
		await expect(modal.root).not.toBeExisting();
		await waitNotice();
		await waitLimit(6 - 1); // one success already logged
		expect(await noticeCount()).toBe(1);
		expect(await focusState()).toMatchObject({ ctl: 'montage.cell', cell: '1:Kira', surface: 'reading', ring: true, inMontage: true });
	});

	it('[MONT-OW03] Reading view, Add a hero from the chrome item: the name typed in the window is dropped, not written, and the rebuilt chrome item holds focus', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		const item = root.control('montage.chrome.add-hero');
		await dse.tabTo(item, TABS);
		await dse.press('Enter', item);
		const modal = await dse.modal('montage-add-hero');
		await dse.type(modal.control('montage.add-hero.name'), 'Osric');
		await dse.externalEdit(FRESH, LIMIT_FRESH);
		await expect(modal.root).not.toBeExisting();
		await waitNotice();
		await browser.pause(500);
		expect(await noticeCount()).toBe(1);
		expect(await focusState()).toMatchObject({ ctl: 'montage.chrome.add-hero', cell: null, surface: 'reading', ring: true, inMontage: true });
		expect((await blockOf(FRESH)).participants).toHaveLength(2);
	});

	it('[MONT-OW04] Reading view, Set limits: the rebuilt chrome item holds focus, and the limit typed in the window does not overwrite the outside change', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		const item = root.control('montage.chrome.set-limits');
		await dse.tabTo(item, TABS);
		await dse.press('Enter', item);
		const modal = await dse.modal('montage-limits');
		await dse.type(modal.control('montage.limits.success'), '9', { replace: true });
		await dse.externalEdit(FRESH, LIMIT_FRESH);
		await expect(modal.root).not.toBeExisting();
		await waitNotice();
		await browser.pause(500);
		expect(await noticeCount()).toBe(1);
		expect(await focusState()).toMatchObject({ ctl: 'montage.chrome.set-limits', cell: null, surface: 'reading', ring: true, inMontage: true });
		expect((await blockOf(FRESH)).success_limit).toBe(6);
	});

	it('[MONT-OW05] Reading view, Log an action opened with the mouse (focus was not in the montage): the Notice shows and nothing is focused', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		await dse.click(root.control('montage.bar.log'));
		const modal = await dse.modal('montage-log');
		await dse.externalEdit(FRESH, LIMIT_FRESH);
		await expect(modal.root).not.toBeExisting();
		await waitNotice();
		await browser.pause(500);
		expect(await noticeCount()).toBe(1);
		expect(await focusState()).toMatchObject({ ctl: null, inMontage: false }); // on the page (the note's scroller), not in the montage
	});

	it('[MONT-OW06] the montage\'s own Log shows no Notice, and the rebuilt Log an action button holds focus', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		const log = root.control('montage.bar.log');
		await dse.tabTo(log, TABS);
		await dse.press('Enter', log);
		const modal = await dse.modal('montage-log');
		const submit = modal.control('montage.log.submit');
		await dse.tabTo(submit, 12);
		await dse.waitForWrite(FRESH, () => dse.press('Enter', submit));
		await dse.settle();
		await browser.pause(500);
		await expect(modal.root).not.toBeExisting();
		expect((await blockOf(FRESH)).entries).toHaveLength(1);
		expect(await noticeCount()).toBe(0);
		expect(await focusState()).toMatchObject({ ctl: 'montage.bar.log', cell: null, surface: 'reading', ring: true, inMontage: true });
	});

	it('[MONT-OW07] Live Preview, Log an action opened with the keyboard: an outside edit closes it, with one Notice, and the rebuilt Log an action button holds focus', async () => {
		await dse.openNote(FRESH, { mode: 'live-preview' });
		const root = dse.block(MONTAGE);
		const log = root.control('montage.bar.log');
		await dse.focusByScript(log); // a real Tab from the editor would indent the note
		await dse.press('Enter', log);
		const modal = await dse.modal('montage-log');
		await dse.externalEdit(FRESH, LIMIT_FRESH);
		await expect(modal.root).not.toBeExisting();
		await waitNotice();
		await waitLimit(6, '.markdown-source-view');
		await browser.pause(500); // the hand-off must hold, not only land
		expect(await noticeCount()).toBe(1);
		expect(await focusState()).toMatchObject({ ctl: 'montage.bar.log', cell: null, surface: 'source', ring: true, inMontage: true });
		expect((await blockOf(FRESH)).entries).toBeUndefined();
	});

	it('[MONT-OW08] Live Preview, Add a hero from the chrome item: an outside edit closes it, with one Notice, and the rebuilt chrome item holds focus', async () => {
		await dse.openNote(FRESH, { mode: 'live-preview' });
		const root = dse.block(MONTAGE);
		const item = root.control('montage.chrome.add-hero');
		await dse.focusByScript(item);
		await dse.press('Enter', item);
		const modal = await dse.modal('montage-add-hero');
		await dse.type(modal.control('montage.add-hero.name'), 'Osric');
		await dse.externalEdit(FRESH, LIMIT_FRESH);
		await expect(modal.root).not.toBeExisting();
		await waitNotice();
		await browser.pause(500);
		expect(await noticeCount()).toBe(1);
		expect(await focusState()).toMatchObject({ ctl: 'montage.chrome.add-hero', cell: null, surface: 'source', ring: true, inMontage: true });
		expect((await blockOf(FRESH)).participants).toHaveLength(2);
	});

	it('[MONT-OW09] Live Preview, the sheet of a recorded cell: the rebuilt cell holds focus', async () => {
		await dse.openNote(MID, { mode: 'live-preview' });
		const root = dse.block(MONTAGE);
		const cell = root.control('montage.cell', { nth: 0 });
		await dse.focusByScript(cell);
		await dse.press('Enter', cell);
		const modal = await dse.modal('montage-log');
		await dse.externalEdit(MID, LIMIT_MID);
		await expect(modal.root).not.toBeExisting();
		await waitNotice();
		await browser.pause(500);
		expect(await noticeCount()).toBe(1);
		expect(await focusState()).toMatchObject({ ctl: 'montage.cell', cell: '1:Kira', surface: 'source', ring: true, inMontage: true });
	});
});
