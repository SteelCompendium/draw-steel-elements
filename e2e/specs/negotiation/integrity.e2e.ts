// SC-439 [X]: what a negotiation write leaves alone, in real Obsidian. The note around the block (above, between, below) and every OTHER fence
// is checked after every test by the driver; these scenarios add the negotiation-specific cases: two different blocks, a hand edit, no default
// keys written (SC-482), and keys the product does not know (SC-637: kept through a Patience seal, Reset, the chips and Complete Argument). The permutations are in the jsdom matrix [X].
// Negotiation/two-blocks.md: the innkeeper (3 / 3) and the guard captain (2 / 4). Negotiation/unknown-keys.md: `note_to_self` and a `gm_note`
// in the motivation "Legacy" and in the pitfall "Pride".
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { argOf, BASIC, blockOf, chooseReset, interestOf, interestSeal, NEGO, openMenu, openNego, patienceOf, patienceSeal, TWINS, TWO, UNKNOWN } from '../../driver/negotiation';

describe('negotiation: the note and the other blocks around a write', () => {
	it('[NEGO-X01] a Patience click in the SECOND of two blocks changes that block only', async () => {
		const root = await openNego(TWO, 1);
		const w = await dse.waitForWrite(TWO, () => dse.click(patienceSeal(root, 1)));
		expect(w.count).toBe(1);
		const second = await blockOf(TWO, 1);
		expect(second).toMatchObject({ name: 'Second: the guard captain', current_patience: 1 });
		const first = await blockOf(TWO, 0);
		expect(first).toMatchObject({ name: 'First: the innkeeper', initial_patience: 3 });
		expect(first.current_patience).toBeUndefined();
		expect(first.current_interest).toBeUndefined();
	});

	it('[NEGO-X02] Reset in the SECOND of two blocks resets that block only; the first keeps its own moved standing', async () => {
		const first = await openNego(TWO, 0);
		await dse.waitForWrite(TWO, () => dse.click(patienceSeal(first, 2)));
		const root = dse.block('ds-negotiation', 1);
		await dse.waitForWrite(TWO, () => dse.click(patienceSeal(root, 1)));
		await openMenu(root);
		await chooseReset(TWO);
		const b1 = await blockOf(TWO, 1);
		expect([patienceOf(b1), interestOf(b1)]).toEqual([4, 2]);
		expect(patienceOf(await blockOf(TWO, 0))).toBe(2);
	});

	it('[NEGO-X03] the prose above and below the block, and the heading, are byte-for-byte what they were after a write', async () => {
		const root = await openNego(BASIC);
		await dse.waitForWrite(BASIC, () => dse.click(patienceSeal(root, 1)));
		const text = await dse.noteText(BASIC);
		expect(text.startsWith('# Negotiation\n\nABOVE\n\n```ds-negotiation\n')).toBe(true);
		expect(text.endsWith('\n```\n\nBELOW\n')).toBe(true);
	});

	it('[NEGO-X04] a hand edit made to the note while the card is open (the block and the prose) is still there after the next click', async () => {
		await openNego(BASIC);
		await dse.externalEdit(BASIC, `c.replace('ABOVE', 'ABOVE EDITED').replace('The Shire is life', 'The Shire is life EDITED')`);
		await dse.waitFor(`document.querySelector('.markdown-reading-view [data-dse-element="negotiation"]')?.textContent.includes('The Shire is life EDITED')`, 'the card to show the hand edit');
		await dse.waitForWrite(BASIC, () => dse.click(patienceSeal(dse.block('ds-negotiation'), 1)));
		const text = await dse.noteText(BASIC);
		expect(text).toContain('ABOVE EDITED');
		expect((await blockOf(BASIC)).motivations![1].reason).toBe('The Shire is life EDITED');
		expect(patienceOf(await blockOf(BASIC))).toBe(1);
		await dse.externalEdit(BASIC, `c.replace('ABOVE EDITED', 'ABOVE')`); // put the prose back: the driver checks every note for text outside its blocks
		await dse.settle();
	});

	it('[NEGO-X05] a write adds no key the block never declared: no currentArgument, no current_interest, no hasBeenAppealedTo, no reason or name rewritten', async () => {
		const root = await openNego(BASIC);
		await dse.waitForWrite(BASIC, () => dse.click(patienceSeal(root, 1)));
		const b = await blockOf(BASIC);
		expect(Object.keys(b).sort()).toEqual(['current_patience', 'i0', 'i1', 'i2', 'i3', 'i4', 'i5', 'initial_interest', 'initial_patience', 'motivations', 'name', 'pitfalls']);
		expect(b.motivations!.map((m) => Object.keys(m).sort())).toEqual([['name', 'reason'], ['name', 'reason']]);
	});

	it('[NEGO-X08] a click in the SECOND of two IDENTICAL blocks changes that block only, and then a click in the FIRST changes the first only', async () => {
		const bodies = async (): Promise<string[]> => [...(await dse.noteText(TWINS)).matchAll(/```ds-negotiation\n([\s\S]*?)\n```/g)].map((m) => m[1]);
		const before = await (async () => { await openNego(TWINS, 1); return bodies(); })();
		expect(before[0]).toBe(before[1]);
		await dse.waitForWrite(TWINS, () => dse.click(patienceSeal(dse.block('ds-negotiation', 1), 1)));
		await dse.settle();
		const mid = await bodies();
		expect(mid[0]).toBe(before[0]);
		expect(mid[1]).toContain('current_patience: 1');
		await dse.waitForWrite(TWINS, () => dse.click(interestSeal(dse.block('ds-negotiation', 0), 4)));
		await dse.settle();
		const after = await bodies();
		expect(after[0]).toContain('current_interest: 4');
		expect(after[0]).not.toContain('current_patience');
		expect(after[1]).toBe(mid[1]);
		const text = await dse.noteText(TWINS);
		expect(text.startsWith('# Twins\n\nABOVE\n\n')).toBe(true);
		expect(text).toContain('\n\nBETWEEN\n\n');
		expect(text.endsWith('\n\nBELOW\n')).toBe(true);
	});

	it('[NEGO-X06] a write keeps a top-level key the element does not know', async () => {
		const root = await openNego(UNKNOWN);
		await dse.waitForWrite(UNKNOWN, () => dse.click(patienceSeal(root, 1)));
		expect(await blockOf(UNKNOWN)).toMatchObject({ note_to_self: 'The Duke lies about the toll', current_patience: 1 });
	});

	it('[NEGO-X07] a write keeps a key the element does not know inside a motivation and inside a pitfall', async () => {
		const root = await openNego(UNKNOWN);
		await dse.waitForWrite(UNKNOWN, () => dse.click(patienceSeal(root, 1)));
		const b = await blockOf(UNKNOWN);
		expect(b.motivations![0]).toMatchObject({ name: 'Legacy', gm_note: 'ask about the sister' });
		expect(b.pitfalls![0]).toMatchObject({ name: 'Pride', gm_note: 'never mention the war' });
	});

	/** The Director's own keys, as the unknown-keys fixture holds them, after a write: kept, and written after the known keys. */
	const expectOwnKeysKept = (b: Awaited<ReturnType<typeof blockOf>>): void => {
		expect(b).toMatchObject({ note_to_self: 'The Duke lies about the toll' });
		expect(b.motivations![0]).toMatchObject({ name: 'Legacy', gm_note: 'ask about the sister' });
		expect(b.pitfalls![0]).toMatchObject({ name: 'Pride', gm_note: 'never mention the war' });
		expect(Object.keys(b).slice(-1)).toEqual(['note_to_self']);
		expect(Object.keys(b.motivations![0]).slice(-1)).toEqual(['gm_note']);
		expect(Object.keys(b.pitfalls![0]).slice(-1)).toEqual(['gm_note']);
	};

	it('[NEGO-X09] Reset negotiation keeps the keys the element does not know: it resets the tracker, not the Director\'s own keys', async () => {
		const root = await openNego(UNKNOWN);
		await dse.waitForWrite(UNKNOWN, () => dse.click(patienceSeal(root, 1)));
		await openMenu(root);
		await chooseReset(UNKNOWN);
		const b = await blockOf(UNKNOWN);
		expect(patienceOf(b)).toBe(3);
		expectOwnKeysKept(b);
	});

	it('[NEGO-X10] a Spent chip, an appeal chip and a pitfall chip each keep the keys the element does not know', async () => {
		const root = await openNego(UNKNOWN);
		await dse.waitForWrite(UNKNOWN, () => dse.click(root.control('negotiation.spent', { nth: 0 })));
		expect((await blockOf(UNKNOWN)).motivations![0]).toMatchObject({ name: 'Legacy', hasBeenAppealedTo: true });
		expectOwnKeysKept(await blockOf(UNKNOWN));
		await dse.waitForWrite(UNKNOWN, () => dse.click(root.control('negotiation.appeal.motivation', { nth: 1 })));
		expect(argOf(await blockOf(UNKNOWN)).motivationsUsed).toEqual(['Coin']);
		expectOwnKeysKept(await blockOf(UNKNOWN));
		await dse.waitForWrite(UNKNOWN, () => dse.click(root.control('negotiation.appeal.pitfall', { nth: 0 })));
		expect(argOf(await blockOf(UNKNOWN)).pitfallsUsed).toEqual(['Pride']);
		expectOwnKeysKept(await blockOf(UNKNOWN));
	});

	it('[NEGO-X11] Complete Argument keeps the keys the element does not know', async () => {
		const root = await openNego(UNKNOWN);
		await dse.waitForWrite(UNKNOWN, () => dse.click(root.control('negotiation.appeal.motivation', { nth: 1 })));
		await dse.click(root.control('negotiation.tier.row', { nth: 2 }));
		await dse.waitForWrite(UNKNOWN, () => dse.click(root.control('negotiation.complete')));
		const b = await blockOf(UNKNOWN);
		expect([interestOf(b), patienceOf(b)]).toEqual([4, 3]); // the argument was completed: the standing moved
		expect(b.motivations![1]).toMatchObject({ name: 'Coin', hasBeenAppealedTo: true });
		expectOwnKeysKept(b);
	});

	it('[NEGO-X12] a hand edit to a key the element does not know (top level, in a motivation and in a pitfall), made while the card is drawn, is kept by the next write', async () => {
		await dse.openNote(UNKNOWN);
		await dse.externalEdit(UNKNOWN, `c.replace('The Duke lies about the toll', 'edited by hand').replace('ask about the sister', 'edited too').replace('never mention the war', 'and this')`);
		await dse.settle();
		const root = dse.block(NEGO);
		await dse.waitForWrite(UNKNOWN, () => dse.click(patienceSeal(root, 1)));
		const b = await blockOf(UNKNOWN);
		expect(b).toMatchObject({ note_to_self: 'edited by hand' });
		expect(b.motivations![0]).toMatchObject({ gm_note: 'edited too' });
		expect(b.pitfalls![0]).toMatchObject({ gm_note: 'and this' });
	});

	it('[NEGO-X13] a key the element does not know that was deleted by hand while the card is drawn does not come back on the next write', async () => {
		await dse.openNote(UNKNOWN);
		await dse.externalEdit(UNKNOWN, `c.replace('note_to_self: "The Duke lies about the toll"\\n', '').replace('    gm_note: "ask about the sister"\\n', '').replace('    gm_note: "never mention the war"\\n', '')`);
		await dse.settle();
		const root = dse.block(NEGO);
		await dse.waitForWrite(UNKNOWN, () => dse.click(patienceSeal(root, 1)));
		const b = await blockOf(UNKNOWN);
		expect('note_to_self' in b).toBe(false);
		expect('gm_note' in b.motivations![0]).toBe(false);
		expect('gm_note' in b.pitfalls![0]).toBe(false);
	});
});
