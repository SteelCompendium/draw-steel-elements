// SC-438 [W]: hand-written values that are not what the product expects, and a state the band words badly. Each marker states the CORRECT behaviour
// only as far as the ticket rules: SC-628 (a number as the title must not break the block; Add a round on `rounds: "3"` must reach 4, not "31"), SC-629
// (the verdict word and the rule line below it must agree, in whatever words). Montage/wrong-title.md, Montage/quoted-rounds.md, Montage/no-action.md.
import { expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { blockOf, MONTAGE } from '../../driver/montage';

describe('montage: values the Director typed by hand', () => {
	knownBug('SC-628', '[MONT-W01] a title that is a YAML number (`title: 2024`) renders the montage, not an error card', async () => {
		await dse.openNote('Montage/wrong-title.md');
		const root = dse.block(MONTAGE);
		await expect(root.control({ css: '.dse-error-card' })).not.toBeExisting();
		await expect(root.control({ css: '.dse-mt' })).toBeExisting();
	});

	knownBug('SC-628', '[MONT-W02] Add a round on `rounds: "3"` makes it 4 rounds (not the text "31")', async () => {
		await dse.openNote('Montage/quoted-rounds.md');
		const root = dse.block(MONTAGE);
		await dse.hover(root.root);
		await dse.waitForWrite('Montage/quoted-rounds.md', () => dse.click(root.control('montage.chrome.add-round')));
		expect(Number((await blockOf('Montage/quoted-rounds.md')).rounds)).toBe(4);
	});

	knownBug('SC-629', '[MONT-W03] the verdict word and the rule line agree when the rounds ran out with nothing logged (both claim a failure, or neither does)', async () => {
		await dse.openNote('Montage/no-action.md');
		const root = dse.block(MONTAGE);
		const word = (await root.control({ css: '.dse-mt__verdict-word' }).getProperty('textContent')) as string;
		const rule = (await root.control({ css: '.dse-mt__verdict-rule' }).getProperty('textContent')) as string;
		expect(/failure/i.test(word)).toBe(/failure/i.test(rule));
	});
});
