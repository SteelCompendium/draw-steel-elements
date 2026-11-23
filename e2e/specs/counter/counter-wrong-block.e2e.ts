// A `ds-counter` block that does not hold a map of keys, in real Obsidian. Text, a list or a number in the block is a plain error card with the
// message `Invalid data: the block must be a map of keys.`, no control, and the note is never written (a counter written from it would replace the
// user's text). An empty block is a counter at 0, and its first step writes `current_value: 1` inside the fence with everything around it intact.
// Counter/wrong-block.md: the text `hello`. wrong-list.md: `- a`, `- b`. wrong-number.md: `5`. empty-block.md: one empty line between the fences.
// comment-only-block.md: `# a note to self`. adjacent-fences.md: the closing fence directly under the opening one. two-empty.md: two empty blocks,
// with BETWEEN text. wrong-tagged.md: four blocks that an explicit YAML tag turns into a Set, a Date, a Uint8Array and a Map. Each note has ABOVE and BELOW
// lines around the block(s).
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const WRONG_BLOCK = 'Counter/wrong-block.md';
const WRONG_LIST = 'Counter/wrong-list.md';
const WRONG_NUMBER = 'Counter/wrong-number.md';
const EMPTY = 'Counter/empty-block.md';
const COMMENT_ONLY = 'Counter/comment-only-block.md';
const ADJACENT = 'Counter/adjacent-fences.md';
const TWO_EMPTY = 'Counter/two-empty.md';
const TAGGED = 'Counter/wrong-tagged.md';
const COUNTER = 'ds-counter';
const MAP_MESSAGE = 'Invalid data: the block must be a map of keys.';

const EMPTY_FENCE = '```ds-counter\n\n```';
const WRITTEN_FENCE = '```ds-counter\ncurrent_value: 1\n```';

/** What the card of the first counter says, and how many controls, buttons and inputs it has. */
const cardOf = (): Promise<{ title: string; message: string; controls: number; widgets: number; counter: boolean; stage: string | null }> =>
	dse.page(`(() => {
		const c = document.querySelector('.markdown-reading-view [data-dse-element="counter"]');
		return { title: c.querySelector('.dse-error-card-title')?.textContent ?? '', message: c.querySelector('.dse-error-card-message')?.textContent ?? '', controls: c.querySelectorAll('[data-dse-control]').length, widgets: c.querySelectorAll('button, input').length, counter: !!c.querySelector('.dse-counter'), stage: c.closest('[data-dse-error-stage]')?.getAttribute('data-dse-error-stage') ?? c.getAttribute('data-dse-error-stage') };
	})()`);

/** The numbers the counters of the visible view show (Reading view, or Live Preview), in note order, and whether any error card is drawn. */
const shown = (scope: '.markdown-reading-view' | '.markdown-source-view' = '.markdown-reading-view'): Promise<{ values: string[]; errors: number; names: string[] }> =>
	dse.page(`(() => {
		const roots = [...document.querySelectorAll('${scope} [data-dse-element="counter"]')];
		return {
			values: roots.map((r) => r.querySelector('input.dse-counter__value')?.value ?? 'none'),
			names: roots.map((r) => r.querySelector('.dse-counter__name')?.textContent ?? 'none'),
			errors: roots.filter((r) => r.querySelector('.dse-error-card') || r.hasAttribute('data-dse-error-stage')).length,
		};
	})()`);

/** What each counter-shaped root of the Reading view draws: the card's message and title, its controls, and whether it is a counter. */
const cardsOf = (): Promise<{ title: string; message: string; controls: number; widgets: number; counter: boolean }[]> =>
	dse.page(`(() => [...document.querySelectorAll('.markdown-reading-view [data-dse-element="counter"]')].map((c) => ({ title: c.querySelector('.dse-error-card-title')?.textContent ?? '', message: c.querySelector('.dse-error-card-message')?.textContent ?? '', controls: c.querySelectorAll('[data-dse-control]').length, widgets: c.querySelectorAll('button, input').length, counter: !!c.querySelector('.dse-counter') })))()`);

