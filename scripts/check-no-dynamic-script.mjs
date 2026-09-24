// scripts/check-no-dynamic-script.mjs — SC-328 build gate.
//
// Obsidian's community-plugin review rejects a plugin whose bundle dynamically creates
// a <script> element (`document.createElement("script")`-shaped code) — the exact
// pattern JSZip's legacy-browser polyfills used to inject into this plugin's bundle
// (dropped in favor of `fflate`, which carries no such polyfill). This script re-checks
// the PRODUCTION artifact after every production build (both `npm run build` and
// `npm run build-no-check` route through esbuild.config.mjs's production path, which
// calls `main()` here) so a future dependency can never silently reintroduce the
// pattern.
//
// Deliberately a source-text scan of the built main.js, not an AST walk: the artifact
// is a single minified bundle, and a literal, case-insensitive match on
// `createElement(`/`createEl(` + optional whitespace + a quoted "script" (or
// `createElementNS(` with "script" among its arguments) is exactly the shape the
// polyfill emitted and is cheap enough to run on every build.
//
// SC-328 fix round 1 LOW-2: widened from `createElement(` alone to also catch
// `createEl("script")` (Obsidian's own DOM helper, used throughout this plugin, and
// therefore the most plausible way plugin code would reintroduce the pattern) and
// `createElementNS(<namespace>, "script")`.

import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// createElement(/createEl( <ws>* "script"|'script'|`script`, OR createElementNS(<up to
// 80 chars>"script"|'script'|`script` — case-insensitive. The createElementNS branch is
// separate (not folded into the optional-"ement" group) so it does not also require the
// quoted arg to sit immediately after the paren — Obsidian's namespace argument comes
// first.
const DYNAMIC_SCRIPT_PATTERN =
	/createEl(?:ement)?\s*\(\s*["'`]script["'`]|createElementNS\s*\([^)]{0,80}?["'`]script["'`]/gi;

/**
 * Scans `source` for the dynamic-`<script>`-creation pattern and returns one record per
 * hit: the byte offset into `source` and ~80 chars of surrounding context (whitespace
 * collapsed, for a readable single-line report line).
 */
export function findDynamicScriptCreation(source) {
	const hits = [];
	let match;
	DYNAMIC_SCRIPT_PATTERN.lastIndex = 0;
	while ((match = DYNAMIC_SCRIPT_PATTERN.exec(source)) !== null) {
		const offset = match.index;
		const start = Math.max(0, offset - 40);
		const end = Math.min(source.length, offset + match[0].length + 40);
		hits.push({ offset, context: source.slice(start, end).replace(/\s+/g, " ").trim() });
		// Zero-width-safe: the pattern always consumes at least "createElement(", so
		// lastIndex already advanced — no manual bump needed to avoid an infinite loop.
	}
	return hits;
}

/**
 * Runs the gate against `targetPath` (defaults to the repo-root `main.js`, the
 * esbuild production outfile). Returns the hit list; prints and exits the process on a
 * miss ONLY when invoked as the CLI entry point (see the guard at the bottom) — callers
 * that `import` this module (esbuild.config.mjs, this file's own jest coverage) drive
 * pass/fail from the returned array themselves.
 */
export function checkBuiltFile(targetPath) {
	const source = readFileSync(targetPath, "utf8");
	return findDynamicScriptCreation(source);
}

function main() {
	const target = process.argv[2] ?? path.join(__dirname, "..", "main.js");
	let hits;
	try {
		hits = checkBuiltFile(target);
	} catch (error) {
		console.error(`check-no-dynamic-script: could not read ${target}: ${error.message}`);
		process.exit(2);
		return;
	}
	if (hits.length > 0) {
		console.error(
			`check-no-dynamic-script: FOUND ${hits.length} dynamic createElement("script") ` +
			`call(s) in ${target} — Obsidian's community-plugin review rejects these:`);
		for (const hit of hits) {
			console.error(`  byte offset ${hit.offset}: …${hit.context}…`);
		}
		process.exit(1);
	}
	console.log(
		`check-no-dynamic-script: OK — 0 dynamic createElement("script") calls in ${target}`);
}

// Only run as a side effect when invoked directly (`node scripts/check-no-dynamic-
// script.mjs [path]`), not when imported (esbuild.config.mjs, jest).
if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
