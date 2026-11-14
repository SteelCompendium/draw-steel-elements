// SC-643 — an empty Destination folder used to make the VAULT ROOT "the compendium folder":
// Sync found a non-empty root folder with no manifest and opened "Existing compendium folder
// found", whose "Move old compendium to trash" choice handed the root to trashFile. Driven
// through the REAL onload() plugin (same makeLoadedPlugin() shape as syncCompendiumBusy.test.ts)
// over the mock vault; both legacy-flow windows are mocked so "no window" is a constructor
// count. Nothing here touches a real vault or the network.
import DrawSteelAdmonitionPlugin from 'main';
import { App, Notice, requestUrl, flushAsync, type FakeVault } from '../../mocks/obsidian';
import { DESTINATION_CHANGED_NOTICE, DESTINATION_REFUSED_NOTICE } from '@model/CompendiumDestination';
import type { MigrationPlan } from '@/data/CompendiumMigration';

jest.mock('@views/LegacyCompendiumModal', () => ({
	LegacyCompendiumModal: jest.fn().mockImplementation(() => ({ open: jest.fn() })),
}));
jest.mock('@views/CompendiumMigrationModal', () => ({
	CompendiumMigrationModal: jest.fn().mockImplementation(() => ({ open: jest.fn() })),
}));
import { LegacyCompendiumModal } from '@views/LegacyCompendiumModal';
import { CompendiumMigrationModal } from '@views/CompendiumMigrationModal';

const ROOT_FORMS = ['/', '.', './', '//', ' / ', '\\', 'a/..'];
const BLANK_FORMS = ['', ' ', '   ', '\t'];

type VaultFile = { path: string; content: string };

async function makeLoadedPlugin(destination: string): Promise<DrawSteelAdmonitionPlugin> {
	const app = new App();
	(app as unknown as { fileManager: Record<string, jest.Mock> }).fileManager = {
		trashFile: jest.fn(async () => {}),
		renameFile: jest.fn(async () => {}),
	};
	const plugin = new DrawSteelAdmonitionPlugin(
		app as never, { id: 'draw-steel-elements', version: 'test' } as never);
	await plugin.onload();
	plugin.settings.compendiumDestinationDirectory = destination;
	return plugin;
}

/** A vault whose ROOT folder is non-empty and which has no sync manifest: exactly the
 *  precondition under which the bug opened the trash window for the vault root. */
async function seedUserVault(plugin: DrawSteelAdmonitionPlugin): Promise<{ rootFolder: any; files: VaultFile[] }> {
	const vault = plugin.app.vault as unknown as FakeVault;
	const rootFolder = await vault.createFolder('/');
	const seeded = [
		['Welcome.md', 'my welcome note'],
		['Daily/2026-01-01.md', 'a diary entry'],
		['Campaign/Session 1.md', 'session notes'],
	];
	for (const [path, content] of seeded) rootFolder.children.push(vault.setFile(path, content));
	return { rootFolder, files: seeded.map(([path, content]) => ({ path, content })) };
}

function vaultSnapshot(plugin: DrawSteelAdmonitionPlugin): VaultFile[] {
	const vault = plugin.app.vault as unknown as FakeVault;
	return vault.allFiles()
		.map((f) => ({ path: f.path, content: vault.getContent(f.path) ?? '' }))
		.sort((a, b) => (a.path < b.path ? -1 : 1));
}

/** Spies on every vault / file-manager / adapter method that writes, so "no vault write"
 *  is asserted for real rather than inferred. Installed AFTER seeding. */
function spyOnWrites(plugin: DrawSteelAdmonitionPlugin): jest.SpyInstance[] {
	const spies: jest.SpyInstance[] = [];
	const targets: object[] = [plugin.app.vault, (plugin.app.vault as any).adapter, plugin.app.fileManager];
	for (const target of targets) {
		let proto: object | null = target;
		const seen = new Set<string>();
		while (proto && proto !== Object.prototype) {
			for (const name of Object.getOwnPropertyNames(proto)) {
				if (seen.has(name)) continue;
				seen.add(name);
				if (!/^(create|modify|process|delete|rename|copy|trash|write|remove|append)/i.test(name)) continue;
				if (typeof (target as any)[name] !== 'function') continue;
				spies.push(jest.spyOn(target as any, name));
			}
			proto = Object.getPrototypeOf(proto);
		}
	}
	return spies;
}

