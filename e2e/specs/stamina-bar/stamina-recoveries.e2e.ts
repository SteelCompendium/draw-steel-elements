// SC-408 pilot: ds-stamina-bar's Recoveries strip (markers, Catch Breath, the optional popover
// editor, the undo toast) and the modal's Spend Recovery action.
//   recoveries.md       12/30, no temp, 3 of 6 Recoveries (recovery value 10)
//   recoveries-full.md  30/30, 3 of 6      recoveries-zero.md  12/30, 0 of 6
//   dying.md            -2/30, 3 of 6      legacy-low.md       2/30, Recoveries not tracked
//   info-string.md      12/30, 3 of 6, fence line "```ds-stamina-bar  extra words" (SC-290)
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { applyAmount, applyAndWrite, expectApplyLabel, noticeTexts, openBarModal } from '../../driver/stamina';

const REC = 'Stamina/recoveries.md';
const BAR = 'ds-stamina-bar';
const filledPips = (): Promise<number> => dse.page<number>(`document.querySelectorAll('.markdown-reading-view .dse-stamina-rec__pip--filled').length`);
const sliderNow = (): Promise<string | null> => dse.page<string | null>(`document.querySelector('.markdown-reading-view .dse-stamina-rec__pips').getAttribute('aria-valuenow')`);

/** Does the focused element show its keyboard focus ring (:focus-visible)? */
const focusRing = (): Promise<boolean> => dse.page<boolean>(`document.activeElement?.matches(':focus-visible') === true`);

async function openRec(note: string) {
	await dse.openNote(note);
	return dse.block(BAR);
}

