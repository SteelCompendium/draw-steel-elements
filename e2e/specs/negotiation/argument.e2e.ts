// SC-439 [A]: the "Make an Argument" tab: appeal and mention chips, the three modifiers, the four tiers and Complete Argument. The
// 64 appeal x modifier x tier combinations and their written Interest / Patience are tabulated in the jsdom matrix; here real clicks and
// real keys drive each control and the note + screen are read. Negotiation/basic.md: Interest 3 / Patience 3, Higher Authority and Peace
// unspent, pitfall Power. Negotiation/spent.md: Higher Authority already spent (appealing to it is a reuse).
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { argOf, BASIC, blockOf, ENDED, focusState, interestOf, mods, openNego, patienceOf, pressedOf, shown, SPENT, TABS, tierTexts } from '../../driver/negotiation';

const NORMAL = ['-1 Interest, -1 Patience', '-1 Patience', '+1 Interest, -1 Patience', '+1 Interest'];
const MOTIVATION = ['-1 Patience', '+1 Interest, -1 Patience', '+1 Interest', '+1 Interest'];
const FAIL = ['-1 Interest, -1 Patience', '-1 Interest, -1 Patience', '-1 Interest, -1 Patience', '-1 Interest, -1 Patience'];

describe('negotiation: appeal and mention chips', () => {
	it('[NEGO-A01] a click on an appeal chip presses it, switches the tiers to the motivation table and writes motivationsUsed; a second click undoes it', async () => {
		const root = await openNego(BASIC);
		expect(await tierTexts()).toEqual(NORMAL);
		await dse.waitForWrite(BASIC, () => dse.click(root.control('negotiation.appeal.motivation', { nth: 0 })));
		expect(await pressedOf('negotiation.appeal.motivation')).toEqual(['true', 'false']);
		expect(await tierTexts()).toEqual(MOTIVATION);
		expect(argOf(await blockOf(BASIC))).toMatchObject({ motivationsUsed: ['Higher Authority'], pitfallsUsed: [] });
		await dse.waitForWrite(BASIC, () => dse.click(root.control('negotiation.appeal.motivation', { nth: 0 })));
		expect(await pressedOf('negotiation.appeal.motivation')).toEqual(['false', 'false']);
		expect(await tierTexts()).toEqual(NORMAL);
		expect(argOf(await blockOf(BASIC)).motivationsUsed).toEqual([]);
	});

	it('[NEGO-A02] a click on a pitfall chip presses it, every tier becomes -1 Interest / -1 Patience, and pitfallsUsed is written', async () => {
		const root = await openNego(BASIC);
		await dse.waitForWrite(BASIC, () => dse.click(root.control('negotiation.appeal.pitfall', { nth: 0 })));
		expect(await pressedOf('negotiation.appeal.pitfall')).toEqual(['true']);
		expect(await tierTexts()).toEqual(FAIL);
		expect(argOf(await blockOf(BASIC)).pitfallsUsed).toEqual(['Power']);
		await dse.waitForWrite(BASIC, () => dse.click(root.control('negotiation.appeal.pitfall', { nth: 0 })));
		expect(await tierTexts()).toEqual(NORMAL);
	});

	it('[NEGO-A03] Enter on a focused chip toggles it and focus stays on it, for an appeal chip and a mention chip', async () => {
		const root = await openNego(BASIC);
		const peace = root.control('negotiation.appeal.motivation', { nth: 1 });
		await dse.tabTo(peace, TABS);
		await dse.waitForWrite(BASIC, () => dse.press('Enter', peace));
		expect(await pressedOf('negotiation.appeal.motivation')).toEqual(['false', 'true']);
		expect(argOf(await blockOf(BASIC)).motivationsUsed).toEqual(['Peace']);
		expect(await focusState()).toMatchObject({ ctl: 'negotiation.appeal.motivation', inCard: true });
		const power = root.control('negotiation.appeal.pitfall', { nth: 0 });
		await dse.tabTo(power, 6);
		await dse.waitForWrite(BASIC, () => dse.press('Enter', power));
		expect(await pressedOf('negotiation.appeal.pitfall')).toEqual(['true']);
		expect(argOf(await blockOf(BASIC)).pitfallsUsed).toEqual(['Power']);
		expect(await focusState()).toMatchObject({ ctl: 'negotiation.appeal.pitfall', inCard: true });
	});
});

