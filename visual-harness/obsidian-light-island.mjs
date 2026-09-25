#!/usr/bin/env node
// visual-harness/obsidian-light-island.mjs — SC-127 r7 (owner ruling, after the r7 MED-A
// census fired on 222 of 278 theme-differing tokens: "do NOT re-scope the census by
// consumption").
//
// Generates the print preview's "light island" host block: for EVERY `--*` custom
// property the PINNED Obsidian sheet declares anywhere (any selector, any rule — the full
// universe app.css defines, not "whatever the plugin happens to consume"), resolved on
// `<body>` under `.theme-dark` vs `.theme-light`, every one whose resolution DIFFERS is
// restated in the host block, set to its `.theme-light` computed value verbatim (formulas
// kept as formulas — `getComputedStyle` substitutes nested `var()` references through the
// sheet's own `body`/`.theme-*` mapping chain but does not evaluate `calc()` arithmetic,
// so `--color-accent-2` comes out `hsl(calc(258 - 3), calc(88% * 1.02), calc(66% * 1.15))`,
// not a baked colour).
//
// SC-127 r9 MEDIUM-B (scoped re-review regression): `--accent-h`/`--accent-s`/`--accent-l`
// are THEMSELVES `--*` tokens Obsidian's own sheet declares on body (Appearance → Accent
// color writes real user values onto them at runtime) — resolving under the pinned sheet's
// DEFAULT (258/88%/66%) baked that default into the 34 tokens that reference them
// (`--color-accent-1`, `--checkbox-color`, `--text-accent`, tag/blockquote/selection
// colours…), so a user with a custom accent saw the WRONG colour in the dark preview while
// the light twin and the real export correctly showed their own. Fixed by resolving twice
// under two distinct SENTINEL accent triples (`ACCENT_SENTINEL_A`/`_B`, deliberately
// unlikely to collide with anything else in a 1096-token sheet) and, for any token whose
// two sentinel results differ (confirming a REAL accent dependency, not a numeric
// coincidence), rewriting the sentinel's own literals back to `var(--accent-h)` /
// `var(--accent-s)` / `var(--accent-l)` — so the committed block keeps every accent-derived
// token as a live formula, and the printed page always matches whatever accent colour the
// user actually has set, default or not.
//
// WHY MAXIMALLY INCLUSIVE, ON PURPOSE: two earlier designs tried to filter the token set
// down to "only what a rule reaching in-note content consumes" — a live-DOM gallery walk
// (SC-127 r5) and a textual ancestor-scope classifier (SC-127 r7, first attempt). Both had
// measured blind spots (10 tokens; then 222 of 278) BECAUSE "does this selector reach
// content" is an open-ended classification problem over a ~20,000-line, constantly-moving
// third-party sheet — no filter can be proven complete, only proven to have missed
// something so far. Restating EVERY theme-differing token, needed or not, sidesteps the
// classification problem entirely: the element root becomes a COMPLETE light island by
// CONSTRUCTION — nothing inherited from the host can ever be a dark-theme value inside it,
// whether or not this script's author (or a future one) ever noticed a particular
// selector. The generated block is larger than any hand-curated list would be; that cost
// is the whole point, and it is paid by a machine, not by a maintainer re-auditing a list
// every time Obsidian's sheet grows a token.
//
// TRADE-OFF, recorded once here (see also styles-source.css's own comment and
// visual-harness/README.md): a CUSTOM dark theme's own light variant is NOT used. The
// preview island is always stock Obsidian's `.theme-light` — a custom theme's native
// controls (steppers, buttons, checkboxes, links) look like Obsidian's own defaults on the
// printed page, not like the vault's chosen theme. Native controls that aren't styled by
// any theme at all (a vault with NO custom theme) are unaffected; this only matters for a
// vault running a custom dark theme with its own distinct light variant.
//
// Usage:
//   node visual-harness/obsidian-light-island.mjs           regenerate the GENERATED block
//                                                            in styles-source.css in place
//   node visual-harness/obsidian-light-island.mjs --check    exit 1 if the sheet's current
//                                                            block would differ from a
//                                                            fresh generation, without
//                                                            writing (the jest test's own
//                                                            manual-run companion)
//
// `npm run gen-light-island` runs this with no flag. The pin-bump procedure (README.md,
// styles-source.css's own comment): bump PINNED_OBSIDIAN in obsidian-host-pin.mjs and the
// pin in obsidian-app-css.pin.mjs, run `npm run host-css` to refetch, THEN
// `npm run gen-light-island`, then commit both the pin and the regenerated block together
// — never bump one without the other.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { iterRules } from './obsidian-host-pin.mjs';
import { ensurePinnedObsidianAppCss, readVerifiedSheet, HASH_FAILURE_REMEDY } from './fetch-obsidian-app-css.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
export const STYLES_PATH = path.join(dir, '..', 'styles-source.css');
// SC-127 r9 LOW-C — a COMMITTED (not gitignored, unlike visual-harness/dist/) manifest of
// exactly what the generator produced: token name -> the value written into the block.
// Exists so `printTwinDeltaAllowedSet.test.ts` can compare the committed CSS block
// against a real, trustworthy source of truth without reimplementing CSS custom-property
// cascade resolution in jest (jsdom cannot do it, and a hand-rolled reimplementation
// would be its own new place to drift from what the generator/browser actually computes)
// — and without ever needing to skip in CI, since this file, unlike the gitignored pinned
// sheet, is always present.
export const MANIFEST_PATH = path.join(dir, 'obsidian-light-island.manifest.json');
export const HOST_SELECTOR = '.theme-dark [data-dse-element][data-dse-print="on"][data-dse-print="on"]';
export const BEGIN_MARKER =
	'/* SC-127 LIGHT ISLAND — GENERATED by visual-harness/obsidian-light-island.mjs — DO NOT HAND-EDIT — BEGIN */';