describe('ds-stamina-bar: Catch Breath', () => {
	it('[RECOV-R01] Catch Breath heals the recovery value, spends one Recovery, posts an undo toast, one write', async () => {
		const bar = await openRec(REC);
		const w = await dse.waitForWrite(REC, () => dse.click(bar.control('recov.catch-breath')));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(REC, BAR).toMatchObject({ current_stamina: 22, recoveries: 2, recoveries_max: 6 });
		expect(await filledPips()).toBe(2);
		await dse.waitFor(`document.querySelector('.notice')?.textContent.includes('Caught breath: +10 Stamina')`, 'the undo toast');
		expect((await noticeTexts()).join(' ')).toContain('−1 Recovery');
	});

	// SC-290: the write-back used to re-emit the opening fence as fence + first token only.
	it('[RECOV-I01] a write keeps the extra words (and their spacing) on the opening fence line', async () => {
		const note = 'Stamina/info-string.md';
		const bar = await openRec(note);
		const w = await dse.waitForWrite(note, () => dse.click(bar.control('recov.catch-breath')));
		expect(w.count).toBe(1);
		// (expectNoteBlock only reads bare-language fences, so read the raw lines.)
		const lines = (await dse.noteText(note)).split('\n');
		expect(lines).toContain('```ds-stamina-bar  extra words');
		expect(lines).toContain('current_stamina: 22');
		expect(lines).toContain('recoveries: 2');
	});

	it('[RECOV-R02a] Catch Breath is really disabled with no Recoveries left and a click writes nothing', async () => {
		const bar = await openRec('Stamina/recoveries-zero.md');
		await expect(bar.control('recov.catch-breath')).toBeDisabled();
		await dse.expectNoWrite('Stamina/recoveries-zero.md', () => dse.click(bar.control('recov.catch-breath')));
		await dse.expectNoteBlock('Stamina/recoveries-zero.md', BAR).toMatchObject({ current_stamina: 12, recoveries: 0 });
	});

	it('[RECOV-R02b] Catch Breath is really disabled while dying (RR: "Can\'t Catch Breath")', async () => {
		const bar = await openRec('Stamina/dying.md');
		await expect(bar.control('recov.catch-breath')).toBeDisabled();
		await dse.expectNoWrite('Stamina/dying.md', () => dse.click(bar.control('recov.catch-breath')));
	});

	// R03 / S1 B4 (SC-428, fixed): at full Stamina a press would heal 0 yet still spend a Recovery. The
	// button is really disabled now, with the reason the modal's Spend Recovery gives (STAM-Q10).
	it('[RECOV-R03] Catch Breath at full Stamina is disabled, says why, and a click writes nothing', async () => {
		const note = 'Stamina/recoveries-full.md';
		const bar = await openRec(note);
		await expect(bar.control('recov.catch-breath')).toBeDisabled();
		await expect(bar.control('recov.catch-breath')).toHaveAttribute('aria-label', 'Catch Breath: Already at maximum Stamina');
		await dse.expectNoWrite(note, () => dse.click(bar.control('recov.catch-breath')));
		await dse.expectNoteBlock(note, BAR).toMatchObject({ current_stamina: 30, recoveries: 3 });
	});

	it('[RECOV-R06] the undo toast restores Stamina and the Recovery, once', async () => {
		const bar = await openRec(REC);
		const first = await dse.waitForWrite(REC, () => dse.click(bar.control('recov.catch-breath')));
		expect(first.count).toBe(1);
		await dse.expectNoteBlock(REC, BAR).toMatchObject({ current_stamina: 22, recoveries: 2 });
		// The toast the Catch Breath just posted (the newest one, once it has stopped sliding in).
		await dse.waitFor(`!!document.querySelector('.notice-container .notice:last-child .dse-undo-notice__action')`, 'the undo toast');
		const undo = await dse.waitForWrite(REC, async () => {
			await dse.click(dse.toast().control('undo.action'), { stable: true });
			// Clicking Undo dismisses the toast within a moment; it must not be left to expire on its own (8 s).
			await expect(dse.toast().root).not.toBeExisting({ wait: 1000, message: 'the Undo toast should dismiss itself when Undo is clicked' });
		});
		expect(undo.count).toBe(1);
		await dse.expectNoteBlock(REC, BAR).toMatchObject({ current_stamina: 12, recoveries: 3 });
		expect(await filledPips()).toBe(3);
	});

	it('[RECOV-W03] a modal Apply refreshes the Winded / Dying badge and Catch Breath state in place', async () => {
		const modal = await openBarModal(REC); // 12/30 is Winded (<= 15)
		// The Steel theme carries the state on the cluster (the strip's own badge is Legacy-only).
		const state = dse.control({ css: '.markdown-reading-view .dse-stamina__cluster' });
		await expect(state).toHaveAttribute('data-state', 'winded');
		await applyAmount(modal, '10', 'sedit.healing');
		await applyAndWrite(modal, REC);
		await expect(state).toHaveAttribute('data-state', 'healthy'); // 22/30
		await expect(dse.block(BAR).control('recov.catch-breath')).toBeEnabled();
		const m2 = await (async () => {
			await dse.click(dse.block(BAR).control('stamina.bar'));
			return dse.modal('stamina-edit');
		})();
		await dse.click(m2.control('sedit.kill'));
		await applyAndWrite(m2, REC);
		await expect(state).toHaveAttribute('data-state', 'dying');
		await expect(dse.block(BAR).control('recov.catch-breath')).toBeDisabled();
	});
});

describe('ds-stamina-bar: Recoveries markers (Model M: a click sets the count)', () => {
	it('[RECOV-R04] clicking a marker sets the count: later ones restore up to it, earlier ones spend down to it', async () => {
		const bar = await openRec(REC); // 3 of 6
		await dse.click(bar.control('recov.marker', { nth: 4 })); // the 5th marker -> 5
		expect(await sliderNow()).toBe('5');
		await dse.click(bar.control('recov.marker', { nth: 1 })); // the 2nd marker, available -> spends down to 1
		expect(await sliderNow()).toBe('1');
		await dse.settle();
		await dse.expectNoteBlock(REC, BAR).toMatchObject({ recoveries: 1, current_stamina: 12 });
		expect(await filledPips()).toBe(1);
	});

	it('[RECOV-R05] the marker row is one keyboard slider: arrows step, Home / End jump', async () => {
		const bar = await openRec(REC); // 3 of 6
		await dse.click(bar.control('recov.marker', { nth: 2 })); // the 3rd marker is available -> 2
		const row = bar.control('recov.markers');
		// SC-428: the marker click left focus on the row, so the keys go straight to it.
		await dse.press('ArrowRight', row);
		expect(await sliderNow()).toBe('3');
		await dse.press('ArrowLeft', row);
		await dse.press('ArrowLeft', row);
		expect(await sliderNow()).toBe('1');
		await dse.press('Home', row);
		expect(await sliderNow()).toBe('0');
		await dse.press('End', row);
		expect(await sliderNow()).toBe('6');
		await dse.press('Escape', row); // no popover open: harmless
		await dse.settle();
		await dse.expectNoteBlock(REC, BAR).toMatchObject({ recoveries: 6 });
	});
});