describe('negotiation: the modifiers', () => {
	it('[NEGO-A04] each modifier checkbox flips its flag, rewrites the tiers and is written; reusing a spent motivation switches "reuse" on, and it can be switched off by hand', async () => {
		const root = await openNego(SPENT);
		await dse.waitForWrite(SPENT, () => dse.click(root.control('negotiation.mod.lie')));
		expect((await mods()).lie.checked).toBe(true);
		expect(await tierTexts()).toEqual(['-2 Interest, -1 Patience', '-1 Interest, -1 Patience', '+1 Interest, -1 Patience', '+1 Interest']);
		expect(argOf(await blockOf(SPENT)).lieUsed).toBe(true);
		await dse.waitForWrite(SPENT, () => dse.click(root.control('negotiation.mod.same')));
		expect((await mods()).same.checked).toBe(true);
		expect(await tierTexts()).toEqual(['-2 Interest, -1 Patience', '-2 Interest, -1 Patience', '-2 Interest, -1 Patience', '-2 Interest, -1 Patience']); // same argument: -1 / -1 everywhere, and the lie costs one more Interest
		expect(argOf(await blockOf(SPENT)).sameArgumentUsed).toBe(true);
		// appealing to the spent motivation arms "reuse" (and greys the same-argument line out)
		await dse.waitForWrite(SPENT, () => dse.click(root.control('negotiation.appeal.motivation', { nth: 0 })));
		expect(await mods()).toMatchObject({ reuse: { checked: true, disabled: false, why: null }, same: { disabled: true } });
		expect(argOf(await blockOf(SPENT)).reusedMotivation).toBe(true);
		await dse.waitForWrite(SPENT, () => dse.click(root.control('negotiation.mod.reuse')));
		expect((await mods()).reuse.checked).toBe(false);
		expect(argOf(await blockOf(SPENT)).reusedMotivation).toBe(false);
	});

	it('[NEGO-A05] a modifier that cannot apply is greyed out with its reason, and clicking it changes nothing and writes nothing', async () => {
		const root = await openNego(BASIC);
		expect((await mods()).reuse).toEqual({ checked: false, disabled: true, why: 'only when a spent Motivation is appealed to' });
		await dse.expectNoWrite(BASIC, () => dse.click(root.control('negotiation.mod.reuse')));
		expect((await mods()).reuse.checked).toBe(false);
		expect(await tierTexts()).toEqual(NORMAL);
		// with a motivation appealed to, "same argument" is the one that cannot apply
		await dse.waitForWrite(BASIC, () => dse.click(root.control('negotiation.appeal.motivation', { nth: 1 })));
		expect((await mods()).same).toEqual({ checked: false, disabled: true, why: 'not while a Motivation is appealed to' });
		await dse.expectNoWrite(BASIC, () => dse.click(root.control('negotiation.mod.same')));
		expect((await mods()).same.checked).toBe(false);
		expect(argOf(await blockOf(BASIC)).sameArgumentUsed).toBe(false);
	});
});

