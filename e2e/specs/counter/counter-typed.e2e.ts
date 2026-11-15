// SC-442: the counter's number field in real Obsidian, with real key events. Typing only edits a draft; Enter or leaving the field (a real click
// away) commits it ONCE; Escape reverts a dirty draft; ArrowUp / ArrowDown are the browser's own number stepping on the draft and the commit is
// still Enter or blur; a value past a limit is clamped to it and the button at the limit disables. Each drive asserts the NOTE (the block's
// parsed values, never the fence text) and the SCREEN (the field's value, each button's disabled state).
// Fixtures: Counter/unbounded.md (Torches 5, no max / min), counter.md (Health 1, 0..3), signed.md (Morale 0, -5..5), at-max.md (3 of 3), twins.md.
import { $, expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const COUNTER = 'ds-counter';
/** WebDriver's Backspace key code (U+E003, a private-use character: invisible in an editor). `dse.type` sends it as a key, so after the select-all it empties the box. */
const BACKSPACE = String.fromCharCode(0xe003);
/** A neutral spot to click so the field loses focus the way a user's click away does (the note's heading). */
const away = () => $('.workspace-leaf.mod-active .markdown-reading-view h1');

describe('counter: typing a value and committing it', () => {
	it('[CTR-T01] type 12 over 5 and Enter writes 12 once, the field shows 12 and keeps focus, nothing else in the block moves', async () => {
		const note = 'Counter/unbounded.md';
		await dse.openNote(note);
		const root = dse.block(COUNTER);
		const input = root.control('counter.input');
		await dse.type(input, '12', { replace: true });
		await dse.expectNoWrite(note, async () => expect(await input.getValue()).toBe('12')); // typing alone is only a draft
		const w = await dse.waitForWrite(note, () => dse.press('Enter', input));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(note, COUNTER).toEqual({ name: 'Torches', current_value: 12 });
		await dse.settle();
		await expect(input).toHaveValue('12');
		await expect(root.control('counter.dec')).toBeEnabled();
		await expect(root.control('counter.inc')).toBeEnabled();
		expect(await dse.focusedControl()).toBe('counter.input');
	});

	it('[CTR-T02] type 9 over 5 and a real click away commits it (blur): one write of 9, the field shows 9', async () => {
		const note = 'Counter/unbounded.md';
		await dse.openNote(note);
		const root = dse.block(COUNTER);
		const input = root.control('counter.input');
		await dse.type(input, '9', { replace: true });
		const w = await dse.waitForWrite(note, () => dse.blur(input, away()));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(note, COUNTER).toEqual({ name: 'Torches', current_value: 9 });
		await dse.settle();
		await expect(input).toHaveValue('9');
	});

	it('[CTR-T03] Escape on a half-typed draft puts the held value back, and the click away after it writes nothing', async () => {
		const note = 'Counter/unbounded.md';
		await dse.openNote(note);
		const root = dse.block(COUNTER);
		const input = root.control('counter.input');
		await dse.type(input, '99', { replace: true });
		await dse.expectNoWrite(note, async () => {
			await dse.press('Escape', input);
			await expect(input).toHaveValue('5');
			await dse.blur(input, away());
		});
		await dse.expectNoteBlock(note, COUNTER).toEqual({ name: 'Torches', current_value: 5 });
		await expect(input).toHaveValue('5');
	});

	it('[CTR-T04] ArrowUp in the field steps the draft 1 -> 2 without writing, and Enter then writes 2 once', async () => {
		const note = 'Counter/counter.md';
		await dse.openNote(note);
		const root = dse.block(COUNTER);
		const input = root.control('counter.input');
		await dse.tabTo(input, 24);
		await dse.expectNoWrite(note, async () => {
			await dse.press('ArrowUp', input);
			await expect(input).toHaveValue('2');
		});
		const w = await dse.waitForWrite(note, () => dse.press('Enter', input));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(note, COUNTER).toMatchObject({ current_value: 2, max_value: 3, min_value: 0 });
		await dse.settle();
		await expect(input).toHaveValue('2');
	});

	it('[CTR-T05] ArrowDown in the field steps the draft 0 -> -1 on a counter with a negative min, and Enter writes -1', async () => {
		const note = 'Counter/signed.md';
		await dse.openNote(note);
		const root = dse.block(COUNTER);
		const input = root.control('counter.input');
		await dse.tabTo(input, 24);
		await dse.expectNoWrite(note, async () => {
			await dse.press('ArrowDown', input);
			await expect(input).toHaveValue('-1');
		});
		const w = await dse.waitForWrite(note, () => dse.press('Enter', input));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(note, COUNTER).toMatchObject({ current_value: -1, max_value: 5, min_value: -5, name: 'Morale' });
		await dse.settle();
		await expect(input).toHaveValue('-1');
	});

	it('[CTR-T06] Live Preview: type 2 over 1 and Enter writes 2 once, the field shows 2, and the text around the block is untouched', async () => {
		const note = 'Counter/counter.md';
		await dse.openNote(note, { mode: 'live-preview' });
		const root = dse.block(COUNTER);
		const input = root.control('counter.input');
		await dse.type(input, '2', { replace: true });
		await dse.expectNoWrite(note, async () => expect(await input.getValue()).toBe('2')); // typing alone is only a draft
		const w = await dse.waitForWrite(note, () => dse.press('Enter', input));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(note, COUNTER).toMatchObject({ current_value: 2, max_value: 3, min_value: 0, name: 'Health' });
		await dse.settle();
		await expect(input).toHaveValue('2');
		await expect(root.control('counter.dec')).toBeEnabled();
		await expect(root.control('counter.inc')).toBeEnabled();
	});
});

describe('counter: values past a limit, an empty box, a decimal, a second counter', () => {
	it('[CTR-E01] type 99 on 1..3 and Enter is clamped to the max: 3 written once, "+" disables, "-" stays enabled', async () => {
		const note = 'Counter/counter.md';
		await dse.openNote(note);
		const root = dse.block(COUNTER);
		const input = root.control('counter.input');
		await dse.type(input, '99', { replace: true });
		const w = await dse.waitForWrite(note, () => dse.press('Enter', input));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(note, COUNTER).toMatchObject({ current_value: 3, max_value: 3, min_value: 0 });
		await dse.settle();
		await expect(input).toHaveValue('3');
		await expect(root.control('counter.inc')).toBeDisabled();
		await expect(root.control('counter.dec')).toBeEnabled();
	});

	it('[CTR-E02] type -9 on -5..5 and Enter is clamped to the min: -5 written once, "-" disables, "+" stays enabled', async () => {
		const note = 'Counter/signed.md';
		await dse.openNote(note);
		const root = dse.block(COUNTER);
		const input = root.control('counter.input');
		await dse.type(input, '-9', { replace: true });
		const w = await dse.waitForWrite(note, () => dse.press('Enter', input));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(note, COUNTER).toMatchObject({ current_value: -5, max_value: 5, min_value: -5 });
		await dse.settle();
		await expect(input).toHaveValue('-5');
		await expect(root.control('counter.dec')).toBeDisabled();
		await expect(root.control('counter.inc')).toBeEnabled();
	});

	it('[CTR-E03] ArrowUp at the max stays at the max (the field\'s own limit), and Enter then writes nothing', async () => {
		const note = 'Counter/at-max.md';
		await dse.openNote(note);
		const root = dse.block(COUNTER);
		const input = root.control('counter.input');
		await dse.tabTo(input, 24);
		await dse.expectNoWrite(note, async () => {
			await dse.press('ArrowUp', input);
			await expect(input).toHaveValue('3');
			await dse.press('Enter', input);
		});
		await dse.expectNoteBlock(note, COUNTER).toMatchObject({ current_value: 3, max_value: 3, min_value: 0 });
		await expect(root.control('counter.inc')).toBeDisabled();
	});

	it('[CTR-E04] an emptied box and Enter reverts to the held value: nothing is written', async () => {
		const note = 'Counter/unbounded.md';
		await dse.openNote(note);
		const root = dse.block(COUNTER);
		const input = root.control('counter.input');
		await dse.type(input, BACKSPACE, { replace: true }); // select all, then the Backspace key: the box is empty
		await expect(input).toHaveValue('');
		await dse.expectNoWrite(note, () => dse.press('Enter', input));
		await expect(input).toHaveValue('5');
		await dse.expectNoteBlock(note, COUNTER).toEqual({ name: 'Torches', current_value: 5 });
	});

	it('[CTR-E05] a decimal is cut toward zero: type 2.7 and Enter writes the integer 2, never a float', async () => {
		const note = 'Counter/unbounded.md';
		await dse.openNote(note);
		const root = dse.block(COUNTER);
		const input = root.control('counter.input');
		await dse.type(input, '2.7', { replace: true });
		const w = await dse.waitForWrite(note, () => dse.press('Enter', input));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(note, COUNTER).toEqual({ name: 'Torches', current_value: 2 });
		await dse.settle();
		await expect(input).toHaveValue('2');
	});

	it('[CTR-X01] two identical counters: a typed value on the second writes only the second block, and the first keeps its value', async () => {
		const note = 'Counter/twins.md';
		await dse.openNote(note);
		const input = dse.block(COUNTER, 1).control('counter.input');
		await dse.type(input, '3', { replace: true });
		const w = await dse.waitForWrite(note, () => dse.press('Enter', input));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(note, COUNTER, 1).toMatchObject({ current_value: 3, max_value: 3, min_value: 0 });
		await dse.expectNoteBlock(note, COUNTER, 0).toMatchObject({ current_value: 1, max_value: 3, min_value: 0 });
		await dse.settle();
		await expect(dse.block(COUNTER, 1).control('counter.input')).toHaveValue('3');
		await expect(dse.block(COUNTER, 0).control('counter.input')).toHaveValue('1');
	});
});
