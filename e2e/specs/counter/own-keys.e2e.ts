// SC-671: a counter write keeps the YAML keys the counter does not read, in real Obsidian. Counter/own-keys.md has a scalar (`note_to_self`), a
// nested map (`extra`) and a list (`tags`) between and after the counter's own keys, with prose above and below; the first press used to delete all
// three. They come back with the same values, after the counter's own keys (`_dse_anchor` included), in the order they were typed. Reading view,
// Live Preview (the widget is redrawn after each write, so a second press runs on a re-read block) and the pinned sidebar card are covered here;
// every write path of the model is in test/dom/elements/counter-own-keys.test.ts.
import { browser, expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const NOTE = 'Counter/own-keys.md';
const COUNTER = 'ds-counter';
const SIDEBAR = '.dse-sidebar';
const UNKNOWN = { note_to_self: 'keep me', extra: { a: 1, deep: ['x', 'y'] }, tags: ['a', 'b'] };
const ORDER = ['max_value', 'current_value', 'min_value', 'name', '_dse_anchor', 'note_to_self', 'extra', 'tags'];

const keysOfBlock = async (): Promise<string[]> => Object.keys((await dse.expectNoteBlock(NOTE, COUNTER).value()) as Record<string, unknown>);
const prose = async (): Promise<void> => {
	const text = await dse.noteText(NOTE);
	expect(text.startsWith('# Counter: keys the counter does not read\n\nABOVE\n\n```ds-counter\n')).toBe(true);
	expect(text.endsWith('\n```\n\nBELOW\n')).toBe(true);
};

describe('counter: a write keeps the keys the counter does not read', () => {
	it('[CTR-O01] Reading view: + keeps a scalar, a nested map and a list, after the counter\'s own keys, in their order', async () => {
		await dse.openNote(NOTE);
		const w = await dse.waitForWrite(NOTE, () => dse.click(dse.block(COUNTER).control('counter.inc')));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(NOTE, COUNTER).toMatchObject({ ...UNKNOWN, name: 'Torches', max_value: 5, min_value: 0, current_value: 3, _dse_anchor: 'own671' });
		expect(await keysOfBlock()).toEqual(ORDER);
		await prose();
	});

	it('[CTR-O02] Reading view: - and then + keep them across both writes', async () => {
		await dse.openNote(NOTE);
		await dse.waitForWrite(NOTE, () => dse.click(dse.block(COUNTER).control('counter.dec')));
		await dse.expectNoteBlock(NOTE, COUNTER).toMatchObject({ ...UNKNOWN, current_value: 1 });
		await dse.waitForWrite(NOTE, () => dse.click(dse.block(COUNTER).control('counter.inc')));
		await dse.expectNoteBlock(NOTE, COUNTER).toMatchObject({ ...UNKNOWN, current_value: 2 });
		expect(await keysOfBlock()).toEqual(ORDER);
		await prose();
	});

	it('[CTR-O03] Live Preview: - and then + (the second press runs on the redrawn counter) keep them across both writes', async () => {
		await dse.openNote(NOTE, { mode: 'live-preview' });
		await dse.waitForWrite(NOTE, () => dse.click(dse.block(COUNTER).control('counter.dec')));
		await dse.expectNoteBlock(NOTE, COUNTER).toMatchObject({ ...UNKNOWN, current_value: 1 });
		await dse.settle();
		await dse.waitForWrite(NOTE, () => dse.click(dse.block(COUNTER).control('counter.inc')));
		await dse.expectNoteBlock(NOTE, COUNTER).toMatchObject({ ...UNKNOWN, current_value: 2 });
		expect(await keysOfBlock()).toEqual(ORDER);
		await prose();
	});
});

describe('counter: the pinned sidebar card keeps the keys the counter does not read', () => {
	const closeSidebar = (): Promise<unknown> => dse.page(`(() => { app.workspace.detachLeavesOfType('dse-sidebar'); return true; })()`);
	before(() => dse.setPrefs({}, { experimental: true }));
	after(async () => {
		await closeSidebar();
		await dse.setPrefs({});
	});

	it('[CTR-O04] + on the pinned card writes the block with the keys the counter does not read, after `_dse_anchor`', async () => {
		await dse.openNote(NOTE);
		await dse.externalEdit(NOTE, 'c'); // the card writes this note from the page itself, so the driver's fence checks stand aside
		await closeSidebar();
		await dse.page(`(async () => {
			const leaf = app.workspace.getRightLeaf(false);
			await leaf.setViewState({ type: 'dse-sidebar', active: true });
			await app.workspace.revealLeaf(leaf);
			leaf.view.addPanel({ filePath: ${JSON.stringify(NOTE)}, alias: 'ds-counter', anchorId: 'own671' });
			document.querySelectorAll('.notice-container').forEach((n) => { n.style.display = 'none'; });
			return true;
		})()`);
		await dse.waitFor(`document.querySelectorAll('${SIDEBAR} [data-dse-control="counter.inc"]').length >= 1`, 'the pinned counter to render in the sidebar');
		await dse.page(`document.querySelector('${SIDEBAR} [data-dse-control="counter.inc"]').click()`);
		await browser.pause(1800);
		await dse.expectNoteBlock(NOTE, COUNTER).toMatchObject({ ...UNKNOWN, current_value: 3, _dse_anchor: 'own671' });
		expect(await keysOfBlock()).toEqual(ORDER);
		await prose();
	});
});