describe('counter: a block that is not a map of keys', () => {
	/** The block is refused as a plain error card with no control, and a real click on the card leaves the note byte-identical. */
	async function expectPlainErrorCard(note: string, fence: string): Promise<void> {
		await dse.openNote(note, { errorCard: true });
		const before = await dse.noteText(note);
		expect(before).toContain(fence);
		const card = await cardOf();
		expect(card).toMatchObject({ message: MAP_MESSAGE, controls: 0, widgets: 0, counter: false, stage: 'render' });
		expect(card.title).toBe('Counter: failed to render (render)');
		expect(`${card.title} ${card.message}`).not.toMatch(/is not a function|Cannot read properties|TypeError|undefined/);
		await dse.expectNoWrite(note, () => dse.block(COUNTER).root.click()); // a real click on the card; it is not a control, so it drives no coverage pair
		expect(await dse.noteText(note)).toBe(before);
	}

	it('[CTR-W03] the text `hello` is a plain error card, the card has no control, and the note is byte-identical after a click on it', async () => {
		await expectPlainErrorCard(WRONG_BLOCK, '```ds-counter\nhello\n```');
	});

	it('[CTR-W04] a list (`- a`, `- b`) is a plain error card, the card has no control, and the note is byte-identical after a click on it', async () => {
		await expectPlainErrorCard(WRONG_LIST, '```ds-counter\n- a\n- b\n```');
	});

	it('[CTR-W05] the number 5 is a plain error card, the card has no control, and the note is byte-identical after a click on it', async () => {
		await expectPlainErrorCard(WRONG_NUMBER, '```ds-counter\n5\n```');
	});

	it('[CTR-W13] a block an explicit YAML tag turns into a Set, a Date, a Uint8Array or a Map is a plain error card, and the note is byte-identical after a click on each card', async () => {
		await dse.openNote(TAGGED, { errorCard: true });
		await dse.waitFor(`document.querySelectorAll('.markdown-reading-view [data-dse-element="counter"][data-dse-error-stage]').length === 4`, 'all four tagged blocks to draw their error card');
		const before = await dse.noteText(TAGGED);
		for (const body of ['!!set\n? a\n? b', '!!timestamp 2024-01-01', '!!binary aGVsbG8=', '!!omap\n- a: 1']) expect(before).toContain('```ds-counter\n' + body + '\n```');
		const cards = await cardsOf();
		expect(cards).toHaveLength(4);
		for (const card of cards) {
			expect(card).toMatchObject({ message: MAP_MESSAGE, controls: 0, widgets: 0, counter: false });
			expect(card.title).toBe('Counter: failed to render (render)');
		}
		for (let k = 0; k < 4; k++) await dse.expectNoWrite(TAGGED, () => dse.block(COUNTER, k).root.click());
		expect(await dse.noteText(TAGGED)).toBe(before);
	});
});

