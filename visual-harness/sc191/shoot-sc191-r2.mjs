#!/usr/bin/env node
// SC-191 ROUND 2 camera. Screenshots visual-harness/sc191/mock2.html — the treatment
// page — and writes NOWHERE NEAR visual-harness/shots/, so the freeze baseline, the
// print-twin parity assertion and the chrome-placement assertion are all structurally
// untouchable by this script.
//
// Usage (from the repo root, inside devbox):
//   node visual-harness/sc191/shoot-sc191-r2.mjs <outDir>
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const page_url = 'file://' + path.join(here, 'mock2.html');
const outDir = process.argv[2];
if (!outDir) {
	console.error('usage: node visual-harness/sc191/shoot-sc191-r2.mjs <outDir>');
	process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const WIDE = 820;
// A real Obsidian sidebar-leaf width — the same number NARROW_SHOTS uses.
const NARROW = 300;

// Six treatments, three states. Dark is the signature mode and every treatment ships
// empty + mid there; the two finalists also ship light, `done`, and the recommendation
// ships narrow + the two interaction sheets.
const TREATMENTS = ['set', 'plate', 'tray', 'ledger', 'stages', 'roster'];
// Both schemes + a finished state for the two finalists. `set` gets a light twin too:
// it is the control treatment and a genuine contender, so it must be judgeable in both.
const FINALISTS = ['tray', 'roster'];
const LIGHT_EXTRA = ['set'];
const RECOMMENDED = 'tray';

const SHOTS = [];
for (const t of TREATMENTS) {
	SHOTS.push({ id: `sc191-r2-${t}-empty`, treat: t, state: 'empty', width: WIDE, bgs: ['dark'] });
	SHOTS.push({ id: `sc191-r2-${t}-mid`, treat: t, state: 'mid', width: WIDE, bgs: ['dark'] });
}
for (const t of FINALISTS) {
	SHOTS.push({ id: `sc191-r2-${t}-empty`, treat: t, state: 'empty', width: WIDE, bgs: ['light'] });
	SHOTS.push({ id: `sc191-r2-${t}-mid`, treat: t, state: 'mid', width: WIDE, bgs: ['light'] });
	SHOTS.push({ id: `sc191-r2-${t}-done`, treat: t, state: 'done', width: WIDE, bgs: ['dark'] });
}
for (const t of LIGHT_EXTRA) {
	SHOTS.push({ id: `sc191-r2-${t}-mid`, treat: t, state: 'mid', width: WIDE, bgs: ['light'] });
	SHOTS.push({ id: `sc191-r2-${t}-done`, treat: t, state: 'done', width: WIDE, bgs: ['dark'] });
}
SHOTS.push({ id: `sc191-r2-${RECOMMENDED}-done`, treat: RECOMMENDED, state: 'done', width: WIDE, bgs: ['light'] });
// The interaction evidence: the ⋯ overflow open (where add / clear live) and the
// correct-a-mistake sheet ("that 13 was really a 17").
SHOTS.push({ id: `sc191-r2-${RECOMMENDED}-menu`, treat: RECOMMENDED, state: 'mid', width: WIDE, bgs: ['dark'], menu: true });
SHOTS.push({ id: `sc191-r2-${RECOMMENDED}-correct`, treat: RECOMMENDED, state: 'mid', width: WIDE, bgs: ['dark'], sheet: 'edit' });
// Narrow: the recommendation, empty + mid, both schemes for mid.
SHOTS.push({ id: `sc191-r2-${RECOMMENDED}-narrow-empty`, treat: RECOMMENDED, state: 'empty', width: NARROW, bgs: ['dark'] });
SHOTS.push({ id: `sc191-r2-${RECOMMENDED}-narrow-mid`, treat: RECOMMENDED, state: 'mid', width: NARROW, bgs: ['dark', 'light'] });
// The colourblind proof: the same board with every hue removed. Success/failure/assist have
// to stay readable from shape, position, material, glyph and word alone.
SHOTS.push({ id: `sc191-r2-${RECOMMENDED}-grey`, treat: RECOMMENDED, state: 'mid', width: WIDE, bgs: ['dark'], gray: true });
SHOTS.push({ id: 'sc191-r2-roster-grey', treat: 'roster', state: 'mid', width: WIDE, bgs: ['dark'], gray: true });

const browser = await chromium.launch();
const failures = [];
for (const shot of SHOTS) {
	for (const bg of shot.bgs) {
		const page = await browser.newPage({
			viewport: { width: Math.max(shot.width + 60, 380), height: 900 },
			deviceScaleFactor: 2,
		});
		const qs = new URLSearchParams({ treat: shot.treat, state: shot.state, bg, width: String(shot.width) });
		if (shot.menu) qs.set('menu', 'on');
		if (shot.sheet) qs.set('sheet', shot.sheet);
		if (shot.gray) qs.set('gray', 'on');
		await page.goto(`${page_url}?${qs.toString()}`, { waitUntil: 'load' });
		await page.waitForFunction(() => window.__sc191r2Done !== undefined, null, { timeout: 10000 });
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
console.log(`sc191 round-2 shots written to ${outDir}`);
