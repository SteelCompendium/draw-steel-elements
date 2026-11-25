// SC-441: the guard and the trash canary, run FIRST and alone before any scenario that moves or trashes files (ledger O2, O3, O15).
import { expect } from '@wdio/globals';
import '../../driver/dse';
import { assertDisposableVault, setTrash, trashCanary } from '../../driver/sync';

describe('sync: the disposable vault and the trash canary', () => {
	it('[SYNC-G01] the open vault is the runner\'s temp copy, Obsidian\'s "Deleted files" can be put on the vault\'s own .trash, and a trashed throwaway file lands there', async () => {
		const base = await assertDisposableVault();
		console.log(`SYNC-CANARY vault ${base}`);
		await setTrash('local');
		await trashCanary(base);
		const { canaryResult } = await import('../../driver/sync');
		console.log(`SYNC-CANARY ${canaryResult}`);
		expect(canaryResult).toContain('trashOption local');
	});
});
