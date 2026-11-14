// SC-438 [B]: the board: the Heroes "+", each hero's "Log an action for <hero>" button, the round cells (click, Enter, Space), the open socket
// of the round in play and its quick trio, a past empty cell, and the pinned hero column of a board that scrolls (SC-326, SC-490).
// Montage/fresh.md: Kira and Bram, round 1 of 3. Montage/mid.md: Kira / Bram / Osric have round 1 filled, Yenna's round 1 is an empty past cell,
// round 2 is in play. Montage/acted.md: both heroes have acted in round 1. Montage/done.md: complete. Montage/wide.md: twelve rounds.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { ACTED, blockOf, cellOf, DONE, dismiss, expectText, FRESH, MID, MONTAGE, modalsOpen, TABS, WIDE } from '../../driver/montage';

const title = (modal: Awaited<ReturnType<typeof dse.modal>>) => modal.control({ css: '.dse-modal__title-text' });
const eyebrow = (modal: Awaited<ReturnType<typeof dse.modal>>) => modal.control({ css: '.dse-mt__sheet-eyebrow' });

describe('montage: the board controls', () => {
	it('[MONT-B01] the Heroes "+" opens Add a hero and writes nothing', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		await dse.expectNoWrite(FRESH, () => dse.click(root.control('montage.board.add-hero')));
		const modal = await dse.modal('montage-add-hero');
		await expect(title(modal)).toHaveElementProperty('textContent', 'Add a hero');
		await dismiss(modal);
	});

	it('[MONT-B02] "Log an action for <hero>" opens a NEW sheet for that hero and the round in play', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		await dse.expectNoWrite(FRESH, () => dse.click(root.control('montage.board.row-act', { nth: 1 })));
		const modal = await dse.modal('montage-log');
		await expect(title(modal)).toHaveElementProperty('textContent', 'Bram · round 1');
		await expect(eyebrow(modal)).toHaveElementProperty('textContent', 'Log an action');
		await expect(modal.control('montage.log.remove')).not.toBeExisting();
		await dismiss(modal);
	});

	it('[MONT-B03] when the hero has acted in the round in play the same button opens the EDIT sheet of that entry', async () => {
		await dse.openNote(ACTED);
		const root = dse.block(MONTAGE);
		await dse.expectNoWrite(ACTED, () => dse.click(root.control('montage.board.row-act', { nth: 0 })));
		const modal = await dse.modal('montage-log');
		await expect(title(modal)).toHaveElementProperty('textContent', 'Kira · round 1');
		await expect(eyebrow(modal)).toHaveElementProperty('textContent', 'Correct');
		await expect(modal.control('montage.log.skill')).toHaveValue('Nature');
		await dismiss(modal);
	});

	it('[MONT-B04] on a complete montage the row button is disabled: a click opens nothing and writes nothing', async () => {
		await dse.openNote(DONE);
		const root = dse.block(MONTAGE);
		await expect(root.control('montage.board.row-act', { nth: 0 })).toBeDisabled();
		await dse.expectNoWrite(DONE, () => dse.click(root.control('montage.board.row-act', { nth: 0 })));
		expect(await modalsOpen()).toBe(0);
	});

	it('[MONT-B05] a click on a filled cell opens the edit sheet pre-filled with its result, skill and note', async () => {
		await dse.openNote(MID);
		const root = dse.block(MONTAGE);
		await dse.expectNoWrite(MID, () => dse.click(root.control('montage.cell', { nth: 1 }))); // Bram round 1: a failure with Endurance and a note
		const modal = await dse.modal('montage-log');
		await expect(title(modal)).toHaveElementProperty('textContent', 'Bram · round 1');
		await expect(eyebrow(modal)).toHaveElementProperty('textContent', 'Correct');
		await expect(modal.control('montage.log.result.failure')).toHaveAttribute('aria-pressed', 'true');
		await expect(modal.control('montage.log.skill')).toHaveValue('Endurance');
		await expect(modal.control('montage.log.note')).toHaveValue('Dropped the water cask.');
		await dismiss(modal);
	});

	it('[MONT-B06] Enter on a focused cell opens its edit sheet', async () => {
		await dse.openNote(MID);
		const root = dse.block(MONTAGE);
		const cell = root.control('montage.cell', { nth: 0 });
		await dse.tabTo(cell, TABS);
		await dse.expectNoWrite(MID, () => dse.press('Enter', cell));
		const modal = await dse.modal('montage-log');
		await expect(title(modal)).toHaveElementProperty('textContent', 'Kira · round 1');
		await dismiss(modal);
	});

	it('[MONT-B07] Space on a focused cell opens its edit sheet', async () => {
		await dse.openNote(MID);
		const root = dse.block(MONTAGE);
		const cell = root.control('montage.cell', { nth: 2 });
		await dse.tabTo(cell, TABS);
		await dse.expectNoWrite(MID, () => dse.press('Space', cell));
		const modal = await dse.modal('montage-log');
		await expect(title(modal)).toHaveElementProperty('textContent', 'Osric · round 1');
		await dismiss(modal);
	});

	it('[MONT-B08] an empty cell of a played round opens a NEW sheet for its own round, which says the round is already played', async () => {
		await dse.openNote(MID);
		const root = dse.block(MONTAGE);
		await dse.expectNoWrite(MID, () => dse.click(root.control('montage.cell', { nth: 3 }))); // Yenna round 1
		const modal = await dse.modal('montage-log');
		await expect(title(modal)).toHaveElementProperty('textContent', 'Yenna · round 1');
		await expect(modal.control({ css: '.dse-mt__sheet-sub' })).toHaveElementProperty('textContent', 'a round already played');
		await expect(eyebrow(modal)).toHaveElementProperty('textContent', 'Log an action');
		await dismiss(modal);
	});

	it('[MONT-B09] a click on the open socket (its edge, not the quick buttons) opens a NEW sheet for the round in play', async () => {
		await dse.openNote(MID);
		const root = dse.block(MONTAGE);
		await dse.expectNoWrite(MID, () => dse.click(root.control('montage.cell.socket', { nth: 0 }), { inset: 3 })); // Kira round 2
		const modal = await dse.modal('montage-log');
		await expect(title(modal)).toHaveElementProperty('textContent', 'Kira · round 2');
		await expect(modal.control({ css: '.dse-mt__sheet-sub' })).toHaveElementProperty('textContent', 'the round in play');
		await dismiss(modal);
	});

	for (const [kind, plusS, plusF] of [['success', 1, 0], ['failure', 0, 1], ['assist', 0, 0]] as const) {
		it(`[MONT-B10${kind[0]}] the ${kind} quick button writes the entry at once: one write, no sheet, tallies +${plusS} / +${plusF}, the cell filled`, async () => {
			await dse.openNote(FRESH);
			const root = dse.block(MONTAGE);
			const w = await dse.waitForWrite(FRESH, () => dse.click(root.control(`montage.quick.${kind}`, { nth: 0 })));
			expect(w.count).toBe(1);
			const b = await blockOf(FRESH);
			expect(b.entries).toEqual([{ hero: 'Kira', round: 1, result: kind }]);
			expect([b.successes, b.failures]).toEqual([plusS, plusF]);
			expect(b.participants![0].skills_used).toEqual([]);
			await expect(cellOf(root, 'Kira', 1)).toHaveAttribute('data-kind', kind);
			await expect(root.control('montage.cell.socket', { nth: 0 })).toBeExisting(); // Bram's socket is still open
			expect(await modalsOpen()).toBe(0);
		});
	}

	it('[MONT-B11] a quick log on the second hero fills that hero\'s cell only and leaves the first hero\'s socket open', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		await dse.waitForWrite(FRESH, () => dse.click(root.control('montage.quick.failure', { nth: 1 })));
		expect((await blockOf(FRESH)).entries).toEqual([{ hero: 'Bram', round: 1, result: 'failure' }]);
		await expect(cellOf(root, 'Kira', 1)).toHaveAttribute('data-kind', 'none');
		await expect(cellOf(root, 'Bram', 1)).toHaveAttribute('data-kind', 'failure');
	});
});

