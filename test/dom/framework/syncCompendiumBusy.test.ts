// SC-243 — main.syncCompendium's own use of CompendiumSyncService's busy lock, driven
// through the REAL onload() plugin lifecycle (same makeLoadedPlugin() pattern
// test/dom/views/settings-tab.test.ts uses for its D4 suite) rather than a hand-built
// fake — this is the one place that proves the re-entrant token actually plumbs through
// main.ts and does not refuse itself (B3's no-self-deadlock requirement), not just that
// CompendiumSyncService's own API supports it in isolation (see
// test/unit/data/compendiumSyncBusy.test.ts for that half, and its network-controllable
// fakes for the "a genuinely concurrent run is refused" proof at the service level).
import DrawSteelAdmonitionPlugin from 'main';
import { App, Notice, requestUrl, flushAsync, type FakeVault } from '../../mocks/obsidian';
import { SYNC_BUSY_NOTICE } from '@/data/CompendiumSyncService';
import type { MigrationPlan } from '@/data/CompendiumMigration';

// SC-243 fix round 1 (review L1): both legacy-flow modals are mocked so the ordering
// fix inside their callbacks (main.ts) can be exercised WITHOUT any real modal DOM —
// the constructor's captured arguments are all these tests need (the destructured
// `onChoice` callback / `callbacks.syncAnyway`), and `.open()` on the fake instance is
// a no-op. Explicit factory mocks (not bare `jest.mock(path)` automocking) so the
// returned instance's shape is exactly what `main.ts`'s `.open()` call needs, with no
// dependency on how far automock walks the real `DseModal` prototype chain.
jest.mock('@views/LegacyCompendiumModal', () => ({
	LegacyCompendiumModal: jest.fn().mockImplementation(() => ({ open: jest.fn() })),
}));
jest.mock('@views/CompendiumMigrationModal', () => ({
	CompendiumMigrationModal: jest.fn().mockImplementation(() => ({ open: jest.fn() })),
}));
import { LegacyCompendiumModal } from '@views/LegacyCompendiumModal';
import { CompendiumMigrationModal } from '@views/CompendiumMigrationModal';

async function makeLoadedPlugin(): Promise<DrawSteelAdmonitionPlugin> {
	const app = new App();
	// SC-243 fix round 1 (L1 tests): `main.ts`'s LegacyCompendiumModal callback and
	// `offerMigration`'s `syncAnyway` both call `app.fileManager.trashFile`/
	// `markSettled`, but the shared `App` mock (test/mocks/obsidian-core.ts) carries no
	// `fileManager` at all — nothing before this ticket's fix-round tests ever drove
	// that path through the real onload() plugin. A minimal stub is enough; these tests
	// assert whether it gets CALLED, not what it does.
	(app as unknown as { fileManager: { trashFile: jest.Mock } }).fileManager = {
		trashFile: jest.fn(async () => {}),
	};
	const plugin = new DrawSteelAdmonitionPlugin(
		app as never, { id: 'draw-steel-elements', version: 'test' } as never);
	await plugin.onload();
	return plugin;
}

/** Seeds the fake vault so `syncCompendium` reaches the bare LegacyCompendiumModal
 *  branch (manifest null, root folder non-empty, NOT a detected legacy layout, no
 *  migration pending) — the exact precondition `main.ts:706-736` requires before it
 *  ever constructs the modal. */
async function seedLegacyModalTrigger(plugin: DrawSteelAdmonitionPlugin): Promise<void> {
	const root = plugin.settings.compendiumDestinationDirectory; // 'DS Compendium' default
	const vault = plugin.app.vault as unknown as FakeVault;
	const folder = await vault.createFolder(root);
	const file = vault.setFile(`${root}/homebrew.md`, 'not a compendium file');
	folder.children.push(file);
}

function stubMigrationPlan(plugin: DrawSteelAdmonitionPlugin, root: string): jest.SpyInstance {
	const plan: MigrationPlan = {
		root,
		detection: { root, filesInRoot: 1, legacyPaths: 1, newLayoutPaths: 0, isLegacyLayout: false },
		renames: [{
			fromPath: `${root}/old.md`, toPath: `${root}/new/path.md`,
			oldRelative: 'old.md', newRelative: 'new/path.md', modified: false,
		}],
		blocked: [], unmapped: [], backupCount: 0, backupFolder: `${root}/.backup`,
	};
	return jest.spyOn(plugin.migrationService, 'plan').mockResolvedValue(plan);
}

describe('SC-243 — main.syncCompendium busy lock', () => {
	beforeEach(() => {
		Notice.notices.length = 0;
		(requestUrl as jest.Mock).mockClear();
	});

	test('a single call does not refuse itself: syncService.sync actually runs under the token syncCompendium already holds', async () => {
		const plugin = await makeLoadedPlugin();
		// The mocked requestUrl resolves 200 with an empty body — no matching release
		// asset, so this run fails DOWNSTREAM of the guard, not because of it. That
		// failure is exactly what proves the guard let it through: if syncCompendium's
		// own `sync(options, token)` call tried to re-acquire a lock it already held,
		// it would refuse (Notice + null) before ever reaching requestUrl at all.
		await expect(plugin.syncCompendium()).rejects.toThrow();
		expect(requestUrl).toHaveBeenCalled();
		expect(Notice.notices).not.toContain(SYNC_BUSY_NOTICE);
		// B4: busy cleared on the thrown error.
		expect(plugin.syncService.isBusy()).toBe(false);
	});

	test('a second call while the first is genuinely in flight IS refused — exact-wording Notice, no second prelude/sync run', async () => {
		const plugin = await makeLoadedPlugin();
		// syncCompendium acquires the lock SYNCHRONOUSLY (beginOperation runs before its
		// first await), so by the time this line returns, busy is already true.
		const first = plugin.syncCompendium();
		expect(plugin.syncService.isBusy()).toBe(true);
		expect(plugin.syncService.currentBusy()).toBe('sync');

		const callsBeforeSecond = (requestUrl as jest.Mock).mock.calls.length;
		await plugin.syncCompendium(); // refused — resolves normally, does not throw
		expect(Notice.notices).toContain(SYNC_BUSY_NOTICE);
		// The refused call never reached the network at all.
		expect((requestUrl as jest.Mock).mock.calls.length).toBe(callsBeforeSecond);

		// Let the surviving run finish (it fails downstream, same as the solo-call test).
		await expect(first).rejects.toThrow();
		expect(plugin.syncService.isBusy()).toBe(false);
	});
});

