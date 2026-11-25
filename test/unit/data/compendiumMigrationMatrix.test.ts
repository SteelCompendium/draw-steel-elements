// SC-441 — the pre-7.0.0 migration engine, crossed: the detection threshold at its edges, a Stop at EVERY poll point of a run (every source ends
// at exactly one of its two paths, every modified file that moved has its backup, then the remainder finishes to completion), the destination
// and the source changing between the preview and the run, the persisted state, and where the engine writes (the files it may create).
//
// ALREADY COVERED by compendiumMigration.test.ts (not repeated): the 5 / 20 detection pair, plan classification of one pristine / modified /
// historical / blocked file, rename-only execution, idempotence, one abort, a throwing rename, the manifest hand-off, the H1 interruption
// scenarios, declined / incomplete flags, the report note, case folders, a transitional release, the backup ordering and failure cases.
// THIS file adds the edges (19), the Stop sweep, the between-plan-and-run changes, the file-tree rule and the state table.
import {
	CompendiumMigrationService, LEGACY_DETECTION_THRESHOLD, migrationMap,
} from "@/data/CompendiumMigration";
import type { MigrationMap } from "@/data/CompendiumMigration";
import { CompendiumSyncService } from "@/data/CompendiumSyncService";
import { ManifestStore, sha256Hex } from "@/data/manifest";
import { MigrationStateStore } from "@/data/migrationState";
import { makeFakeApp } from "../../fakes/fakeObsidian";

const ROOT = "DS Compendium";
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const hashOf = async (text: string): Promise<string> => (await sha256Hex(bytes(text))).slice(0, 16);
const STATE = ".obsidian/plugins/draw-steel-elements/compendium-migration-state.json";
const MANIFEST = ".obsidian/plugins/draw-steel-elements/compendium-manifest.json";

// Eight mapped files: three PRISTINE (hash matches), three EDITED by the user (hash differs), two HISTORICAL (no hash: unknowable, so backed up).
const PRISTINE = ["p1", "p2", "p3"];
const EDITED = ["e1", "e2", "e3"];
const HISTORICAL = ["h1", "h2"];
async function matrixMap(): Promise<MigrationMap> {
	const paths: MigrationMap["paths"] = {};
	for (const n of PRISTINE) paths[`Old/${n}.md`] = [`new/${n}.md`, await hashOf(`text of ${n}`)];
	for (const n of EDITED) paths[`Old/${n}.md`] = [`new/${n}.md`, await hashOf(`text of ${n}`)];
	for (const n of HISTORICAL) paths[`Old/${n}.md`] = [`new/${n}.md`];
	return {
		schemaVersion: 1, oldSource: "SteelCompendium/data-md-dse", oldFinalRelease: "v3.test", oldReleasesCovered: 1,
		newSource: "SteelCompendium/data-unified", newFormat: "md-dse", newLocale: "en", newSnapshot: "test", newRelease: "v4.test",
		counts: {}, paths,
	};
}
const textOf = (n: string): string => `text of ${n}`;
const editedTextOf = (n: string): string => `text of ${n} EDITED BY THE USER`;
const ALL = [...PRISTINE, ...EDITED, ...HISTORICAL];
const bodyOf = (n: string): string => (EDITED.includes(n) ? editedTextOf(n) : HISTORICAL.includes(n) ? `historical ${n}` : textOf(n));

async function setup() {
	const { app, vault, fileManager } = makeFakeApp();
	const store = new ManifestStore(app, "draw-steel-elements");
	const stateStore = new MigrationStateStore(app, "draw-steel-elements");
	const service = new CompendiumMigrationService(app, store, stateStore, await matrixMap());
	for (const n of ALL) vault.setText(`${ROOT}/Old/${n}.md`, bodyOf(n));
	vault.setText(`${ROOT}/Old/_Index.md`, "an index page with no counterpart");
	vault.setText(`${ROOT}/My Notes.md`, "the user's own note inside the compendium folder");
	vault.setText("Elsewhere/Journal.md", "a note outside the folder");
	return { app, vault, fileManager, store, stateStore, service };
}
type Ctx = Awaited<ReturnType<typeof setup>>;
const textMap = (vault: Ctx["vault"]): Record<string, string> =>
	Object.fromEntries([...vault.files].map(([p, b]) => [p, new TextDecoder().decode(b)]));