function stubMigrationPlan(plugin: DrawSteelAdmonitionPlugin): jest.SpyInstance {
	return jest.spyOn(plugin.migrationService, 'plan').mockImplementation(async (root: string) => ({
		root,
		detection: { root, filesInRoot: 1, legacyPaths: 1, newLayoutPaths: 0, isLegacyLayout: false },
		renames: [{
			fromPath: `${root}/old.md`, toPath: `${root}/new/path.md`,
			oldRelative: 'old.md', newRelative: 'new/path.md', modified: false,
		}],
		blocked: [], unmapped: [], backupCount: 0, backupFolder: `${root}/.backup`,
	} as MigrationPlan));
}

beforeEach(() => {
	Notice.notices.length = 0;
	(requestUrl as jest.Mock).mockClear();
	(LegacyCompendiumModal as unknown as jest.Mock).mockClear();
	(CompendiumMigrationModal as unknown as jest.Mock).mockClear();
});

describe('SC-643 — Sync with an empty Destination folder (D1)', () => {
	test.each(BLANK_FORMS)('destination %j: no trash window for the vault root, nothing trashed, the sync targets "DS Compendium"', async (destination) => {
		const plugin = await makeLoadedPlugin(destination);
		const { files } = await seedUserVault(plugin);
		const writes = spyOnWrites(plugin);
		const sync = jest.spyOn(plugin.syncService, 'sync').mockResolvedValue(null);
		const detect = jest.spyOn(plugin.migrationService, 'detect');

		await plugin.syncCompendium();

		expect(LegacyCompendiumModal).not.toHaveBeenCalled();
		expect(CompendiumMigrationModal).not.toHaveBeenCalled();
		expect(plugin.app.fileManager.trashFile).not.toHaveBeenCalled();
		expect(sync).toHaveBeenCalledTimes(1);
		expect(sync.mock.calls[0][0]).toMatchObject({ root: 'DS Compendium' });
		// The migration offer looked at the SAME folder Sync writes to — never at the vault root.
		for (const call of detect.mock.calls) expect(call[0]).toBe('DS Compendium');
		expect(Notice.notices).not.toContain(DESTINATION_REFUSED_NOTICE);
		// Integrity probe: every pre-existing note is still there, byte-for-byte; nothing was written.
		expect(vaultSnapshot(plugin)).toEqual(expect.arrayContaining(files));
		expect(vaultSnapshot(plugin)).toHaveLength(files.length);
		expect(writes.flatMap((s) => s.mock.calls)).toEqual([]);
	});

	test('the stored setting is not rewritten (the field still shows its placeholder)', async () => {
		const plugin = await makeLoadedPlugin('   ');
		await seedUserVault(plugin);
		jest.spyOn(plugin.syncService, 'sync').mockResolvedValue(null);
		await plugin.syncCompendium();
		expect(plugin.settings.compendiumDestinationDirectory).toBe('   ');
	});

	test('a real, non-empty "DS Compendium" folder with no manifest still gets the legacy window, for THAT folder; its trash choice trashes that folder, never the root', async () => {
		const plugin = await makeLoadedPlugin('');
		const { rootFolder } = await seedUserVault(plugin);
		const vault = plugin.app.vault as unknown as FakeVault;
		const folder = await vault.createFolder('DS Compendium');
		folder.children.push(vault.setFile('DS Compendium/homebrew.md', 'not a compendium file'));
		const sync = jest.spyOn(plugin.syncService, 'sync').mockResolvedValue(null);

		await plugin.syncCompendium();
		expect(LegacyCompendiumModal).toHaveBeenCalledTimes(1);
		const [, shownRoot, onChoice] = (LegacyCompendiumModal as unknown as jest.Mock).mock.calls[0] as
			[unknown, string, (trash: boolean) => void];
		expect(shownRoot).toBe('DS Compendium');

		onChoice(true);
		await flushAsync(3);
		const trashFile = plugin.app.fileManager.trashFile as unknown as jest.Mock;
		expect(trashFile).toHaveBeenCalledTimes(1);
		expect(trashFile.mock.calls[0][0]).toBe(folder);
		expect(trashFile).not.toHaveBeenCalledWith(rootFolder);
		expect(sync).toHaveBeenCalledTimes(1);
	});
});

