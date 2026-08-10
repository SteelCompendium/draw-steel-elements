// SC-125 (review M6) — the full-corpus dry-run census, committed so the headline
// evidence in the gate comment is reproducible rather than a number from a harness
// that only ever existed in someone's scratch directory.
//
// It needs the real legacy tree, so it is OPT-IN. Extract any data-md-dse release and
// point the env var at it:
//
//   git -C /path/to/data-md-dse archive v3.20260403152914 | tar -x -C /tmp/legacy-tree
//   SC125_LEGACY_TREE=/tmp/legacy-tree \
//     devbox run -- bash -c 'cd <repo> && npx jest test/unit/data/migrationCensus'
//
// Writes its transcript to $SC125_CENSUS_OUT (default /tmp/sc125-dryrun.txt).
//
// The census arithmetic is the point of the fix: the first version classified the
// post-migration vault against a HARD-CODED list of new-layout top-level folders and
// silently lost 425 files that lived under the twenty-odd folders it forgot. It now
// counts "not under any LEGACY top level", which is closed by construction — every
// file is either still under an old root or it is not.
import * as fs from "fs";
import * as path from "path";
import { CompendiumMigrationService, describePlan } from "@/data/CompendiumMigration";
import { ManifestStore } from "@/data/manifest";
import { MigrationStateStore } from "@/data/migrationState";
import { makeFakeApp } from "../../fakes/fakeObsidian";

const TREE = process.env.SC125_LEGACY_TREE;
const OUT = process.env.SC125_CENSUS_OUT ?? "/tmp/sc125-dryrun.txt";
const ROOT = "DS Compendium";
/** Every top-level folder the data-md-dse layout ever used. */
const LEGACY_ROOTS = ["Rules", "Bestiary", "Adventures", "Abilities", "Kits", "Cultures",
	"Negotiation", "Skills", "Ancestries", "Careers", "Classes", "Complications",
	"Conditions", "Monsters", "Movement", "Perks", "Titles", "Treasures"];

function walk(dir: string, base = dir): string[] {
	const out: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === ".git" || entry.name === ".github") continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(full, base));
		else if (entry.name.endsWith(".md")) out.push(path.relative(base, full).split(path.sep).join("/"));
	}
	return out;
}

const maybe = TREE === undefined ? describe.skip : describe;

maybe("SC-125 full-corpus dry-run census", () => {
	test("plans, executes and re-plans a real legacy release tree", async () => {
		const paths = walk(TREE!).sort();
		const { app, vault } = makeFakeApp();
		for (const p of paths) vault.setText(`${ROOT}/${p}`, fs.readFileSync(path.join(TREE!, p), "utf8"));
		// One file the "user" edited, to prove the modified flag fires on real content,
		// and one of their own notes, to prove unmapped files are reported.
		const edited = "Rules/Careers/Disciple.md";
		vault.setText(`${ROOT}/${edited}`,
			`${fs.readFileSync(path.join(TREE!, edited), "utf8")}\n\nMY OWN NOTES\n`);
		vault.setText(`${ROOT}/My Campaign Notes.md`, "mine, not the compendium's");

		const service = new CompendiumMigrationService(
			app, new ManifestStore(app, "dse"), new MigrationStateStore(app, "dse"));
		const detection = service.detect(ROOT);
		const plan = await service.plan(ROOT);
		const report = await service.execute(plan, { writeReportNote: false });
		const second = await service.plan(ROOT);

		const all = [...vault.files.keys()].filter((p) => p.startsWith(`${ROOT}/`));
		const stillLegacy = all.filter((p) =>
			LEGACY_ROOTS.some((r) => p.startsWith(`${ROOT}/${r}/`)));
		const migratedOut = all.filter((p) => !stillLegacy.includes(p));

		const lines = [
			`legacy tree: ${TREE!}  (${paths.length} markdown files)`,
			`map: ${service["map"].oldFinalRelease} → ${service["map"].newRelease}`,
			"",
			`DETECTION: ${JSON.stringify(detection)}`,
			"",
			"DRY-RUN PREVIEW (describePlan):",
			describePlan(plan, 8),
			"",
			`renames=${plan.renames.length} blocked=${plan.blocked.length} unmapped=${plan.unmapped.length}`,
			`modified-flagged=${plan.renames.filter((r) => r.modified === true).length}`,
			`  plan census: ${plan.renames.length} + ${plan.blocked.length} + ${plan.unmapped.length}` +
				` = ${plan.renames.length + plan.blocked.length + plan.unmapped.length}` +
				` (files in root: ${detection.filesInRoot})`,
			"",
			"UNMAPPED (first 10):",
			...plan.unmapped.slice(0, 10).map((p) => `  ${p}`),
			"",
			`EXECUTED: migrated=${report.migrated.length} failed=${report.failed.length}` +
				` blocked=${report.blocked.length} aborted=${report.aborted}`,
			`  post-migration census: ${migratedOut.length} at new-layout paths` +
				` + ${stillLegacy.length} still under a legacy top level = ${all.length}` +
				` (files in root: ${detection.filesInRoot})`,
			`RE-RUN (idempotency): renames=${second.renames.length}`,
		];
		fs.writeFileSync(OUT, `${lines.join("\n")}\n`);

		// The census must close, both before and after. This is the assertion the
		// original harness lacked, which is why its numbers didn't add up.
		expect(plan.renames.length + plan.blocked.length + plan.unmapped.length)
			.toBe(detection.filesInRoot);
		expect(migratedOut.length + stillLegacy.length).toBe(all.length);
		expect(all).toHaveLength(detection.filesInRoot);
		expect(second.renames).toHaveLength(0);
		expect(report.failed).toHaveLength(0);
	}, 180000);
});
