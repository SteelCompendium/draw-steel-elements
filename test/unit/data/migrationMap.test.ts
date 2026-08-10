// SC-125 — the SHIPPED migration map is data, and data ships with a contract. These
// tests are the contract: they run over `src/data/migrationMap.json` exactly as the
// plugin loads it, so a regenerated map that broke an invariant fails here rather
// than in somebody's vault.
//
// The human-review artifact is `docs/compendium-migration-map.md` (counts, tie-
// breakers, every unmatched path with a stated reason). This file is the machine half.
import {
	MIGRATION_MAP_SCHEMA_VERSION, migrationMap, validateMigrationMap,
} from "@/data/CompendiumMigration";
import type { MigrationMap, MigrationMapEntry } from "@/data/CompendiumMigration";

const MIGRATION_MAP = migrationMap();

/** A minimal well-formed map, cloned per test so a mutation can prove can-fail. */
function goodMap(): MigrationMap {
	return {
		schemaVersion: MIGRATION_MAP_SCHEMA_VERSION,
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
			"Rules/Careers/Disciple.md": ["career/disciple.md", "6ebd86e47c5c1395"],
			"Rules/Careers/Sage.md": ["career/sage.md", "aaaaaaaaaaaaaaaa"],
		},
	};
}

describe("the shipped migration map", () => {
	test("passes structural validation with zero problems", () => {
		expect(validateMigrationMap(MIGRATION_MAP)).toEqual([]);
	});

	test("is the real thing: thousands of entries, both books, and the corpus it was built from is recorded", () => {
		const entries = Object.entries(MIGRATION_MAP.paths);
		expect(entries.length).toBeGreaterThan(2000);
		expect(MIGRATION_MAP.oldSource).toBe("SteelCompendium/data-md-dse");
		expect(MIGRATION_MAP.newSource).toBe("SteelCompendium/data-unified");
		expect(MIGRATION_MAP.newFormat).toBe("md-dse");
		expect(MIGRATION_MAP.oldFinalRelease).toMatch(/^\w+\.\d{14}$/);
		expect(MIGRATION_MAP.oldReleasesCovered).toBeGreaterThan(1);
		// Both halves of the old tree are represented (Rules/ = heroes, Bestiary/ = monsters).
		expect(entries.some(([old]) => old.startsWith("Rules/"))).toBe(true);
		expect(entries.some(([old]) => old.startsWith("Bestiary/"))).toBe(true);
	});

	test("carries the spot-check pairs a human verified by hand", () => {
		// One per matching mechanism: a plain name match, a lore page vs its statblock
		// (the pair the type-family override exists to separate), a bracket-stripped
		// name, a level-disambiguated class feature, and an echelon-disambiguated rival.
		expect(MIGRATION_MAP.paths["Rules/Careers/Disciple.md"][0]).toBe("career/disciple.md");
		expect(MIGRATION_MAP.paths["Bestiary/Monsters/Bredbeddle/Bredbeddle.md"][0])
			.toBe("monster/group/bredbeddle.md");
		expect(MIGRATION_MAP.paths["Bestiary/Monsters/Bredbeddle/Statblocks/Bredbeddle.md"][0])
			.toBe("monster/bredbeddle/statblock/bredbeddle.md");
		expect(MIGRATION_MAP.paths["Bestiary/Monsters/Bredbeddle/Features/Bredbeddle Malice.md"][0])
			.toBe("monster/bredbeddle/bredbeddle-malice.md");
		expect(MIGRATION_MAP.paths["Rules/Features/Conduit/10th-Level Features/Characteristic Increase.md"][0])
			.toBe("feature/conduit/level-10/characteristic-increase.md");
		expect(MIGRATION_MAP.paths["Bestiary/Monsters/Rivals/1st Echelon/Statblocks/Rival Fury.md"][0])
			.toBe("monster/rival/1st-echelon/statblock/rival-fury.md");
	});

	test("every hashed (final-release) entry has a distinct destination", () => {
		const seen = new Set<string>();
		for (const [newPath, hash] of Object.values(MIGRATION_MAP.paths) as MigrationMapEntry[]) {
			if (hash === undefined) continue;
			expect(seen.has(newPath)).toBe(false);
			seen.add(newPath);
		}
		expect(seen.size).toBeGreaterThan(1500);
	});

	test("M1 — the map names the PUBLISHED data-unified release it was built against", () => {
		// A map generated from a working tree can carry a destination that the release
		// the plugin downloads does not have; the migration would move the file there
		// and the sync's phase 2 would then trash it. `tools/verify-migration-map.mjs`
		// enforces existence against the real asset; this pins that the provenance is
		// recorded at all, and that it is a release tag rather than a git describe.
		expect(MIGRATION_MAP.newRelease).toMatch(/^v\d+\.\d{14}$/);
	});

	test("M3 — nothing in the shipped map is unsafe on a case-insensitive filesystem", () => {
		const caseOnly = Object.entries(MIGRATION_MAP.paths).filter(
			([oldPath, entry]) => oldPath !== entry[0] && oldPath.toLowerCase() === entry[0].toLowerCase());
		expect(caseOnly).toEqual([]);
		const folders = new Map<string, string>();
		for (const entry of Object.values(MIGRATION_MAP.paths) as MigrationMapEntry[]) {
			const folder = entry[0].split("/").slice(0, -1).join("/");
			if (folder === "") continue;
			const owner = folders.get(folder.toLowerCase());
			if (owner === undefined) folders.set(folder.toLowerCase(), folder);
			else expect(owner).toBe(folder);
		}
	});

	test("the recorded counts agree with the map itself", () => {
		expect(Object.keys(MIGRATION_MAP.paths)).toHaveLength(MIGRATION_MAP.counts.mapped);
		const hashed = (Object.values(MIGRATION_MAP.paths) as MigrationMapEntry[])
			.filter((entry) => entry.length === 2).length;
		expect(hashed).toBe(MIGRATION_MAP.counts.mappedFromFinalRelease);
	});
});

