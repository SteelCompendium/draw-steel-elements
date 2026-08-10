#!/usr/bin/env node
/**
 * SC-125 release-time gate (review M1).
 *
 * Every destination in `src/data/migrationMap.json` must exist in the data-unified
 * release the plugin will actually download. If one does not, the migration moves the
 * user's file onto a path the incoming release has no entry for — and the sync's
 * phase 2 then sees a manifest-tracked file that is absent upstream and TRASHES it.
 * A wrong mapping would cost a broken link; a *dangling* mapping costs the file.
 *
 * The map is generated from an extracted copy of the published asset, so this is
 * belt-and-braces — but the two can drift the moment data-unified cuts a new release,
 * and this is the check that says so out loud.
 *
 *   # against a directory you already extracted
 *   node tools/verify-migration-map.mjs --tree /path/to/extracted/md-dse
 *
 *   # against a published release, downloaded on the spot (needs `gh`)
 *   node tools/verify-migration-map.mjs --release v4.20260803143953
 *   node tools/verify-migration-map.mjs --release latest
 *
 * Exit 0 = every destination exists. Exit 1 = at least one is dangling.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
	args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
}

const REPO = "SteelCompendium/data-unified";
const ASSET = "md-dse-unified-en.zip";
const mapPath = args.map ?? "src/data/migrationMap.json";
const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));

let tree = args.tree;
let describedAs = tree;
if (!tree) {
	const release = args.release ?? map.newRelease;
	if (!release) {
		console.error("give --tree <dir> or --release <tag|latest> (the map records no newRelease)");
		process.exit(2);
	}
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dse-map-verify-"));
	const view = release === "latest" ? [] : ["--tag", release];
	execFileSync("gh", ["release", "download", ...(release === "latest" ? [] : [release]),
		"--repo", REPO, "--pattern", ASSET, "--dir", dir], { stdio: "inherit" });
	void view;
	execFileSync("unzip", ["-q", path.join(dir, ASSET), "-d", path.join(dir, "tree")]);
	tree = path.join(dir, "tree");
	describedAs = `${REPO}@${release} ${ASSET}`;
}

const destinations = new Set(Object.values(map.paths).map((entry) => entry[0]));
const dangling = [...destinations].filter((p) => !fs.existsSync(path.join(tree, p))).sort();

console.log(
	`map ${mapPath} (built against ${map.newRelease || "?"}) — ` +
		`${destinations.size} distinct destinations checked against ${describedAs}`,
);
if (dangling.length === 0) {
	console.log("OK — every destination exists upstream.");
	process.exit(0);
}
console.error(`DANGLING: ${dangling.length} destination(s) are NOT in the release:`);
for (const p of dangling.slice(0, 50)) console.error(`  ${p}`);
if (dangling.length > 50) console.error(`  …and ${dangling.length - 50} more`);
console.error(
	"\nMigrating a file onto a path the release does not carry gets it TRASHED by the " +
		"sync's phase 2. Regenerate the map against this release before shipping.",
);
process.exit(1);
