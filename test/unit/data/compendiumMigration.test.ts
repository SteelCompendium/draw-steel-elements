// SC-125 — the migration engine. Runs against a synthetic map (so the assertions
// read as prose rather than as compendium trivia) plus one pass over the SHIPPED map
// for the detection thresholds.
//
// The load-bearing tests, in order of how much they'd cost to get wrong:
//   1. rename-only — `fileManager.renameFile` and nothing else; zero trashes, zero deletes;
//   2. the handoff — after migrating, the NEXT sync updates the moved files in place
//      instead of skipping them as user content (without the manifest adoption step
//      the migration would strand every file at legacy content forever);
//   3. the trigger — never fires on a fresh install;
//   4. idempotency, abort, occupied destinations.
import {
	CHECKPOINT_INTERVAL, CompendiumMigrationService, LEGACY_DETECTION_THRESHOLD,
	describePlan, migrationMap,
} from "@/data/CompendiumMigration";
import type { MigrationMap } from "@/data/CompendiumMigration";
import { CompendiumSyncService } from "@/data/CompendiumSyncService";
import { ManifestStore, sha256Hex } from "@/data/manifest";
import { MigrationStateStore } from "@/data/migrationState";
import { makeFakeApp } from "../../fakes/fakeObsidian";

const MIGRATION_MAP = migrationMap();

const ROOT = "DS Compendium";

const bytes = (text: string) => new TextEncoder().encode(text);

async function hashOf(text: string): Promise<string> {
	return (await sha256Hex(bytes(text))).slice(0, 16);
}

/** A three-entry map: one pristine, one we will edit, one historical (no hash). */
async function testMap(): Promise<MigrationMap> {
	return {
		schemaVersion: 1,
		oldSource: "SteelCompendium/data-md-dse",
		oldFinalRelease: "v3.20260403152914",
		oldReleasesCovered: 243,
		newSource: "SteelCompendium/data-unified",
		newFormat: "md-dse",
		newLocale: "en",
		newSnapshot: "test",
		newRelease: "v4.20260803143953",
		counts: {},
		paths: {
			"Rules/Careers/Disciple.md": ["career/disciple.md", await hashOf("disciple text")],
			"Rules/Careers/Sage.md": ["career/sage.md", await hashOf("sage text")],
			"Careers/Retired.md": ["career/retired.md"],
		},
	};
}

/** N entries `Old/i.md` → `new/i.md`, enough to cross a checkpoint boundary. */
async function bigMap(count: number): Promise<MigrationMap> {
	const map = await testMap();
	map.paths = {};
	for (let i = 0; i < count; i++) {
		map.paths[`Old/file-${String(i).padStart(4, "0")}.md`] = [`new/file-${String(i).padStart(4, "0")}.md`];
	}
	return map;
}

async function setup(map?: MigrationMap) {
	const { app, vault, fileManager } = makeFakeApp();
	const store = new ManifestStore(app, "draw-steel-elements");
	const stateStore = new MigrationStateStore(app, "draw-steel-elements");
	const service = new CompendiumMigrationService(app, store, stateStore, map ?? (await testMap()));
	return { app, vault, fileManager, store, stateStore, service };
}

/** A second service over the SAME vault + stores — models a plugin reload. */
async function reopen(
	ctx: Awaited<ReturnType<typeof setup>>,
	map?: MigrationMap,
): Promise<CompendiumMigrationService> {
	return new CompendiumMigrationService(
		ctx.app, ctx.store, ctx.stateStore, map ?? (await testMap()));
}

function seedLegacyVault(vault: ReturnType<typeof makeFakeApp>["vault"]): void {
	vault.setText(`${ROOT}/Rules/Careers/Disciple.md`, "disciple text");
	vault.setText(`${ROOT}/Rules/Careers/Sage.md`, "sage text");
	vault.setText(`${ROOT}/Rules/_Index.md`, "an index page with no counterpart");
	vault.setText(`${ROOT}/My Homebrew.md`, "mine");
}

