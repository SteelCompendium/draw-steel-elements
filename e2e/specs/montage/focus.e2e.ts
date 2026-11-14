// SC-438 [F]: keyboard focus after the montage saves. Every write rebuilds the whole montage (it empties its root and mounts again); a keyboard user
// who pressed Enter on End round, on the Test tiers strip or on Log in a sheet should still have focus on the control that replaced it, as the
// initiative tracker gives them (focus-after-rebuild.e2e.ts).
// Montage/fresh.md: round 1 of 3.
import { expect } from '@wdio/globals';
import { dse, knownBug } from '../../driver/dse';
import { blockOf, closeDisclosures, focusState, FRESH, MONTAGE, TABS } from '../../driver/montage';

describe('montage: keyboard focus after the montage rebuilds', () => {
	knownBug('SC-626', '[MONT-F01] Enter on End round: the rebuilt End round button holds focus', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		const end = root.control('montage.bar.end-round');
		await dse.tabTo(end, TABS);
		dse.embeddedTarget(FRESH, MONTAGE); // the key goes to the page (End round x Enter is no manifest pair): declare the block it edits
		await dse.waitForWrite(FRESH, () => dse.press('Enter'));
		await dse.settle();
		expect((await blockOf(FRESH)).current_round).toBe(2);
		const f = await focusState();
		expect(f.ctl).toBe('montage.bar.end-round');
		expect(f.inMontage).toBe(true);
	}, { failsWith: /Received: null/ });

	knownBug('SC-626', '[MONT-F02] Enter on the Test tiers strip header: the rebuilt header holds focus', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		await closeDisclosures(root); // the open state outlives a test (session store)
		const header = root.control('montage.strip');
		await dse.tabTo(header, TABS);
		await dse.press('Enter', header);
		await dse.settle();
		await expect(root.control('montage.strip')).toHaveAttribute('aria-expanded', 'true');
		const f = await focusState();
		expect(f.ctl).toBe('montage.strip');
		expect(f.inMontage).toBe(true);
	}, { failsWith: /Received: null/ });

	knownBug('SC-626', '[MONT-F03] a sheet closed by Log from the keyboard: focus lands inside the rebuilt montage, not on the page', async () => {
		await dse.openNote(FRESH);
		const root = dse.block(MONTAGE);
		const log = root.control('montage.bar.log');
		await dse.tabTo(log, TABS);
		dse.embeddedTarget(FRESH, MONTAGE);
		await dse.press('Enter'); // to the page: Log an action x Enter is no manifest pair
		const modal = await dse.modal('montage-log');
		const submit = modal.control('montage.log.submit');
		await dse.tabTo(submit, 12);
		await dse.waitForWrite(FRESH, () => dse.press('Enter', submit));
		await dse.settle();
		await expect(modal.root).not.toBeExisting();
		expect((await blockOf(FRESH)).entries).toHaveLength(1);
		const f = await focusState();
		expect(f.inMontage).toBe(true);
	}, { failsWith: /Received: false/ });
});