describe('negotiation: the modifier checkboxes by keyboard and by their labels', () => {
	it('[NEGO-A12] Space on a focused modifier checkbox toggles it: a caught lie, the same argument, and Reuse once a spent motivation is appealed to', async () => {
		const root = await openNego(SPENT);
		const lie = root.control('negotiation.mod.lie');
		await dse.tabTo(lie, TABS);
		await dse.waitForWrite(SPENT, () => dse.press('Space', lie));
		expect((await mods()).lie.checked).toBe(true);
		expect(argOf(await blockOf(SPENT)).lieUsed).toBe(true);
		expect(await focusState()).toMatchObject({ ctl: 'negotiation.mod.lie', inCard: true });
		const same = root.control('negotiation.mod.same');
		await dse.tabTo(same, 4);
		await dse.waitForWrite(SPENT, () => dse.press('Space', same));
		expect((await mods()).same.checked).toBe(true);
		expect(argOf(await blockOf(SPENT)).sameArgumentUsed).toBe(true);
		await dse.waitForWrite(SPENT, () => dse.click(root.control('negotiation.appeal.motivation', { nth: 0 }))); // the spent one: Reuse arms itself
		expect((await mods()).reuse).toMatchObject({ checked: true, disabled: false });
		const reuse = root.control('negotiation.mod.reuse');
		await dse.tabTo(reuse, TABS);
		await dse.waitForWrite(SPENT, () => dse.press('Space', reuse));
		expect((await mods()).reuse.checked).toBe(false);
		expect(argOf(await blockOf(SPENT)).reusedMotivation).toBe(false);
	});

	it('[NEGO-A13] a click on a modifier line\'s text toggles its checkbox (the label is the large target), one write each', async () => {
		const root = await openNego(SPENT);
		await dse.waitForWrite(SPENT, () => dse.click(root.control('negotiation.mod.lie.label')));
		expect((await mods()).lie.checked).toBe(true);
		expect(argOf(await blockOf(SPENT)).lieUsed).toBe(true);
		await dse.waitForWrite(SPENT, () => dse.click(root.control('negotiation.mod.same.label')));
		expect((await mods()).same.checked).toBe(true);
		expect(argOf(await blockOf(SPENT)).sameArgumentUsed).toBe(true);
		await dse.waitForWrite(SPENT, () => dse.click(root.control('negotiation.appeal.motivation', { nth: 0 })));
		await dse.waitForWrite(SPENT, () => dse.click(root.control('negotiation.mod.reuse.label')));
		expect((await mods()).reuse.checked).toBe(false);
		expect(argOf(await blockOf(SPENT)).reusedMotivation).toBe(false);
		await dse.waitForWrite(SPENT, () => dse.click(root.control('negotiation.mod.lie.label'))); // and a second click on the text clears it again
		expect((await mods()).lie.checked).toBe(false);
	});
});