describe("detect — the trigger", () => {
	test("a fresh install never trips it: empty vault, no compendium folder", async () => {
		const { service } = await setup();
		const detection = service.detect(ROOT);
		expect(detection.filesInRoot).toBe(0);
		expect(detection.legacyPaths).toBe(0);
		expect(detection.isLegacyLayout).toBe(false);
	});

	test("a folder of the user's own notes never trips it, however many files it holds", async () => {
		const { vault, service } = await setup();
		for (let i = 0; i < 200; i++) vault.setText(`${ROOT}/session-notes/${i}.md`, "notes");
		const detection = service.detect(ROOT);
		expect(detection.filesInRoot).toBe(200);
		expect(detection.legacyPaths).toBe(0);
		expect(detection.isLegacyLayout).toBe(false);
	});

	// The threshold is pinned to its literal value on purpose. Writing these two tests
	// in terms of the constant would make them self-adjusting — lowering the threshold
	// to 1 would still "pass", which is exactly the regression they exist to catch.
	test("the documented threshold is 20", () => {
		expect(LEGACY_DETECTION_THRESHOLD).toBe(20);
	});

	test("five coincidental legacy paths are not a compendium — no prompt", async () => {
		const { app, vault } = await setup();
		const service = new CompendiumMigrationService(
			app, new ManifestStore(app, "x"), new MigrationStateStore(app, "x"), MIGRATION_MAP);
		for (const path of Object.keys(MIGRATION_MAP.paths).slice(0, 5)) {
			vault.setText(`${ROOT}/${path}`, "x");
		}
		const detection = service.detect(ROOT);
		expect(detection.legacyPaths).toBe(5);
		expect(detection.isLegacyLayout).toBe(false);
	});

	test("twenty of them is a legacy install", async () => {
		const { app, vault } = await setup();
		const service = new CompendiumMigrationService(
			app, new ManifestStore(app, "x"), new MigrationStateStore(app, "x"), MIGRATION_MAP);
		for (const path of Object.keys(MIGRATION_MAP.paths).slice(0, 20)) {
			vault.setText(`${ROOT}/${path}`, "x");
		}
		expect(service.detect(ROOT).isLegacyLayout).toBe(true);
	});

	test("an already-migrated vault reads as new-layout, not legacy", async () => {
		const { vault, service } = await setup();
		vault.setText(`${ROOT}/career/disciple.md`, "disciple text");
		vault.setText(`${ROOT}/career/sage.md`, "sage text");
		const detection = service.detect(ROOT);
		expect(detection.legacyPaths).toBe(0);
		expect(detection.newLayoutPaths).toBe(2);
		expect(detection.isLegacyLayout).toBe(false);
	});
});

describe("plan — the dry run", () => {
	test("maps what it knows, leaves what it doesn't, and touches nothing", async () => {
		const { vault, fileManager, service } = await setup();
		seedLegacyVault(vault);
		const before = new Map(vault.files);

		const plan = await service.plan(ROOT);
		expect(plan.renames.map((r) => [r.oldRelative, r.newRelative])).toEqual([
			["Rules/Careers/Disciple.md", "career/disciple.md"],
			["Rules/Careers/Sage.md", "career/sage.md"],
		]);
		expect(plan.unmapped.sort()).toEqual([`${ROOT}/My Homebrew.md`, `${ROOT}/Rules/_Index.md`]);
		expect(plan.blocked).toEqual([]);

		expect([...vault.files.keys()].sort()).toEqual([...before.keys()].sort());
		expect(fileManager.renamed).toEqual([]);
		expect(fileManager.trashed).toEqual([]);
	});

	test("flags a file whose content differs from the final legacy release — and still plans to move it", async () => {
		const { vault, service } = await setup();
		seedLegacyVault(vault);
		vault.setText(`${ROOT}/Rules/Careers/Sage.md`, "sage text WITH MY OWN NOTES");
		const plan = await service.plan(ROOT);
		expect(plan.renames.map((r) => [r.oldRelative, r.modified])).toEqual([
			["Rules/Careers/Disciple.md", false],
			["Rules/Careers/Sage.md", true],
		]);
	});

	test("a historical-only path (no shipped hash) reports modified: null, not a false alarm", async () => {
		const { vault, service } = await setup();
		vault.setText(`${ROOT}/Careers/Retired.md`, "anything at all");
		const plan = await service.plan(ROOT);
		expect(plan.renames).toHaveLength(1);
		expect(plan.renames[0].modified).toBeNull();
	});

	test("a file already sitting at the destination blocks that move — nothing is overwritten", async () => {
		const { vault, service } = await setup();
		seedLegacyVault(vault);
		vault.setText(`${ROOT}/career/disciple.md`, "SOMETHING ELSE ALREADY HERE");
		const plan = await service.plan(ROOT);
		expect(plan.renames.map((r) => r.oldRelative)).toEqual(["Rules/Careers/Sage.md"]);
		expect(plan.blocked).toEqual([
			{ fromPath: `${ROOT}/Rules/Careers/Disciple.md`, toPath: `${ROOT}/career/disciple.md` },
		]);
	});

	test("describePlan says the numbers out loud, including that nothing is deleted", async () => {
		const { vault, service } = await setup();
		seedLegacyVault(vault);
		const text = describePlan(await service.plan(ROOT));
		expect(text).toContain("2 file(s) will be moved");
		expect(text).toContain("nothing is deleted");
		expect(text).toContain("Rules/Careers/Disciple.md  →  career/disciple.md");
	});
});

