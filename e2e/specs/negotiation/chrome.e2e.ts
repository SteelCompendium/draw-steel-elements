// SC-439 [C]: the framework chrome on a negotiation: Collapse folds the card into its one-line form and Expand brings it back. The collapsed
// state is session-only, so neither press writes the note. (The chrome buttons' own pairs are in manifest/chrome.ts.)
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { BASIC, openNego } from '../../driver/negotiation';

describe('negotiation: the chrome panel', () => {
	it('[NEGO-C01] Collapse shows the one-line form ("Negotiation: name (Interest 3 · Patience 3)") and Expand restores the card, with no write', async () => {
		const root = await openNego(BASIC);
		await dse.expectNoWrite(BASIC, async () => {
			await dse.hover(root.root);
			await dse.click(root.control('chrome.collapse'));
			await expect(root.root).toHaveAttribute('data-dse-collapsed', 'on');
			await expect(root.control({ css: '.dse-chrome-summary' })).toHaveText(expect.stringContaining('Interest 3 · Patience 3'));
			await expect(root.control({ css: '.dse-nt' })).not.toBeDisplayed();
			await dse.click(root.control('chrome.expand'));
			await expect(root.root).not.toHaveAttribute('data-dse-collapsed', 'on');
			await expect(root.control({ css: '.dse-nt' })).toBeDisplayed();
			await expect(root.control({ css: '.dse-nt__patience' })).toBeDisplayed();
		});
	});
});
