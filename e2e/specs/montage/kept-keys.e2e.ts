// SC-652 [X]: a write keeps what the plugin cannot read, in real Obsidian. A `prefs:` map of keys the plugin does not use and a `collapsed:`
// that is a word were deleted by the first write; they are kept now, by value, and the block looks the same on screen. Montage/kept-prefs.md has
// `prefs: {boardDensity: compact}`, Montage/kept-collapsed.md has `collapsed: yes`; Counter/kept-keys.md has `prefs: compact` and `collapsed: yes`.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { blockOf, MONTAGE } from '../../driver/montage';

const PREFS = 'Montage/kept-prefs.md';
const COLLAPSED = 'Montage/kept-collapsed.md';
const COUNTER_NOTE = 'Counter/kept-keys.md';
const lines = async (note: string, key: string): Promise<number> => (await dse.noteText(note)).split('\n').filter((l) => new RegExp(`^${key}\\s*:`).test(l)).length;

describe('a write keeps a prefs map and a collapsed line the plugin cannot read', () => {
	it('[MONT-X15] a quick log keeps `prefs: {boardDensity: compact}` once, and the log lands', async () => {
		await dse.openNote(PREFS);
		const root = dse.block(MONTAGE);
		const w = await dse.waitForWrite(PREFS, () => dse.click(root.control('montage.quick.success', { nth: 0 })));
		expect(w.count).toBe(1);
		const b = await blockOf(PREFS);
		expect(b.prefs).toEqual({ boardDensity: 'compact' });
		expect(b.entries).toEqual([{ hero: 'Kira', round: 1, result: 'success' }]);
		expect(await lines(PREFS, 'prefs')).toBe(1);
	});

	it('[MONT-X16] a quick log keeps `collapsed: yes` once, and the block is drawn as it is without the line', async () => {
		await dse.openNote(COLLAPSED);
		const root = dse.block(MONTAGE);
		await expect(root.root).toHaveAttribute('data-dse-element', 'montage');
		const w = await dse.waitForWrite(COLLAPSED, () => dse.click(root.control('montage.quick.success', { nth: 0 })));
		expect(w.count).toBe(1);
		const b = await blockOf(COLLAPSED);
		expect(b.collapsed).toBe('yes');
		expect(b.entries).toEqual([{ hero: 'Kira', round: 1, result: 'success' }]);
		expect(await lines(COLLAPSED, 'collapsed')).toBe(1);
	});

	it('[MONT-X17] a hand edit to the kept prefs line, made while the block is drawn, is what the next write keeps', async () => {
		await dse.openNote(PREFS);
		await dse.externalEdit(PREFS, `c.replace('boardDensity: compact', 'boardDensity: spacious')`);
		await dse.settle();
		const root = dse.block(MONTAGE);
		await dse.waitForWrite(PREFS, () => dse.click(root.control('montage.quick.success', { nth: 0 })));
		expect((await blockOf(PREFS)).prefs).toEqual({ boardDensity: 'spacious' });
		expect(await lines(PREFS, 'prefs')).toBe(1);
	});

	it('[MONT-X18] Live Preview: a quick log keeps `collapsed: yes` once', async () => {
		await dse.openNote(COLLAPSED, { mode: 'live-preview' });
		const root = dse.block(MONTAGE);
		await dse.waitForWrite(COLLAPSED, () => dse.click(root.control('montage.quick.success', { nth: 0 })));
		await dse.settle();
		expect((await blockOf(COLLAPSED)).collapsed).toBe('yes');
		expect(await lines(COLLAPSED, 'collapsed')).toBe(1);
	});

	it('[CTR-K01] a counter step keeps a scalar `prefs:` and `collapsed: yes`, once each', async () => {
		await dse.openNote(COUNTER_NOTE);
		const root = dse.block('ds-counter');
		const w = await dse.waitForWrite(COUNTER_NOTE, () => dse.click(root.control('counter.inc')));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(COUNTER_NOTE, 'ds-counter').toMatchObject({ prefs: 'compact', collapsed: 'yes', current_value: 2 });
		expect(await lines(COUNTER_NOTE, 'prefs')).toBe(1);
		expect(await lines(COUNTER_NOTE, 'collapsed')).toBe(1);
	});
});
