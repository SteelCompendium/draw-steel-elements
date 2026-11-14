// SC-438 [X]: what a montage write leaves alone, in real Obsidian. The note around the block (above, between, below) and every OTHER fence is
// checked after every test by the driver; these scenarios add the cases that are montage-specific: two different blocks, two IDENTICAL twins (Reading
// view and Live Preview), hand-written YAML, and keys the product does not know. The permutations are in the jsdom matrix [X].
// Montage/two-blocks.md: First Crossing (Kira, nothing logged) and Second Crossing (Bram, 1 success, round 2). Montage/twins.md: two identical blocks.
// Montage/hand-written.md: Kira's `skills_used` is a scalar, Bram has no list and an unrecognised result. Montage/unknown-keys.md: `table_notes`, an
// entry's `dc` and a participant's `player`.
import { expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { blockOf, cellOf, HAND, MONTAGE, TWINS, TWO, UNKNOWN } from '../../driver/montage';

const FRESH_FIRST = 'Montage/fresh.md';

describe('montage: the note and the other blocks around a write', () => {
	it('[MONT-X01] a quick log in the SECOND of two different blocks changes that block only', async () => {
		await dse.openNote(TWO);
		const root = dse.block(MONTAGE, 1);
		const w = await dse.waitForWrite(TWO, () => dse.click(root.control('montage.quick.failure', { nth: 0 })));
		expect(w.count).toBe(1);
		expect((await blockOf(TWO, 1)).entries).toEqual([{ hero: 'Bram', round: 1, result: 'success', skill: 'Endurance' }, { hero: 'Bram', round: 2, result: 'failure' }]);
		const first = await blockOf(TWO, 0);
		expect(first.entries).toBeUndefined();
		expect([first.successes, first.failures]).toEqual([0, 0]);
	});

	it('[MONT-X02] a quick log in the FIRST of two identical blocks changes that block only; the twin below stays as it was', async () => {
		await dse.openNote(TWINS);
		const root = dse.block(MONTAGE, 0);
		await dse.waitForWrite(TWINS, () => dse.click(root.control('montage.quick.success', { nth: 0 })));
		expect((await blockOf(TWINS, 0)).entries).toEqual([{ hero: 'Kira', round: 1, result: 'success' }]);
		expect((await blockOf(TWINS, 1)).entries).toBeUndefined();
		await expect(cellOf(dse.block(MONTAGE, 1), 'Kira', 1)).toHaveAttribute('data-kind', 'none');
	});

	it('[MONT-X03] a quick log in the SECOND of two identical blocks changes that block only; the twin above stays as it was', async () => {
		await dse.openNote(TWINS);
		const root = dse.block(MONTAGE, 1);
		await dse.waitForWrite(TWINS, () => dse.click(root.control('montage.quick.success', { nth: 0 })));
		expect((await blockOf(TWINS, 1)).entries).toEqual([{ hero: 'Kira', round: 1, result: 'success' }]);
		expect((await blockOf(TWINS, 0)).entries).toBeUndefined();
	});

	it('[MONT-X04] Live Preview: a quick log in the first of two identical blocks changes that block only', async () => {
		await dse.openNote(TWINS, { mode: 'live-preview' });
		const root = dse.block(MONTAGE, 0);
		await dse.waitForWrite(TWINS, () => dse.click(root.control('montage.quick.success', { nth: 0 })));
		await dse.settle();
		expect((await blockOf(TWINS, 0)).entries).toEqual([{ hero: 'Kira', round: 1, result: 'success' }]);
		expect((await blockOf(TWINS, 1)).entries).toBeUndefined();
	});

	it('[MONT-X05] Live Preview: the Log an action sheet logs into the second of two different blocks and into no other', async () => {
		await dse.openNote(TWO, { mode: 'live-preview' });
		const root = dse.block(MONTAGE, 1);
		await dse.click(root.control('montage.bar.log'));
		const modal = await dse.modal('montage-log');
		await dse.waitForWrite(TWO, () => dse.click(modal.control('montage.log.submit')));
		await dse.settle();
		expect((await blockOf(TWO, 1)).entries!.map((e) => `${e.hero}${e.round}${e.result}`)).toEqual(['Bram1success', 'Bram2success']);
		expect((await blockOf(TWO, 0)).entries).toBeUndefined();
	});

	it('[MONT-X06] hand-written YAML survives a write for another hero: the scalar skills list, the hero with no list and the unrecognised result stay as typed', async () => {
		await dse.openNote(HAND);
		const root = dse.block(MONTAGE);
		await dse.waitForWrite(HAND, () => dse.click(root.control('montage.quick.assist', { nth: 0 }))); // Kira, round 2
		const b = await blockOf(HAND);
		expect(b.participants).toEqual([{ name: 'Kira', skills_used: 'Nature' }, { name: 'Bram' }] as never);
		expect(b.entries).toEqual([
			{ hero: 'Kira', round: 1, result: 'success', skill: 'Nature' },
			{ hero: 'Bram', round: 1, result: 'dodged' },
			{ hero: 'Kira', round: 2, result: 'assist' },
		]);
	});

	it('[MONT-X07] a participant\'s own extra key survives a write', async () => {
		await dse.openNote(UNKNOWN);
		const root = dse.block(MONTAGE);
		await dse.waitForWrite(UNKNOWN, () => dse.click(root.control('montage.quick.success', { nth: 0 })));
		expect((await blockOf(UNKNOWN)).participants![0]).toMatchObject({ name: 'Kira', player: 'Sam' });
	});

	it('[MONT-X08] an edit made to the prose above the block from outside is kept by the next write', async () => {
		await dse.openNote(FRESH_FIRST);
		await dse.externalEdit(FRESH_FIRST, `c.replace('ABOVE', 'ABOVE, edited elsewhere')`);
		await dse.settle();
		const root = dse.block(MONTAGE);
		await dse.waitForWrite(FRESH_FIRST, () => dse.click(root.control('montage.quick.success', { nth: 0 })));
		expect(await dse.noteText(FRESH_FIRST)).toContain('ABOVE, edited elsewhere');
		expect((await blockOf(FRESH_FIRST)).entries).toEqual([{ hero: 'Kira', round: 1, result: 'success' }]);
	});

	knownBug('SC-625', '[MONT-X09] a write keeps a top-level key the product does not know (`table_notes`)', async () => {
		await dse.openNote(UNKNOWN);
		const root = dse.block(MONTAGE);
		await dse.waitForWrite(UNKNOWN, () => dse.click(root.control('montage.quick.success', { nth: 0 })));
		expect(await blockOf(UNKNOWN)).toMatchObject({ table_notes: 'keep me' });
	});

	knownBug('SC-625', '[MONT-X10] a write keeps a key the product does not know inside an entry (`dc: 12`)', async () => {
		await dse.openNote(UNKNOWN);
		const root = dse.block(MONTAGE);
		await dse.waitForWrite(UNKNOWN, () => dse.click(root.control('montage.quick.success', { nth: 0 })));
		expect((await blockOf(UNKNOWN)).entries![0]).toMatchObject({ hero: 'Kira', round: 1, dc: 12 });
	});
});
