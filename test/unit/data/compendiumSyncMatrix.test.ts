// SC-441 — the compendium sync's file-state x release matrix. `applySync` is the one place that creates, rewrites, keeps and trashes the
// user's vault files, so every combination of (what is on disk) x (what the release holds) is pinned here as a table: which bucket the file
// lands in, what the file holds afterwards, and whether the manifest records it.
//
// ALREADY COVERED one case at a time by compendiumSync.test.ts / compendiumSyncRelease.test.ts / compendiumSyncBusy.test.ts (not repeated as
// separate tests): a fresh sync, an update in place, a squatter skipped, an upstream removal trashed / kept, homebrew untouched across two syncs,
// a removal resolved against the OLD manifest root, a folder on a file path, an already-absent removal, traversal rejection, the F1 pin
// (user edit + upstream change is overwritten), the F3 adoption pin, the F6 mid-sync failure pin, progress, the busy lock. THIS file adds the
// crossing of those axes, the manifest each cell writes, and the integrity rules (nothing outside the Destination folder, the user's own notes
// byte-for-byte, hostile zip names).
import { CompendiumSyncService } from "@/data/CompendiumSyncService";
import type { SyncOptions, SyncReport } from "@/data/CompendiumSyncService";
import { CompendiumManifest, ManifestStore, MANIFEST_SCHEMA_VERSION, sha256Hex } from "@/data/manifest";
import { makeFakeApp } from "../../fakes/fakeObsidian";

const ROOT = "DS Compendium";
const OPTIONS: SyncOptions = { root: ROOT, locale: "en" };
const MANIFEST = ".obsidian/plugins/draw-steel-elements/compendium-manifest.json";
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

function setup() {
	const { app, vault, fileManager } = makeFakeApp();
	const store = new ManifestStore(app, "draw-steel-elements");
	return { app, vault, fileManager, store, service: new CompendiumSyncService(app, store) };
}
const incomingOf = (entries: Record<string, string>): Map<string, Uint8Array> =>
	new Map(Object.entries(entries).map(([p, c]) => [p, bytes(c)]));
async function manifestOf(entries: Record<string, string>, tag = "v1"): Promise<CompendiumManifest> {
	const files: Record<string, string> = {};
	for (const [p, c] of Object.entries(entries)) files[p] = await sha256Hex(bytes(c));
	return {
		schemaVersion: MANIFEST_SCHEMA_VERSION, source: "SteelCompendium/data-unified", releaseTag: tag,
		locale: "en", format: "md-dse", root: ROOT, syncedAt: "2026-06-01T00:00:00.000Z", files,
	};
}

type Bucket = keyof Pick<SyncReport, "created" | "updated" | "unchanged" | "skippedConflicts" | "trashed" | "keptModified" | "rejectedPaths">;
const BUCKETS: Bucket[] = ["created", "updated", "unchanged", "skippedConflicts", "trashed", "keptModified", "rejectedPaths"];

interface Cell {
	name: string;
	/** What the vault holds at `f.md` before the sync (undefined: no file). */
	disk: string | undefined;
	/** What the OLD manifest says was installed there (undefined: not in the manifest, or no manifest at all). */
	installed: string | undefined;
	/** Whether an old manifest exists at all (the first sync has none). */
	hasManifest: boolean;
	/** What the release holds at `f.md` (undefined: removed upstream). */
	incoming: string | undefined;
	/** The one bucket `f.md` must land in (undefined: nowhere, silently). */
	bucket: Bucket | undefined;
	/** What the vault holds at `f.md` afterwards (undefined: gone from the vault; "(trash)": moved to the trash). */
	after: string | undefined | "(trash)";
	/** Whether the NEW manifest records `f.md`. */
	recorded: boolean;
}