describe("execute — the move", () => {
	test("moves via fileManager.renameFile ONLY: no trash, no delete, content preserved", async () => {
		const { vault, fileManager, service } = await setup();
		seedLegacyVault(vault);
		const report = await service.execute(await service.plan(ROOT), { writeReportNote: false });

		expect(fileManager.renamed).toEqual([
			{ from: `${ROOT}/Rules/Careers/Disciple.md`, to: `${ROOT}/career/disciple.md` },
			{ from: `${ROOT}/Rules/Careers/Sage.md`, to: `${ROOT}/career/sage.md` },
		]);
		expect(fileManager.trashed).toEqual([]);
		expect(report.migrated).toHaveLength(2);
		expect(report.failed).toEqual([]);
		expect(vault.text(`${ROOT}/career/disciple.md`)).toBe("disciple text");
		// The files it was never told about are exactly as they were.
		expect(vault.text(`${ROOT}/My Homebrew.md`)).toBe("mine");
		expect(vault.text(`${ROOT}/Rules/_Index.md`)).toBe("an index page with no counterpart");
		expect(report.unmapped.sort()).toEqual([`${ROOT}/My Homebrew.md`, `${ROOT}/Rules/_Index.md`]);
	});

	test("creates the destination folders on the way", async () => {
		const { vault, service } = await setup();
		seedLegacyVault(vault);
		expect(vault.folders.has(`${ROOT}/career`)).toBe(false);
		await service.execute(await service.plan(ROOT), { writeReportNote: false });
		expect(vault.folders.has(`${ROOT}/career`)).toBe(true);
	});

	test("is idempotent: a second run has nothing left to plan", async () => {
		const { vault, fileManager, service } = await setup();
		seedLegacyVault(vault);
		await service.execute(await service.plan(ROOT), { writeReportNote: false });
		const renamesAfterFirstRun = fileManager.renamed.length;

		const second = await service.plan(ROOT);
		expect(second.renames).toEqual([]);
		await service.execute(second, { writeReportNote: false });
		expect(fileManager.renamed).toHaveLength(renamesAfterFirstRun);
	});

	test("abort stops the run, reports what is left, and leaves the moved files moved", async () => {
		const { vault, fileManager, service } = await setup();
		seedLegacyVault(vault);
		vault.setText(`${ROOT}/Careers/Retired.md`, "retired");
		const plan = await service.plan(ROOT);
		expect(plan.renames).toHaveLength(3);

		let done = 0;
		const report = await service.execute(plan, {
			writeReportNote: false,
			onProgress: () => { done++; },
			shouldAbort: () => done >= 1, // stop after the first file completes
		});
		expect(report.aborted).toBe(true);
		expect(report.migrated).toHaveLength(1);
		expect(report.remaining).toBe(2);
		expect(fileManager.renamed).toHaveLength(1);
		// Everything not reached is untouched — an aborted run is not a broken vault.
		expect(vault.text(`${ROOT}/Rules/Careers/Sage.md`)).toBe("sage text");
	});

	test("a rename that throws is reported and the rest still run", async () => {
		const { vault, fileManager, service } = await setup();
		seedLegacyVault(vault);
		jest.spyOn(fileManager, "renameFile").mockImplementationOnce(() => {
			throw new Error("Obsidian said no");
		});
		const report = await service.execute(await service.plan(ROOT), { writeReportNote: false });
		expect(report.failed).toEqual([{
			fromPath: `${ROOT}/Rules/Careers/Disciple.md`,
			toPath: `${ROOT}/career/disciple.md`,
			error: "Obsidian said no",
		}]);
		expect(report.migrated.map((r) => r.newRelative)).toEqual(["career/sage.md"]);
	});

	test("reports a modified file as migrated AND flagged", async () => {
		const { vault, service } = await setup();
		seedLegacyVault(vault);
		vault.setText(`${ROOT}/Rules/Careers/Sage.md`, "sage text, edited by me");
		const report = await service.execute(await service.plan(ROOT), { writeReportNote: false });
		expect(report.migrated).toHaveLength(2);
		expect(report.migratedModified.map((r) => r.newRelative)).toEqual(["career/sage.md"]);
		expect(vault.text(`${ROOT}/career/sage.md`)).toBe("sage text, edited by me");
	});
});

