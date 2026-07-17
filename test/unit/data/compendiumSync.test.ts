import { CompendiumSyncService, SyncOptions } from "@/data/CompendiumSyncService";
import { CompendiumManifest, ManifestStore, MANIFEST_SCHEMA_VERSION, sha256Hex } from "@/data/manifest";
import { makeFakeApp, FakeVault, FakeFileManager } from "../../fakes/fakeObsidian";

const OPTIONS: SyncOptions = { root: "DS Compendium", locale: "en" };

function bytes(text: string): Uint8Array { return new TextEncoder().encode(text); }

function incomingOf(entries: Record<string, string>): Map<string, Uint8Array> {
	return new Map(Object.entries(entries).map(([p, c]) => [p, bytes(c)]));
}

async function manifestOf(root: string, entries: Record<string, string>): Promise<CompendiumManifest> {
	const files: Record<string, string> = {};
	for (const [p, c] of Object.entries(entries)) files[p] = await sha256Hex(bytes(c));
	return {
		schemaVersion: MANIFEST_SCHEMA_VERSION, source: "SteelCompendium/data-unified",
		releaseTag: "v4.old", locale: "en", format: "md-dse", root,
		syncedAt: "2026-06-01T00:00:00.000Z", files,
	};
}

function setup() {
	const { app, vault, fileManager } = makeFakeApp();
	const store = new ManifestStore(app, "draw-steel-elements");
	const service = new CompendiumSyncService(app, store);
	return { app, vault, fileManager, store, service };
}

