// SC-439 [T]: the two tabs ("Make an Argument", "Learn Motivation/Pitfall"). Which panel shows from each start, by click and by key,
// is tabulated in the jsdom matrix (test/dom/elements/negotiation-matrix.test.ts); here real pointer and key events drive each
// control and the note + screen are read. Negotiation/basic.md: Frodo, Interest 3 / Patience 3. The open tab is session state:
// a tab change must never write the note.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { BASIC, blockOf, expectLearnShowing, focusState, openNego, patienceSeal, shown, TABS } from '../../driver/negotiation';

describe('negotiation: the tabs', () => {
	it('[NEGO-T01] a click on each tab shows its panel and hides the other, and writes nothing', async () => {
		const root = await openNego(BASIC);
		await expect(root.control('negotiation.tab.argument')).toHaveAttribute('aria-selected', 'true'); // the default
		await expectLearnShowing(root, false);
		await dse.expectNoWrite(BASIC, async () => {
			await dse.click(root.control('negotiation.tab.learn-more'));
			await expect(root.control('negotiation.tab.learn-more')).toHaveAttribute('aria-selected', 'true');
			await expect(root.control('negotiation.tab.argument')).toHaveAttribute('aria-selected', 'false');
			await expectLearnShowing(root, true);
			await expect(root.control({ css: '.dse-nt__argument' })).not.toBeDisplayed();
			await expect(root.control({ css: '.dse-nt__learn-more' })).toHaveText(expect.stringContaining('If the heroes want to learn one of the NPC'));
			await dse.click(root.control('negotiation.tab.argument'));
			await expect(root.control('negotiation.tab.argument')).toHaveAttribute('aria-selected', 'true');
			await expectLearnShowing(root, false);
			await expect(root.control({ css: '.dse-nt__argument' })).toBeDisplayed();
		});
	});

	it('[NEGO-T02] the arrow keys, Home and End move the selection (and focus with it), wrapping, with no write', async () => {
		const root = await openNego(BASIC);
		const list = root.control('negotiation.tablist');
		const tab = (id: 'argument' | 'learn-more') => root.control(`negotiation.tab.${id}`);
		await dse.tabTo(tab('argument'), TABS);
		await dse.expectNoWrite(BASIC, async () => {
			await dse.press('ArrowRight', list);
			await expect(tab('learn-more')).toHaveAttribute('aria-selected', 'true');
			expect((await focusState()).ctl).toBe('negotiation.tab.learn-more'); // selection follows focus
			await expectLearnShowing(root, true);
			await dse.press('ArrowRight', list); // wraps
			await expect(tab('argument')).toHaveAttribute('aria-selected', 'true');
			await dse.press('ArrowLeft', list); // wraps the other way
			await expect(tab('learn-more')).toHaveAttribute('aria-selected', 'true');
			await dse.press('Home', list);
			await expect(tab('argument')).toHaveAttribute('aria-selected', 'true');
			await expectLearnShowing(root, false);
			await dse.press('End', list);
			await expect(tab('learn-more')).toHaveAttribute('aria-selected', 'true');
			await expectLearnShowing(root, true);
		});
	});

	it('[NEGO-T03] the tab the Director is on survives a write: a Patience change made from the Learn tab leaves it showing', async () => {
		const root = await openNego(BASIC);
		await dse.click(root.control('negotiation.tab.learn-more'));
		await dse.waitForWrite(BASIC, () => dse.click(patienceSeal(root, 1)));
		await dse.settle();
		expect((await blockOf(BASIC)).current_patience).toBe(1);
		expect((await shown()).tab).toBe('negotiation.tab.learn-more');
		await expectLearnShowing(root, true);
	});
});