describe('SC-643 — Sync with a Destination folder that is the vault root (D2/D3)', () => {
	test.each(ROOT_FORMS)('destination %j: Notice naming the setting; no sync, no migration, no window, no trash, no vault write', async (destination) => {
		const plugin = await makeLoadedPlugin(destination);
		const { files } = await seedUserVault(plugin);
		const writes = spyOnWrites(plugin);
		const sync = jest.spyOn(plugin.syncService, 'sync');
		const reconcile = jest.spyOn(plugin.migrationService, 'reconcile');
		const detect = jest.spyOn(plugin.migrationService, 'detect');
		const plan = jest.spyOn(plugin.migrationService, 'plan');
		const lookup = jest.spyOn(plugin.app.vault, 'getAbstractFileByPath');

		await plugin.syncCompendium();

		expect(Notice.notices).toContain(DESTINATION_REFUSED_NOTICE);
		expect(DESTINATION_REFUSED_NOTICE).toContain('Destination folder');
		expect(sync).not.toHaveBeenCalled();
		expect(reconcile).not.toHaveBeenCalled();
		expect(detect).not.toHaveBeenCalled();
		expect(plan).not.toHaveBeenCalled();
		expect(lookup).not.toHaveBeenCalled(); // not even a lookup of the root folder
		expect(LegacyCompendiumModal).not.toHaveBeenCalled();
		expect(CompendiumMigrationModal).not.toHaveBeenCalled();
		expect(plugin.app.fileManager.trashFile).not.toHaveBeenCalled();
		expect(requestUrl).not.toHaveBeenCalled();
		expect(plugin.syncService.isBusy()).toBe(false);
		expect(vaultSnapshot(plugin)).toEqual(expect.arrayContaining(files));
		expect(vaultSnapshot(plugin)).toHaveLength(files.length);
		expect(writes.flatMap((s) => s.mock.calls)).toEqual([]);
	});

	test('a destination that climbs out of the vault is refused the same way', async () => {
		const plugin = await makeLoadedPlugin('../elsewhere');
		await seedUserVault(plugin);
		const sync = jest.spyOn(plugin.syncService, 'sync');
		await plugin.syncCompendium();
		expect(Notice.notices).toContain(DESTINATION_REFUSED_NOTICE);
		expect(sync).not.toHaveBeenCalled();
		expect(LegacyCompendiumModal).not.toHaveBeenCalled();
	});

	test('defence in depth: a lookup that hands back the vault root is never offered in the window and never trashed', async () => {
		// Whatever path got a root TFolder this far (a resolver bug, a lying lookup), main.ts
		// itself refuses: no window, no trash.
		const plugin = await makeLoadedPlugin('DS Compendium');
		const { rootFolder } = await seedUserVault(plugin);
		jest.spyOn(plugin.app.vault, 'getAbstractFileByPath').mockReturnValue(rootFolder);
		const sync = jest.spyOn(plugin.syncService, 'sync').mockResolvedValue(null);

		await plugin.syncCompendium();

		expect(LegacyCompendiumModal).not.toHaveBeenCalled();
		expect(plugin.app.fileManager.trashFile).not.toHaveBeenCalled();
		expect(sync).not.toHaveBeenCalled();
		expect(Notice.notices).toContain(DESTINATION_REFUSED_NOTICE);
	});

	test('defence in depth at the trash site: a window answered after its folder turned out to be the root trashes nothing', async () => {
		const plugin = await makeLoadedPlugin('');
		await seedUserVault(plugin);
		const vault = plugin.app.vault as unknown as FakeVault;
		const folder = await vault.createFolder('DS Compendium');
		folder.children.push(vault.setFile('DS Compendium/homebrew.md', 'x'));
		const sync = jest.spyOn(plugin.syncService, 'sync').mockResolvedValue(null);
		await plugin.syncCompendium();
		const onChoice = (LegacyCompendiumModal as unknown as jest.Mock).mock.calls[0][2] as (trash: boolean) => void;

		folder.path = '/'; // the captured folder is (somehow) the vault root by the time the user answers
		onChoice(true);
		await flushAsync(3);

		expect(plugin.app.fileManager.trashFile).not.toHaveBeenCalled();
		expect(sync).not.toHaveBeenCalled();
		expect(Notice.notices).toContain(DESTINATION_REFUSED_NOTICE);
		expect(plugin.syncService.isBusy()).toBe(false);
	});

	test('a setting changed to the vault root while the window sits open: answering it trashes nothing', async () => {
		const plugin = await makeLoadedPlugin('');
		await seedUserVault(plugin);
		const vault = plugin.app.vault as unknown as FakeVault;
		const folder = await vault.createFolder('DS Compendium');
		folder.children.push(vault.setFile('DS Compendium/homebrew.md', 'x'));
		const sync = jest.spyOn(plugin.syncService, 'sync').mockResolvedValue(null);
		await plugin.syncCompendium();
		const onChoice = (LegacyCompendiumModal as unknown as jest.Mock).mock.calls[0][2] as (trash: boolean) => void;

		plugin.settings.compendiumDestinationDirectory = '/';
		onChoice(true);
		await flushAsync(3);

		expect(plugin.app.fileManager.trashFile).not.toHaveBeenCalled();
		expect(sync).not.toHaveBeenCalled();
		expect(Notice.notices).toContain(DESTINATION_REFUSED_NOTICE);
	});
});