describe('ds-stamina-bar: keyboard focus after a marker click (SC-428)', () => {
	// The element click shield preventDefaults every press inside a card, so the browser never moved
	// focus on a marker click; the strip now focuses its slider row itself. The click's write then
	// re-draws the section and the view is adopted into it, which must not drop that focus either.
	it('[RECOV-R10] a marker click leaves focus on the marker row, through the write, and Tab continues from it', async () => {
		const bar = await openRec(REC); // 3 of 6
		const row = bar.control('recov.markers');
		await dse.click(bar.control('recov.marker', { nth: 4 })); // -> 5
		expect(await dse.focusedControl()).toBe('recov.markers');
		// A MOUSE click draws no focus ring (:focus-visible), right after and after the write.
		expect(await focusRing()).toBe(false);
		await dse.settle(); // the write + the adoption re-draw have happened
		expect(await dse.focusedControl()).toBe('recov.markers');
		expect(await focusRing()).toBe(false);
		await dse.press('ArrowLeft', row); // an arrow key lands on the row with no Tab first
		expect(await sliderNow()).toBe('4');
		await dse.press('Tab', row); // and Tab moves on to the NEXT control after the row, not back to the page
		expect(await dse.focusedControl()).toBe('recov.catch-breath');
		await dse.settle();
	});

	// A keyboard Catch Breath that fills Stamina disables the button while it holds focus; real Chromium
	// drops focus to <body> then, so the strip hands it to the marker row (review M1).
	it('[RECOV-R11] a keyboard Catch Breath that reaches full Stamina leaves focus on the marker row, not <body>', async () => {
		const bar = await openRec(REC); // 12/30, recovery value 10
		const cb = bar.control('recov.catch-breath');
		await dse.tabTo(cb);
		await dse.press('Enter', cb); // 22/30: still enabled, focus stays through the write
		await dse.settle();
		await dse.expectNoteBlock(REC, BAR).toMatchObject({ current_stamina: 22, recoveries: 2 });
		expect(await dse.focusedControl()).toBe('recov.catch-breath');
		await dse.press('Enter', cb); // 30/30: the button disables itself
		await expect(cb).toBeDisabled();
		expect(await dse.focusedControl()).toBe('recov.markers');
		await dse.settle();
		expect(await dse.focusedControl()).toBe('recov.markers');
		await dse.expectNoteBlock(REC, BAR).toMatchObject({ current_stamina: 30, recoveries: 1 });
	});
});

