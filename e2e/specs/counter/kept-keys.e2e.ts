// SC-652 [X]: a counter step keeps reserved lines the plugin cannot read, in real Obsidian. Counter/kept-keys.md has `prefs: compact` (not a map) and
// `collapsed: yes` (a word, not true / false) above the body; the first write used to delete both. The montage cases are in specs/montage/kept-keys.e2e.ts.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';

const NOTE = 'Counter/kept-keys.md';
const COUNTER = 'ds-counter';
const lines = async (key: string): Promise<number> => (await dse.noteText(NOTE)).split('\n').filter((l) => new RegExp(`^${key}\\s*:`).test(l)).length;

describe('counter: a write keeps a prefs value and a collapsed line the plugin cannot read', () => {
	it('[CTR-K01] a counter step keeps a scalar `prefs:` and `collapsed: yes`, once each', async () => {
		await dse.openNote(NOTE);
		const root = dse.block(COUNTER);
		const w = await dse.waitForWrite(NOTE, () => dse.click(root.control('counter.inc')));
		expect(w.count).toBe(1);
		await dse.expectNoteBlock(NOTE, COUNTER).toMatchObject({ prefs: 'compact', collapsed: 'yes', current_value: 2 });
		expect(await lines('prefs')).toBe(1);
		expect(await lines('collapsed')).toBe(1);
	});
});
