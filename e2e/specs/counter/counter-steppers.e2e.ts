// SC-442: the counter's two buttons in real Obsidian, beyond the focus work of SC-495 / SC-602 (counter-focus*.e2e.ts): Space on the focused
// button, and a click on a button that is disabled at its limit. Each drive asserts the NOTE (the block's values; never the fence text, the plugin
// re-serializes key order) and the SCREEN (the shown value and each button's disabled state). The combinations of limits are the jsdom matrix's
// (test/dom/elements/counter-matrix.test.ts). Counter/counter.md: Health 1, min 0, max 3. at-max.md: 3 of 3. at-min.md: 0 of 0..3.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const COUNTER = 'ds-counter';

describe('counter: Space on a focused button, and a click on a disabled one', () => {
	it('[CTR-S01] Space on the focused "+" at 1 writes 2 once, and the screen shows 2 with both buttons enabled', async () => {
		const note = 'Counter/counter.md';
		await dse.openNote(note);
		const root = dse.block(COUNTER);
		const inc = root.control('counter.inc');
		await dse.tabTo(inc, 24);
		const w = await dse.waitForWrite(note, () => dse.press('Space', inc));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(note, COUNTER).toMatchObject({ current_value: 2, max_value: 3, min_value: 0, name: 'Health' });
		await dse.settle();
		await expect(root.control('counter.input')).toHaveValue('2');
		await expect(root.control('counter.dec')).toBeEnabled();
		await expect(root.control('counter.inc')).toBeEnabled();
	});

	it('[CTR-S02] Space on the focused "-" at 1 writes 0, "-" disables itself, and focus moves into the number field (the keyboard hand-off of SC-495 is the same for Space)', async () => {
		const note = 'Counter/counter.md';
		await dse.openNote(note);
		const root = dse.block(COUNTER);
		const dec = root.control('counter.dec');
		await dse.tabTo(dec, 24);
		const w = await dse.waitForWrite(note, () => dse.press('Space', dec));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(note, COUNTER).toMatchObject({ current_value: 0, max_value: 3, min_value: 0 });
		await dse.settle();
		await expect(root.control('counter.input')).toHaveValue('0');
		await expect(root.control('counter.dec')).toBeDisabled();
		await expect(root.control('counter.inc')).toBeEnabled();
		expect(await dse.focusedControl()).toBe('counter.input');
	});

	it('[CTR-S03] a click on "+" at the max (3 of 3) is a click on a disabled button: nothing is written and the screen does not change', async () => {
		const note = 'Counter/at-max.md';
		await dse.openNote(note);
		const root = dse.block(COUNTER);
		await expect(root.control('counter.inc')).toBeDisabled();
		await dse.expectNoWrite(note, () => dse.click(root.control('counter.inc')));
		await dse.expectNoteBlock(note, COUNTER).toMatchObject({ current_value: 3, max_value: 3, min_value: 0 });
		await expect(root.control('counter.input')).toHaveValue('3');
		await expect(root.control('counter.inc')).toBeDisabled();
		await expect(root.control('counter.dec')).toBeEnabled();
	});

	it('[CTR-S04] a click on "-" at the min (0 of 0..3) is a click on a disabled button: nothing is written and the screen does not change', async () => {
		const note = 'Counter/at-min.md';
		await dse.openNote(note);
		const root = dse.block(COUNTER);
		await expect(root.control('counter.dec')).toBeDisabled();
		await dse.expectNoWrite(note, () => dse.click(root.control('counter.dec')));
		await dse.expectNoteBlock(note, COUNTER).toMatchObject({ current_value: 0, max_value: 3, min_value: 0 });
		await expect(root.control('counter.input')).toHaveValue('0');
		await expect(root.control('counter.dec')).toBeDisabled();
		await expect(root.control('counter.inc')).toBeEnabled();
	});
});