export const END_MARKER = '/* SC-127 LIGHT ISLAND — GENERATED — END */';

/** Every `--*` token name declared ANYWHERE in `css` — any selector, any rule. This is
 *  the full universe to test; judging which ones are "reachable" is exactly what this
 *  design refuses to do (see the file header). */
export function allDeclaredTokenNames(css) {
	const names = new Set();
	for (const rule of iterRules(css)) {
		for (const m of rule.body.matchAll(/(?:^|[\s{;])(--[a-zA-Z0-9-]+)\s*:/g)) names.add(m[1]);
	}
	return [...names].sort();
}

/** Resolve every name in `tokenNames` on `<body class="theme-{dark,light}">` with ONLY
 *  `pinnedCss` loaded — the sheet's own mapping chain does the substitution work
 *  (`getComputedStyle` on a custom property recursively substitutes nested `var()`
 *  references through whatever declares them on the SAME element, leaving `calc()`
 *  arithmetic un-evaluated — measured, SC-127 r5/r7). `accent`, when given, OVERRIDES
 *  `--accent-h`/`--accent-s`/`--accent-l` on body AFTER the pinned sheet loads (SC-127 r9
 *  MEDIUM-B — see this file's header for why). */
export async function resolveAll(page, pinnedCss, cls, tokenNames, accent) {
	await page.goto('about:blank');
	await page.addStyleTag({ content: pinnedCss });
	if (accent) {
		await page.addStyleTag({
			content: `body { --accent-h: ${accent.h}; --accent-s: ${accent.s}; --accent-l: ${accent.l}; }`,
		});
	}
	return page.evaluate(
		({ tokens, cls }) => {
			document.body.className = cls;
			const cs = getComputedStyle(document.body);
			const out = {};
			for (const t of tokens) out[t] = cs.getPropertyValue(t).trim();
			return out;
		},
		{ tokens: tokenNames, cls },
	);
}

// SC-127 r9 MEDIUM-B — two DISTINCT, deliberately unlikely-to-collide sentinel accent
// triples (decimals + an unusual hue), used to tell "this token's value came from
// substituting --accent-h/s/l" apart from "this token's value merely happens to contain a
// number that matches a sentinel by coincidence": resolve every token under BOTH sentinels
// and only treat a token as accent-derived where the two results actually differ. Exported
// so the in-run guard's second correctness pass (shoot.mjs) uses the SAME triples, never a
// re-typed copy that could silently drift from the generator's own.
export const ACCENT_SENTINEL_A = { h: '271', s: '59.317%', l: '83.729%' };
export const ACCENT_SENTINEL_B = { h: '137', s: '41.213%', l: '17.951%' };

/** Replace bounded occurrences of `literal` (a plain number or a `N%` percentage) in
 *  `text` with `replacement` — bounded on both sides by "not a digit or `.`", so `"271"`
 *  cannot match inside `"1271"` or `"2710"`. */
function replaceBoundedNumber(text, literal, replacement) {
	const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return text.replace(new RegExp(`(?<![\\d.])${escaped}(?![\\d.])`, 'g'), replacement);
}

/** Rewrite a value resolved under `ACCENT_SENTINEL_A` back into a formula over
 *  `var(--accent-h)` / `var(--accent-s)` / `var(--accent-l)` — a no-op wherever the
 *  sentinel's own literals don't appear (i.e. for every token that isn't accent-derived,
 *  this returns its input unchanged). */
export function rewriteAccentSentinelToVar(text) {
	let out = text;
	out = replaceBoundedNumber(out, ACCENT_SENTINEL_A.h, 'var(--accent-h)');
	out = replaceBoundedNumber(out, ACCENT_SENTINEL_A.s, 'var(--accent-s)');
	out = replaceBoundedNumber(out, ACCENT_SENTINEL_A.l, 'var(--accent-l)');
	return out;
}

/** The generator's own core: which tokens differ, what each's `.theme-light` value is
 *  (as a FORMULA over `var(--accent-h/s/l)` wherever it depends on the user's accent
 *  colour, never baked to the pinned default — SC-127 r9 MEDIUM-B), and the ready-to-write
 *  block text (including the markers). Exported so both the CLI below and `shoot.mjs`'s
 *  in-run guard call the SAME logic — a guard that re-implements its own generator is
 *  exactly the MEDIUM-2 shape this ticket already fixed once. */
export async function generateLightIsland(page, pinnedCss) {
	const tokenNames = allDeclaredTokenNames(pinnedCss);
	const dark = await resolveAll(page, pinnedCss, 'theme-dark', tokenNames, ACCENT_SENTINEL_A);
	const lightA = await resolveAll(page, pinnedCss, 'theme-light', tokenNames, ACCENT_SENTINEL_A);
	const lightB = await resolveAll(page, pinnedCss, 'theme-light', tokenNames, ACCENT_SENTINEL_B);
	const differing = tokenNames.filter((t) => dark[t] !== lightA[t]);
	const accentDerived = differing.filter((t) => lightA[t] !== lightB[t]);
	// The value every differing token is set to in the generated block: sentinel A's
	// resolution, with the sentinel's own literals rewritten back to var(--accent-h/s/l) —
	// a no-op for the (differing minus accentDerived) tokens, since the sentinel literals
	// never appear in their text at all.
	const light = Object.fromEntries(tokenNames.map((t) => [t, rewriteAccentSentinelToVar(lightA[t])]));
	const lines = [
		'\tcolor-scheme: light;',
		...differing.map((t) => `\t${t}: ${light[t]};`),
		'',
		'\t/* Real (non-custom) properties inherited from `body`, which a custom-property',
		'\t   mapping alone cannot re-trigger (SC-127 r5 LOW-2) — restated directly so this',
		'\t   root inherits its OWN value instead of the body default. */',
		'\tcaret-color: var(--caret-color);',
		'\tscrollbar-color: var(--scrollbar-thumb-bg) var(--scrollbar-bg);',
	];
	const text = `${BEGIN_MARKER}\n${HOST_SELECTOR} {\n${lines.join('\n')}\n}\n${END_MARKER}`;
	return { tokenNames, differing, accentDerived, light, text };
}

/** Pull the current GENERATED block's text (markers included) out of `sheet`, or `null`
 *  if the markers are missing/mismatched. */
export function extractCurrentIsland(sheet) {
	const bi = sheet.indexOf(BEGIN_MARKER);
	const ei = sheet.indexOf(END_MARKER);
	if (bi === -1 || ei === -1 || ei < bi) return null;
	return sheet.slice(bi, ei + END_MARKER.length);
}

/** The manifest object for a `generateLightIsland` result — sorted keys, so the committed
 *  JSON's own diffs are stable and reviewable. */
export function manifestFor(result) {
	const out = {};
	for (const t of [...result.differing].sort()) out[t] = result.light[t];
	return out;
}

async function main() {
	const check = process.argv.includes('--check');
	await ensurePinnedObsidianAppCss();
	let pinned;
	try {
		pinned = readVerifiedSheet();
	} catch (e) {
		console.error(`\n${e.message}\n${HASH_FAILURE_REMEDY}`);
		process.exitCode = 1;
		return;
	}
	if (!pinned) {
		console.error('\nno resolved Obsidian app.css sheet — cannot generate the light island.');
		process.exitCode = 1;
		return;
	}
	const browser = await chromium.launch();
	const page = await browser.newPage();
	let result;
	try {
		result = await generateLightIsland(page, pinned.css);
	} finally {
		await browser.close();
	}
	const manifest = manifestFor(result);
	const manifestText = JSON.stringify(manifest, null, '\t') + '\n';

	const sheet = fs.readFileSync(STYLES_PATH, 'utf8');
	const current = extractCurrentIsland(sheet);
	if (check) {
		const currentManifestText = fs.existsSync(MANIFEST_PATH) ? fs.readFileSync(MANIFEST_PATH, 'utf8') : null;
		if (current === result.text && currentManifestText === manifestText) {
			console.log(
				`\nlight island up to date (${result.differing.length} of ${result.tokenNames.length} ` +
					`Obsidian tokens differ dark vs light, all restated; ${result.accentDerived.length} ` +
					`of those are accent-derived and kept as var(--accent-h/s/l) formulas)`,
			);
			return;
		}
		console.error(
			`\nLIGHT ISLAND STALE — styles-source.css's generated block and/or ` +
				`obsidian-light-island.manifest.json do not match what regenerating from the ` +
				`pinned sheet produces. Run \`npm run gen-light-island\`.`,
		);
		process.exitCode = 1;
		return;
	}
	if (current === null) {
		console.error(
			`\nno ${BEGIN_MARKER} / ${END_MARKER} markers found in ${STYLES_PATH} — nothing to ` +
				`replace. Add the markers (see this script's header) before running the generator.`,
		);
		process.exitCode = 1;
		return;
	}
	const nextSheet = sheet.slice(0, sheet.indexOf(BEGIN_MARKER)) + result.text + sheet.slice(sheet.indexOf(END_MARKER) + END_MARKER.length);
	fs.writeFileSync(STYLES_PATH, nextSheet, 'utf8');
	fs.writeFileSync(MANIFEST_PATH, manifestText, 'utf8');
	console.log(
		`\nlight island regenerated: ${result.differing.length} of ${result.tokenNames.length} ` +
			`Obsidian tokens differ dark vs light (pinned sheet), all restated in ` +
			`styles-source.css's GENERATED block; ${result.accentDerived.length} of those are ` +
			`accent-derived and kept as var(--accent-h/s/l) formulas. Manifest written to ` +
			`${MANIFEST_PATH} — commit it alongside the sheet (SC-127 r9 LOW-C, so jest can ` +
			`compare the committed block's values without a browser).`,
	);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