describe('montage: a board wider than its frame (SC-326, SC-490)', () => {
	const board = (): Promise<{ left: number; overflow: string | null; nameLeft: number; frameLeft: number; scrollable: boolean }> =>
		dse.page(`(() => {
			const b = document.querySelector('.markdown-reading-view [data-dse-element="montage"] .dse-mt__board');
			const name = b.querySelector('.dse-mt__board-name');
			return { left: b.scrollLeft, overflow: b.getAttribute('data-overflow'), nameLeft: Math.round(name.getBoundingClientRect().left), frameLeft: Math.round(b.getBoundingClientRect().left + b.clientLeft), scrollable: b.scrollWidth > b.clientWidth };
		})()`);

	it('[MONT-B12] the hero column stays pinned to the frame while the board scrolls, and the scroll position survives a write', async () => {
		await dse.openNote(WIDE);
		const root = dse.block(MONTAGE);
		const before = await board();
		expect(before.scrollable).toBe(true);
		expect(before.overflow).toBe('on');
		await dse.page(`(() => { const b = document.querySelector('.markdown-reading-view [data-dse-element="montage"] .dse-mt__board'); b.scrollLeft = 300; })()`);
		await dse.waitFor(`document.querySelector('.markdown-reading-view [data-dse-element="montage"] .dse-mt__board').scrollLeft > 0`, 'the board to scroll');
		const scrolled = await board();
		expect(scrolled.left).toBeGreaterThan(0);
		expect(scrolled.nameLeft).toBe(scrolled.frameLeft); // pinned: the name cell has not moved with the scroll
		await dse.waitForWrite(WIDE, () => dse.click(root.control('montage.bar.end-round')));
		await dse.settle();
		await expectText(root.control({ css: '.dse-head__eyebrow--right' }), 'Round 2 / 12');
		await dse.waitFor(`document.querySelector('.markdown-reading-view [data-dse-element="montage"] .dse-mt__board').scrollLeft > 0`, 'the scroll position to be carried across the write');
		const after = await board();
		expect(Math.abs(after.left - scrolled.left)).toBeLessThanOrEqual(2);
		expect(after.nameLeft).toBe(after.frameLeft);
	});
});
