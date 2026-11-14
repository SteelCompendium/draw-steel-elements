// SC-438 [B]: the board: the Heroes "+", each hero's "Log an action for <hero>" button, the round cells (click, Enter, Space), the open socket
// of the round in play and its quick trio, a past empty cell, and the pinned hero column of a board that scrolls (SC-326, SC-490).
// Montage/fresh.md: Kira and Bram, round 1 of 3. Montage/mid.md: Kira / Bram / Osric have round 1 filled, Yenna's round 1 is an empty past cell,
// round 2 is in play. Montage/acted.md: both heroes have acted in round 1. Montage/done.md: complete. Montage/wide.md: twelve rounds.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { ACTED, blockOf, cellOf, DONE, dismiss, expectText, FRESH, MID, MONTAGE, modalsOpen, hoverHero, rowAct, TABS, WIDE, WIDE_ENTRIES } from '../../driver/montage';

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
		await hoverHero(root, 'Bram');
		const act = rowAct(root, 1);
		await dse.expectNoWrite(FRESH, () => dse.click(act));
		const modal = await dse.modal('montage-log');
		await expect(title(modal)).toHaveElementProperty('textContent', 'Bram · round 1');
		await expect(eyebrow(modal)).toHaveElementProperty('textContent', 'Log an action');
		await expect(modal.control('montage.log.remove')).not.toBeExisting();
		await dismiss(modal);
	});

	it('[MONT-B03] when the hero has acted in the round in play the same button opens the EDIT sheet of that entry', async () => {
		await dse.openNote(ACTED);
		const root = dse.block(MONTAGE);
		await hoverHero(root, 'Kira');
		const act = rowAct(root, 0);
		await dse.expectNoWrite(ACTED, () => dse.click(act));
		const modal = await dse.modal('montage-log');
		await expect(title(modal)).toHaveElementProperty('textContent', 'Kira · round 1');
		await expect(eyebrow(modal)).toHaveElementProperty('textContent', 'Correct');
		await expect(modal.control('montage.log.skill')).toHaveValue('Nature');
		await dismiss(modal);
	});

	it('[MONT-B04] on a complete montage the row button is disabled: a click opens nothing and writes nothing', async () => {
		await dse.openNote(DONE);
		const root = dse.block(MONTAGE);
		await hoverHero(root, 'Kira');
		const act = rowAct(root, 0);
		await expect(act).toBeDisabled();
		await dse.expectNoWrite(DONE, () => dse.click(act));
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

	/** One quick button on Kira's open socket in Montage/fresh.md: one write, the entry, the tallies, no sheet, the cell filled. */
	async function quickLog(kind: 'success' | 'failure' | 'assist', plusS: number, plusF: number): Promise<void> {
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
	}

	it('[MONT-B10s] the success quick button writes the entry at once: one write, no sheet, a success counted, the cell filled', () => quickLog('success', 1, 0));
	it('[MONT-B10f] the failure quick button writes the entry at once: one write, no sheet, a failure counted, the cell filled', () => quickLog('failure', 0, 1));
	it('[MONT-B10a] the assist quick button writes the entry at once: one write, no sheet, nothing counted, the cell filled', () => quickLog('assist', 0, 0));

	it('[MONT-B11] a quick log on the second hero fills that hero\'s cell only and leaves the first hero\'s socket open', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		await dse.waitForWrite(FRESH, () => dse.click(root.control('montage.quick.failure', { nth: 1 })));
		const b = await blockOf(FRESH);
		expect(b.entries).toEqual([{ hero: 'Bram', round: 1, result: 'failure' }]);
		expect([b.successes, b.failures]).toEqual([0, 1]);
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

	// The board keeps a focused round cell fully inside its frame and clear of the pinned hero column (BoardView `keepFocusedCellInView`). Chromium alone only
	// scrolls a focused element into view when none of it shows, so a cell that sticks out stays partly covered unless the board moves it. B13 guards the
	// handler's right-edge branch (a cell with only 12 px showing at the right edge), B14 its left / pinned-column branch (a cell sticking out under the column).
	const geometry = (round: number): Promise<{ left: number; right: number; frameLeft: number; frameRight: number; pinned: number; scrolled: number }> =>
		dse.page(`(() => {
			const b = document.querySelector('.markdown-reading-view [data-dse-element="montage"] .dse-mt__board');
			const frame = b.getBoundingClientRect();
			const box = b.querySelector('.dse-mt__cell[data-hero="Kira"][data-round="${round}"]').getBoundingClientRect();
			return { left: Math.round(box.left), right: Math.round(box.right), frameLeft: Math.round(frame.left + b.clientLeft), frameRight: Math.round(frame.left + b.clientLeft + b.clientWidth), pinned: Math.round(b.querySelector('.dse-mt__board-corner').getBoundingClientRect().width), scrolled: Math.round(b.scrollLeft) };
		})()`);

	it('[MONT-B13] a real Tab onto a round cell with only 12 px showing at the right edge brings it fully inside the frame', async () => {
		await dse.openNote(WIDE_ENTRIES);
		const root = dse.block(MONTAGE);
		// Scroll by script until 12 px of Kira's round-10 cell show at the right edge, then put focus on her round-5 cell: the next real Tab is the round-10 cell.
		await dse.page(`(() => {
			const b = document.querySelector('.markdown-reading-view [data-dse-element="montage"] .dse-mt__board');
			const frame = b.getBoundingClientRect();
			const right = frame.left + b.clientLeft + b.clientWidth;
			const box = b.querySelector('.dse-mt__cell[data-hero="Kira"][data-round="10"]').getBoundingClientRect();
			b.scrollLeft += box.left - right + 12;
			return true;
		})()`);
		const before = await geometry(10);
		expect(before.left).toBeLessThan(before.frameRight); // partly visible: Chromium would leave it where it is
		expect(before.right).toBeGreaterThan(before.frameRight + 20);
		await dse.focusByScript(cellOf(root, 'Kira', 5));
		await dse.press('Tab'); // to the page: Tab is no pair of any control
		await dse.waitFor(`document.activeElement?.getAttribute('data-round') === '10'`, 'Tab to reach the round-10 cell');
		const g = await geometry(10);
		expect(g.right).toBeLessThanOrEqual(g.frameRight + 1);
	});

	it('[MONT-B14] a real Shift+Tab onto a cell partly under the pinned hero column scrolls it clear of the column', async () => {
		await dse.openNote(WIDE_ENTRIES);
		const root = dse.block(MONTAGE);
		// Scroll by script until Kira's round-4 cell sticks out 20 px under the pinned column, then put focus on her round-5 cell (fully visible to its right).
		await dse.page(`(() => {
			const b = document.querySelector('.markdown-reading-view [data-dse-element="montage"] .dse-mt__board');
			const frame = b.getBoundingClientRect();
			const pinned = b.querySelector('.dse-mt__board-corner').getBoundingClientRect().width;
			const box = b.querySelector('.dse-mt__cell[data-hero="Kira"][data-round="4"]').getBoundingClientRect();
			b.scrollLeft += box.left - (frame.left + b.clientLeft + pinned) + 20;
			return true;
		})()`);
		const before = await geometry(4);
		expect(before.left).toBeLessThan(before.frameLeft + before.pinned - 10); // covered by the pinned column
		expect(before.right).toBeGreaterThan(before.frameLeft + before.pinned);
		await dse.focusByScript(cellOf(root, 'Kira', 5));
		await dse.press('Shift+Tab'); // to the page
		await dse.waitFor(`document.activeElement?.getAttribute('data-round') === '4'`, 'Shift+Tab to reach the round-4 cell');
		const g = await geometry(4);
		expect(g.left).toBeGreaterThanOrEqual(g.frameLeft + g.pinned - 1);
		expect(g.right).toBeLessThanOrEqual(g.frameRight + 1);
	});
});