describe("the handoff to the sync engine", () => {
	test("adopts the moved files into the manifest, at their NEW relative paths", async () => {
		const { vault, store, service } = await setup();
		seedLegacyVault(vault);
		await service.execute(await service.plan(ROOT), { writeReportNote: false });

		const manifest = (await store.load())!;
		expect(Object.keys(manifest.files).sort()).toEqual(["career/disciple.md", "career/sage.md"]);
		expect(manifest.files["career/disciple.md"]).toBe(await sha256Hex(bytes("disciple text")));
		expect(manifest.root).toBe(ROOT);
		// Never a real data-unified tag: an update is still owed.
		expect(manifest.releaseTag).toBe("migrated:v3.20260403152914");
	});

	test("THE POINT: the next sync UPDATES the moved files instead of skipping them as user content", async () => {
		const { app, vault, store, service } = await setup();
		seedLegacyVault(vault);
		await service.execute(await service.plan(ROOT), { writeReportNote: false });

		const sync = new CompendiumSyncService(app, store);
		const incoming = new Map([
			["career/disciple.md", bytes("NEW disciple text")],
			["career/sage.md", bytes("NEW sage text")],
		]);
		const { report } = await sync.applySync(
			incoming, await store.load(), { root: ROOT, locale: "en" }, "v4.new");

		expect(report.updated.sort()).toEqual(["career/disciple.md", "career/sage.md"]);
		expect(report.skippedConflicts).toEqual([]);
		expect(vault.text(`${ROOT}/career/disciple.md`)).toBe("NEW disciple text");
	});

	test("CAN-FAIL PROOF: without the migration the same sync skips both as squatters", async () => {
		const { app, vault, store } = await setup();
		// Same end state, reached WITHOUT migrating (files placed at the new paths with
		// no manifest) — the sync must refuse to touch them.
		vault.setText(`${ROOT}/career/disciple.md`, "disciple text");
		vault.setText(`${ROOT}/career/sage.md`, "sage text");

		const sync = new CompendiumSyncService(app, store);
		const incoming = new Map([
			["career/disciple.md", bytes("NEW disciple text")],
			["career/sage.md", bytes("NEW sage text")],
		]);
		const { report } = await sync.applySync(incoming, null, { root: ROOT, locale: "en" }, "v4.new");

		expect(report.updated).toEqual([]);
		expect(report.skippedConflicts.sort()).toEqual(["career/disciple.md", "career/sage.md"]);
		expect(vault.text(`${ROOT}/career/disciple.md`)).toBe("disciple text");
	});

	test("merges into an existing manifest rather than replacing it", async () => {
		const { vault, store, service } = await setup();
		await store.save({
			schemaVersion: 1, source: "SteelCompendium/data-unified", releaseTag: "v4.real",
			locale: "en", format: "md-dse", root: ROOT, syncedAt: "2026-08-01T00:00:00.000Z",
			files: { "rule/combat/turn.md": "deadbeef" },
		});
		seedLegacyVault(vault);
		await service.execute(await service.plan(ROOT), { writeReportNote: false });

		const manifest = (await store.load())!;
		expect(Object.keys(manifest.files).sort())
			.toEqual(["career/disciple.md", "career/sage.md", "rule/combat/turn.md"]);
		expect(manifest.releaseTag).toBe("v4.real"); // a real tag is never overwritten
	});

	test("a run that moved nothing does not write a manifest at all", async () => {
		const { store, service } = await setup();
		const report = await service.execute(await service.plan(ROOT), { writeReportNote: false });
		expect(report.migrated).toEqual([]);
		expect(await store.load()).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Review fix round — the findings that had executable reproductions.
// ---------------------------------------------------------------------------

/**
 * Simulate PROCESS DEATH, not an orderly abort.
 *
 * The distinction is the whole of review round 2's H1: `shouldAbort` unwinds through
 * the `finally`, which is precisely the path a force-quit does NOT take. Here the run
 * is killed by making the Nth rename throw a sentinel that escapes `execute()`
 * entirely — every write that had already reached disk stays, and nothing that would
 * only have happened at the end does.
 */
async function crashDuring(
	ctx: Awaited<ReturnType<typeof setup>>,
	service: CompendiumMigrationService,
	afterRenames: number,
): Promise<void> {
	let done = 0;
	const real = ctx.fileManager.renameFile.bind(ctx.fileManager);
	const spy = jest.spyOn(ctx.fileManager, "renameFile").mockImplementation(async (file, to) => {
		// Death is not an exception — an exception would be CAUGHT (the engine records a
		// failed rename and carries on to its `finally`, which is the very thing a
		// force-quit skips). The Nth call simply never returns, the run is abandoned
		// mid-loop, and only what already reached disk survives.
		if (done >= afterRenames) return new Promise<void>(() => { /* the process is gone */ });
		done++;
		await real(file, to);
	});
	const abandoned = service.execute(await service.plan(ROOT), { writeReportNote: false });
	void abandoned.catch(() => { /* nobody is left to hear it */ });
	// Let every microtask up to the hang settle (the checkpoint writes are awaits).
	for (let i = 0; i < 50; i++) await new Promise((resolve) => setTimeout(resolve, 0));
	spy.mockRestore();
}

describe("H1 — an interrupted run must not strand its files", () => {
	test("SCENARIO A: real process death mid-run, then re-run — EVERY moved file ends up managed", async () => {
		const ctx = await setup();
		seedLegacyVault(ctx.vault);
		ctx.vault.setText(`${ROOT}/Careers/Retired.md`, "retired");

		// Die after the first rename. Note this throws OUT of execute(), so its
		// `finally` bookkeeping is the only thing that runs — and the assertions below
		// must hold even if it hadn't.
		await crashDuring(ctx, ctx.service, 1);

		// The offer must come back: `incomplete` was written BEFORE the loop, so it is
		// on disk no matter where the process died.
		const service2 = await reopen(ctx);
		expect(await service2.isPending()).toBe(true);

		await service2.execute(await service2.plan(ROOT), { writeReportNote: false });

		const manifest = (await ctx.store.load())!;
		expect(Object.keys(manifest.files).sort())
			.toEqual(["career/disciple.md", "career/retired.md", "career/sage.md"]);

		// …and the proof that this is the property that matters: the next sync updates
		// all three in place rather than skipping the run-1 file as a squatter.
		const sync = new CompendiumSyncService(ctx.app, ctx.store);
		const { report } = await sync.applySync(
			new Map([
				["career/disciple.md", bytes("NEW disciple")],
				["career/retired.md", bytes("NEW retired")],
				["career/sage.md", bytes("NEW sage")],
			]),
			await ctx.store.load(), { root: ROOT, locale: "en" }, "v4.new");
		expect(report.updated.sort())
			.toEqual(["career/disciple.md", "career/retired.md", "career/sage.md"]);
		expect(report.skippedConflicts).toEqual([]);
	});

	test("C1: death BEFORE the first checkpoint still leaves the moved file recorded", async () => {
		// The window that used to strand up to CHECKPOINT_INTERVAL-1 files. The
		// destinations are claimed write-ahead, before their renames, so the record is
		// already on disk when the process dies.
		const ctx = await setup();
		seedLegacyVault(ctx.vault);
		await crashDuring(ctx, ctx.service, 1);

		const state = (await ctx.stateStore.load())!;
		expect(state.migrated).toContain("career/disciple.md");
		expect(state.incomplete).toBe(true);

		// A bare reconcile — no further migration — is enough to rescue it.
		const service2 = await reopen(ctx);
		expect(await service2.reconcile(ROOT)).toBe(1);
		expect(Object.keys((await ctx.store.load())!.files)).toEqual(["career/disciple.md"]);
	});

	test("C2: death AFTER a checkpoint still re-offers — it must never fall through to a silent sync", async () => {
		// The regression this round exists to kill. A checkpoint had written a manifest,
		// so `manifest === null` was false; `incomplete` was only set in the finally, so
		// `isPending()` was false too — and the next sync ran unprompted, created the
		// remaining destinations, and shut the door for good.
		const map = await bigMap(CHECKPOINT_INTERVAL + 50);
		const ctx = await setup(map);
		for (const oldPath of Object.keys(map.paths)) ctx.vault.setText(`${ROOT}/${oldPath}`, oldPath);

		await crashDuring(ctx, ctx.service, CHECKPOINT_INTERVAL + 10);

		// A checkpoint really did land a manifest — the condition that used to silence
		// the offer.
		const manifest = await ctx.store.load();
		expect(manifest).not.toBeNull();
		expect(Object.keys(manifest!.files).length).toBeGreaterThanOrEqual(CHECKPOINT_INTERVAL);

		// …and the offer still comes back.
		const service2 = await reopen(ctx, map);
		expect(await service2.isPending()).toBe(true);

		const second = await service2.plan(ROOT);
		expect(second.renames.length).toBe(50 - 10);
		await service2.execute(second, { writeReportNote: false });

		// Everything is managed, and nothing is left at a legacy path.
		const finalManifest = (await ctx.store.load())!;
		expect(Object.keys(finalManifest.files)).toHaveLength(CHECKPOINT_INTERVAL + 50);
		expect(await service2.isPending()).toBe(false);
	});

	test("reconcile() alone repairs an unadopted move, without any further migration", async () => {
		const ctx = await setup();
		seedLegacyVault(ctx.vault);
		let moved = 0;
		await ctx.service.execute(await ctx.service.plan(ROOT), {
			writeReportNote: false,
			onProgress: () => { moved++; },
			shouldAbort: () => moved >= 1,
		});
		// Wipe the manifest the way a failed write or a restored backup might.
		await ctx.store.save({
			schemaVersion: 1, source: "SteelCompendium/data-unified", releaseTag: "v4.x",
			locale: "en", format: "md-dse", root: ROOT, syncedAt: "2026-08-01T00:00:00.000Z",
			files: {},
		});
		const service2 = await reopen(ctx);
		expect(await service2.reconcile(ROOT)).toBe(1);
		expect(Object.keys((await ctx.store.load())!.files)).toEqual(["career/disciple.md"]);
	});

	test("reconcile() claims ONLY what the migration moved — never a user note parked on a destination", async () => {
		const ctx = await setup();
		// No migration has ever run here; the user simply has a note at a path that
		// happens to be a migration destination. A "sweep every destination" adoption
		// would hand it to the next sync to overwrite.
		ctx.vault.setText(`${ROOT}/career/disciple.md`, "MY notes, at that path by coincidence");
		expect(await ctx.service.reconcile(ROOT)).toBe(0);
		expect(await ctx.store.load()).toBeNull();
	});
});

describe("H2 — declining or stopping must re-arm the offer", () => {
	test("markDeclined makes the migration pending; markSettled clears it", async () => {
		const { service } = await setup();
		expect(await service.isPending()).toBe(false);
		await service.markDeclined(ROOT);
		expect(await service.isPending()).toBe(true);
		await service.markSettled(ROOT);
		expect(await service.isPending()).toBe(false);
	});

	test("an aborted run leaves the migration pending", async () => {
		const { vault, service } = await setup();
		seedLegacyVault(vault);
		vault.setText(`${ROOT}/Careers/Retired.md`, "retired");
		let moved = 0;
		const report = await service.execute(await service.plan(ROOT), {
			writeReportNote: false,
			onProgress: () => { moved++; },
			shouldAbort: () => moved >= 1,
		});
		expect(report.aborted).toBe(true);
		expect(await service.isPending()).toBe(true);
	});

	test("a completed run is not pending — and clears a decline recorded earlier", async () => {
		const { vault, service } = await setup();
		seedLegacyVault(vault);
		await service.markDeclined(ROOT);
		await service.execute(await service.plan(ROOT), { writeReportNote: false });
		expect(await service.isPending()).toBe(false);
	});
});

describe("H3 — the per-path lists survive the dialog", () => {
	test("writes a report note naming every skipped and flagged file", async () => {
		const { vault, service } = await setup();
		seedLegacyVault(vault);
		vault.setText(`${ROOT}/Rules/Careers/Sage.md`, "sage text, edited by me");
		const report = await service.execute(await service.plan(ROOT));

		expect(report.reportNotePath).not.toBeNull();
		const note = vault.text(report.reportNotePath!)!;
		expect(note).toContain("career/sage.md");                    // flagged as modified
		expect(note).toContain(`${ROOT}/Rules/_Index.md`);           // unmapped
		expect(note).toContain(`${ROOT}/My Homebrew.md`);            // unmapped
		expect(note).toContain("Nothing was deleted");
		// The note must warn that the sync will overwrite the file the user edited.
		expect(note).toContain("overwrites them with the current official text");
	});

	test("the report note never overwrites an existing file", async () => {
		const { vault, service } = await setup();
		seedLegacyVault(vault);
		const first = await service.execute(await service.plan(ROOT));
		vault.setText(`${ROOT}/Rules/Careers/Disciple.md`, "disciple text");
		const second = await service.execute(await service.plan(ROOT));
		expect(second.reportNotePath).not.toBe(first.reportNotePath);
		expect(vault.text(first.reportNotePath!)).toBeDefined();
	});

	test("a no-op run writes no note at all", async () => {
		const { vault, service } = await setup();
		const report = await service.execute(await service.plan(ROOT));
		expect(report.reportNotePath).toBeNull();
		expect([...vault.files.keys()]).toEqual([]);
	});
});

describe("M3 — case-insensitive filesystems", () => {
	test("reuses an existing folder that differs only by case instead of making a second one", async () => {
		const ctx = await setup();
		ctx.vault.setText(`${ROOT}/Rules/Careers/Disciple.md`, "disciple text");
		// A vault that already carries `Career/` (capital C) — on macOS/Windows this IS
		// the folder `career/`, so creating the lowercase spelling must not happen.
		ctx.vault.setText(`${ROOT}/Career/keep.md`, "something already here");

		await ctx.service.execute(await ctx.service.plan(ROOT), { writeReportNote: false });
		expect(ctx.fileManager.renamed).toEqual([
			{ from: `${ROOT}/Rules/Careers/Disciple.md`, to: `${ROOT}/Career/disciple.md` },
		]);
		expect(ctx.vault.folders.has(`${ROOT}/career`)).toBe(false);
		expect(ctx.vault.text(`${ROOT}/Career/keep.md`)).toBe("something already here");
	});
});

describe("L1/L2 — progress never stalls", () => {
	test("plan() reports progress and finishes at total/total", async () => {
		const { vault, service } = await setup();
		seedLegacyVault(vault);
		const ticks: Array<[number, number]> = [];
		const plan = await service.plan(ROOT, (done, total) => ticks.push([done, total]));
		expect(ticks[ticks.length - 1]).toEqual([4, 4]);
		expect(plan.renames).toHaveLength(2);
	});

	test("execute() ticks for entries it SKIPS, not only for the ones it moves", async () => {
		const { vault, service } = await setup();
		seedLegacyVault(vault);
		const plan = await service.plan(ROOT);
		// Make the first entry vanish between plan and execute — the skip branch.
		vault.files.delete(`${ROOT}/Rules/Careers/Disciple.md`);
		const ticks: number[] = [];
		const report = await service.execute(plan, {
			writeReportNote: false,
			onProgress: (done) => ticks.push(done),
		});
		expect(report.migrated).toHaveLength(1);
		expect(ticks).toEqual([1, 2]); // both entries advanced the bar
	});
});

describe("a transitional release: two old paths, one destination", () => {
	test("the first wins deterministically and the second is blocked, not overwritten", async () => {
		const map = await testMap();
		// Both spellings of the same entity, as a mid-2025 tree could carry.
		map.paths["Careers/Disciple.md"] = ["career/disciple.md"];
		const { vault, service } = await setup(map);
		vault.setText(`${ROOT}/Careers/Disciple.md`, "older layout copy");
		vault.setText(`${ROOT}/Rules/Careers/Disciple.md`, "disciple text");

		const plan = await service.plan(ROOT);
		expect(plan.renames.map((r) => r.oldRelative)).toEqual(["Careers/Disciple.md"]);
		expect(plan.blocked).toEqual([
			{ fromPath: `${ROOT}/Rules/Careers/Disciple.md`, toPath: `${ROOT}/career/disciple.md` },
		]);
		await service.execute(plan, { writeReportNote: false });
		expect(vault.text(`${ROOT}/career/disciple.md`)).toBe("older layout copy");
		expect(vault.text(`${ROOT}/Rules/Careers/Disciple.md`)).toBe("disciple text");
	});
});