// Release axis: FIRST SYNC (no manifest), SAME TAG AGAIN (manifest = the release), NEWER TAG (manifest = the older release),
// REMOVED UPSTREAM (the newer release no longer has the file).
const CELLS: Cell[] = [
	// ---- first sync: there is no manifest, so nothing on disk is the plugin's
	{ name: "first sync, file absent", disk: undefined, installed: undefined, hasManifest: false, incoming: "v1", bucket: "created", after: "v1", recorded: true },
	{ name: "first sync, identical file already there (an intact install is adopted)", disk: "v1", installed: undefined, hasManifest: false, incoming: "v1", bucket: "unchanged", after: "v1", recorded: true },
	{ name: "first sync, the user's own different file on a compendium path", disk: "mine", installed: undefined, hasManifest: false, incoming: "v1", bucket: "skippedConflicts", after: "mine", recorded: false },
	// ---- same tag again: the release is what the manifest says
	{ name: "same tag again, file unmodified", disk: "v1", installed: "v1", hasManifest: true, incoming: "v1", bucket: "unchanged", after: "v1", recorded: true },
	{ name: "same tag again, file absent (the user deleted it): it comes back", disk: undefined, installed: "v1", hasManifest: true, incoming: "v1", bucket: "created", after: "v1", recorded: true },
	// ---- newer tag
	{ name: "newer tag, file unmodified", disk: "v1", installed: "v1", hasManifest: true, incoming: "v2", bucket: "updated", after: "v2", recorded: true },
	{ name: "newer tag, file absent (the user deleted it): it comes back at the new content", disk: undefined, installed: "v1", hasManifest: true, incoming: "v2", bucket: "created", after: "v2", recorded: true },
	{ name: "newer tag, a file the plugin never installed holds different bytes (a squatter)", disk: "mine", installed: undefined, hasManifest: true, incoming: "v2", bucket: "skippedConflicts", after: "mine", recorded: false },
	{ name: "newer tag, a file the plugin never installed already equals the release", disk: "v2", installed: undefined, hasManifest: true, incoming: "v2", bucket: "unchanged", after: "v2", recorded: true },
	{ name: "newer tag, release unchanged for this file but the user edited it (current behaviour: BUG, the edit is overwritten, see compendiumSyncBugs.test.ts)", disk: "v1 + my edit", installed: "v1", hasManifest: true, incoming: "v1", bucket: "updated", after: "v1", recorded: true },
	// ---- removed upstream
	{ name: "removed upstream, file unmodified: moved to the trash, no longer recorded", disk: "v1", installed: "v1", hasManifest: true, incoming: undefined, bucket: "trashed", after: "(trash)", recorded: false },
	{ name: "removed upstream, file modified: kept in place, no longer recorded", disk: "v1 + my edit", installed: "v1", hasManifest: true, incoming: undefined, bucket: "keptModified", after: "v1 + my edit", recorded: false },
	{ name: "removed upstream, file already gone: nothing to do and nothing reported", disk: undefined, installed: "v1", hasManifest: true, incoming: undefined, bucket: undefined, after: undefined, recorded: false },
	{ name: "removed upstream, a homebrew file the plugin never installed: never considered", disk: "mine", installed: undefined, hasManifest: true, incoming: undefined, bucket: undefined, after: "mine", recorded: false },
];

describe("applySync matrix: what is on disk x what the release holds", () => {
	test.each(CELLS)("$name", async (cell) => {
		const { vault, fileManager, store, service } = setup();
		if (cell.disk !== undefined) vault.setText(`${ROOT}/f.md`, cell.disk);
		const old = cell.hasManifest
			? await manifestOf(cell.installed === undefined ? {} : { "f.md": cell.installed })
			: null;
		const { report, manifest } = await service.applySync(
			incomingOf(cell.incoming === undefined ? {} : { "f.md": cell.incoming }), old, OPTIONS, "v2");

		for (const bucket of BUCKETS) {
			expect({ bucket, files: report[bucket] }).toEqual({ bucket, files: bucket === cell.bucket ? ["f.md"] : [] });
		}
		const trashed = fileManager.trashed;
		if (cell.after === "(trash)") {
			expect(vault.text(`${ROOT}/f.md`)).toBeUndefined();
			expect(trashed).toEqual([`${ROOT}/f.md`]);
		} else {
			expect(vault.text(`${ROOT}/f.md`)).toBe(cell.after);
			expect(trashed).toEqual([]);
		}
		expect(Object.keys(manifest.files)).toEqual(cell.recorded ? ["f.md"] : []);
		if (cell.recorded) expect(manifest.files["f.md"]).toBe(await sha256Hex(bytes(cell.incoming as string)));
		// the manifest on disk IS the manifest returned, and says which release and where
		expect(await store.load()).toEqual(manifest);
		expect({ tag: manifest.releaseTag, root: manifest.root, locale: manifest.locale, format: manifest.format })
			.toEqual({ tag: "v2", root: ROOT, locale: "en", format: "md-dse" });
	});
});

