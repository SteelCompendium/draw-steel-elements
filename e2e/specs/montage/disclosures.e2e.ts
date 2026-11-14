// SC-438 [G]: the Test tiers strip and the "Running a montage test" guide: closed by default, opened by click (the strip also by Enter), never a write.
// Opening the strip rebuilds the whole montage (the guide's "Each test" block stands down while it is pinned), so the state must come back from the
// session. Montage/fresh.md: round 1 of 3.
import { expect } from '@wdio/globals';
import { dse } from '../../driver/dse';
import { blockOf, expectText, FRESH, MONTAGE, roundChip, TABS } from '../../driver/montage';

const hint = (root: ReturnType<typeof dse.block>) => root.control({ css: '.dse-mt__strip-hint' });

describe('montage: the strip and the guide', () => {
	it('[MONT-G01] the strip is closed at first; a click opens it ("pinned"), a second click closes it; the note is never written', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		await expect(root.control('montage.strip')).toHaveAttribute('aria-expanded', 'false');
		await expectText(hint(root), 'easy · medium · hard');
		await dse.expectNoWrite(FRESH, async () => {
			await dse.click(root.control('montage.strip'));
			await expect(root.control('montage.strip')).toHaveAttribute('aria-expanded', 'true');
			await expectText(hint(root), 'pinned');
			await expect(root.control({ css: '.dse-mt__tier-rows' })).toBeDisplayed();
			await dse.click(root.control('montage.strip'));
			await expect(root.control('montage.strip')).toHaveAttribute('aria-expanded', 'false');
		});
	});

	it('[MONT-G02] Enter on the focused strip header opens it, and the guide below it then drops its duplicate "Each test" table', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		const header = root.control('montage.strip');
		await dse.tabTo(header, TABS);
		await dse.expectNoWrite(FRESH, () => dse.press('Enter', header));
		await expect(root.control('montage.strip')).toHaveAttribute('aria-expanded', 'true');
		await expect(root.control({ css: '.dse-mt__guide' })).toHaveAttribute('data-strip-open', 'on');
	});

	it('[MONT-G03] the guide opens in place by click and shows its three tables; a click closes it again, with no write', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		await expect(root.control('montage.guide')).toHaveAttribute('aria-expanded', 'false');
		await dse.expectNoWrite(FRESH, async () => {
			await dse.click(root.control('montage.guide'));
			await expect(root.control('montage.guide')).toHaveAttribute('aria-expanded', 'true');
			await expect(root.control({ css: '.dse-mt__guide-body' })).toBeDisplayed();
			await dse.click(root.control('montage.guide'));
			await expect(root.control('montage.guide')).toHaveAttribute('aria-expanded', 'false');
		});
	});

	it('[MONT-G04] both disclosures keep their state across a write', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		await dse.click(root.control('montage.strip'));
		await dse.click(root.control('montage.guide'));
		await dse.waitForWrite(FRESH, () => dse.click(root.control('montage.bar.end-round')));
		await dse.settle();
		expect((await blockOf(FRESH)).current_round).toBe(2);
		await expectText(roundChip(root), 'Round 2 / 3');
		await expect(root.control('montage.strip')).toHaveAttribute('aria-expanded', 'true');
		await expect(root.control('montage.guide')).toHaveAttribute('aria-expanded', 'true');
	});
});
