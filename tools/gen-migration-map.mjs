#!/usr/bin/env node
/**
 * SC-125 — generate the pre-7.0.0 → 7.0.0 compendium path map.
 *
 * The 7.0.0 sync switched compendium sources from the retired
 * `SteelCompendium/data-md-dse` repo (whose release asset was a zip of the repo
 * root: `Rules/…`, `Bestiary/…`) to `SteelCompendium/data-unified`'s
 * `md-dse-unified-en.zip` (`career/…`, `monster/…`). Every vault-relative path
 * changed, so every user-authored `[[wikilink]]` into the compendium would break.
 *
 * This script emits the old-path → new-path table the in-plugin migration engine
 * replays with `app.fileManager.renameFile`, so Obsidian rewrites those links
 * itself. It is offline tooling: run by a maintainer against a local clone of the
 * old repo plus a local data-unified tree, and its OUTPUT is what ships.
 *
 *   node tools/gen-migration-map.mjs \
 *     --old  /path/to/data-md-dse            (a git clone, all tags fetched) \
 *     --new  /path/to/data-unified/en/unified/md-dse \
 *     --out  src/data/migrationMap.json \
 *     --report docs/compendium-migration-map.md
 *
 * IDENTITY KEY — deliberately NOT the SCC code. The ETL refactor that produced
 * data-unified also changed SCC codes (and codes are not frozen yet), so the two
 * trees disagree on them. What survived the refactor is the entity itself: its
 * NAME, its TYPE family and its BOOK. Those three are the key; see normalizeName()
 * and the family table below for the exact rules, and `--report` for the
 * human-reviewable result.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
	args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
}
for (const required of ["old", "new", "out"]) {
	if (!args[required]) {
		console.error(`missing --${required}`);
		process.exit(2);
	}
}

const OLD_SOURCE = "SteelCompendium/data-md-dse";
const NEW_SOURCE = "SteelCompendium/data-unified";

// ---------------------------------------------------------------------------
// normalization — the documented rules (docs/compendium-migration-map.md §rules)
// ---------------------------------------------------------------------------

/** Frontmatter in the old tree escapes markdown punctuation (`motivation\_or\_pitfall`). */
const deEscape = (s) => s.replace(/\\([_*`[\]()#+\-.!])/g, "$1");

/**
 * name → comparison slug. Order matters and each step is deliberate:
 *   1. drop frontmatter backslash escapes
 *   2. NFKD + drop combining marks  → diacritics fold (Ströh → stroh)
 *   3. lowercase                    → case-insensitive
 *   4. "&" → " and "                → "Hit & Run" == "Hit and Run"
 *   5. drop apostrophes entirely    → "Ajax's" == "Ajaxs" (never "ajax-s")
 *   6. every other non-alnum run → "-", trimmed → punctuation-insensitive
 */
function normalizeName(raw) {
	if (!raw) return "";
	let s = deEscape(String(raw));
	s = s.normalize("NFKD").replace(/\p{M}+/gu, "");
	s = s.toLowerCase();
	s = s.replace(/&/g, " and ");
	s = s.replace(/['‘’ʼ]/g, "");
	s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	return s;
}

/**
 * The old tree suffixes many display names with a bracketed qualifier the new tree
 * dropped: "Bredbeddle Malice (Malice Features)", "Lava (Level 3 Hazard Hexer)".
 * Tried as a SECOND name form, never in place of the literal name, so an entity
 * whose real name contains brackets still matches on its literal name first.
 */
const stripTrailingParen = (s) => s.replace(/\s*\([^()]*\)\s*$/, "").trim();

// ---------------------------------------------------------------------------
// frontmatter (top-level scalars only — a real YAML parse would throw on the odd
// exotic body value, and every field this script reads is a flat string)
// ---------------------------------------------------------------------------
function frontmatter(text) {
	if (!text.startsWith("---")) return {};
	const lines = text.split("\n");
	if (lines[0].trim() !== "---") return {};
	const out = {};
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].replace(/\r$/, "");
		if (line.trim() === "---") break;
		if (!line || /^[\s\-#]/.test(line)) continue;
		const colon = line.indexOf(":");
		if (colon < 0) continue;
		const key = line.slice(0, colon);
		if (/\s/.test(key)) continue;
		out[key.trim()] = line
			.slice(colon + 1)
			.trim()
			.replace(/^["'](.*)["']$/, "$1");
	}
	return out;
}

// ---------------------------------------------------------------------------
// type families — the coarse bucket both trees can be compared in. Used ONLY to
// score candidates that already agree on book + name; never to match on its own.
// ---------------------------------------------------------------------------

/**
 * A handful of old `type` values need their own family rather than their first
 * segment, because the first segment is too coarse to separate two things the new
 * tree keeps apart. `monster/section` is the monster's LORE page and must not be
 * allowed to land on its statblock (both are named after the monster), and
 * `monster/feature` is its malice featureblock.
 */
const OLD_TYPE_OVERRIDES = new Map([
	["monster/section", "monster-section"],
	["monster/feature", "monster-feature"],
]);

/** old `type` is a path ("monster/section", "feature/ability/conduit/1st-level-feature"). */
function oldFamily(row) {
	const type = deEscape(row.type || "");
	const override = OLD_TYPE_OVERRIDES.get(type);
	if (override) return override;
	const segments = type.split("/").filter(Boolean);
	if (segments.length === 0) return "";
	if (segments[segments.length - 1] === "statblock") return "statblock";
	return normalizeName(segments[0]);
}

/** new `type` is already a flat noun ("statblock", "ability", "featureblock"). */
const newFamily = (row) => normalizeName(row.type || "");

/**
 * Which new families an old family may legitimately land in. Derived empirically
 * from the unique-name matches (every pair below was observed and eyeballed), then
 * frozen here so a future regeneration cannot silently drift into a new pairing.
 */
const FAMILY_EQUIVALENCE = new Map(
	Object.entries({
		statblock: ["statblock"],
		monster: ["monster", "statblock", "featureblock"],
		"monster-section": ["monster"],
		"monster-feature": ["featureblock", "feature"],
		feature: ["feature", "ability", "rule", "featureblock", "trait"],
		"common-ability": ["feature", "ability"],
		"kit-ability": ["ability", "feature"],
		kit: ["kit"],
		ability: ["ability", "feature"],
		abilities: ["ability", "feature"],
		complication: ["complication"],
		treasure: ["treasure"],
		title: ["title"],
		perk: ["perk"],
		chapter: ["chapter"],
		career: ["career"],
		keywords: ["rule"],
		keyword: ["rule"],
		rule: ["rule"],
		ancestry: ["ancestry"],
		"culture-benefit": ["culture"],
		culture: ["culture"],
		cultures: ["culture"],
		"motivation-or-pitfall": ["negotiation"],
		negotiation: ["negotiation"],
		class: ["class"],
		classes: ["class"],
		condition: ["condition"],
		conditions: ["condition"],
		movement: ["movement", "rule"],
		skill: ["skill", "skill-group"],
		skills: ["skill", "skill-group"],
		"dynamic-terrain": ["dynamic-terrain"],
		project: ["project"],
		projects: ["project"],
		god: ["god"],
		saint: ["saint"],
		religion: ["god", "saint"],
	}),
);

const familyMatches = (oldFam, newFam) =>
	oldFam !== "" && (FAMILY_EQUIVALENCE.get(oldFam) ?? []).includes(newFam);

// ---------------------------------------------------------------------------
// old index — the UNION of every release tree, newest tag wins per path
// ---------------------------------------------------------------------------
const git = (repo, ...a) =>
	execFileSync("git", ["-C", repo, ...a], { encoding: "utf8", maxBuffer: 1 << 30 });

/**
 * data-md-dse tags are `<channel>.<YYYYMMDDhhmmss>` (`main.20260326114919`,
 * `v3.20260403152914`, `patron.20241028132300`). Sort on that embedded stamp, NOT
 * on `creatordate`: they are lightweight tags, so git falls back to the COMMIT date,
 * and the final `v3.*` series re-tags an older commit — creatordate order names the
 * wrong final release. Falls back to lexical order for any tag without a stamp.
 */
function tagStamp(tag) {
	const m = tag.match(/(\d{14})$/);
	return m ? m[1] : "";
}

function readOldTree(repo) {
	const tags = git(repo, "tag")
		.split("\n")
		.filter(Boolean)
		.sort((a, b) => (tagStamp(b) + b).localeCompare(tagStamp(a) + a));
	if (tags.length === 0) throw new Error(`${repo} has no tags — fetch them first`);
	const finalTag = args["final-tag"] ?? tags[0];
	// The final release must be visited first so it wins the "newest tag carrying
	// this path" race for identity/hash purposes.
	tags.sort((a, b) => (a === finalTag ? -1 : b === finalTag ? 1 : 0));

	/** path → { blob, tag } for the NEWEST tag that carries the path. */
	const byPath = new Map();
	const finalPaths = new Set();
	for (const tag of tags) {
		let listing;
		try {
			listing = git(repo, "ls-tree", "-r", tag);
		} catch {
			continue;
		}
		for (const line of listing.split("\n")) {
			if (!line) continue;
			const tab = line.indexOf("\t");
			if (tab < 0) continue;
			const filePath = line.slice(tab + 1);
			if (!filePath.endsWith(".md")) continue;
			const blob = line.slice(0, tab).split(/\s+/)[2];
			if (tag === finalTag) finalPaths.add(filePath);
			if (!byPath.has(filePath)) byPath.set(filePath, { blob, tag });
		}
	}

	// Batch-read every representative blob in one git process.
	const wanted = [...byPath.values()].map((v) => v.blob);
	const contents = batchCat(repo, wanted);

	const rows = [];
	for (const [filePath, { blob, tag }] of byPath) {
		const text = contents.get(blob) ?? "";
		const fm = frontmatter(text);
		const inFinal = finalPaths.has(filePath);
		rows.push({
			path: filePath,
			tag,
			inFinal,
			// sha256 is only meaningful for the final release: it is the one tree a
			// vault synced by the last legacy build actually holds. Earlier releases
			// churned content constantly, so a historical hash set would be ~22k
			// entries for no behavioural gain (the hash is informational — see
			// migration-engine docs).
			sha256: inFinal ? createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16) : "",
			source: fm.source || inferBook(filePath),
			itemName: fm.item_name || "",
			name: fm.name || fm.title || fm.title_raw || fm.name_raw || "",
			type: fm.type || "",
			subtype: fm.subtype || "",
			hasFrontmatter: Object.keys(fm).length > 0,
		});
	}
	return { rows, finalTag, tagCount: tags.length };
}

/**
 * The 2024-era trees predate the `source` frontmatter key. data-md-dse only ever
 * carried two books, split cleanly at the top level: everything under `Bestiary/`
 * is the monsters book, everything else is the heroes book. (Beastheart and
 * Summoner never shipped to data-md-dse at all — see the report's "new content".)
 */
function inferBook(filePath) {
	const top = filePath.split("/")[0].toLowerCase();
	if (top === "bestiary") return "mcdm.monsters.v1";
	if (top === "adventures") return "";
	return "mcdm.heroes.v1";
}

function batchCat(repo, blobs) {
	const unique = [...new Set(blobs)];
	const out = new Map();
	const CHUNK = 2000;
	for (let i = 0; i < unique.length; i += CHUNK) {
		const chunk = unique.slice(i, i + CHUNK);
		const buf = execFileSync("git", ["-C", repo, "cat-file", "--batch"], {
			input: chunk.join("\n") + "\n",
			maxBuffer: 1 << 30,
		});
		let offset = 0;
		for (const sha of chunk) {
			const nl = buf.indexOf(0x0a, offset);
			const header = buf.slice(offset, nl).toString("utf8");
			const size = Number(header.split(" ")[2]);
			const start = nl + 1;
			out.set(sha, buf.slice(start, start + size).toString("utf8"));
			offset = start + size + 1; // trailing newline
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// new index
// ---------------------------------------------------------------------------
function readNewTree(root) {
	const rows = [];
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.name.endsWith(".md")) {
				const fm = frontmatter(fs.readFileSync(full, "utf8"));
				rows.push({
					path: path.relative(root, full).split(path.sep).join("/"),
					source: fm.source || "",
					itemName: fm.item_name || "",
					name: fm.name || "",
					type: fm.type || "",
				});
			}
		}
	};
	walk(root);
	return rows;
}

// ---------------------------------------------------------------------------
// matching
// ---------------------------------------------------------------------------
const baseSlug = (p) => normalizeName(path.basename(p, ".md"));

function oldNameForms(row) {
	const forms = [];
	const push = (v) => {
		const slug = normalizeName(v);
		if (slug && !forms.includes(slug)) forms.push(slug);
	};
	push(row.itemName);
	push(stripTrailingParen(row.itemName));
	push(row.name);
	push(stripTrailingParen(row.name));
	push(path.basename(row.path, ".md"));
	return forms;
}

function newNameForms(row) {
	const forms = [];
	const push = (v) => {
		const slug = normalizeName(v);
		if (slug && !forms.includes(slug)) forms.push(slug);
	};
	push(row.itemName);
	push(row.name);
	push(path.basename(row.path, ".md"));
	return forms;
}

/**
 * Locator hints: the normalized folder segments of the OLD path plus the segments
 * of its old `type`, translated into the vocabulary the new tree uses for the same
 * distinctions. Two translations are needed and both are mechanical:
 *   - level:   `10th-Level Features` / `10th-level-feature`  →  `level-10`
 *   - plurals: `Rivals` → `rival`, `Statblocks` → `statblock`, `Monsters` → `monster`
 * Everything else carries over unchanged (`Conduit` → `conduit`, `1st Echelon` →
 * `1st-echelon`). This is what separates same-named siblings — every class has a
 * `Characteristic Increase` at levels 4/7/10, and every echelon has a `Rival Fury`.
 */
function hintSegments(row) {
	const hints = new Set();
	const add = (value) => {
		if (value) hints.add(value);
	};
	const raw = [
		...row.path.split("/").slice(0, -1),
		...deEscape(row.type || "").split("/"),
		row.subtype || "",
	];
	for (const segment of raw) {
		const slug = normalizeName(segment);
		if (!slug) continue;
		add(slug);
		const level = slug.match(/^(\d+)(?:st|nd|rd|th)-level(?:-features?)?$/);
		if (level) add(`level-${level[1]}`);
		if (slug.length > 3 && slug.endsWith("s") && !slug.endsWith("ss")) add(slug.slice(0, -1));
	}
	return hints;
}

const HINT_WEIGHT = 80;
const HINT_CAP = 5;

/**
 * TIE-BREAKERS, in the order they contribute. Only candidates that already agree
 * on (book, one name form) are ever scored, so these decide BETWEEN synonyms —
 * they never create a match on their own.
 */
const TIE_BREAKERS = [
	["family", 1000, "the old type family maps to the candidate's type (FAMILY_EQUIVALENCE)"],
	["statblock-dir", 400, "old path is under a `Statblocks/` folder and the candidate is under `statblock/`"],
	[
		"path-hint",
		`${HINT_WEIGHT} each, max ${HINT_CAP}`,
		"each old folder/type segment that reappears as a segment of the candidate path — " +
			"level (`10th-Level Features` → `level-10`) and plural (`Rivals` → `rival`) forms translated",
	],
	["features-dir", 300, "old path is under a `Features/` folder and the candidate is a featureblock/feature/ability"],
	["basename", 200, "the two file basenames normalize to the same slug"],
	["name-form", 60, "an earlier (more literal) name form matched — literal item_name beats a bracket-stripped one"],
	["path-depth", 1, "shallower candidate path wins an otherwise exact tie"],
];

function score(oldRow, cand, formIndex, formCount, hints) {
	let s = 0;
	const reasons = [];
	if (familyMatches(oldFamily(oldRow), newFamily(cand))) {
		s += 1000;
		reasons.push("family");
	}
	const oldSegments = oldRow.path.split("/").map((x) => x.toLowerCase());
	if (oldSegments.includes("statblocks") && `/${cand.path}`.includes("/statblock/")) {
		s += 400;
		reasons.push("statblock-dir");
	}
	if (
		oldSegments.includes("features") &&
		["featureblock", "feature", "ability", "trait"].includes(newFamily(cand))
	) {
		s += 300;
		reasons.push("features-dir");
	}
	if (baseSlug(oldRow.path) === baseSlug(cand.path)) {
		s += 200;
		reasons.push("basename");
	}
	const candSegments = cand.path.split("/").slice(0, -1);
	const hits = candSegments.filter((segment) => hints.has(segment)).length;
	if (hits > 0) {
		s += HINT_WEIGHT * Math.min(hits, HINT_CAP);
		reasons.push(`path-hint×${hits}`);
	}
	s += 60 * (formCount - formIndex);
	s -= cand.path.split("/").length; // shallower wins an exact tie
	return { s, reasons };
}

// ---------------------------------------------------------------------------
// unmatched classification
// ---------------------------------------------------------------------------
function unmatchedReason(row) {
	const base = path.basename(row.path);
	if (!row.hasFrontmatter) return "no-frontmatter (repo scaffolding: README/LICENSE/etc.)";
	if (row.type === "index" || /^_?index\.md$/i.test(base))
		return "index page — the unified layout has no folder index files";
	if (/ - Unlinked\.md$/.test(row.path) || /^(Rules|Bestiary|Adventures)\/[^/]+\.md$/.test(row.path))
		return "whole-book aggregate page — the unified (Browse) layout has no book-level pages";
	if (row.type === "chapter" || /\/Chapters\//.test(row.path))
		return "chapter aggregate page with no unified counterpart";
	if (/^Rules\/Classes By Level\//.test(row.path))
		return "per-class level roll-up page — the unified layout files each feature individually";
	if (/Role Advancement Abilities\//.test(row.path))
		return (
			"merged upstream (3 → 1): the retainer role's Level 4/7/10 pages became one " +
			"`monster/retainer/role-advancement/<role>.md`, so no single old path owns the rename"
		);
	if (/ (in|Outside of) Combat\.md$/.test(row.path))
		return (
			"merged upstream (2 → 1): the heroic resource's in-combat and out-of-combat pages " +
			"became one feature page named for the resource itself"
		);
	if (/Domain Piety and Effect\.md$/.test(row.path))
		return "merged upstream (11 → 1): the per-domain pages became one `Domain Piety and Effects` feature";
	if (/\/\d+(st|nd|rd|th) Level .* (Ability|Abilities)\.md$/.test(row.path))
		return "merged upstream: subclass ability container page — the unified layout files each ability individually";
	if (/^(Rules\/)?Movement\//.test(row.path))
		return "rules sub-section folded into its parent rule page upstream";
	if (/^Skills\/[^/]+ Skills\.md$/.test(row.path)) return "skill-group roll-up page, renamed beyond name matching";
	if (!row.inFinal)
		return (
			"retired layout only — this path existed in an older data-md-dse release and the " +
			"entity has no name+type+book match in the current unified tree"
		);
	return "no entity of this name+type+book in the unified tree (content removed or renamed beyond matching)";
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const { rows: oldRows, finalTag, tagCount } = readOldTree(args.old);
const newRows = readNewTree(args.new);

const newByKey = new Map();
for (const row of newRows) {
	for (const form of newNameForms(row)) {
		const key = `${row.source}|${form}`;
		if (!newByKey.has(key)) newByKey.set(key, []);
		newByKey.get(key).push(row);
	}
}

const matched = [];
const ambiguous = [];
const unmatched = [];

for (const row of oldRows) {
	if (!row.source) {
		unmatched.push({ ...row, reason: unmatchedReason(row) });
		continue;
	}
	const forms = oldNameForms(row);
	const hints = hintSegments(row);
	const seen = new Set();
	const scored = [];
	forms.forEach((form, formIndex) => {
		for (const cand of newByKey.get(`${row.source}|${form}`) ?? []) {
			if (seen.has(cand.path)) continue;
			seen.add(cand.path);
			const { s, reasons } = score(row, cand, formIndex, forms.length, hints);
			scored.push({ cand, s, reasons, form });
		}
	});
	if (scored.length === 0) {
		unmatched.push({ ...row, reason: unmatchedReason(row) });
		continue;
	}
	scored.sort((a, b) => b.s - a.s);
	if (scored.length > 1 && scored[0].s === scored[1].s) {
		ambiguous.push({ ...row, candidates: scored.filter((x) => x.s === scored[0].s) });
		continue;
	}
	matched.push({ old: row, new: scored[0].cand, score: scored[0].s, reasons: scored[0].reasons });
}

// INJECTIVITY, enforced exactly where it can bite: within the FINAL release tree,
// which is the snapshot a real vault actually holds. Two paths from that tree
// pointing at one new file cannot both be renamed, so the loser is DROPPED from the
// map (and reported) rather than left to race — the map is then a function on the
// final release, which is a property a reviewer can check. Historical layouts
// legitimately share a target (the same entity lived at two old paths across
// releases) and never coexist in one vault, so they are left alone. Belt and
// braces: the engine also refuses to rename onto a path that already exists.
const finalTargets = new Map();
const collisions = [];
const dropped = new Set();
// Deterministic winner: highest match score, then the lexicographically first old
// path. Never "whichever the walk happened to reach first".
for (const m of matched
	.filter((x) => x.old.inFinal)
	.sort((a, b) => b.score - a.score || (a.old.path < b.old.path ? -1 : 1))) {
	const prior = finalTargets.get(m.new.path);
	if (prior === undefined) {
		finalTargets.set(m.new.path, m);
		continue;
	}
	dropped.add(m.old.path);
	collisions.push({ target: m.new.path, winner: prior.old.path, dropped: m.old.path });
	unmatched.push({
		...m.old,
		reason:
			"duplicate in the final legacy release — another old path maps to the same unified " +
			"file and carries the rename (the old tree filed one entity under two paths)",
	});
}

// ---------------------------------------------------------------------------
// emit
// ---------------------------------------------------------------------------
const kept = matched.filter((m) => !dropped.has(m.old.path));
const paths = {};
for (const m of kept.sort((a, b) => (a.old.path < b.old.path ? -1 : 1))) {
	paths[m.old.path] = m.old.sha256 ? [m.new.path, m.old.sha256] : [m.new.path];
}

const map = {
	schemaVersion: 1,
	generator: "tools/gen-migration-map.mjs",
	generatedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
	oldSource: OLD_SOURCE,
	oldFinalRelease: finalTag,
	oldReleasesCovered: tagCount,
	newSource: NEW_SOURCE,
	newFormat: "md-dse",
	newLocale: "en",
	newSnapshot: args.snapshot ?? "",
	counts: {
		oldPathsSeen: oldRows.length,
		oldPathsInFinalRelease: oldRows.filter((r) => r.inFinal).length,
		newPaths: newRows.length,
		mapped: kept.length,
		mappedFromFinalRelease: kept.filter((m) => m.old.inFinal).length,
		ambiguous: ambiguous.length,
		unmatched: unmatched.length,
	},
	paths,
};

fs.mkdirSync(path.dirname(args.out), { recursive: true });
fs.writeFileSync(args.out, JSON.stringify(map, null, 1) + "\n");
console.log(
	`wrote ${args.out}: ${kept.length} mapped, ${ambiguous.length} ambiguous, ` +
		`${unmatched.length} unmatched (${(fs.statSync(args.out).size / 1024).toFixed(0)} KiB)`,
);

if (args.report) writeReport();

function writeReport() {
	const byBook = (rows, pick) => {
		const counter = new Map();
		for (const r of rows) {
			const k = pick(r);
			counter.set(k, (counter.get(k) ?? 0) + 1);
		}
		return [...counter.entries()].sort((a, b) => b[1] - a[1]);
	};
	const lines = [];
	lines.push("# Pre-7.0.0 compendium path map — review report");
	lines.push("");
	lines.push(`<!-- GENERATED by tools/gen-migration-map.mjs — do not hand-edit. -->`);
	lines.push("");
	lines.push(
		`Old corpus: \`${OLD_SOURCE}\` — ${tagCount} release tags, final \`${finalTag}\`, ` +
			`${map.counts.oldPathsSeen} distinct markdown paths across all of them ` +
			`(${map.counts.oldPathsInFinalRelease} in the final release).`,
	);
	lines.push("");
	lines.push(
		`New corpus: \`${NEW_SOURCE}\` \`en/unified/md-dse\`${args.snapshot ? ` @ \`${args.snapshot}\`` : ""} — ` +
			`${map.counts.newPaths} markdown files.`,
	);
	lines.push("");
	const finalCoverage = ((100 * map.counts.mappedFromFinalRelease) / map.counts.oldPathsInFinalRelease).toFixed(1);
	lines.push(
		`**Result: ${kept.length} mapped, ${ambiguous.length} ambiguous (unmapped), ` +
			`${unmatched.length} unmatched (unmapped).**`,
	);
	lines.push("");
	lines.push(
		`The number that decides what a real vault sees is the FINAL release: ` +
			`**${map.counts.mappedFromFinalRelease} of its ${map.counts.oldPathsInFinalRelease} paths ` +
			`are mapped (${finalCoverage}%)**. The rest are itemised under "Unmatched" below — every ` +
			`one has a stated reason, and every one is simply left where it is.`,
	);
	lines.push("");
	lines.push("## Where the map lives, and how to rebuild it");
	lines.push("");
	lines.push(
		"The map itself is `src/data/migrationMap.json`, **bundled into `main.js`**. It is " +
			"deliberately not fetched at runtime: the migration only has one chance to run " +
			"(the first sync destroys the old paths), so making it depend on the network — " +
			"offline, rate-limited, an asset that failed to publish — would trade a certain " +
			"outcome for a probable one. The cost is about 390 KiB of JSON, ~80 KiB over the " +
			"wire once compressed, and it can be dropped from a later release once 7.0.0 " +
			"adoption is done.",
	);
	lines.push("");
	lines.push("Rebuild both this report and the map with:");
	lines.push("");
	lines.push("```bash");
	lines.push("node tools/gen-migration-map.mjs \\");
	lines.push("  --old /path/to/data-md-dse            # a git clone, all tags fetched \\");
	lines.push("  --new /path/to/data-unified/en/unified/md-dse \\");
	lines.push("  --out src/data/migrationMap.json \\");
	lines.push("  --report docs/compendium-migration-map.md \\");
	lines.push("  --snapshot <data-unified git describe>");
	lines.push("```");
	lines.push("");
	lines.push(
		"`test/unit/data/migrationMap.test.ts` validates whatever the generator emits — " +
			"path safety, no self-mappings, and injectivity over the final release — so a " +
			"regeneration that breaks an invariant fails the build, not a vault.",
	);
	lines.push("");
	lines.push("## How an entity is matched");
	lines.push("");
	lines.push(
		"The SCC code is deliberately NOT the key: the ETL refactor that produced " +
			"data-unified changed codes, and they are not frozen. The key is the triple " +
			"**(book, name, type family)**.",
	);
	lines.push("");
	lines.push("**Book** — the `source` frontmatter key (`mcdm.heroes.v1` / `mcdm.monsters.v1`). ");
	lines.push(
		"The 2024-era trees predate that key; for those, everything under `Bestiary/` is the " +
			"monsters book and everything else is the heroes book (data-md-dse only ever carried those two).",
	);
	lines.push("");
	lines.push("**Name** — normalized with these rules, in this order:");
	lines.push("");
	lines.push("1. drop frontmatter backslash escapes (`motivation\\_or\\_pitfall`)");
	lines.push("2. Unicode NFKD, then drop combining marks (diacritics fold)");
	lines.push("3. lowercase");
	lines.push("4. `&` → ` and `");
	lines.push("5. apostrophes (`'` `’` `ʼ`) are **deleted**, not replaced (`Ajax's` → `ajaxs`)");
	lines.push("6. every remaining non-alphanumeric run → `-`, then trim leading/trailing `-`");
	lines.push("");
	lines.push(
		"Several **name forms** are tried per file, most literal first: `item_name`, " +
			"`item_name` with a trailing bracketed qualifier removed " +
			"(`Bredbeddle Malice (Malice Features)` → `Bredbeddle Malice`), `name`/`title`, " +
			"and finally the file's own basename.",
	);
	lines.push("");
	lines.push(
		"**Type family** — the old `type` is a path (`monster/section`, " +
			"`feature/ability/conduit/1st-level-feature`) and the new one is a flat noun " +
			"(`statblock`, `ability`). The old family is its last segment when that segment is " +
			"`statblock`, else its first segment; a frozen equivalence table says which new " +
			"families that old family may land in.",
	);
	lines.push("");
	lines.push("## Tie-breakers");
	lines.push("");
	lines.push(
		"Only candidates that already agree on (book, one name form) are scored, so these " +
			"decide *between* candidates — none of them can create a match:",
	);
	lines.push("");
	lines.push("| Weight | Tie-breaker |");
	lines.push("| ---: | --- |");
	for (const [, weight, why] of TIE_BREAKERS) lines.push(`| ${weight} | ${why} |`);
	lines.push("");
	lines.push(
		"A remaining exact tie is **not** guessed: the file is reported as ambiguous below and " +
			"left out of the map (the engine then leaves it in place, never renames it).",
	);
	lines.push("");
	lines.push("## Coverage");
	lines.push("");
	lines.push("| Book | mapped | ambiguous | unmatched |");
	lines.push("| --- | ---: | ---: | ---: |");
	const books = [...new Set(oldRows.map((r) => r.source || "(none)"))].sort();
	for (const book of books) {
		lines.push(
			`| \`${book}\` | ${kept.filter((m) => (m.old.source || "(none)") === book).length} ` +
				`| ${ambiguous.filter((r) => (r.source || "(none)") === book).length} ` +
				`| ${unmatched.filter((r) => (r.source || "(none)") === book).length} |`,
		);
	}
	lines.push("");
	lines.push("### Mapped, by old type family → new type");
	lines.push("");
	lines.push("| count | old family | new type |");
	lines.push("| ---: | --- | --- |");
	for (const [k, n] of byBook(kept, (m) => `${oldFamily(m.old)}|${newFamily(m.new)}`)) {
		const [a, b] = k.split("|");
		lines.push(`| ${n} | \`${a || "(none)"}\` | \`${b}\` |`);
	}
	lines.push("");
	lines.push(`## Ambiguous — ${ambiguous.length} (left unmapped)`);
	lines.push("");
	if (ambiguous.length === 0) lines.push("_None._");
	for (const row of ambiguous) {
		lines.push(`- \`${row.path}\` (\`${row.type}\`) — tied candidates:`);
		for (const c of row.candidates) lines.push(`  - \`${c.cand.path}\` (\`${c.cand.type}\`)`);
	}
	lines.push("");
	lines.push(`## Unmatched — ${unmatched.length} (left unmapped)`);
	lines.push("");
	lines.push("Grouped by reason. Every one of these is left in place by the migration engine.");
	lines.push("");
	const byReason = new Map();
	for (const row of unmatched) {
		if (!byReason.has(row.reason)) byReason.set(row.reason, []);
		byReason.get(row.reason).push(row);
	}
	for (const [reason, rows] of [...byReason.entries()].sort((a, b) => b[1].length - a[1].length)) {
		const inFinal = rows.filter((r) => r.inFinal).length;
		lines.push(`### ${reason} — ${rows.length} (${inFinal} in the final release)`);
		lines.push("");
		for (const row of rows.sort((a, b) => (a.path < b.path ? -1 : 1))) {
			lines.push(`- \`${row.path}\`${row.inFinal ? "" : " _(historical release only)_"}`);
		}
		lines.push("");
	}
	if (collisions.length > 0) {
		lines.push(`## Final-release target collisions — ${collisions.length}`);
		lines.push("");
		lines.push(
			"Two paths from the FINAL release resolve to one unified file — the old tree filed " +
				"one entity twice. The higher-scoring path (ties broken lexicographically) keeps " +
				"the mapping; the other is DROPPED from the map and left in place, so the map is a " +
				"function on the final release.",
		);
		lines.push("");
		for (const c of collisions)
			lines.push(`- \`${c.target}\` ← \`${c.winner}\` (mapped), \`${c.dropped}\` (dropped)`);
		lines.push("");
	}
	lines.push("## New content with no old counterpart");
	lines.push("");
	const claimed = new Set(kept.map((m) => m.new.path));
	const orphanNew = newRows.filter((r) => !claimed.has(r.path));
	lines.push(
		`${orphanNew.length} of the ${newRows.length} unified files were never in data-md-dse. ` +
			"They are created by the normal sync, not by the migration. By book:",
	);
	lines.push("");
	lines.push("| count | book |");
	lines.push("| ---: | --- |");
	for (const [book, n] of byBook(orphanNew, (r) => r.source)) lines.push(`| ${n} | \`${book}\` |`);
	lines.push("");
	fs.mkdirSync(path.dirname(args.report), { recursive: true });
	fs.writeFileSync(args.report, lines.join("\n"));
	console.log(`wrote ${args.report}`);
}