describe('counter: an empty block is a counter at 0', () => {
	it('[CTR-W06] a block with one empty line between the fences draws a counter at 0, not an error card', async () => {
		await dse.openNote(EMPTY);
		expect(await shown()).toEqual({ values: ['0'], names: [''], errors: 0 });
		await expect(dse.block(COUNTER).control('counter.dec')).toBeDisabled(); // 0 is its minimum
		await expect(dse.block(COUNTER).control('counter.inc')).toBeEnabled();
	});

	it('[CTR-W07] a block with only a comment draws a counter at 0, and its first step writes `current_value: 1` (the comment goes, as for every block)', async () => {
		await dse.openNote(COMMENT_ONLY);
		expect(await shown()).toEqual({ values: ['0'], names: [''], errors: 0 });
		const before = await dse.noteText(COMMENT_ONLY);
		expect(before).toContain('```ds-counter\n# a note to self\n```');
		const w = await dse.waitForWrite(COMMENT_ONLY, () => dse.click(dse.block(COUNTER).control('counter.inc')));
		expect(w.count).toBe(1);
		expect(await dse.noteText(COMMENT_ONLY)).toBe(before.replace('```ds-counter\n# a note to self\n```', WRITTEN_FENCE));
	});

	it('[CTR-W08] Reading view: + on an empty block writes `current_value: 1` inside the fence, and the lines above and below are untouched', async () => {
		await dse.openNote(EMPTY);
		const before = await dse.noteText(EMPTY);
		expect(before).toContain(EMPTY_FENCE);
		const w = await dse.waitForWrite(EMPTY, () => dse.click(dse.block(COUNTER).control('counter.inc')));
		expect(w.count).toBe(1);
		expect(await dse.noteText(EMPTY)).toBe(before.replace(EMPTY_FENCE, WRITTEN_FENCE));
		await dse.expectNoteBlock(EMPTY, COUNTER).toEqual({ current_value: 1 });
		expect(await shown()).toMatchObject({ values: ['1'], errors: 0 });
	});

	it('[CTR-W09] Live Preview: + on an empty block writes `current_value: 1` inside the fence, and the lines above and below are untouched', async () => {
		await dse.openNote(EMPTY, { mode: 'live-preview' });
		expect(await shown('.markdown-source-view')).toEqual({ values: ['0'], names: [''], errors: 0 });
		const before = await dse.noteText(EMPTY);
		const w = await dse.waitForWrite(EMPTY, () => dse.click(dse.block(COUNTER).control('counter.inc')));
		expect(w.count).toBe(1);
		await dse.settle();
		expect(await dse.noteText(EMPTY)).toBe(before.replace(EMPTY_FENCE, WRITTEN_FENCE));
		await dse.expectNoteBlock(EMPTY, COUNTER).toEqual({ current_value: 1 });
		expect(await shown('.markdown-source-view')).toMatchObject({ values: ['1'], errors: 0 });
	});

	it('[CTR-W10] a block with nothing between the fences takes the write, and the closing fence stays on its own line', async () => {
		await dse.openNote(ADJACENT);
		const before = await dse.noteText(ADJACENT);
		expect(before).toContain('```ds-counter\n```');
		expect(await shown()).toEqual({ values: ['0'], names: [''], errors: 0 });
		const w = await dse.waitForWrite(ADJACENT, () => dse.click(dse.block(COUNTER).control('counter.inc')));
		expect(w.count).toBe(1);
		const after = await dse.noteText(ADJACENT);
		expect(after).toBe(before.replace('```ds-counter\n```', WRITTEN_FENCE));
		expect(after.split('\n')).toContain('```'); // the closing fence is a line of its own
		await dse.expectNoteBlock(ADJACENT, COUNTER).toEqual({ current_value: 1 });
	});

	it('[CTR-W11] two empty blocks in one note: + on the SECOND changes only the second, then + on the first changes only the first', async () => {
		await dse.openNote(TWO_EMPTY);
		const before = await dse.noteText(TWO_EMPTY);
		expect(before.split(EMPTY_FENCE)).toHaveLength(3);
		expect(await shown()).toEqual({ values: ['0', '0'], names: ['', ''], errors: 0 });
		const [head, middle, tail] = before.split(EMPTY_FENCE);
		await dse.waitForWrite(TWO_EMPTY, () => dse.click(dse.block(COUNTER, 1).control('counter.inc')));
		expect(await dse.noteText(TWO_EMPTY)).toBe(head + EMPTY_FENCE + middle + WRITTEN_FENCE + tail);
		// A second step on the same block, so the two blocks are not identical when the first is written (two identical blocks made equal by a write
		// is a different case: it counts a view-registry collision, which the run checks after every test).
		await dse.waitForWrite(TWO_EMPTY, () => dse.click(dse.block(COUNTER, 1).control('counter.inc')));
		await dse.waitForWrite(TWO_EMPTY, () => dse.click(dse.block(COUNTER, 0).control('counter.inc')));
		expect(await dse.noteText(TWO_EMPTY)).toBe(head + WRITTEN_FENCE + middle + '```ds-counter\ncurrent_value: 2\n```' + tail);
		await dse.expectNoteBlock(TWO_EMPTY, COUNTER, 0).toEqual({ current_value: 1 });
		await dse.expectNoteBlock(TWO_EMPTY, COUNTER, 1).toEqual({ current_value: 2 });
	});

	it('[CTR-W12] after the write, reopening the note shows the counter at 1', async () => {
		await dse.openNote(EMPTY);
		await dse.waitForWrite(EMPTY, () => dse.click(dse.block(COUNTER).control('counter.inc')));
		// Not openNote: it would put the fixture back. Close every note and open this one again, as a reader would.
		await dse.page(`(async () => {
			const old = app.workspace.getLeavesOfType('markdown');
			const leaf = app.workspace.getLeaf('tab');
			old.forEach((l) => l.detach());
			await leaf.setViewState({ type: 'markdown', state: { file: ${JSON.stringify(EMPTY)}, mode: 'preview' }, active: true });
		})()`);
		await dse.waitFor(`document.querySelector('.markdown-reading-view [data-dse-element="counter"] input.dse-counter__value')?.value === '1'`, 'the reopened counter to show 1');
		expect(await shown()).toEqual({ values: ['1'], names: [''], errors: 0 });
		expect(await dse.noteText(EMPTY)).toContain(WRITTEN_FENCE);
	});

	/** + then - on the one empty block, in the given view: the card is a counter at 0 (no error card), the text above and below the fence is the original, and a second cycle leaves the note as the first left it. */
	async function expectCycle(mode: 'reading' | 'live-preview', bodyAfter: string): Promise<void> {
		const scope = mode === 'reading' ? '.markdown-reading-view' : '.markdown-source-view';
		await dse.openNote(EMPTY, { mode });
		const original = await dse.noteText(EMPTY);
		const [head, tail] = original.split(EMPTY_FENCE);
		expect(original).toBe(head + EMPTY_FENCE + tail);
		const press = async (control: 'counter.inc' | 'counter.dec'): Promise<void> => {
			await dse.waitForWrite(EMPTY, () => dse.click(dse.block(COUNTER).control(control)));
			await dse.settle();
		};
		await press('counter.inc');
		expect(await dse.noteText(EMPTY)).toBe(head + WRITTEN_FENCE + tail);
		await press('counter.dec');
		const afterFirst = await dse.noteText(EMPTY);
		expect(await shown(scope)).toEqual({ values: ['0'], names: [''], errors: 0 });
		expect(afterFirst.startsWith(head + '```ds-counter\n')).toBe(true); // the text above the fence is the original
		expect(afterFirst.endsWith('\n```' + tail)).toBe(true); // and so is the text below it
		expect(afterFirst).toBe(head + '```ds-counter\n' + bodyAfter + '```' + tail);
		await press('counter.inc');
		await press('counter.dec');
		expect(await dse.noteText(EMPTY)).toBe(afterFirst); // a second cycle changes nothing more
		expect(await shown(scope)).toEqual({ values: ['0'], names: [''], errors: 0 });
		await dse.expectNoteBlock(EMPTY, COUNTER).toEqual(bodyAfter === '\n' ? undefined : { current_value: 0 });
	}

	it('[CTR-W14] Reading view: + then - on an empty block gives a counter at 0 again, the text around the fence is untouched, and a second cycle changes nothing', async () => {
		await expectCycle('reading', '\n');
	});

	it('[CTR-W15] Live Preview: + then - on an empty block gives a counter at 0 again, the text around the fence is untouched, and a second cycle changes nothing', async () => {
		await expectCycle('live-preview', 'current_value: 0\n');
	});
});