describe("applySync: the manifest after a mixed release", () => {
	test("records exactly the files the plugin now owns: created + updated + unchanged, never a skipped squatter or a kept edit", async () => {
		const { vault, store, service } = setup();
		vault.setText(`${ROOT}/squat.md`, "s-theirs"); // the user's own file on a path the release will want
		const first = await service.applySync(
			incomingOf({ "keep.md": "k1", "edit.md": "e1", "squat.md": "s1", "old.md": "o1", "moved.md": "m1" }), null, OPTIONS, "v1");
		expect(Object.keys(first.manifest.files).sort()).toEqual(["edit.md", "keep.md", "moved.md", "old.md"]); // squat.md was the user's
		expect(vault.text(`${ROOT}/squat.md`)).toBe("s-theirs");
		vault.setText(`${ROOT}/moved.md`, "m1 + my edit"); // removed upstream below, but edited
		const second = await service.applySync(
			incomingOf({ "keep.md": "k1", "edit.md": "e2", "squat.md": "s2", "new.md": "n1" }), first.manifest, OPTIONS, "v2");
		expect(second.report).toMatchObject({
			created: ["new.md"], updated: ["edit.md"], unchanged: ["keep.md"], skippedConflicts: ["squat.md"],
			trashed: ["old.md"], keptModified: ["moved.md"], rejectedPaths: [],
		});
		expect(Object.keys(second.manifest.files).sort()).toEqual(["edit.md", "keep.md", "new.md"]);
		expect(vault.text(`${ROOT}/moved.md`)).toBe("m1 + my edit");
		expect((await store.load())!.releaseTag).toBe("v2");
	});

	test("the same release twice: the second run creates, updates and trashes nothing and only the manifest's timestamp changes", async () => {
		const { vault, service } = setup();
		const release = incomingOf({ "a.md": "A", "dir/b.md": "B" });
		const first = await service.applySync(release, null, OPTIONS, "v1");
		const before = new Map([...vault.files].map(([p, b]) => [p, new TextDecoder().decode(b)]));
		const second = await service.applySync(release, first.manifest, OPTIONS, "v1");
		expect(second.report).toMatchObject({ created: [], updated: [], trashed: [], keptModified: [], skippedConflicts: [], rejectedPaths: [] });
		expect(second.report.unchanged.sort()).toEqual(["a.md", "dir/b.md"]);
		expect(new Map([...vault.files].map(([p, b]) => [p, new TextDecoder().decode(b)]))).toEqual(before);
		expect({ ...second.manifest, syncedAt: "" }).toEqual({ ...first.manifest, syncedAt: "" });
	});
});

