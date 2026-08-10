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
	CompendiumMigrationService, LEGACY_DETECTION_THRESHOLD, MIGRATION_MAP, describePlan,
} from "@/data/CompendiumMigration";
import type { MigrationMap } from "@/data/CompendiumMigration";
import { CompendiumSyncService } from "@/data/CompendiumSyncService";
import { ManifestStore, sha256Hex } from "@/data/manifest";
import { makeFakeApp } from "../../fakes/fakeObsidian";

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
		counts: {},
		paths: {
			"Rules/Careers/Disciple.md": ["career/disciple.md", await hashOf("disciple text")],
			"Rules/Careers/Sage.md": ["career/sage.md", await hashOf("sage text")],
			"Careers/Retired.md": ["career/retired.md"],
		},
	};
}

async function setup(map?: MigrationMap) {
	const { app, vault, fileManager } = makeFakeApp();
	const store = new ManifestStore(app, "draw-steel-elements");
	const service = new CompendiumMigrationService(app, store, map ?? (await testMap()));
	return { app, vault, fileManager, store, service };
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
		const service = new CompendiumMigrationService(app, new ManifestStore(app, "x"), MIGRATION_MAP);
		for (const path of Object.keys(MIGRATION_MAP.paths).slice(0, 5)) {
			vault.setText(`${ROOT}/${path}`, "x");
		}
		const detection = service.detect(ROOT);
		expect(detection.legacyPaths).toBe(5);
		expect(detection.isLegacyLayout).toBe(false);
	});

	test("twenty of them is a legacy install", async () => {
		const { app, vault } = await setup();
		const service = new CompendiumMigrationService(app, new ManifestStore(app, "x"), MIGRATION_MAP);
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
		const report = await service.execute(await service.plan(ROOT));

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
		await service.execute(await service.plan(ROOT));
		expect(vault.folders.has(`${ROOT}/career`)).toBe(true);
	});

	test("is idempotent: a second run has nothing left to plan", async () => {
		const { vault, fileManager, service } = await setup();
		seedLegacyVault(vault);
		await service.execute(await service.plan(ROOT));
		const renamesAfterFirstRun = fileManager.renamed.length;

		const second = await service.plan(ROOT);
		expect(second.renames).toEqual([]);
		await service.execute(second);
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
		const report = await service.execute(await service.plan(ROOT));
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
		const report = await service.execute(await service.plan(ROOT));
		expect(report.migrated).toHaveLength(2);
		expect(report.migratedModified.map((r) => r.newRelative)).toEqual(["career/sage.md"]);
		expect(vault.text(`${ROOT}/career/sage.md`)).toBe("sage text, edited by me");
	});
});

describe("the handoff to the sync engine", () => {
	test("adopts the moved files into the manifest, at their NEW relative paths", async () => {
		const { vault, store, service } = await setup();
		seedLegacyVault(vault);
		await service.execute(await service.plan(ROOT));

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
		await service.execute(await service.plan(ROOT));

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
		await service.execute(await service.plan(ROOT));

		const manifest = (await store.load())!;
		expect(Object.keys(manifest.files).sort())
			.toEqual(["career/disciple.md", "career/sage.md", "rule/combat/turn.md"]);
		expect(manifest.releaseTag).toBe("v4.real"); // a real tag is never overwritten
	});

	test("a run that moved nothing does not write a manifest at all", async () => {
		const { store, service } = await setup();
		const report = await service.execute(await service.plan(ROOT));
		expect(report.migrated).toEqual([]);
		expect(await store.load()).toBeNull();
	});
});
