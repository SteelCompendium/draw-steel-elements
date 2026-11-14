// SC-643 (D3) — defence in depth BEHIND main.ts: the sync and migration SERVICES themselves
// refuse the vault root as a compendium root, whatever caller reached them. (main.ts's own
// resolution is covered in test/dom/framework/syncCompendiumDestination.test.ts.) Services see
// an already-resolved root, so for them an empty string IS the vault root.
import { Notice } from "../../mocks/obsidian";
import { CompendiumSyncService, SyncOptions } from "@/data/CompendiumSyncService";
import { CompendiumMigrationService, migrationMap } from "@/data/CompendiumMigration";
import type { MigrationPlan } from "@/data/CompendiumMigration";
import { ManifestStore } from "@/data/manifest";
import { MigrationStateStore, emptyMigrationState } from "@/data/migrationState";
import { DESTINATION_REFUSED_NOTICE } from "@model/CompendiumDestination";
import { makeFakeApp } from "../../fakes/fakeObsidian";

const BAD_ROOTS = ["", "/", ".", "./", "//", " / ", "..", "a/.."];

function setup() {
	const { app, vault, fileManager } = makeFakeApp();
	vault.setText("Welcome.md", "my welcome note");
	vault.setText("Daily/2026-01-01.md", "a diary entry");
	const store = new ManifestStore(app, "draw-steel-elements");
	const stateStore = new MigrationStateStore(app, "draw-steel-elements");
	const requestUrlFn = jest.fn(async () => { throw new Error("no network in this test"); });
	const sync = new CompendiumSyncService(app, store, requestUrlFn as never);
	const migration = new CompendiumMigrationService(app, store, stateStore, migrationMap());
	return { app, vault, fileManager, store, stateStore, requestUrlFn, sync, migration };
}

describe("SC-643 CompendiumSyncService refuses the vault root", () => {
	test.each(BAD_ROOTS)("sync() with root %j: Notice, null, no request, no write, lock released", async (root) => {
		Notice.notices.length = 0;
		const { vault, fileManager, store, requestUrlFn, sync } = setup();
		const options: SyncOptions = { root, locale: "en" };
		const modify = jest.spyOn(vault, "modifyBinary");
		const create = jest.spyOn(vault, "createBinary");
		const trash = jest.spyOn(fileManager, "trashFile");

		await expect(sync.sync(options)).resolves.toBeNull();

		expect(Notice.notices).toContain(DESTINATION_REFUSED_NOTICE);
		expect(requestUrlFn).not.toHaveBeenCalled();
		expect(modify).not.toHaveBeenCalled();
		expect(create).not.toHaveBeenCalled();
		expect(trash).not.toHaveBeenCalled();
		expect(await store.load()).toBeNull();
		expect(sync.isBusy()).toBe(false);
	});

	test("sync() handed a held token refuses without releasing it (the caller still owns it)", async () => {
		const { sync, requestUrlFn } = setup();
		const token = sync.beginOperation("sync")!;
		await expect(sync.sync({ root: "/", locale: "en" }, token)).resolves.toBeNull();
		expect(requestUrlFn).not.toHaveBeenCalled();
		expect(sync.isBusy()).toBe(true);
		sync.endOperation(token);
	});

	test.each(["", "/", "."])("applySync() with root %j throws before any write (the write boundary itself)", async (root) => {
		const { vault, store, sync } = setup();
		const create = jest.spyOn(vault, "createBinary");
		const incoming = new Map([["rule/turn.md", new TextEncoder().encode("turn")]]);
		await expect(sync.applySync(incoming, null, { root, locale: "en" }, "v4.x")).rejects.toThrow(/vault root/);
		expect(create).not.toHaveBeenCalled();
		expect(await store.load()).toBeNull();
	});

	test("a real root still syncs (the guard does not touch the ordinary path)", async () => {
		const { vault, sync } = setup();
		const incoming = new Map([["rule/turn.md", new TextEncoder().encode("turn")]]);
		await sync.applySync(incoming, null, { root: "DS Compendium", locale: "en" }, "v4.x");
		expect(vault.text("DS Compendium/rule/turn.md")).toBe("turn");
	});
});

describe("SC-643 CompendiumMigrationService never uses the vault root as the migration root", () => {
	test.each(BAD_ROOTS)("root %j: detect() sees nothing, plan() and execute() throw", async (root) => {
		const { fileManager, migration } = setup();
		const rename = jest.spyOn(fileManager, "renameFile");
		expect(migration.detect(root)).toMatchObject({ filesInRoot: 0, legacyPaths: 0, isLegacyLayout: false });
		await expect(migration.plan(root)).rejects.toThrow(/vault root/);
		const plan: MigrationPlan = {
			root, detection: migration.detect(root),
			renames: [{ fromPath: "Welcome.md", toPath: "x/Welcome.md", oldRelative: "Welcome.md", newRelative: "x/Welcome.md", modified: false }],
			blocked: [], unmapped: [], backupCount: 0, backupFolder: "Compendium backup (pre-7.0.0)",
		};
		await expect(migration.execute(plan)).rejects.toThrow(/vault root/);
		expect(rename).not.toHaveBeenCalled();
	});

	test("markDeclined / markSettled leave the migration state alone for a vault-root", async () => {
		const { stateStore, migration } = setup();
		const state = emptyMigrationState("DS Compendium");
		state.declined = true;
		await stateStore.save(state);

		await migration.markSettled("/");
		expect(await stateStore.load()).toMatchObject({ declined: true, root: "DS Compendium" });

		const fresh = setup();
		await fresh.migration.markDeclined("");
		expect(await fresh.stateStore.load()).toBeNull();
	});

	test("reconcile() does not adopt files 'under' the vault root", async () => {
		const { vault, store, stateStore, migration } = setup();
		const state = emptyMigrationState("");
		state.migrated = ["Welcome.md"];
		await stateStore.save(state);

		await expect(migration.reconcile("/")).resolves.toBe(0);
		expect(await store.load()).toBeNull();
		expect(vault.text("Welcome.md")).toBe("my welcome note");
	});
});