describe("detection threshold: the edges, with the shipped map", () => {
	test.each([
		[0, false], [1, false], [19, false], [20, true], [21, true], [200, true],
	])("%i files at pre-7.0.0 paths: legacy layout = %s", async (count, legacy) => {
		const { app, vault } = makeFakeApp();
		const service = new CompendiumMigrationService(app, new ManifestStore(app, "x"), new MigrationStateStore(app, "x"), migrationMap());
		for (const oldPath of Object.keys(migrationMap().paths).slice(0, count)) vault.setText(`${ROOT}/${oldPath}`, "x");
		// user notes next to them never count, whatever their number
		for (let i = 0; i < 30; i++) vault.setText(`${ROOT}/my-notes/${i}.md`, "mine");
		const detection = service.detect(ROOT);
		expect(detection.legacyPaths).toBe(count);
		expect(detection.filesInRoot).toBe(count + 30);
		expect(detection.isLegacyLayout).toBe(legacy);
		expect(LEGACY_DETECTION_THRESHOLD).toBe(20);
	});
});

describe("plan x file state: every kind of file lands in exactly one bucket", () => {
	test("pristine, edited, historical, occupied, unmapped, a user note on a destination and the user's own notes: one plan, one bucket each", async () => {
		const ctx = await setup();
		ctx.vault.setText(`${ROOT}/new/p1.md`, "the user's own note parked on a destination");
		const plan = await ctx.service.plan(ROOT);
		expect(plan.renames.map((r) => r.oldRelative).sort()).toEqual(["Old/e1.md", "Old/e2.md", "Old/e3.md", "Old/h1.md", "Old/h2.md", "Old/p2.md", "Old/p3.md"]);
		expect(Object.fromEntries(plan.renames.map((r) => [r.oldRelative, r.modified]))).toEqual({
			"Old/p2.md": false, "Old/p3.md": false, "Old/e1.md": true, "Old/e2.md": true, "Old/e3.md": true, "Old/h1.md": null, "Old/h2.md": null,
		});
		expect(plan.blocked).toEqual([{ fromPath: `${ROOT}/Old/p1.md`, toPath: `${ROOT}/new/p1.md` }]);
		// no mapping = left alone: the index page, the user's note, and the user's note parked on a destination (a new-layout path is not a legacy one)
		expect(plan.unmapped.sort()).toEqual([`${ROOT}/My Notes.md`, `${ROOT}/Old/_Index.md`, `${ROOT}/new/p1.md`]);
		expect(plan.backupCount).toBe(5); // 3 edited + 2 unknown: only the byte-identical ones are not copied
		expect(plan.backupFolder).toBe(`${ROOT} backup (pre-7.0.0)`);
		// a plan is a dry run: nothing in the vault or the stores changed
		expect(ctx.fileManager.renamed).toEqual([]);
		expect([...ctx.vault.adapter.store.keys()]).toEqual([]);
	});
});

describe("a Stop at every poll point of a run", () => {
	// 5 files need a backup (3 edited + 2 historical) and 8 moves are planned: the engine polls shouldAbort once per backup copy and once per
	// move, so a Stop can land after 0..12 polls. k = 13 never triggers (the run ends first): a complete run.
	const POLLS = 5 + 8;
	test.each(Array.from({ length: POLLS + 1 }, (_, k) => k))("Stop after %i polls: every file is at exactly one of its two paths with its bytes, every moved edit has its backup, and the remainder then finishes", async (k) => {
		const ctx = await setup();
		const before = textMap(ctx.vault);
		const plan = await ctx.service.plan(ROOT);
		const total = plan.renames.length;
		expect(total).toBe(8);
		let polls = 0;
		const report = await ctx.service.execute(plan, { shouldAbort: () => polls++ >= k });
		const after = textMap(ctx.vault);

		// 1. never both, never neither, same bytes
		for (const r of plan.renames) {
			const atOld = r.fromPath in after;
			const atNew = r.toPath in after;
			expect({ path: r.oldRelative, atOld, atNew }).toEqual({ path: r.oldRelative, atOld: !atNew, atNew: !atOld });
			expect(after[atNew ? r.toPath : r.fromPath]).toBe(before[r.fromPath]);
		}
		// 2. the report adds up
		expect(report.aborted).toBe(k < POLLS);
		expect(report.migrated.length + report.remaining).toBe(total);
		expect(report.migrated.every((r) => r.toPath in after && !(r.fromPath in after))).toBe(true);
		// 3. a modified or unknown file that MOVED has a backup holding its pre-move bytes (a backup is never taken after the move)
		const backups = Object.fromEntries(report.backedUp.map((b) => [b.fromPath, b.backupPath]));
		for (const r of report.migrated.filter((m) => m.modified !== false)) {
			expect(backups[r.fromPath]).toBeDefined();
			expect(after[backups[r.fromPath]]).toBe(before[r.fromPath]);
		}
		for (const b of report.backedUp) expect(after[b.backupPath]).toBe(before[b.fromPath]);
		// 4. everything that is not a planned file is byte-identical, and the only new paths are moves, backups, the report note
		for (const p of ["Elsewhere/Journal.md", `${ROOT}/My Notes.md`, `${ROOT}/Old/_Index.md`]) expect(after[p]).toBe(before[p]);
		const created = Object.keys(after).filter((p) => !(p in before));
		for (const p of created) {
			const isMove = plan.renames.some((r) => r.toPath === p);
			const isBackup = p.startsWith(`${ROOT} backup (pre-7.0.0)/`);
			const isReport = /^Draw Steel Elements migration report .*\.md$/.test(p);
			expect({ p, expected: isMove || isBackup || isReport }).toEqual({ p, expected: true });
		}
		// 5. the persisted state: pending exactly when a Stop left work, write-ahead names every planned destination
		const state = await ctx.stateStore.load();
		expect(state?.incomplete).toBe(report.aborted && report.remaining > 0);
		expect(await ctx.service.isPending()).toBe(report.aborted && report.remaining > 0);
		if (state) for (const r of report.migrated) expect(state.migrated).toContain(r.newRelative);

		// 6. the remainder finishes, to completion, and a further run has nothing left
		if (report.aborted) {
			const rest = await ctx.service.plan(ROOT);
			expect(rest.renames).toHaveLength(report.remaining);
			const done = await ctx.service.execute(rest);
			expect(done.aborted).toBe(false);
			expect(done.migrated).toHaveLength(report.remaining);
		}
		for (const r of plan.renames) {
			expect(ctx.vault.text(r.toPath)).toBe(before[r.fromPath]);
			expect(ctx.vault.text(r.fromPath)).toBeUndefined();
		}
		expect(await ctx.service.isPending()).toBe(false);
		expect((await ctx.service.plan(ROOT)).renames).toEqual([]);
		// and the sync manifest knows every moved file, so the next sync updates them in place instead of skipping them
		const manifest = await ctx.store.load();
		expect(Object.keys(manifest!.files).sort()).toEqual(plan.renames.map((r) => r.newRelative).sort());
	});
});

