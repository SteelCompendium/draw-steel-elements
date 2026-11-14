// SC-438 [F]: keyboard focus after the montage saves. Every write rebuilds the whole montage (it empties its root and mounts again); a keyboard user
// who pressed Enter on End round, on the Test tiers strip or on Log in a sheet has focus on the control that replaced it, as the initiative tracker
// gives them (focus-after-rebuild.e2e.ts). SC-626 made these four pass and added F05..: a window (Add a hero, Set limits) closing after it wrote, the
// nearest equivalent of a control that is gone (End round on the last round), and the rule that a write with focus outside the card pulls none in.
// Montage/fresh.md: round 1 of 3.
import { browser, expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { blockOf, closeDisclosures, clickChrome, focusState, FRESH, MONTAGE, TABS } from '../../driver/montage';

describe('montage: keyboard focus after the montage rebuilds', () => {
	it('[MONT-F01] Enter on End round: the rebuilt End round button holds focus', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		const end = root.control('montage.bar.end-round');
		await dse.tabTo(end, TABS);
		await dse.waitForWrite(FRESH, () => dse.press('Enter', end));
		await dse.settle();
		expect((await blockOf(FRESH)).current_round).toBe(2);
		const f = await focusState();
		expect(f.ctl).toBe('montage.bar.end-round');
		expect(f.inMontage).toBe(true);
	});

	it('[MONT-F02] Enter on the Test tiers strip header: the rebuilt header holds focus', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		await closeDisclosures(root); // the open state outlives a test (session store)
		const header = root.control('montage.strip');
		await dse.tabTo(header, TABS);
		await dse.press('Enter', header);
		await dse.settle();
		await expect(root.control('montage.strip')).toHaveAttribute('aria-expanded', 'true');
		const f = await focusState();
		expect(f.ctl).toBe('montage.strip');
		expect(f.inMontage).toBe(true);
	});

	it('[MONT-F03] a sheet closed by Log from the keyboard: focus lands inside the rebuilt montage, not on the page', async () => {
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
		await expect(modal.root).not.toBeExisting();
		expect((await blockOf(FRESH)).entries).toHaveLength(1);
		const f = await focusState();
		expect(f.inMontage).toBe(true);
	});

	it('[MONT-F04] Live Preview: Enter on End round, the rebuilt End round button holds focus', async () => {
		await dse.openNote(FRESH, { mode: 'live-preview' });
		const root = dse.block(MONTAGE);
		const end = root.control('montage.bar.end-round');
		await dse.focusByScript(end); // a real Tab from the editor would indent the note
		await dse.waitForWrite(FRESH, () => dse.press('Enter', end));
		await dse.settle();
		expect((await blockOf(FRESH)).current_round).toBe(2);
		expect(await dse.focusedControl()).toBe('montage.bar.end-round');
	});

	it('[MONT-F05] Add a hero from the keyboard: the window closes after the write and the chrome item that opened it holds focus', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		const item = root.control('montage.chrome.add-hero');
		await dse.tabTo(item, TABS);
		await dse.press('Enter', item);
		const modal = await dse.modal('montage-add-hero');
		await dse.type(modal.control('montage.add-hero.name'), 'Osric');
		const add = modal.control('montage.add-hero.submit');
		await dse.tabTo(add, 6);
		await dse.waitForWrite(FRESH, () => dse.press('Enter', add));
		await dse.settle();
		await expect(modal.root).not.toBeExisting();
		expect((await blockOf(FRESH)).participants).toHaveLength(3);
		const f = await focusState();
		expect([f.ctl, f.inMontage, f.ring]).toEqual(['montage.chrome.add-hero', true, true]);
	});

	it('[MONT-F06] Set limits from the keyboard: the window closes after Save and the chrome item that opened it holds focus', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		const item = root.control('montage.chrome.set-limits');
		await dse.tabTo(item, TABS);
		await dse.press('Enter', item);
		const modal = await dse.modal('montage-limits');
		await dse.type(modal.control('montage.limits.success'), '5', { replace: true });
		const save = modal.control('montage.limits.save');
		await dse.tabTo(save, 6);
		await dse.waitForWrite(FRESH, () => dse.press('Enter', save));
		await dse.settle();
		await expect(modal.root).not.toBeExisting();
		expect((await blockOf(FRESH)).success_limit).toBe(5);
		const f = await focusState();
		expect([f.ctl, f.inMontage, f.ring]).toEqual(['montage.chrome.set-limits', true, true]);
	});

	it('[MONT-F07] Enter on End round three times without tabbing again: focus stays on it, and on the last round (the montage ends, End round is gone) lands on Back to round 3', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		await dse.tabTo(root.control('montage.bar.end-round'), TABS);
		for (let round = 2; round <= 3; round++) {
			await dse.waitForWrite(FRESH, () => dse.press('Enter', root.control('montage.bar.end-round')));
			await dse.settle();
			expect((await blockOf(FRESH)).current_round).toBe(round);
			expect((await focusState()).ctl).toBe('montage.bar.end-round');
		}
		await dse.waitForWrite(FRESH, () => dse.press('Enter', root.control('montage.bar.end-round')));
		await dse.settle();
		expect((await blockOf(FRESH)).current_round).toBe(4);
		await expect(root.control('montage.bar.end-round')).not.toBeExisting();
		const f = await focusState();
		expect([f.ctl, f.inMontage]).toEqual(['montage.bar.back', true]);
	});

	it('[MONT-F08] Log in the sheet with Kira and Bram both acting: the Log button holds focus after the first, End round after the second (Log is disabled once every hero has acted)', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		for (const [i, after] of [[1, 'montage.bar.log'], [2, 'montage.bar.end-round']] as const) {
			const log = root.control('montage.bar.log');
			await dse.tabTo(log, TABS);
			await dse.press('Enter', log);
			const modal = await dse.modal('montage-log');
			const submit = modal.control('montage.log.submit');
			await dse.tabTo(submit, 12);
			await dse.waitForWrite(FRESH, () => dse.press('Enter', submit));
			await dse.settle();
			await expect(modal.root).not.toBeExisting();
			expect((await blockOf(FRESH)).entries).toHaveLength(i);
			expect((await focusState()).ctl).toBe(after);
		}
	});

	it('[MONT-F09] a mouse press on End round (focus was not in the montage) takes no focus into it, and the rebuild does not pull any in', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		const before = await focusState();
		expect(before.inMontage).toBe(false);
		await dse.waitForWrite(FRESH, () => dse.click(root.control('montage.bar.end-round')));
		await dse.settle();
		expect((await blockOf(FRESH)).current_round).toBe(2);
		const after = await focusState();
		expect([after.ctl, after.inMontage]).toEqual([before.ctl, before.inMontage]);
	});

	it('[MONT-F10] a window opened with the mouse and closed by a write pulls no focus into the montage', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		await clickChrome(root, 'montage.chrome.add-hero');
		const modal = await dse.modal('montage-add-hero');
		await dse.type(modal.control('montage.add-hero.name'), 'Osric');
		await dse.waitForWrite(FRESH, () => dse.click(modal.control('montage.add-hero.submit')));
		await dse.settle();
		await expect(modal.root).not.toBeExisting();
		expect((await blockOf(FRESH)).participants).toHaveLength(3);
		expect((await focusState()).inMontage).toBe(false);
	});

	it('[MONT-F11] Live Preview: a quick button pressed from the keyboard is followed by the cell it recorded', async () => {
		await dse.openNote(FRESH, { mode: 'live-preview' });
		const root = dse.block(MONTAGE);
		const quick = root.control('montage.quick.success', { nth: 0 });
		await dse.focusByScript(quick);
		await dse.waitForWrite(FRESH, () => dse.press('Enter', quick));
		await dse.settle();
		await browser.pause(1000); // the carry is one-shot: the end state must hold a second after write-idle, not only at it
		expect((await blockOf(FRESH)).entries).toHaveLength(1);
		expect(await dse.focusedControl()).toBe('montage.cell');
	});

	it('[MONT-F12] Live Preview: Enter on Back to round 1 removes Back, and focus lands on End round', async () => {
		await dse.openNote(FRESH, { mode: 'live-preview' });
		const root = dse.block(MONTAGE);
		const end = root.control('montage.bar.end-round');
		await dse.focusByScript(end);
		await dse.waitForWrite(FRESH, () => dse.press('Enter', end));
		await dse.settle();
		const back = root.control('montage.bar.back');
		await dse.focusByScript(back);
		await dse.waitForWrite(FRESH, () => dse.press('Enter', back));
		await dse.settle();
		await browser.pause(1000);
		expect((await blockOf(FRESH)).current_round).toBe(1);
		expect(await dse.focusedControl()).toBe('montage.bar.end-round');
	});

	it('[MONT-F13] Live Preview: Log from the keyboard in the sheet, and after the window closes the Log button of the redrawn montage holds focus', async () => {
		await dse.openNote(FRESH, { mode: 'live-preview' });
		const root = dse.block(MONTAGE);
		const log = root.control('montage.bar.log');
		await dse.focusByScript(log);
		await dse.press('Enter', log);
		const modal = await dse.modal('montage-log');
		const submit = modal.control('montage.log.submit');
		await dse.tabTo(submit, 12);
		await dse.waitForWrite(FRESH, () => dse.press('Enter', submit));
		await dse.settle();
		await browser.pause(1000);
		await expect(modal.root).not.toBeExisting();
		expect((await blockOf(FRESH)).entries).toHaveLength(1);
		expect(await dse.focusedControl()).toBe('montage.bar.log');
	});
});