// SC-243 fix round 1 (review L1, owner FOLD, required): the legacy-modal choice and
// `syncAnyway` both used to do a real (if non-destructive-by-Obsidian's-trash, still
// irreversible-in-effect) action — trashing the configured root, or settling migration
// state — BEFORE the busy guard that sits inside `syncService.sync(...)`. A sync already
// in flight when the user answers the modal would have its OWN destination folder
// trashed out from under it. The fix takes the lock at the very top of each callback,
// before that side effect, so a refusal happens before anything runs — mirroring
// `syncCompendium`'s own lock-first shape.
describe('SC-243 fix round 1 (review L1) — legacy-flow callbacks are lock-first, not guard-last', () => {
	beforeEach(() => {
		Notice.notices.length = 0;
		(LegacyCompendiumModal as unknown as jest.Mock).mockClear();
		(CompendiumMigrationModal as unknown as jest.Mock).mockClear();
	});

	test('LegacyCompendiumModal onChoice(true): a sync already in flight refuses the choice BEFORE trashing the root — no trashFile call, no second sync', async () => {
		const plugin = await makeLoadedPlugin();
		await seedLegacyModalTrigger(plugin);

		// Reach the LegacyCompendiumModal branch: manifest is null, the root folder has
		// children, and it is not a detected legacy layout — main.ts's own precondition.
		await plugin.syncCompendium();
		expect(LegacyCompendiumModal).toHaveBeenCalledTimes(1);
		const onChoice = (LegacyCompendiumModal as unknown as jest.Mock).mock.calls[0][2] as
			(trashOldRoot: boolean) => void;
		// syncCompendium's own busy span is already released — hand-off to the modal
		// clears it (B4) — so the lock is free here, exactly like the real timing gap
		// between the modal opening and the user's eventual click.
		expect(plugin.syncService.isBusy()).toBe(false);

		// A second, genuinely concurrent sync starts while the modal sits open.
		const token = plugin.syncService.beginOperation('sync');
		expect(token).not.toBeNull();
		const trashFile = (plugin.app.fileManager as unknown as { trashFile: jest.Mock }).trashFile;
		const syncSpy = jest.spyOn(plugin.syncService, 'sync');

		onChoice(true); // fire-and-forget void IIFE inside main.ts
		await flushAsync(2);

		// The bug this fix closes: pre-fix, trashFile ran unconditionally BEFORE the
		// guard, so this call would have already happened by the time the busy Notice
		// (also pre-fix, from the later bare sync() call) appeared.
		expect(trashFile).not.toHaveBeenCalled();
		expect(syncSpy).not.toHaveBeenCalled();
		expect(Notice.notices).toContain(SYNC_BUSY_NOTICE);

		plugin.syncService.endOperation(token!);
	});

	test('LegacyCompendiumModal onChoice(true): idle — trashes the root THEN syncs, under its own lock', async () => {
		const plugin = await makeLoadedPlugin();
		await seedLegacyModalTrigger(plugin);
		await plugin.syncCompendium();
		const onChoice = (LegacyCompendiumModal as unknown as jest.Mock).mock.calls[0][2] as
			(trashOldRoot: boolean) => void;

		const trashFile = (plugin.app.fileManager as unknown as { trashFile: jest.Mock }).trashFile;
		const syncSpy = jest.spyOn(plugin.syncService, 'sync').mockResolvedValue(null);
		const callOrder: string[] = [];
		trashFile.mockImplementation(async () => { callOrder.push('trash'); });
		syncSpy.mockImplementation(async () => { callOrder.push('sync'); return null; });

		onChoice(true);
		await flushAsync(2);

		expect(callOrder).toEqual(['trash', 'sync']);
		expect(plugin.syncService.isBusy()).toBe(false); // released after its own run
	});

	test("offerMigration's syncAnyway: a sync already in flight refuses the choice BEFORE markSettled — no state write, no second sync", async () => {
		const plugin = await makeLoadedPlugin();
		const root = plugin.settings.compendiumDestinationDirectory;
		stubMigrationPlan(plugin, root);

		await plugin.migrateCompendium();
		expect(CompendiumMigrationModal).toHaveBeenCalledTimes(1);
		const callbacks = (CompendiumMigrationModal as unknown as jest.Mock).mock.calls[0][2] as
			{ syncAnyway: () => void };

		const token = plugin.syncService.beginOperation('sync');
		expect(token).not.toBeNull();
		const markSettledSpy = jest.spyOn(plugin.migrationService, 'markSettled');
		const syncSpy = jest.spyOn(plugin.syncService, 'sync');

		callbacks.syncAnyway();
		await flushAsync(2);

		// Pre-fix, markSettled ran unconditionally before the guard — settling migration
		// state even though the sync it was clearing the way for was about to be refused.
		expect(markSettledSpy).not.toHaveBeenCalled();
		expect(syncSpy).not.toHaveBeenCalled();
		expect(Notice.notices).toContain(SYNC_BUSY_NOTICE);

		plugin.syncService.endOperation(token!);
	});
});