describe('modal Spend Recovery', () => {
	it('[STAM-Q06] Spend Recovery heals the recovery value and spends one Recovery on Apply', async () => {
		const modal = await openBarModal(REC);
		await dse.click(modal.control('sedit.spend-recovery'));
		await expectApplyLabel(modal, 'Gain 10 Stamina');
		expect(await applyAndWrite(modal, REC)).toBe(1);
		await dse.expectNoteBlock(REC, BAR).toMatchObject({ current_stamina: 22, recoveries: 2 }); // Q07
	});

	it('[STAM-Q08] two presses heal twice (the second capped at max) and spend two Recoveries', async () => {
		const modal = await openBarModal(REC);
		await dse.click(modal.control('sedit.spend-recovery'));
		await dse.click(modal.control('sedit.spend-recovery'));
		await dse.click(modal.control('sedit.spend-recovery'));
		await expectApplyLabel(modal, 'Gain 18 Stamina'); // 12 -> 22 -> 30 (capped); the 3rd press is a no-gain
		await expect(modal.control('sedit.spend-recovery')).toBeDisabled();
		expect(await applyAndWrite(modal, REC)).toBe(1);
		await dse.expectNoteBlock(REC, BAR).toMatchObject({ current_stamina: 30, recoveries: 1 });
	});

	it('[STAM-Q09] Spend Recovery is really disabled with none left, with the reason, and a click does nothing', async () => {
		const modal = await openBarModal('Stamina/recoveries-zero.md');
		const btn = modal.control('sedit.spend-recovery');
		await expect(btn).toBeDisabled();
		await expect(btn).toHaveAttribute('aria-label', 'Spend Recovery: No Recoveries remaining');
		await dse.click(btn);
		await expectApplyLabel(modal, 'No Stamina Change');
		await dse.click(modal.control('modal.close'));
	});

	it('[STAM-Q10] Spend Recovery is disabled at full Stamina with the reason', async () => {
		const modal = await openBarModal('Stamina/recoveries-full.md');
		const btn = modal.control('sedit.spend-recovery');
		await expect(btn).toBeDisabled();
		await expect(btn).toHaveAttribute('aria-label', 'Spend Recovery: Already at maximum Stamina');
		await dse.click(modal.control('modal.close'));
	});

	it('[STAM-R1X] Reset also returns a pending Spend Recovery: nothing is spent when only a later edit is applied', async () => {
		const modal = await openBarModal(REC); // 12/30, 3 Recoveries
		await dse.click(modal.control('sedit.spend-recovery'));
		await expectApplyLabel(modal, 'Gain 10 Stamina');
		await dse.click(modal.control('sedit.reset')); // F05: the pending Recovery goes back too
		await expectApplyLabel(modal, 'No Stamina Change');
		await expect(modal.control('sedit.spend-recovery')).toBeEnabled();
		await applyAmount(modal, '5', 'sedit.healing');
		await expectApplyLabel(modal, 'Gain 5 Stamina');
		expect(await applyAndWrite(modal, REC)).toBe(1);
		await dse.expectNoteBlock(REC, BAR).toMatchObject({ current_stamina: 17, recoveries: 3 });
	});

	// Q13 / S1 B5, ruled (SC-432): for a hero with no pool to spend from, the quick action stays a plain
	// "heal one Recovery's worth" shortcut, relabelled so it does not claim to spend anything, behind a
	// confirmation shown on the FIRST press of a modal session. Nothing is staged until the user confirms.
	// legacy-low.md: 2/30, no recoveries fields; recovery value 10.
	const FREE = 'Stamina/legacy-low.md';
	const FREE_TIP = 'Heal Recovery Value: Spends no Recovery';

	it('[STAM-Q13] a hero bar with no pool: the button says it heals, the first press asks, Confirm stages the heal, later presses do not ask again, and nothing is spent', async () => {
		const modal = await openBarModal(FREE);
		const heal = modal.control('sedit.spend-recovery');
		await expect(heal).toHaveText('Heal Recovery Value');
		await expect(heal).toHaveAttribute('aria-label', FREE_TIP);
		await dse.click(heal);
		const dialog = await dse.modal('free-heal-confirm');
		await expect(dialog.control({ css: '.dse-modal__title-text' })).toHaveText('Heal without spending a Recovery?', { ignoreCase: true });
		expect(await dialog.control({ css: '.dse-modal__body p' }).getText()).toContain('no Recovery to spend');
		await expectApplyLabel(modal, 'No Stamina Change'); // asked BEFORE anything is staged
		await dse.click(dialog.control('sedit.free-heal.confirm'));
		await expect(dialog.root).not.toBeExisting();
		await expectApplyLabel(modal, 'Gain 10 Stamina');
		await dse.click(heal);
		await dse.click(heal);
		expect(await dse.page<number>(`document.querySelectorAll('.modal-container .dse-modal').length`)).toBe(1); // no second dialog
		await expectApplyLabel(modal, 'Gain 28 Stamina'); // 2 -> 12 -> 22 -> 30 (the third capped at max), S1 B5
		await expect(heal).toBeDisabled(); // full: no gain left
		await expect(heal).toHaveAttribute('aria-label', 'Heal Recovery Value: Already at maximum Stamina');
		expect(await applyAndWrite(modal, FREE)).toBe(1);
		const block = (await dse.expectNoteBlock(FREE, BAR).value()) as Record<string, unknown>;
		expect(block).toMatchObject({ current_stamina: 30 });
		expect(block).not.toHaveProperty('recoveries');
		expect(block).not.toHaveProperty('recoveries_max');
	});

	it('[STAM-Q13C] Cancel on the confirmation adds nothing: the modal stays open, a pending edit survives, the next press asks again, no write', async () => {
		const modal = await openBarModal(FREE);
		await applyAmount(modal, '1', 'sedit.damage');
		await expectApplyLabel(modal, 'Lose 1 Stamina');
		await dse.click(modal.control('sedit.spend-recovery'));
		const dialog = await dse.modal('free-heal-confirm');
		await dse.click(dialog.control('sedit.free-heal.cancel'));
		await expect(dialog.root).not.toBeExisting();
		await expect(modal.root).toBeExisting();
		await expectApplyLabel(modal, 'Lose 1 Stamina'); // untouched by the cancelled heal
		await dse.click(modal.control('sedit.spend-recovery'));
		const again = await dse.modal('free-heal-confirm'); // a Cancel does not count as "asked"
		await dse.click(again.control('sedit.free-heal.cancel'));
		await dse.expectNoWrite(FREE, () => dse.click(modal.control('modal.close')));
		await dse.expectNoteBlock(FREE, BAR).toMatchObject({ current_stamina: 2 });
	});

	// SC-431 made Escape back out of the innermost thing. The confirmation is a second Obsidian modal: its
	// Scope is the top of the stack, so Escape must close only it (a regression here would drop the whole edit).
	it('[STAM-Q13E] Escape on the confirmation closes only the confirmation: the stamina modal and its pending edit stay, and Apply still writes it', async () => {
		const modal = await openBarModal(FREE);
		await applyAmount(modal, '1', 'sedit.damage');
		await dse.click(modal.control('sedit.spend-recovery'));
		const dialog = await dse.modal('free-heal-confirm');
		await dse.expectNoWrite(FREE, () => dse.press('Escape', dse.aimedAt('modal.close')));
		await expect(dialog.root).not.toBeExisting();
		await expect(modal.root).toBeExisting();
		await expectApplyLabel(modal, 'Lose 1 Stamina');
		expect(await applyAndWrite(modal, FREE)).toBe(1);
		const block = (await dse.expectNoteBlock(FREE, BAR).value()) as Record<string, unknown>;
		expect(block).toMatchObject({ current_stamina: 1 });
		expect(block).not.toHaveProperty('recoveries');
	});

	it('[STAM-Q13P] a hero WITH a pool is unchanged: still "Spend Recovery", the first press stages at once with no dialog', async () => {
		const modal = await openBarModal(REC);
		const spend = modal.control('sedit.spend-recovery');
		await expect(spend).toHaveText('Spend Recovery');
		await expect(spend).toHaveAttribute('aria-label', 'Spend Recovery');
		await dse.click(spend);
		await expectApplyLabel(modal, 'Gain 10 Stamina');
		expect(await dse.page<number>(`document.querySelectorAll('.modal-container .dse-modal').length`)).toBe(1);
		expect(await applyAndWrite(modal, REC)).toBe(1);
		await dse.expectNoteBlock(REC, BAR).toMatchObject({ current_stamina: 22, recoveries: 2 });
	});
});

