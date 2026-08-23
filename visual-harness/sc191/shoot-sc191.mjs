#!/usr/bin/env node
// SC-191 design-round camera. Screenshots visual-harness/sc191/mock.html — the
// candidate page — and writes NOWHERE NEAR visual-harness/shots/, so the freeze
// baseline, the print-twin parity assertion and the chrome-placement assertion are all
// structurally untouchable by this script.
//
// Usage (from the repo root, inside devbox):
//   node visual-harness/sc191/shoot-sc191.mjs <outDir>
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const page_url = 'file://' + path.join(here, 'mock.html');
const outDir = process.argv[2];
if (!outDir) {
	console.error('usage: node visual-harness/sc191/shoot-sc191.mjs <outDir>');
	process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

// One row per capture: <id>--<bg>.png. Narrow captures pin #mount to a real Obsidian
// sidebar-leaf width (300px), the same number NARROW_SHOTS uses.
const SHOTS = [
	{ id: 'sc191-a-muster-rail', cand: 'a', width: 820 },
	{ id: 'sc191-b-twin-channel', cand: 'b', width: 820 },
	{ id: 'sc191-c-muster-board', cand: 'c', width: 820 },
	{ id: 'sc191-a-muster-rail-narrow', cand: 'a', width: 300 },
	{ id: 'sc191-b-twin-channel-narrow', cand: 'b', width: 300 },
	{ id: 'sc191-c-muster-board-narrow', cand: 'c', width: 300 },
];

const browser = await chromium.launch();
const failures = [];
for (const shot of SHOTS) {
	for (const bg of ['dark', 'light']) {
		const page = await browser.newPage({
			viewport: { width: Math.max(shot.width + 60, 380), height: 900 },
			deviceScaleFactor: 2,
		});
		const url = `${page_url}?cand=${shot.cand}&bg=${bg}&width=${shot.width}`;
		await page.goto(url, { waitUntil: 'load' });
		await page.waitForFunction(() => window.__sc191Done !== undefined, null, { timeout: 10000 });
		const mount = page.locator('#mount');
		const out = path.join(outDir, `${shot.id}--${bg}.png`);
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
console.log(`sc191 candidate shots written to ${outDir}`);