describe('SC-643 — the Migrate compendium command', () => {
	test.each(BLANK_FORMS)('destination %j: plans the migration for "DS Compendium", never the vault root', async (destination) => {
		const plugin = await makeLoadedPlugin(destination);
		await seedUserVault(plugin);
		const plan = stubMigrationPlan(plugin);

		await plugin.migrateCompendium();

		expect(plan).toHaveBeenCalledTimes(1);
		expect(plan.mock.calls[0][0]).toBe('DS Compendium');
		expect(CompendiumMigrationModal).toHaveBeenCalledTimes(1);
		expect(((CompendiumMigrationModal as unknown as jest.Mock).mock.calls[0][1] as MigrationPlan).root).toBe('DS Compendium');
		expect(Notice.notices).not.toContain(DESTINATION_REFUSED_NOTICE);
	});

	test.each(ROOT_FORMS)('destination %j: Notice naming the setting; no plan, no window, no state write, no vault write', async (destination) => {
		const plugin = await makeLoadedPlugin(destination);
		const { files } = await seedUserVault(plugin);
		const writes = spyOnWrites(plugin);
		const plan = stubMigrationPlan(plugin);
		const markSettled = jest.spyOn(plugin.migrationService, 'markSettled');
		const markDeclined = jest.spyOn(plugin.migrationService, 'markDeclined');

		await plugin.migrateCompendium();

		expect(Notice.notices).toContain(DESTINATION_REFUSED_NOTICE);
		expect(plan).not.toHaveBeenCalled();
		expect(markSettled).not.toHaveBeenCalled();
		expect(markDeclined).not.toHaveBeenCalled();
		expect(CompendiumMigrationModal).not.toHaveBeenCalled();
		expect(plugin.app.fileManager.trashFile).not.toHaveBeenCalled();
		expect(vaultSnapshot(plugin)).toHaveLength(files.length);
		expect(vaultSnapshot(plugin)).toEqual(expect.arrayContaining(files));
		expect(writes.flatMap((s) => s.mock.calls)).toEqual([]);
	});
});

describe('SC-643 (review L1) — the Destination folder changed to ANOTHER real folder while the window is open', () => {
	test.each([true, false])('answering the window (trash=%s) does nothing: no trash, no sync, no write, every file byte-identical, a Notice says to run Sync again', async (trash) => {
		const plugin = await makeLoadedPlugin('');
		await seedUserVault(plugin);
		const vault = plugin.app.vault as unknown as FakeVault;
		const folder = await vault.createFolder('DS Compendium');
		folder.children.push(vault.setFile('DS Compendium/homebrew.md', 'old compendium folder'));
		const notes = await vault.createFolder('Notes');
		notes.children.push(vault.setFile('Notes/Welcome.md', 'my notes folder'));
		const sync = jest.spyOn(plugin.syncService, 'sync').mockResolvedValue(null);
		await plugin.syncCompendium(); // the window offers "DS Compendium"
		expect(LegacyCompendiumModal).toHaveBeenCalledTimes(1);
		const [, shownRoot, onChoice] = (LegacyCompendiumModal as unknown as jest.Mock).mock.calls[0] as
			[unknown, string, (trash: boolean) => void];
		expect(shownRoot).toBe('DS Compendium');
		const before = vaultSnapshot(plugin);
		const writes = spyOnWrites(plugin);
		Notice.notices.length = 0;

		plugin.settings.compendiumDestinationDirectory = 'Notes';
		onChoice(trash);
		await flushAsync(3);

		expect(plugin.app.fileManager.trashFile).not.toHaveBeenCalled();
		expect(sync).not.toHaveBeenCalled();
		expect(Notice.notices).toContain(DESTINATION_CHANGED_NOTICE);
		expect(vaultSnapshot(plugin)).toEqual(before);
		expect(writes.flatMap((spy) => spy.mock.calls)).toEqual([]);
		expect(plugin.syncService.isBusy()).toBe(false);
	});

	test('the same folder spelled differently ("DS Compendium/") is still the same folder: the answer goes through', async () => {
		const plugin = await makeLoadedPlugin('');
		await seedUserVault(plugin);
		const vault = plugin.app.vault as unknown as FakeVault;
		const folder = await vault.createFolder('DS Compendium');
		folder.children.push(vault.setFile('DS Compendium/homebrew.md', 'x'));
		const sync = jest.spyOn(plugin.syncService, 'sync').mockResolvedValue(null);
		await plugin.syncCompendium();
		const onChoice = (LegacyCompendiumModal as unknown as jest.Mock).mock.calls[0][2] as (trash: boolean) => void;

		plugin.settings.compendiumDestinationDirectory = ' DS Compendium/ ';
		onChoice(true);
		await flushAsync(3);

		expect(plugin.app.fileManager.trashFile).toHaveBeenCalledWith(folder);
		expect(sync).toHaveBeenCalledTimes(1);
		expect(Notice.notices).not.toContain(DESTINATION_CHANGED_NOTICE);
	});
});