describe("CompendiumSyncService.applySync (F2 §3.4)", () => {
	test("fresh sync creates files + folders and writes the manifest", async () => {
		const { vault, store, service } = setup();
		const incoming = incomingOf({
			"monster/goblin/statblock/goblin-stinker.md": "goblin!",
			"rule/combat/turn.md": "turn!",
		});
		const { report } = await service.applySync(incoming, null, OPTIONS, "v4.new");
		expect(report.created.sort()).toEqual([
			"monster/goblin/statblock/goblin-stinker.md", "rule/combat/turn.md"]);
		expect(vault.text("DS Compendium/rule/combat/turn.md")).toBe("turn!");
		const manifest = (await store.load())!;
		expect(manifest.releaseTag).toBe("v4.new");
		expect(manifest.root).toBe("DS Compendium");
		expect(Object.keys(manifest.files).sort()).toEqual([
			"monster/goblin/statblock/goblin-stinker.md", "rule/combat/turn.md"]);
	});

	test("manifest-tracked files are updated in place; unchanged files are not rewritten", async () => {
		const { vault, service } = setup();
		vault.setText("DS Compendium/a.md", "old a");
		vault.setText("DS Compendium/b.md", "same b");
		const old = await manifestOf("DS Compendium", { "a.md": "old a", "b.md": "same b" });
		const modifySpy = jest.spyOn(vault, "modifyBinary");
		const { report } = await service.applySync(
			incomingOf({ "a.md": "new a", "b.md": "same b" }), old, OPTIONS, "v4.new");
		expect(report.updated).toEqual(["a.md"]);
		expect(report.unchanged).toEqual(["b.md"]);
		expect(vault.text("DS Compendium/a.md")).toBe("new a");
		expect(modifySpy).toHaveBeenCalledTimes(1); // b.md skipped — hash-identical
	});

	test("user file squatting on a compendium path is skipped, reported, and NOT adopted into the manifest", async () => {
		const { vault, store, service } = setup();
		vault.setText("DS Compendium/rule/combat/turn.md", "MY personal notes on turns");
		const { report } = await service.applySync(
			incomingOf({ "rule/combat/turn.md": "official turn text" }), null, OPTIONS, "v4.new");
		expect(report.skippedConflicts).toEqual(["rule/combat/turn.md"]);
		expect(vault.text("DS Compendium/rule/combat/turn.md")).toBe("MY personal notes on turns");
		expect((await store.load())!.files["rule/combat/turn.md"]).toBeUndefined();
	});

	test("upstream-removed + user-untouched → trashFile (recoverable), never vault.delete", async () => {
		const { vault, fileManager, service } = setup();
		vault.setText("DS Compendium/gone.md", "installed content");
		vault.setText("DS Compendium/stays.md", "stays");
		const old = await manifestOf("DS Compendium", { "gone.md": "installed content", "stays.md": "stays" });
		const { report } = await service.applySync(
			incomingOf({ "stays.md": "stays" }), old, OPTIONS, "v4.new");
		expect(report.trashed).toEqual(["gone.md"]);
		expect(fileManager.trashed).toEqual(["DS Compendium/gone.md"]);
		expect(vault.text("DS Compendium/gone.md")).toBeUndefined();
	});

	test("upstream-removed + user-MODIFIED → left in place and reported", async () => {
		const { vault, fileManager, service } = setup();
		vault.setText("DS Compendium/gone.md", "user edited this after install");
		const old = await manifestOf("DS Compendium", { "gone.md": "original installed content" });
		const { report } = await service.applySync(incomingOf({}), old, OPTIONS, "v4.new");
		expect(report.keptModified).toEqual(["gone.md"]);
		expect(fileManager.trashed).toEqual([]);
		expect(vault.text("DS Compendium/gone.md")).toBe("user edited this after install");
	});

	// ────────────────────────────────────────────────────────────────────────
	// THE INVARIANT (Global Constraints): homebrew inside the compendium root
	// is NEVER deleted, NEVER modified, NEVER trashed — across repeated syncs
	// that create, update, and remove managed files around it.
	// ────────────────────────────────────────────────────────────────────────
	test("INVARIANT: homebrew never touched across two full syncs", async () => {
		const { vault, fileManager, store, service } = setup();
		const homebrew = "# My homebrew monster\nNever in any manifest.";
		vault.setText("DS Compendium/homebrew/my-monster.md", homebrew);

		// Sync 1: fresh install around the homebrew.
		await service.applySync(incomingOf({
			"monster/a.md": "a v1", "monster/b.md": "b v1",
		}), null, OPTIONS, "v4.one");

		// Sync 2: update a, remove b — homebrew still not in the incoming set.
		const manifestAfterFirst = await store.load();
		await service.applySync(incomingOf({
			"monster/a.md": "a v2",
		}), manifestAfterFirst, OPTIONS, "v4.two");

		expect(vault.text("DS Compendium/homebrew/my-monster.md")).toBe(homebrew);
		expect(fileManager.trashed).not.toContain("DS Compendium/homebrew/my-monster.md");
		const finalManifest = (await store.load())!;
		expect(finalManifest.files["homebrew/my-monster.md"]).toBeUndefined();
		// And the managed churn worked as designed:
		expect(vault.text("DS Compendium/monster/a.md")).toBe("a v2");
		expect(vault.text("DS Compendium/monster/b.md")).toBeUndefined();
		expect(fileManager.trashed).toEqual(["DS Compendium/monster/b.md"]);
	});

	test("removals resolve against the OLD manifest's root (root renamed between syncs)", async () => {
		const { vault, fileManager, service } = setup();
		vault.setText("Old Root/gone.md", "installed content");
		const old = await manifestOf("Old Root", { "gone.md": "installed content" });
		const { report } = await service.applySync(
			incomingOf({ "new.md": "new" }), old, { ...OPTIONS, root: "New Root" }, "v4.new");
		expect(fileManager.trashed).toEqual(["Old Root/gone.md"]);
		expect(vault.text("New Root/new.md")).toBe("new");
		expect(report.created).toEqual(["new.md"]);
	});

	test("a folder squats on a compendium file path — skipped, reported, untouched", async () => {
		const { vault, store, service } = setup();
		// Nothing is literally AT "rule/combat/turn.md" — it's a folder, implied by a file
		// nested inside it. getAbstractFileByPath resolves it to a TFolder, not a TFile.
		vault.setText("DS Compendium/rule/combat/turn.md/nested.md", "someone's nested vault content");
		const { report } = await service.applySync(
			incomingOf({ "rule/combat/turn.md": "official turn text" }), null, OPTIONS, "v4.new");
		expect(report.skippedConflicts).toEqual(["rule/combat/turn.md"]);
		expect(report.created).toEqual([]);
		// The folder (and whatever lives inside it) is completely untouched.
		expect(vault.text("DS Compendium/rule/combat/turn.md/nested.md"))
			.toBe("someone's nested vault content");
		expect((await store.load())!.files["rule/combat/turn.md"]).toBeUndefined();
	});

	test("phase 2: manifest-tracked file already absent from the vault — silent no-op, not reported", async () => {
		const { vault, fileManager, service } = setup();
		const old = await manifestOf("DS Compendium", { "already-gone.md": "installed content" });
		// No file at "DS Compendium/already-gone.md" — e.g. deleted outside the plugin
		// (OS-level move, another sync tool) before this sync ran.
		const { report } = await service.applySync(incomingOf({}), old, OPTIONS, "v4.new");
		expect(report.trashed).toEqual([]);
		expect(report.keptModified).toEqual([]);
		expect(fileManager.trashed).toEqual([]);
		expect(vault.text("DS Compendium/already-gone.md")).toBeUndefined();
	});

	test("path-traversal / absolute incoming paths are rejected, never written outside the root", async () => {
		const { vault, store, service } = setup();
		const { report } = await service.applySync(
			incomingOf({
				"../../evil.md": "pwned",
				"/abs.md": "pwned",
				"safe.md": "official",
			}), null, OPTIONS, "v4.new");
		expect(report.rejectedPaths.sort()).toEqual(["../../evil.md", "/abs.md"]);
		expect(report.created).toEqual(["safe.md"]);
		// Nothing escaped the root: no file materialized anywhere named evil.md/abs.md.
		expect([...vault.files.keys()].some((p) => p.endsWith("evil.md"))).toBe(false);
		expect([...vault.files.keys()].some((p) => p.endsWith("abs.md"))).toBe(false);
		expect(vault.text("DS Compendium/safe.md")).toBe("official");
		const manifest = (await store.load())!;
		expect(Object.keys(manifest.files)).toEqual(["safe.md"]);
	});

	test("F1 pin: managed file with BOTH a user edit AND an upstream change is overwritten (spec-sanctioned)", async () => {
		const { vault, service } = setup();
		vault.setText("DS Compendium/a.md", "user's own edits, not the installed content");
		const old = await manifestOf("DS Compendium", { "a.md": "originally installed content" });
		const { report } = await service.applySync(
			incomingOf({ "a.md": "new upstream content" }), old, OPTIONS, "v4.new");
		expect(report.updated).toEqual(["a.md"]);
		expect(vault.text("DS Compendium/a.md")).toBe("new upstream content");
	});

	test("F3 pin: first sync (no manifest) adopts a pre-existing hash-identical file without treating it as a skip", async () => {
		const { vault, store, service } = setup();
		vault.setText("DS Compendium/already-here.md", "matches incoming exactly");
		const { report } = await service.applySync(
			incomingOf({ "already-here.md": "matches incoming exactly" }), null, OPTIONS, "v4.new");
		expect(report.unchanged).toEqual(["already-here.md"]);
		expect(report.skippedConflicts).toEqual([]);
		expect(report.created).toEqual([]);
		const manifest = (await store.load())!;
		expect(manifest.files["already-here.md"]).toBeDefined();
	});

	test("F6 pin: mid-sync write failure leaves the old manifest untouched on disk", async () => {
		const { vault, store, service } = setup();
		const old = await manifestOf("DS Compendium", { "a.md": "old a" });
		vault.setText("DS Compendium/a.md", "old a");
		await store.save(old); // seed the on-disk manifest via the real save path

		const adapterKeysBefore = [...vault.adapter.store.keys()].sort();
		const contentBefore = await store.load();

		let writes = 0;
		const originalCreateBinary = vault.createBinary.bind(vault);
		jest.spyOn(vault, "createBinary").mockImplementation(async (path, data) => {
			writes += 1;
			if (writes === 2) throw new Error("simulated write failure on file 2");
			return originalCreateBinary(path, data);
		});
		const saveSpy = jest.spyOn(store, "save");

		const incoming = incomingOf({ "b.md": "b1", "c.md": "c1", "d.md": "d1" });
		await expect(service.applySync(incoming, old, OPTIONS, "v4.new")).rejects.toThrow(
			"simulated write failure on file 2");

		expect(saveSpy).not.toHaveBeenCalled();
		expect(await store.load()).toEqual(contentBefore);
		expect([...vault.adapter.store.keys()].sort()).toEqual(adapterKeysBefore); // no stray .tmp file either
	});

	test("progress callback fires and covers the full set", async () => {
		const { service } = setup();
		const progress: Array<[number, number]> = [];
		await service.applySync(
			incomingOf(Object.fromEntries(
				Array.from({ length: 45 }, (_, i) => [`f${i}.md`, `c${i}`]))),
			null, OPTIONS, "v4.new",
			(done, total) => progress.push([done, total]));
		expect(progress[progress.length - 1]).toEqual([45, 45]);
		expect(progress.every(([, total]) => total === 45)).toBe(true);
	});
});
