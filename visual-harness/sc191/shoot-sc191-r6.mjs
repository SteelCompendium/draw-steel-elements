#!/usr/bin/env node
// SC-191 ROUND 6 CAMERA. Screenshots visual-harness/sc191/mock6.html and writes NOWHERE
// NEAR visual-harness/shots/, so the freeze baseline, the print-twin parity assertion and
// the chrome-placement assertion are all structurally untouchable by this script.
//
// Every shot below answers a task of Scott's round-5 ruling:
//
//   before            the round-5 `handle` strip, open — the design being replaced
//   pr                the SHIPPED Power Roll element alone, for the rhyme comparison
//   pip / ring / double   the three rider treatments, flipped strip, open
//   vocab-*           each treatment's whole mark vocabulary at reading size
//   edge              the restrained tier wash beside the Power Roll's own reach
//   narrow            the recommendation at 300px — it degrades, it does not side-scroll
//   grey              colour removed — the colourblind proof
//   guide-*           the foot panel, unflipped (it was already in this orientation) and
//                     its pinned stub, now a pure pointer
//   card / closed     the whole card with the strip pinned, and the first-run closed row
//
// Usage (from the repo root, inside devbox):
//   node visual-harness/sc191/shoot-sc191-r6.mjs <outDir>
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const page_url = 'file://' + path.join(here, 'mock6.html');
const outDir = process.argv[2];
if (!outDir) {
	console.error('usage: node visual-harness/sc191/shoot-sc191-r6.mjs <outDir>');
	process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const WIDE = 820;
const NARROW = 300;
const OPEN = { state: 'mid', strip: 'open' };

const SHOTS = [
	// ---- the labelled BEFORE: round 5's strip, open, verbatim ---------------
	{ id: 'sc191-r6-before-open', q: Object.assign({ r6: 'off' }, OPEN), bgs: ['dark', 'light'] },

	// ---- the thing the flip is rhyming WITH ---------------------------------
	// The real kit DOM under the real element/theme root, so this is the Power Roll
	// element itself and not a drawing of it.
	{ id: 'sc191-r6-powerroll', q: { only: 'pr' }, width: 520, bgs: ['dark', 'light'] },

	// ---- the three rider treatments, flipped strip --------------------------
	{ id: 'sc191-r6-pip-open', q: Object.assign({ treat: 'pip' }, OPEN), bgs: ['dark', 'light'] },
	{ id: 'sc191-r6-ring-open', q: Object.assign({ treat: 'ring' }, OPEN), bgs: ['dark', 'light'] },
	{ id: 'sc191-r6-double-open', q: Object.assign({ treat: 'double' }, OPEN), bgs: ['dark', 'light'] },

	// ---- each treatment's full vocabulary, at reading size ------------------
	{ id: 'sc191-r6-vocab-pip', q: { only: 'vocab', treat: 'pip' }, width: 520, bgs: ['dark'] },
	{ id: 'sc191-r6-vocab-ring', q: { only: 'vocab', treat: 'ring' }, width: 520, bgs: ['dark'] },
	{ id: 'sc191-r6-vocab-double', q: { only: 'vocab', treat: 'double' }, width: 520, bgs: ['dark'] },

	// ---- STRIP CROPS: the three treatments and the two washes, side by side --
	// `sel` clips the shot to the strip so the differences between two variants are a
	// like-for-like comparison rather than two full cards to hunt through.
	{ id: 'sc191-r6-strip-pip', q: Object.assign({ treat: 'pip' }, OPEN), sel: '.mt6-strip', bgs: ['dark', 'light'] },
	{ id: 'sc191-r6-strip-ring', q: Object.assign({ treat: 'ring' }, OPEN), sel: '.mt6-strip', bgs: ['dark'] },
	{ id: 'sc191-r6-strip-double', q: Object.assign({ treat: 'double' }, OPEN), sel: '.mt6-strip', bgs: ['dark'] },
	{ id: 'sc191-r6-strip-before', q: Object.assign({ r6: 'off' }, OPEN), sel: '.mt5-cheat', bgs: ['dark'] },

	// ---- the tier wash: the Power Roll's own reach vs the restrained twin ---
	{ id: 'sc191-r6-pip-wash-pr', q: Object.assign({ treat: 'pip', tier: 'pr' }, OPEN), sel: '.mt6-strip', bgs: ['dark', 'light'] },
	{ id: 'sc191-r6-pip-wash-edge', q: Object.assign({ treat: 'pip', tier: 'edge' }, OPEN), sel: '.mt6-strip', bgs: ['dark', 'light'] },

	// ---- the recommendation, in context and under stress -------------------
	{ id: 'sc191-r6-card', q: Object.assign({ treat: 'pip', tier: 'edge' }, OPEN), bgs: ['dark', 'light'] },
	{ id: 'sc191-r6-closed', q: { state: 'mid' }, bgs: ['dark'] },
	{ id: 'sc191-r6-pip-narrow', q: Object.assign({ treat: 'pip', tier: 'edge' }, OPEN), width: NARROW, bgs: ['dark'] },

	// ---- the consistency sweep: the foot panel ------------------------------
	// Unflipped, because it was already in the target orientation — the book's own.
	{ id: 'sc191-r6-guide-open', q: { state: 'mid', guide: 'open' }, bgs: ['dark'] },
	{ id: 'sc191-r6-guide-open-pinned', q: { state: 'mid', guide: 'open', strip: 'open', tier: 'edge' }, bgs: ['dark'] },

	// ---- colour last -------------------------------------------------------
	{ id: 'sc191-r6-pip-grey', q: Object.assign({ treat: 'pip', tier: 'edge', gray: 'on' }, OPEN), sel: '.mt6-strip', bgs: ['dark'] },
	{ id: 'sc191-r6-card-grey', q: Object.assign({ treat: 'pip', tier: 'edge', gray: 'on' }, OPEN), bgs: ['dark'] },
];

const browser = await chromium.launch();
const failures = [];
for (const shot of SHOTS) {
	const width = shot.width || WIDE;
	for (const bg of shot.bgs) {
		const page = await browser.newPage({
			viewport: { width: Math.max(width + 60, 380), height: 900 },
			deviceScaleFactor: 2,
		});
		const qs = new URLSearchParams(Object.assign({}, shot.q, { bg, width: String(width) }));
		page.on('pageerror', (e) => failures.push(`${shot.id}/${bg}: pageerror ${String(e)}`));
		await page.goto(`${page_url}?${qs.toString()}`, { waitUntil: 'load' });
		await page.waitForFunction(() => window.__sc191r6Done !== undefined, null, { timeout: 10000 });
		const mount = page.locator(shot.sel || '#mount');
		const out = path.join(outDir, `${shot.id}-${bg}.png`);
		try {
			await mount.screenshot({ path: out });
			console.log(`  ok ${path.basename(out)}`);
		} catch (e) {
			failures.push(`${shot.id}/${bg}: ${String(e)}`);
		}
		await page.close();
	}
}
await browser.close();
if (failures.length) {
	for (const f of failures) console.error(`FAIL ${f}`);
	process.exit(1);
}
console.log(`sc191 round-6 shots written to ${outDir}`);