describe('SC-643 (review L2) — the migration window\'s callbacks and offerMigration refuse the vault root themselves', () => {
	async function openMigrationWindow() {
		const plugin = await makeLoadedPlugin('');
		await seedUserVault(plugin);
		stubMigrationPlan(plugin);
		await plugin.migrateCompendium();
		expect(CompendiumMigrationModal).toHaveBeenCalledTimes(1);
		const callbacks = (CompendiumMigrationModal as unknown as jest.Mock).mock.calls[0][2] as
			{ syncAnyway: () => void; syncAfter: (report: unknown) => void };
		return { plugin, callbacks };
	}
	const report = { aborted: false, migrated: [], remaining: 0, reportNotePath: null };

	test('syncAnyway after the setting was changed to the vault root: Notice, no markSettled, no sync, lock released', async () => {
		const { plugin, callbacks } = await openMigrationWindow();
		const sync = jest.spyOn(plugin.syncService, 'sync').mockResolvedValue(null);
		const markSettled = jest.spyOn(plugin.migrationService, 'markSettled');
		Notice.notices.length = 0;

		plugin.settings.compendiumDestinationDirectory = '/';
		callbacks.syncAnyway();
		await flushAsync(3);

		expect(Notice.notices).toContain(DESTINATION_REFUSED_NOTICE);
		expect(markSettled).not.toHaveBeenCalled();
		expect(sync).not.toHaveBeenCalled();
		expect(plugin.syncService.isBusy()).toBe(false);
	});

	test('syncAfter after the setting was changed to the vault root: Notice, no sync', async () => {
		const { plugin, callbacks } = await openMigrationWindow();
		const sync = jest.spyOn(plugin.syncService, 'sync').mockResolvedValue(null);
		Notice.notices.length = 0;

		plugin.settings.compendiumDestinationDirectory = '.';
		callbacks.syncAfter(report);
		await flushAsync(3);

		expect(Notice.notices).toContain(DESTINATION_REFUSED_NOTICE);
		expect(sync).not.toHaveBeenCalled();
	});

	test('syncAfter / syncAnyway with the setting unchanged still sync the resolved folder (the guard is not a blanket refusal)', async () => {
		const { plugin, callbacks } = await openMigrationWindow();
		const sync = jest.spyOn(plugin.syncService, 'sync').mockResolvedValue(null);

		callbacks.syncAfter(report);
		callbacks.syncAnyway();
		await flushAsync(3);

		expect(sync).toHaveBeenCalledTimes(2);
		for (const call of sync.mock.calls) expect(call[0]).toMatchObject({ root: 'DS Compendium' });
	});

	test.each(['', '/', '.', '..'])('offerMigration(%j) called directly: Notice, no plan, no window, no state write', async (root) => {
		const plugin = await makeLoadedPlugin('DS Compendium');
		await seedUserVault(plugin);
		const plan = stubMigrationPlan(plugin);
		const markSettled = jest.spyOn(plugin.migrationService, 'markSettled');
		const markDeclined = jest.spyOn(plugin.migrationService, 'markDeclined');
		Notice.notices.length = 0;

		await (plugin as unknown as { offerMigration(root: string): Promise<void> }).offerMigration(root);

		expect(Notice.notices).toContain(DESTINATION_REFUSED_NOTICE);
		expect(plan).not.toHaveBeenCalled();
		expect(markSettled).not.toHaveBeenCalled();
		expect(markDeclined).not.toHaveBeenCalled();
		expect(CompendiumMigrationModal).not.toHaveBeenCalled();
	});
});
