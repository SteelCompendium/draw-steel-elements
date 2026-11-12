// An outside edit to the note (Sync, another device, a plugin) while a tracker window is open. The edit makes Obsidian redraw the block, so the old
// tracker unloads and its window closes with it: whatever was typed or staged in the window is dropped, and it cannot overwrite the outside change.
// The user is now told ("The note changed outside, so this window closed without saving") and keyboard focus lands on the redrawn tracker's replacement
// of the control that opened the window, not on <body>. In the pinned sidebar the tracker is not redrawn: its view was refreshed in place with the window
// still open, and the window's Apply / Add was silently lost. Now it closes the same way when the block changed, and when the edit left the block alone
// (an edit elsewhere in the note) the window stays and its Apply writes.
//   Initiative/squad.md (Goblins, pool 20, Malice 3, text ABOVE and BELOW the block), Initiative/tracker.md (Alice Alpha, three Ogres, Malice 3).
// The pinned squad is a note made at runtime (a copy of squad.md with an anchor); the driver deletes it again with the next openNote.
import { browser, expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { INIT, SQUAD } from '../../driver/pool';

const TRACKER = 'Initiative/tracker.md';
const PINNED = 'Sidebar/squad-pinned.md';
const ANCHOR = 'osw608';
const TABS = 80; // Tab presses from the top of the note to the control (the chrome panel and the whole tracker are in the way)
const NOTICE = 'The note changed outside, so this window closed without saving';
const MALICE = `c.replace('value: 3', 'value: 9')`; // an outside edit INSIDE the block

/** What holds focus: its control id, which surface it is in and whether it draws the ring. */
const focusState = () =>
	dse.page<{ ctl: string | null; surface: string; ring: boolean }>(`(() => {
		const a = document.activeElement;
		return {
			ctl: a?.closest('[data-dse-control]')?.getAttribute('data-dse-control') ?? null,
			surface: !a || a === document.body ? 'body' : a.closest('.modal-container') ? 'modal' : a.closest('.dse-sidebar') ? 'sidebar' : a.closest('.markdown-reading-view') ? 'reading' : a.closest('.markdown-source-view') ? 'source' : 'other',
			ring: !!a && a.matches(':focus-visible'),
		};
	})()`);
/** How many Notices on screen carry the text. */
const noticeCount = () => dse.page<number>(`Array.from(document.querySelectorAll('.notice')).filter((n) => n.textContent === ${JSON.stringify(NOTICE)}).length`);
const waitNotice = () => dse.waitFor(`Array.from(document.querySelectorAll('.notice')).some((n) => n.textContent === ${JSON.stringify(NOTICE)})`, 'the "closed without saving" Notice');
const closeSidebar = (): Promise<unknown> => dse.page(`(() => { app.workspace.detachLeavesOfType('dse-sidebar'); return true; })()`);

/** Pin the runtime copy of the squad note to the sidebar (by script: no note write). */
async function pinSquad(): Promise<void> {
	await dse.openNote(TRACKER); // resets the vault to fixture state first
	const text = (await dse.noteText(SQUAD)).replace('malice:\n  value: 3\n', `malice:\n  value: 3\n_dse_anchor: ${ANCHOR}\n`);
	await dse.page(`(async () => {
		await app.vault.create(${JSON.stringify(PINNED)}, ${JSON.stringify(text)});
		document.querySelectorAll('.notice-container').forEach((n) => n.style.display = 'none'); // Obsidian's "Update Available" Notice sits over the panel
		const leaf = app.workspace.getRightLeaf(false);
		await leaf.setViewState({ type: 'dse-sidebar', active: true });
		await app.workspace.revealLeaf(leaf);
		leaf.view.addPanel({ filePath: ${JSON.stringify(PINNED)}, alias: 'ds-initiative', anchorId: ${JSON.stringify(ANCHOR)} });
		return true;
	})()`);
	await dse.waitFor(`!!document.querySelector('.dse-sidebar [data-dse-control="init.detail.stamina"]')`, 'the pinned squad to render in the sidebar');
}
/** Keyboard-open the pinned squad's pool window from its detail row Stamina control and stage 3 damage on one minion. */
async function openPinnedPool(): Promise<Awaited<ReturnType<typeof dse.modal>>> {
	await dse.page(`(() => { document.querySelector('.dse-sidebar [data-dse-control="init.detail.stamina"]').focus({ focusVisible: true }); return true; })()`);
	await browser.keys('Enter');
	const modal = await dse.modal('minion-pool');
	await dse.type(modal.control('pool.damage-amount'), '3', { replace: true });
	await dse.type(modal.control('pool.minion-count'), '1', { replace: true });
	await dse.click(modal.control('pool.apply-damage'));
	return modal;
}

describe('initiative: a window open while an outside edit changes the note', () => {
	it('[INIT-W01] Reading view, pool window opened with the keyboard: an outside edit in the block closes it, with one Notice, and the rebuilt Stamina control holds focus', async () => {
		await dse.openNote(SQUAD);
		const root = dse.block(INIT);
		const numeric = root.control('init.detail.stamina');
		await dse.tabTo(numeric, TABS);
		await dse.press('Enter', numeric);
		const modal = await dse.modal('minion-pool');
		await dse.type(modal.control('pool.damage-amount'), '3', { replace: true });
		await dse.type(modal.control('pool.minion-count'), '1', { replace: true });
		await dse.click(modal.control('pool.apply-damage'));
		await dse.externalEdit(SQUAD, MALICE);
		await expect(modal.root).not.toBeExisting();
		await waitNotice();
		await expect(root.control({ css: '.dse-init__malice-value' })).toHaveElementProperty('textContent', 'Malice: 9'); // the outside change is what is on screen
		expect(await noticeCount()).toBe(1);
		expect(await focusState()).toEqual({ ctl: 'init.detail.stamina', surface: 'reading', ring: true });
		expect(await dse.noteText(SQUAD)).not.toContain('minion_stamina_pool'); // what was staged was dropped, not written over the edit
	});

	it('[INIT-W02] Reading view, Conditions window with half-typed text: the rebuilt Add Condition button holds focus', async () => {
		await dse.openNote(TRACKER);
		const root = dse.block(INIT);
		const add = root.control('init.cond.add', { nth: 0 }); // the hero's
		await dse.tabTo(add, TABS);
		await dse.press('Enter', add);
		const modal = await dse.modal('conditions');
		await dse.click(modal.control('cond.add'));
		await dse.type(modal.control('cond.input'), 'daz');
		await dse.externalEdit(TRACKER, MALICE);
		await expect(modal.root).not.toBeExisting();
		await waitNotice();
		expect(await noticeCount()).toBe(1);
		expect(await focusState()).toEqual({ ctl: 'init.cond.add', surface: 'reading', ring: true });
	});

	it('[INIT-W03] Reading view, hero Stamina window: the rebuilt hero Stamina control holds focus', async () => {
		await dse.openNote(TRACKER);
		const root = dse.block(INIT);
		const hero = root.control('init.hero.stamina');
		await dse.tabTo(hero, TABS);
		await dse.press('Enter', hero);
		const modal = await dse.modal('stamina-edit');
		await dse.type(modal.control('sedit.apply-amount'), '5', { replace: true });
		await dse.externalEdit(TRACKER, MALICE);
		await expect(modal.root).not.toBeExisting();
		await waitNotice();
		expect(await focusState()).toEqual({ ctl: 'init.hero.stamina', surface: 'reading', ring: true });
		expect(await dse.noteText(TRACKER)).not.toContain('current_stamina'); // the 5 typed there was never applied
	});

	it('[INIT-W04] Reading view, an edit ABOVE the block does not redraw it: the window stays open and its Apply writes, with no Notice', async () => {
		await dse.openNote(SQUAD);
		const root = dse.block(INIT);
		const numeric = root.control('init.detail.stamina');
		await dse.tabTo(numeric, TABS);
		await dse.press('Enter', numeric);
		const modal = await dse.modal('minion-pool');
		await dse.type(modal.control('pool.damage-amount'), '3', { replace: true });
		await dse.type(modal.control('pool.minion-count'), '1', { replace: true });
		await dse.click(modal.control('pool.apply-damage'));
		await dse.externalEdit(SQUAD, `c.replace('ABOVE', 'ABOVE\\n\\nA new paragraph')`);
		await dse.settle();
		await expect(modal.root).toBeExisting();
		await dse.tabTo(modal.control('pool.apply'), 30);
		await dse.waitForWrite(SQUAD, () => dse.press('Enter', modal.control('pool.apply')));
		await expect(modal.root).not.toBeExisting();
		await dse.settle();
		expect(await dse.noteText(SQUAD)).toContain('minion_stamina_pool: 17');
		expect(await dse.noteText(SQUAD)).toContain('A new paragraph');
		expect(await noticeCount()).toBe(0);
		await dse.externalEdit(SQUAD, `c.replace('ABOVE\\n\\nA new paragraph', 'ABOVE')`); // the driver's integrity check wants the text outside the block back as it was
		await dse.settle();
	});

	it('[INIT-W05] the tracker\'s own Apply shows no Notice, and the rebuilt Stamina control holds focus', async () => {
		await dse.openNote(SQUAD);
		const root = dse.block(INIT);
		const numeric = root.control('init.detail.stamina');
		await dse.tabTo(numeric, TABS);
		await dse.press('Enter', numeric);
		const modal = await dse.modal('minion-pool');
		await dse.type(modal.control('pool.damage-amount'), '3', { replace: true });
		await dse.type(modal.control('pool.minion-count'), '1', { replace: true });
		await dse.click(modal.control('pool.apply-damage'));
		await dse.tabTo(modal.control('pool.apply'), 30);
		await dse.waitForWrite(SQUAD, () => dse.press('Enter', modal.control('pool.apply')));
		await expect(modal.root).not.toBeExisting();
		await dse.settle();
		await browser.pause(500);
		expect(await noticeCount()).toBe(0);
		expect(await focusState()).toEqual({ ctl: 'init.detail.stamina', surface: 'reading', ring: true });
	});

	it('[INIT-W06] Live Preview, pool window opened with the keyboard: an outside edit in the block closes it, with one Notice, and the rebuilt Stamina control holds focus', async () => {
		await dse.openNote(SQUAD, { mode: 'live-preview' });
		const root = dse.block(INIT);
		const numeric = root.control('init.detail.stamina');
		await dse.focusByScript(numeric);
		await dse.press('Enter', numeric);
		const modal = await dse.modal('minion-pool');
		await dse.type(modal.control('pool.damage-amount'), '3', { replace: true });
		await dse.click(modal.control('pool.apply-damage'));
		await dse.externalEdit(SQUAD, MALICE);
		await expect(modal.root).not.toBeExisting();
		await waitNotice();
		await browser.pause(500); // the hand-off must hold, not only land
		await expect(root.control({ css: '.dse-init__malice-value' })).toHaveElementProperty('textContent', 'Malice: 9');
		expect(await noticeCount()).toBe(1);
		expect(await focusState()).toEqual({ ctl: 'init.detail.stamina', surface: 'source', ring: true });
	});

});

describe('initiative: a window open in the pinned sidebar while an outside edit changes the note', () => {
	before(() => dse.setPrefs({}, { experimental: true }));
	after(async () => {
		await closeSidebar();
		await dse.setPrefs({});
	});
	afterEach(closeSidebar);

	it('[INIT-W07] pinned sidebar, pool window: an outside edit in the block closes it, with one Notice, and the sidebar\'s rebuilt Stamina control holds focus', async () => {
		await pinSquad();
		const modal = await openPinnedPool();
		await dse.externalEdit(PINNED, MALICE);
		await expect(modal.root).not.toBeExisting();
		await waitNotice();
		await dse.waitFor(`document.querySelector('.dse-sidebar .dse-init__malice-value')?.textContent === 'Malice: 9'`, 'the sidebar tracker to follow the outside change');
		expect(await noticeCount()).toBe(1);
		expect(await focusState()).toEqual({ ctl: 'init.detail.stamina', surface: 'sidebar', ring: true });
		expect(await dse.noteText(PINNED)).not.toContain('minion_stamina_pool');
	});

	it('[INIT-W08] pinned sidebar, pool window: an outside edit ELSEWHERE in the note leaves the window open, and its Apply writes the pool', async () => {
		await pinSquad();
		const modal = await openPinnedPool();
		await dse.externalEdit(PINNED, `c.replace('BELOW', 'BELOW and more')`);
		await browser.pause(800);
		await expect(modal.root).toBeExisting();
		expect(await noticeCount()).toBe(0);
		await dse.page(`(() => { document.querySelector('.modal-container [data-dse-control="pool.apply"]').focus(); return true; })()`);
		await browser.keys('Enter');
		await expect(modal.root).not.toBeExisting();
		await browser.waitUntil(async () => (await dse.noteText(PINNED)).includes('minion_stamina_pool: 17'), { timeout: 5000, timeoutMsg: 'the Apply never reached the note' });
		expect(await dse.noteText(PINNED)).toContain('BELOW and more'); // the outside edit survived
		expect(await dse.page<string | null>(`document.querySelector('.dse-sidebar [data-dse-control="init.detail.stamina"]')?.textContent ?? null`)).toBe('17/20 (4)');
	});
});
