// SC-243 — main.syncCompendium's own use of CompendiumSyncService's busy lock, driven
// through the REAL onload() plugin lifecycle (same makeLoadedPlugin() pattern
// test/dom/views/settings-tab.test.ts uses for its D4 suite) rather than a hand-built
// fake — this is the one place that proves the re-entrant token actually plumbs through
// main.ts and does not refuse itself (B3's no-self-deadlock requirement), not just that
// CompendiumSyncService's own API supports it in isolation (see
// test/unit/data/compendiumSyncBusy.test.ts for that half, and its network-controllable
// fakes for the "a genuinely concurrent run is refused" proof at the service level).
import DrawSteelAdmonitionPlugin from 'main';
import { App, Notice, requestUrl } from '../../mocks/obsidian';
import { SYNC_BUSY_NOTICE } from '@/data/CompendiumSyncService';

async function makeLoadedPlugin(): Promise<DrawSteelAdmonitionPlugin> {
	const app = new App();
	const plugin = new DrawSteelAdmonitionPlugin(
		app as never, { id: 'draw-steel-elements', version: 'test' } as never);
	await plugin.onload();
	return plugin;
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