describe('ds-stamina-bar: the optional Recoveries popover editor (preference on)', () => {
	before(async () => {
		await dse.setPrefs({ staminaRecoveryPopover: true });
	});
	after(async () => {
		await dse.setPrefs({});
	});

	it('[RECOV-R07] a marker click opens a popover instead of committing; its buttons commit', async () => {
		const bar = await openRec(REC); // 3 of 6
		await dse.click(bar.control('recov.marker', { nth: 4 }));
		await expect(dse.control({ css: '.dse-stamina-rec__pop' })).toBeDisplayed();
		expect(await sliderNow()).toBe('3'); // nothing committed yet
		await dse.click(bar.control('recov.pop.dec'));
		expect(await sliderNow()).toBe('2');
		await dse.click(bar.control('recov.pop.inc'));
		await dse.click(bar.control('recov.pop.inc'));
		expect(await sliderNow()).toBe('4');
		const w = await dse.waitForWrite(REC, () => dse.click(bar.control('recov.pop.catch-breath')));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(REC, BAR).toMatchObject({ current_stamina: 22, recoveries: 3 }); // 4 - 1 spent by Catch Breath
		await expect(dse.control({ css: '.dse-stamina-rec__pop' })).not.toBeExisting(); // Catch breath closes it
	});

	// Pressing the popover's Catch breath with the keyboard closes the popover and removes the focused button;
	// focus returns to the marker row (the popover's trigger) instead of falling to <body> (review INFO).
	it('[RECOV-R12] the popover Catch breath pressed from the keyboard closes the popover and returns focus to the marker row', async () => {
		const bar = await openRec(REC); // 3 of 6
		await dse.click(bar.control('recov.marker', { nth: 4 }));
		await expect(dse.control({ css: '.dse-stamina-rec__pop' })).toBeDisplayed();
		const cb = bar.control('recov.pop.catch-breath');
		await dse.tabTo(cb);
		const w = await dse.waitForWrite(REC, () => dse.press('Enter', cb));
		expect(w.count).toBe(1);
		await expect(dse.control({ css: '.dse-stamina-rec__pop' })).not.toBeExisting();
		expect(await dse.focusedControl()).toBe('recov.markers');
		await dse.settle();
		expect(await dse.focusedControl()).toBe('recov.markers');
	});

	it('[RECOV-R09] Escape closes the popover', async () => {
		const bar = await openRec(REC);
		await dse.click(bar.control('recov.marker', { nth: 4 }));
		await expect(dse.control({ css: '.dse-stamina-rec__pop' })).toBeDisplayed();
		await dse.press('Escape', bar.control('recov.markers')); // SC-428: the click already focused the row
		await expect(dse.control({ css: '.dse-stamina-rec__pop' })).not.toBeExisting();
		await dse.expectNoWrite(REC, async () => undefined);
	});

	// R08 / S1 B15 (SC-428, fixed): the popover's "Catch breath" is really disabled whenever the strip's
	// Catch Breath is, with the same reason, and a click on it writes nothing.
	it('[RECOV-R08] the popover Catch breath is disabled with no Recoveries left, says why, and a click writes nothing', async () => {
		const note = 'Stamina/recoveries-zero.md';
		const bar = await openRec(note);
		await dse.click(bar.control('recov.marker', { nth: 0 }));
		await expect(dse.control({ css: '.dse-stamina-rec__pop' })).toBeDisplayed();
		await expect(bar.control('recov.pop.catch-breath')).toBeDisabled();
		await expect(bar.control('recov.pop.catch-breath')).toHaveAttribute('aria-label', 'Catch breath: No Recoveries remaining');
		await expect(bar.control('recov.catch-breath')).toHaveAttribute('aria-label', 'Catch Breath: No Recoveries remaining');
		await dse.expectNoWrite(note, () => dse.click(bar.control('recov.pop.catch-breath')));
		await expect(dse.control({ css: '.dse-stamina-rec__pop' })).toBeDisplayed(); // a no-op leaves the popover open
	});
});