describe("applySync: nothing outside the Destination folder, and nothing of the user's, is ever touched", () => {
	const TREE: Record<string, string> = {
		"Welcome.md": "my welcome note",
		"Daily/2026-01-01.md": "a diary entry",
		[`${ROOT}/My Homebrew.md`]: "never installed by the plugin",
		[`${ROOT}/class/My Class.md`]: "mine, inside a compendium folder",
	};
	const seed = (vault: ReturnType<typeof setup>["vault"]) => {
		for (const [p, c] of Object.entries(TREE)) vault.setText(p, c);
	};
	const textOf = (vault: ReturnType<typeof setup>["vault"]): Record<string, string> =>
		Object.fromEntries([...vault.files].map(([p, b]) => [p, new TextDecoder().decode(b)]));

	test("first sync, newer-tag sync and a release that removes files: every note of the user's is byte-identical, and every created or changed vault path is under the Destination folder", async () => {
		const { vault, service } = setup();
		seed(vault);
		const touched = new Set<string>();
		const original = TREE;
		const first = await service.applySync(incomingOf({ "class/a.md": "A1", "rule/b.md": "B1", "gone.md": "G1" }), null, OPTIONS, "v1");
		const second = await service.applySync(incomingOf({ "class/a.md": "A2", "rule/b.md": "B1", "rule/new.md": "N" }), first.manifest, OPTIONS, "v2");
		const third = await service.applySync(incomingOf({ "rule/b.md": "B1" }), second.manifest, OPTIONS, "v3");
		for (const p of Object.keys(textOf(vault))) if (!(p in original)) touched.add(p);
		for (const [p, c] of Object.entries(original)) expect({ p, now: textOf(vault)[p] }).toEqual({ p, now: c });
		for (const p of touched) expect(p.startsWith(`${ROOT}/`)).toBe(true);
		expect(third.report.trashed.sort()).toEqual(["class/a.md", "rule/new.md"]);
		// the only non-vault write is the manifest
		expect([...(vault.adapter.store.keys())]).toEqual([MANIFEST]);
	});

	test("an incoming path that tries to leave the Destination folder (parent segments, absolute, drive-prefixed, backslash forms) is rejected, and no file lands outside it", async () => {
		const { vault, service } = setup();
		seed(vault);
		const hostile = ["../escape.md", "a/../../escape.md", "/abs.md", "\\abs-backslash.md", "C:\\drive.md", "C:/drive2.md", "a\\..\\..\\escape2.md", "x/../../../escape3.md"];
		const { report } = await service.applySync(incomingOf({ ...Object.fromEntries(hostile.map((p) => [p, "evil"])), "fine.md": "ok" }), null, OPTIONS, "v1");
		expect(report.rejectedPaths.sort()).toEqual([...hostile].sort());
		expect(report.created).toEqual(["fine.md"]);
		for (const p of vault.files.keys()) {
			if (p in TREE) continue;
			expect(p).toBe(`${ROOT}/fine.md`);
		}
		for (const bad of ["escape.md", "abs.md", "abs-backslash.md", "drive.md", "escape2.md", "escape3.md"]) expect(vault.files.has(bad)).toBe(false);
	});

	test("names that look odd but stay inside the root are written inside it: a doubled slash, a hidden folder, names that only differ by case", async () => {
		const { vault, service } = setup();
		const { report } = await service.applySync(
			incomingOf({ "a//double.md": "2", ".obsidian/inside.md": "3", "Case.md": "4", "case.md": "5" }), null, OPTIONS, "v1");
		expect(report.rejectedPaths).toEqual([]);
		for (const p of vault.files.keys()) expect(p.startsWith(`${ROOT}/`)).toBe(true);
		expect([...vault.files.keys()].sort()).toEqual([
			`${ROOT}/.obsidian/inside.md`, `${ROOT}/Case.md`, `${ROOT}/a/double.md`, `${ROOT}/case.md`]);
	});

	test("a file the user edited that is removed upstream is kept byte-for-byte; the trash is only ever handed files whose bytes still equal what was installed", async () => {
		const { vault, fileManager, service } = setup();
		const first = await service.applySync(incomingOf({ "a.md": "A", "b.md": "B", "c.md": "C" }), null, OPTIONS, "v1");
		vault.setText(`${ROOT}/b.md`, "B but edited");
		const second = await service.applySync(incomingOf({}), first.manifest, OPTIONS, "v2");
		expect(second.report.trashed.sort()).toEqual(["a.md", "c.md"]);
		expect(second.report.keptModified).toEqual(["b.md"]);
		expect(fileManager.trashed.sort()).toEqual([`${ROOT}/a.md`, `${ROOT}/c.md`]);
		expect(vault.text(`${ROOT}/b.md`)).toBe("B but edited");
	});
});