describe("the vault changing between the preview and the run", () => {
	test("a file that takes a planned destination after the preview is NOT overwritten: its bytes survive, the source stays, the pair is reported as blocked", async () => {
		const ctx = await setup();
		const plan = await ctx.service.plan(ROOT);
		ctx.vault.setText(`${ROOT}/new/p2.md`, "the user created this after the preview");
		const report = await ctx.service.execute(plan);
		expect(ctx.vault.text(`${ROOT}/new/p2.md`)).toBe("the user created this after the preview");
		expect(ctx.vault.text(`${ROOT}/Old/p2.md`)).toBe(textOf("p2"));
		expect(report.blocked).toEqual([{ fromPath: `${ROOT}/Old/p2.md`, toPath: `${ROOT}/new/p2.md` }]);
		expect(report.failed).toEqual([]);
		expect(report.migrated).toHaveLength(7);
		expect(ctx.fileManager.renamed.map((r) => r.to)).not.toContain(`${ROOT}/new/p2.md`);
	});

	test("a source that vanishes after the preview is skipped without an error and the rest of the run goes on", async () => {
		const ctx = await setup();
		const plan = await ctx.service.plan(ROOT);
		ctx.vault.files.delete(`${ROOT}/Old/e2.md`);
		const report = await ctx.service.execute(plan);
		expect(report.failed).toEqual([]);
		expect(report.migrated.map((r) => r.oldRelative)).not.toContain("Old/e2.md");
		expect(report.migrated).toHaveLength(7);
		expect(report.aborted).toBe(false);
		// nothing was invented at the destination of the vanished file, and no backup of a file that was not there
		expect(ctx.vault.text(`${ROOT}/new/e2.md`)).toBeUndefined();
		expect(report.backedUp.map((b) => b.fromPath)).not.toContain(`${ROOT}/Old/e2.md`);
	});

	test("a source EDITED after the preview is moved with the edit and backed up with the edit (the bytes read at run time are the bytes copied)", async () => {
		const ctx = await setup();
		const plan = await ctx.service.plan(ROOT);
		ctx.vault.setText(`${ROOT}/Old/e1.md`, "edited again after the preview");
		const report = await ctx.service.execute(plan);
		expect(ctx.vault.text(`${ROOT}/new/e1.md`)).toBe("edited again after the preview");
		const backup = report.backedUp.find((b) => b.fromPath === `${ROOT}/Old/e1.md`);
		expect(ctx.vault.text(backup!.backupPath)).toBe("edited again after the preview");
	});
});

