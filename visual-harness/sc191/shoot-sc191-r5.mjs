#!/usr/bin/env node
// SC-191 ROUND 5 CAMERA. Screenshots visual-harness/sc191/mock5.html and writes NOWHERE
// NEAR visual-harness/shots/, so the freeze baseline, the print-twin parity assertion and
// the chrome-placement assertion are all structurally untouchable by this script.
//
// Every shot below answers a task of Scott's round-4 ruling:
//
//   before / merged            equal-width tracks, as an honest pair (`?r5=off` is round 4)
//   done                       the tracks in their finished, tensed state
//   cheat-closed / cheat-open  the tier strip, first-run and pinned
//   cheat-narrow               the strip at 300px — it degrades, it does not side-scroll
//   cheat-chip-*               the alternative home for the toggle (head chip)
//   guide-open-pinned          the foot panel's "Each test" block, deduped by the pin
//   bar                        the renamed primary control in the action bar
//   sheet-log / sheet-edit     the renamed sheet, and the Result field's tier hint
//   menu                       "Add a round" in its only remaining home
//   grey                       colour removed — the colourblind proof
//
// Usage (from the repo root, inside devbox):
//   node visual-harness/sc191/shoot-sc191-r5.mjs <outDir>
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const page_url = 'file://' + path.join(here, 'mock5.html');
const outDir = process.argv[2];
if (!outDir) {
	console.error('usage: node visual-harness/sc191/shoot-sc191-r5.mjs <outDir>');
	process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const WIDE = 820;
const NARROW = 300;

const SHOTS = [
	// ---- task 1, the equal-width tracks, as a labelled pair ----------------
	// `before` is round 4's `merged` verbatim: fixed-width slots, so the failure bar is
	// drawn half the success bar's length, and the two tails start at different x.
	{ id: 'sc191-r5-before-mid', q: { r5: 'off', state: 'mid' }, bgs: ['dark', 'light'] },
	{ id: 'sc191-r5-tracks-mid', q: { state: 'mid' }, bgs: ['dark', 'light'] },
	{ id: 'sc191-r5-before-done', q: { r5: 'off', state: 'done' }, bgs: ['dark'] },
	{ id: 'sc191-r5-tracks-done', q: { state: 'done' }, bgs: ['dark', 'light'] },
	{ id: 'sc191-r5-empty', q: { state: 'empty' }, bgs: ['dark'] },

	// ---- task 2, the tier cheat sheet --------------------------------------
	// Closed is the first-run state; the strip is a PIN, so `open` is where it stays.
	{ id: 'sc191-r5-cheat-closed', q: { state: 'mid' }, bgs: ['dark', 'light'] },
	{ id: 'sc191-r5-cheat-open', q: { state: 'mid', strip: 'open' }, bgs: ['dark', 'light'] },
	{ id: 'sc191-r5-cheat-narrow', q: { state: 'mid', strip: 'open' }, width: NARROW, bgs: ['dark'] },
	// The alternative home for the toggle: a chip in the card head.
	{ id: 'sc191-r5-cheat-chip-closed', q: { state: 'mid', cheat: 'chip' }, bgs: ['dark'] },
	{ id: 'sc191-r5-cheat-chip-open', q: { state: 'mid', cheat: 'chip', strip: 'open' }, bgs: ['dark'] },
	// The dedup: with the strip pinned, the foot panel's "Each test" block stands down.
	{ id: 'sc191-r5-guide-open', q: { state: 'mid', guide: 'open' }, bgs: ['dark'] },
	{ id: 'sc191-r5-guide-open-pinned', q: { state: 'mid', guide: 'open', strip: 'open' }, bgs: ['dark'] },

	// ---- task 4, the rename ------------------------------------------------
	// Same DOM as `tracks-mid`; it exists under its own name so the renamed control is a
	// file Scott can point at rather than a claim about a corner of another shot.
	{ id: 'sc191-r5-bar-renamed', q: { state: 'mid' }, bgs: ['dark'] },
	{ id: 'sc191-r5-sheet-log', q: { state: 'mid', sheet: 'record' }, bgs: ['dark', 'light'] },
	{ id: 'sc191-r5-sheet-edit', q: { state: 'mid', sheet: 'edit' }, bgs: ['dark'] },

	// ---- task 5, the ghost lane's removal ----------------------------------
	// The board at width, and "Add a round" in its only remaining home.
	{ id: 'sc191-r5-narrow-mid', q: { state: 'mid' }, width: NARROW, bgs: ['dark'] },
	{ id: 'sc191-r5-menu', q: { state: 'mid', menu: 'on' }, bgs: ['dark'] },

	// ---- colour last -------------------------------------------------------
	{ id: 'sc191-r5-cheat-open-grey', q: { state: 'mid', strip: 'open', gray: 'on' }, bgs: ['dark'] },
	{ id: 'sc191-r5-grey', q: { state: 'mid', gray: 'on' }, bgs: ['dark'] },
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
		await page.goto(`${page_url}?${qs.toString()}`, { waitUntil: 'load' });
		await page.waitForFunction(() => window.__sc191r5Done !== undefined, null, { timeout: 10000 });
		const mount = page.locator('#mount');
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
console.log(`sc191 round-5 shots written to ${outDir}`);
