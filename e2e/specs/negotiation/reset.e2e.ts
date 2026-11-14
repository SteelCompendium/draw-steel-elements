// SC-439 [R]: the options button and its Reset menu (Obsidian's own Menu, with its one item "Reset negotiation"). The table of every state
// a reset can start from is in the jsdom matrix; here a real click / Enter opens the native menu and a real click on its item resets the
// block. Negotiation/basic.md: Interest 3 / Patience 3 (both initial). Negotiation/ended.md: Patience 0 at Interest 3, both motivations spent.
import { expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { argOf, BASIC, blockOf, chooseReset, ENDED, interestOf, interestSeal, openMenu, openNego, patienceOf, patienceSeal, pressedOf, shown, TABS, tierTexts } from '../../driver/negotiation';

describe('negotiation: Reset negotiation', () => {
	it('[NEGO-R01] the options button opens the menu and Reset puts a moved negotiation back: standing, spent motivations and the argument, in one write, with a Notice', async () => {
		const root = await openNego(BASIC);
		await dse.waitForWrite(BASIC, () => dse.click(patienceSeal(root, 1)));
		await dse.waitForWrite(BASIC, () => dse.click(interestSeal(root, 4)));
		await dse.waitForWrite(BASIC, () => dse.click(root.control('negotiation.spent', { nth: 0 })));
		await dse.waitForWrite(BASIC, () => dse.click(root.control('negotiation.appeal.motivation', { nth: 1 })));
		expect(await shown()).toMatchObject({ patience: [1], interest: [4] });
		await openMenu(root);
		await expect(dse.control({ css: '.menu .menu-item' })).toHaveText('Reset negotiation');
		expect(await dse.page<number>(`document.querySelectorAll('.menu .menu-item').length`)).toBe(1);
		expect(await chooseReset(BASIC)).toBe(1);
		await dse.waitFor(`[...document.querySelectorAll('.notice')].some((n) => n.textContent.includes('Negotiation reset to initial state'))`, 'the reset Notice');
		const b = await blockOf(BASIC);
		expect([patienceOf(b), interestOf(b)]).toEqual([3, 3]);
		expect(b.motivations!.map((m) => m.hasBeenAppealedTo ?? false)).toEqual([false, false]);
		expect(argOf(b).motivationsUsed).toEqual([]);
		expect(await shown()).toMatchObject({ patience: [3], interest: [3], ended: null });
		expect(await pressedOf('negotiation.spent')).toEqual(['false', 'false']);
		expect(await pressedOf('negotiation.appeal.motivation')).toEqual(['false', 'false']);
	});

	it('[NEGO-R02] Enter on the focused options button opens the menu; Escape closes it with nothing written and the moved negotiation untouched', async () => {
		const root = await openNego(BASIC);
		await dse.waitForWrite(BASIC, () => dse.click(patienceSeal(root, 1)));
		const menu = root.control('negotiation.menu');
		await dse.tabTo(menu, TABS);
		await dse.expectNoWrite(BASIC, async () => {
			await dse.press('Enter', menu);
			await dse.waitFor(`document.querySelectorAll('.menu').length === 1`, 'the menu to open from the keyboard');
			await expect(dse.control({ css: '.menu .menu-item' })).toHaveText('Reset negotiation');
			await dse.press('Escape');
			await dse.waitFor(`document.querySelectorAll('.menu').length === 0`, 'the menu to close');
		});
		expect((await shown()).patience).toEqual([1]);
		expect(patienceOf(await blockOf(BASIC))).toBe(1);
	});

	it('[NEGO-R03] Reset reopens an ended negotiation: the band goes, the four tiers come back, the standing is the initial one', async () => {
		const root = await openNego(ENDED);
		expect(await shown()).toMatchObject({ ended: 'final', band: 'Final offer' });
		expect(await tierTexts()).toEqual([]);
		await openMenu(root);
		await chooseReset(ENDED);
		expect(await shown()).toMatchObject({ patience: [3], interest: [3], ended: null, band: null });
		expect(await tierTexts()).toHaveLength(4);
		const b = await blockOf(ENDED);
		expect([patienceOf(b), interestOf(b)]).toEqual([3, 3]);
		expect(b.motivations!.map((m) => m.hasBeenAppealedTo ?? false)).toEqual([false, false]);
	});

	it('[NEGO-R04] Reset on a negotiation that is already in its initial state writes nothing', async () => {
		const root = await openNego(BASIC);
		await openMenu(root);
		await chooseReset(BASIC); // the first Reset rewrites the hand-formatted YAML in the tracker's own: that is a change
		await dse.hover(root.root);
		await openMenu(root);
		await dse.expectNoWrite(BASIC, async () => {
			await dse.click(dse.control('negotiation.menu.reset'));
			await dse.waitFor(`document.querySelectorAll('.menu').length === 0`, 'the menu to close');
		});
		expect(await shown()).toMatchObject({ patience: [3], interest: [3] });
	});

	it('[NEGO-R05] Reset chosen from the keyboard (Enter on the options button, ArrowDown, Enter on the Reset item) resets the moved negotiation in one write, with the Notice', async () => {
		const root = await openNego(BASIC);
		await dse.waitForWrite(BASIC, () => dse.click(patienceSeal(root, 1)));
		await dse.waitForWrite(BASIC, () => dse.click(root.control('negotiation.spent', { nth: 0 })));
		const menu = root.control('negotiation.menu');
		await dse.tabTo(menu, TABS);
		await dse.press('Enter', menu);
		await dse.waitFor(`document.querySelectorAll('.menu').length === 1`, 'the menu to open');
		await dse.press('ArrowDown'); // the menu's own Scope selects its first item
		const w = await dse.waitForWrite(BASIC, () => dse.press('Enter', dse.aimedAt('negotiation.menu.reset')));
		expect(w.count).toBe(1);
		await dse.waitFor(`document.querySelectorAll('.menu').length === 0`, 'the menu to close');
		await dse.waitFor(`[...document.querySelectorAll('.notice')].some((n) => n.textContent.includes('Negotiation reset to initial state'))`, 'the reset Notice');
		const b = await blockOf(BASIC);
		expect([patienceOf(b), interestOf(b)]).toEqual([3, 3]);
		expect(b.motivations!.map((m) => m.hasBeenAppealedTo ?? false)).toEqual([false, false]);
		expect(await shown()).toMatchObject({ patience: [3], interest: [3], ended: null });
		expect(await pressedOf('negotiation.spent')).toEqual(['false', 'false']);
	});

	knownBug('SC-648', '[NEGO-R06] the options menu opened with Enter on the button appears beside the button, not in the window corner', async () => {
		const root = await openNego(BASIC);
		const menu = root.control('negotiation.menu');
		await dse.tabTo(menu, TABS);
		await dse.press('Enter', menu);
		try {
			await dse.waitFor(`document.querySelectorAll('.menu').length === 1`, 'the menu to open');
			// within 300 px of the button's box in both directions (a tolerance, not exact coordinates)
			const near = await dse.page<boolean>(`(() => {
				const b = document.querySelector('.markdown-reading-view [data-dse-control="negotiation.menu"]').getBoundingClientRect();
				const m = document.querySelector('.menu').getBoundingClientRect();
				return m.right >= b.left - 300 && m.left <= b.right + 300 && m.bottom >= b.top - 300 && m.top <= b.bottom + 300;
			})()`);
			if (!near) throw new Error('the options menu opened away from the button');
		} finally {
			await dse.press('Escape');
			await dse.waitFor(`document.querySelectorAll('.menu').length === 0`, 'the menu to close');
		}
	}, { failsWith: /opened away from the button/ });
});
