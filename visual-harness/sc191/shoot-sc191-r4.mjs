#!/usr/bin/env node
// SC-191 ROUND 4 CAMERA. Screenshots visual-harness/sc191/mock4.html and writes NOWHERE
// NEAR visual-harness/shots/, so the freeze baseline, the print-twin parity assertion and
// the chrome-placement assertion are all structurally untouchable by this script.
//
// Round 4 has ONE open axis (`dedupe`) and a set of states/surfaces to prove. Every shot
// below answers a bullet of Scott's round-3 ruling:
//
//   before / merged            the de-duplication, as an honest pair
//   bars-off                   the alternative he floated ("they may not be necessary")
//   empty / mid / done         the three states, dark; mid + done also in light
//   narrow                     300px sidebar leaf
//   guide-closed / guide-open  the rules panel, collapsed by default and expanded
//   sheet-record / sheet-edit   the `Record…` UI he has never seen, and the edit-with-note
//   notes                      the outcome band listing the Director's notes
//   grey                       colour removed — the colourblind proof, carried from r2/r3
//
// Usage (from the repo root, inside devbox):
//   node visual-harness/sc191/shoot-sc191-r4.mjs <outDir>
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const page_url = 'file://' + path.join(here, 'mock4.html');
const outDir = process.argv[2];
if (!outDir) {
	console.error('usage: node visual-harness/sc191/shoot-sc191-r4.mjs <outDir>');
	process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const WIDE = 820;
const NARROW = 300;

const SHOTS = [
	// ---- the de-duplication, as a labelled pair ----------------------------
	// `before` is round 3 verbatim: both bands, both head count chips, the round-tally
	// foot row with its oversized grand total. Nothing in round4.css reaches it.
	{ id: 'sc191-r4-before-mid', q: { dedupe: 'before', state: 'mid' }, bgs: ['dark', 'light'] },
	{ id: 'sc191-r4-merged-mid', q: { dedupe: 'merged', state: 'mid' }, bgs: ['dark', 'light'] },
	// The alternative Scott raised himself.
	{ id: 'sc191-r4-barsoff-mid', q: { dedupe: 'bars-off', state: 'mid' }, bgs: ['dark'] },

	// ---- the three states, recommended composition -------------------------
	{ id: 'sc191-r4-empty', q: { dedupe: 'merged', state: 'empty' }, bgs: ['dark'] },
	{ id: 'sc191-r4-done', q: { dedupe: 'merged', state: 'done' }, bgs: ['dark', 'light'] },

	// ---- the sidebar leaf --------------------------------------------------
	{ id: 'sc191-r4-narrow-mid', q: { dedupe: 'merged', state: 'mid' }, width: NARROW, bgs: ['dark'] },
	{
		id: 'sc191-r4-narrow-guide-open',
		q: { dedupe: 'merged', state: 'mid', guide: 'open' },
		width: NARROW,
		bgs: ['dark'],
	},

	// ---- the rules guidance ------------------------------------------------
	// The closed shot is the same DOM as `merged-mid`; it exists under its own name so the
	// "collapsed by default" claim is a file Scott can point at rather than an assertion.
	{ id: 'sc191-r4-guide-closed', q: { dedupe: 'merged', state: 'mid' }, bgs: ['dark'] },
	{ id: 'sc191-r4-guide-open', q: { dedupe: 'merged', state: 'mid', guide: 'open' }, bgs: ['dark', 'light'] },

	// ---- the record button's UI, and the edit-with-note UI -----------------
	{ id: 'sc191-r4-sheet-record', q: { dedupe: 'merged', state: 'mid', sheet: 'record' }, bgs: ['dark'] },
	{ id: 'sc191-r4-sheet-edit-note', q: { dedupe: 'merged', state: 'mid', sheet: 'edit' }, bgs: ['dark', 'light'] },

	// ---- the overflow menu, carried forward so the rare controls stay visible
	{ id: 'sc191-r4-menu', q: { dedupe: 'merged', state: 'mid', menu: 'on' }, bgs: ['dark'] },

	// ---- colour last -------------------------------------------------------
	{ id: 'sc191-r4-grey', q: { dedupe: 'merged', state: 'mid', gray: 'on' }, bgs: ['dark'] },
	{ id: 'sc191-r4-guide-open-grey', q: { dedupe: 'merged', state: 'mid', guide: 'open', gray: 'on' }, bgs: ['dark'] },
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
		await page.waitForFunction(() => window.__sc191r4Done !== undefined, null, { timeout: 10000 });
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
console.log(`sc191 round-4 shots written to ${outDir}`);