describe('negotiation: the tiers and Complete Argument', () => {
	it('[NEGO-A06] a click on a tier chooses it (one at a time), marks it "chosen" and arms Complete, with no write', async () => {
		const root = await openNego(BASIC);
		expect((await shown()).completeDisabled).toBe(true);
		await dse.expectNoWrite(BASIC, async () => {
			await dse.click(root.control('negotiation.tier.row', { nth: 2 }));
			await expect(root.control('negotiation.tier.row', { nth: 2 })).toHaveAttribute('aria-checked', 'true');
			await expect(root.control('negotiation.tier.row', { nth: 2 })).toHaveText(expect.stringContaining('chosen'));
			expect(await shown()).toMatchObject({ completeDisabled: false, hint: 'Applies the chosen tier to Interest and Patience' });
			await expect(root.control('negotiation.complete')).toHaveElementClass('dse-btn--accent', { message: 'an armed Complete is accented' });
			await dse.click(root.control('negotiation.tier.row', { nth: 0 }));
			await expect(root.control('negotiation.tier.row', { nth: 0 })).toHaveAttribute('aria-checked', 'true');
			await expect(root.control('negotiation.tier.row', { nth: 2 })).toHaveAttribute('aria-checked', 'false');
		});
	});

	it('[NEGO-A07] the arrow keys, Home and End move the chosen tier (focus with it), with no write', async () => {
		const root = await openNego(BASIC);
		const group = root.control('negotiation.tier');
		const checked = async () => (await dse.page<string[]>(`[...document.querySelectorAll('.markdown-reading-view [data-dse-control="negotiation.tier.row"]')].map((r) => r.getAttribute('aria-checked'))`)).indexOf('true');
		await dse.tabTo(root.control('negotiation.tier.row', { nth: 0 }), TABS);
		await dse.expectNoWrite(BASIC, async () => {
			const steps: Array<[string, number]> = [['ArrowDown', 1], ['ArrowRight', 2], ['ArrowUp', 1], ['ArrowLeft', 0], ['End', 3], ['Home', 0]];
			for (const [key, row] of steps) {
				await dse.press(key, group);
				expect(await checked()).toBe(row);
				expect(await focusState()).toMatchObject({ ctl: 'negotiation.tier.row', inCard: true });
			}
			expect((await shown()).completeDisabled).toBe(false);
		});
	});

	it('[NEGO-A08] Enter on the focused first tier chooses it and arms Complete, with no write', async () => {
		const root = await openNego(BASIC);
		const first = root.control('negotiation.tier.row', { nth: 0 });
		await dse.tabTo(first, TABS);
		await dse.expectNoWrite(BASIC, async () => {
			await dse.press('Enter', first);
			await expect(first).toHaveAttribute('aria-checked', 'true');
			expect((await shown()).completeDisabled).toBe(false);
		});
	});

	it('[NEGO-A09] Complete Argument applies the chosen tier: Interest moves, the appealed motivation is spent, the argument is cleared, and one write carries it all', async () => {
		const root = await openNego(BASIC);
		await dse.waitForWrite(BASIC, () => dse.click(root.control('negotiation.appeal.motivation', { nth: 0 })));
		await dse.click(root.control('negotiation.tier.row', { nth: 2 })); // High with an appeal: +1 Interest
		const w = await dse.waitForWrite(BASIC, () => dse.click(root.control('negotiation.complete')));
		expect(w.count).toBe(1);
		const b = await blockOf(BASIC);
		expect([interestOf(b), patienceOf(b)]).toEqual([4, 3]);
		expect(b.motivations![0].hasBeenAppealedTo).toBe(true);
		expect(argOf(b)).toEqual({ motivationsUsed: [], pitfallsUsed: [], lieUsed: false, sameArgumentUsed: false, reusedMotivation: false });
		expect(await shown()).toMatchObject({ interest: [4], patience: [3], completeDisabled: true });
		expect(await pressedOf('negotiation.appeal.motivation')).toEqual(['false', 'false']);
		expect(await pressedOf('negotiation.spent')).toEqual(['true', 'false']);
		expect(await tierTexts()).toEqual(NORMAL);
		await expect(root.control('negotiation.tier.row', { nth: 2 })).toHaveAttribute('aria-checked', 'false');
	});

	it('[NEGO-A10] Complete is disabled until a tier is chosen and once the negotiation is over: a click does nothing and writes nothing', async () => {
		const root = await openNego(BASIC);
		await expect(root.control('negotiation.complete')).toBeDisabled();
		await dse.expectNoWrite(BASIC, () => dse.click(root.control('negotiation.complete')));
		expect(await shown()).toMatchObject({ interest: [3], patience: [3] });
		await dse.openNote(ENDED);
		const ended = (await shown());
		expect(ended).toMatchObject({ ended: 'final', completeDisabled: true });
		expect(ended.hint).toMatch(/^The negotiation is over/);
		expect(await tierTexts()).toEqual([]); // nothing to choose: the tiers are static
		await dse.expectNoWrite(ENDED, () => dse.click(dse.block('ds-negotiation').control('negotiation.complete')));
	});

	it('[NEGO-A11] Enter on the focused Complete Argument applies the chosen tier (a crit: +1 Interest, no Patience cost) in one write', async () => {
		const root = await openNego(BASIC);
		await dse.click(root.control('negotiation.tier.row', { nth: 3 }));
		const complete = root.control('negotiation.complete');
		await dse.tabTo(complete, TABS);
		const w = await dse.waitForWrite(BASIC, () => dse.press('Enter', complete));
		expect(w.count).toBe(1);
		const b = await blockOf(BASIC);
		expect([interestOf(b), patienceOf(b)]).toEqual([4, 3]);
		expect(await shown()).toMatchObject({ interest: [4], patience: [3], completeDisabled: true });
	});
});