describe("validateMigrationMap — can-fail proofs", () => {
	test("accepts a well-formed map (the control)", () => {
		expect(validateMigrationMap(goodMap())).toEqual([]);
	});

	test("rejects a destination that escapes the compendium root", () => {
		const map = goodMap();
		map.paths["Rules/Careers/Disciple.md"] = ["../../outside.md"];
		expect(validateMigrationMap(map)).toEqual([
			expect.stringContaining("unsafe destination"),
		]);
	});

	test("rejects an absolute destination", () => {
		const map = goodMap();
		map.paths["Rules/Careers/Disciple.md"] = ["/etc/passwd.md"];
		expect(validateMigrationMap(map)).toContainEqual(expect.stringContaining("unsafe destination"));
	});

	test("rejects two final-release paths pointing at one destination", () => {
		const map = goodMap();
		map.paths["Rules/Careers/Sage.md"] = ["career/disciple.md", "bbbbbbbbbbbbbbbb"];
		expect(validateMigrationMap(map)).toEqual([
			expect.stringContaining("two final-release paths map here"),
		]);
	});

	test("allows two HISTORICAL paths to share a destination (the same entity in two retired layouts)", () => {
		const map = goodMap();
		map.paths["Careers/Disciple.md"] = ["career/disciple.md"]; // no hash → not in the final release
		expect(validateMigrationMap(map)).toEqual([]);
	});

	test("rejects a self-mapping entry", () => {
		const map = goodMap();
		map.paths["career/disciple.md"] = ["career/disciple.md"];
		expect(validateMigrationMap(map)).toContainEqual(expect.stringContaining("maps to itself"));
	});

	test("M3 — rejects a case-only rename (a no-op on macOS/Windows)", () => {
		const map = goodMap();
		map.paths["Rules/Careers/Disciple.md"] = ["Rules/careers/disciple.md"];
		expect(validateMigrationMap(map)).toContainEqual(expect.stringContaining("case-only rename"));
	});

	test("M3 — rejects two destinations whose folders differ only by case", () => {
		const map = goodMap();
		map.paths["Rules/Careers/Sage.md"] = ["Career/sage.md", "cccccccccccccccc"];
		expect(validateMigrationMap(map)).toContainEqual(
			expect.stringContaining('clashes by case with "career"'));
	});

	test("rejects a malformed hash and a wrong schema version", () => {
		const map = goodMap();
		map.schemaVersion = 99;
		map.paths["Rules/Careers/Sage.md"] = ["career/sage.md", "NOT-HEX"];
		const problems = validateMigrationMap(map);
		expect(problems).toContainEqual(expect.stringContaining("schemaVersion is 99"));
		expect(problems).toContainEqual(expect.stringContaining('bad hash "NOT-HEX"'));
	});
});