describe("where the engine writes", () => {
	test("a complete run creates only the moved files, the backup folder beside the compendium, the report note at the vault root, and the two state files", async () => {
		const ctx = await setup();
		const before = textMap(ctx.vault);
		const plan = await ctx.service.plan(ROOT);
		const report = await ctx.service.execute(plan);
		const after = textMap(ctx.vault);
		const created = Object.keys(after).filter((p) => !(p in before)).sort();
		const gone = Object.keys(before).filter((p) => !(p in after)).sort();
		expect(gone).toEqual(plan.renames.map((r) => r.fromPath).sort());
		expect(created.filter((p) => !plan.renames.some((r) => r.toPath === p)).sort()).toEqual([
			...report.backedUp.map((b) => b.backupPath),
			report.reportNotePath as string,
		].sort());
		expect(report.reportNotePath).toMatch(/^Draw Steel Elements migration report \d{4}-\d{2}-\d{2} \d{4}\.md$/); // the vault root, never inside the compendium folder
		expect(report.backupFolder).toBe(`${ROOT} backup (pre-7.0.0)`);
		expect(report.backedUp).toHaveLength(5);
		expect([...ctx.vault.adapter.store.keys()].sort()).toEqual([MANIFEST, STATE]);
		// no trash, no delete: renames only
		expect(ctx.fileManager.trashed).toEqual([]);
		expect(ctx.fileManager.renamed).toHaveLength(8);
	});

	test("after a complete run the dry run has nothing to move and writes nothing at all: no state change, no report note, no backup, no manifest rewrite", async () => {
		const ctx = await setup();
		await ctx.service.execute(await ctx.service.plan(ROOT));
		const treeBefore = textMap(ctx.vault);
		const adapterBefore = new Map(ctx.vault.adapter.store);
		const second = await ctx.service.plan(ROOT);
		expect(second.renames).toEqual([]);
		expect(second.backupCount).toBe(0);
		expect(second.blocked).toEqual([]);
		expect(textMap(ctx.vault)).toEqual(treeBefore);
		expect(new Map(ctx.vault.adapter.store)).toEqual(adapterBefore);
		// main.ts never opens the window for it (it says "nothing to migrate"), so `execute` is not reached: see syncCompendiumMatrix.test.ts
	});
});

describe("the persisted state: which flags make the offer owed", () => {
	const states: Array<[string, (ctx: Ctx) => Promise<void>, boolean]> = [
		["no state at all", async () => {}, false],
		["declined", async (ctx) => ctx.service.markDeclined(ROOT), true],
		["incomplete (a run was stopped)", async (ctx) => {
			let polls = 0;
			await ctx.service.execute(await ctx.service.plan(ROOT), { shouldAbort: () => polls++ >= 7 });
		}, true],
		["settled after a decline", async (ctx) => { await ctx.service.markDeclined(ROOT); await ctx.service.markSettled(ROOT); }, false],
		["settled after a stopped run", async (ctx) => {
			let polls = 0;
			await ctx.service.execute(await ctx.service.plan(ROOT), { shouldAbort: () => polls++ >= 7 });
			await ctx.service.markSettled(ROOT);
		}, false],
		["a completed run", async (ctx) => { await ctx.service.execute(await ctx.service.plan(ROOT)); }, false],
		["declined, then a run that completed", async (ctx) => { await ctx.service.markDeclined(ROOT); await ctx.service.execute(await ctx.service.plan(ROOT)); }, false],
	];
	test.each(states)("%s: the offer is owed = %s", async (_name, arrange, owed) => {
		const ctx = await setup();
		await arrange(ctx);
		expect(await ctx.service.isPending()).toBe(owed);
	});

	test("settling a vault that never had a state file does not invent one (so a vault that never ran the migration keeps no migration state)", async () => {
		const ctx = await setup();
		await ctx.service.markSettled(ROOT);
		expect(await ctx.stateStore.load()).toBeNull();
	});
});

describe("the migration then the sync: the user's own notes survive both, byte-for-byte", () => {
	test("a note of the user's inside the compendium folder, a note parked on a destination, and a note outside survive the move and the next sync (new tag, release that drops files)", async () => {
		const ctx = await setup();
		ctx.vault.setText(`${ROOT}/new/p1.md`, "parked on a destination: the user's");
		const userNotes = { [`${ROOT}/My Notes.md`]: "the user's own note inside the compendium folder", "Elsewhere/Journal.md": "a note outside the folder", [`${ROOT}/new/p1.md`]: "parked on a destination: the user's" };
		const report = await ctx.service.execute(await ctx.service.plan(ROOT));
		expect(report.blocked).toHaveLength(1);
		const sync = new CompendiumSyncService(ctx.app, ctx.store);
		const manifest = (await ctx.store.load())!;
		const incoming = new Map<string, Uint8Array>([["new/p2.md", bytes("v4 p2")], ["new/p3.md", bytes("v4 p3")], ["new/p1.md", bytes("v4 p1")], ["fresh.md", bytes("fresh")]]);
		const { report: syncReport } = await sync.applySync(incoming, manifest, { root: ROOT, locale: "en" }, "v4");
		expect(syncReport.skippedConflicts).toEqual(["new/p1.md"]); // the user's parked note is a squatter, never adopted, never overwritten
		for (const [p, c] of Object.entries(userNotes)) expect(ctx.vault.text(p)).toBe(c);
	});
});
