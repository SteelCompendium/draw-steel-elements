// SC-495: an IN-NOTE stepper (ds-counter) whose press writes the note and redraws. A keyboard "-" that
// reaches min disables itself while it holds focus; the stepper hands focus to its number field, and that
// focus must survive the write's redraw (the view is adopted into the new section), so the next Tab
// lands on the opposite button. Counter/counter.md: Health 1, min 0, max 3.
import { $, browser, expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const NOTE = 'Counter/counter.md';
const COUNTER = 'ds-counter';

describe('counter: the stepper keeps keyboard focus across the write when "-" reaches min (SC-495)', () => {
	it('[CTR-F01] Enter on "-" at 1 writes 0, focus stays in the stepper (number field, ring shown) after the redraw, and Tab reaches "+"', async () => {
		await dse.openNote(NOTE);
		const root = dse.block(COUNTER);
		const dec = root.control('counter.dec');
		await dse.tabTo(dec, 24);
		const w = await dse.waitForWrite(NOTE, () => dse.press('Enter', dec));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(NOTE, COUNTER).toMatchObject({ current_value: 0 });
		await dse.settle();
		await expect(dec).toBeDisabled();
		expect(await dse.focusedControl()).toBe('counter.input');
		expect(await dse.page<boolean>(`document.activeElement?.matches(':focus-visible') === true`)).toBe(true);
		expect(await dse.page<boolean>(`document.activeElement instanceof HTMLInputElement && document.activeElement.value === '0'`)).toBe(true);
		await dse.press('Tab');
		expect(await dse.focusedControl()).toBe('counter.inc');
	});

	// A note's click shield keeps a button's EARLIER keyboard focus (and its :focus-visible state) through a mouse
	// click, so the press kind must come from the click itself: a mouse press moves nothing, whatever focused the button.
	it('[CTR-F02] Tab to "-" then a MOUSE click to 0: focus does not move into the number field, a wheel over it changes nothing, and clicking away writes nothing more', async () => {
		await dse.openNote(NOTE);
		const root = dse.block(COUNTER);
		const dec = root.control('counter.dec');
		await dse.tabTo(dec, 24); // keyboard focus (the ring) sits on "-"
		const w = await dse.waitForWrite(NOTE, () => dse.click(dec));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(NOTE, COUNTER).toMatchObject({ current_value: 0 });
		await dse.settle();
		await expect(dec).toBeDisabled();
		expect(await dse.focusedControl()).not.toBe('counter.input');
		const input = root.control('counter.input');
		await dse.expectNoWrite(NOTE, async () => {
			for (let i = 0; i < 3; i++) await browser.action('wheel').scroll({ deltaY: -120, origin: await input, duration: 0 }).perform();
			await $('.workspace-leaf.mod-active .markdown-reading-view h1').click(); // click away: a focused field would commit here
		});
		await expect(input).toHaveValue('0');
		await dse.expectNoteBlock(NOTE, COUNTER).toMatchObject({ current_value: 0 });
	});
});
