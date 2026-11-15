// SC-442: the counter's wrong-value and out-of-range behaviour in real Obsidian. The knownBug tests encode the CORRECT behaviour (each passes while its
// ticket's bug exists and fails the moment a fix lands: remove the marker then); each asserts only the outcome any reasonable fix must produce.
//   SC-671 a write deletes the keys the counter does not know      SC-672 a non-map block is overwritten; an empty block shows a raw TypeError
//   SC-673 focus + blur / Enter in the untouched box rewrites an out-of-range value      SC-674 a quoted number jumps to the max on "+"
import { $, expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';

const COUNTER = 'ds-counter';
const away = () => $('.workspace-leaf.mod-active .markdown-reading-view h1');

describe('counter: a value a hand edit left past its limit (Counter/out-of-range.md: Health 25, min 0, max 20)', () => {
	const NOTE = 'Counter/out-of-range.md';

	it('[CTR-V03] the card shows the value as stored (25) with "+" disabled, and "-" steps ONE toward the range: 24, written once', async () => {
		await dse.openNote(NOTE);
		const root = dse.block(COUNTER);
		await expect(root.control('counter.input')).toHaveValue('25');
		await expect(root.control('counter.inc')).toBeDisabled();
		await expect(root.control('counter.dec')).toBeEnabled();
		const w = await dse.waitForWrite(NOTE, () => dse.click(root.control('counter.dec')));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(NOTE, COUNTER).toMatchObject({ current_value: 24, max_value: 20, min_value: 0 });
		await dse.settle();
		await expect(root.control('counter.input')).toHaveValue('24');
		await expect(root.control('counter.inc')).toBeDisabled();
	});

	knownBug('SC-673', '[CTR-V01] focusing the number box and clicking away leaves the note alone: 25 stays 25', async () => {
		await dse.openNote(NOTE);
		const root = dse.block(COUNTER);
		const input = root.control('counter.input');
		await dse.type(input, '', { replace: true }); // a real click into the box and select-all: the draft stays the stored 25
		await dse.expectNoWrite(NOTE, () => dse.blur(input, away()));
		await dse.expectNoteBlock(NOTE, COUNTER).toMatchObject({ current_value: 25 });
		await expect(input).toHaveValue('25');
	});

	knownBug('SC-673', '[CTR-V02] Enter in the untouched number box leaves the note alone: 25 stays 25', async () => {
		await dse.openNote(NOTE);
		const root = dse.block(COUNTER);
		const input = root.control('counter.input');
		await dse.type(input, '', { replace: true }); // a real click into the box and select-all: the draft stays the stored 25
		await dse.expectNoWrite(NOTE, () => dse.press('Enter', input));
		await dse.expectNoteBlock(NOTE, COUNTER).toMatchObject({ current_value: 25 });
		await expect(input).toHaveValue('25');
	});
});

describe('counter: blocks the product cannot read as a counter, and keys it does not know', () => {
	knownBug('SC-671', '[CTR-U01] a "+" keeps the keys the counter does not know: note_to_self and extra are still in the block', async () => {
		const note = 'Counter/unknown-keys.md';
		await dse.openNote(note);
		await dse.waitForWrite(note, () => dse.click(dse.block(COUNTER).control('counter.inc')));
		await dse.expectNoteBlock(note, COUNTER).toMatchObject({ current_value: 2, note_to_self: 'keep me', extra: { a: 1 } });
	});

	knownBug('SC-672', '[CTR-W01] a block that is just the text `hello` still holds that text after the user tries a press (a card with no button passes)', async () => {
		const note = 'Counter/wrong-block.md';
		await dse.openNote(note, { errorCard: true });
		const buttons = await dse.page<number>(`document.querySelectorAll('.markdown-reading-view [data-dse-element="counter"] [data-dse-control="counter.inc"]').length`);
		if (buttons > 0) {
			const inc = dse.block(COUNTER).control('counter.inc');
			await dse.click(inc);
			await dse.settle();
		}
		expect(await dse.noteText(note)).toMatch(/^```ds-counter\nhello\n```$/m);
	});

	knownBug('SC-672', '[CTR-W02] an empty block never shows "Cannot read properties" (a fresh counter or a friendly error card both pass)', async () => {
		await dse.openNote('Counter/empty-block.md', { errorCard: true });
		const shown = await dse.page<string>(`document.querySelector('.markdown-reading-view [data-dse-element="counter"]')?.textContent ?? ''`);
		expect(shown).not.toMatch(/Cannot read properties/);
	});

	knownBug('SC-674', '[CTR-Q01] a "+" on current_value: "5" (max 20) lands 6, not the max: the box reads 6 and the note holds 6 (a number or the text "6")', async () => {
		const note = 'Counter/quoted-value.md';
		await dse.openNote(note);
		const root = dse.block(COUNTER);
		await dse.waitForWrite(note, () => dse.click(root.control('counter.inc')));
		await dse.settle();
		await expect(root.control('counter.input')).toHaveValue('6');
		const block = (await dse.expectNoteBlock(note, COUNTER).value()) as { current_value: unknown };
		expect(String(block.current_value)).toBe('6');
	});
});
